#!/bin/bash

# Your main monitor (change this)
MONITOR="HDMI-A-1"

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# HEADLESS=$(hyprctl -j monitors | jq -r '.[] | select(.name | test("HEADLESS-"; "i")).name')
hyprctl keyword monitor "$MONITOR",2560x1600@60,auto,1.33333

# Disable the monitor
# hyprctl keyword monitor $MONITOR,disable
