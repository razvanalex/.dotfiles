#!/bin/bash

# Your main monitor (change this)
MONITOR="HDMI-A-1"

# Turn monitor back on (you may want to change these options)
hyprctl keyword monitor $MONITOR,preferred,auto,1,vrr,1

# Get name of headless display 
HEADLESS=$(hyprctl -j monitors | jq -r '.[] | select(.name | test("HEADLESS-"; "i")).name')

# Remove headless virtual display
hyprctl output remove "$HEADLESS"
