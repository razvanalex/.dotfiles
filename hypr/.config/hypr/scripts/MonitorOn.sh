#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Turn monitor back on (you may want to change these options)
hyprctl reload

# Get name of headless display 
# HEADLESS=$(hyprctl -j monitors | jq -r '.[] | select(.name | test("HEADLESS-"; "i")).name')
#
# # Remove headless virtual display
# hyprctl output remove "$HEADLESS"
