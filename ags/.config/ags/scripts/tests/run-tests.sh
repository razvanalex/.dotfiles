#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

echo "[INFO] Running wallpaper engine tests"
bash scripts/tests/test-wallpaper-engine.sh

echo "[PASS] All tests passed"
