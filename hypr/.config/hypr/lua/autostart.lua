-- Hyprland Autostart Configuration
-- Commands & Apps executed at launch

local vars = require("lua.variables")

hl.on("hyprland.start", function()
    -- Environment setup & TMUX instance signature
    hl.exec_cmd('tmux setenv -g HYPRLAND_INSTANCE_SIGNATURE "$HYPRLAND_INSTANCE_SIGNATURE"')

    -- GNOME desktop interface cursor & icon theme
    hl.exec_cmd('gsettings set org.gnome.desktop.interface cursor-theme "Bibata-Modern-Classic"')
    hl.exec_cmd('gsettings set org.gnome.desktop.interface icon-theme "MoreWaita"')

    -- DBus & Systemd environment import
    hl.exec_cmd("dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE")
    hl.exec_cmd("systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE")

    -- Hyprland cursor theme and size
    hl.exec_cmd("hyprctl setcursor Bibata-Modern-Classic 24")

    -- Start systemd hyprland.target (starts quickshell.service, hypridle.service, etc.)
    hl.exec_cmd("sleep 5s && systemctl --user start hyprland.target")

    -- Sunshine streaming service restart after system tray is ready
    hl.exec_cmd(vars.scriptsDir .. "/wait-for-tray.sh systemctl --user restart sunshine.service")

    -- Polkit authentication agent (Polkit Gnome / KDE)
    hl.exec_cmd(vars.scriptsDir .. "/Polkit.sh")

    -- Daemons (OpenRGB)
    hl.exec_cmd("flatpak run org.openrgb.OpenRGB --server --mode static --color 000000 &")

    -- Clipboard manager watchers (text & image via cliphist)
    hl.exec_cmd("wl-paste --type text --watch cliphist store")
    hl.exec_cmd("wl-paste --type image --watch cliphist store")

    -- Idle daemon & Pyprland daemon
    hl.exec_cmd("hypridle &")
    hl.exec_cmd("pypr &")
end)
