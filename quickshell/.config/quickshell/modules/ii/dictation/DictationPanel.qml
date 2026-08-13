pragma ComponentBehavior: Bound
import qs
import qs.services
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.modules.common
import qs.modules.common.functions
import qs.modules.common.widgets

PanelWindow {
    id: root

    visible: GlobalStates.dictationOpen
    screen: Quickshell.screens.find(s => s.name === Hyprland.focusedMonitor?.name) ?? null

    WlrLayershell.namespace: "quickshell:dictation"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0
    color: "transparent"

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    // input only on the bar itself; clicks elsewhere pass through to the app
    mask: Region {
        item: GlobalStates.dictationOpen ? dictBar : null
    }

    readonly property real barWidth: Math.max(500, Math.min(1200, (screen?.width ?? 1920) * 0.85))

    // ---- sidecar process: JSON events -> panel state ----
    property real voiceRms: 0.0
    property list<real> voicePoints: []
    property string voiceTranscript: ""

    // reset stale transcript when a new dictation session opens
    onVisibleChanged: {
        if (visible) {
            root.voiceTranscript = ""
            root.voiceState = "Listening"
        }
    }
    property string voiceState: "Listening"
    // debounced display state: sidecar flips Transcribing/Listening per chunk
    // (~1s cadence) which flickers; only show Transcribing once it persists.
    property string displayState: "Listening"
    property bool transcribingCandidate: false

    onVoiceStateChanged: {
        if (root.voiceState === "Transcribing") {
            transcribingTimer.restart()
            transcribingCandidate = true
        } else if (root.voiceState !== "Transcribing") {
            transcribingCandidate = false
            // hold the Transcribing label briefly after the last chunk
            holdTimer.restart()
        }
    }
    Timer {
        id: transcribingTimer
        interval: 300
        onTriggered: {
            if (root.transcribingCandidate) {
                root.displayState = "Transcribing"
            }
        }
    }
    Timer {
        id: holdTimer
        interval: 400
        onTriggered: {
            if (!root.transcribingCandidate) {
                root.displayState = root.voiceState
            }
        }
    }

    Process {
        id: sidecarProc
        command: ["/home/razvan/Workspace/ai/tts-read/stt_dictate_sidecar.py"]
        running: GlobalStates.dictationOpen
        stdout: SplitParser {
            onRead: data => {
                try {
                    const msg = JSON.parse(data)
                    switch (msg.type) {
                        case "update_audio":
                            root.voiceRms = msg.rms ?? 0
                            break
                        case "update_transcript":
                            root.voiceTranscript = msg.text ?? ""
                            break
                        case "update_agent_state":
                            root.voiceState = msg.state ?? "Listening"
                            break
                        case "commit":
                            root.commitText(msg.text)
                            GlobalStates.dictationOpen = false
                            break
                        case "cancelled":
                            GlobalStates.dictationOpen = false
                            break
                        case "error":
                            GlobalStates.dictationOpen = false
                            break
                    }
                } catch(e) {}
            }
        }
        onExited: (code, status) => {
            if (GlobalStates.dictationOpen) GlobalStates.dictationOpen = false
        }
    }

    // REAL audio waveform: cava captures the mic (BT headset) and emits
    // frequency-band amplitudes, exactly like the media player's visualizer.
    // Same component, real data instead of the synthetic sine animation.
    Process {
        id: cavaProc
        running: GlobalStates.dictationOpen
        onRunningChanged: {
            if (!cavaProc.running) {
                root.voicePoints = []
            }
        }
        command: ["cava", "-p", `${FileUtils.trimFileProtocol(Directories.scriptPath)}/cava/mic_input_config.txt`]
        stdout: SplitParser {
            onRead: data => {
                const pts = data.split(";").map(p => parseFloat(p.trim())).filter(p => !isNaN(p))
                root.voicePoints = pts
            }
        }
    }

    function commitText(text: string) {
        Quickshell.execDetached([
            "bash", "-c",
            `wtype "${text.replace(/"/g, '\\"').replace(/`/g, '\\`')}" 2>/dev/null || true`
        ])
    }

    // ---- the bar: an ITEM inside the full-screen window ----
    // drag.target moves it with the pointer (Qt built-in); position is set
    // on open (bottom-center), then the user can drag it anywhere.
    Rectangle {
        id: dictBar
        width: root.barWidth
        height: dictColumn.implicitHeight + 24
        radius: Appearance.rounding.large
        color: Appearance.m3colors.m3surfaceContainer
        border.color: Qt.rgba(Appearance.m3colors.m3outlineVariant.r, Appearance.m3colors.m3outlineVariant.g, Appearance.m3colors.m3outlineVariant.b, 0.5)
        border.width: 1
        clip: true

        // bottom-center when opened. Use screen dims, NOT root.width/height —
        // those are 0 before the window maps (Component.onCompleted fires too
        // early), which put the bar off-screen at (0,0).
        function resetPosition() {
            const sw = root.screen?.width ?? 1920
            const sh = root.screen?.height ?? 1080
            x = (sw - width) / 2
            y = sh - height - 40
        }
        Component.onCompleted: resetPosition()
        onVisibleChanged: {
            if (visible) {
                // window is mapped now; screen is valid. Small delay so the
                // bar's implicit height settles before positioning.
                resetPosition.call(this)
            }
        }

        // drag handle: the bar's background (lowest z — content above still
        // gets its own clicks: close button, transcript selection)
        MouseArea {
            id: dragArea
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            drag.target: parent
            cursorShape: Qt.OpenHandCursor
        }

        // ---- background waveform: spans the ENTIRE panel, subtle — like the
        // AiChat voice mode. Behind all content; low alpha keeps contrast soft.
        WaveVisualizer {
            id: bgWave
            anchors.fill: parent
            anchors.margins: 4
            live: GlobalStates.dictationOpen
            points: root.voicePoints
            maxVisualizerValue: 1000   // match the media player: cava autosens ~0-1000
            smoothing: 2
            color: Qt.rgba(Appearance.m3colors.m3primary.r, Appearance.m3colors.m3primary.g, Appearance.m3colors.m3primary.b, 0.45)
            opacity: 0.5
        }

        ColumnLayout {
            id: dictColumn
            anchors.fill: parent
            anchors.margins: 12
            spacing: 8

            // ---- top row: state badge + hint + cancel ----
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 26
                spacing: 8

                // state badge: LEFT
                Rectangle {
                    radius: Appearance.rounding.small
                    color: Qt.rgba(Appearance.m3colors.m3primary.r, Appearance.m3colors.m3primary.g, Appearance.m3colors.m3primary.b, 0.25)
                    implicitWidth: stateLabel.implicitWidth + 12
                    implicitHeight: stateLabel.implicitHeight + 6
                    Layout.alignment: Qt.AlignVCenter
                    StyledText {
                        id: stateLabel
                        anchors.centerIn: parent
                        text: ({
                            "Listening":    "◉ Listening",
                            "Transcribing": "⚙ Transcribing",
                            "Committed":    "✓ Sent",
                            "Cancelled":    "✕ Cancelled",
                        })[root.displayState] ?? root.displayState
                        color: Appearance.m3colors.m3primary
                        font.pixelSize: Appearance.font.pixelSize.small
                    }
                }

                Item {
                    Layout.fillWidth: true   // spacer: badge left, close right
                }

                RippleButton {
                    Layout.alignment: Qt.AlignVCenter
                    buttonRadius: Appearance.rounding.full
                    implicitWidth: 35
                    implicitHeight: 35
                    colBackground: "transparent"
                    colBackgroundHover: Appearance.colors.colLayer2Hover
                    colRipple: Appearance.colors.colLayer2Active
                    onClicked: GlobalStates.dictationOpen = false
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "close"
                        color: Appearance.m3colors.m3onSurfaceVariant
                        iconSize: 20
                    }
                }
            }

            // Scrollable transcript: StyledFlickable (styled scrollbar + wheel
            // support) + StyledText sized by its own implicitHeight. The
            // StyledText anchors its width to the flickable so wrapping is
            // correct, and the flickable tracks the real content height.
            StyledFlickable {
                id: transcriptFlick
                Layout.fillWidth: true
                Layout.preferredHeight: 6 * 18 + 8   // ~6 lines of 18px monospace
                Layout.maximumHeight: 6 * 18 + 8
                clip: true
                contentHeight: transcriptLabel.height
                StyledText {
                    id: transcriptLabel
                    width: transcriptFlick.width
                    height: implicitHeight   // text defines content height
                    text: root.voiceTranscript
                    color: Appearance.m3colors.m3onSurface
                    font.pixelSize: Appearance.font.pixelSize.normal
                    font.family: Appearance.font.family.monospace
                    wrapMode: Text.Wrap   // word wrap: never cut words mid-way
                    elide: Text.ElideNone
                    verticalAlignment: Text.AlignTop
                    onTextChanged: {
                        // Auto-scroll ONLY when the content overflows the
                        // viewport. When it does, align the BOTTOM of the text
                        // with the bottom of the viewport (contentY must be
                        // contentHeight - height, NOT contentHeight — the
                        // latter scrolls a full viewport past the text).
                        if (transcriptFlick.contentHeight > transcriptFlick.height) {
                            transcriptFlick.contentY = transcriptFlick.contentHeight - transcriptFlick.height
                        } else {
                            transcriptFlick.contentY = 0
                        }
                    }
                }
            }
        }
    }
}
