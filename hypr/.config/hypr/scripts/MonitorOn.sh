#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Restore the physical LG and retire the headless (out of the layout until next session)
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = false })'
hyprctl eval 'hl.monitor({ output = "sunshine_mon", disabled = true })'
