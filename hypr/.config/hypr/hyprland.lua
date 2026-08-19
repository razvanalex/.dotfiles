-- Hyprland Native Lua Entrypoint (v0.55+)
-- ~/.config/hypr/hyprland.lua

for k in pairs(package.loaded) do
    if k:match("^lua%.") then
        package.loaded[k] = nil
    end
end

require("lua.variables")
require("lua.env")
require("lua.monitors")
require("lua.settings")
require("lua.window_rules")
require("lua.workspace_rules")
require("lua.keybinds")
require("lua.autostart")
