#!/home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python
"""List input devices as JSON for the dictation panel dropdown."""
import json, sys
try:
    import sounddevice as sd
    devices = []
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            name = d["name"]
            # mark monitors for clarity
            label = f"{name} {'(monitor)' if 'monitor' in name.lower() else ''}"
            devices.append({"id": i, "label": label.strip(), "monitor": "monitor" in name.lower()})
    print(json.dumps(devices))
except Exception as e:
    print(json.dumps({"error": str(e)}))
