#!/usr/bin/env python3
"""
stt_dictate_sidecar.py — dictation sidecar for the quickshell panel.

Records the mic, streams audio chunks to the local Parakeet server's
streaming-session endpoints (:5092), and emits JSON status events to STDOUT
for the QML panel:

    {"type": "update_audio",        "rms": 0.42}                 (waveform)
    {"type": "update_transcript",   "text": "..."}                (live text)
    {"type": "update_agent_state",  "state": "Listening"|"Transcribing"|"Committed"}
    {"type": "commit",              "text": "..."}                (final, then exit)

Controls:
  - SIGUSR1: commit now (manual commit via Super+T while recording)
  - SIGTERM / stdin EOF: commit and exit (panel closed)
  - SIGINT: cancel without committing (panel ✕ button)

Streaming protocol: ONE session per Super+T dictation. POST /stream/start
up front, then ~1s PCM chunks to /stream/<sid>/chunk from a background
thread, a poller shows the server's growing partial text live, and SIGUSR1
finalizes the whole session (full-buffer transcription) and commits.

Silence handling: silero VAD (ONNX, local) + hysteresis (ported from
voice_call SileroVADDetector); silence > 0.8s while speech was detected just
stops chunk uploads — the poller keeps showing the final partial and the
session stays alive for the next utterance (no per-utterance finalize).

Commit writes the final text to /tmp/stt_dictate_commit.txt and types it
into the focused window via wtype (called by the QML side or here on exit).
"""
import json
import os
import signal
import sys
import threading
import time
import urllib.request

import logging

import numpy as np
import onnxruntime
import sounddevice as sd


# ---------------------------------------------------------------- config
STREAM_BASE = "http://127.0.0.1:5092/v1/audio/stream"
MIC_SAMPLE_RATE = 16000
MIC_CHUNK_SAMPLES = 512          # silero VAD frame size
# Input device: read from the config file (the panel's dropdown writes it),
# so the user can switch mic <-> monitor live from the UI. None = default.
MIC_DEVICE = None
MIC_DEVICE_FILE = os.path.expanduser("~/.local/share/tts-read/mic_device.conf")
device_requested = None   # pending device swap requested by the watcher thread
_swap_requested_at = 0.0   # when the swap was requested (for the 3s force)
active_device = None       # the device the current InputStream is using
fallback_device = None     # last-known-good device (revert target on open fail)
stream_started_at = None   # when the current InputStream opened (transient guard)
SILERO_ONNX = os.path.expanduser("~/Workspace/ai/parakeet-python/models/silero_vad.onnx")
COMMIT_FILE = "/tmp/stt_dictate_commit.txt"

# VAD hysteresis (from voice_call components.py)
# THRESHOLD_ON 0.8 -> 0.5 (2026-09-02): on the AirPods HFP mic, real speech can
# hover between THRESHOLD_OFF (0.15) and 0.8 -- a dead band that leaves the
# upload gate shut while the user IS talking (12:04 session: flushes fired
# every 2s for the last 10s while text froze at 334 chars -> tail words were
# dropped client-side, never uploaded). 0.5 widens the reopen gate.
THRESHOLD_ON = 0.5    # silero probability gate to (re)open chunk uploads
THRESHOLD_OFF = 0.15
# RMS floor: silero misclassifies the monitor source's noise floor as speech
# (e.g. "Thank you." from 0.2 RMS ambient). Real speech/monitor audio is
# louder; below this level we refuse silero's speech verdict.
RMS_FLOOR = 0.02
REQUIRED_START_FRAMES = 2        # ~64ms speech to start
REQUIRED_STOP_FRAMES = 6         # ~200ms silence to stop
# SILENCE_TIMEOUT_S 0.8 -> 2.5 (2026-09-02): 0.8s cut uploads during short
# filler/breath pauses mid-monologue, so chunks of speech between them were
# never uploaded (same 12:04 session: two frozen plateaus, 13s + 10s).
# 2.5s keeps short gaps inside the upload stream; cost is ~2 extra chunk
# transcribes per pause (server already transcribes ~1/s during speech).
SILENCE_TIMEOUT_S = 2.5          # trailing silence -> trigger preview flush

