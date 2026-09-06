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
        with open(sys.argv[2], "r", encoding="utf-8", errors="replace") as f:
            msg = {"cmd": "speak", "text": f.read()}
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
    with s:
        s.sendall(json.dumps(msg).encode())
        s.shutdown(socket.SHUT_WR)
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        print(data.decode("utf-8", "replace"), end="")


if __name__ == "__main__":
    main()
