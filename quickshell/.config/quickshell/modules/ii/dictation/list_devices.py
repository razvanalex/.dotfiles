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

def pipewire_source_name(name: str) -> str:
    """Map a sounddevice device name to the PipeWire source node name.
    cava needs a Pulse/PipeWire source; the sounddevice name IS the
    PipeWire node name for these (alsa_output...sink.monitor etc)."""
    if "monitor" in name.lower() or name.startswith("alsa_"):
        return name
    return "@DEFAULT_SOURCE@"

try:
    import sounddevice as sd
    devices = []
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            name = d["name"]
            # skip raw ALSA hw: entries (bypass PipeWire, mostly silence/dup)
            # and the ambiguous PipeWire aliases that confuse the picker
            # ("default"/"Default Source" all mean the same mic).
            if "(hw:" in name or name.strip() in ("pipewire", "default", "Default Source"):
                continue
            devices.append({
                "id": i,
                "name": name,
                "label": friendly(name),
                "monitor": "monitor" in name.lower(),
                "pw_source": pipewire_source_name(name),
            })
    # default entry first
    print(json.dumps([{"id": -2, "label": "Default (mic)", "monitor": False}] + devices))
except Exception as e:
    print(json.dumps({"error": str(e)}))
