#!/usr/bin/env bash

# This script starts AGS with GJS profiling enabled.
# The results will be saved to ags.syscap in the current directory.
# You can open this file with 'sysprof' or 'gnome-sysprof'.

XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$XDG_STATE_HOME/ags"

echo "Stopping existing AGS instances..."
killall ags 2>/dev/null
sleep 1

echo "Starting AGS with profiling..."
echo "Capture file: ags.syscap"
echo "Press Ctrl+C to stop capture and exit AGS."

GJS_ENABLE_PROFILER=1 ags

# If ags is started as a daemon/service, you might need to find its PID 
# and use sysprof-cli to attach, but for simple profiling, the env var works.
