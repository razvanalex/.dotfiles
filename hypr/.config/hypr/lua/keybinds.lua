-- Hyprland Keybindings Configuration

local vars = require("lua.variables")
local mainMod = vars.mainMod

-- Actions & Session
hl.bind(mainMod .. " + S", hl.dsp.exec_cmd("grimblast --freeze copy area"))
hl.bind(mainMod .. " + CTRL + ALT + M", hl.dsp.exec_cmd("hyprctl dispatch exit 0"))
hl.bind(mainMod .. " + P", hl.dsp.exec_cmd(vars.scriptsDir .. "/LockScreen.sh"))
hl.bind("CTRL + ALT + P", hl.dsp.exec_cmd(vars.scriptsDir .. "/Wlogout.sh"))
hl.bind(mainMod .. " + SHIFT + P", hl.dsp.exec_cmd("sleep 0.1 && systemctl suspend || loginctl suspend"), { locked = true })

-- Applications & Tools
hl.bind(mainMod .. " + Return", hl.dsp.exec_cmd(vars.terminal))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(vars.fileManager))
hl.bind(mainMod .. " + I", hl.dsp.exec_cmd('XDG_CURRENT_DESKTOP="gnome" gnome-control-center'))
hl.bind("CTRL + " .. mainMod .. " + V", hl.dsp.exec_cmd("pavucontrol"))
hl.bind("CTRL + SHIFT + Escape", hl.dsp.exec_cmd("gnome-system-monitor"))

-- Native Hyprland Desktop Zoom Toggle (SUPER + Z)
local currentZoom = 1.0
hl.bind(mainMod .. " + Z", function()
    if currentZoom == 1.0 then
        currentZoom = 2.0
    else
        currentZoom = 1.0
    end
    hl.config({ cursor = { zoom_factor = currentZoom } })
end)

hl.bind(mainMod .. " + Space", hl.dsp.exec_cmd(vars.scriptsDir .. "/SwitchKeyboardLayout.sh"), { non_consuming = true })
hl.bind(mainMod .. " + Grave", hl.dsp.exec_cmd(vars.userScripts .. "/VM.sh"), { locked = true })
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd("/home/razvan/Workspace/ai/tts-read/tts_read.sh"))
hl.bind(mainMod .. " + T", hl.dsp.exec_cmd("qs ipc call dictation toggle"))
-- dictation commit fires on SUPER release (not T release): the user may
-- hold Super after releasing T, and the paste key must wait until Super
-- is fully up (Super+ctrl+v would fire pavucontrol). The handler checks
-- commitArmed, so this only commits when dictation is open + armed.
hl.bind("SUPER + SUPER_L", hl.dsp.exec_cmd("qs ipc call dictation release"), { release = true })
hl.bind("CTRL + " .. mainMod .. " + C", hl.dsp.exec_cmd(vars.userScripts .. "/VSCode.sh"))

-- Launchers & Quickshell Controls
hl.bind(mainMod .. " + D", hl.dsp.exec_cmd("qs ipc call search toggle"))
hl.bind(mainMod .. " + A", hl.dsp.exec_cmd("qs ipc call search workspacesToggle"))
hl.bind(mainMod .. " + Slash", hl.dsp.exec_cmd("qs ipc call cheatsheet toggle"))
hl.bind(mainMod .. " + V", hl.dsp.exec_cmd("qs ipc call search clipboardToggle"))
hl.bind(mainMod .. " + SHIFT + V", hl.dsp.exec_cmd("qs ipc call search clipboardToggle"))
hl.bind(mainMod .. " + ALT + V", hl.dsp.exec_cmd("/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/ai/quickshell_hermes_service.py voice start"))
hl.bind(mainMod .. " + W", hl.dsp.exec_cmd("qs ipc call wallpaperSelector toggle"))
hl.bind("CTRL + " .. mainMod .. " + W", hl.dsp.exec_cmd("qs ipc call wallpaperSelector openRoot"))
hl.bind(mainMod .. " + ALT + W", hl.dsp.exec_cmd("qs ipc call wallpapers toggleHidden"))
hl.bind("CTRL + ALT + W", hl.dsp.exec_cmd("qs ipc call wallpapers random"))
hl.bind(mainMod .. " + C", hl.dsp.exec_cmd("qs ipc call wallpapers setTheme Kitty"))
hl.bind("CTRL + " .. mainMod .. " + R", hl.dsp.exec_cmd("systemctl --user restart quickshell.service"), { release = true })
hl.bind(mainMod .. " + ALT + S", hl.dsp.exec_cmd("qs ipc call panelFamily cycle")) -- Cycle skin (Material <-> Win11)

