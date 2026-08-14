#!/bin/bash

OPACITY=0.9
CFG_FILE="$HOME/.cache/ags/apps/vscode.txt"

if [ -f "$CFG_FILE" ]; then
    rm -f "$CFG_FILE"

    hyprctl dispatch 'hl.dsp.window.set_prop({ prop = "opacity", value = "1.0", window = "activewindow" })'
else
    echo "$OPACITY" > "$HOME/.cache/ags/apps/vscode.txt"

    hyprctl dispatch "hl.dsp.window.set_prop({ prop = \"opacity\", value = \"$OPACITY\", window = \"activewindow\" })"
fi
