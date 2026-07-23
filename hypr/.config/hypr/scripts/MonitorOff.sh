#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Create virtual headless display for streaming
hyprctl output create headless

# Disable physical monitor so screen in room turns off
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = true })'
