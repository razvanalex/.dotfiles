-- Hyprland Keybindings Configuration
-- Organised by category: Session / Apps / AI / Shell / Accessibility / Window / Workspaces / Media / Hardware / Utilities
-- Categories feed the quickshell cheatsheet (Super + /) via the `description` field of `hyprctl binds -j`.

local vars = require("lua.variables")
local mainMod = vars.mainMod

-- Session (Power & Lock)
hl.bind(mainMod .. " + CTRL + ALT + M", hl.dsp.exec_cmd("hyprctl dispatch exit 0"), { description = "Session: Exit Hyprland" })
hl.bind(mainMod .. " + P", hl.dsp.exec_cmd(vars.scriptsDir .. "/LockScreen.sh"), { description = "Session: Lock screen" })
hl.bind("CTRL + ALT + P", hl.dsp.exec_cmd(vars.scriptsDir .. "/Wlogout.sh"), { description = "Session: Logout (wlogout)" })
hl.bind(mainMod .. " + SHIFT + P", hl.dsp.exec_cmd("sleep 0.1 && systemctl suspend || loginctl suspend"), { description = "Session: Suspend system", locked = true })

-- Apps
hl.bind(mainMod .. " + Return", hl.dsp.exec_cmd(vars.terminal), { description = "Apps: Terminal" })
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(vars.fileManager), { description = "Apps: File manager" })
hl.bind(mainMod .. " + I", hl.dsp.exec_cmd('XDG_CURRENT_DESKTOP="gnome" gnome-control-center'), { description = "Apps: System settings" })
hl.bind("CTRL + " .. mainMod .. " + V", hl.dsp.exec_cmd("pavucontrol"), { description = "Apps: Volume control (pavucontrol)" })
hl.bind("CTRL + SHIFT + Escape", hl.dsp.exec_cmd("gnome-system-monitor"), { description = "Apps: System monitor" })
hl.bind("CTRL + " .. mainMod .. " + C", hl.dsp.exec_cmd(vars.userScripts .. "/VSCode.sh"), { description = "Apps: VS Code" })
hl.bind(mainMod .. " + Grave", hl.dsp.exec_cmd(vars.userScripts .. "/VM.sh"), { description = "Apps: Toggle VM", locked = true })

-- VM Passthrough Submap (disables host binds so Super and shortcuts pass to guest VM)
hl.define_submap("vm", function()
    hl.bind(mainMod .. " + Grave", hl.dsp.exec_cmd(vars.userScripts .. "/VM.sh"), { description = "Apps: Toggle VM", locked = true })
end)

