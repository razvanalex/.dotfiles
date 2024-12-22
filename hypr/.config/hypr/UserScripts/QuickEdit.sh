#!/bin/bash
# Rofi menu for Quick Edit / View of Settings (SUPER E)

# define your preferred text editor and terminal to use
editor=nvim
tty=kitty

configs="$HOME/.config/hypr/configs"

menu(){
  printf "1. edit ENVariables\n"
  printf "2. edit WindowRules\n"
  printf "3. edit StartupApps\n"
  printf "4. edit Keybinds\n"
  printf "5. edit Monitors\n"
  printf "6. edit WorkspaceRules\n"
  printf "7. edit Settings\n"
}

main() {
    choice=$(menu | rofi -i -dmenu -config ~/.config/rofi/config-compact.rasi | cut -d. -f1)
    case $choice in
        1)
            $tty $editor "$configs/ENVariables.conf"
            ;;
        2)
            $tty $editor "$configs/WindowRules.conf"
            ;;
        3)
            $tty $editor "$configs/StartupApps.conf"
            ;;
        4)
            $tty $editor "$configs/Keybinds.conf"
            ;;
        5)
            $tty $editor "$configs/Monitors.conf"
            ;;
        6)
            $tty $editor "$configs/WorkspaceRules.conf"
            ;;
        7)
            $tty $editor "$configs/Settings.conf"
            ;;
        *)
            ;;
    esac
}

main