-- Super Key Hold -> Quickshell Workspace Numbers (bindit equivalent in Lua)
hl.bind("Super_L", hl.dsp.global("quickshell:workspaceNumber"), { transparent = true, non_consuming = true, ignore_mods = true })
hl.bind("Super_R", hl.dsp.global("quickshell:workspaceNumber"), { transparent = true, non_consuming = true, ignore_mods = true })

-- Directional Focus
hl.bind(mainMod .. " + left", hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + right", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + up", hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + down", hl.dsp.focus({ direction = "down" }))
hl.bind(mainMod .. " + H", hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + L", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + K", hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + J", hl.dsp.focus({ direction = "down" }))
hl.bind(mainMod .. " + BracketLeft", hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + BracketRight", hl.dsp.focus({ direction = "right" }))

-- Window Movement & Actions
hl.bind(mainMod .. " + SHIFT + left", hl.dsp.window.move({ direction = "left" }))
hl.bind(mainMod .. " + SHIFT + right", hl.dsp.window.move({ direction = "right" }))
hl.bind(mainMod .. " + SHIFT + up", hl.dsp.window.move({ direction = "up" }))
hl.bind(mainMod .. " + SHIFT + down", hl.dsp.window.move({ direction = "down" }))
hl.bind(mainMod .. " + SHIFT + H", hl.dsp.window.move({ direction = "left" }))
hl.bind(mainMod .. " + SHIFT + L", hl.dsp.window.move({ direction = "right" }))
hl.bind(mainMod .. " + SHIFT + K", hl.dsp.window.move({ direction = "up" }))
hl.bind(mainMod .. " + SHIFT + J", hl.dsp.window.move({ direction = "down" }))

hl.bind(mainMod .. " + Q", hl.dsp.window.close())
hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.exec_cmd(vars.scriptsDir .. "/KillActiveProcess.sh"))
hl.bind(mainMod .. " + SHIFT + ALT + Q", hl.dsp.exec_cmd("hyprctl kill"))
hl.bind(mainMod .. " + ALT + Space", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = "fullscreen", action = "toggle" }))
hl.bind(mainMod .. " + CTRL + F", hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }))
hl.bind("CTRL + " .. mainMod .. " + Backslash", hl.dsp.window.resize({ x = 1024, y = 768, relative = false }))

