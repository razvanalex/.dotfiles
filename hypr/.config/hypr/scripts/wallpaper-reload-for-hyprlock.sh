#!/usr/bin/env bash

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
HYPRLOCK_WALLPAPER_DIR="$HOME/.config/hypr/wallpaper_effects"
HYPRLOCK_WALLPAPER_FILE="$HYPRLOCK_WALLPAPER_DIR/.wallpaper_current"

mkdir -p "$HYPRLOCK_WALLPAPER_DIR"

# Query wallpaperPath from Quickshell / illogical-impulse config.json (end4 dots standard)
CONFIG_FILE="$XDG_CONFIG_HOME/illogical-impulse/config.json"
WALLPAPER_PATH=""

if [ -f "$CONFIG_FILE" ]; then
    WALLPAPER_PATH=$(jq -r '.background.wallpaperPath // empty' "$CONFIG_FILE" 2>/dev/null)
fi

# Fallback check for current wallpaper symlink
if [ -z "$WALLPAPER_PATH" ] || ! [ -f "$WALLPAPER_PATH" ]; then
    if [ -f "$HOME/.config/rofi/.current_wallpaper" ]; then
        WALLPAPER_PATH=$(readlink -f "$HOME/.config/rofi/.current_wallpaper")
    fi
fi

if [ -z "$WALLPAPER_PATH" ] || ! [ -f "$WALLPAPER_PATH" ]; then
    echo "screenshot"
    exit 0
fi

ln -sf "$WALLPAPER_PATH" "$HYPRLOCK_WALLPAPER_FILE"
echo "$HYPRLOCK_WALLPAPER_FILE"
