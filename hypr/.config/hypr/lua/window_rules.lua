-- Hyprland Window & Layer Rules Configuration
-- See https://wiki.hypr.land/Configuring/Window-Rules/

-- Centered Windows
hl.window_rule({
    name = "center-pavucontrol",
    match = { class = "^(pavucontrol|org.pulseaudio.pavucontrol)$" },
    center = true,
})

hl.window_rule({
    name = "center-whatsapp",
    match = { class = "^([Ww]hatsapp-for-linux)$" },
    center = true,
})

hl.window_rule({
    name = "center-ferdium",
    match = { class = "^([Ff]erdium)$" },
    center = true,
})

hl.window_rule({
    name = "center-thunar-progress",
    match = { class = "([Tt]hunar)", title = "(File Operation Progress)" },
    center = true,
})

hl.window_rule({
    name = "center-thunar-confirm",
    match = { class = "([Tt]hunar)", title = "(Confirm to replace files)" },
    center = true,
})

hl.window_rule({
    name = "center-wallpaper-selection",
    match = { title = "^(Wallpaper Selection)$" },
    center = true,
    float = true,
})

hl.window_rule({
    name = "center-theme-selection",
    match = { title = "^(Theme Selection)$" },
    center = true,
    float = true,
})

-- Screenshot annotation editor (satty): floats centered over the screen,
-- like Omarchy's screenshot flow
hl.window_rule({
    name = "center-satty",
    match = { class = "^(com.gabm.satty)$" },
    center = true,
    float = true,
})

-- Idle Inhibit
hl.window_rule({
    name = "idle-inhibit-class",
    match = { class = "^(.*)$" },
    idle_inhibit = "fullscreen",
})

hl.window_rule({
    name = "idle-inhibit-title",
    match = { title = "^(.*)$" },
    idle_inhibit = "fullscreen",
})

hl.window_rule({
    name = "idle-inhibit-fullscreen",
    match = { fullscreen = true },
    idle_inhibit = "fullscreen",
})

-- Virtual Machine (virt-viewer) Rules
hl.window_rule({
    name = "vm-workspace",
    match = { class = "^(virt-viewer)$" },
    workspace = "special:vm",
    border_size = 0,
    rounding = 0,
    no_shortcuts_inhibit = true,
})

-- Floating Windows
hl.window_rule({ name = "float-polkit", match = { class = "^(org.kde.polkit-kde-authentication-agent-1)$" }, float = true })
hl.window_rule({ name = "float-zoom-onedrive", match = { class = "([Zz]oom|onedriver|onedriver-launcher)" }, float = true })
hl.window_rule({ name = "float-thunar-progress", match = { class = "([Tt]hunar)", title = "(File Operation Progress)" }, float = true })
hl.window_rule({ name = "float-thunar-confirm", match = { class = "([Tt]hunar)", title = "(Confirm to replace files)" }, float = true })
hl.window_rule({ name = "float-portal-gtk", match = { class = "(xdg-desktop-portal-gtk)" }, float = true })
hl.window_rule({ name = "float-calculator", match = { class = "(org.gnome.Calculator)", title = "(Calculator)" }, float = true })

