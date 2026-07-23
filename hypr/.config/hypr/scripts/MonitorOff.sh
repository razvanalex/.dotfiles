#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

WIDTH="${SUNSHINE_CLIENT_WIDTH:-2560}"
HEIGHT="${SUNSHINE_CLIENT_HEIGHT:-1440}"
FPS="${SUNSHINE_CLIENT_FPS:-60}"

# Adjust monitor resolution dynamically to match Sunshine client stream request
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", mode = "'"${WIDTH}x${HEIGHT}@${FPS}"'", position = "auto", scale = 1 })'
