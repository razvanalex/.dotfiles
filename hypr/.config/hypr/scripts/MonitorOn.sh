#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Turn on DPMS for physical display (Hyprland v0.55+ Lua API)
hyprctl eval 'hl.dispatch(hl.dsp.dpms({ action = "on", monitor = "HDMI-A-1" }))'
