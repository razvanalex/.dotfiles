-- Per-device pointer tuning; the global multiplier is input.scroll_factor in settings.lua.
-- Live equivalent: hyprctl eval 'hl.device({ name = "<name>", scroll_factor = <value> })'

-- G502 wireless: a click is 1/8 of a notch (HID++ 2121 "Multiplier: 8"), so 8.0 makes it one.
-- Only correct together with libinput/local-overrides.quirks, which stops libinput pairing clicks.
hl.device({ name = "logitech-g502-x-plus-1", scroll_factor = 8.0 })

-- Sunshine's virtual pointer; absent when not streaming.
hl.device({ name = "mouse-passthrough", scroll_factor = 1.67 })
