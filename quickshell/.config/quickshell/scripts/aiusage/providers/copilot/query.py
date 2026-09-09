#!/usr/bin/env python3
"""Copilot usage via api.github.com/copilot_internal/user.

Auth: GitHub Copilot OAuth access token stored by OpenCode
(~/.local/share/opencode/auth.json, key "github-copilot").
Outputs the raw JSON response for parse.py.
"""
import json
import os
import urllib.request

AUTH_FILE = os.path.expanduser("~/.local/share/opencode/auth.json")
API_URL = "https://api.github.com/copilot_internal/user"


def main():
    token = ""
    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE) as f:
                auth = json.load(f)
            token = (auth.get("github-copilot") or {}).get("access") or ""
        except (OSError, ValueError):
            pass

    if not token:
        print("{}")
        return

    req = urllib.request.Request(API_URL)
    req.add_header("Authorization", f"token {token}")
    req.add_header("Accept", "application/json")
    req.add_header("Editor-Version", "vscode/1.96.2")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read().decode("utf-8", errors="replace")
    except OSError:
        data = "{}"
    print(data or "{}")


if __name__ == "__main__":
    main()
