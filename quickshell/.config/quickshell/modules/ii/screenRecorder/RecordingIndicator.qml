pragma ComponentBehavior: Bound
import qs
import qs.modules.common
import qs.modules.common.widgets
import qs.services
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

// Floating recording HUD: pulsing dot, elapsed time, stop button.
// Shown while wf-recorder is running; click stop to finish gracefully (SIGINT).
Scope {
    id: root

    property bool hudHovered: false
    property bool recording: false
    property int elapsed: 0 // seconds
    readonly property string timeText: {
        const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60), s = elapsed % 60;
        const pad = (n) => n.toString().padStart(2, "0");
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    onRecordingChanged: {
        if (recording) {
            elapsed = 0;
            ticker.restart();
        } else {
            ticker.stop();
        }
    }

    Timer {
        id: ticker
        interval: 1000
        repeat: true
        running: root.recording
        onTriggered: root.elapsed += 1
    }

    Process {
        id: stopProc
        command: ["pkill", "-INT", "-x", "wf-recorder"]
    }

    Process {
        id: checkProc
        command: ["pidof", "wf-recorder"]
        stdout: StdioCollector {
            onStreamFinished: root.recording = text.trim().length > 0
        }
    }
    Timer {
        id: pollTimer
        interval: 2000
        repeat: true
        running: true
        onTriggered: checkProc.running = true
    }

    PanelWindow {
        visible: root.recording
        WlrLayershell.layer: WlrLayer.Overlay // above bar/popups so clicks always land here
        exclusiveZone: -1
        anchors { top: true; right: true }
        margins { top: 60; right: 60 }

        implicitWidth: hud.implicitWidth + 20
        implicitHeight: hud.implicitHeight + 14
        color: "transparent"

        // Whole-pill hover tracking (covers children too, never blocks clicks)
        HoverHandler {
            id: hudHover
            onHoveredChanged: root.hudHovered = hovered
        }

        Rectangle {
            anchors.fill: parent
            radius: Appearance.rounding.full
            color: Appearance.colors.colSurfaceContainer
            border.width: 1
            border.color: Appearance.colors.colOutlineVariant
            opacity: root.hudHovered ? 1.0 : 0.25
            Behavior on opacity {
                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
            }
        }

        RowLayout {
            id: hud
            anchors.centerIn: parent
            spacing: 10
            opacity: root.hudHovered ? 1.0 : 0.55
            Behavior on opacity {
                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
            }

            Rectangle {
                property bool pulse: false
                Layout.preferredWidth: 12
                Layout.preferredHeight: 12
                radius: 6
                color: Appearance.colors.colError
                SequentialAnimation on opacity {
                    running: root.recording
                    loops: Animation.Infinite
                    NumberAnimation { to: 1.0; duration: 600 }
                    NumberAnimation { to: 0.25; duration: 600 }
                }
            }

            StyledText {
                text: root.timeText
                color: Appearance.colors.colOnSurface
            }

            RippleButton {
                Layout.fillHeight: true
                implicitWidth: 36
                buttonRadius: Appearance.rounding.full
                colBackgroundToggledHover: Appearance.colors.colSecondaryContainerHover
                // Stop deterministically: SIGINT lets wf-recorder finalize the MP4.
                onClicked: {
                    console.log("[RecordingIndicator] stop clicked");
                    Quickshell.execDetached(["pkill", "-INT", "-x", "wf-recorder"]);
                    stopProc.running = true;
                }

                contentItem: MaterialSymbol {
                    anchors.centerIn: parent
                    iconSize: 22
                    text: "stop_circle"
                    color: Appearance.colors.colError
                }

                // No tooltip here: it rendered over the button and swallowed clicks.
            }
        }
    }
}
