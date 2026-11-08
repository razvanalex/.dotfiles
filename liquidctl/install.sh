#!/bin/bash
# liquidctl 1.15.0 - Corsair Commander Core / Core XT / ST driver fix
#
# Upstream (1.15.0-2build1) labels these devices "(broken)": set_fixed_speed()
# writes the hardware-mode register, which the Commander family ignores, so duty
# changes never reach the fans. This patch:
#   - switches all endpoint commands to handle 0xFC
#   - rewrites set_fixed_speed() to use software mode ((0x18,) with (0x07,0x00))
#   - hardens _send_command() with a retry loop instead of assert() on stray reports
#   - stops sleeping the device after every op (SLEEP only after curve writes)
#   - drops "(broken)" from the three Commander match names
#
# The package is pinned with apt-mark hold afterwards: an apt upgrade of liquidctl
# would silently revert this driver.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/patches/0001-commander-st-software-speed.patch"
DRIVER_DIR="/usr/lib/python3/dist-packages/liquidctl/driver"

if [ ! -f "$DRIVER_DIR/commander_core.py" ]; then
    echo "[!] liquidctl driver not found at $DRIVER_DIR - install liquidctl first"
    exit 1
fi

if patch -d "$DRIVER_DIR" -p1 -N -s --dry-run < "$PATCH_FILE"; then
    echo "[+] Applying Commander ST patch"
    sudo patch -d "$DRIVER_DIR" -p1 < "$PATCH_FILE"
else
    echo "[*] Patch already applied, or upstream changed - skipping"
fi

# Pin the package so apt cannot revert the driver
sudo apt-mark hold liquidctl >/dev/null
echo "[+] liquidctl held at $(dpkg-query -W -f '${Version}' liquidctl)"

# Drop stale bytecode, then restart the daemon that owns the HID device
sudo find "$DRIVER_DIR" -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
sudo systemctl restart coolercontrol-liqctld.service
echo "[+] coolercontrol-liqctld restarted"
