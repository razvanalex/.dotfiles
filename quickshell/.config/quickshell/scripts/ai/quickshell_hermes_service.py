#!/usr/bin/env /home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python
import sys
import os
import json
import subprocess
import signal

# Ensure search paths include tts-read and hermes-agent
TTS_READ_DIR = "/home/razvan/Workspace/ai/tts-read"
VOICE_CALL_DIR = "/home/razvan/Workspace/ai/tts-read/voice_call"
HERMES_DIR = "/home/razvan/.hermes/hermes-agent"

for path in [TTS_READ_DIR, VOICE_CALL_DIR, HERMES_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

PID_FILE = "/tmp/quickshell_hermes_voice.pid"

def run_text_query(prompt: str):
    try:
        from run_agent import AIAgent
        agent = AIAgent(model="qwen-3.6", quiet_mode=True)
        response = agent.chat(prompt)
        print(response)
    except Exception as e:
        print(f"Error executing Hermes query: {e}")

def start_voice_call():
    if os.path.exists(PID_FILE):
        print("Voice call already active.")
        return
    cmd = [
        os.path.join(VOICE_CALL_DIR, ".venv/bin/python"),
        os.path.join(VOICE_CALL_DIR, "run_voice_call.py")
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(PID_FILE, "w") as f:
        f.write(str(proc.pid))
    print(f"Voice call started (PID: {proc.pid})")

def stop_voice_call():
    if not os.path.exists(PID_FILE):
        print("No active voice call found.")
        return
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        os.kill(pid, signal.SIGTERM)
        print("Voice call stopped.")
    except Exception as e:
        print(f"Error stopping voice call: {e}")
    finally:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)

def voice_status():
    active = os.path.exists(PID_FILE)
    print(json.dumps({"active": active}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: quickshell_hermes_service.py [text <prompt> | voice start | voice stop | voice status]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "text":
        prompt = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
        run_text_query(prompt)
    elif cmd == "voice":
        subcmd = sys.argv[2] if len(sys.argv) > 2 else "status"
        if subcmd == "start":
            start_voice_call()
        elif subcmd == "stop":
            stop_voice_call()
        else:
            voice_status()
    else:
        print(f"Unknown command: {cmd}")
