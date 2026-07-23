-- Hyprland Environment Variables Configuration
-- See https://wiki.hypr.land/Configuring/Advanced-and-Cool/Environment-variables/

-- Toolkit and Desktop Environment
hl.env("CLUTTER_BACKEND", "wayland")
hl.env("GDK_BACKEND", "wayland,x11")
hl.env("QT_AUTO_SCREEN_SCALE_FACTOR", "1")
hl.env("QT_QPA_PLATFORM", "wayland;xcb")
hl.env("QT_QPA_PLATFORMTHEME", "qt6ct")
hl.env("QT_SCALE_FACTOR", "1")
hl.env("QT_WAYLAND_DISABLE_WINDOWDECORATION", "1")
hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_TYPE", "wayland")
hl.env("ELECTRON_OZONE_PLATFORM_HINT", "auto")

-- Cursor Setup
hl.env("HYPRCURSOR_THEME", "Bibata-Modern-Classic")
hl.env("HYPRCURSOR_SIZE", "24")
hl.env("XCURSOR_THEME", "Bibata-Modern-Classic")
hl.env("XCURSOR_SIZE", "24")
hl.env("CURSOR", "Bibata-Modern-Classic")
hl.env("CURSORTHEME", "Bibata-Modern-Classic")
hl.env("CURSORSIZE", "24")

-- Firefox & Browser Hardware Acceleration
hl.env("MOZ_ENABLE_WAYLAND", "1")
hl.env("MOZ_DISABLE_RDD_SANDBOX", "1")
hl.env("EGL_PLATFORM", "wayland")

-- GPU / DRM Hardware Devices
hl.env("AQ_DRM_DEVICES", "/dev/dri/card1")

-- Application Specific (e.g. Neovim transparent background)
hl.env("TRANSPARENT", "true")
