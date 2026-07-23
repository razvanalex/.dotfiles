#!/bin/bash
# Fixed VM Toggle Script - Intelligent Visibility & Submaps

VM_NAME="ubuntu24.04"
LOG_FILE="/tmp/vm_toggle.log"
IS_STARTUP=false

exec > >(tee -a "$LOG_FILE") 2>&1
echo "--- Fixed Toggle $(date) ---"

# 1. Start VM if needed
if ! virsh list --name | grep -q "^$VM_NAME$"; then
    echo "Starting VM..."
    notify-send "VM" "Starting $VM_NAME..."
    virsh start "$VM_NAME"
    sleep 2
fi

# 2. Start Viewer if needed
if ! pgrep -x "virt-viewer" > /dev/null; then
    echo "Starting Viewer..."
    # notify-send "VM" "Connecting..."
    virt-viewer -v --attach --full-screen --hotkeys=release-cursor=ctrl+alt "$VM_NAME" >> "$LOG_FILE" 2>&1 &
    
    # Wait for window to map
    for i in {1..20}; do
        if hyprctl clients -j | jq -e ".[] | select(.class == \"virt-viewer\")" > /dev/null; then
            echo "Window mapped."
            break
        fi
        sleep 0.2
    done

    hyprctl dispatch submap vm
    hyprctl keywords cursor:invisible 1
    IS_STARTUP=true
fi

# 3. Toggle
TARGET="vm"
IS_VISIBLE=$(hyprctl monitors -j | jq -r '.[] | .specialWorkspace.name' | grep "special:$TARGET")

if [ -z "$IS_VISIBLE" ]; then
    echo "VM hidden."
    hyprctl keywords cursor:invisible 1
    hyprctl dispatch submap vm
    hyprctl dispatch togglespecialworkspace vm
elif [ "$IS_STARTUP" = false ]; then
    echo "VM already visible."
    hyprctl keywords cursor:invisible 0
    hyprctl dispatch submap reset
    hyprctl dispatch togglespecialworkspace vm
fi

echo "--- Done ---"
