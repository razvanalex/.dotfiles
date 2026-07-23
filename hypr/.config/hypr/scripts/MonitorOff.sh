#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Turn off physical monitor backlight during Sunshine streaming
hyprctl eval 'hl.dsp.dpms("off")'
