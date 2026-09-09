pragma ComponentBehavior: Bound

import qs
import qs.services
import qs.modules.common
import QtQuick
import Quickshell
import Quickshell.Io

// AI usage module: mounts the anchored popup when GlobalStates.aiUsageOpen.
// Opened from the bar indicator (alarm state) or IpcHandler "aiusage".
Scope {
    id: root

    Loader {
        id: panelLoader
        active: GlobalStates.aiUsageOpen
        sourceComponent: AiUsagePopup {}
    }

    IpcHandler {
        target: "aiusage"
        function toggle(): void { GlobalStates.aiUsageOpen = !GlobalStates.aiUsageOpen }
        function open(): void { GlobalStates.aiUsageOpen = true }
        function close(): void { GlobalStates.aiUsageOpen = false }
        function refresh(): void { AiUsage.requestRefresh() }
    }
}
