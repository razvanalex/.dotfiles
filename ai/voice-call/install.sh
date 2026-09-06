#!/usr/bin/env bash
set -e

AI_DIR="${AI_DIR:-$HOME/Workspace/ai}"
REPO_DIR="$AI_DIR/voice-call"

echo "=== [Voice Call Agent Setup] ==="
mkdir -p "$AI_DIR"

if [ ! -d "$REPO_DIR" ]; then
    echo "[+] Cloning voice-call repository..."
    git clone git@github.com:razvanalex/voice-call.git "$REPO_DIR" || \
        git clone https://github.com/razvanalex/voice-call.git "$REPO_DIR"
fi

cd "$REPO_DIR"

if command -v uv >/dev/null 2>&1; then
    echo "[+] Installing voice-call package in editable mode via uv..."
    uv venv
    uv pip install -e .
else
    echo "[!] uv not found, falling back to python3 -m venv..."
    python3 -m venv .venv
    .venv/bin/pip install -e .
fi

echo "[+] Voice Call Agent ready at: $REPO_DIR"
