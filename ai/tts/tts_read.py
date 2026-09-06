#!/usr/bin/env python3
"""tts_read — Read text aloud via CosyVoice3 TTS server.

Reads text from clipboard (wl-paste), stdin pipe, or command-line argument,
strips academic line numbers, sends to CosyVoice3 TTS, plays audio via mpv/ffplay,
and saves the MP3 to /tmp/.tts-read/.

Usage:
    tts_read              # read from clipboard
    tts_read -            # read from stdin
    echo "text" | tts_read
    tts_read "some text"  # use text directly
"""

import http.client
import json
import os
import random
import re
import select
import subprocess
import sys
import time
import urllib.error
import urllib.request

import tts_filter

# --- Configuration ---
COSYVOICE_BASE = (
    os.environ.get("COSYVOICE_BASE")
    or os.environ.get("COSYVOICE_URL")
    or "http://lx.workstation.lan:59451"
)
TTS_ENDPOINT = f"{COSYVOICE_BASE}/v1/audio/speech"
TTS_STREAM_ENDPOINT = f"{COSYVOICE_BASE}/v1/audio/speech"
SPEAKER_ENDPOINT = f"{COSYVOICE_BASE}/v1/voices"
DEFAULT_VOICE = "cosyvoice3"
SPEECH_SPEED = 1.1
TEMPERATURE = 0.8
PROMPT_AUDIO = os.path.expanduser("~/Workspace/ai/cosyvoice3/asset/zero_shot_prompt.wav")
PROMPT_TEXT = "希望你以后能够做的比我还好呦。"
OUTPUT_DIR = "/tmp/.tts-read"
LINE_NUMBER_RE = re.compile(r"^(\s*)\d{3}\b\s*")

# Daemon mode: set by stream_and_play_tts so a STOP can kill the active player
# and abort the in-flight HTTP stream from another thread.
_active_player = None
_active_response = None

# --- Helpers ---


