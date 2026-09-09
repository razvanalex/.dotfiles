pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.widgets
import qs.services
import QtQuick
import Quickshell
import Quickshell.Wayland
import QtQuick.Layouts

/**
 * Bar indicator + popup for AI subscription usage (qs.services.AiUsage).
 *
 * Conditional by design: hidden unless something is actually burning —
 * any provider window at/above Config.options.aiUsage.alarmPercent.
 * Left click toggles the popup (AiUsagePopup, AirPods-style anchoring).
 * The full panel is also reachable any time via IpcHandler "aiusage".
 */
MouseArea {
    id: root

    readonly property bool borderless: Config.options.bar.borderless
    property bool popupOpen: false

    // show only when actionable (>= alarmPercent on any tracked window)
    readonly property bool actionable: (Config.options.aiUsage?.enableIndicator ?? true) && AiUsage.alarm

    implicitWidth: rowLayout.implicitWidth + 12
    implicitHeight: Appearance.sizes.barHeight

    visible: actionable
    enabled: visible

    acceptedButtons: Qt.LeftButton
    hoverEnabled: true

    onPressed: event => {
        popupOpen = !popupOpen;
        event.accepted = true;
    }

    PopupToolTip {
        text: Translation.tr("AI usage high — %1%").arg(AiUsage.worstPercent)
        extraVisibleCondition: root.containsMouse
        anchorEdges: !Config.options.bar.bottom ? Edges.Bottom : Edges.Top
    }


    RowLayout {
        id: rowLayout
        anchors.centerIn: parent
        spacing: 4

        MaterialSymbol {
            text: "monitoring"
            iconSize: Appearance.font.pixelSize.larger
            color: Appearance.m3colors.m3error
        }

        StyledText {
            font.pixelSize: Appearance.font.pixelSize.small
            color: Appearance.m3colors.m3error
            text: AiUsage.worstPercent + "%"
        }
    }

    Loader {
        active: popupOpen
        sourceComponent: AiUsagePopup {
            anchorItem: root
            Component.onCompleted: this.open()
            onCloseRequested: root.popupOpen = false
        }
    }
}
