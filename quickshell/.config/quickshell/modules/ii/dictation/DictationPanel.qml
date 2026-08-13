pragma ComponentBehavior: Bound
import qs
import qs.services
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
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

    // ---- input device selection: dropdown next to the badge ----
    property var deviceList: []            // [{id, label, monitor}] from list_devices.py
    property bool deviceListOpen: false    // inline device list expanded
    property int deviceChoice: -2          // -2 = default (None), -1 = unset, >=0 = device id
    property string deviceChoiceLabel: "Default (mic)"

    function loadDevices() {
        // query once per panel open; the helper lists capture-capable devices
        // (incl. the "Default (mic)" entry). Use a declarative Process reading
        // stdout directly -- simplest reliable path in quickshell.
        if (devicesProc.running) return
        devicesProc.running = true
    }

    function loadDeviceChoice() {
        // sync the dropdown with the persisted config (the sidecar reads it,
        // so the picker must SHOW what's actually capturing). Called AFTER
        // deviceList is populated (from devicesProc.onRead) so find() works.
        if (choiceProc.running) return
        choiceProc.running = true
    }

    function applyDeviceChoice(id: int) {
        root.deviceChoice = id
        const dev = root.deviceList.find(d => d.id === id)
        const label = dev?.label ?? "Default (mic)"
        root.deviceChoiceLabel = label
        // persist for the sidecar: store the DEVICE NAME (stable). Numeric
        // sounddevice indices shift between enumerations; names don't. The
        // sidecar resolves the name to the current index at runtime.
        // ONE atomic execDetached updates BOTH the sidecar config AND the
        // cava source, so the two can never diverge (crash between two
        // separate calls would leave them inconsistent).
        const val = id >= 0 ? (dev?.name ?? String(id)) : "None"
        const pw = dev?.pw_source ?? "@DEFAULT_SOURCE@"
        const cfg = `/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/cava/mic_input_config.txt`
        const tmp = `/tmp/cava_dictation_config.txt`
        Quickshell.execDetached(["bash", "-c",
            `printf '%s' '${val}' > /home/razvan/.local/share/tts-read/mic_device.conf && ` +
            `sed 's|^source = .*|source = ${pw}|' '${cfg}' > '${tmp}' && cp '${tmp}' '${cfg}' && ` +
            `pkill -f 'cava -p' 2>/dev/null; true`])
        // cava restarts via the declarative restartTimer below
        cavaProc.running = false
        cavaRestartTimer.restart()

        // RESTART the sidecar: a fresh process reads the new config cleanly
        // (the in-process device swap is fragile -- channel/PortAudio quirks,
        // index shifts). The sidecar starts on the newly written device.
        // It commits/cancels cleanly on SIGTERM (no in-flight commit -> exit).
        sidecarProc.running = false
        sidecarRestartTimer.restart()
    }

    // ---- sidecar process: JSON events -> panel state ----
    property real voiceRms: 0.0
    property list<real> voicePoints: []
    property string voiceTranscript: ""

    // reset stale transcript when a new dictation session opens
    onVisibleChanged: {
        if (visible) {
            root.voiceTranscript = ""
            root.voiceState = "Listening"
            root.hasError = false
            root.errorMessage = ""
            root.displayState = "Listening"
            errorTimer.stop()
            root.loadDevices()
        }
    }
    property string voiceState: "Listening"
    property string errorMessage: ""
    property bool hasError: false

    // show an error for a few seconds, then close instead of vanishing
    Timer {
        id: errorTimer
        interval: 4000
        onTriggered: GlobalStates.dictationOpen = false
    }
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
        id: choiceProc
        command: ["cat", "/home/razvan/.local/share/tts-read/mic_device.conf"]
        running: false
        stdout: SplitParser {
            onRead: data => {
                try {
                    const v = String(data).trim()
                    let id = -2   // default mic
                    if (v && v !== "None" && v !== "none") {
                        const n = parseInt(v, 10)
                        if (!isNaN(n)) {
                            id = n   // legacy numeric config
                        } else {
                            // name config: find the device by its stable name
                            const dev = root.deviceList.find(d => d.name === v)
                            if (dev) id = dev.id
                        }
                    }
                    root.deviceChoice = id
                    root.deviceChoiceLabel = root.deviceList.find(d => d.id === id)?.label ?? "Default (mic)"
                    // ALSO sync cava's source so the waveform matches the
                    // sidecar (which follows the same config).
                    const dev2 = root.deviceList.find(d => d.id === id)
                    const pw = dev2?.pw_source ?? "@DEFAULT_SOURCE@"
                    const cfg = `/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/cava/mic_input_config.txt`
                    const tmp = `/tmp/cava_dictation_config.txt`
                    Quickshell.execDetached(["bash", "-c",
                        `sed 's|^source = .*|source = ${pw}|' '${cfg}' > '${tmp}' && cp '${tmp}' '${cfg}' && pkill -f 'cava -p' 2>/dev/null; true`])
                    cavaProc.running = false
                    cavaRestartTimer.restart()
                } catch (e) {}
            }
        }
    }

    Process {
        id: devicesProc
        command: ["/home/razvan/.dotfiles/quickshell/.config/quickshell/modules/ii/dictation/list_devices.py"]
        running: false
        stdout: SplitParser {
            onRead: data => {
                try {
                    const arr = JSON.parse(data)
                    if (Array.isArray(arr) && arr.length > 0) {
                        root.deviceList = arr
                        // NOW the list exists: apply the persisted choice
                        root.loadDeviceChoice()
                    }
                } catch (e) {}
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
                            root.errorMessage = msg.message ?? "Unknown error"
                            root.hasError = true
                            root.displayState = "Error"
                            errorTimer.restart()
                            break
                    }
                } catch(e) {}
            }
        }
        onExited: (code, status) => {
            // if we're showing an error, let the timer close the panel so the
            // user actually sees it; otherwise close immediately.
            if (GlobalStates.dictationOpen && !root.hasError) {
                GlobalStates.dictationOpen = false
            }
        }
    }

    // REAL audio waveform: cava captures the mic (BT headset) and emits
    // frequency-band amplitudes, exactly like the media player's visualizer.
    Timer {
        id: cavaRestartTimer
        interval: 300
        onTriggered: cavaProc.running = GlobalStates.dictationOpen
    }
    Timer {
        id: sidecarRestartTimer
        interval: 400
        onTriggered: sidecarProc.running = GlobalStates.dictationOpen
    }

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
        // PASTE-BASED commit: persistent clipboard + app-aware paste key.
        // We save the old clipboard, set the dictation text, paste, then
        // restore -- so the user's clipboard (e.g. TTS's) is untouched and
        // flatpak apps (Vivaldi) can read it through the sandbox portal.
        // APP-AWARE paste: terminals use ctrl+alt+v (kitty.conf maps it to
        // paste_from_clipboard -- PROVEN KITTY-ALT-V-*), GUI apps use ctrl+v
        // (native). NEVER ctrl+shift+v: wtype+Hyprland sends Escape (65307)
        // for ctrl+shift+ANY-key -> gnome-system-monitor bug.
        // PASTE VIA SCRIPT FILE: Quickshell.execDetached silently no-ops on
        // long inline bash strings (known quickshell issue). Write the text
        // to a file, then execDetach a SHORT command that runs the paste
        // script -- the script does clipboard save/set/paste/restore.
        // BASE64 transport: the dictation text can contain $, quotes, newlines
        // -- any shell metacharacter -- so we encode it in QML and decode in
        // bash. No escaping of the payload is ever interpreted.
        const b64 = Qt.btoa(text)
        Quickshell.execDetached(["bash", "-c", `echo '${b64}' | base64 -d > /tmp/dict_commit.txt && /home/razvan/.dotfiles/quickshell/.config/quickshell/modules/ii/dictation/paste_commit.sh`])
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
        // device-list expand/collapse: growing the bar shifts it UP to stay on
        // screen; collapsing returns it to the position it had before expand.
        property real savedY: -1
        onHeightChanged: {
            if (!visible) return
            const sh = root.screen?.height ?? 1080
            if (root.deviceListOpen) {
                if (y + height > sh) {
                    if (savedY < 0) savedY = y
                    y = sh - height - 40
                }
            } else if (savedY >= 0) {
                y = savedY
                savedY = -1
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
                            "Error":       "⚠ Error: " + root.errorMessage
                        })[root.displayState] ?? root.displayState
                        color: root.hasError
                               ? Qt.rgba(0.85, 0.35, 0.35, 1.0)
                               : Appearance.m3colors.m3primary
                        font.pixelSize: Appearance.font.pixelSize.small
                    }
                }

                // input device picker (mic / monitors) -- the sidecar swaps
                // live via mic_device.conf; applies when idle / at next pause.
                // Inline expandable list (NOT a Qt popup: layer-shell popups
                // escape the window mask and clicks pass through).
                Rectangle {
                    id: devicePicker
                    Layout.alignment: Qt.AlignVCenter
                    Layout.preferredWidth: 190
                    implicitHeight: 26            // match the badge's height
                    radius: Appearance.rounding.small
                    color: devicePickerHover.hovered
                           ? Qt.rgba(Appearance.m3colors.m3primary.r, Appearance.m3colors.m3primary.g, Appearance.m3colors.m3primary.b, 0.3)
                           : Qt.rgba(Appearance.m3colors.m3primary.r, Appearance.m3colors.m3primary.g, Appearance.m3colors.m3primary.b, 0.25)   // same alpha as the badge

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 8
                        spacing: 6
                        MaterialSymbol {
                            text: "mic"
                            iconSize: 14
                            color: Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.fillWidth: true
                            text: root.deviceChoiceLabel
                            elide: Text.ElideRight
                            color: Appearance.m3colors.m3onSurface
                            font.pixelSize: Appearance.font.pixelSize.small
                        }
                        MaterialSymbol {
                            text: "keyboard_arrow_down"
                            iconSize: 14
                            color: Appearance.m3colors.m3onSurfaceVariant
                            rotation: root.deviceListOpen ? 180 : 0
                            Behavior on rotation { NumberAnimation { duration: 150 } }
                        }
                    }

                    MouseArea {
                        id: devicePickerHover
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.deviceListOpen = !root.deviceListOpen
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
            }   // end top row RowLayout
            // device list: grows the bar like a real dropdown. The bar shifts
            // up when it grows and returns when collapsed (see onHeightChanged).
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: root.deviceListOpen ? Math.min(root.deviceList.length * 26 + 8, 220) : 0
                Layout.maximumHeight: root.deviceListOpen ? Math.min(root.deviceList.length * 26 + 8, 220) : 0
                radius: Appearance.rounding.small
                color: Appearance.m3colors.m3surfaceContainerHigh
                clip: true
                visible: root.deviceListOpen

                ListView {
                    anchors.fill: parent
                    anchors.margins: 4
                    clip: true
                    model: root.deviceList
                    delegate: Rectangle {
                        required property var modelData
                        readonly property var dev: typeof modelData === 'object' ? modelData : ({id: -2, label: String(modelData)})
                        width: ListView.view.width
                        height: 24
                        radius: Appearance.rounding.small
                        color: devItemMouse.hovered
                               ? Qt.rgba(Appearance.m3colors.m3primary.r, Appearance.m3colors.m3primary.g, Appearance.m3colors.m3primary.b, 0.2)
                               : "transparent"
                        StyledText {
                            anchors.left: parent.left
                            anchors.leftMargin: 8
                            anchors.verticalCenter: parent.verticalCenter
                            text: dev.label
                            color: dev.id === root.deviceChoice
                                   ? Appearance.m3colors.m3primary
                                   : Appearance.m3colors.m3onSurface
                            font.pixelSize: Appearance.font.pixelSize.small
                        }
                        MouseArea {
                            id: devItemMouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.applyDeviceChoice(dev.id)
                                root.deviceListOpen = false
                            }
                        }
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
                // Drags must NOT scroll the text (they move the whole panel):
                // disable flick interaction. Wheel scrolling is handled by the
                // dedicated wheel MouseArea below (always visible), so it keeps
                // working with interactive:false.
                interactive: false

                // wheel-only scroll (drag passes through to the window drag)
                MouseArea {
                    anchors.fill: parent
                    acceptedButtons: Qt.NoButton
                    onWheel: function(wheelEvent) {
                        const dy = wheelEvent.angleDelta.y
                        if (dy !== 0) {
                            transcriptFlick.contentY = Math.max(0, Math.min(
                                transcriptFlick.contentY - dy * 0.5,
                                transcriptFlick.contentHeight - transcriptFlick.height))
                        }
                    }
                }
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
