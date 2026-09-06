#!/usr/bin/env bash
# stt_dictate.sh — Super+T toggle: record mic, transcribe with Parakeet
# (parakeet-python on :5092), type the result into the focused field.
#
# Toggle semantics:
#   press (idle)   -> start recording + show mic indicator near cursor
#   press (active) -> stop recording, transcribe (streaming partial text in
#                     the indicator), type result into focused field
#
# Design (mirrors tts-read lessons):
#   - wtype types the text directly -> clipboard is NEVER touched (TTS owns it)
#   - focus safety: window class captured at press, verified at release
#   - streaming: poll /status for partial_text while the POST runs
#   - every network/tool call is bounded (timeout) so the keybind never hangs
#   - language: English (server-side auto-detect is out of scope)

LOG="${XDG_DATA_HOME:-$HOME/.local/share}/tts-read/stt_dictate.log"
mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export HYPRLAND_INSTANCE_SIGNATURE="${HYPRLAND_INSTANCE_SIGNATURE:-}"

PYTHON="python3"
STT_URL="http://127.0.0.1:5092/v1/audio/transcriptions"
STT_MODEL="parakeet-tdt-0.6b-v3"
WAV_FILE="/tmp/stt_input.wav"
STATE_FILE="/tmp/stt_dictate.pid"

log "=== INVOKED ==="

# ---------- STOP side (recording active -> transcribe + type) ----------
if [ -f "$STATE_FILE" ]; then
    log "Toggle OFF - stopping recording, transcribing."
    read -r REC_PID FOCUS_CLASS YAD_PID < "$STATE_FILE"
    rm -f "$STATE_FILE"

    # Stop recording
    kill "$REC_PID" 2>/dev/null
    wait "$REC_PID" 2>/dev/null
    log "Recording stopped ($(stat -c %s "$WAV_FILE" 2>/dev/null || echo 0) bytes)"

    # Focus safety: verify the same window is still focused
    CUR_CLASS=$(hyprctl activewindow -j 2>/dev/null | "$PYTHON" -c "import sys,json; print(json.load(sys.stdin).get('class',''))" 2>/dev/null)
    if [ "$CUR_CLASS" != "$FOCUS_CLASS" ]; then
        log "Focus changed ($FOCUS_CLASS -> $CUR_CLASS) - not typing."
        pkill -f "yad.*stt_dictate" 2>/dev/null
        notify-send "STT Dictate" "Focus changed - text NOT typed" -t 3000
        exit 0
    fi

    # Upload + poll for streaming progress (partial text)
    TEXT=""
    ( curl -s -m 120 -X POST "$STT_URL" \
        -F "file=@$WAV_FILE" \
        -F "model=$STT_MODEL" \
        -F "response_format=verbose_json" \
        -o /tmp/stt_result.json ) &
    CURL_PID=$!

    # Poll /status for partial text while curl runs (streaming feel)
    LAST_PARTIAL=""
    while kill -0 "$CURL_PID" 2>/dev/null; do
        PARTIAL=$(curl -s -m 2 http://127.0.0.1:5092/status 2>/dev/null | "$PYTHON" -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('partial_text','') if d.get('status')=='processing' else '')
except Exception:
    print('')" 2>/dev/null)
        if [ -n "$PARTIAL" ] && [ "$PARTIAL" != "$LAST_PARTIAL" ]; then
            LAST_PARTIAL="$PARTIAL"
            # update the indicator with live partial text
            if [ -n "$YAD_PID" ]; then
                pkill -f "yad.*stt_dictate" 2>/dev/null
                notify-send "STT Dictate" "🎙️ $PARTIAL" -t 0 -h int:transient:1 &
            fi
        fi
        sleep 0.3
    done
    wait "$CURL_PID" 2>/dev/null

    TEXT=$("$PYTHON" -c "
import json
try:
    d=json.load(open('/tmp/stt_result.json'))
    print(d.get('text',''))
except Exception:
    print('')" 2>/dev/null)
    rm -f /tmp/stt_result.json

    if [ -z "$TEXT" ]; then
        log "Empty transcription."
        pkill -f "yad.*stt_dictate" 2>/dev/null
        notify-send "STT Dictate" "No speech detected" -t 3000
        exit 0
    fi

    log "Transcribed (${#TEXT} chars): ${TEXT:0:80}"
    pkill -f "yad.*stt_dictate" 2>/dev/null
    notify-send "STT Dictate" "⌨️ typing: ${TEXT:0:60}..." -t 0 -h int:transient:1 &

    # Type the text into the focused window (no clipboard involved).
    # wtype maps chars via the active keyboard layout (English assumed).
    sleep 0.2  # let the user release Super
    timeout 30 wtype "$TEXT" >> "$LOG" 2>&1
    log "Typed."
    exit 0
fi

# ---------- START side (idle -> begin recording) ----------
log "Toggle ON - starting recording."
FOCUS_CLASS=$(hyprctl activewindow -j 2>/dev/null | "$PYTHON" -c "import sys,json; print(json.load(sys.stdin).get('class',''))" 2>/dev/null)
log "Focused class: $FOCUS_CLASS"

# Mic indicator near the cursor (macOS-style). Hyprland centers new floating
# windows, so yad's GTK geometry is ignored — spawn it, then move it to the
# saved cursor position with movewindowpixel.
CURSOR=$(hyprctl cursorpos 2>/dev/null)
CX=$(echo "$CURSOR" | cut -d',' -f1 | tr -d ' ')
CY=$(echo "$CURSOR" | cut -d',' -f2 | tr -d ' ')
yad --undecorated --skip-taskbar --no-buttons --on-top \
    --text="🎙️ Recording..." \
    --geometry=220x50 \
    --title="stt_dictate" >/dev/null 2>&1 &
YAD_PID=$!
sleep 0.3
if [ -n "$CX" ] && [ -n "$CY" ]; then
    hyprctl dispatch movewindowpixel "exact $((CX+16)) $((CY+16)),title:stt_dictate" 2>/dev/null
fi
log "Indicator at $CX,$CY (pid $YAD_PID)"

# Start recording (16kHz mono s16 — direct WAV upload, no server conversion)
rm -f "$WAV_FILE"
pw-record --format=s16 --rate=16000 --channels=1 "$WAV_FILE" >/dev/null 2>&1 &
REC_PID=$!
log "Recording pid $REC_PID"

echo "$REC_PID $FOCUS_CLASS $YAD_PID" > "$STATE_FILE"
exit 0