# Streaming: ~1s of 16k s16le mono per chunk; poll the partial at 0.3s
CHUNK_INTERVAL_BYTES = 16000 * 2
POLL_INTERVAL_S = 0.3

# Debug: log EVERY intermediate transcript version (server partial and
# displayed text) so we can trace dedup/trimming. Create
# /tmp/stt_dictate_debug to enable (checked per poll, no restart).
DEBUG_TRANSCRIPT = os.path.exists("/tmp/stt_dictate_debug")

# ---------------------------------------------------------------- logging
LOG_FILE = os.path.expanduser("~/.local/share/tts-read/stt_dictate.log")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

log = logging.getLogger("stt_dictate")


# ---------------------------------------------------------------- state
rms = 0.0
transcript = ""           # live display text (accumulates across utterances)
final_text = ""          # accumulated final text, typed at the end
agent_state = "Listening"
commit_now = threading.Event()
flush_in_flight = 0          # number of flush threads currently running
flush_lock = threading.Lock()
cancel = threading.Event()
shutdown = threading.Event()
committing = False   # True while a commit (finalize) is in flight: SIGTERM must
                     # NOT kill the sidecar mid-commit or the paste is lost
state_lock = threading.Lock()
session_id = None                # streaming session (one per Super+T dictation)
chunk_acc = bytearray()          # local 1s accumulation of s16le PCM
chunk_in_flight = False          # True while a chunk upload thread is in flight
sending = False                  # only True after VAD detects speech: at stream
                                 # open, the monitor's leftover buffer/transient
                                 # must NOT be sent as a phantom chunk.
vad_state = None                 # silero hidden state (numpy array)
speech_seen = False              # has any speech been detected this session?
last_speech_time = time.time()
consecutive_frames = 0
speech_state = False
# Gate telemetry (2026-09-02): the 12:04 drop-out was diagnosable only by
# inference (flush cadence while text froze). Log RMS + silero prob ~1/s
# while the upload gate is CLOSED but audio energy is present, so the next
# incident shows directly whether speech sat in the VAD dead band (client
# fixable) or the audio never arrived (transport problem, e.g. SCO corruption).
last_gate_log_time = 0.0

# ---------------------------------------------------------------- silero VAD
_silero_torch = None


def get_silero():
    """Use the SAME torch.hub silero as voice_call (proven, cached locally).
    The ONNX file gave 0.31 prob on clear speech; torch.hub gives 1.0."""
    global _silero_torch
    if _silero_torch is None:
        import torch
        _silero_torch, _ = torch.hub.load(
            "snakers4/silero-vad", "silero_vad", onnx=True, trust_repo=True
        )
    return _silero_torch


def vad_probability(frame: np.ndarray) -> float:
    """frame: float32 [-1,1], 512 samples. Returns speech probability."""
    global vad_state
    model = get_silero()
    x = frame.reshape(1, -1).astype(np.float32)
    import torch
    out = model(torch.FloatTensor(x), 16000)
    if isinstance(out, (list, tuple)) and len(out) == 2:
        out, vad_state = out
    return float(out[0][0])


def reset_vad():
    global vad_state
    vad_state = None


