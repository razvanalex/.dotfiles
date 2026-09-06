#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"

echo "=== [Desktop TTS Setup] ==="
mkdir -p "$BIN_DIR"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/tts-read"

ln -sf "$SCRIPT_DIR/tts_read.sh" "$BIN_DIR/tts-read"

echo "[+] Linked tts-read to $BIN_DIR/tts-read"

if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload || true
    systemctl --user enable tts-read.service 2>/dev/null || true
fi

echo "[+] TTS setup complete."
