#!/bin/bash
# dictation commit paste v4: logging + longer restore delay
# Inherit env from the caller (quickshell has these). NOT hardcoded: the
# Hyprland instance signature changes on every compositor restart, and a stale
# one breaks hyprctl/wtype below.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
LOG=/tmp/paste_script.log
echo "=== $(date +%H:%M:%S) start" >> $LOG
if [ ! -s /tmp/dict_commit.txt ]; then echo "no text" >> $LOG; exit 0; fi
esc=$(cat /tmp/dict_commit.txt)
echo "text: [$esc]" >> $LOG
old=$(timeout 2 wl-paste 2>/dev/null)
echo "old: [${old:0:30}]" >> $LOG
printf '%s' "$esc" | wl-copy --type text/plain

for i in 1 2 3 4 5 6 7 8 9 10; do
  cur=$(timeout 1 wl-paste 2>/dev/null)
  if [ "$cur" = "$esc" ]; then echo "clipboard ready after ${i} polls" >> $LOG; break; fi
  sleep 0.1
done
cur=$(timeout 1 wl-paste 2>/dev/null)
echo "final clip: [${cur:0:30}] match=$([ "$cur" = "$esc" ] && echo YES || echo NO)" >> $LOG

cls=$(hyprctl -j activewindow 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('class',''))" 2>/dev/null)
echo "cls: [$cls]" >> $LOG
case "$cls" in
  kitty|foot|alacritty|wezterm|ghostty|konsole|gnome-terminal|xfce4-terminal)
    echo "branch TERMINAL" >> $LOG
    timeout 5 wtype -M ctrl -M alt -k v -m ctrl -m alt; echo "wtype rc=$? (timeout would be 124)" >> $LOG ;;
  *)
    echo "branch GUI" >> $LOG
    timeout 5 wtype -M ctrl -k v -m ctrl; echo "wtype rc=$? (timeout would be 124)" >> $LOG ;;
esac
# LONG restore delay: the focused app reads the clipboard ASYNCHRONOUSLY
# after the paste key (esp. TUIs and flatpaks). Restoring too early wipes the
# text before the app reads it -> intermittent "nothing pasted". 3s is
# invisible to the user but covers slow readers.
sleep 3
if [ -n "$old" ]; then printf '%s' "$old" | wl-copy --type text/plain 2>/dev/null; echo "restored" >> $LOG; else wl-copy -c 2>/dev/null || true; echo "cleared" >> $LOG; fi
echo "done" >> $LOG
exit 0
