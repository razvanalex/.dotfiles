#!/usr/bin/env python3
"""aiusage — polls AI subscription usage and serves it over a local endpoint.

One process, two roles:

  1. poll loop (always): runs providers/<name>/{query,parse} on an interval,
     writes the snapshot to the state/cache files, publishes it in memory.
  2. REST (opt-in, --serve), read-only, default http://127.0.0.1:8787:
       GET  /health      liveness, snapshot age, per-provider errors
       GET  /usage.json  the snapshot (same object as the state file)
       GET  /usage-limits  usage-limit windows only, in T3's UsageLimitsReport
                         shape (open-slug drivers, no balances, no identity)
       GET  /stream      NDJSON: snapshot on connect, then one line per change,
                         heartbeat every 25 s
       POST /refresh     202, asks the poll loop for one extra round (coalesced,
                         with a floor) — the only route that costs a scrape

  Reads never trigger a provider run: the agy PTY scrape stays on the interval,
  so a stream client (the quickshell UI) costs nothing extra.

Providers are the per-directory scripts in providers/<name>/ (query.py|sh
-> parse.py), the ai-status layout. Each provider runs to completion; a
lock prevents two refresh rounds from overlapping (the antigravity PTY
scraper especially — it spawns a real `agy` session).

stdout keeps the JSONL contract for journald / debugging:
  {"type":"status","msg":…}
  {"type":"providers","updated_at":…,"providers":[…]}
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

# Ensure user binary paths are present in PATH for systemd services
USER_BIN_DIRS = [
    os.path.expanduser("~/.local/bin"),
    os.path.expanduser("~/.gemini/antigravity-cli/bin"),
    os.path.expanduser("~/.cargo/bin"),
    os.path.expanduser("~/.opencode/bin"),
]
current_paths = os.environ.get("PATH", "").split(os.pathsep)
paths_to_add = [p for p in USER_BIN_DIRS if p not in current_paths and os.path.isdir(p)]
if paths_to_add:
    os.environ["PATH"] = os.pathsep.join(paths_to_add) + os.pathsep + os.environ.get("PATH", "")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROVIDERS_DIR = os.path.join(SCRIPT_DIR, "providers")

DEFAULT_INTERVAL = 300          # 5 min between refresh rounds
PROVIDER_TIMEOUT = 30           # per-provider subprocess timeout (s)
STAGGER = 1.5                   # seconds between provider launches
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
REFRESH_FLOOR = 30              # min age of a round before POST /refresh starts another
HEARTBEAT = 25                  # seconds between keepalive lines on /stream
LOOPBACK = {"127.0.0.1", "::1", "localhost", ""}
# Optional CLIProxyAPI-shaped face for T3's Limits panel (off by default).
T3_HUB = os.environ.get("AIUSAGE_T3_HUB") == "1"

_all_providers = ["antigravity", "opencode", "copilot", "openrouter"]
_refresh_lock = threading.Lock()


def log(msg):
    print(json.dumps({"type": "status", "msg": msg}), flush=True)


def run_provider(name):
    pdir = os.path.join(PROVIDERS_DIR, name)
    query = next((os.path.join(pdir, f) for f in ("query.py", "query.sh")
                  if os.path.exists(os.path.join(pdir, f))), None)
    parse_path = os.path.join(pdir, "parse.py")
    if not query:
        return None
    try:
        res = subprocess.run([query], capture_output=True, text=True,
                             timeout=PROVIDER_TIMEOUT, env=os.environ.copy())
        raw = (res.stdout or "").strip()
        if not raw:
            err = (res.stderr or "").strip()
            return {"id": name, "error": err or f"empty output (code {res.returncode})"}
        if os.path.exists(parse_path):
            spec = importlib.util.spec_from_file_location(f"parse_{name}", parse_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            parsed = mod.parse(raw)
        else:
            parsed = json.loads(raw)
        if isinstance(parsed, list):
            parsed = {"list": parsed}
        parsed["id"] = name
        parsed.setdefault("error", None)
        return parsed
    except subprocess.TimeoutExpired:
        return {"id": name, "error": "timeout"}
    except Exception as e:  # noqa: BLE001 — never kill the daemon over one provider
        return {"id": name, "error": f"{type(e).__name__}: {e}"}


def refresh_round(enabled, state_path, cache_path):
    """Run all providers (staggered, parallel), return ordered results."""
    results = {}
    with ThreadPoolExecutor(max_workers=len(enabled) or 1) as pool:
        futures = {}
        for i, name in enumerate(enabled):
            futures[pool.submit(run_provider, name)] = name
            time.sleep(STAGGER)
        for fut in futures:
            pass
        for fut in futures:
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:  # defensive; run_provider already catches
                results[name] = {"id": name, "error": str(e)}

    providers = [results.get(n) or {"id": n, "error": "no result"} for n in enabled]
    snapshot = {"updated_at": int(time.time()), "providers": providers}

    # persist for external consumers (never fatal)
    for path in (state_path, cache_path):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(snapshot, f, indent=1)
            os.replace(tmp, path)
        except OSError:
            pass
    return snapshot


# --- T3-shaped usage-limit projection -------------------------------------- #
# `GET /usage-limits` answers with T3's own UsageLimitsReport shape
# (packages/contracts/src/providerUsageLimits.ts) so the data is readable under a
# real contract without pretending to be a CLIProxyAPI hub. Only usage limits are
# reported: a provider whose only figure is a balance (OpenRouter credits) is not
# an account here, and no email/plan is invented for the ones that are. Windows
# carry a stable `id`, a `kind` from the metric's own window type, and `resetsAt`
# resolved to an absolute timestamp (`reset_in_seconds` is relative to the
# snapshot, not to now). `windowDurationMins` is omitted rather than guessed.
WINDOW_KIND = {"rolling": "session", "session": "session",
               "weekly": "weekly", "monthly": "monthly"}


def _iso(epoch):
    if not epoch:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "_", str(text or "").lower()).strip("_")


def _window(metric, updated_at):
    """One quota window, or None when the metric is not a usage limit."""
    pct = metric.get("percentage")
    if isinstance(pct, bool) or not isinstance(pct, (int, float)):
        return None                       # no quota figure (e.g. a balance)
    reset_at = metric.get("resets_at") or metric.get("reset_at")
    reset_in = metric.get("reset_in_seconds")
    if isinstance(reset_in, (int, float)) and updated_at:
        reset_at = _iso(updated_at + reset_in)
    kind = WINDOW_KIND.get(str(metric.get("type") or "").lower())
    if kind is None:
        unlimited = "unlimited" in str(metric.get("detail") or "").lower()
        if reset_at is None or unlimited:
            return None                   # unbounded entitlement, or nothing to reset
        kind = "other"                    # a limit we cannot bucket honestly
    label = str(metric.get("name") or metric.get("type") or kind)
    label = label[:1].upper() + label[1:] if label else kind
    # ids stay lowercase (stable across label tweaks); only the display label is cased
    window = {"id": _slug(label) or kind, "kind": kind, "label": label,
              "usedPercent": max(0.0, min(100.0, float(pct)))}
    if reset_at:
        window["resetsAt"] = str(reset_at)
    return window


def usage_limits_report(snapshot):
    """Project the snapshot onto T3's UsageLimitsReport — usage limits only."""
    updated_at = (snapshot or {}).get("updated_at")
    checked_at = _iso(updated_at) or _iso(int(time.time()))
    accounts, notices = [], []
    for prov in (snapshot or {}).get("providers") or []:
        pid = prov.get("id") or "?"
        if prov.get("list") is not None:
            groups = [(g.get("provider") or pid, g.get("metrics") or [])
                      for g in prov.get("list") or []]
        else:
            groups = [(prov.get("provider") or pid, prov.get("metrics") or [])]
        for label, metrics in groups:
            windows = [w for w in (_window(m, updated_at) for m in metrics) if w]
            if not windows and not prov.get("error"):
                notices.append(f"{label}: no usage-limit window reported (a balance is "
                               f"not a limit) — omitted")
                continue
            limits = {"checkedAt": checked_at, "windows": windows}
            if prov.get("error"):
                limits["unavailable"] = {"reason": "probeFailed",
                                         "message": str(prov["error"])}
            accounts.append({"id": f"{_slug(pid)}:{_slug(label)}", "driver": _slug(pid),
                             "label": label, "limits": limits})
    return {"createdAt": _iso(int(time.time())), "accounts": accounts, "notices": notices}


