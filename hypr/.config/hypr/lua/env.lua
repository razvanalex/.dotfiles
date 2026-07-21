-- Hyprland Environment Variables Configuration

local env = {
    CLUTTER_BACKEND = "wayland",
    GDK_BACKEND = "wayland,x11",
    QT_AUTO_SCREEN_SCALE_FACTOR = "1",
    QT_QPA_PLATFORM = "wayland;xcb",
    QT_QPA_PLATFORMTHEME = "qt6ct",
    QT_SCALE_FACTOR = "1",
    QT_WAYLAND_DISABLE_WINDOWDECORATION = "1",
    XDG_CURRENT_DESKTOP = "Hyprland",
    XDG_SESSION_DESKTOP = "Hyprland",
    XDG_SESSION_TYPE = "wayland",
    ELECTRON_OZONE_PLATFORM_HINT = "auto",
    MOZ_ENABLE_WAYLAND = "1",
    MOZ_DISABLE_RDD_SANDBOX = "1",
    EGL_PLATFORM = "wayland",
    TRANSPARENT = "true",

    -- Cursor setup
    HYPRCURSOR_THEME = "Bibata-Modern-Classic",
    HYPRCURSOR_SIZE = "24",
    XCURSOR_THEME = "Bibata-Modern-Classic",
    XCURSOR_SIZE = "24",
    CURSOR = "Bibata-Modern-Classic",
    CURSORTHEME = "Bibata-Modern-Classic",
    CURSORSIZE = "24",

    -- GPU / Hardware Acceleration
    AQ_DRM_DEVICES = "/dev/dri/card1",
}

return env
