#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="${AI_DIR:-$HOME/Workspace/ai}"
REPO_DIR="$AI_DIR/parakeet-python"

echo "=== [Parakeet STT Setup] ==="
mkdir -p "$AI_DIR"

if [ ! -d "$REPO_DIR" ]; then
    echo "[+] Cloning parakeet-python..."
    git clone https://github.com/mil-ad/parakeet-tdt-0.6b-v3-fastapi-openai.git "$REPO_DIR"
fi

cd "$REPO_DIR"

PATCH_FILE="$SCRIPT_DIR/patches/0001-optimize-streaming-session-transcription.patch"
if [ -f "$PATCH_FILE" ]; then
    if git apply --check "$PATCH_FILE" 2>/dev/null; then
        echo "[+] Applying streaming optimization patch..."
        git apply "$PATCH_FILE"
    else
        echo "[*] Patch already applied or modified."
    fi
fi

if command -v uv >/dev/null 2>&1; then
    echo "[+] Setting up venv via uv..."
    uv venv
    uv pip install -r requirements.txt
else
    echo "[!] uv not found, falling back to python3 -m venv..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

echo "[+] Parakeet STT ready at: $REPO_DIR"
