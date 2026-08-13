#!/bin/bash
# dictation commit paste v3: waits for the clipboard to be READY before pasting
export HYPRLAND_INSTANCE_SIGNATURE=efb50993780079460b0cbed1363e2166a2de1d9f_1786321502_1019612100
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-1
LOG=/tmp/paste_script.log
if [ ! -s /tmp/dict_commit.txt ]; then exit 0; fi
esc=$(cat /tmp/dict_commit.txt)
old=$(timeout 2 wl-paste 2>/dev/null)
printf '%s' "$esc" | wl-copy --type text/plain

# WAIT until the clipboard actually contains our text (wl-copy may fork/register
# asynchronously). Poll up to 2s; only paste when verified -- this kills the
# "sometimes works, sometimes doesn't" race.
for i in 1 2 3 4 5 6 7 8 9 10; do
  cur=$(timeout 1 wl-paste 2>/dev/null)
  if [ "$cur" = "$esc" ]; then break; fi
  sleep 0.1
done

cls=$(hyprctl -j activewindow 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('class',''))" 2>/dev/null)
case "$cls" in
  kitty|foot|alacritty|wezterm|ghostty|konsole|gnome-terminal|xfce4-terminal)
    wtype -M ctrl -M alt -k v -m ctrl -m alt ;;
  *)
    wtype -M ctrl -k v -m ctrl ;;
esac
sleep 0.15
if [ -n "$old" ]; then printf '%s' "$old" | wl-copy --type text/plain 2>/dev/null; else wl-copy -c 2>/dev/null || true; fi
exit 0
