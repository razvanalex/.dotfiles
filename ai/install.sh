#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_target() {
    local target="$1"
    local installer="$SCRIPT_DIR/$target/install.sh"
    if [ -f "$installer" ]; then
        echo ""
        echo ">>> Running $target installer..."
        bash "$installer"
    else
        echo "[-] Installer not found for: $target"
    fi
}

if [ $# -gt 0 ]; then
    for arg in "$@"; do
        run_target "$arg"
    done
else
    echo "=========================================="
    echo "  Provisioning AI Workstation Services    "
    echo "=========================================="
    run_target "tts"
    run_target "stt"
    run_target "parakeet"
    run_target "cosyvoice"
    run_target "voice-call"
    
    if command -v systemctl >/dev/null 2>&1; then
        echo ""
        echo "[+] Reloading systemd user daemon..."
        systemctl --user daemon-reload || true
    fi
    echo ""
    echo "=== All AI services provisioned! ==="
fi
