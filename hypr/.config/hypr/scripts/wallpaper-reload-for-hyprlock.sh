#!/usr/bin/env bash

XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
HYPRLOCK_WALLPAPER_DIR="$HOME/.config/hypr/wallpaper_effects"
HYPRLOCK_WALLPAPER_FILE="$HYPRLOCK_WALLPAPER_DIR/.wallpaper_current"

mkdir -p "$HYPRLOCK_WALLPAPER_DIR"

echo "[$(date +%T)] Querying AGS..." >&2
WALLPAPER_PATH=$(ags request wallpaper get-current 2>/dev/null)
echo "[$(date +%T)] AGS returned: $WALLPAPER_PATH" >&2

if [ -z "$WALLPAPER_PATH" ] || ! test -f "${WALLPAPER_PATH}"; then
    echo "screenshot"
    exit 0
fi

echo "[$(date +%T)] PNG detected. Symlinking..." >&2
ln -sf "$WALLPAPER_PATH" "$HYPRLOCK_WALLPAPER_FILE"
echo "$HYPRLOCK_WALLPAPER_FILE"
