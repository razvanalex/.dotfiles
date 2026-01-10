# AGS Watch Service

This directory contains the systemd service configuration for the AGS development watcher.

## Overview

The `ags-watch.service` provides:
- **Automatic AGS reload** on file changes (TypeScript, SCSS, CSS, JS, JSON)
- **Enhanced logging** with timestamps and log levels (INFO, ERROR, WARN)
- **Crash recovery** - auto-restarts if the watcher fails
- **Journald integration** - logs accessible via `journalctl`
- **Hyprland-specific** - only runs when Hyprland is the desktop environment

## Installation

The service is automatically symlinked to `~/.config/systemd/user/ags-watch.service` and started via the Hyprland `StartupApps.conf`.

### Manual Installation (if needed)

```bash
# Create symlink
ln -sf ~/.dotfiles/ags/.config/ags/scripts/systemd/ags-watch.service \
       ~/.config/systemd/user/ags-watch.service

# Reload systemd to recognize the new service
systemctl --user daemon-reload
```

## Usage

### Service Control

```bash
# Start the watcher (auto-reload mode)
systemctl --user start ags-watch

# Stop the watcher (stable AGS mode)
systemctl --user stop ags-watch

# Check service status
systemctl --user status ags-watch

# Restart the watcher
systemctl --user restart ags-watch

# Enable auto-start on Hyprland login (optional)
systemctl --user enable ags-watch

# Disable auto-start
systemctl --user disable ags-watch
```

### Viewing Logs

```bash
# View live logs (follow mode)
journalctl --user -u ags-watch -f

# View only errors
journalctl --user -u ags-watch -p err -f

# View today's logs
journalctl --user -u ags-watch --since today

# View last 100 lines
journalctl --user -u ags-watch -n 100

# View logs from last 2 hours
journalctl --user -u ags-watch --since "2 hours ago"

# Search for specific text
journalctl --user -u ags-watch | grep "Change detected"

# Export logs to file
journalctl --user -u ags-watch --since today > ~/ags-debug.log
```

### Log Format

Logs include timestamps and severity levels:

```
[15:23:45] [INFO] Starting AGS watcher in /home/user/.dotfiles/ags/.config/ags
[15:23:45] [INFO] Environment: Hyprland
[15:23:45] [INFO] Stopping any existing AGS instances
[15:23:45] [INFO] --- Starting AGS application ---
[15:23:47] [INFO] AGS started successfully (PID: 12345)
[15:24:12] [INFO] Change detected in: _bar.scss
[15:24:12] [INFO] Reloading AGS...
[15:24:12] [INFO] Stopping AGS (PID: 12345)
[15:24:13] [INFO] --- Starting AGS application ---
[15:24:14] [ERROR] AGS: Failed to load styles
```

## Development Workflow

### Active Development (auto-reload enabled)

```bash
# Start the watcher service
systemctl --user start ags-watch

# Open logs in a terminal
journalctl --user -u ags-watch -f

# Make changes to your AGS config files
# AGS will automatically reload on save
```

### Stable Mode (auto-reload disabled)

```bash
# Stop the watcher
systemctl --user stop ags-watch

# AGS continues running but won't auto-reload
# Manually reload with: ags quit && ags run
```

## Debugging

### AGS Won't Start

```bash
# Check service status
systemctl --user status ags-watch

# View recent errors
journalctl --user -u ags-watch -p err -n 50

# Check if AGS is in PATH
which ags

# Check if directory exists
ls -la ~/.dotfiles/ags/.config/ags
```

### Watcher Not Detecting Changes

```bash
# Check if inotifywait is installed
which inotifywait

# View watch events
journalctl --user -u ags-watch --since "5 minutes ago" | grep "Change detected"

# Test inotifywait manually
cd ~/.dotfiles/ags/.config/ags
inotifywait -m -r -e modify,create,delete,move .
```

### Too Many Reloads

```bash
# Count reload frequency
journalctl --user -u ags-watch --since "1 hour ago" | grep "Reloading" | wc -l

# See which files trigger reloads
journalctl --user -u ags-watch --since today | grep "Change detected"
```

### Service Crashes

```bash
# View crash history
journalctl --user -u ags-watch | grep "Started AGS Development Watcher"

# Service auto-restarts after 3 seconds (see RestartSec in service file)
# Check for patterns before crashes
journalctl --user -u ags-watch | grep -B5 "Failed"
```

## Service Configuration

The service is configured with:

- **Type**: `simple` - straightforward foreground process
- **Restart**: `on-failure` - auto-restart if watcher crashes
- **RestartSec**: `3s` - wait 3 seconds before restarting
- **KillMode**: `control-group` - kills AGS child processes when stopping
- **After**: `hyprland.target` - starts after Hyprland is ready
- **PartOf**: `hyprland.target` - stops when Hyprland stops

## Log Retention

Logs are stored in the systemd journal with these defaults:
- **System default**: Usually 1-4 weeks depending on disk space
- **Automatic cleanup**: Old logs are automatically purged
- **Size limit**: Respects systemd journal size limits

To customize retention, create `~/.config/systemd/user.conf.d/journal.conf`:

```ini
[Manager]
# Keep logs for 7 days
MaxRetentionSec=7d

# Limit journal size to 500MB
SystemMaxUse=500M
```

## Troubleshooting

### Service File Not Found

```bash
# Recreate symlink
ln -sf ~/.dotfiles/ags/.config/ags/scripts/systemd/ags-watch.service \
       ~/.config/systemd/user/ags-watch.service

# Reload systemd
systemctl --user daemon-reload
```

### Permission Issues

```bash
# Make watch.sh executable
chmod +x ~/.dotfiles/ags/.config/ags/scripts/watch.sh
```

### Running Outside Hyprland

The service will only start in Hyprland (enforced by `ConditionEnvironment=XDG_CURRENT_DESKTOP=Hyprland`).

The script itself can still run manually outside Hyprland (for testing):
```bash
~/.dotfiles/ags/.config/ags/scripts/watch.sh
# Will show warning: "Not running in Hyprland"
```

## Files

- `ags-watch.service` - Systemd service definition (tracked in git)
- `../watch.sh` - Main watcher script with logging
- Symlink location: `~/.config/systemd/user/ags-watch.service`

## See Also

- [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [journalctl(1)](https://www.freedesktop.org/software/systemd/man/journalctl.html)
- AGS documentation: https://aylur.github.io/ags-docs/