def is_speech(frame: np.ndarray) -> bool:
    """Hysteresis state machine (ported from voice_call SileroVADDetector).

    Telemetry: when the gate is closed (speech_state False) but energy is
    present, log the raw silero prob ~1/s (GATE level INFO) so a future
    drop-out session can be diagnosed from the log alone: prob stuck in the
    dead band (THRESHOLD_OFF..THRESHOLD_ON) = VAD gate issue; prob ~0 with
    energy = audio content the model rejects; silence = genuine pause."""
    global consecutive_frames, speech_state, last_gate_log_time
    prob = vad_probability(frame)
    prob_before = prob   # raw model verdict, before the RMS-floor override
    # RMS floor: if the actual signal is too quiet, it's noise -- override
    # silero's verdict regardless of its probability.
    r = float(np.sqrt(np.mean(frame ** 2)))
    if r < RMS_FLOOR:
        prob = 0.0
    # stream-open transient: ignore VAD for the first ~0.5s after the stream
    # opens (device pop/click can look like a 0.2 RMS utterance, and silero
    # hallucinates "Thank you." from it).
    if stream_started_at and time.time() - stream_started_at < 0.5:
        prob = 0.0
    if not speech_state:
        # Counter update rule (2026-09-02): the old rule decremented on ANY
        # frame below THRESHOLD_ON, so silero's per-frame prob oscillation on
        # the BT mic (0.99 <-> 0.2 on adjacent 32ms frames, see GATE telemetry
        # 15:40 session: gate closed for 33s of continuous speech) made +1/-1
        # alternate and the counter NEVER reached REQUIRED_START_FRAMES.
        # New rule: dead-band frames (THRESHOLD_OFF..THRESHOLD_ON) HOLD the
        # counter; only real silence (< THRESHOLD_OFF) resets it.
        if prob > THRESHOLD_ON:
            consecutive_frames = min(consecutive_frames + 1, REQUIRED_START_FRAMES)
        elif prob < THRESHOLD_OFF:
            consecutive_frames = max(consecutive_frames - 1, 0)
        if consecutive_frames >= REQUIRED_START_FRAMES:
            speech_state = True
            consecutive_frames = 0
        # gate telemetry: closed gate + present energy = log it (~1/s).
        # r is the POST-gain RMS of the frame; r > RMS_FLOOR means the mic
        # delivered something above the noise floor while we're gated off.
        now = time.time()
        if r > RMS_FLOOR and now - last_gate_log_time >= 1.0:
            last_gate_log_time = now
            log.info(
                "GATE closed: rms=%.4f prob=%.3f raw=%.3f frames=%d",
                r, prob, prob_before, consecutive_frames,
            )
    else:
        if prob < THRESHOLD_OFF:
            consecutive_frames = min(consecutive_frames + 1, REQUIRED_STOP_FRAMES)
        else:
            consecutive_frames = max(consecutive_frames - 1, 0)
        if consecutive_frames >= REQUIRED_STOP_FRAMES:
            speech_state = False
            consecutive_frames = 0
    return speech_state


def _stream_channels(device) -> int:
    """Channel count for the InputStream: 2 (stereo cap). PipeWire nodes
    advertise up to 8ch (hesuvi) or 128ch (pipewire/default) and REJECT 1ch
    opens ("Invalid number of channels"); they accept a 2ch open, and the
    callback takes channel 0. 2 is the safe universal value."""
    return 2


def _read_device_config() -> str:
    """Read the device choice from the config file ('' if absent/invalid).
    The panel writes e.g. '23' or 'None' (default mic)."""
    try:
        with open(MIC_DEVICE_FILE, "r", encoding="utf-8") as f:
            val = f.read().strip()
        return val
    except Exception:
        return ""


def _config_device() -> object:
    """Parse the config file into a sounddevice device id or None.

    The config can hold either a numeric index (legacy) or a device NAME
    (preferred: sounddevice indices shift between enumerations, names are
    stable). Resolve names to the current index at runtime.
    """
    val = _read_device_config()
    if not val or val.lower() in ("none", "default", ""):
        return None
    try:
        return int(val)   # numeric index (legacy)
    except ValueError:
        pass
    # name form: find the device whose name matches EXACTLY (case-insensitive).
    # Substring matching is dangerous: "Mic__source" can match multiple USB
    # devices, and indices shift between enumerations -- only an exact name
    # uniquely identifies the intended device.
    import sounddevice as sd
    val_l = val.lower()
    for i, d in enumerate(sd.query_devices()):
        if d["name"].lower() == val_l:
            return i
    # fallback: unique substring match (some names gain suffixes over time)
    matches = [i for i, d in enumerate(sd.query_devices()) if val_l in d["name"].lower()]
    return matches[0] if len(matches) == 1 else None


