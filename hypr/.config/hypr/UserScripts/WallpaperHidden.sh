#!/bin/bash

HIDDEN="$HOME/.config/hypr/UserScripts/.hidden"

notify() {
    notify-send \
        --urgency low \
        --transient \
        --expire-time 1000 \
        --icon "/usr/share/icons/Adwaita/scalable/devices/video-display.svg" \
        --app-name Themes \
        "$@"
}

if [ -f "$HIDDEN" ]; then
    rm -f "$HIDDEN"
    notify "Themes" "Disabled hidden themes"
else
    touch "$HIDDEN"
    notify "Themes" "Enabled hidden themes"
fi
