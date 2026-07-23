-- Hyprland Keybindings Configuration

local keybinds = {
    -- Basic Actions & Session
    { mods = "$mainMod", key = "S", type = "bind", cmd = "exec, ~/.config/ags/scripts/grimblast.sh --freeze copy area" },
    { mods = "$mainMod+Ctrl+Alt", key = "M", type = "bind", cmd = "exec, hyprctl dispatch exit 0" },
    { mods = "$mainMod", key = "P", type = "bind", cmd = "exec, $scriptsDir/LockScreen.sh" },
    { mods = "Ctrl+Alt", key = "P", type = "bind", cmd = "exec, $scriptsDir/Wlogout.sh" },
    { mods = "$mainMod+Shift", key = "P", type = "bindl", cmd = "exec, sleep 0.1 && systemctl suspend || loginctl suspend" },

    -- Window Focus
    { mods = "$mainMod", key = "Left", type = "bind", cmd = "movefocus, l" },
    { mods = "$mainMod", key = "Right", type = "bind", cmd = "movefocus, r" },
    { mods = "$mainMod", key = "Up", type = "bind", cmd = "movefocus, u" },
    { mods = "$mainMod", key = "Down", type = "bind", cmd = "movefocus, d" },
    { mods = "$mainMod", key = "H", type = "bind", cmd = "movefocus, l" },
    { mods = "$mainMod", key = "L", type = "bind", cmd = "movefocus, r" },
    { mods = "$mainMod", key = "K", type = "bind", cmd = "movefocus, u" },
    { mods = "$mainMod", key = "J", type = "bind", cmd = "movefocus, d" },
    { mods = "$mainMod", key = "BracketLeft", type = "bind", cmd = "movefocus, l" },
    { mods = "$mainMod", key = "BracketRight", type = "bind", cmd = "movefocus, r" },

    -- Window Movement & Actions
    { mods = "$mainMod+Shift", key = "Left", type = "bind", cmd = "movewindow, l" },
    { mods = "$mainMod+Shift", key = "Right", type = "bind", cmd = "movewindow, r" },
    { mods = "$mainMod+Shift", key = "Up", type = "bind", cmd = "movewindow, u" },
    { mods = "$mainMod+Shift", key = "Down", type = "bind", cmd = "movewindow, d" },
    { mods = "$mainMod+Shift", key = "H", type = "bind", cmd = "movewindow, l" },
    { mods = "$mainMod+Shift", key = "L", type = "bind", cmd = "movewindow, r" },
    { mods = "$mainMod+Shift", key = "K", type = "bind", cmd = "movewindow, u" },
    { mods = "$mainMod+Shift", key = "J", type = "bind", cmd = "movewindow, d" },
    { mods = "$mainMod", key = "Q", type = "bind", cmd = "killactive," },
    { mods = "$mainMod+Shift", key = "Q", type = "bind", cmd = "exec, $scriptsDir/KillActiveProcess.sh" },
    { mods = "$mainMod+Shift+Alt", key = "Q", type = "bind", cmd = "exec, hyprctl kill" },
    { mods = "$mainMod+Alt", key = "Space", type = "bind", cmd = "togglefloating," },
    { mods = "$mainMod", key = "F", type = "bind", cmd = "fullscreen, 0" },
    { mods = "$mainMod+Ctrl", key = "F", type = "bind", cmd = "fullscreen, 1" },
    { mods = "Ctrl+$mainMod", key = "Backslash", type = "bind", cmd = "resizeactive, exact 1024 768" },

    -- Mouse Binds (Dragging & Resizing)
    { mods = "$mainMod", key = "mouse:272", type = "bindm", cmd = "movewindow" },
    { mods = "$mainMod", key = "mouse:273", type = "bindm", cmd = "resizewindow" },

    -- Active Window Resizing (Repeating)
    { mods = "$mainMod+Ctrl", key = "Left", type = "binde", cmd = "resizeactive, -50 0" },
    { mods = "$mainMod+Ctrl", key = "Right", type = "binde", cmd = "resizeactive, 50 0" },
    { mods = "$mainMod+Ctrl", key = "Up", type = "binde", cmd = "resizeactive, 0 -50" },
    { mods = "$mainMod+Ctrl", key = "Down", type = "binde", cmd = "resizeactive, 0 50" },
    { mods = "$mainMod+Ctrl", key = "H", type = "binde", cmd = "resizeactive, -50 0" },
    { mods = "$mainMod+Ctrl", key = "L", type = "binde", cmd = "resizeactive, 50 0" },
    { mods = "$mainMod+Ctrl", key = "K", type = "binde", cmd = "resizeactive, 0 -50" },
    { mods = "$mainMod+Ctrl", key = "J", type = "binde", cmd = "resizeactive, 0 50" },

    -- Window Pinning & Groups & Cycling
    { mods = "$mainMod", key = "P", type = "bind", cmd = "pin" },
    { mods = "$mainMod", key = "G", type = "bind", cmd = "togglegroup" },
    { mods = "$mainMod+Shift", key = "Tab", type = "bind", cmd = "changegroupactive" },
    { mods = "Alt", key = "Tab", type = "bind", cmd = "cyclenext" },

    -- Applications & Tools
    { mods = "$mainMod", key = "Return", type = "bind", cmd = "exec, kitty" },
    { mods = "$mainMod", key = "E", type = "bind", cmd = "exec, nautilus --new-window" },
    { mods = "$mainMod", key = "I", type = "bind", cmd = "exec, XDG_CURRENT_DESKTOP=\"gnome\" gnome-control-center" },
    { mods = "Ctrl+$mainMod", key = "V", type = "bind", cmd = "exec, pavucontrol" },
    { mods = "Ctrl+Shift", key = "Escape", type = "bind", cmd = "exec, gnome-system-monitor" },
    { mods = "$mainMod+Shift", key = "Return", type = "bind", cmd = "exec, pypr toggle term" },
    { mods = "$mainMod", key = "Z", type = "bind", cmd = "exec, pypr zoom" },
    { mods = "$mainMod", key = "Space", type = "bindn", cmd = "exec, $scriptsDir/SwitchKeyboardLayout.sh" },
    { mods = "$mainMod", key = "Grave", type = "bindl", cmd = "exec, $UserScripts/VM.sh" },
    { mods = "$mainMod", key = "R", type = "bind", cmd = "exec, /home/razvan/Workspace/ai/tts-read/tts_read.sh" },
    { mods = "Ctrl+$mainMod", key = "C", type = "bind", cmd = "exec, $UserScripts/VSCode.sh" },
    { mods = "$mainMod+Alt", key = "C", type = "bind", cmd = "exec, $UserScripts/RofiCalc.sh" },

    -- App Launchers & Search
    { mods = "$mainMod", key = "D", type = "bind", cmd = "exec, qs ipc call search toggle || (pkill rofi || rofi -show drun -modi drun,filebrowser,run,window)" },
    { mods = "$mainMod", key = "A", type = "bind", cmd = "exec, qs ipc call search toggle" },
    { mods = "$mainMod", key = "$mainMod_L", type = "bindr", cmd = "exec, qs ipc call search toggle" },
    { mods = "$mainMod", key = "Slash", type = "bind", cmd = "exec, qs ipc call cheatsheet toggle || ags -t cheatsheet0" },

    -- Quickshell Widgets & Controls
    { mods = "$mainMod", key = "W", type = "bind", cmd = "exec, qs ipc call wallpaperSelector toggle" },
    { mods = "$mainMod+Alt", key = "W", type = "bind", cmd = "exec, qs ipc call wallpapers toggleHidden" },
    { mods = "Ctrl+Alt", key = "W", type = "bind", cmd = "exec, qs ipc call wallpapers random" },
    { mods = "$mainMod", key = "C", type = "bind", cmd = "exec, qs ipc call wallpapers setTheme Kitty" },
    { mods = "Ctrl+$mainMod", key = "R", type = "bindr", cmd = "exec, pkill quickshell; quickshell &" },

    -- Special Workspace
    { mods = "$mainMod", key = "U", type = "bind", cmd = "togglespecialworkspace," },
    { mods = "$mainMod", key = "mouse:275", type = "bind", cmd = "togglespecialworkspace," },
    { mods = "$mainMod+Shift", key = "U", type = "bind", cmd = "movetoworkspacesilent, special" },

    -- Relative Workspace Switching
    { mods = "Ctrl+Alt", key = "Right", type = "bind", cmd = "workspace, +1" },
    { mods = "Ctrl+Alt", key = "Left", type = "bind", cmd = "workspace, -1" },
    { mods = "Ctrl+Alt", key = "L", type = "bind", cmd = "workspace, +1" },
    { mods = "Ctrl+Alt", key = "H", type = "bind", cmd = "workspace, -1" },
    { mods = "$mainMod", key = "mouse_up", type = "bind", cmd = "workspace, +1" },
    { mods = "$mainMod", key = "mouse_down", type = "bind", cmd = "workspace, -1" },
    { mods = "Ctrl+Alt", key = "mouse_up", type = "bind", cmd = "workspace, +1" },
    { mods = "Ctrl+Alt", key = "mouse_down", type = "bind", cmd = "workspace, -1" },
    { mods = "$mainMod", key = "Page_Down", type = "bind", cmd = "workspace, +1" },
    { mods = "$mainMod", key = "Page_Up", type = "bind", cmd = "workspace, -1" },
    { mods = "Ctrl+Alt", key = "Page_Down", type = "bind", cmd = "workspace, +1" },
    { mods = "Ctrl+Alt", key = "Page_Up", type = "bind", cmd = "workspace, -1" },

    -- Move Window to Relative Workspace
    { mods = "$mainMod+Alt", key = "L", type = "bind", cmd = "movetoworkspacesilent, +1" },
    { mods = "$mainMod+Alt", key = "H", type = "bind", cmd = "movetoworkspacesilent, -1" },
    { mods = "$mainMod+Alt", key = "Right", type = "bind", cmd = "movetoworkspacesilent, +1" },
    { mods = "$mainMod+Alt", key = "Left", type = "bind", cmd = "movetoworkspacesilent, -1" },
    { mods = "Ctrl+Alt+Shift", key = "L", type = "bind", cmd = "movetoworkspace, +1" },
    { mods = "Ctrl+Alt+Shift", key = "H", type = "bind", cmd = "movetoworkspace, -1" },
    { mods = "Ctrl+Alt+Shift", key = "Right", type = "bind", cmd = "movetoworkspace, +1" },
    { mods = "Ctrl+Alt+Shift", key = "Left", type = "bind", cmd = "movetoworkspace, -1" },
    { mods = "Ctrl+Alt+Shift", key = "mouse_down", type = "bind", cmd = "movetoworkspace, -1" },
    { mods = "Ctrl+Alt+Shift", key = "mouse_up", type = "bind", cmd = "movetoworkspace, +1" },

    -- Media, Volume & Brightness Controls
    { mods = "", key = "XF86AudioNext", type = "bindl", cmd = "exec, playerctl next" },
    { mods = "", key = "XF86AudioPrev", type = "bindl", cmd = "exec, playerctl previous" },
    { mods = "", key = "XF86AudioPlay", type = "bindl", cmd = "exec, playerctl play-pause" },
    { mods = "", key = "XF86AudioMute", type = "bindl", cmd = "exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle" },
    { mods = "Alt", key = "XF86AudioMute", type = "bindl", cmd = "exec, wpctl set-mute @DEFAULT_SOURCE@ toggle" },
    { mods = "$mainMod", key = "XF86AudioMute", type = "bindl", cmd = "exec, wpctl set-mute @DEFAULT_SOURCE@ toggle" },
    { mods = "$mainMod+Shift", key = "M", type = "bindl", cmd = "exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 0%" },
    { mods = "", key = "XF86AudioRaiseVolume", type = "bindle", cmd = "exec, wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+" },
    { mods = "", key = "XF86AudioLowerVolume", type = "bindle", cmd = "exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-" },
    { mods = "Alt", key = "XF86AudioRaiseVolume", type = "bindle", cmd = "exec, wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+" },
    { mods = "Alt", key = "XF86AudioLowerVolume", type = "bindle", cmd = "exec, wpctl set-volume @DEFAULT_SOURCE@ 5%-" },
    { mods = "$mainMod", key = "XF86AudioRaiseVolume", type = "bindle", cmd = "exec, wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+" },
    { mods = "$mainMod", key = "XF86AudioLowerVolume", type = "bindle", cmd = "exec, wpctl set-volume @DEFAULT_SOURCE@ 5%-" },
    { mods = "", key = "XF86MonBrightnessUp", type = "bindle", cmd = "exec, brightnessctl set +5%" },
    { mods = "", key = "XF86MonBrightnessDown", type = "bindle", cmd = "exec, brightnessctl set 5%-" },
}

-- Workspace Navigation Binds (1..10)
for i = 1, 10 do
    local key = tostring(i % 10)
    table.insert(keybinds, { mods = "$mainMod", key = key, type = "bind", cmd = "workspace, " .. i })
    table.insert(keybinds, { mods = "$mainMod+Shift", key = key, type = "bind", cmd = "movetoworkspace, " .. i })
    table.insert(keybinds, { mods = "$mainMod+Alt", key = key, type = "bind", cmd = "movetoworkspacesilent, " .. i })
end

return keybinds