-- Mouse Binds (Dragging & Resizing)
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Active Window Resizing (Repeating)
hl.bind(mainMod .. " + CTRL + left", hl.dsp.window.resize({ x = -50, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + right", hl.dsp.window.resize({ x = 50, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + up", hl.dsp.window.resize({ x = 0, y = -50, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + down", hl.dsp.window.resize({ x = 0, y = 50, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + H", hl.dsp.window.resize({ x = -50, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + L", hl.dsp.window.resize({ x = 50, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + K", hl.dsp.window.resize({ x = 0, y = -50, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + J", hl.dsp.window.resize({ x = 0, y = 50, relative = true }), { repeating = true })

-- Window Pinning & Groups & Cycling
hl.bind(mainMod .. " + P", hl.dsp.exec_cmd("hyprctl dispatch pin"))
hl.bind(mainMod .. " + G", hl.dsp.group.toggle())
hl.bind(mainMod .. " + SHIFT + Tab", hl.dsp.group.next())

-- Cycle Window Focus (ALT + Tab / ALT + SHIFT + Tab)
hl.bind("ALT + Tab", hl.dsp.window.cycle_next())
hl.bind("ALT + SHIFT + Tab", hl.dsp.window.cycle_next({ prev = true }))

-- Special Workspace
hl.bind(mainMod .. " + U", hl.dsp.workspace.toggle_special())
hl.bind(mainMod .. " + mouse:275", hl.dsp.workspace.toggle_special())
hl.bind(mainMod .. " + SHIFT + U", hl.dsp.window.move({ workspace = "special", follow = false }))

-- Workspaces Navigation & Window Movement (1..10)
for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
    hl.bind(mainMod .. " + ALT + " .. key, hl.dsp.window.move({ workspace = i, follow = false }))
    hl.bind("CTRL + " .. mainMod .. " + " .. key, hl.dsp.window.move({ workspace = i, follow = false }))
end

-- Relative Workspace Switching
hl.bind("CTRL + ALT + right", hl.dsp.focus({ workspace = "+1" }))
hl.bind("CTRL + ALT + left", hl.dsp.focus({ workspace = "-1" }))
hl.bind("CTRL + ALT + L", hl.dsp.focus({ workspace = "+1" }))
hl.bind("CTRL + ALT + H", hl.dsp.focus({ workspace = "-1" }))
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "+1" }))
hl.bind(mainMod .. " + mouse_up", hl.dsp.focus({ workspace = "-1" }))
hl.bind("CTRL + ALT + mouse_down", hl.dsp.focus({ workspace = "+1" }))
hl.bind("CTRL + ALT + mouse_up", hl.dsp.focus({ workspace = "-1" }))
hl.bind(mainMod .. " + Page_Down", hl.dsp.focus({ workspace = "+1" }))
hl.bind(mainMod .. " + Page_Up", hl.dsp.focus({ workspace = "-1" }))
hl.bind("CTRL + ALT + Page_Down", hl.dsp.focus({ workspace = "+1" }))
hl.bind("CTRL + ALT + Page_Up", hl.dsp.focus({ workspace = "+1" }))

-- Move Window to Relative Workspace (Silent & Non-Silent)
hl.bind(mainMod .. " + ALT + L", hl.dsp.window.move({ workspace = "+1", follow = false }))
hl.bind(mainMod .. " + ALT + H", hl.dsp.window.move({ workspace = "-1", follow = false }))
hl.bind(mainMod .. " + ALT + right", hl.dsp.window.move({ workspace = "+1", follow = false }))
hl.bind(mainMod .. " + ALT + left", hl.dsp.window.move({ workspace = "-1", follow = false }))

hl.bind("CTRL + ALT + SHIFT + L", hl.dsp.window.move({ workspace = "+1" }))
hl.bind("CTRL + ALT + SHIFT + H", hl.dsp.window.move({ workspace = "-1" }))
hl.bind("CTRL + ALT + SHIFT + right", hl.dsp.window.move({ workspace = "+1" }))
hl.bind("CTRL + ALT + SHIFT + left", hl.dsp.window.move({ workspace = "-1" }))
hl.bind("CTRL + ALT + SHIFT + mouse_down", hl.dsp.window.move({ workspace = "-1" }))
hl.bind("CTRL + ALT + SHIFT + mouse_up", hl.dsp.window.move({ workspace = "+1" }))

-- Notifications & Debug Tests
hl.bind(mainMod .. " + ALT + F12", hl.dsp.exec_cmd('notify-send "Test notification" "Here\'s a message to test truncation" -a "Shell" -t 5000'))
hl.bind(mainMod .. " + ALT + Equal", hl.dsp.exec_cmd('notify-send "Urgent notification" "<b>Test notification</b>" -u critical'))

-- Multimedia / Hardware Controls
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"), { locked = true })
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"), { locked = true })
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("ALT + XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_SOURCE@ toggle"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind(mainMod .. " + XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_SOURCE@ toggle"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("ALT + XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("ALT + XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_SOURCE@ 5%-"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind(mainMod .. " + XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind(mainMod .. " + XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_SOURCE@ 5%-"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("qs ipc call brightness increment"), { locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("qs ipc call brightness decrement"), { locked = true, repeating = true, ["repeat"] = true })
