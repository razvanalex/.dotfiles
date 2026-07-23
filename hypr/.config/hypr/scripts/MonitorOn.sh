#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Restore mouse movement DPMS wake & turn on monitor backlight
hyprctl eval 'hl.config({ misc = { mouse_move_enables_dpms = true } })'
hyprctl eval 'hl.dispatch(hl.dsp.dpms({ action = "on", monitor = "HDMI-A-1" }))'
