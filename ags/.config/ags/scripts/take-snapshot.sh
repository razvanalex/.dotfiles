#!/bin/bash

# Usage: ./scripts/take-snapshot.sh [window_title]
# Captures a snapshot of the specific window by title using its coordinates.

TITLE="$1"
OUTPUT_DIR="$HOME/Pictures/Screenshots/ags-dev"
mkdir -p "$OUTPUT_DIR"
FILENAME="$OUTPUT_DIR/snapshot-$(date +%Y%m%d-%H%M%S).png"

if [ -z "$TITLE" ]; then
    grim "$FILENAME"
else
    # Extract window coordinates (at: x,y and size: w,h)
    WINDOW_DATA=$(hyprctl clients -j | jq -r --arg title "$TITLE" '.[] | select(.title == $title)')
    
    if [ -z "$WINDOW_DATA" ]; then
        echo "Error: Could not find window '$TITLE'."
        exit 1
    fi
    
    X=$(echo "$WINDOW_DATA" | jq '.at[0]')
    Y=$(echo "$WINDOW_DATA" | jq '.at[1]')
    W=$(echo "$WINDOW_DATA" | jq '.size[0]')
    H=$(echo "$WINDOW_DATA" | jq '.size[1]')
    
    # Capture geometry
    grim -g "$X,$Y ${W}x${H}" "$FILENAME"
fi

if [ -f "$FILENAME" ]; then
    echo "Snapshot saved to: $FILENAME"
else
    echo "Error: Snapshot could not be saved."
    exit 1
fi
