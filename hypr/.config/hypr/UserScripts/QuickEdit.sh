#!/bin/bash
# Rofi menu for Quick Edit / View of Hyprland Lua Settings

editor=nvim
tty=kitty

configs="$HOME/.config/hypr/lua"

menu(){
  printf "1. edit env.lua\n"
  printf "2. edit window_rules.lua\n"
  printf "3. edit autostart.lua\n"
  printf "4. edit keybinds.lua\n"
  printf "5. edit monitors.lua\n"
  printf "6. edit workspace_rules.lua\n"
  printf "7. edit settings.lua\n"
  printf "8. edit hyprland.lua\n"
}

main() {
    choice=$(menu | rofi -i -dmenu -config ~/.config/rofi/config-compact.rasi | cut -d. -f1)
    case $choice in
        1)
            $tty $editor "$configs/env.lua"
            ;;
        2)
            $tty $editor "$configs/window_rules.lua"
            ;;
        3)
            $tty $editor "$configs/autostart.lua"
            ;;
        4)
            $tty $editor "$configs/keybinds.lua"
            ;;
        5)
            $tty $editor "$configs/monitors.lua"
            ;;
        6)
            $tty $editor "$configs/workspace_rules.lua"
            ;;
        7)
            $tty $editor "$configs/settings.lua"
            ;;
        8)
            $tty $editor "$HOME/.config/hypr/hyprland.lua"
            ;;
        *)
            ;;
    esac
}

main
