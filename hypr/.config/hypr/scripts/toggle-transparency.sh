#!/bin/bash
# Toggle the focused window between 90% and fully opaque.
# State is per-session, so a fresh login starts opaque.

STATE="${XDG_RUNTIME_DIR:-/tmp}/hypr-window-transparency"

if [ -f "$STATE" ]; then
    rm -f "$STATE"
    value="1.0 override"
else
    : > "$STATE"
    value="0.9 override"
fi

hyprctl eval "hl.dispatch(hl.dsp.window.set_prop({ prop = \"opacity\", value = \"$value\", window = \"activewindow\" }))" >/dev/null
