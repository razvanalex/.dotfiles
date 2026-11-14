# cosyvoice.cpp — local build

TTS engine behind `cosyvoice-server.service` (port 59451). Client entry point is the
router on 59450; see the `omnivoice-tts` skill for the service map.

## What is here

| item | purpose |
|---|---|
| `install.sh` | clone upstream, apply every `patches/*.patch` in filename order, build `cosyvoice-server` |
| `patches/0001-fix-streaming-audio-desync-and-sigabrt.patch` | streaming desync + SIGABRT fix (earlier local work) |
| `patches/0002-fix-streaming-runaway-and-stuck-slot.patch` | runaway-stream termination + released concurrency slot |

## Base commit matters

The patches are diffs against the **local** branch `pr-23` @ `2f90db6` in
`~/Workspace/ai/tts/cosyvoice.cpp` (tag `pre-tts-fix`). That branch is local-only: it
merges upstream PR #23 (`feat/streaming-tts`, `b673491`) plus 14 local commits touching
21 files. `install.sh` on a fresh clone of upstream tip is therefore an approximation,
not a reproduction — check out the pin first if exactness matters.

Do **not** base this on upstream `origin/main` as of 2026-11: it fixes the loop shape but
regresses stop-token emission (renders skip sentences and repeat one phrase; 9/36 markers
detected by ASR versus 31/36 on the pinned tree, with plausible durations both ways).

## What 0002 fixes

1. `llm_job_ext()` returned `final=false` with no new tokens once `n_accepted` hit
   `text_len * max_token_text_ratio`; the streaming loop's `|| !final` then re-decoded the
   capped span forever (a 720-char request produced 3165 s of audio). The budget is now a
   terminal state plus a `WARN`.
2. The streaming loop also breaks when a job accepts no tokens and reports no stop.
3. `cosyvoice_tts_stream_ext()`'s cleanup called `request_stop()` while holding its own
   `use_count_guard`, which waits for `use_count == 0` — a self-deadlock that kept the
   single concurrency slot forever (every later request `503 server_overloaded`, and no
   `done` line in the journal). `use_count_guard::release()` drops the reference first.

## Verifying a rebuild

Never trust `/v1/models` (it answers 200 while the speech slot is wedged) or durations
alone (a broken build can stream the right seconds while speaking the wrong words):

- `stream: true` matrix on 3 text lengths vs the recorded incumbent numbers;
- marker-sentence ASR check (unique noun per sentence, compare the set);
- cap repro: `max_token_text_ratio=2.0` + `stream: true` must end within ~1 s of audio;
- disconnect mid-stream, then a probe must answer `200`;
- deploy gate: every request leaves `[REQ] … done … note=stream_speech` in
  `journalctl --user -u cosyvoice-server`.

Battery, patch set and measured numbers: skill `tts-stt-audio-troubleshooting` →
`references/runaway-audio-forensics.md` §10–14.
