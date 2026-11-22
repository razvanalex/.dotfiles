#!/bin/bash
# Streaming prep, LG-native headless: panel mode (2560x1440), scale 1.
# Rule first, then re-create the output (rules apply on connect); the panel is darkened, not disabled.

# shellcheck disable=SC2012  # only Hyprland instance dirs live here
HYPRLAND_INSTANCE_SIGNATURE=$(ls -t "$XDG_RUNTIME_DIR/hypr/" | head -n 1)
export HYPRLAND_INSTANCE_SIGNATURE

output_exists() { hyprctl -j monitors | jq -e --arg n "$1" 'any(.[]; .name == $n)' >/dev/null 2>&1; }
# The output appears/disappears asynchronously, so poll for up to ~1s.
await_added() { for _ in {1..10}; do output_exists "$1" && return 0; sleep 0.1; done; return 1; }
await_gone()  { for _ in {1..10}; do output_exists "$1" || return 0; sleep 0.1; done; return 1; }

hyprctl eval "hl.monitor({ output = [[sunshine_mon]], mode = [[2560x1440@60]], position = [[auto]], scale = 1 })"

hyprctl output remove sunshine_mon >/dev/null 2>&1
if ! await_gone sunshine_mon; then
  echo "error: sunshine_mon is still present after remove, not touching the output" >&2
  exit 1
fi
hyprctl output create headless sunshine_mon

if ! await_added sunshine_mon; then
  echo "error: sunshine_mon did not come up" >&2
  exit 1
fi

# Panel off. A disabled output is omitted from `hyprctl -j monitors`, and re-enabling
# is MonitorOn.sh's first job for exactly that reason.
hyprctl eval 'hl.monitor({ output = [[HDMI-A-1]], disabled = true })' >/dev/null

exit 0
