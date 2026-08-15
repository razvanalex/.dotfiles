#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

WIDTH="${SUNSHINE_CLIENT_WIDTH:-2560}"
HEIGHT="${SUNSHINE_CLIENT_HEIGHT:-1440}"
FPS="${SUNSHINE_CLIENT_FPS:-60}"
SCALE="${SUNSHINE_CLIENT_SCALE:-1.5}"

# Ensure the headless output exists (it is removed on disconnect / dies with the compositor)
if ! hyprctl -j monitors | grep -q '"sunshine_mon"'; then
  hyprctl output create headless sunshine_mon
  sleep 1
fi

# Match the headless to the client's stream resolution, then remove the physical LG
hyprctl eval 'hl.monitor({ output = "sunshine_mon", disabled = false, mode = "'"${WIDTH}x${HEIGHT}@${FPS}"'", position = "auto", scale = "'"${SCALE}"'" })'
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = true })'
