#!/usr/bin/env bash

# AGS Development Watcher with Enhanced Logging
# Usage: ./watch.sh
# 
# When run as a systemd service, logs are sent to journalctl.
# View logs: journalctl --user -u ags-watch -f

DIR="$HOME/.dotfiles/ags/.config/ags"

# ============================================================================
# Logging Functions
# ============================================================================

log_info() {
    echo "[$(date +'%H:%M:%S')] [INFO] $*"
}

log_error() {
    echo "[$(date +'%H:%M:%S')] [ERROR] $*" >&2
}

log_warn() {
    echo "[$(date +'%H:%M:%S')] [WARN] $*" >&2
}

# ============================================================================
# Preflight Checks
# ============================================================================

# Check if AGS is available
if ! command -v ags >/dev/null 2>&1; then
    log_error "AGS command not found in PATH"
    exit 1
fi

# Check if inotifywait is available
if ! command -v inotifywait >/dev/null 2>&1; then
    log_error "inotifywait not found. Please install inotify-tools"
    exit 1
fi

# Check if directory exists
if [ ! -d "$DIR" ]; then
    log_error "Directory $DIR does not exist"
    exit 1
fi

# Change to AGS config directory
cd "$DIR" || {
    log_error "Failed to change directory to $DIR"
    exit 1
}

# Environment check (warning only, not blocking)
if [[ "$XDG_CURRENT_DESKTOP" != "Hyprland" ]]; then
    log_warn "Not running in Hyprland (current: ${XDG_CURRENT_DESKTOP:-unknown})"
    log_warn "AGS may not work correctly outside Hyprland"
fi

log_info "Starting AGS watcher in $DIR"

while true; do
    WAYLAND_DISPLAY=$(systemctl --user show-environment | grep "^WAYLAND_DISPLAY=" | cut -d= -f2)
    if [ -n "$WAYLAND_DISPLAY" ]; then
        export WAYLAND_DISPLAY
        break
    fi
    sleep 1
done
while [ ! -S "/run/user/$(id -u)/$WAYLAND_DISPLAY" ]; do
    sleep 1
done
sleep 0.5

# Wait for Wayland socket to be available
while [ -z "$WAYLAND_DISPLAY" ] || [ "$WAYLAND_DISPLAY" == "unknown" ]; do
    # Try to import it from systemd if it missing
    WAYLAND_DISPLAY=$(systemctl --user show-environment | grep "^WAYLAND_DISPLAY=" | cut -d= -f2)
    if [ -z "$WAYLAND_DISPLAY" ]; then
        log_info "Waiting for WAYLAND_DISPLAY in systemd environment..."
        sleep 2
        continue
    fi
    export WAYLAND_DISPLAY
    log_info "Found WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
    log_info "Waiting for WAYLAND_DISPLAY..."
    sleep 1
done

while [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ]; do
    log_info "Waiting for Wayland socket $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY..."
    sleep 1
done

# Give the compositor another second to finish its own internal init
sleep 1

# ============================================================================
# AGS Process Management
# ============================================================================

stop_ags() {
    if [ -n "$PID" ]; then
        log_info "Stopping AGS (PID: $PID)"
        kill "$PID" 2>/dev/null
        wait "$PID" 2>/dev/null
    fi
    ags quit >/dev/null 2>&1
}

# Trap signals for clean shutdown
trap "log_info 'Received shutdown signal'; stop_ags; exit 0" SIGINT SIGTERM

# Stop any existing AGS instances
log_info "Stopping any existing AGS instances"
ags quit >/dev/null 2>&1

# ============================================================================
# Main Watch Loop
# ============================================================================

while true; do
    log_info "--- Starting AGS application ---"
    
    # Start AGS and capture output
    # Route all AGS output plainly to stdout/stderr.
    # The systemd unit or terminal will handle its own prefixing.
    ags run &
    PID=$!
    
    # Verify AGS started
    sleep 0.5
    if ! kill -0 "$PID" 2>/dev/null; then
        log_error "AGS failed to start or crashed immediately"
        log_error "Waiting 5 seconds before retry..."
        sleep 5
        continue
    fi
    
    log_info "AGS started successfully (PID: $PID)"

    # Use monitor mode (-m) piped to grep to avoid race conditions.
    # inotifywait stays alive catching all events.
    # grep waits for the first relevant file extension, prints it, and exits.
    # When grep exits, the loop continues.
    
    # We store the output to display which file changed.
    CHANGED_FILE=$(inotifywait -m -r -e modify,create,delete,move \
        --exclude '(node_modules/|@girs/|\.git/|\.cache/|wallpaper_state\.json|wallpaper_config\.json|chat_history\.json|api_keys\.json)' \
        --format '%f' . 2>/dev/null \
        | grep -m 1 -E '\.(ts|tsx|scss|css|js)$')

    log_info "Change detected in: $CHANGED_FILE"
    log_info "Reloading AGS..."
    
    stop_ags
    
    # Small delay to ensure file IO is settled
    sleep 0.1
done