#!/bin/bash
# dictation commit paste v4: logging + longer restore delay
# M7: serialize via flock -- two commits <3s apart must not race the
# clipboard restore. WAIT UP TO 8s for the lock (a normal commit holds it
# ~4s: paste + 3s restore), then skip with a log line rather than blocking
# forever behind a stale holder.
exec 9>/tmp/paste_commit.lock
flock -w 8 9 || { echo "paste lock timeout after 8s" >> /tmp/paste_script.log; exit 1; }
# CRITICAL: wl-copy is a long-lived clipboard daemon that INHERITS fd 9 -> the
# flock would never release. Release the lock AFTER the paste key (serializes
# the clipboard set + paste), before the restore sleep. The restore reads only
# our own $esc/$old vars, so it needs no lock.
release_lock() { exec 9>&-; }
# Inherit env from the caller (quickshell has these). NOT hardcoded: the
# Hyprland instance signature changes on every compositor restart, and a stale
# one breaks hyprctl/wtype below.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
LOG=/tmp/paste_script.log
# bounded log: keep the last 200 lines (grows with every commit otherwise)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 200 ]; then
    tail -n 100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
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
paste_ok=0
case "$cls" in
  kitty|foot|alacritty|wezterm|ghostty|konsole|gnome-terminal|xfce4-terminal)
    echo "branch TERMINAL" >> $LOG
    timeout 5 wtype -M ctrl -M alt -k v -m ctrl -m alt; rc=$?
    # M6: retry once on failure (focus race / input grab)
    if [ $rc -ne 0 ]; then sleep 0.3; timeout 5 wtype -M ctrl -M alt -k v -m ctrl -m alt; rc=$?; fi
    echo "wtype rc=$rc (timeout would be 124)" >> $LOG
    [ $rc -eq 0 ] && paste_ok=1 ;;
  *)
    echo "branch GUI" >> $LOG
    timeout 5 wtype -M ctrl -k v -m ctrl; rc=$?
    if [ $rc -ne 0 ]; then sleep 0.3; timeout 5 wtype -M ctrl -k v -m ctrl; rc=$?; fi
    echo "wtype rc=$rc (timeout would be 124)" >> $LOG
    [ $rc -eq 0 ] && paste_ok=1 ;;
esac
# LONG restore delay: the focused app reads the clipboard ASYNCHRONOUSLY
# after the paste key (esp. TUIs and flatpaks). Restoring too early wipes the
# text before the app reads it -> intermittent "nothing pasted". 3s is
# invisible to the user but covers slow readers.
release_lock    # BEFORE the restore's wl-copy (it would inherit the lock fd)
sleep 3
if [ $paste_ok -ne 1 ]; then
    echo "paste FAILED -- leaving text on clipboard" >> $LOG
    exit 1
fi
cur=$(timeout 1 wl-paste 2>/dev/null)
if [ "$cur" = "$esc" ]; then
    # clipboard still holds OUR text -> safe to restore the old one
    if [ -n "$old" ]; then printf '%s' "$old" | wl-copy --type text/plain 2>/dev/null; echo "restored" >> $LOG
    else wl-copy -c 2>/dev/null || true; echo "cleared" >> $LOG; fi
else
    # the user copied something else during the 3s window: leave it alone
    echo "clipboard changed by user, NOT restoring" >> $LOG
fi
echo "done" >> $LOG
exit 0
