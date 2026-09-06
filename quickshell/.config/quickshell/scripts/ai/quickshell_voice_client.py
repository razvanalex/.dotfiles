#!/usr/bin/env /home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python
"""
Quickshell Voice Client Sidecar
- Connects to ws://localhost:8080/ws (Hermes web_app.py)
- Streams mic PCM in  : 16kHz, Int16, 512-sample chunks via WS binary frames
- Plays TTS audio back: 24kHz, Int16 chunks received as WS binary frames
- Listens to STDIN for QML commands ('mute', 'unmute', 'text <prompt>')
- Auto-mutes mic during agent speech (hardware echo suppression)
- Forwards JSON status events to STDOUT for QML SplitParser
"""
import asyncio
import json
import queue
import sys
import threading
import time

import aiohttp
import numpy as np
import sounddevice as sd

WS_URL = "ws://localhost:8080/ws"
MIC_SAMPLE_RATE = 16000
MIC_CHUNK_SAMPLES = 512   # server expects exactly 512 int16 samples = 1024 bytes
PLAY_SAMPLE_RATE = 24000

# Thread-safe state & queues
mic_buffer: queue.Queue = queue.Queue(maxsize=300)
play_buffer: queue.Queue = queue.Queue(maxsize=1000)
stdin_queue: queue.Queue = queue.Queue()

shutdown_event = threading.Event()
user_muted_flag = False
auto_muted_flag = False
last_play_time = 0.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def emit(obj: dict) -> None:
    """Print a single-line JSON event to stdout for QML SplitParser."""
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def is_mic_active() -> bool:
    if user_muted_flag or shutdown_event.is_set():
        return False
    return True


# ── Mic capture ──────────────────────────────────────────────────────────────

def mic_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
    """Sounddevice input callback: float32 → int16 PCM."""
    if not is_mic_active():
        return
    pcm = (indata[:, 0] * 32767).astype(np.int16)
    for i in range(0, len(pcm) - MIC_CHUNK_SAMPLES + 1, MIC_CHUNK_SAMPLES):
        chunk = pcm[i : i + MIC_CHUNK_SAMPLES]
        try:
            mic_buffer.put_nowait(chunk.tobytes())
        except queue.Full:
            pass  # drop if saturated


async def mic_sender(ws: aiohttp.ClientWebSocketResponse) -> None:
    """Drains mic_buffer and sends binary PCM frames to the WebSocket."""
    loop = asyncio.get_running_loop()
    while not shutdown_event.is_set():
        try:
            chunk = await loop.run_in_executor(None, mic_buffer.get, True, 0.05)
        except (queue.Empty, Exception):
            continue
        if ws.closed:
            break
        if not is_mic_active():
            continue
        try:
            await ws.send_bytes(chunk)
        except Exception:
            break


# ── TTS playback ─────────────────────────────────────────────────────────────

stream_lock = threading.Lock()
active_stream: sd.RawOutputStream | None = None

def playback_thread() -> None:
    """Drains play_buffer and writes Int16 PCM to persistent sounddevice output stream."""
    global active_stream
    try:
        with sd.RawOutputStream(
            device="default",
            samplerate=PLAY_SAMPLE_RATE,
            channels=1,
            dtype="int16",
            blocksize=1024,
        ) as stream:
            with stream_lock:
                active_stream = stream
            while not shutdown_event.is_set():
                try:
                    chunk = play_buffer.get(timeout=0.05)
                    stream.write(chunk)
                except queue.Empty:
                    continue
                except Exception:
                    pass
    except Exception as e:
        sys.stderr.write(f"[Voice Client] Audio playback stream error: {e}\n")
    finally:
        with stream_lock:
            active_stream = None


def flush_playback() -> None:
    """Discard buffered TTS audio on clear_audio signal (barge-in interruption)."""
    while not play_buffer.empty():
        try:
            play_buffer.get_nowait()
        except queue.Empty:
            break


def clear_mic_queue() -> None:
    """Discard buffered mic frames."""
    while not mic_buffer.empty():
        try:
            mic_buffer.get_nowait()
        except queue.Empty:
            break


