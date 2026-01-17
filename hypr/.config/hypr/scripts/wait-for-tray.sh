#!/usr/bin/env bash

# wait-for-tray.sh
# Usage: ./wait-for-tray.sh <command> [args...]
# Example: ./wait-for-tray.sh sunshine

# Maximum wait time in seconds (0.2s * 50 = 10s)
ATTEMPTS=50
SLEEP_TIME=0.2

# The DBus service name for the System Tray Watcher (Standard FDO protocol)
TRAY_SERVICE="org.kde.StatusNotifierWatcher"

# Loop until the service appears or we timeout
for ((i=1; i<=ATTEMPTS; i++)); do
    if busctl --user status "$TRAY_SERVICE" >/dev/null 2>&1; then
        # Service found! Execute the requested command
        exec "$@"
    fi
    sleep "$SLEEP_TIME"
done

# If we reach here, we timed out.
# Start the app anyway, so it doesn't fail silently.
echo "Warning: Timeout waiting for System Tray ($TRAY_SERVICE). Starting application..." >&2
exec "$@"
