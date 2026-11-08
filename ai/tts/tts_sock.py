#!/usr/bin/env python3
"""Minimal unix-socket client for the tts-read daemon.

Usage:
    tts_sock.py status
    tts_sock.py speak <text>
    tts_sock.py speak_file <path>   # read text from a file (no argv limits)
    tts_sock.py stop
"""
import json
import socket
import sys

SOCK_PATH = "/tmp/tts-read.sock"

# The daemon reads ONE recv() of 65536 bytes (tts_read.py: `conn.recv(65536)`),
# so a bigger request is truncated and can never parse. Keep well under it.
MAX_PAYLOAD = 60000
# First bytes of things that are definitely not text to read aloud.
BINARY_MAGIC = (
    b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF87a", b"GIF89a",
    b"%PDF-", b"PK\x03\x04", b"OggS", b"RIFF", b"\x7fELF", b"\x1f\x8b",
)


def main():
    if len(sys.argv) < 2:
        print("usage: tts_sock.py status|speak <text>|speak_file <path>|stop", file=sys.stderr)
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == "speak":
        if len(sys.argv) < 3:
            print("speak needs text", file=sys.stderr)
            sys.exit(2)
        msg = {"cmd": "speak", "text": sys.argv[2]}
    elif cmd == "speak_file":
        if len(sys.argv) < 3:
            print("speak_file needs a path", file=sys.stderr)
            sys.exit(2)
        path = sys.argv[2]
        try:
            with open(path, "rb") as f:
                blob = f.read()
        except OSError as e:
            print(f"cannot read {path}: {e}", file=sys.stderr)
            sys.exit(2)
        if any(blob.startswith(m) for m in BINARY_MAGIC):
            print(
                f"selection is not text: {path} looks like binary data "
                f"({len(blob)} bytes) -- refusing to read it aloud",
                file=sys.stderr,
            )
            sys.exit(3)
        try:
            text = blob.decode("utf-8")
        except UnicodeDecodeError as e:
            # Not UTF-8 but not a known binary format either: keep the previous
            # behaviour (read it with replacement chars) and just warn, so a
            # Latin-1/ISO selection is still read aloud instead of refused.
            print(
                f"warning: {path} is not UTF-8 ({e}); reading it with "
                f"replacement characters",
                file=sys.stderr,
            )
            text = blob.decode("utf-8", "replace")
        msg = {"cmd": "speak", "text": text}
    elif cmd == "status":
        msg = {"cmd": "status"}
    elif cmd == "stop":
        msg = {"cmd": "stop"}
    else:
        print(f"unknown cmd: {cmd}", file=sys.stderr)
        sys.exit(2)

    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(SOCK_PATH)
    except OSError as e:
        print(f"cannot connect to daemon: {e}", file=sys.stderr)
        sys.exit(1)
    payload = json.dumps(msg).encode()
    if len(payload) > MAX_PAYLOAD:
        print(
            f"message too large for the daemon: {len(payload)} bytes > {MAX_PAYLOAD} "
            f"(the daemon reads a single 65536-byte request) -- selection too long?",
            file=sys.stderr,
        )
        sys.exit(3)
    with s:
        try:
            s.sendall(payload)
            s.shutdown(socket.SHUT_WR)
        except (BrokenPipeError, ConnectionResetError) as e:
            print(
                f"daemon closed the connection while sending {len(payload)} bytes: {e}",
                file=sys.stderr,
            )
            sys.exit(4)
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        print(data.decode("utf-8", "replace"), end="")


if __name__ == "__main__":
    main()