def device_watcher() -> None:
    """Poll the config file; on change, request a device swap. The audio
    callback performs it at a safe point (not mid-speech)."""
    global device_requested, active_device, _swap_requested_at
    last = _read_device_config()
    while not shutdown.is_set() and not cancel.is_set():
        time.sleep(1.0)
        cur = _read_device_config()
        if cur != last:
            last = cur
            wanted = _config_device()
            with state_lock:
                cur_active = active_device
            if wanted == cur_active:
                # config says the SAME device we already capture: no-op
                log.info("device unchanged (%r), skipping swap", wanted)
                continue
            device_requested = wanted
            _swap_requested_at = time.time()
            log.info("device change requested -> %r", device_requested)


# ---------------------------------------------------------------- emit
def emit(obj: dict) -> None:
    """Emit a JSON event to stdout (consumed by the quickshell panel).

    Hardened against BrokenPipeError: if the panel's stdout pipe is closed
    (panel closed / quickshell restarted), print() raises instead of crashing
    the sidecar silently in a callback thread.
    """
    try:
        print(json.dumps(obj), flush=True)
    except BrokenPipeError:
        pass
    except Exception:
        pass


def set_state(state: str) -> None:
    global agent_state
    with state_lock:
        agent_state = state
    emit({"type": "update_agent_state", "state": state})


def set_transcript(text: str) -> None:
    global transcript
    with state_lock:
        transcript = text
    emit({"type": "update_transcript", "text": text})


def stable_transcript(prev: str, new: str) -> str:
    """Stabilize the live display: incremental ASR revises its hypothesis as
    the buffer grows ("I saw" -> "I saw a" -> "I saw a cat"), so raw
    updates churn. Show only the longest consistent word prefix; words that
    changed are dropped until they re-stabilize. This is what streaming ASR
    UIs do (commit the stable prefix, show the tail as provisional).

    DOCUMENTED FALLBACK: the server (parakeet-python ce8f134) now returns an
    authoritative monotonic committed_text, so poll_loop() no longer uses this
    helper -- the server owns stability and word corrections. Kept for
    backends that only expose raw partials."""
    pw = prev.split()
    nw = new.split()
    n = 0
    for a, b in zip(pw, nw):
        if a == b:
            n += 1
        else:
            break
    if n == 0:
        return new
    # Show the stable prefix PLUS the newest word(s) of the current hypothesis
    # (always display the live tail — never lag behind by dropping it).
    keep = min(n, len(nw) - 1) + 1 if len(nw) > n else n
    return " ".join(nw[:max(keep, 1)])


