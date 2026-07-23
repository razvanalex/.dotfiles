#!/usr/bin/env bash

QUICKSHELL_CONFIG_NAME="ii"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
if [ -d "$XDG_CONFIG_HOME/quickshell/$QUICKSHELL_CONFIG_NAME" ]; then
    CONFIG_DIR="$XDG_CONFIG_HOME/quickshell/$QUICKSHELL_CONFIG_NAME"
else
    CONFIG_DIR="$XDG_CONFIG_HOME/quickshell"
fi
CACHE_DIR="$XDG_CACHE_HOME/quickshell"
STATE_DIR="$XDG_STATE_HOME/quickshell"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

term_alpha=100 #Set this to < 100 make all your terminals transparent
# sleep 0 # idk i wanted some delay or colors dont get applied properly
if [ ! -d "$STATE_DIR"/user/generated ]; then
  mkdir -p "$STATE_DIR"/user/generated
fi
cd "$CONFIG_DIR" || cd "$XDG_CONFIG_HOME/quickshell" || exit

colornames=''
colorstrings=''
colorlist=()
colorvalues=()

colornames=$(cat $STATE_DIR/user/generated/material_colors.scss | cut -d: -f1)
colorstrings=$(cat $STATE_DIR/user/generated/material_colors.scss | cut -d: -f2 | cut -d ' ' -f2 | cut -d ";" -f1)
IFS=$'\n'
colorlist=($colornames)     # Array of color names
colorvalues=($colorstrings) # Array of color values

apply_kitty() {  
  # Check if terminal escape sequence template exists
  if [ ! -f "$SCRIPT_DIR/terminal/kitty-theme.conf" ]; then
    echo "Template file not found for Kitty theme. Skipping that."
    return
  fi
  # Copy template
  mkdir -p "$STATE_DIR"/user/generated/terminal
  cp "$SCRIPT_DIR/terminal/kitty-theme.conf" "$STATE_DIR"/user/generated/terminal/kitty-theme.conf
  # Apply colors
  for i in "${!colorlist[@]}"; do
    sed -i "s/${colorlist[$i]} #/${colorvalues[$i]#\#}/g" "$STATE_DIR"/user/generated/terminal/kitty-theme.conf
  done

  # Note: Do not send SIGUSR1 to Kitty as it resets in-memory font size adjustments.
  # Live color updates for open terminals are handled by apply_anyterm escape sequences.
  return
}

apply_anyterm() {
  # Check if terminal escape sequence template exists
  if [ ! -f "$SCRIPT_DIR/terminal/sequences.txt" ]; then
    echo "Template file not found for Terminal. Skipping that."
    return
  fi
  # Copy template
  mkdir -p "$STATE_DIR"/user/generated/terminal
  cp "$SCRIPT_DIR/terminal/sequences.txt" "$STATE_DIR"/user/generated/terminal/sequences.txt
  # Apply colors
  for i in "${!colorlist[@]}"; do
    sed -i "s/${colorlist[$i]} #/${colorvalues[$i]#\#}/g" "$STATE_DIR"/user/generated/terminal/sequences.txt
  done

  sed -i "s/\$alpha/$term_alpha/g" "$STATE_DIR/user/generated/terminal/sequences.txt"

  for file in /dev/pts/*; do
    if [[ $file =~ ^/dev/pts/[0-9]+$ ]]; then
      {
      cat "$STATE_DIR"/user/generated/terminal/sequences.txt >"$file"
      } & disown || true
    fi
  done
}

apply_term() {
  apply_anyterm &
  apply_kitty &
}

# Check if terminal theming is enabled in config
CONFIG_FILE="$XDG_CONFIG_HOME/illogical-impulse/config.json"
if [ -f "$CONFIG_FILE" ]; then
  enable_terminal=$(jq -r '.appearance.wallpaperTheming.enableTerminal' "$CONFIG_FILE")
  if [ "$enable_terminal" = "true" ]; then
    apply_term &
  fi
else
  echo "Config file not found at $CONFIG_FILE. Applying terminal theming by default."
  apply_term &
fi

# Apply dynamic border colors to Hyprland from material palette
apply_hypr_borders() {
  local scss_file="$STATE_DIR/user/generated/material_colors.scss"
  if [ ! -s "$scss_file" ]; then
    return
  fi

  # Extract primary and tertiary colors (primary for active, tertiary as gradient accent)
  local primary tertiary
  primary=$(grep -E '^\$primary:' "$scss_file" | awk '{print $2}' | tr -d ';')
  tertiary=$(grep -E '^\$tertiary:' "$scss_file" | awk '{print $2}' | tr -d ';')
  local inactive
  inactive=$(grep -E '^\$surfaceContainer:' "$scss_file" | awk '{print $2}' | tr -d ';')

  # Fall back if colors not found
  [ -z "$primary" ] && primary="#A0C4FF"
  [ -z "$tertiary" ] && tertiary="#BDB2FF"
  [ -z "$inactive" ] && inactive="#3A3A3A"

  # Convert #RRGGBB to 0xRRGGBBEE (Hyprland ARGB with 93% opacity)
  hex_to_hypr() { echo "0x${1#\#}EE"; }

  local primary_hypr tertiary_hypr inactive_hypr
  primary_hypr=$(hex_to_hypr "$primary")
  tertiary_hypr=$(hex_to_hypr "$tertiary")
  inactive_hypr=$(hex_to_hypr "$inactive")

  hyprctl keyword "general:col.active_border" "${primary_hypr} ${tertiary_hypr} 45deg" 2>/dev/null || true
  hyprctl keyword "general:col.inactive_border" "${inactive_hypr}" 2>/dev/null || true
  hyprctl keyword "group:col.border_active" "${primary_hypr}" 2>/dev/null || true
  hyprctl keyword "group:groupbar:col.active" "${primary_hypr}" 2>/dev/null || true
}
apply_hypr_borders &

# apply_qt & # Qt theming is already handled by kde-material-colors
