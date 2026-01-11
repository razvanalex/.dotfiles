#!/bin/bash
# /* ---- 💫 https://github.com/JaKooLit 💫 ---- */  ##
# Script for Random Wallpaper ( CTRL ALT W)

wallDIR="$HOME/Pictures/Wallpapers"
crtWallDIR=$(cat "${wallDIR}/.crt_theme")
if [ -z ${crtWallDIR+x} ]; then
  crtWallDIR="$HOME/Pictures/Wallpapers/Hyprland"
fi

scriptsDir="$HOME/.config/hypr/scripts"

mapfile -t PICS< <(find "${crtWallDIR}" -type f \( -iname \*.jpg -o -iname \*.jpeg -o -iname \*.png -o -iname \*.gif \) -not -path "${crtWallDIR}/.*")
RANDOMPICS=${PICS[ $RANDOM % ${#PICS[@]} ]}

# Transition config
FPS=60
TYPE="random"
DURATION=1
BEZIER=".43,1.19,1,.4"
SWWW_PARAMS="--transition-fps $FPS --transition-type $TYPE --transition-duration $DURATION --transition-bezier $BEZIER"

awww query || awww-daemon --format xrgb && awww img "${RANDOMPICS}" $SWWW_PARAMS

cp -r "${RANDOMPICS}" "$HOME/.config/hypr/wallpaper_effects/.wallpaper_current"
ln -sf "${RANDOMPICS}" "$HOME/.config/rofi/.current_wallpaper"
source ~/.config/ags/scripts/.venv/bin/activate && \
~/.config/ags/scripts/color_generation/colorgen.sh "${RANDOMPICS}" --apply

# "${scriptsDir}/WallustSwww.sh"
# sleep 1
# "${scriptsDir}/RefreshNoWaybar.sh"
