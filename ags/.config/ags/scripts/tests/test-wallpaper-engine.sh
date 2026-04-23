#!/usr/bin/env bash
set -euo pipefail

req() {
  ags request wallpaper engine "$@"
}

json_get() {
  local json="$1"
  local key="$2"
  python3 - "$json" "$key" <<'PY'
import json
import sys
payload = json.loads(sys.argv[1])
key = sys.argv[2]
value = payload.get(key)
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("")
else:
    print(value)
PY
}

assert_eq() {
  local got="$1"
  local expected="$2"
  local msg="$3"
  if [[ "$got" != "$expected" ]]; then
    echo "[FAIL] $msg (expected '$expected', got '$got')"
    exit 1
  fi
  echo "[OK] $msg"
}

echo "[INFO] Reading initial engine state"
initial="$(req get)"
initial_mode="$(json_get "$initial" mode)"
initial_interval="$(json_get "$initial" intervalSeconds)"
initial_running="$(json_get "$initial" isRunning)"

restore_state() {
  req auto stop >/dev/null || true
  req set interval "$initial_interval" >/dev/null || true
  req set mode "$initial_mode" >/dev/null || true
  if [[ "$initial_running" == "true" ]]; then
    req auto start "$initial_interval" >/dev/null || true
  fi
}

trap restore_state EXIT

echo "[INFO] Running wallpaper engine IPC checks"

set_interval="$(req set interval 900)"
assert_eq "$(json_get "$set_interval" intervalSeconds)" "900" "set interval updates intervalSeconds"

set_mode="$(req set mode automatic)"
assert_eq "$(json_get "$set_mode" mode)" "automatic" "set mode updates mode"

status="$(req auto status)"
assert_eq "$(json_get "$status" mode)" "automatic" "auto status returns current mode"

stopped="$(req auto stop)"
assert_eq "$(json_get "$stopped" mode)" "manual" "auto stop switches mode to manual"
assert_eq "$(json_get "$stopped" isRunning)" "false" "auto stop marks isRunning=false"

echo "[PASS] Wallpaper engine IPC tests passed"
