#!/bin/bash
# apply the dictation device choice (3 base64 lines: device-name, cava pw_source,
# cava config path). Writes BOTH files, then the PANEL restarts cava (its
# cavaProc owns the process; a script-started cava would not feed the panel's
# SplitParser). No pkill here -- the QML timer handles the restart AFTER this
# script exits, so the config is always in place first.
PAYLOAD=/tmp/dict_device_payload.txt
[ -s "$PAYLOAD" ] || exit 0
# read THREE lines (read reads ONE line; extra vars only word-split it)
V64=$(sed -n '1p' "$PAYLOAD")
P64=$(sed -n '2p' "$PAYLOAD")
C64=$(sed -n '3p' "$PAYLOAD")
val=$(echo "$V64" | base64 -d 2>/dev/null)
pw=$(echo "$P64" | base64 -d 2>/dev/null)
cfg=$(echo "$C64" | base64 -d 2>/dev/null)
[ -n "$val" ] && printf '%s' "$val" > /home/razvan/.local/share/tts-read/mic_device.conf
# Guard (2026-10-21): a picked device can name a PipeWire node that does not
# exist outside its own context -- e.g. Sunshine's virtual sink monitor only
# exists while a stream is running. cava then records silence forever and the
# panel's waveform goes flat with no error (its stderr was never read).
# Only write a source wpctl can actually see; otherwise fall back to the
# default source, which is what cava used before any device was picked.
if [ -z "$pw" ]; then
    pw="@DEFAULT_SOURCE@"
elif [ "$pw" != "@DEFAULT_SOURCE@" ] && ! wpctl inspect "$pw" >/dev/null 2>&1; then
    echo "set_device: '$pw' is not a live node, using @DEFAULT_SOURCE@" >&2
    pw="@DEFAULT_SOURCE@"
fi
if [ -n "$cfg" ] && [ -f "$cfg" ]; then
    sed "s|^source = .*|source = $pw|" "$cfg" > /tmp/cava_cfg.new && mv /tmp/cava_cfg.new "$cfg"
fi
exit 0
