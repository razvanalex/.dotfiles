#!/bin/bash

OPACITY=0.9
CFG_FILE="$HOME/.cache/ags/apps/vscode.txt"

if [ -f "$CFG_FILE" ]; then
    rm -fr "$CFG_FILE"

    hyprctl dispatch setprop activewindow:* opacity 1.0
else
    echo "$OPACITY" > $HOME/.cache/ags/apps/vscode.txt

    hyprctl dispatch setprop activewindow:* opacity $OPACITY $OPACITY $OPACITY
fi
