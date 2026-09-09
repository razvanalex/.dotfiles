#!/usr/bin/env python3
"""aiusage daemon — polls AI subscription usage, emits JSONL to stdout.

One JSON object per line:
  {"type":"providers","providers":[...]}   full snapshot after each refresh
  {"type":"status","refreshing":true,...}  lifecycle info

Also writes the snapshot to the state dir (usage.json) so other consumers
(Hermes cron digest, debugging) can read it without the shell running.

Providers are the per-directory scripts in providers/<name>/ (query.py|sh
-> parse.py), the ai-status layout. Each provider runs to completion; a
lock prevents two refresh rounds from overlapping (the antigravity PTY
scraper especially — it spawns a real `agy` session).
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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROVIDERS_DIR = os.path.join(SCRIPT_DIR, "providers")

DEFAULT_INTERVAL = 300          # 5 min between refresh rounds
PROVIDER_TIMEOUT = 25           # per-provider subprocess timeout (s)
STAGGER = 1.5                   # seconds between provider launches

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
                             timeout=PROVIDER_TIMEOUT)
        raw = (res.stdout or "").strip()
        if not raw:
            return {"id": name, "error": "empty output"}
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=DEFAULT_INTERVAL)
    ap.add_argument("--providers", default=",".join(_all_providers))
    ap.add_argument("--once", action="store_true", help="one round, then exit")
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

    first = True
    while True:
        if not _refresh_lock.acquire(blocking=False):
            log("skipping round — previous still running")
            time.sleep(args.interval)
            continue
        try:
            snap = refresh_round(enabled, args.state_file, args.cache_file)
            print(json.dumps({"type": "providers", **snap}), flush=True)
        finally:
            _refresh_lock.release()
        if first:
            first = False
            # short first re-check after the antigravity PTY warmup miss
            time.sleep(60)
            continue
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
