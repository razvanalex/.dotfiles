#!/bin/bash
# Streaming teardown: re-enable the panel, then drop the headless output. Removing
# the last output leaves Hyprland on its synthetic FALLBACK monitor, so the headless
# is kept when the panel does not come back (KVM switched away, inactive DRM session).

# shellcheck disable=SC2012  # only Hyprland instance dirs live here
HYPRLAND_INSTANCE_SIGNATURE=$(ls -t "$XDG_RUNTIME_DIR/hypr/" | head -n 1)
export HYPRLAND_INSTANCE_SIGNATURE

output_exists() { hyprctl -j monitors | jq -e --arg n "$1" 'any(.[]; .name == $n)' >/dev/null 2>&1; }
await_added() { for _ in {1..10}; do output_exists "$1" && return 0; sleep 0.1; done; return 1; }

# Re-enable the panel first: a disabled output is missing from `hyprctl -j monitors`,
# so the guard below cannot tell "disabled by us" from "KVM switched away".
hyprctl eval 'hl.monitor({ output = [[HDMI-A-1]], disabled = false })' >/dev/null

if ! await_added HDMI-A-1; then
  echo "warning: HDMI-A-1 did not come back (KVM/panel switched away or an inactive" >&2
  echo "         DRM session). Keeping sunshine_mon so the session keeps an output." >&2
  exit 1
fi

hyprctl output remove sunshine_mon >/dev/null 2>&1

exit 0
