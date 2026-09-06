#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"

echo "=== [Desktop STT Dictation Setup] ==="
mkdir -p "$BIN_DIR"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/tts-read"

ln -sf "$SCRIPT_DIR/stt_dictate.sh" "$BIN_DIR/stt-dictate"

echo "[+] Linked stt-dictate to $BIN_DIR/stt-dictate"
echo "[+] STT setup complete."
