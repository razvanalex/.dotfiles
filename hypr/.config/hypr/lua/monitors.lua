-- Hyprland Monitors Configuration
-- See https://wiki.hypr.land/Configuring/Monitors/
-- Configure display resolution, offset, scale and color depth here (use `hyprctl monitors` for details).

-- Primary Monitor
hl.monitor({
    output   = "",
    mode     = "preferred",
    position = "auto",
    scale    = 1,
    vrr      = 1,
    bitdepth = 10,
    cm       = "srgb",
})

-- Headless Monitor / Display Output
hl.monitor({
    output   = "HEADLESS-2",
    mode     = "2560x1600@60",
    position = "auto",
    scale    = 1.25,
})