# ── STDIN Listener Thread ────────────────────────────────────────────────────

def stdin_listener_thread() -> None:
    """Reads command lines from QML stdin."""
    while not shutdown_event.is_set():
        line = sys.stdin.readline()
        if not line:
            break
        cmd = line.strip()
        if cmd:
            stdin_queue.put(cmd)


def get_input_device_id() -> str:
    """Find PulseAudio / PipeWire default mic or first valid input device."""
    return "default"


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    global user_muted_flag, auto_muted_flag
    shutdown_event.clear()

    # Start STDIN thread
    stdin_th = threading.Thread(target=stdin_listener_thread, daemon=True)
    stdin_th.start()

    async with aiohttp.ClientSession() as session:
        ws = None
        for attempt in range(8):
            try:
                ws = await session.ws_connect(WS_URL)
                break
            except aiohttp.ClientConnectorError:
                if attempt < 7:
                    await asyncio.sleep(0.5)
                else:
                    emit({
                        "type": "error",
                        "message": f"Cannot connect to voice server at {WS_URL}. Is hermes-voice running?"
                    })
                    emit({"type": "disconnected"})
                    return

        try:
            # Send initial config
            await ws.send_json({
                "type": "config",
                "gain": 12.0,
                "threshold": 0.5,
                "voice": "cosyvoice3",
            })

            emit({"type": "connected"})

            # Start TTS playback thread
            play_th = threading.Thread(target=playback_thread, daemon=True)
            play_th.start()

            # Find proper input device (PulseAudio Default Source)
            input_dev = get_input_device_id()

            # Start mic capture stream
            with sd.InputStream(
                device=input_dev,
                samplerate=MIC_SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=MIC_CHUNK_SAMPLES,
                callback=mic_callback,
            ):
                sender_task = asyncio.create_task(mic_sender(ws))

                try:
                    while not shutdown_event.is_set() and not ws.closed:
                        # 1. Process pending STDIN commands from QML
                        while not stdin_queue.empty():
                            cmd = stdin_queue.get_nowait()
                            if cmd == "mute":
                                user_muted_flag = True
                                clear_mic_queue()
                                await ws.send_json({"type": "toggle_mute", "muted": True})
                                emit({"type": "update_mic_status", "muted": True})
                            elif cmd == "unmute":
                                user_muted_flag = False
                                clear_mic_queue()
                                await ws.send_json({"type": "toggle_mute", "muted": False})
                                emit({"type": "update_mic_status", "muted": False})
                            elif cmd.startswith("text "):
                                prompt_text = cmd[5:].strip()
                                if prompt_text:
                                    await ws.send_json({"type": "text_prompt", "text": prompt_text})
                            elif cmd.startswith("profile "):
                                profile_name = cmd[8:].strip()
                                if profile_name:
                                    await ws.send_json({"type": "config", "profile": profile_name})
                            elif cmd.startswith("model "):
                                model_name = cmd[6:].strip()
                                if model_name:
                                    await ws.send_json({"type": "config", "model": model_name})
                            elif cmd in ("stop", "quit", "exit"):
                                shutdown_event.set()
                                break

                        # 2. Receive WebSocket messages (non-blocking tick)
                        try:
                            msg = await ws.receive(timeout=0.02)
                            if msg.type == aiohttp.WSMsgType.BINARY:
                                try:
                                    play_buffer.put_nowait(msg.data)
                                except queue.Full:
                                    pass

                            elif msg.type == aiohttp.WSMsgType.TEXT:
                                try:
                                    data = json.loads(msg.data)
                                    event_type = data.get("type")

                                    if event_type == "clear_audio":
                                        flush_playback()

                                    elif event_type == "update_agent_state":
                                        state = data.get("state", "Idle")
                                        agent_state = state
                                        clear_mic_queue()

                                    emit(data)
                                except Exception:
                                    pass

                            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break

                        except asyncio.TimeoutError:
                            pass

                finally:
                    sender_task.cancel()
                    shutdown_event.set()

        finally:
            if ws and not ws.closed:
                await ws.close()

    emit({"type": "disconnected"})


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    finally:
        shutdown_event.set()
