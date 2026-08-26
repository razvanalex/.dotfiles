pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.widgets
import qs.services
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland

/**
 * Bar indicator + popup for AirPods, driven by the airpods-tui daemon
 * (see qs.services.AirPods). Hidden entirely when no buds are connected.
 *
 * Layout follows omarchy-pods' panel: battery rows, noise-mode segmented
 * control, Conversation Awareness / One-Bud ANC / Volume Swipe toggles —
 * drawn in the illogical-impulse idiom.
 *
 * Left click toggles the popup, right click cycles the listening mode.
 */
MouseArea {
    id: root

    readonly property bool borderless: Config.options.bar.borderless
    property bool popupOpen: false

    // Battery % visibility: show on (re)connect for 10s, then hide —
    // unless low (≤25%), in which case it stays permanently.
    readonly property bool lowBattery: AirPods.batteryMin >= 0 && AirPods.batteryMin <= 25
    property bool connectGraceElapsed: false

    Connections {
        target: AirPods
        function onConnectedChanged() {
            if (AirPods.connected) {
                root.connectGraceElapsed = false;
                graceTimer.restart();
            } else {
                graceTimer.stop();
            }
        }
    }

    Timer {
        id: graceTimer
        interval: 10000
        onTriggered: root.connectGraceElapsed = true
    }

    // Full bar-height hit strip: clicks slightly above/below the glyph still
    // land here instead of bleeding through to whatever is underneath.
    implicitWidth: rowLayout.implicitWidth + 12
    implicitHeight: Appearance.sizes.barHeight

    visible: AirPods.connected
    enabled: visible

    acceptedButtons: Qt.LeftButton | Qt.RightButton
    hoverEnabled: true

    onPressed: event => {
        switch (event.button) {
        case Qt.LeftButton:
            popupOpen = !popupOpen;
            break;
        case Qt.RightButton:
            // cycle listening mode without opening anything
            {
                const order = ["off", "transparency", "adaptive", "anc"];
                const idx = order.indexOf(AirPods.noiseMode);
                AirPods.setNoiseMode(order[(idx + 1) % order.length]);
            }
            break;
        }
        event.accepted = true;
    }

    PopupToolTip {
        text: Translation.tr("AirPods")
        extraVisibleCondition: root.containsMouse
        anchorEdges: !Config.options.bar.bottom ? Edges.Bottom : Edges.Top
    }

    RowLayout {
        id: rowLayout
        anchors.centerIn: parent
        spacing: 4

        AirPodsIcon {
            iconSize: Appearance.font.pixelSize.larger
            variant: "pro"
        }

        StyledText {
            font.pixelSize: Appearance.font.pixelSize.small
            color: root.lowBattery ? Appearance.m3colors.m3error : Appearance.colors.colOnSecondaryContainer
            visible: AirPods.batteryMin >= 0 && (root.lowBattery || !root.connectGraceElapsed)
            text: AirPods.batteryMin + "%"
        }
    }

    Loader {
        active: popupOpen
        sourceComponent: AirPodsPopup {
            anchorItem: root
            Component.onCompleted: this.open()
            onCloseRequested: root.popupOpen = false
        }
    }
}
