#!/bin/bash
# /* ---- 💫 https://github.com/JaKooLit 💫 ---- */  ##
# source https://wiki.archlinux.org/title/Hyprland#Using_a_script_to_change_wallpaper_every_X_minutes

# This script will randomly go through the files of a directory, setting it
# up as the wallpaper at regular intervals
#
# NOTE: this script uses bash (not POSIX shell) for the RANDOM variable

wallDIR="$HOME/Pictures/Wallpapers"
crtWallDIR=$(cat "${wallDIR}/.crt_theme")
if [ -z ${crtWallDIR+x} ]; then
  crtWallDIR="$HOME/Pictures/Wallpapers/Hyprland"
fi

# This controls (in seconds) when to switch to the next image
INTERVAL=3000

awww query || awww-daemon --format xrgb

while true; do
	find "$crtWallDIR" -type f -not -path "${crtWallDIR}/.*" \
		| while read -r img; do
			echo "$((RANDOM % 1000)):$img"
		done \
		| sort -n | cut -d':' -f2- \
		| while read -r img; do
			awww img "$img" --transition-type fade --transition-fps 60 --transition-duration 1
			ln -sf "$img" "$HOME/.config/rofi/.current_wallpaper"
			cp -r "$img" "$HOME/.config/hypr/wallpaper_effects/.wallpaper_current"
			source ~/.config/ags/scripts/.venv/bin/activate && \
			~/.config/ags/scripts/color_generation/colorgen.sh "${img}" --apply
			sleep $INTERVAL
		done
done
