#!/bin/bash

# Your main monitor (change this)
MONITOR="HDMI-A-1"

# Create headless virtual display
hyprctl output create headless

# Disable the monitor
hyprctl keyword monitor $MONITOR,disable
