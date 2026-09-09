#!/usr/bin/env python3
"""OpenRouter remaining credits via the official API.

Auth: OPENROUTER_API_KEY from the Hermes env file (~/.hermes/.env).
Outputs {"total_credits": X, "total_usage": Y} for parse.py.
"""
import json
import os
import urllib.request

ENV_FILE = os.path.expanduser("~/.hermes/.env")
API_URL = "https://openrouter.ai/api/v1/credits"


def read_key():
    if not os.path.exists(ENV_FILE):
        return ""
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main():
    key = read_key()
    if not key:
        print("{}")
        return
    req = urllib.request.Request(API_URL)
    req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
        print(json.dumps(payload.get("data") or {}))
    except OSError as e:
        print(json.dumps({"_error": str(e)}))


if __name__ == "__main__":
    main()
