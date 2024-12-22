#!/bin/bash
# /* ---- 💫 https://github.com/JaKooLit 💫 ---- */ 
# This script for selecting wallpapers (SUPER W)

# WALLPAPERS PATH
wallDIR="$HOME/Pictures/Wallpapers"
crtWallDIR=$(cat "${wallDIR}/.crt_theme")
if [ -z ${crtWallDIR+x} ]; then
  crtWallDIR="$HOME/Pictures/Wallpapers/Hyprland"
fi

# variables
SCRIPTSDIR="$HOME/.config/hypr/scripts"

# swww transition config
FPS=60
TYPE="any"
DURATION=1
SWWW_PARAMS="--transition-fps $FPS --transition-type $TYPE --transition-duration $DURATION"

# Check if swaybg is running
if pidof swaybg > /dev/null; then
  pkill swaybg
fi

# Retrieve image files
mapfile -t PICS< <(find "${crtWallDIR}" -type f \( -iname \*.jpg -o -iname \*.jpeg -o -iname \*.png -o -iname \*.gif \) -not -path "${crtWallDIR}/.*")
RANDOM_PIC="${PICS[$((RANDOM % ${#PICS[@]}))]}"
RANDOM_PIC_NAME=". random"

# Rofi command
rofi_command="rofi -i -show -dmenu -config ~/.config/rofi/config-wallpaper.rasi"


# Sorting Wallpapers
menu() {
  mapfile -t sorted_options< <(printf '%s\n' "${PICS[@]}" | sort)

  # Place ". random" at the beginning with the random picture as an icon
  printf "%s\x00icon\x1f%s\n" "$RANDOM_PIC_NAME" "$RANDOM_PIC"

  printf "%s\n" "${sorted_options[@]}" | awk '
function basename(file) {
  sub(".*/", "", file)
  sub("\\..*", "", file)
  return file
}
{
  pic_name = basename($0)
  if ($0 ~ /\/\\.gif$/)
    print pic_name 
  else
    print pic_name "\x00icon\x1f" $0
}'
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

  # Random choice case
  if [ "$choice" = "$RANDOM_PIC_NAME" ]; then
    swww img "${RANDOM_PIC}" $SWWW_PARAMS
    sleep 0.5
    ln -sf "${RANDOM_PIC}" "$HOME/.config/rofi/.current_wallpaper"
    cp -r "${RANDOM_PIC}" "$HOME/.config/hypr/wallpaper_effects/.wallpaper_current"
    source ~/.config/ags/scripts/.venv/bin/activate && \
    ~/.config/ags/scripts/color_generation/colorgen.sh "${RANDOM_PIC}" --apply
    return
  fi

  # Find path of the selected file
  picture=$(printf "%s\n" "${PICS[@]}" | awk -v choice="$choice" '
function basename(file) {
  sub(".*/", "", file)
  sub("\\..*", "", file)
  return file
}
{
  if (basename($0) == choice)
    print $0
}
')

  if [[ -n $picture ]]; then
    swww img "$picture" $SWWW_PARAMS
    sleep 0.5
    ln -sf "$picture" "$HOME/.config/rofi/.current_wallpaper"
    cp -r "$picture" "$HOME/.config/hypr/wallpaper_effects/.wallpaper_current"
    source ~/.config/ags/scripts/.venv/bin/activate && \
    ~/.config/ags/scripts/color_generation/colorgen.sh "$picture" --apply
    sleep 0.5
  else
    echo "Image not found."
    exit 1
  fi
}

# Check if rofi is already running
if pidof rofi > /dev/null; then
  pkill rofi
  exit 0
fi

main

# sleep 0.5
# "${SCRIPTSDIR}/WallustSwww.sh"
# sleep 0.2
# "${SCRIPTSDIR}/RefreshNoWaybar.sh"