# ---------------------------------------------------------------- streaming
def stream_start() -> str:
    """POST /v1/audio/stream/start -> new session_id ('' on failure).
    Stores the id in the module global so the other helpers use it."""
    global session_id
    try:
        req = urllib.request.Request(
            STREAM_BASE + "/start", data=b"", method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            session_id = json.loads(resp.read()).get("session_id", "")
            log.info("session started: %s", session_id[:8])
            return session_id
    except Exception as e:
        log.error("stream_start failed: %s", e)
        return ""


def stream_chunk(data: bytes) -> str:
    """POST a raw s16le 16k mono PCM chunk; returns server partial_text."""
    global session_id
    if not session_id:
        return ""
    try:
        req = urllib.request.Request(
            f"{STREAM_BASE}/{session_id}/chunk", data=data, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            pt = json.loads(resp.read()).get("partial_text", "")
            log.debug("chunk sent %d bytes, partial %d chars", len(data), len(pt))
            return pt
    except Exception as e:
        log.warning("chunk POST failed: %s", e)
        return ""


def _send_chunk_guarded(data: bytes) -> None:
    """Upload one chunk off the audio thread; always clears the in-flight flag.
    State reflects activity: Transcribing while a chunk POST is in flight,
    Listening back to idle after."""
    global chunk_in_flight
    try:
        stream_chunk(data)
    finally:
        chunk_in_flight = False



last_flush_time = 0.0

def _flush_and_update() -> None:
    """Flush the session (full-quality tail commit) and refresh the display.
    Debounced: VAD speech/silence can oscillate rapidly, and each flush is a
    full-buffer re-transcription -- spam would waste CPU and keep the
    finalize fast-path from ever hitting. Only flush if >=2s since the last
    one AND the buffer has actually grown."""
    global display_text, last_flush_time, flush_in_flight
    now = time.time()
    if now - last_flush_time < 2.0:
        return
    last_flush_time = now
    with flush_lock:
        flush_in_flight += 1
    try:
        text = stream_flush()
        if text:
            with state_lock:
                display_text = text
            set_transcript(text)
    finally:
        with flush_lock:
            flush_in_flight -= 1


def stream_status() -> dict:
    """GET the session's authoritative status dict ({} on failure).

    The server (parakeet-python ce8f134) returns monotonic authoritative
    state per session:
        {"partial_text": "<committed + tail>",
         "committed_text": "<locked words>", "buffered_seconds": N}
    committed_text is append-only and carries the server's word corrections
    (words are locked by timestamp with >=1s following context, in their
    corrected form); partial_text = committed_text + " " + the unsettled
    tail. The client displays this composed string verbatim and does NOT
    re-derive stability from raw partials.
    """
    global session_id
    if not session_id:
        return {}
    try:
        req = urllib.request.Request(f"{STREAM_BASE}/{session_id}/status")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log.warning("status poll failed: %s", e)
        return {}


def stream_finalize() -> str:
    """POST finalize; returns the full-buffer transcription ('' on failure)."""
    global session_id
    if not session_id:
        return ""
    try:
        req = urllib.request.Request(
            f"{STREAM_BASE}/{session_id}/finalize", data=b"", method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read()).get("text", "")
    except Exception:
        return ""


display_text = ""          # displayed transcript (follows the server's authoritative text)
last_committed_text = ""  # last committed_text seen (for change detection)

# NOTE: the client used to re-derive stability from raw partials
# (stable_transcript/prev_partial). The server now owns stability: it returns
# an authoritative monotonic committed_text (parakeet-python ce8f134), so
# poll_loop() trusts the server's composed string. stable_transcript() is kept
# below as a documented fallback for backends without committed_text.



def stream_flush() -> str:
    """POST /flush: end-of-utterance full-quality transcription.

    Called when VAD detects trailing silence: the server transcribes the
    whole buffer (same as finalize) and makes it the committed text, so the
    preview snaps to full quality and matches what commit will type.
    Returns the flushed text ('' on failure). Retries briefly on 409
    (session busy) since the flush lock is non-blocking server-side."""
    global session_id
    if not session_id:
        return ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"{STREAM_BASE}/{session_id}/flush", data=b"", method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                r = json.loads(resp.read())
                log.info("flushed, %d chars", len(r.get("text", "")))
                return r.get("text", "")
        except urllib.error.HTTPError as e:
            if e.code == 409 and attempt < 2:
                log.info("flush busy, retry %d", attempt + 1)
                time.sleep(0.3)
                continue
            log.warning("flush HTTP %s: %s", e.code, e.reason)
            return ""
        except Exception as e:
            log.warning("flush failed: %s", e)
            return ""
    return ""


def poll_loop() -> None:
    """Every POLL_INTERVAL_S, GET status and grow the displayed transcript
    from the server's authoritative state. committed_text is append-only and
    carries word corrections (the server may lock "dictation" where an earlier
    partial said "Addictation"), so the client displays the server's composed
    string verbatim; the display only grows (no-op while silent)."""
    global display_text, last_committed_text
    failures = 0   # consecutive status failures (server-liveness gate, H3)
    while not shutdown.is_set() and not cancel.is_set():
        if session_id:
            st = stream_status()
            if not st:
                failures += 1
                if failures >= 3:
                    # server dead/restarted: session is gone; all further
                    # work is silently lost. Tell the user instead of faking
                    # a successful commit.
                    log.error("STT server unreachable (3 consecutive status failures)")
                    emit({"type": "error", "message": "STT server unreachable — dictation lost"})
                    os._exit(1)
            else:
                failures = 0
            committed = st.get("committed_text", "")
            partial = st.get("partial_text", "")
            if committed or partial:
                # Server's partial_text already includes committed_text as its
                # prefix -> it IS the authoritative composed string. Defensive
                # fallback (older/mixed servers): concatenate both.
                if partial.startswith(committed):
                    display = partial
                else:
                    display = (committed + " " + partial).strip()
                if DEBUG_TRANSCRIPT:
                    log.info("POLL c=%d p=%d disp=%d shown=%d", len(committed), len(partial), len(display), len(display_text))
                    log.info("POLL committed_text: %s", committed)
                    log.info("POLL partial_text:   %s", partial)
                    log.info("POLL display:        %s", display)
                # Anti-flicker guard: do not let the live UI suddenly lose >15 chars
                # during momentary server state transitions (re-alignment / flush race).
                # Normal ASR provisional tail revisions only tweak 1-2 words.
                if len(display) < len(display_text) - 15 and display_text:
                    time.sleep(POLL_INTERVAL_S)
                    continue

                # UPDATE the display whenever the authoritative text CHANGES
                # (grow OR shrink/correct): the flush replaces the provisional
                # text with full-quality -- an append-only display would keep
                # showing stale, wrong words forever.
                if display != display_text:
                    if DEBUG_TRANSCRIPT:
                        log.info(">>> SHOWING %d chars: %s", len(display), display)
                    log.debug("display %d -> %d chars: %s...", len(display_text), len(display), display[-40:])
                    display_text = display
                    set_transcript(display_text)
                last_committed_text = committed
        time.sleep(POLL_INTERVAL_S)


# ---------------------------------------------------------------- commit
def commit(text: str) -> None:
    set_state("Committed")
    set_transcript(text)
    with open(COMMIT_FILE, "w", encoding="utf-8") as f:
        f.write(text)
    emit({"type": "commit", "text": text})
    time.sleep(0.3)  # let QML show the committed state
    os._exit(0)  # hard exit: called from a worker thread, sys.exit won't work


# ---------------------------------------------------------------- audio callback
def audio_callback(indata, frames, time_info, status):
    global rms, chunk_acc, chunk_in_flight, speech_seen, last_speech_time, speech_state, sending, device_requested
    # live device swap: at a real pause (>=0.8s since last speech) -- or FORCED
    # after 3s even mid-audio, so a continuous source (video playback) can
    # still be switched without waiting for a quiet moment. The VAD/chunk
    # state is reset on reopen, so a mid-utterance swap loses at most the
    # current 1s chunk.
    # (device swap is handled by the main loop: it checks device_requested,
    # exits the `with` (closing the stream cleanly) and reopens with the new
    # device. Raising from the callback left PortAudio in a broken state.)
    # +18 dB gain (x8.0) with a hard clip guard: the BT headset mic captures
    # quiet speech (raw peaks ~0.036, up to 0.19-0.27), so boost before VAD and
    # RMS; np.clip keeps loud peaks from exceeding full scale / hard-clipping.
    # take channel 0; indata may be (frames, ch) for multi-channel monitors
    mono = indata[:, 0] if indata.ndim > 1 else indata
    boosted = np.clip(mono * 8.0, -1.0, 1.0)   # +18dB, clip-protected
    pcm16 = (boosted * 32767).astype(np.int16)
    frame = boosted.astype(np.float32)

    # RMS for the waveform
    r = float(np.sqrt(np.mean(frame ** 2)))
    rms = r
    emit({"type": "update_audio", "rms": r})

    # VAD on the first 512 samples (silero expects fixed-size frames)
    if len(frame) >= MIC_CHUNK_SAMPLES:
        speaking = is_speech(frame[:MIC_CHUNK_SAMPLES])
        if speaking:
            if not speech_seen:
                log.info("VAD: speech start (rms=%.4f)", rms)
            speech_seen = True
            last_speech_time = time.time()
            set_state("Transcribing")  # actively dictating
        elif speech_seen and not commit_now.is_set() and not cancel.is_set():
            if time.time() - last_speech_time > SILENCE_TIMEOUT_S:
                set_state("Listening")  # idle: no speech detected
                # end-of-utterance: flush the provisional tail so the preview
                # snaps to full-buffer quality (== what commit will type).
                threading.Thread(target=_flush_and_update, daemon=True).start()

    data = b""
    if not commit_now.is_set() and not cancel.is_set():
        with state_lock:
            chunk_acc.extend(pcm16.tobytes())
            # One in-flight upload at a time: while a chunk is uploading, keep
            # accumulating (no clear) so the next flush coalesces all buffered
            # audio instead of dropping it or piling up threads.
            if len(chunk_acc) >= CHUNK_INTERVAL_BYTES and not chunk_in_flight:
                data = bytes(chunk_acc)
                chunk_acc.clear()
                chunk_in_flight = True
        if data:
            # upload off the audio thread; the callback must never block
            threading.Thread(target=_send_chunk_guarded, args=(data,), daemon=True).start()


def _do_commit() -> None:
    """Commit worker: runs on a background thread so signal handlers only set
    flags and return. Running finalize/commit inside the SIGUSR1 handler is a
    deadlock trap: Python delivers a subsequent SIGTERM on the SAME main
    thread, freezing the SIGUSR1 frame -- `committing` can then never clear
    and the commit aborts after a 10s hang."""
    global committing, final_text, display_text
    commit_now.set()          # stop audio chunking during the finalize
    with state_lock:
        data = bytes(chunk_acc)
        chunk_acc.clear()
    if data:
        stream_chunk(data)
    committing = True
    try:
        # wait (bounded) for any in-flight flush: its flushed_upto makes
        # the finalize fast-path accurate. os._exit right after would
        # otherwise kill it and lose the flushed state.
        for _ in range(50):   # up to 5s
            with flush_lock:
                if flush_in_flight == 0:
                    break
            time.sleep(0.1)
        # also wait for an in-flight CHUNK upload (H4): the last ~1s of audio
        # may still be POSTing; finalize deletes the session and the chunk
        # would 404, losing the user's final words.
        for _ in range(30):   # up to 3s
            with state_lock:
                in_flight = chunk_in_flight
            if not in_flight:
                break
            time.sleep(0.1)
        text = stream_finalize()
        with state_lock:
            if not text and display_text:
                text = display_text
            final_text = (final_text + " " + text).strip()
        display_text = final_text   # final is authoritative: replace wholesale
        commit(final_text)
    finally:
        committing = False
        os._exit(0)


def finish_on_signal(signum, frame):
    if signum == signal.SIGUSR1:
        # manual commit (Super+T while recording): run the commit on a worker
        # thread and return IMMEDIATELY -- never block in a signal handler.
        threading.Thread(target=_do_commit, daemon=True).start()
    elif signum == signal.SIGINT or signum == signal.SIGTERM:
        # cancel / panel closed: exit WITHOUT committing (✕ button, focus loss)
        # BUT if a commit is in flight (finalize running), wait for it -- the
        # panel closing (Process stop -> SIGTERM) must not abort the commit.
        if committing:
            for _ in range(100):       # wait up to ~10s for the finalize
                if not committing:
                    break
                time.sleep(0.1)
            if committing:
                log.warning("SIGTERM during commit: finalize exceeded 10s")
                os._exit(0)
            return
        cancel.set()
        set_state("Cancelled")
        emit({"type": "cancelled"})
        os._exit(0)


def _stdin_eof_watcher() -> None:
    """Exit when stdin closes (parent gone). The QML Process owns our stdin;
    EOF means the panel is gone -- commit nothing, just die cleanly."""
    import select
    while not shutdown.is_set() and not cancel.is_set():
        try:
            r, _, _ = select.select([sys.stdin], [], [], 2.0)
            if r:
                sys.stdin.read()   # drain; EOF detected on next pass
                if sys.stdin.closed or not sys.stdin.readable():
                    break
        except (ValueError, OSError):
            break
    if not shutdown.is_set() and not cancel.is_set():
        log.info("stdin EOF (panel gone) — exiting")
        os._exit(0)


# ---------------------------------------------------------------- main
def main():
    global session_id, device_requested, active_device, fallback_device
    signal.signal(signal.SIGUSR1, finish_on_signal)
    signal.signal(signal.SIGINT, finish_on_signal)
    signal.signal(signal.SIGTERM, finish_on_signal)
    reset_vad()
    # M8: preload the VAD model BEFORE the InputStream opens -- the first
    # audio frame would otherwise trigger a multi-second torch.hub load
    # (network/fs I/O) INSIDE the real-time PortAudio callback (underruns;
    # raises -> stream dies if uncached).
    try:
        get_silero()
        log.info("silero VAD preloaded")
    except Exception as e:
        log.error("silero preload failed: %s", e)

    # ONE streaming session per dictation: created up front, fed ~1s chunks
    # from the audio callback, finalized on Super+T commit.
    session_id = stream_start()
    if not session_id:
        log.error("stream_start failed (STT server up?)")
        emit({"type": "error", "message": "stream_start failed (STT server up?)"})
        time.sleep(0.5)  # let the panel render the error before we exit
        sys.exit(1)
    threading.Thread(target=poll_loop, daemon=True).start()
    threading.Thread(target=device_watcher, daemon=True).start()
    # M2: orphan guard -- if the panel/quickshell dies, our stdout pipe
    # closes; exit cleanly instead of capturing forever (mic stays hot, the
    # server session never idles out).
    threading.Thread(target=_stdin_eof_watcher, daemon=True).start()
    set_state("Listening")

    device = _config_device()
    with state_lock:
        active_device = device
        fallback_device = device if device is not None else fallback_device
    if device is not None:
        log.info("input device from config: %r", device)
    while not shutdown.is_set() and not cancel.is_set():
        try:
            global stream_started_at
            stream_started_at = time.time()
            with sd.InputStream(
                samplerate=MIC_SAMPLE_RATE,
                channels=_stream_channels(device),
                dtype="float32",
                blocksize=MIC_CHUNK_SAMPLES,
                device=device,
                callback=audio_callback,
            ):
                while not shutdown.is_set() and not cancel.is_set():
                    # device change requested? EXIT cleanly (rc 0). The panel
                    # respawns a fresh sidecar which reads the new config.
                    # In-place stream swap hangs on some PipeWire devices
                    # (PortAudio close blocks forever) -- a fresh process is
                    # the robust path.
                    if device_requested is not None:
                        req = device_requested
                        if (time.time() - last_speech_time > SILENCE_TIMEOUT_S
                                or time.time() - _swap_requested_at > 3.0):
                            log.info("device change: exiting to respawn on %r", req)
                            emit({"type": "device_restart", "device": str(req)})
                            os._exit(0)
                    time.sleep(0.1)
        except Exception as e:
            # A reopen (device change) or stream error failed. If we have a
            # fallback device and this isn't the same one, revert to it and
            # keep going; otherwise emit the error and exit.
            if fallback_device is not None and device != fallback_device:
                log.warning("stream on %r failed (%s) -- reverting to %r",
                            device, e, fallback_device)
                device = fallback_device
                with state_lock:
                    active_device = device
                reset_vad()
                with state_lock:
                    chunk_acc.clear()
                sending = False
                emit({"type": "error", "message": f"device {device} failed, reverted"})
                continue   # retry the loop with the fallback device
            emit({"type": "error", "message": str(e)})
            sys.exit(1)
    # fallthrough: committed -> the commit() thread called sys.exit(0)


if __name__ == "__main__":
    main()
