#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Restore the physical LG and remove the headless output
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = false })'
hyprctl output remove sunshine_mon

# Sync wallpaper to the physical display
~/.config/quickshell/scripts/colors/switchwall.sh --screen HDMI-A-1 &
