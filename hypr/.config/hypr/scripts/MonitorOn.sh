#!/bin/bash

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t $XDG_RUNTIME_DIR/hypr/ | head -n 1)

# Re-enable physical monitor
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", mode = "2560x1440@144", position = "auto", scale = 1 })'

# Remove virtual headless outputs
for h in $(hyprctl -j monitors | jq -r '.[] | select(.name | test("HEADLESS"; "i")).name' 2>/dev/null); do
    hyprctl output remove "$h"
done
