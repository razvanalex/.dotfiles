#!/usr/bin/env python3
"""aiusage — polls AI subscription usage and serves it over a local endpoint.

One process, two roles:

  1. poll loop (always): runs providers/<name>/{query,parse} on an interval,
     writes the snapshot to the state/cache files, publishes it in memory.
  2. REST (opt-in, --serve), read-only, default http://127.0.0.1:8787:
       GET  /health      liveness, snapshot age, per-provider errors
       GET  /usage.json  the snapshot (same object as the state file)
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
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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
            self._json(200, {
                "service": "aiusage",
                "routes": ["/health", "/usage.json", "/stream", "POST /refresh"],
            })
        elif path == "/health":
            self._json(200, self._status())
        elif path in ("/usage.json", "/usage"):
            snap, _ = self.hub.current()
            self._json(200, snap or {"updated_at": None, "providers": [],
                                     "detail": "no round has completed yet"})
        elif path == "/stream":
            self._stream()
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802 — BaseHTTPRequestHandler API
        path = urlsplit(self.path).path.rstrip("/") or "/"
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
