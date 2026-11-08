#!/usr/bin/env python3
"""OpenCode (Go plan) subscription usage via the official API.

Endpoint: GET https://opencode.ai/zen/go/v1/usage  (Bearer auth only — the same
key sent as x-api-key is rejected 401) returning
{usage:{rolling,weekly,monthly:{status,percent,resetsAt}}}.

Auth gotcha (opencode v2+, 2026-10): credentials moved out of
~/.local/share/opencode/auth.json into the SQLite store and the CLI marks ONE
credential active. The v2 login wrote a NEW "OpenCode Go" credential and left
the pre-v2 "API key" inactive in BOTH stores; auth.json still holds the old
key, and /zen/go/v1/usage answers 401 AuthError for it (while /v1/models still
accepts it, which is why the breakage was silent). Always use the active one.

Resolution order:
  1. `opencode auth export opencode-go` — official CLI, exposes "active"
  2. ~/.local/share/opencode/opencode.db -> credential (active=1)
  3. ~/.local/share/opencode/auth.json — legacy (pre-v2) fallback

Prints the raw JSON for parse.py; on failure exits non-zero with a reason on
stderr so the daemon records a provider error instead of an empty metric list.
"""
import json
import os
import shutil
import sqlite3
import sys
import urllib.error
import urllib.request

API_URL = "https://opencode.ai/zen/go/v1/usage"
INTEGRATION = "opencode-go"
DATA_DIR = os.path.expanduser("~/.local/share/opencode")
AUTH_FILE = os.path.join(DATA_DIR, "auth.json")
DB_FILE = os.path.join(DATA_DIR, "opencode.db")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"


def _binary():
    for cand in (shutil.which("opencode"),
                 os.path.expanduser("~/.opencode/bin/opencode"),
                 os.path.expanduser("~/.local/bin/opencode")):
        if cand and os.path.exists(cand):
            return cand
    return None


def key_from_cli():
    exe = _binary()
    if not exe:
        return None
    import subprocess
    try:
        res = subprocess.run([exe, "auth", "export", INTEGRATION],
                             capture_output=True, text=True, timeout=20)
        creds = json.loads(res.stdout or "[]")
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    mine = [c for c in creds if isinstance(c, dict)
            and c.get("integrationID") in (None, INTEGRATION)]
    active = [c for c in mine if c.get("active")]
    for cred in active + mine:
        key = ((cred.get("value") or {}).get("key") or "").strip()
        if key:
            return key
    return None


def key_from_db():
    if not os.path.exists(DB_FILE):
        return None
    try:
        con = sqlite3.connect(f"file:{DB_FILE}?mode=ro", uri=True, timeout=5)
        try:
            rows = con.execute(
                "SELECT value FROM credential WHERE integration_id = ? "
                "ORDER BY COALESCE(active, 0) DESC, time_updated DESC",
                (INTEGRATION,)).fetchall()
        finally:
            con.close()
    except sqlite3.Error:
        return None
    for (value,) in rows:
        try:
            key = (json.loads(value).get("key") or "").strip()
        except (ValueError, AttributeError):
            continue
        if key:
            return key
    return None


def key_from_legacy():
    try:
        with open(AUTH_FILE) as f:
            auth = json.load(f)
        return ((auth.get(INTEGRATION) or {}).get("key") or "").strip() or None
    except (OSError, ValueError):
        return None


def main():
    key = key_from_cli() or key_from_db() or key_from_legacy()
    if not key:
        sys.stderr.write(f"no {INTEGRATION} credential found "
                         "(opencode auth login)")
        return 1

    req = urllib.request.Request(API_URL)
    req.add_header("Authorization", f"Bearer {key}")
    # Cloudflare (error 1010) blocks the default python-urllib UA
    req.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            sys.stdout.write(resp.read().decode("utf-8", errors="replace"))
        return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        sys.stderr.write(f"HTTP {e.code} {API_URL}: {body}")
        return 1
    except OSError as e:
        sys.stderr.write(f"{type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
