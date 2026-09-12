-- Hyprland Settings Configuration (Layout, Input, Animations, Decoration, Gestures)
-- See https://wiki.hypr.land/Configuring/Variables/

hl.config({
    general = {
        border_size = 2,
        gaps_in = 4,
        gaps_out = 5,
        gaps_workspaces = 50,
        resize_on_border = true,
        col = {
            active_border = { colors = { "rgba(a0a0a0ee)", "rgba(606060ee)" }, angle = 45 },
            inactive_border = "rgba(2a2a2aaa)",
        },
        layout = "dwindle",
        allow_tearing = false,
        snap = {
            enabled = true,
            window_gap = 4,
            monitor_gap = 5,
            respect_gaps = true,
        },
    },
    dwindle = {
        preserve_split = true,
    },
    master = {
        new_status = "master",
        new_on_top = 1,
        mfact = 0.5,
    },
    decoration = {
        rounding = 18,
        rounding_power = 2.5,
        active_opacity = 1.0,
        inactive_opacity = 0.9,
        fullscreen_opacity = 1.0,
        dim_inactive = true,
        dim_strength = 0.1,
        dim_special = 0.8,
        shadow = { enabled = false },
        blur = {
            enabled = true,
            size = 3,
            passes = 3,
            ignore_opacity = true,
            new_optimizations = true,
            special = true,
        },
    },
    animations = {
        enabled = true,
    },
    input = {
        kb_layout = "ro,us",
        repeat_rate = 50,
        repeat_delay = 300,
        numlock_by_default = true,
        left_handed = false,
        follow_mouse = true,
        float_switch_override_focus = false,
        scroll_factor = 5.0,
        touchpad = {
            disable_while_typing = true,
            natural_scroll = true,
            clickfinger_behavior = true,
            middle_button_emulation = false,
            tap_to_click = true,
            drag_lock = false,
        },
        touchdevice = { enabled = true },
        tablet = { transform = 0, left_handed = 0 },
    },
    gestures = {
        workspace_swipe_distance = 300,
        workspace_swipe_cancel_ratio = 0.5,
        workspace_swipe_min_speed_to_force = 30,
        workspace_swipe_direction_lock = true,
        workspace_swipe_direction_lock_threshold = 10,
        workspace_swipe_create_new = true,
    },
    group = {
        col = {
            border_active = "rgba(a0a0a0ee)",
        },
        groupbar = {
            col = {
                active = "rgba(a0a0a0ee)",
            },
        },
    },
    misc = {
        disable_hyprland_logo = true,
        disable_splash_rendering = true,
        mouse_move_enables_dpms = true,
        enable_swallow = true,
        swallow_regex = "^(kitty)$",
        focus_on_activate = true,
        initial_workspace_tracking = 0,
        middle_click_paste = false,
        allow_session_lock_restore = true,
    },
    binds = {
        workspace_back_and_forth = true,
        allow_workspace_cycles = true,
        pass_mouse_when_bound = false,
        scroll_event_delay = 0,
        hide_special_on_workspace_change = true,
    },
    xwayland = { force_zero_scaling = true },
    cursor = {
        no_hardware_cursors = false,
        enable_hyprcursor = true,
        warp_on_change_workspace = true,
    },
    debug = { disable_logs = false },
})

-- Animation Curves (from old Settings.conf)
hl.curve("myBezier", { type = "bezier", points = { { 0.0, 1.0 }, { 0.0, 1.0 } } })

-- Animations (from old Settings.conf, using official hl.animation leaf field)
hl.animation({ leaf = "windows", enabled = true, speed = 5, bezier = "myBezier" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 5, bezier = "default", style = "popin 80%" })
hl.animation({ leaf = "border", enabled = true, speed = 5, bezier = "default" })
hl.animation({ leaf = "borderangle", enabled = true, speed = 5, bezier = "default" })
hl.animation({ leaf = "fade", enabled = true, speed = 5, bezier = "default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 3, bezier = "default" })
hl.animation({ leaf = "zoomFactor", enabled = true, speed = 1.5, bezier = "default" })

-- Touchpad & Screen Gestures (Official Hyprland v0.55+ API using `mods` field)
hl.gesture({
    fingers = 3,
    direction = "horizontal",
    action = "workspace",
})

hl.gesture({
    fingers = 3,
    direction = "up",
    mods = "ALT",
    action = "float",
})

hl.gesture({
    fingers = 3,
    direction = "down",
    mods = "ALT",
    action = "float",
})

hl.gesture({
    fingers = 3,
    direction = "up",
    mods = "SUPER",
    action = "fullscreen",
})

hl.gesture({
    fingers = 3,
    direction = "down",
    mods = "SUPER",
    action = "fullscreen",
})
hl.gesture({
    fingers = 3,
    direction = "up",
    action = function()
        hl.dispatch(hl.dsp.global("quickshell:overviewWorkspacesToggle"))
    end,
})
hl.gesture({
    fingers = 3,
    direction = "down",
    action = function()
        hl.dispatch(hl.dsp.global("quickshell:overviewWorkspacesToggle"))
    end,
})
