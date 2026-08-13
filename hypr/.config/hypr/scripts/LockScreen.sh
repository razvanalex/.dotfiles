#!/bin/bash

CONFIG_FILE="$HOME/.config/illogical-impulse/config.json"
USE_HYPRLOCK="false"

if [ -f "$CONFIG_FILE" ]; then
    USE_HYPRLOCK=$(jq -r '.lock.useHyprlock // false' "$CONFIG_FILE" 2>/dev/null)
fi

if [ "$USE_HYPRLOCK" = "true" ]; then
    pidof hyprlock || hyprlock -q
else
    qs ipc call lock activate
fi

