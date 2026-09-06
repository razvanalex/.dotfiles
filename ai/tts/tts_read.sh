#!/usr/bin/env bash
# tts_read.sh — Super+R: read the current selection aloud (or stop).
#
# Flow (selection-centric, no busy-waiting):
#   1. terminal        -> stop if playing (never inject Ctrl+C = SIGINT)
#   2. XWayland        -> xclip -o -selection primary (direct read)
#   3. primary non-empty -> wl-paste --primary (fast path, zero side effects)
#   4. native Wayland GUI (Vivaldi et al): snapshot clipboard -> wtype Ctrl+C
#      -> EVENT-DRIVEN wait for owner change (FIFO, no poll loop)
#      -> read clipboard -> restore snapshot
#      no owner change = nothing was selected
#   5. selection       -> write to tmp file -> daemon speaks it (restart semantics:
#      same text while playing simply restarts; stop = press with no selection)
#   6. no selection    -> daemon stop (no-op when idle)
#
# Text transport: selection is written to a temp file and the FILE PATH is sent
# to the daemon (speak_file) — arbitrary text (quotes, newlines, huge selections)
# never passes through argv/ARG_MAX or shell quoting.
#
# Every wl-paste/wl-copy has a timeout: a hung selection owner must not freeze
# the keybind.

LOG="${XDG_DATA_HOME:-$HOME/.local/share}/tts-read/tts_read.log"
mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

log "=== INVOKED ==="

# ---- Environment for the Hyprland keybind context ----
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export HYPRLAND_INSTANCE_SIGNATURE="${HYPRLAND_INSTANCE_SIGNATURE:-}"

PYTHON="python3"
SOCK_CLIENT="$(dirname "$0")/tts_sock.py"
TMP_TEXT="/tmp/tts_read_selection.txt"

# Helper: talk to the warm daemon (auto-starts service if inactive).
daemon_cmd() {
    local err
    err=$(timeout 5 "$PYTHON" "$SOCK_CLIENT" "$@" 2>&1)
    local ret=$?
    if [ $ret -ne 0 ]; then
        log "daemon_cmd failed ($ret): $err — attempting systemctl --user start tts-read.service"
        systemctl --user start tts-read.service 2>> "$LOG"
        for _ in {1..20}; do
            if [ -S "/tmp/tts-read.sock" ]; then
                break
            fi
            sleep 0.1
        done
        err=$(timeout 5 "$PYTHON" "$SOCK_CLIENT" "$@" 2>&1)
        ret=$?
        if [ $ret -ne 0 ]; then
            log "daemon_cmd retry failed ($ret): $err"
            notify-send "TTS Read" "TTS daemon failed to connect: $err" -u normal -t 3000
            return $ret
        fi
    fi
    return 0
}

# 1. Active window class + terminal guard
WIN_CLASS=$(hyprctl activewindow -j 2>/dev/null | "$PYTHON" -c "import sys,json; d=json.load(sys.stdin); print(d.get('class','').lower())" 2>/dev/null)
log "Active window class: $WIN_CLASS"

TERM_CLASSES="kitty alacritty foot wezterm konsole xterm urxvt rxvt termite gnome-terminal xfce4-terminal ghostty"
IS_TERMINAL=0
for t in $TERM_CLASSES; do
    if [[ "$WIN_CLASS" == *"$t"* ]]; then IS_TERMINAL=1; break; fi
done

# Terminals: tmux hides the selection from the compositor (no primary, only
# clipboard via OSC 52 — which is stale-prone, so we never read it). And we
# must NEVER inject Ctrl+C into a terminal (SIGINT). Stop if playing, else no-op.
if [ "$IS_TERMINAL" -eq 1 ]; then
    log "Terminal - stop/no-op only."
    daemon_cmd stop
    exit 0
fi

SELECTED=""

