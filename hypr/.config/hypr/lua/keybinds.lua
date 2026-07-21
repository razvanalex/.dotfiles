-- Hyprland Keybindings Configuration

local keybinds = {
    -- Basic Actions & Session
    { mods = "$mainMod", key = "S", type = "bind", cmd = "exec, ~/.config/ags/scripts/grimblast.sh --freeze copy area" },
    { mods = "$mainMod+Ctrl+Alt", key = "M", type = "bind", cmd = "exec, hyprctl dispatch exit 0" },
    { mods = "$mainMod", key = "P", type = "bind", cmd = "exec, $scriptsDir/LockScreen.sh" },
    { mods = "Ctrl+Alt", key = "P", type = "bind", cmd = "exec, $scriptsDir/Wlogout.sh" },
    { mods = "$mainMod+Shift", key = "P", type = "bindl", cmd = "exec, sleep 0.1 && systemctl suspend || loginctl suspend" },

    -- Window Management & Focus
    { mods = "$mainMod", key = "Left", type = "bind", cmd = "movefocus, l" },
    { mods = "$mainMod", key = "Right", type = "bind", cmd = "movefocus, r" },
    { mods = "$mainMod", key = "Up", type = "bind", cmd = "movefocus, u" },
    { mods = "$mainMod", key = "Down", type = "bind", cmd = "movefocus, d" },
    { mods = "$mainMod", key = "H", type = "bind", cmd = "movefocus, l" },
    { mods = "$mainMod", key = "L", type = "bind", cmd = "movefocus, r" },
    { mods = "$mainMod", key = "K", type = "bind", cmd = "movefocus, u" },
    { mods = "$mainMod", key = "J", type = "bind", cmd = "movefocus, d" },
    { mods = "$mainMod", key = "Q", type = "bind", cmd = "killactive," },
    { mods = "$mainMod+Shift", key = "Q", type = "bind", cmd = "exec, $scriptsDir/KillActiveProcess.sh" },
    { mods = "$mainMod+Shift+Alt", key = "Q", type = "bind", cmd = "exec, hyprctl kill" },
    { mods = "$mainMod+Alt", key = "Space", type = "bind", cmd = "togglefloating," },
    { mods = "$mainMod", key = "F", type = "bind", cmd = "fullscreen, 0" },
    { mods = "$mainMod+Ctrl", key = "F", type = "bind", cmd = "fullscreen, 1" },

    -- Applications & Custom Tools
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

    -- App Launchers & Search
    { mods = "$mainMod", key = "D", type = "bind", cmd = "exec, qs ipc call search toggle || (pkill rofi || rofi -show drun -modi drun,filebrowser,run,window)" },
    { mods = "$mainMod", key = "A", type = "bind", cmd = "exec, qs ipc call search toggle" },
    { mods = "$mainMod", key = "$mainMod_L", type = "bindr", cmd = "exec, qs ipc call search toggle" },

    -- Quickshell Widgets & Controls
    { mods = "$mainMod", key = "W", type = "bind", cmd = "exec, qs ipc call wallpaperSelector toggle" },
    { mods = "$mainMod+Alt", key = "W", type = "bind", cmd = "exec, qs ipc call wallpapers toggleHidden" },
    { mods = "Ctrl+Alt", key = "W", type = "bind", cmd = "exec, qs ipc call wallpapers random" },
    { mods = "$mainMod", key = "C", type = "bind", cmd = "exec, qs ipc call wallpapers random" },
    { mods = "Ctrl+$mainMod", key = "R", type = "bindr", cmd = "exec, pkill quickshell; quickshell &" },
    { mods = "$mainMod", key = "A", type = "bind", cmd = "exec, qs ipc call panelFamily cycle" },

    -- Media & Audio Controls
    { mods = "", key = "XF86AudioNext", type = "bindl", cmd = "exec, playerctl next" },
    { mods = "", key = "XF86AudioPrev", type = "bindl", cmd = "exec, playerctl previous" },
    { mods = "", key = "XF86AudioPlay", type = "bindl", cmd = "exec, playerctl play-pause" },
    { mods = "", key = "XF86AudioMute", type = "bindl", cmd = "exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle" },
    { mods = "", key = "XF86AudioRaiseVolume", type = "bindle", cmd = "exec, wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+" },
    { mods = "", key = "XF86AudioLowerVolume", type = "bindle", cmd = "exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-" },
}

-- Workspace Navigation Binds (1..10)
for i = 1, 10 do
    local key = tostring(i % 10)
    table.insert(keybinds, { mods = "$mainMod", key = key, type = "bind", cmd = "workspace, " .. i })
    table.insert(keybinds, { mods = "$mainMod+Shift", key = key, type = "bind", cmd = "movetoworkspace, " .. i })
    table.insert(keybinds, { mods = "$mainMod+Alt", key = key, type = "bind", cmd = "movetoworkspacesilent, " .. i })
end

return keybinds