def ensure_output_dir():
    """Create the output directory if it doesn't exist."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def is_terminal_window():
    """Detect if the active window is a terminal emulator.

    Uses hyprctl (for Hyprland) or xdotool (for X11) to check the active
    window's class and title against common terminal emulator identifiers.
    """
    # Under Hyprland:
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        try:
            res = subprocess.run(
                ["hyprctl", "activewindow", "-j"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if res.returncode == 0:
                info = json.loads(res.stdout)
                win_class = info.get("class", "").lower()
                win_title = info.get("title", "").lower()
                term_indicators = [
                    "kitty",
                    "alacritty",
                    "foot",
                    "wezterm",
                    "terminal",
                    "konsole",
                    "xterm",
                    "urxvt",
                    "rxvt",
                    "termite",
                    "gnome-terminal",
                    "xfce4-terminal",
                ]
                if any(ind in win_class or ind in win_title for ind in term_indicators):
                    return True
        except Exception:
            pass

    # Under X11:
    if os.environ.get("DISPLAY"):
        try:
            res = subprocess.run(
                ["xdotool", "getactivewindow", "getwindowclassname"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if res.returncode == 0:
                win_class = res.stdout.strip().lower()
                term_indicators = [
                    "kitty",
                    "alacritty",
                    "foot",
                    "wezterm",
                    "terminal",
                    "konsole",
                    "xterm",
                    "urxvt",
                    "rxvt",
                    "termite",
                    "gnome-terminal",
                    "xfce4-terminal",
                ]
                if any(ind in win_class for ind in term_indicators):
                    return True
        except Exception:
            pass

    return False


def simulate_copy_shortcut():
    """Simulate pressing Ctrl+C using available system tools.

    Only simulates copy if we are not running interactively in a TTY and
    the active window is not a terminal emulator (to avoid killing running
    commands inside terminals).
    """
    if sys.stdout.isatty():
        return

    if is_terminal_window():
        return

    # Method 1: hyprctl (for Hyprland)
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        try:
            res = subprocess.run(
                ["hyprctl", "dispatch", "sendshortcut", "CTRL, C, activewindow"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if res.returncode == 0 and "ok" in res.stdout.lower():
                time.sleep(0.15)
                return
        except Exception:
            pass

    # Method 2: wtype (Wayland virtual keyboard)
    try:
        subprocess.run(
            ["wtype", "-M", "ctrl", "-k", "c", "-m", "ctrl"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        time.sleep(0.15)
        return
    except Exception:
        pass

    # Method 3: xdotool (X11 / XWayland fallback)
    try:
        subprocess.run(
            ["xdotool", "key", "ctrl+c"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        time.sleep(0.15)
        return
    except Exception:
        pass


def get_text_from_clipboard():
    """Read text from the system clipboard.

    First, simulates a copy shortcut (Ctrl+C) to copy any active selection in the
    current window to the clipboard. Then tries primary selection first, and falls
    back to the regular clipboard.
    """
    # Simulate pressing Ctrl+C to copy selected text in the active window
    simulate_copy_shortcut()

    # Try primary selection first (highlight → select)
    result = subprocess.run(
        ["wl-paste", "--no-newline", "--primary"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode == 0 and result.stdout:
        text = result.stdout
        # Copy to the regular clipboard automatically
        try:
            subprocess.run(
                ["wl-copy"],
                input=text,
                text=True,
                timeout=5,
            )
        except Exception as e:
            print(
                f"Warning: Failed to copy primary selection to clipboard: {e}",
                file=sys.stderr,
            )
        return text

    # Fall back to regular clipboard (Ctrl+C)
    result = subprocess.run(
        ["wl-paste", "--no-newline"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode == 0 and result.stdout:
        return result.stdout

    # Neither worked
    print("Error: Nothing is copied.", file=sys.stderr)
    print(
        "  Highlight text and press the keybinding, or Ctrl+C to copy.", file=sys.stderr
    )
    sys.exit(1)


def get_text_from_stdin():
    """Read text from stdin (piped input)."""
    try:
        return sys.stdin.read()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)


def get_text(args):
    """Get input text from the appropriate source.

    Priority:
      1. Command-line argument (if provided and not '-')
      2. Stdin (if piped or '-' is explicitly passed as argument)
      3. Clipboard (default)
    """
    if args:
        if args == ["-"]:
            return get_text_from_stdin()
        return " ".join(args)

    # Check if data is being piped into stdin
    if not sys.stdin.isatty():
        try:
            r, _, _ = select.select([sys.stdin], [], [], 0.0)
            if r:
                return get_text_from_stdin()
        except Exception:
            pass

    # Default: read from clipboard.
    return get_text_from_clipboard()


def get_registered_speakers():
    """Get list of registered speaker names from the server."""
    try:
        req = urllib.request.Request(f"{COSYVOICE_BASE}/v1/voices", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            voices = data.get("voices", [])
            if isinstance(voices, list):
                return [v.get("name", "") for v in voices if isinstance(v, dict)]
    except Exception:
        pass
    return []


def ensure_speaker_registered(voice_name=None):
    """Register the speaker if not already present on the server."""
    if voice_name is None:
        voice_name = DEFAULT_VOICE

    builtin_voices = {
        "zero_shot",
        "fleurs-en",
        "fleurs-de",
        "fleurs-zh",
        "fleurs-ja",
        "fleurs-fr",
        "fleurs-es",
        "fleurs-ko",
    }
    if voice_name in builtin_voices:
        return

    try:
        registered = get_registered_speakers()
        if voice_name in registered:
            return
    except Exception:
        pass

    audio_path = PROMPT_AUDIO
    text_val = PROMPT_TEXT

    # Check for custom voice files matching the voice name in standard search directories
    search_dirs = [
        os.path.expanduser("~/Workspace/ai/cosyvoice3/asset"),
        os.path.expanduser("~/Workspace/ai/chatterbox/voices"),
        os.path.expanduser("~/Downloads"),
    ]

    found_custom = False
    for sdir in search_dirs:
        for ext in [".wav", ".mp3", ".ogg"]:
            cand_audio = os.path.join(sdir, f"{voice_name}{ext}")
            if os.path.exists(cand_audio):
                cand_text = os.path.join(sdir, f"{voice_name}.txt")
                if os.path.exists(cand_text):
                    try:
                        with open(cand_text, "r", encoding="utf-8") as tf:
                            text_val = tf.read().strip()
                        audio_path = cand_audio
                        found_custom = True
                        print(
                            f"Found custom voice files for '{voice_name}':",
                            file=sys.stderr,
                        )
                        print(f"  Audio: {audio_path}", file=sys.stderr)
                        print(f"  Transcript: {text_val}", file=sys.stderr)
                        break
                    except Exception as e:
                        print(
                            f"Warning: Failed to read transcript '{cand_text}': {e}",
                            file=sys.stderr,
                        )
                else:
                    print(
                        f"Warning: Found audio for '{voice_name}' at {cand_audio}, but no matching transcript file {cand_text} was found. Falling back.",
                        file=sys.stderr,
                    )
        if found_custom:
            break

    boundary = "----CosyVoiceBoundary7MA4YWxkTrZu0gW"
    body_parts = []

    def add_field(name, value):
        body_parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )

    def add_file(name, filename, data, content_type="audio/wav"):
        body_parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode()
            + data
            + b"\r\n"
        )

    add_field("name", voice_name)
    try:
        with open(audio_path, "rb") as af:
            add_file("voice", os.path.basename(audio_path), af.read(), "audio/wav")
    except OSError as e:
        print(
            f"Warning: Could not read prompt audio '{audio_path}': {e}",
            file=sys.stderr,
        )
        return

    add_file("transcript", f"{voice_name}.txt", text_val.encode("utf-8"), "text/plain")

    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)

    req = urllib.request.Request(
        SPEAKER_ENDPOINT,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            print(f"Speaker registered: {result}", file=sys.stderr)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            pass  # Already registered
        else:
            print(
                f"Warning: Could not register speaker (HTTP {e.code}): {e.read().decode()}",
                file=sys.stderr,
            )
    except urllib.error.URLError as e:
        print(
            f"Warning: Could not reach CosyVoice server to register speaker: {e.reason}",
            file=sys.stderr,
        )


def convert_pcm_to_audio(pcm_path, dest_path):
    """Convert raw PCM audio to the target format (MP3 or WAV) using ffmpeg."""
    ext = os.path.splitext(dest_path)[1].lower()

    if ext == ".mp3":
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-i",
            pcm_path,
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "2",
            dest_path,
        ]
    elif ext == ".wav":
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-i",
            pcm_path,
            dest_path,
        ]
    else:
        # Default to WAV
        print(
            f"Warning: Unknown extension '{ext}'. Defaulting to WAV encoding.",
            file=sys.stderr,
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-i",
            pcm_path,
            dest_path,
        ]

    ffmpeg_start = time.perf_counter()
    try:
        subprocess.run(cmd, check=True)
        ffmpeg_duration = time.perf_counter() - ffmpeg_start
        print(
            f"[Timing] Encoded PCM to {ext.upper() or 'WAV'} in {ffmpeg_duration*1000:.1f}ms",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"Warning: Failed to convert PCM to target format: {e}", file=sys.stderr)
        os.rename(pcm_path, dest_path)


def stream_and_play_tts(
    text, play=True, dest_path=None, voice=None, stop_flag=None, instruction=None
):
    """Send text to the CosyVoice3 TTS server, stream output to a player and save to file.

    stop_flag: optional threading.Event; when set, the stream loop aborts and
    the player is terminated (used by daemon-mode STOP).
    """
    if voice is None:
        voice = DEFAULT_VOICE

    ensure_output_dir()
    if dest_path:
        filepath = dest_path
    else:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"tts_{timestamp}.mp3"
        filepath = os.path.join(OUTPUT_DIR, filename)

    # Check for available player (prefer mpv for reliable audio device output)
    player = None
    if play:
        for p in ["mpv", "ffplay"]:
            try:
                subprocess.run(
                    ["which", p],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=True,
                )
                player = p
                break
            except (subprocess.CalledProcessError, FileNotFoundError):
                continue

        if not player:
            print(
                "Warning: Neither 'mpv' nor 'ffplay' found. Audio will be saved but not played.",
                file=sys.stderr,
            )

    # Spawn the player process
    player_proc = None
    if play and player:
        if player == "mpv":
            cmd = [
                "mpv",
                "--no-terminal",
                "--demuxer=rawaudio",
                "--demuxer-rawaudio-format=s16le",
                "--demuxer-rawaudio-rate=24000",
                "--demuxer-rawaudio-channels=1",
                "-",
            ]
        else:  # ffplay fallback
            cmd = [
                "ffplay",
                "-f",
                "s16le",
                "-ar",
                "24000",
                "-ac",
                "1",
                "-nodisp",
                "-autoexit",
                "-loglevel",
                "quiet",
                "-",
            ]

        try:
            player_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            print(
                f"Warning: Failed to start playback with {player}: {e}", file=sys.stderr
            )
            player_proc = None

    # Register the active player + response for daemon-mode STOP (another thread)
    global _active_player
    _active_player = player_proc

    # Speaker registration is pre-loaded on cosyvoice-server startup
    # ensure_speaker_registered(voice)

    # Try to fetch model ID dynamically from /v1/models
    model_id = None
    try:
        req_models = urllib.request.Request(f"{COSYVOICE_BASE}/v1/models", method="GET")
        with urllib.request.urlopen(req_models, timeout=3) as resp_models:
            models_data = json.loads(resp_models.read())
            models_list = models_data.get("data", [])
            if models_list:
                model_id = models_list[0].get("id")
    except Exception:
        pass

    if instruction is None:
        clean_text, _, detected_instruction = tts_filter.extract_emotion(text)
        if detected_instruction:
            instruction = detected_instruction
            text = clean_text

    payload = {
        "input": text,
        "voice": voice,
        "response_format": "pcm",
        "stream": play,
        "speed": SPEECH_SPEED,
        "temperature": TEMPERATURE,
        "seed": random.randint(1, 10000000),
        "consent_attestation": "I have the speaker's consent",
    }
    if instruction:
        payload["instructions"] = instruction
    if model_id:
        payload["model"] = model_id
    data = json.dumps(payload).encode("utf-8")
    endpoint = TTS_ENDPOINT
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    print(f"Connecting to CosyVoice at {endpoint}...", file=sys.stderr)
    conn_start = time.perf_counter()
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        print(f"Error: TTS server returned HTTP status {e.code}", file=sys.stderr)
        try:
            err_body = e.read().decode("utf-8")
            print(f"  Details: {err_body}", file=sys.stderr)
        except Exception:
            pass
        if player_proc:
            player_proc.terminate()
            player_proc.wait()
        sys.exit(1)
    except urllib.error.URLError as e:
        print(
            f"Error: Could not connect to CosyVoice server at {endpoint}",
            file=sys.stderr,
        )
        print(f"  Reason: {e.reason}", file=sys.stderr)
        print("  Make sure cosyvoice-server is running.", file=sys.stderr)
        if player_proc:
            player_proc.terminate()
            player_proc.wait()
        sys.exit(1)

    conn_duration = time.perf_counter() - conn_start
    print(
        f"[Timing] HTTP connection established in {conn_duration*1000:.1f}ms",
        file=sys.stderr,
    )
    if player_proc:
        print(f"Playing audio via {player}...", file=sys.stderr)

    temp_pcm_path = filepath + ".pcm"
    total_bytes = 0
    first_byte_time = None

    # Read streaming chunks, write to file and player stdin
    try:
        with open(temp_pcm_path, "wb") as f:
            while True:
                try:
                    chunk = response.read(4096)
                except (http.client.IncompleteRead, AttributeError, OSError) as e:
                    # AttributeError: response was closed by a concurrent STOP
                    # (HTTPResponse.close() nulls fp). Treat as stream end.
                    chunk = getattr(e, "partial", b"")
                if not chunk:
                    break

                if stop_flag is not None and stop_flag.is_set():
                    # Stop requested: keep DRAINING the connection (the server
                    # must finish its generation naturally — aborting it
                    # mid-stream SIGABRTs cosyvoice-server), but discard the
                    # audio and don't write to the player or the file.
                    continue

                if first_byte_time is None:
                    first_byte_time = time.perf_counter()
                    ttfb = first_byte_time - conn_start
                    print(
                        f"[Timing] Time to First Byte (TTFB): {ttfb*1000:.1f}ms",
                        file=sys.stderr,
                    )

                total_bytes += len(chunk)
                f.write(chunk)
                if player_proc and player_proc.stdin:
                    try:
                        player_proc.stdin.write(chunk)
                        player_proc.stdin.flush()
                    except (OSError, ValueError):
                        # Player stdin closed (player finished early or exited)
                        try:
                            player_proc.stdin.close()
                        except Exception:
                            pass
                        player_proc = None
    except KeyboardInterrupt:
        print("\nStopping...", file=sys.stderr)
        if os.path.exists(temp_pcm_path):
            os.remove(temp_pcm_path)
        if player_proc:
            player_proc.terminate()
            player_proc.wait()
        sys.exit(130)
    except Exception as e:
        print(f"Error during streaming: {e}", file=sys.stderr)
        if os.path.exists(temp_pcm_path):
            os.remove(temp_pcm_path)
        if player_proc:
            player_proc.terminate()
            player_proc.wait()
        sys.exit(1)

    stream_duration = time.perf_counter() - (
        first_byte_time if first_byte_time else conn_start
    )
    print(
        f"[Timing] Stream finished. Received {total_bytes} bytes in {stream_duration:.2f}s",
        file=sys.stderr,
    )

    # Close player stdin and wait for playback to finish
    if player_proc:
        if player_proc.stdin:
            try:
                # Feed 80ms of silence (3840 bytes @ 24kHz 16-bit mono) to flush player audio buffer cleanly
                player_proc.stdin.write(b"\x00" * 3840)
                player_proc.stdin.flush()
            except (OSError, ValueError):
                pass
            try:
                player_proc.stdin.close()
            except Exception:
                pass
        try:
            player_proc.wait()
        except KeyboardInterrupt:
            print("\nPlayback interrupted by user.", file=sys.stderr)
            player_proc.terminate()
            player_proc.wait()

    # Convert the cached PCM to the final file using ffmpeg
    if os.path.exists(temp_pcm_path):
        convert_pcm_to_audio(temp_pcm_path, filepath)
        try:
            os.remove(temp_pcm_path)
        except Exception:
            pass

    print(f"Saved: {filepath}", file=sys.stderr)
    print("Done.", file=sys.stderr)


def daemon_main():
    """Run as a persistent warm daemon: preload normalizers, serve a unix socket.

    The expensive part of tts_read (wetext normalizer load, ~500ms) is done
    once at startup. The Hyprland keybind wrapper then just sends text over
    the socket and playback starts almost immediately.

    Commands (JSON line over the socket):
      {"cmd": "speak", "text": "..."}   -> preprocess + stream TTS to player
      {"cmd": "stop"}                    -> kill the active player + abort stream
      {"cmd": "status"}                  -> {"playing": bool, "text": "..."}
    """
    import socket as socket_mod
    import threading

    SOCK_PATH = "/tmp/tts-read.sock"

    # Preload normalizers once (the ~500ms cost)
    print("Preloading wetext normalizers...", file=sys.stderr)
    t0 = time.perf_counter()
    try:
        tts_filter.get_wetext_normalizer("zh")
        tts_filter.get_wetext_normalizer("en")
        print(
            f"Normalizers ready in {(time.perf_counter()-t0)*1000:.0f}ms",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"Normalizer preload failed: {e}", file=sys.stderr)

    state = {"playing": False, "text": "", "last_text": ""}
    state_lock = threading.Lock()
    stop_flag = threading.Event()
    worker = None

    def stop_active():
        """Stop audio NOW without crashing the TTS server.

        Kill the player immediately (what the user perceives as stop) and set
        the stop flag so the worker stops writing audio. IMPORTANT: do NOT
        close the HTTP response from here — the cosyvoice-server SIGABRTs on a
        client disconnect mid-generation (GGML_ASSERT in cosyvoice-llm-job).
        The worker drains the remaining stream in the background instead.
        """
        stop_flag.set()
        p = _active_player
        if p and p.poll() is None:
            try:
                p.terminate()
            except Exception:
                pass
        # NOTE: deliberately NOT closing _active_response here.

    def speak(text):
        nonlocal worker
        if not text or not text.strip():
            return
        raw_text = text
        text = tts_filter.preprocess(text)
        if not text.strip():
            return

        # If something is playing (or a previous worker is still draining the
        # server stream), wait for it to FULLY finish before starting a new
        # request. The cosyvoice-server crashes (GGML_ASSERT "Failed to sample
        # token") when a new /v1/audio/speech request starts while the previous
        # generation is still winding down — strict serialization is required.
        if state.get("playing") or (worker and worker.is_alive()):
            stop_active()
            if worker and worker.is_alive():
                worker.join(timeout=15)

        with state_lock:
            state["playing"] = True
            state["text"] = raw_text  # raw text: wrapper compares selections verbatim
            state["last_text"] = raw_text  # persists after playback (stale-selection guard)
            stop_flag.clear()

        def run():
            try:
                stream_and_play_tts(text, stop_flag=stop_flag)
            except Exception as e:
                print(f"Speak error: {e}", file=sys.stderr)
            finally:
                with state_lock:
                    state["playing"] = False
                    state["text"] = ""

        worker = threading.Thread(target=run, daemon=True)
        worker.start()

    try:
        os.unlink(SOCK_PATH)
    except OSError:
        pass

    with socket_mod.socket(socket_mod.AF_UNIX, socket_mod.SOCK_STREAM) as server:
        server.bind(SOCK_PATH)
        server.listen(4)
        print(f"tts-read daemon listening on {SOCK_PATH}", file=sys.stderr)
        while True:
            try:
                conn, _ = server.accept()
            except OSError:
                continue
            with conn:
                try:
                    data = conn.recv(65536).decode("utf-8", "replace").strip()
                    if not data:
                        continue
                    msg = json.loads(data)
                except Exception as e:
                    try:
                        conn.sendall(
                            json.dumps({"ok": False, "error": str(e)}).encode()
                        )
                    except OSError:
                        pass
                    continue

                cmd = msg.get("cmd")
                try:
                    if cmd == "speak":
                        speak(msg.get("text", ""))
                        conn.sendall(b'{"ok": true}')
                    elif cmd == "stop":
                        stop_active()
                        # Note: state["playing"] stays true until the worker
                        # thread's finally block runs (the drain completes).
                        # This keeps status truthful and forces the next speak
                        # to wait for the server to fully wind down.
                        conn.sendall(b'{"ok": true}')
                    elif cmd == "status":
                        with state_lock:
                            conn.sendall(
                                json.dumps(
                                    {
                                        "playing": state["playing"],
                                        "text": state["text"],
                                        "last_text": state["last_text"],
                                    }
                                ).encode()
                            )
                    else:
                        conn.sendall(b'{"ok": false, "error": "unknown cmd"}')
                except OSError:
                    # Client disconnected mid-reply (e.g. it timed out or died).
                    # Never let a client-side error kill the daemon.
                    pass


def main():
    args = sys.argv[1:]

    # Daemon mode: persistent warm process (see daemon_main docstring)
    if args and args[0] == "--daemon":
        daemon_main()
        sys.exit(0)

    # Handle file mode for integration with tools like Hermes/Chatterbox
    if args and args[0] == "--file-mode":
        if len(args) < 3:
            print(
                "Usage: tts_read.py --file-mode <input_path> <output_path> [voice]",
                file=sys.stderr,
            )
            sys.exit(1)
        input_path = args[1]
        output_path = args[2]
        voice = args[3] if len(args) > 3 else DEFAULT_VOICE

        try:
            with open(input_path, "r", encoding="utf-8") as f:
                text = f.read().strip()
        except OSError as e:
            print(f"Error reading input file: {e}", file=sys.stderr)
            sys.exit(1)

        if not text:
            print("Error: Input text is empty.", file=sys.stderr)
            sys.exit(1)

        text = tts_filter.preprocess(text)
        if not text.strip():
            print("Error: Text became empty after cleaning.", file=sys.stderr)
            sys.exit(1)

        stream_and_play_tts(text, play=False, dest_path=output_path, voice=voice)
        sys.exit(0)

    # Get input text
    text = get_text(args)

    if not text or not text.strip():
        print("Error: No text to read.", file=sys.stderr)
        sys.exit(1)

    # Extract emotion tag before preprocessing so brackets are preserved for instruction mapping
    clean_text, _, instruction = tts_filter.extract_emotion(text)
    text = tts_filter.preprocess(clean_text)

    if not text.strip():
        print("Error: Text became empty after cleaning.", file=sys.stderr)
        sys.exit(1)

    # Stream to player and save
    stream_and_play_tts(text, instruction=instruction)


if __name__ == "__main__":
    main()