# 2. Fast path: Wayland primary selection (GTK/Qt, PDF viewers, plain terminals)
PRIMARY_SEL="$(timeout 2 wl-paste --no-newline --primary 2>/dev/null)"
if [ -n "$PRIMARY_SEL" ] && [ "${#PRIMARY_SEL}" -ge 2 ]; then
    SELECTED="$PRIMARY_SEL"
    log "Selection via primary: ${SELECTED:0:80}"
fi

# 3. XWayland windows (e.g. Hermes): X server tracks highlights as X PRIMARY
if [ -z "$SELECTED" ]; then
    XWAYLAND=$(hyprctl activewindow -j 2>/dev/null | "$PYTHON" -c "import sys,json; d=json.load(sys.stdin); print(d.get('xwayland', False))" 2>/dev/null)
    if [ "$XWAYLAND" = "True" ] || [ "$XWAYLAND" = "true" ]; then
        export DISPLAY="${DISPLAY:-:0}"
        SELECTED="$(timeout 2 xclip -o -selection primary 2>/dev/null)"
        log "Selection via XWayland xclip: ${SELECTED:0:80}"
    fi
fi

# 4. Native Wayland GUI (Vivaldi etc.): inject Ctrl+C, event-driven owner change
if [ -z "$SELECTED" ]; then
    SNAPSHOT="$(timeout 2 wl-paste --no-newline 2>/dev/null)"
    log "GUI: snapshot: ${SNAPSHOT:0:80}"

    # EVENT-DRIVEN owner-change detection: wl-paste --watch execs the script on
    # every clipboard owner change; the script writes to a FIFO. We block on
    # the FIFO read — no poll loop, no busy-waiting. Timeout bounds the wait.
    # NOTE: the watch script is (re)written UNCONDITIONALLY — a stale copy from
    # an older wrapper version (touching a different flag file) must not survive.
    WATCH_SCRIPT="/tmp/tts_watch_flag.sh"
    EVT_FIFO="/tmp/tts_read_evt.fifo"
    printf '#!/bin/sh\necho x > %s\n' "$EVT_FIFO" > "$WATCH_SCRIPT"
    chmod +x "$WATCH_SCRIPT"
    rm -f "$EVT_FIFO"
    mkfifo "$EVT_FIFO"

    # Start the watcher BEFORE injecting so the copy event cannot be missed
    # (a watch started after the injection races the app's copy).
    timeout 3 wl-paste --watch "$WATCH_SCRIPT" >/dev/null 2>&1 &
    WATCH_PID=$!

    # Let the user release Super (binding fires on press; Super+Ctrl+C would
    # hit the VSCode.sh binding while Super is still held).
    sleep 0.15
    timeout 2 wtype -M ctrl -k c -m ctrl >> "$LOG" 2>&1
    log "GUI: injected Ctrl+C via wtype"

    # Block until an owner change fires (or 2s timeout). 124 = timeout (none).
    timeout 2 cat "$EVT_FIFO" >/dev/null 2>&1
    CHANGED=$?
    kill "$WATCH_PID" 2>/dev/null
    rm -f "$EVT_FIFO"

    if [ "$CHANGED" -ne 124 ]; then
        SELECTED="$(timeout 2 wl-paste --no-newline 2>/dev/null)"
        log "GUI: owner changed -> ${SELECTED:0:80}"
    else
        log "GUI: no owner change (nothing selected)"
    fi

    # Restore the clipboard exactly as it was
    printf '%s' "$SNAPSHOT" | timeout 2 wl-copy
    log "GUI: clipboard restored."
fi

# 5. Decision
if [ -z "$SELECTED" ] || [ "${#SELECTED}" -lt 2 ]; then
    log "No selection - stopping playback."
    daemon_cmd stop
    exit 0
fi

# 6. Speak via temp file (no argv/quoting limits). Restart semantics: the
# daemon replaces any current playback; pressing again just restarts.
printf '%s' "$SELECTED" > "$TMP_TEXT"
log "Speaking: ${SELECTED:0:80}..."
daemon_cmd speak_file "$TMP_TEXT"
