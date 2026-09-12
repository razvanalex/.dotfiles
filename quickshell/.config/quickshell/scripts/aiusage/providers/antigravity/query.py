#!/usr/bin/env python3
import fcntl
import os
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import termios
import time

# Ensure standard user binary paths are on PATH
USER_BIN_DIRS = [
    os.path.expanduser("~/.local/bin"),
    os.path.expanduser("~/.gemini/antigravity-cli/bin"),
    os.path.expanduser("~/.cargo/bin"),
]
current_paths = os.environ.get("PATH", "").split(os.pathsep)
paths_to_add = [p for p in USER_BIN_DIRS if p not in current_paths and os.path.isdir(p)]
if paths_to_add:
    os.environ["PATH"] = os.pathsep.join(paths_to_add) + os.pathsep + os.environ.get("PATH", "")

ANSI_ESCAPE = re.compile(r'\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')


def strip_ansi(text):
    return ANSI_ESCAPE.sub('', text)


def find_agy():
    candidates = [
        shutil.which("agy"),
        os.path.expanduser("~/.local/bin/agy"),
        os.path.expanduser("~/.gemini/antigravity-cli/bin/agy"),
        "/usr/local/bin/agy",
        "/usr/bin/agy",
    ]
    return next((c for c in candidates if c and os.path.isfile(c) and os.access(c, os.X_OK)), None)


def query_agy_json(agy_bin):
    """Query usage non-interactively using agy's JSON output mode (~2s)."""
    try:
        res = subprocess.run(
            [agy_bin, "-p", "/usage", "--output-format", "json"],
            capture_output=True,
            text=True,
            timeout=15,
            env=os.environ.copy()
        )
        out = (res.stdout or "").strip()
        if res.returncode == 0 and out.startswith("{"):
            return out
    except Exception:
        pass
    return None


def set_size(fd, rows, cols):
    try:
        size = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, size)
    except Exception:
        pass


def query_agy_pty(agy_bin):
    """Fallback interactive PTY scraper in case --output-format json is unavailable."""
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execv(agy_bin, [agy_bin])
        except Exception:
            sys.exit(1)
    else:
        set_size(fd, 80, 120)

        output = b""
        start_time = time.time()
        prompt_sent = False
        prompt_sent_time = 0
        enter_sent = False
        exit_sent = False

        while True:
            elapsed = time.time() - start_time
            if elapsed > 15:
                break

            if prompt_sent and not enter_sent and (time.time() - prompt_sent_time > 1.5):
                try:
                    os.write(fd, b"\r")
                except Exception:
                    pass
                enter_sent = True

            r, w, x = select.select([fd], [], [], 0.1)
            if fd in r:
                try:
                    data = os.read(fd, 4096)
                    if not data:
                        break
                    output += data
                    clean = strip_ansi(output.decode('utf-8', errors='replace'))

                    if ("Welcome to the Antigravity CLI" in clean or ">" in clean) and not prompt_sent:
                        idx = clean.find(">") if ">" in clean else 0
                        time.sleep(2.0)
                        try:
                            os.write(fd, b"/usage")
                        except Exception:
                            pass
                        prompt_sent = True
                        prompt_sent_time = time.time()
                        start_time = time.time()

                    if enter_sent and "Weekly Limit" in clean and not exit_sent:
                        time.sleep(0.5)
                        try:
                            os.write(fd, b"/exit\r")
                        except Exception:
                            pass
                        exit_sent = True
                except OSError:
                    break
            else:
                if exit_sent:
                    break

        try:
            os.close(fd)
        except Exception:
            pass
        try:
            os.kill(pid, 9)
        except Exception:
            pass

        return strip_ansi(output.decode('utf-8', errors='replace'))


def main():
    agy_bin = find_agy()
    if not agy_bin:
        sys.stderr.write("agy executable not found in PATH or ~/.local/bin\n")
        sys.exit(1)

    # 1. Try fast, native JSON query first
    json_out = query_agy_json(agy_bin)
    if json_out:
        print(json_out)
        return

    # 2. Fall back to PTY scrape
    pty_out = query_agy_pty(agy_bin)
    if pty_out and pty_out.strip():
        print(pty_out)
        return

    sys.stderr.write("Failed to fetch Antigravity usage via JSON and PTY\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
