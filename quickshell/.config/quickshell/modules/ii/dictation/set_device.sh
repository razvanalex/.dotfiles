#!/bin/bash
# apply the dictation device choice (written by DictationPanel.qml as 3
# base64 lines: device-name, cava pw_source, cava config path)
PAYLOAD=/tmp/dict_device_payload.txt
[ -s "$PAYLOAD" ] || exit 0
IFS=$'\n' read -r V64 P64 C64 < "$PAYLOAD"
val=$(echo "$V64" | base64 -d 2>/dev/null)
pw=$(echo "$P64" | base64 -d 2>/dev/null)
cfg=$(echo "$C64" | base64 -d 2>/dev/null)
[ -n "$val" ] && printf '%s' "$val" > /home/razvan/.local/share/tts-read/mic_device.conf
if [ -n "$pw" ] && [ -n "$cfg" ] && [ -f "$cfg" ]; then
    sed "s|^source = .*|source = $pw|" "$cfg" > /tmp/cava_cfg.new && mv /tmp/cava_cfg.new "$cfg"
fi
pkill -f 'cava -p' 2>/dev/null; true
