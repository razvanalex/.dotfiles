#!/bin/bash
# /* ---- 💫 https://github.com/JaKooLit 💫 ---- */ 
# This script for selecting wallpapers (SUPER CTRL W)

# WALLPAPERS PATH
wallDIR="$HOME/Pictures/Wallpapers"

# variables
SCRIPTSDIR="$HOME/.config/hypr/UserScripts"

# Check if swaybg is running
if pidof swaybg > /dev/null; then
  pkill swaybg
fi

# Retrieve image files
if [ -f "$SCRIPTSDIR/.hidden" ]; then
  mapfile -t THEMES< <(find "${wallDIR}" -type d)
else
  mapfile -t THEMES< <(find "${wallDIR}" -type d -not -path "${wallDIR}/.*")
fi

# Rofi command
rofi_command="rofi -i -show -dmenu -config ~/.config/rofi/config-wallpaper-theme.rasi"

# Sorting Wallpapers
menu() {
  mapfile -t sorted_options< <(printf '%s\n' "${THEMES[@]}" | sort)

  for theme_path in "${sorted_options[@]}"; do
    theme_name=$(basename "$theme_path")

    printf "%s\n" "$theme_name"
  done
}

# initiate swww if not running
swww query || swww-daemon --format xrgb 

# Choice of wallpapers
main() {
  choice=$(menu | ${rofi_command})
  # No choice case
  if [[ -z $choice ]]; then
    exit 0
  fi

  theme_index=-1
  for i in "${!THEMES[@]}"; do
    filename=$(basename "${THEMES[$i]}")
    if [[ "$filename" == "$choice" ]]; then
      theme_index=$i
      break
    fi
  done

  if [[ $theme_index -ne -1 ]]; then
    pkill -9 WallpaperAutoCh
    pkill -9 WallpaperSelect
    echo "${THEMES[$theme_index]}" > "${wallDIR}/.crt_theme"
    nohup bash -c "${SCRIPTSDIR}/WallpaperAutoChange.sh" &>/dev/null &
  else
    echo "Theme not found."
    exit 1
  fi
}

# Check if rofi is already running
if pidof rofi > /dev/null; then
  pkill rofi
  exit 0
fi

# From path
if [ "$#" -eq 1 ]; then
    pkill -9 WallpaperAutoCh
    pkill -9 WallpaperSelect
    echo "$1" > "${wallDIR}/.crt_theme"
    nohup bash -c "${SCRIPTSDIR}/WallpaperAutoChange.sh" &>/dev/null &
    exit 0
fi

main
