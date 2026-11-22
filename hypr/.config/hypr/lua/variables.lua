-- Hyprland Variables Module

local M = {}

M.home = os.getenv("HOME") or "/home/razvan"
M.mainMod = "SUPER"
M.scriptsDir = M.home .. "/.config/hypr/scripts"
M.terminal = "kitty"
M.fileManager = "nautilus --new-window"

return M