-- AI (dictation, TTS, voice)
hl.bind(mainMod .. " + T", hl.dsp.exec_cmd("/home/razvan/Workspace/ai/tts-read/tts_read.sh"), { description = "AI: Read text aloud (TTS)" })
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd("qs ipc call dictation toggle"), { description = "AI: Start dictation", release = true })
-- Escape closes the dictation panel WITHOUT committing (cancel, like the
-- close button). NON-CONSUMING: the key still reaches the focused app
-- (neovim's normal mode, etc.) -- the dismiss only happens if the panel
-- is open, and neovim keeps receiving Escape either way.
hl.bind("Escape", hl.dsp.exec_cmd("qs ipc call dictation dismiss"), { description = "AI: Dismiss dictation", non_consuming = true })
hl.bind(mainMod .. " + ALT + V", hl.dsp.exec_cmd("/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/ai/quickshell_hermes_service.py voice start"), { description = "AI: Voice assistant" })

-- Shell (Quickshell panels & controls)
hl.bind(mainMod .. " + D", hl.dsp.exec_cmd("qs ipc call search toggle"), { description = "Shell: Launcher (search)" })
hl.bind(mainMod .. " + A", hl.dsp.exec_cmd("qs ipc call search workspacesToggle"), { description = "Shell: Overview (workspaces)" })
hl.bind(mainMod .. " + Slash", hl.dsp.exec_cmd("qs ipc call cheatsheet toggle"), { description = "Shell: Cheatsheet (this panel)" })
hl.bind(mainMod .. " + V", hl.dsp.exec_cmd("qs ipc call search clipboardToggle"), { description = "Shell: Clipboard history" })
hl.bind(mainMod .. " + SHIFT + V", hl.dsp.exec_cmd("qs ipc call search clipboardToggle"), { description = "Shell: Clipboard history" })
hl.bind(mainMod .. " + W", hl.dsp.exec_cmd("qs ipc call wallpaperSelector toggle"), { description = "Shell: Wallpaper selector" })
hl.bind("CTRL + " .. mainMod .. " + W", hl.dsp.exec_cmd("qs ipc call wallpaperSelector openRoot"), { description = "Shell: Wallpaper selector (open root)" })
hl.bind(mainMod .. " + ALT + W", hl.dsp.exec_cmd("qs ipc call wallpapers toggleHidden"), { description = "Shell: Wallpapers (toggle hidden)" })
hl.bind("CTRL + ALT + W", hl.dsp.exec_cmd("qs ipc call wallpapers random"), { description = "Shell: Wallpaper (random)" })
hl.bind(mainMod .. " + C", hl.dsp.exec_cmd("qs ipc call wallpapers setTheme Kitty"), { description = "Shell: Set theme (Kitty)" })
hl.bind("CTRL + " .. mainMod .. " + R", hl.dsp.exec_cmd("systemctl --user restart quickshell.service"), { description = "Shell: Restart quickshell", release = true })
hl.bind(mainMod .. " + ALT + S", hl.dsp.exec_cmd("qs ipc call panelFamily cycle"), { description = "Shell: Cycle skin (Material/Win11)" }) -- Cycle skin (Material <-> Win11)

-- Super Key Hold -> Quickshell Workspace Numbers (bindit equivalent in Lua)
-- (no description: intentionally hidden from the cheatsheet, like upstream)
hl.bind("SUPER_L", hl.dsp.global("quickshell:workspaceNumber"), { transparent = true, non_consuming = true, ignore_mods = true })
hl.bind("SUPER_R", hl.dsp.global("quickshell:workspaceNumber"), { transparent = true, non_consuming = true, ignore_mods = true })

-- Accessibility
-- Native Hyprland Desktop Zoom Toggle (SUPER + Z)
local currentZoom = 1.0
hl.bind(mainMod .. " + Z", function()
    currentZoom = (currentZoom == 1.0) and 2.0 or 1.0
    hl.config({ cursor = { zoom_factor = currentZoom } })
end, { description = "Accessibility: Toggle desktop zoom" })
hl.bind(mainMod .. " + Space", hl.dsp.exec_cmd(vars.scriptsDir .. "/SwitchKeyboardLayout.sh"), { description = "Accessibility: Switch keyboard layout", non_consuming = true })

-- Window (focus, move, resize, groups)
hl.bind(mainMod .. " + left", hl.dsp.focus({ direction = "left" }), { description = "Window: Focus window left" })
hl.bind(mainMod .. " + right", hl.dsp.focus({ direction = "right" }), { description = "Window: Focus window right" })
hl.bind(mainMod .. " + up", hl.dsp.focus({ direction = "up" }), { description = "Window: Focus window up" })
hl.bind(mainMod .. " + down", hl.dsp.focus({ direction = "down" }), { description = "Window: Focus window down" })
hl.bind(mainMod .. " + H", hl.dsp.focus({ direction = "left" }), { description = "Window: Focus window left" })
hl.bind(mainMod .. " + L", hl.dsp.focus({ direction = "right" }), { description = "Window: Focus window right" })
hl.bind(mainMod .. " + K", hl.dsp.focus({ direction = "up" }), { description = "Window: Focus window up" })
hl.bind(mainMod .. " + J", hl.dsp.focus({ direction = "down" }), { description = "Window: Focus window down" })
hl.bind(mainMod .. " + BracketLeft", hl.dsp.focus({ direction = "left" }), { description = "Window: Focus window left" })
hl.bind(mainMod .. " + BracketRight", hl.dsp.focus({ direction = "right" }), { description = "Window: Focus window right" })

hl.bind(mainMod .. " + SHIFT + left", hl.dsp.window.move({ direction = "left" }), { description = "Window: Move window left" })
hl.bind(mainMod .. " + SHIFT + right", hl.dsp.window.move({ direction = "right" }), { description = "Window: Move window right" })
hl.bind(mainMod .. " + SHIFT + up", hl.dsp.window.move({ direction = "up" }), { description = "Window: Move window up" })
hl.bind(mainMod .. " + SHIFT + down", hl.dsp.window.move({ direction = "down" }), { description = "Window: Move window down" })
hl.bind(mainMod .. " + SHIFT + H", hl.dsp.window.move({ direction = "left" }), { description = "Window: Move window left" })
hl.bind(mainMod .. " + SHIFT + L", hl.dsp.window.move({ direction = "right" }), { description = "Window: Move window right" })
hl.bind(mainMod .. " + SHIFT + K", hl.dsp.window.move({ direction = "up" }), { description = "Window: Move window up" })
hl.bind(mainMod .. " + SHIFT + J", hl.dsp.window.move({ direction = "down" }), { description = "Window: Move window down" })

hl.bind(mainMod .. " + Q", hl.dsp.window.close(), { description = "Window: Close window" })
hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.exec_cmd(vars.scriptsDir .. "/KillActiveProcess.sh"), { description = "Window: Kill active process" })
hl.bind(mainMod .. " + SHIFT + ALT + Q", hl.dsp.exec_cmd("hyprctl kill"), { description = "Window: Pick and kill a window" })
hl.bind(mainMod .. " + ALT + Space", hl.dsp.window.float({ action = "toggle" }), { description = "Window: Toggle float" })
hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = "fullscreen", action = "toggle" }), { description = "Window: Toggle fullscreen" })
hl.bind(mainMod .. " + CTRL + F", hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }), { description = "Window: Toggle maximized" })
hl.bind("CTRL + " .. mainMod .. " + Backslash", hl.dsp.window.resize({ x = 1024, y = 768, relative = false }), { description = "Window: Resize window to 1024x768" })

hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(), { description = "Window: Drag window", mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { description = "Window: Resize window", mouse = true })

hl.bind(mainMod .. " + CTRL + left", hl.dsp.window.resize({ x = -50, y = 0, relative = true }), { description = "Window: Shrink window left", repeating = true })
hl.bind(mainMod .. " + CTRL + right", hl.dsp.window.resize({ x = 50, y = 0, relative = true }), { description = "Window: Grow window right", repeating = true })
hl.bind(mainMod .. " + CTRL + up", hl.dsp.window.resize({ x = 0, y = -50, relative = true }), { description = "Window: Shrink window up", repeating = true })
hl.bind(mainMod .. " + CTRL + down", hl.dsp.window.resize({ x = 0, y = 50, relative = true }), { description = "Window: Grow window down", repeating = true })
hl.bind(mainMod .. " + CTRL + H", hl.dsp.window.resize({ x = -50, y = 0, relative = true }), { description = "Window: Shrink window left", repeating = true })
hl.bind(mainMod .. " + CTRL + L", hl.dsp.window.resize({ x = 50, y = 0, relative = true }), { description = "Window: Grow window right", repeating = true })
hl.bind(mainMod .. " + CTRL + K", hl.dsp.window.resize({ x = 0, y = -50, relative = true }), { description = "Window: Shrink window up", repeating = true })
hl.bind(mainMod .. " + CTRL + J", hl.dsp.window.resize({ x = 0, y = 50, relative = true }), { description = "Window: Grow window down", repeating = true })

hl.bind(mainMod .. " + P", hl.dsp.exec_cmd("hyprctl dispatch pin"), { description = "Window: Pin window" })
hl.bind(mainMod .. " + G", hl.dsp.group.toggle(), { description = "Window: Toggle group" })
hl.bind(mainMod .. " + SHIFT + Tab", hl.dsp.group.next(), { description = "Window: Next group" })
hl.bind("ALT + Tab", hl.dsp.window.cycle_next(), { description = "Window: Cycle windows" })
hl.bind("ALT + SHIFT + Tab", hl.dsp.window.cycle_next({ prev = true }), { description = "Window: Cycle windows (backward)" })

