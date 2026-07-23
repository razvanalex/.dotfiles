#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Restore default desktop resolution and 144Hz refresh rate
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", mode = "2560x1440@144", position = "auto", scale = 1 })'
