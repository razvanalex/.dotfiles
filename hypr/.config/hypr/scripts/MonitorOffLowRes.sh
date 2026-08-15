#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Ensure the headless output exists (it is removed on disconnect / dies with the compositor)
if ! hyprctl -j monitors | grep -q '"sunshine_mon"'; then
  hyprctl output create headless sunshine_mon
  sleep 1
fi

# Low-res headless mode: native 2016x1260 (the 1.5-scaled logical size), no scaling
hyprctl eval 'hl.monitor({ output = "sunshine_mon", disabled = false, mode = "2016x1260@60", position = "auto", scale = 1 })'
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = true })'