-- Workspaces
hl.bind(mainMod .. " + U", hl.dsp.workspace.toggle_special(), { description = "Workspaces: Toggle special workspace" })
hl.bind(mainMod .. " + mouse:275", hl.dsp.workspace.toggle_special(), { description = "Workspaces: Toggle special workspace" })
hl.bind(mainMod .. " + SHIFT + U", hl.dsp.window.move({ workspace = "special", follow = false }), { description = "Workspaces: Move window to special workspace" })

-- Workspaces Navigation & Window Movement (1..10)
for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ workspace = i }), { description = "Workspaces: Focus workspace " .. i })
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }), { description = "Workspaces: Move window to workspace " .. i })
    hl.bind(mainMod .. " + ALT + " .. key, hl.dsp.window.move({ workspace = i, follow = false }), { description = "Workspaces: Move window to workspace " .. i .. " (no follow)" })
    hl.bind("CTRL + " .. mainMod .. " + " .. key, hl.dsp.window.move({ workspace = i, follow = false }), { description = "Workspaces: Move window to workspace " .. i .. " (no follow)" })
end

-- Relative Workspace Switching
hl.bind("CTRL + ALT + right", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind("CTRL + ALT + left", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })
hl.bind("CTRL + ALT + L", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind("CTRL + ALT + H", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind(mainMod .. " + mouse_up", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })
hl.bind("CTRL + ALT + mouse_down", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind("CTRL + ALT + mouse_up", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })
hl.bind(mainMod .. " + Page_Down", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind(mainMod .. " + Page_Up", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })
hl.bind("CTRL + ALT + Page_Down", hl.dsp.focus({ workspace = "+1" }), { description = "Workspaces: Next workspace" })
hl.bind("CTRL + ALT + Page_Up", hl.dsp.focus({ workspace = "-1" }), { description = "Workspaces: Previous workspace" })

-- Move Window to Relative Workspace (Silent & Non-Silent)
hl.bind(mainMod .. " + ALT + L", hl.dsp.window.move({ workspace = "+1", follow = false }), { description = "Workspaces: Move window to next workspace (no follow)" })
hl.bind(mainMod .. " + ALT + H", hl.dsp.window.move({ workspace = "-1", follow = false }), { description = "Workspaces: Move window to previous workspace (no follow)" })
hl.bind(mainMod .. " + ALT + right", hl.dsp.window.move({ workspace = "+1", follow = false }), { description = "Workspaces: Move window to next workspace (no follow)" })
hl.bind(mainMod .. " + ALT + left", hl.dsp.window.move({ workspace = "-1", follow = false }), { description = "Workspaces: Move window to previous workspace (no follow)" })

hl.bind("CTRL + ALT + SHIFT + L", hl.dsp.window.move({ workspace = "+1" }), { description = "Workspaces: Move window to next workspace" })
hl.bind("CTRL + ALT + SHIFT + H", hl.dsp.window.move({ workspace = "-1" }), { description = "Workspaces: Move window to previous workspace" })
hl.bind("CTRL + ALT + SHIFT + right", hl.dsp.window.move({ workspace = "+1" }), { description = "Workspaces: Move window to next workspace" })
hl.bind("CTRL + ALT + SHIFT + left", hl.dsp.window.move({ workspace = "-1" }), { description = "Workspaces: Move window to previous workspace" })
hl.bind("CTRL + ALT + SHIFT + mouse_down", hl.dsp.window.move({ workspace = "-1" }), { description = "Workspaces: Move window to previous workspace" })
hl.bind("CTRL + ALT + SHIFT + mouse_up", hl.dsp.window.move({ workspace = "+1" }), { description = "Workspaces: Move window to next workspace" })

-- Media (player & audio)
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"), { description = "Media: Next track", locked = true })
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"), { description = "Media: Previous track", locked = true })
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"), { description = "Media: Play/pause", locked = true })
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"), { description = "Media: Mute audio", locked = true, repeating = true, ["repeat"] = true })
hl.bind("ALT + XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_SOURCE@ toggle"), { description = "Media: Mute microphone", locked = true, repeating = true, ["repeat"] = true })
hl.bind(mainMod .. " + XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_SOURCE@ toggle"), { description = "Media: Mute microphone", locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { description = "Media: Raise volume", locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"), { description = "Media: Lower volume", locked = true, repeating = true, ["repeat"] = true })
hl.bind(
    "ALT + XF86AudioRaiseVolume",
    hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+"),
    { description = "Media: Raise microphone volume", locked = true, repeating = true, ["repeat"] = true }
)
hl.bind("ALT + XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_SOURCE@ 5%-"), { description = "Media: Lower microphone volume", locked = true, repeating = true, ["repeat"] = true })
hl.bind(
    mainMod .. " + XF86AudioRaiseVolume",
    hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_SOURCE@ 5%+"),
    { description = "Media: Raise microphone volume", locked = true, repeating = true, ["repeat"] = true }
)
hl.bind(
    mainMod .. " + XF86AudioLowerVolume",
    hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_SOURCE@ 5%-"),
    { description = "Media: Lower microphone volume", locked = true, repeating = true, ["repeat"] = true }
)

-- Hardware (brightness)
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("qs ipc call brightness increment"), { description = "Hardware: Increase brightness", locked = true, repeating = true, ["repeat"] = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("qs ipc call brightness decrement"), { description = "Hardware: Decrease brightness", locked = true, repeating = true, ["repeat"] = true })

-- Utilities
hl.bind(mainMod .. " + S", hl.dsp.exec_cmd("qs -p ~/.config/quickshell ipc call region screenshot"), { description = "Shell: Screen snip (region selector)" })
hl.bind("Print", hl.dsp.exec_cmd(vars.scriptsDir .. "/ScreenShot.sh --now"), { description = "Utilities: Screenshot (full, save+copy)" })
hl.bind("SHIFT + Print", hl.dsp.exec_cmd(vars.scriptsDir .. "/ScreenShot.sh --area"), { description = "Utilities: Screenshot region (save+copy)" })
hl.bind("CTRL + Print", hl.dsp.exec_cmd(vars.scriptsDir .. "/ScreenShot.sh --in5"), { description = "Utilities: Screenshot timer 5s" })
hl.bind("CTRL + SHIFT + Print", hl.dsp.exec_cmd(vars.scriptsDir .. "/ScreenShot.sh --in10"), { description = "Utilities: Screenshot timer 10s" })
hl.bind("ALT + Print", hl.dsp.exec_cmd(vars.scriptsDir .. "/ScreenShot.sh --active"), { description = "Utilities: Screenshot active window" })
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.exec_cmd("qs -p ~/.config/quickshell ipc call region edit"), { description = "Shell: Screen snip → edit" })
hl.bind("CTRL + " .. mainMod .. " + S", hl.dsp.exec_cmd("qs -p ~/.config/quickshell ipc call region ocr"), { description = "Shell: Screen snip → copy text (OCR)" })
hl.bind(mainMod .. " + ALT + R", hl.dsp.exec_cmd("qs -p ~/.config/quickshell ipc call region record"), { description = "Shell: Screen record region" })
hl.bind("CTRL + ALT + R", hl.dsp.exec_cmd("qs -p ~/.config/quickshell ipc call region recordWithSound"), { description = "Shell: Screen record region (with sound)" })
hl.bind(mainMod .. " + ALT + F12", hl.dsp.exec_cmd('notify-send "Test notification" "Here\'s a message to test truncation" -a "Shell" -t 5000'), { description = "Utilities: Test notification" })
hl.bind(mainMod .. " + ALT + Equal", hl.dsp.exec_cmd('notify-send "Urgent notification" "<b>Test notification</b>" -u critical'), { description = "Utilities: Urgent test notification" })
