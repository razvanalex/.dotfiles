#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Disable mouse movement DPMS wake & turn off monitor backlight
hyprctl eval 'hl.config({ misc = { mouse_move_enables_dpms = false } })'
hyprctl eval 'hl.dispatch(hl.dsp.dpms({ action = "off", monitor = "HDMI-A-1" }))'
