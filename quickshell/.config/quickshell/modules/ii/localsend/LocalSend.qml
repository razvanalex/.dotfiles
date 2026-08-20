pragma ComponentBehavior: Bound

import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland

// LocalSend module: mounts the floating panel when GlobalStates.localsendOpen.
// Opened from the launcher search action ("localsend"), no keybind.
Scope {
    id: root

    // Always-on receive/discovery: force the LocalSend service (and its daemon)
    // to instantiate at shell startup — not only when the panel opens — so files
    // can arrive and be accepted even with the panel closed.
    Component.onCompleted: {
        void LocalSend.selfAlias;   // touch the singleton → creates it + daemon
    }

    Loader {
        id: panelLoader
        active: GlobalStates.localsendOpen
        sourceComponent: LocalSendPanel {}
    }

    IpcHandler {
        target: "localsend"
        function toggle(): void { GlobalStates.localsendOpen = !GlobalStates.localsendOpen }
        function open(): void { GlobalStates.localsendOpen = true }
        function close(): void { GlobalStates.localsendOpen = false }
    }
}
