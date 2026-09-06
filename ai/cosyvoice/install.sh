#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="${AI_DIR:-$HOME/Workspace/ai}"
REPO_DIR="$AI_DIR/cosyvoice.cpp"

echo "=== [CosyVoice3 Setup] ==="
mkdir -p "$AI_DIR"

if [ ! -d "$REPO_DIR" ]; then
    echo "[+] Cloning cosyvoice.cpp..."
    git clone https://github.com/Lourdle/cosyvoice.cpp.git "$REPO_DIR"
fi

cd "$REPO_DIR"

# Apply streaming stability & SIGABRT patch if not already applied
PATCH_FILE="$SCRIPT_DIR/patches/0001-fix-streaming-audio-desync-and-sigabrt.patch"
if [ -f "$PATCH_FILE" ]; then
    if git apply --check "$PATCH_FILE" 2>/dev/null; then
        echo "[+] Applying streaming & SIGABRT patch..."
        git apply "$PATCH_FILE"
    else
        echo "[*] Patch already applied or modified."
    fi
fi

echo "[+] Building cosyvoice.cpp with CUDA..."
cmake -B build -DGGML_CUDA=ON
cmake --build build -j"$(nproc)"

echo "[+] CosyVoice3 binary ready at: $REPO_DIR/build/bin/cosyvoice-server"
