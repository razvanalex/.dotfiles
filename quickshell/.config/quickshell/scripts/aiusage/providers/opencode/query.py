#!/usr/bin/env python3
"""OpenCode (Go plan) subscription usage via the official API.

Auth: "opencode-go" API key from OpenCode's auth store
(~/.local/share/opencode/auth.json). No dashboard cookie needed —
GET /zen/go/v1/usage returns rolling/weekly/monthly windows directly
(verified live 2026-09-09).

Outputs the raw JSON for parse.py.
"""
import json
import os
import urllib.request

AUTH_FILE = os.path.expanduser("~/.local/share/opencode/auth.json")
API_URL = "https://opencode.ai/zen/go/v1/usage"


def main():
    key = ""
    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE) as f:
                auth = json.load(f)
            key = (auth.get("opencode-go") or {}).get("key") or ""
        except (OSError, ValueError):
            pass

    if not key:
        print("{}")
        return

    req = urllib.request.Request(API_URL)
    req.add_header("Authorization", f"Bearer {key}")
    # Cloudflare (error 1010) blocks the default python-urllib UA
    req.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(resp.read().decode("utf-8", errors="replace"))
    except OSError:
        print("{}")


if __name__ == "__main__":
    main()
