import qs
import QtQuick
import qs.modules.common
import qs.modules.common.functions

QuickToggleModel {
    name: Translation.tr("Screen record")
    hasStatusText: false
    toggled: false
    icon: "screen_record"

    mainAction: () => {
        GlobalStates.sidebarRightOpen = false;
        delayedActionTimer.start();
    }
    Timer {
        id: delayedActionTimer
        interval: 300
        repeat: false
        onTriggered: {
            Quickshell.execDetached(["qs", "-p", Quickshell.shellPath(""), "ipc", "call", "region", "record"]);
        }
    }

    tooltipText: Translation.tr("Record screen region")
}
