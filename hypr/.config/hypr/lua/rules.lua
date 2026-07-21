-- Hyprland Window & Workspace Rules Configuration

local windowrules = {
    -- Center rules
    "match:class ^(pavucontrol|org.pulseaudio.pavucontrol)$, center on",
    "match:class ^([Ww]hatsapp-for-linux)$, center on",
    "match:class ^([Ff]erdium)$, center on",
    "match:class ([Tt]hunar), match:title (File Operation Progress), center on",
    "match:class ([Tt]hunar), match:title (Confirm to replace files), center on",

    -- Idle Inhibit
    "match:class ^(.*)$, idle_inhibit fullscreen",
    "match:title ^(.*)$, idle_inhibit fullscreen",
    "match:fullscreen 1, idle_inhibit fullscreen",

    -- VM Rules
    "workspace special:vm, match:class ^(virt-viewer)$",
    "border_size 0, match:class ^(virt-viewer)$",
    "rounding 0, match:class ^(virt-viewer)$",
    "no_shortcuts_inhibit on, match:class ^(virt-viewer)$",

    -- Floating Rules
    "match:class ^(org.kde.polkit-kde-authentication-agent-1)$, float on",
    "match:class ([Zz]oom|onedriver|onedriver-launcher), float on",
    "match:class (xdg-desktop-portal-gtk), float on",
    "match:class (org.gnome.Calculator), match:title (Calculator), float on",
    "match:class (code|codium|codium-url-handler|VSCodium), match:title (Add Folder to Workspace), float on",
    "match:class ^(eog)$, float on",
    "match:class ^(pavucontrol|org.pulseaudio.pavucontrol)$, float on",
    "match:class ^(nwg-look|qt5ct|qt6ct|mpv)$, float on",
    "match:class ^(nm-applet|nm-connection-editor|blueman-manager)$, float on",
    "match:class ^(gnome-system-monitor|org.gnome.SystemMonitor)$, float on",
    "match:class ^(evince)$, float on",
    "match:class ^(totem)$, float on",
    "match:class ^(file-roller|org.gnome.FileRoller)$, float on",

    -- Opacity Rules
    "match:class ^(kitty)$, opacity 0.97 1.0",
    "match:class ^(code|VSCode|code-url-handler)$, opacity 1.0 1.0",
    "match:class ^([Ff]irefox|org.mozilla.firefox|[Ff]irefox-esr)$, opacity 1.0 1.0",
    "match:class ^(google-chrome(-beta|-dev|-unstable)?)$, opacity 1.0 1.0",

    -- Size Rules
    "match:class ^(gnome-system-monitor|org.gnome.SystemMonitor)$, size 70% 70%",
    "match:class ^(xdg-desktop-portal-gtk)$, size 70% 70%",
    "match:class ^(file-roller|org.gnome.FileRoller)$, size 60% 70%",

    -- No blur rules
    "match:class ^(kitty)$, no_blur on",
    "match:class ^(code.*)$, no_blur on",

    -- Picture-in-Picture
    "match:title ^(Picture in picture)$, opacity 0.95 0.75",
    "match:title ^(Picture in picture)$, pin on",
    "match:title ^(Picture in picture)$, float on",
    "match:title ^(Picture in picture)$, size 25% 25%",
}

local layerrules = {
    "blur on, match:namespace rofi",
}

return { windowrules = windowrules, layerrules = layerrules }