-- STT dictate mic indicator: floating, never takes focus (layershell panel;
-- position is handled by the PanelWindow's own anchors/margins)
hl.window_rule({
    name = "stt-dictate-indicator",
    match = { title = "^(stt_dictate)$" },
    float = true,
    no_initial_focus = true,
    no_focus = true,
    no_follow_mouse = true,
    no_shadow = true,
})
hl.window_rule({ name = "float-code-add-folder", match = { class = "(code|codium|codium-url-handler|VSCodium)", title = "(Add Folder to Workspace)" }, float = true })
hl.window_rule({ name = "float-code-download", match = { class = "(code|codium|codium-url-handler|VSCodium)", title = "(Choose Where to Download)" }, float = true })
hl.window_rule({ name = "float-rofi", match = { class = "^([Rr]ofi)$" }, float = true })
hl.window_rule({ name = "float-eog", match = { class = "^(eog)$" }, float = true })
hl.window_rule({ name = "float-pavucontrol", match = { class = "^(pavucontrol|org.pulseaudio.pavucontrol)$" }, float = true })
hl.window_rule({ name = "float-qt-mpv", match = { class = "^(nwg-look|qt5ct|qt6ct|mpv)$" }, float = true })
hl.window_rule({ name = "float-applets", match = { class = "^(nm-applet|nm-connection-editor|blueman-manager)$" }, float = true })
hl.window_rule({ name = "float-system-monitor", match = { class = "^(gnome-system-monitor|org.gnome.SystemMonitor)$" }, float = true })
hl.window_rule({ name = "float-yad", match = { class = "^(yad)$" }, float = true })
hl.window_rule({ name = "float-wihotspot", match = { class = "^(wihotspot-gui)$" }, float = true })
hl.window_rule({ name = "float-evince", match = { class = "^(evince)$" }, float = true })
hl.window_rule({ name = "float-totem", match = { class = "^(totem)$" }, float = true })
hl.window_rule({ name = "float-file-roller", match = { class = "^(file-roller|org.gnome.FileRoller)$" }, float = true })
hl.window_rule({ name = "float-kvantum", match = { title = "(Kvantum Manager)" }, float = true })
hl.window_rule({ name = "float-steam-dialogs", match = { class = "^([Ss]team)$", title = "^(Steam Settings|Friends List|Settings|.+)$" }, float = true })
hl.window_rule({ name = "float-qalculate", match = { class = "^([Qq]alculate-gtk)$" }, float = true })
hl.window_rule({ name = "float-ferdium", match = { class = "^([Ff]erdium)$" }, float = true })

-- Opacity Rules
hl.window_rule({ name = "opacity-rofi", match = { class = "^([Rr]ofi)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-brave", match = { class = "^(Brave-browser(-beta|-dev)?)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-firefox", match = { class = "^([Ff]irefox|org.mozilla.firefox|[Ff]irefox-esr)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-thorium", match = { class = "^([Tt]horium-browser)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-edge", match = { class = "^([Mm]icrosoft-edge(-stable|-beta|-dev|-unstable)?)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-chrome", match = { class = "^(google-chrome(-beta|-dev|-unstable)?)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-chrome-pwa", match = { class = "^(chrome-.+-Default)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-thunar", match = { class = "^([Tt]hunar)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-pcmanfm", match = { class = "^(pcmanfm-qt)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-text-editor", match = { class = "^(gedit|org.gnome.TextEditor)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-deluge", match = { class = "^(deluge)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-alacritty", match = { class = "^(Alacritty)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-kitty", match = { class = "^(kitty)$" }, opacity = 0.97, no_blur = true })
hl.window_rule({ name = "opacity-mousepad", match = { class = "^(mousepad)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-qt-look", match = { class = "^(nwg-look|qt5ct|qt6ct|yad)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-kvantum", match = { title = "(Kvantum Manager)" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-obs", match = { class = "^(com.obsproject.Studio)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-audacious", match = { class = "^([Aa]udacious)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-gnome-apps", match = { class = "^(org.gnome..+)" }, opacity = 0.9 })
hl.window_rule({ name = "opacity-gnome-generic", match = { class = "^(.+gnome.+)" }, opacity = 0.9 })
hl.window_rule({ name = "opacity-vscode", match = { class = "^(code|VSCode|code-url-handler)$" }, opacity = 1.0, no_blur = true })
hl.window_rule({ name = "opacity-gnome-utilities", match = { class = "^(gnome-disks|evince|wihotspot-gui|org.gnome.baobab)$" }, opacity = 0.9 })
hl.window_rule({ name = "opacity-file-roller", match = { class = "^(file-roller|org.gnome.FileRoller)$" }, opacity = 0.9 })
hl.window_rule({ name = "opacity-portal-gtk", match = { class = "^(xdg-desktop-portal-gtk)$" }, opacity = 0.9 })
hl.window_rule({ name = "opacity-seahorse", match = { class = "^(seahorse)$" }, opacity = 1.0 })
hl.window_rule({ name = "opacity-whatsapp", match = { class = "^([Ww]hatsapp-for-linux)$" }, opacity = 1.0 })
hl.window_rule({ name = "no-blur-neovide", match = { class = "^(neovide)$" }, no_blur = true })

-- Size Rules
hl.window_rule({ name = "size-system-monitor", match = { class = "^(gnome-system-monitor|org.gnome.SystemMonitor)$" }, size = "70% 70%" })
hl.window_rule({ name = "size-portal-gtk", match = { class = "^(xdg-desktop-portal-gtk)$" }, size = "70% 70%" })
hl.window_rule({ name = "size-kvantum", match = { title = "(Kvantum Manager)" }, size = "60% 70%" })
hl.window_rule({ name = "size-qt6ct", match = { class = "^(qt6ct)$" }, size = "60% 70%" })
hl.window_rule({ name = "size-evince-wihotspot", match = { class = "^(evince|wihotspot-gui)$" }, size = "70% 70%" })
hl.window_rule({ name = "size-file-roller", match = { class = "^(file-roller|org.gnome.FileRoller)$" }, size = "60% 70%" })
hl.window_rule({ name = "size-whatsapp", match = { class = "^([Ww]hatsapp-for-linux)$" }, size = "60% 70%" })
hl.window_rule({ name = "size-ferdium", match = { class = "^([Ff]erdium)$" }, size = "60% 70%" })

-- Picture-in-Picture (PIP) Video Rules
hl.window_rule({
    name = "pip-video",
    match = { title = "^(Picture in picture)$" },
    opacity = 0.95,
    pin = true,
    float = true,
    size = "25% 25%",
    move = "(monitor_w-window_w-15) 50",
})

-- Layer Rules
hl.layer_rule({
    name = "blur-rofi",
    match = { namespace = "rofi" },
    blur = true,
})
