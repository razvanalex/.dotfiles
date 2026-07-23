import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

Scope {
    id: root

    Loader {
        id: clipboardLoader
        active: GlobalStates.clipboardOpen

        sourceComponent: PanelWindow {
            id: panelWindow
            readonly property HyprlandMonitor monitor: Hyprland.monitorFor(panelWindow.screen)
            property bool monitorIsFocused: (Hyprland.focusedMonitor?.id == monitor?.id)

            exclusionMode: ExclusionMode.Ignore
            WlrLayershell.namespace: "quickshell:clipboard"
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
            color: "transparent"

            anchors {
                top: true
                bottom: true
                left: true
                right: true
            }

            mask: Region {
                item: shadow
            }

            implicitHeight: content.implicitHeight + Appearance.sizes.elevationMargin * 2
            implicitWidth: content.implicitWidth + Appearance.sizes.elevationMargin * 2

            Component.onCompleted: {
                GlobalFocusGrab.addDismissable(panelWindow);
            }
            Component.onDestruction: {
                GlobalFocusGrab.removeDismissable(panelWindow);
            }
            Connections {
                target: GlobalFocusGrab
                function onDismissed() {
                    GlobalStates.clipboardOpen = false;
                }
            }

            StyledRectangularShadow {
                id: shadow
                target: content
            }

            ClipboardPanel {
                id: content
                anchors.centerIn: parent
                onRequestClose: {
                    GlobalStates.clipboardOpen = false;
                }
            }
        }
    }

    function toggleClipboard() {
        GlobalStates.clipboardOpen = !GlobalStates.clipboardOpen;
    }

    IpcHandler {
        target: "clipboard"

        function toggle(): void {
            root.toggleClipboard();
        }

        function open(): void {
            GlobalStates.clipboardOpen = true;
        }

        function close(): void {
            GlobalStates.clipboardOpen = false;
        }
    }

    GlobalShortcut {
        name: "clipboardToggle"
        description: "Toggle clipboard history panel"
        onPressed: {
            root.toggleClipboard();
        }
    }
}
