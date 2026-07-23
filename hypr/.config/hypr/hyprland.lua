-- Hyprland Native Lua Entrypoint (v0.55+)
-- ~/.config/hypr/hyprland.lua

local env = require("lua.env")
local monitors = require("lua.monitors")
local autostart_data = require("lua.autostart")
local settings = require("lua.settings")
local keybinds = require("lua.keybinds")
local rules = require("lua.rules")

-- Apply configurations via native Hyprland hl API if available
if hl then
    -- Register Autostart Commands & Submaps
    hl.on("hyprland.start", function()
        for _, cmd in ipairs(autostart_data.autostart) do
            hl.exec_cmd(cmd)
        end

        -- Register VM submap for keyboard forwarding
        local vm_script = os.getenv("HOME") .. "/.config/hypr/UserScripts/VM.sh"
        hl.exec_cmd("hyprctl keyword submap vm && hyprctl keyword bind 'SUPER, Grave, exec, " .. vm_script .. "' && hyprctl keyword submap reset")
    end)

    -- Register Keybindings
    for _, b in ipairs(keybinds) do
        local mod = b.mods or ""
        local key = b.key or ""
        local combo = (mod ~= "" and mod .. " + " .. key) or key
        hl.bind(combo, function()
            hl.exec_cmd(b.cmd)
        end)
    end
end