# --- optional T3 hub face (AIUSAGE_T3_HUB=1) ------------------------------- #
# T3 can only read usage-limit sources whose `kind` is the literal "cliproxy" —
# a hub that holds pooled OAuth tokens and replays provider APIs for T3 to parse.
# These three routes answer that protocol from the snapshot we already have: no
# token is stored, no provider is called, the Authorization header is ignored.
#
# Only the Antigravity model groups are exposed, as codex accounts, because the
# codex envelope is the least dishonest fit: it is two windows per account
# (agy has exactly a rolling/weekly pair per group), `plan_type` is deliberately
# omitted so T3 shows no plan label instead of a wrong one, and with no plan_type
# T3's own fallback buckets primary as Session (5h) and secondary as Weekly —
# which is what those two windows are. `email`, `id_token` and any duration are
# omitted, never invented. OpenCode's rolling/weekly/monthly triple does not fit
# a two-window envelope, so it is not exposed at all.
def _reset_epoch(metric, updated_at):
    """Absolute reset instant as epoch seconds (codex wants `reset_at` numeric)."""
    secs = metric.get("reset_in_seconds")
    if isinstance(secs, (int, float)) and not isinstance(secs, bool) and updated_at:
        return int(updated_at + secs)
    raw = metric.get("resets_at") or metric.get("reset_at")
    if not raw:
        return None
    try:
        stamp = datetime.strptime(str(raw)[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    return int(stamp.replace(tzinfo=timezone.utc).timestamp())


def t3_accounts(snapshot):
    """{auth_index: (label, metrics)} — the agy model groups, as fake codex accounts."""
    accounts = {}
    for prov in (snapshot or {}).get("providers") or []:
        if prov.get("id") != "antigravity" or prov.get("list") is None:
            continue
        for group in prov.get("list") or []:
            label = group.get("provider") or "Antigravity"
            accounts["agy-" + (_slug(label) or "group")] = (label, group.get("metrics") or [])
    return accounts


def t3_codex_usage(metrics, updated_at):
    """One codex `rate_limit` body dcoded from an agy group (no plan_type, no durations)."""
    picked = {}
    for metric in metrics or []:
        kind = str(metric.get("type") or "").lower()
        if kind in ("rolling", "session"):
            picked["primary_window"] = metric
        elif kind == "weekly":
            picked["secondary_window"] = metric

    def to_window(metric):
        if not metric:
            return None
        pct = metric.get("percentage")
        if isinstance(pct, bool) or not isinstance(pct, (int, float)):
            return None
        window = {"used_percent": float(pct)}
        epoch = _reset_epoch(metric, updated_at)
        if epoch:
            window["reset_at"] = epoch
        return window

    return {"rate_limit": {"primary_window": to_window(picked.get("primary_window")),
                           "secondary_window": to_window(picked.get("secondary_window"))}}


class Hub:
    """Latest snapshot + fan-out to /stream subscribers."""

    def __init__(self):
        self._cond = threading.Condition()
        self._snapshot = None
        self._version = 0
        self.refreshing = False
        self.last_round_started = 0.0
        self.last_round_finished = 0.0
        self.interval = DEFAULT_INTERVAL

    def publish(self, snapshot):
        with self._cond:
            self._snapshot = snapshot
            self._version += 1
            self._cond.notify_all()

    def current(self):
        with self._cond:
            return self._snapshot, self._version

    def wait_for_change(self, version, timeout):
        """Block until the snapshot version moves past `version` (or timeout)."""
        with self._cond:
            if self._version == version:
                self._cond.wait(timeout)
            return self._snapshot, self._version

    def errors(self):
        snap, _ = self.current()
        if not snap:
            return {}
        return {p.get("id"): p["error"] for p in snap.get("providers", []) if p.get("error")}


class Handler(BaseHTTPRequestHandler):
    hub = None
    refresh_event = None
    server_version = "aiusage/1.0"

    # one journald line per request is noise; opt in with AIUSAGE_HTTP_LOG=1
    def log_message(self, fmt, *args):
        if os.environ.get("AIUSAGE_HTTP_LOG") == "1":
            sys.stderr.write("[aiusage] http %s\n" % (fmt % args))

    def _json(self, code, payload):
        body = json.dumps(payload, indent=1).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _body(self):
        """JSON request body, or {} (T3 posts to api-call; nothing else does)."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            return json.loads(raw) if raw else {}
        except ValueError:
            return {}

    def _status(self):
        snap, _ = self.hub.current()
        updated_at = (snap or {}).get("updated_at")
        return {
            "ok": True,
            "updated_at": updated_at,
            "age_seconds": int(time.time() - updated_at) if updated_at else None,
            "providers": len((snap or {}).get("providers", [])),
            "errors": self.hub.errors(),
            "refreshing": self.hub.refreshing,
            "interval_seconds": self.hub.interval,
            "streams": getattr(self.server, "stream_clients", 0),
        }

    def _line(self, obj):
        """Write one NDJSON line; False when the client went away."""
        try:
            self.wfile.write((json.dumps(obj) + "\n").encode())
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, OSError):
            return False

    def _stream(self):
        # HTTP/1.0 (the handler default) is deliberate: no keep-alive framing to
        # get wrong, the body is delimited by connection close, and `curl -sN`
        # streams it as-is. Only one local client ever connects.
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.server.stream_clients = getattr(self.server, "stream_clients", 0) + 1
        try:
            snap, version = self.hub.current()
            if snap is not None and not self._line({"type": "providers", **snap}):
                return
            last_sent = time.monotonic()
            while True:
                timeout = max(HEARTBEAT - (time.monotonic() - last_sent), 0.1)
                snap, new_version = self.hub.wait_for_change(version, timeout)
                if new_version != version:
                    version = new_version
                    if not self._line({"type": "providers", **(snap or {})}):
                        return
                    last_sent = time.monotonic()
                elif time.monotonic() - last_sent >= HEARTBEAT:
                    if not self._line({"type": "ping",
                                       "ts": int(time.time()),
                                       "updated_at": (snap or {}).get("updated_at")}):
                        return
                    last_sent = time.monotonic()
        finally:
            self.server.stream_clients = max(getattr(self.server, "stream_clients", 1) - 1, 0)

    def do_GET(self):  # noqa: N802 — BaseHTTPRequestHandler API
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path == "/":
            routes = ["/health", "/usage.json", "/usage-limits", "/stream", "POST /refresh"]
            if T3_HUB:
                routes += ["/v0/management/auth-files", "POST /v0/management/api-call",
                           "POST /v0/management/reset-quota"]
            self._json(200, {"service": "aiusage", "routes": routes, "t3_hub": T3_HUB})
        elif path == "/health":
            self._json(200, self._status())
        elif path in ("/usage.json", "/usage"):
            snap, _ = self.hub.current()
            self._json(200, snap or {"updated_at": None, "providers": [],
                                     "detail": "no round has completed yet"})
        elif path in ("/usage-limits", "/usage-limits.json"):
            snap, _ = self.hub.current()
            self._json(200, usage_limits_report(snap))
        elif path == "/v0/management/auth-files" and T3_HUB:
            snap, _ = self.hub.current()
            self._json(200, {"files": [{"id": index, "auth_index": index,
                                        "provider": "codex", "disabled": False}
                                       for index in t3_accounts(snap)]})
        elif path == "/stream":
            self._stream()
        else:
            self._json(404, {"error": "not found"})

    def _management(self, path):
        """Answer T3's CLIProxyAPI management protocol from the snapshot.

        api-call must return {status_code, body} where `body` is a JSON *string*;
        a non-2xx inner status makes T3 treat that account's probe as failed (and
        the reset-credit call, which it tolerates failing).
        """
        snap, _ = self.hub.current()
        if path == "/v0/management/api-call":
            payload = self._body()
            index = str(payload.get("auth_index") or "")
            url = str(payload.get("url") or "")
            if "rate-limit-reset-credits" in url:
                # T3 wraps this in orElseSucceed: "a credits outage must not hide
                # successfully fetched quota windows". We bank none.
                self._json(200, {"status_code": 404, "body": ""})
                return
            entry = t3_accounts(snap).get(index)
            if entry is None or not url.endswith("/usage"):
                self._json(200, {"status_code": 404, "body": ""})
                return
            body = t3_codex_usage(entry[1], (snap or {}).get("updated_at"))
            self._json(200, {"status_code": 200, "body": json.dumps(body)})
            return
        if path == "/v0/management/reset-quota":
            # only reached when redeeming a reset credit, which we never offer
            self._json(200, {"status_code": 501, "body": ""})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802 — BaseHTTPRequestHandler API
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path.startswith("/v0/management/") and T3_HUB:
            self._management(path)
            return
        if path != "/refresh":
            self._json(404, {"error": "not found"})
            return
        status = self._status()
        if self.hub.refreshing:
            self._json(202, {**status, "queued": False, "reason": "a round is already running"})
            return
        age = time.time() - self.hub.last_round_started
        if self.hub.last_round_started and age < REFRESH_FLOOR:
            self._json(202, {**status, "queued": False,
                             "reason": f"last round started {int(age)}s ago "
                                       f"(floor {REFRESH_FLOOR}s)"})
            return
        self.refresh_event.set()
        self._json(202, {**status, "queued": True})


def make_handler(hub, refresh_event):
    class Bound(Handler):
        pass
    Bound.hub = hub
    Bound.refresh_event = refresh_event
    return Bound


def start_server(host, port, hub, refresh_event):
    try:
        server = ThreadingHTTPServer((host, port), make_handler(hub, refresh_event))
    except OSError as e:
        log(f"REST endpoint NOT started on {host}:{port} ({e}) — poll loop continues")
        return None
    server.daemon_threads = True
    server.stream_clients = 0
    threading.Thread(target=server.serve_forever, name="aiusage-http", daemon=True).start()
    log(f"REST endpoint on http://{host}:{port} "
        f"(/health, /usage.json, /stream, POST /refresh)")
    return server


def poll_loop(enabled, state_path, cache_path, interval, hub, refresh_event):
    first = True
    while True:
        if not _refresh_lock.acquire(blocking=False):
            log("skipping round — previous still running")
        else:
            hub.refreshing = True
            hub.last_round_started = time.time()
            try:
                snap = refresh_round(enabled, state_path, cache_path)
                hub.publish(snap)
                print(json.dumps({"type": "providers", **snap}), flush=True)
            finally:
                hub.refreshing = False
                hub.last_round_finished = time.time()
                _refresh_lock.release()
        wake = 60 if first else interval   # short first re-check after the agy PTY warmup miss
        first = False
        refresh_event.wait(timeout=wake)
        refresh_event.clear()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int,
                    default=int(os.environ.get("AIUSAGE_INTERVAL", DEFAULT_INTERVAL)))
    ap.add_argument("--providers",
                    default=os.environ.get("AIUSAGE_PROVIDERS", ",".join(_all_providers)))
    ap.add_argument("--once", action="store_true", help="one round, then exit (no server)")
    ap.add_argument("--serve", action="store_true", help="also serve the REST endpoint")
    ap.add_argument("--host", default=os.environ.get("AIUSAGE_HOST", DEFAULT_HOST))
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("AIUSAGE_PORT", DEFAULT_PORT)))
    ap.add_argument("--state-file",
                    default=os.path.expanduser(
                        "~/.local/state/quickshell/user/aiusage/usage.json"))
    ap.add_argument("--cache-file",
                    default=os.path.expanduser("~/.cache/aiusage/usage.json"))
    args = ap.parse_args()

    enabled = [p.strip() for p in args.providers.split(",") if p.strip()
               and os.path.isdir(os.path.join(PROVIDERS_DIR, p.strip()))]

    log(f"enabled: {','.join(enabled) or 'none'}; interval {args.interval}s")

    if args.once:
        snap = refresh_round(enabled, args.state_file, args.cache_file)
        print(json.dumps({"type": "providers", **snap}), flush=True)
        return

    hub = Hub()
    hub.interval = args.interval
    refresh_event = threading.Event()

    if args.serve:
        host = args.host
        # Read-only data, but a service that silently answers on every interface is
        # exactly the CLIProxyAPI trap we rejected — require an explicit opt-in.
        if host not in LOOPBACK and os.environ.get("AIUSAGE_ALLOW_PUBLIC") != "1":
            log(f"refusing to bind {host} without AIUSAGE_ALLOW_PUBLIC=1; "
                f"falling back to {DEFAULT_HOST}")
            host = DEFAULT_HOST
        start_server(host, args.port, hub, refresh_event)

    poll_loop(enabled, args.state_file, args.cache_file, args.interval, hub, refresh_event)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
