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
    # If wallpaper is a video, use static thumbnail for hyprlock
    if [[ "$WALLPAPER_PATH" =~ \.(mp4|webm|mkv|avi|mov|gif)$ ]]; then
        THUMB_PATH=$(jq -r '.background.thumbnailPath // empty' "$CONFIG_FILE" 2>/dev/null)
        if [ -n "$THUMB_PATH" ] && [ -f "$THUMB_PATH" ]; then
            WALLPAPER_PATH="$THUMB_PATH"
        elif [[ "$WALLPAPER_PATH" =~ \.gif$ ]]; then
            THUMB_PATH="$HOME/.config/hypr/custom/scripts/mpvpaper_thumbnails/$(basename "$WALLPAPER_PATH").jpg"
            mkdir -p "$(dirname "$THUMB_PATH")"
            ffmpeg -y -i "$WALLPAPER_PATH" -vframes 1 "$THUMB_PATH" 2>/dev/null
            if [ -f "$THUMB_PATH" ]; then
                WALLPAPER_PATH="$THUMB_PATH"
            fi
        fi
    fi
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
