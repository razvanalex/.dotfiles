#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Turn physical monitor backlight back on when Sunshine stream ends
hyprctl eval 'hl.dsp.dpms("on")'
