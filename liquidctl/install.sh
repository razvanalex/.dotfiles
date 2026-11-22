#!/bin/bash
# liquidctl 1.15.0 - Corsair Commander Core / Core XT / ST driver fix
#
# Upstream (1.15.0-2build1) labels these devices "(broken)": set_fixed_speed()
# writes the hardware-mode register, which the Commander family ignores, so duty
# changes never reach the fans. Patches apply in filename order:
#
#   0001 - switch all endpoint commands to handle 0xFC
#        - rewrite set_fixed_speed() to use software mode ((0x18,) with (0x07,0x00))
#        - harden _send_command() with a retry loop instead of assert() on stray reports
#        - stop sleeping the device after every op (SLEEP only after curve writes)
#        - drop "(broken)" from the three Commander match names
#   0002 - re-send a command when the device misses a response window (a transport
#          Timeout escaped the 0001 retry loop, which only covers stray reports)
#
# The package is pinned with apt-mark hold afterwards: an apt upgrade of liquidctl
# would silently revert this driver.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_DIR="$SCRIPT_DIR/patches"
DRIVER_DIR="/usr/lib/python3/dist-packages/liquidctl/driver"

if [ ! -f "$DRIVER_DIR/commander_core.py" ]; then
    echo "[!] liquidctl driver not found at $DRIVER_DIR - install liquidctl first"
    exit 1
fi

shopt -s nullglob
PATCHES=("$PATCH_DIR"/[0-9]*.patch)
if [ ${#PATCHES[@]} -eq 0 ]; then
    echo "[!] no patches found in $PATCH_DIR"
    exit 1
fi

# Apply in filename order. patch's exit code is not proof of "already applied"
# here: 0002 rewrites code inside 0001's context, so once both are in, every
# reverse dry-run fails. Skip whatever does not apply forward and verify the
# resulting file against markers instead.
for P in "${PATCHES[@]}"; do
    NAME="$(basename "$P")"
    if patch -d "$DRIVER_DIR" -p1 -N -s --dry-run < "$P" >/dev/null 2>&1; then
        echo "[+] Applying $NAME"
        sudo patch -d "$DRIVER_DIR" -p1 < "$P" >/dev/null
    else
        echo "[=] $NAME already applied, or upstream changed - skipping"
    fi
done

# End-state verification: the only trustworthy check with overlapping patches.
DRIVER="$DRIVER_DIR/commander_core.py"
FAIL=0
grep -q "_HANDLE_ID = 0xFC" "$DRIVER" || { echo "[!] 0001 missing: software-mode handle not found"; FAIL=1; }
grep -q "transport_retries"  "$DRIVER" || { echo "[!] 0002 missing: transport retry not found"; FAIL=1; }
[ "$FAIL" -eq 0 ] || exit 1
echo "[+] driver verified: software-mode speed writes + transport retry present"

# Pin the package so apt cannot revert the driver
sudo apt-mark hold liquidctl >/dev/null
echo "[+] liquidctl held at $(dpkg-query -W -f '${Version}' liquidctl)"

# Drop stale bytecode, then restart the daemon that owns the HID device
sudo find "$DRIVER_DIR" -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
sudo systemctl restart coolercontrol-liqctld.service
echo "[+] coolercontrol-liqctld restarted"
