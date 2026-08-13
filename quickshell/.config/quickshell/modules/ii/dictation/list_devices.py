#!/home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python
"""List input devices as JSON for the dictation panel dropdown."""
import json, sys, re

def friendly(name: str) -> str:
    """Shorten ALSA/PipeWire device names for the dropdown."""
    n = name
    # drop the common prefixes that are pure noise
    n = re.sub(r"^alsa_(input|output)\.", "", n)
    n = n.replace("usb-Generic_USB_Audio-00.HiFi_7_1__", "USB: ")
    n = n.replace("pci-0000_00_1f.3.hdmi-stereo", "HDMI")
    n = n.replace("bluez_output.", "BT: ")
    n = re.sub(r"\.monitor$", " (monitor)", n)
    n = n.replace("__", " ").replace("_", " ")
    return n.strip()

try:
    import sounddevice as sd
    devices = []
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            name = d["name"]
            # skip raw ALSA hw: entries (bypass PipeWire, mostly silence/dup)
            if "(hw:" in name or name.strip() in ("pipewire",):
                continue
            devices.append({
                "id": i,
                "label": friendly(name),
                "monitor": "monitor" in name.lower(),
            })
    # default entry first
    print(json.dumps([{"id": -2, "label": "Default (mic)", "monitor": False}] + devices))
except Exception as e:
    print(json.dumps({"error": str(e)}))
