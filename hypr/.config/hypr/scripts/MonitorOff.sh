#!/bin/bash
# Streaming prep: a headless output sized to the client, and the panel darkened
# with DPMS. The output stays enabled — an eval-ed "disabled" rule is what strands
# the session on FALLBACK. hl.monitor() rules apply on output connect only, so
# register the rule and then re-create the output.

# shellcheck disable=SC2012  # only Hyprland instance dirs live here
HYPRLAND_INSTANCE_SIGNATURE=$(ls -t "$XDG_RUNTIME_DIR/hypr/" | head -n 1)
export HYPRLAND_INSTANCE_SIGNATURE

output_exists() { hyprctl -j monitors | jq -e --arg n "$1" 'any(.[]; .name == $n)' >/dev/null 2>&1; }
# The output appears/disappears asynchronously, so poll for up to ~1s.
await_added() { for _ in {1..10}; do output_exists "$1" && return 0; sleep 0.1; done; return 1; }
await_gone()  { for _ in {1..10}; do output_exists "$1" || return 0; sleep 0.1; done; return 1; }

WIDTH="${SUNSHINE_CLIENT_WIDTH:-2560}"
HEIGHT="${SUNSHINE_CLIENT_HEIGHT:-1440}"
FPS="${SUNSHINE_CLIENT_FPS:-60}"
SCALE="${SUNSHINE_CLIENT_SCALE:-1.5}"

hyprctl eval "hl.monitor({ output = [[sunshine_mon]], mode = [[${WIDTH}x${HEIGHT}@${FPS}]], position = [[auto]], scale = ${SCALE} })"

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
