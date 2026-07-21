-- Hyprland Autostart Configuration

local autostart = {
    -- Environment setup
    "tmux setenv -g HYPRLAND_INSTANCE_SIGNATURE \"$HYPRLAND_INSTANCE_SIGNATURE\"",
    "gsettings set org.gnome.desktop.interface cursor-theme \"Bibata-Modern-Classic\"",
    "dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP",
    "systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP",
    "hyprctl setcursor Bibata-Modern-Classic 24",
    "sleep 5s && systemctl --user start hyprland.target",
    "$scriptsDir/wait-for-tray.sh systemctl --user restart sunshine.service",
    "$scriptsDir/Polkit.sh",

    -- Desktop Shell (Quickshell)
    "quickshell &",

    -- Applets & Daemons
    "$scriptsDir/wait-for-tray.sh blueman-applet &",
    "$scriptsDir/wait-for-tray.sh solaar -w hide &",
    "openrgb --server --mode static --color 000000 &",
    "bash -l -c \"sleep 10 && aw-qt &>> ~/.cache/activitywatch/log/aw-qt.log\" &",

    -- Clipboard history
    "wl-paste --type text --watch cliphist store",
    "wl-paste --type image --watch cliphist store",

    -- Idle & Utilities
    "hypridle &",
    "pypr &",
    "$UserScripts/WallpaperAutoChange.sh &",
}

local shutdown = {
    "systemctl --user stop hyprland.target",
    "systemctl --user stop sunshine.service",
}

return { autostart = autostart, shutdown = shutdown }
