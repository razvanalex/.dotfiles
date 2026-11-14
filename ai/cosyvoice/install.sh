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

# Apply local patches in filename order (0001 = streaming desync + SIGABRT,
# 0002 = runaway-stream termination + stuck concurrency slot). See README.md
# for the pinned base commit: these patches assume that tree, not upstream tip.
for PATCH_FILE in "$SCRIPT_DIR"/patches/*.patch; do
    [ -e "$PATCH_FILE" ] || continue
    if git apply --check "$PATCH_FILE" 2>/dev/null; then
        echo "[+] Applying $(basename "$PATCH_FILE")..."
        git apply "$PATCH_FILE"
    else
        echo "[*] $(basename "$PATCH_FILE") already applied or context differs - skipping."
    fi
done

echo "[+] Building cosyvoice.cpp with CUDA..."
cmake -B build -DGGML_CUDA=ON
# only the server target: sibling tool targets rot against the vendored deps
# (tools/quantize wants GGML_FTYPE_MOSTLY_Q2_0) and abort the build after the
# library has already linked.
cmake --build build -j"$(nproc)" --target cosyvoice-server"

echo "[+] CosyVoice3 binary ready at: $REPO_DIR/build/bin/cosyvoice-server"
