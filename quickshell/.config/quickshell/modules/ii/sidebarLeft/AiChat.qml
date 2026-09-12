import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import qs.modules.ii.sidebarLeft.aiChat
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Qt5Compat.GraphicalEffects
import Quickshell
import Quickshell.Io

Item {
    id: root
    property real padding: 4
    property var inputField: messageInputField
    property string commandPrefix: "/"

    property var suggestionQuery: ""
    property var suggestionList: []
    property bool voiceActive: false
    property bool voiceMuted: false
    property real voiceRms: 0.0
    property list<real> voicePoints: []
    property string voiceTranscript: ""
    property string voiceAgentOutput: ""
    property string voiceAgentState: "Idle"

    onFocusChanged: focus => {
        if (focus) {
            root.inputField.forceActiveFocus();
        }
    }

    Keys.onPressed: event => {
        messageInputField.forceActiveFocus();
        if (event.modifiers === Qt.NoModifier) {
            if (event.key === Qt.Key_PageUp) {
                messageListView.contentY = Math.max(0, messageListView.contentY - messageListView.height / 2);
                event.accepted = true;
            } else if (event.key === Qt.Key_PageDown) {
                messageListView.contentY = Math.min(messageListView.contentHeight - messageListView.height / 2, messageListView.contentY + messageListView.height / 2);
                event.accepted = true;
            }
        }
        if ((event.modifiers & Qt.ControlModifier) && (event.modifiers & Qt.ShiftModifier) && event.key === Qt.Key_O) {
            Ai.clearMessages();
        }
    }

    property var allCommands: [
        {
            name: "voice",
            description: Translation.tr("Toggle voice call (start / stop) using Hermes Voice Agent"),
            execute: args => {
                const action = (args[0] ?? (root.voiceActive ? "stop" : "start")).toLowerCase();
                if (action === "stop" || root.voiceActive) {
                    root.voiceActive = false;
                    Ai.addMessage(Translation.tr("Voice Call ended."), Ai.interfaceRole);
                } else {
                    root.voiceActive = true;
                    Ai.addMessage(Translation.tr("Voice Call started — connecting to Hermes…"), Ai.interfaceRole);
                }
            }
        },
        {
            name: "profile",
            description: Translation.tr("Choose or list Hermes profiles (e.g. /profile reviewer, /profile default)"),
            execute: args => {
                if (args.length === 0 || args[0] === "get" || args[0] === "list") {
                    Ai.printProfiles();
                } else {
                    const prof = args[0].trim();
                    if (root.voiceActive) {
                        voiceClientProc.write(`profile ${prof}\n`);
                    }
                    Ai.setProfile(prof);
                }
            }
        },
        {
            name: "attach",
            description: Translation.tr("Attach a file. Only works with Gemini."),
            execute: args => {
                Ai.attachFile(args.join(" ").trim());
            }
        },
        {
            name: "provider",
            description: Translation.tr("Choose or list AI providers (e.g. hermes, workstation, ollama)"),
            execute: args => {
                if (args.length === 0 || args[0] === "get" || args[0] === "list") {
                    Ai.printProviders();
                } else {
                    Ai.setProvider(args[0].trim());
                }
            }
        },
        {
            name: "model",
            description: Translation.tr("Choose or list models for the active provider"),
            execute: args => {
                if (args.length === 0 || args[0] === "get" || args[0] === "list") {
                    Ai.printModels();
                } else {
                    Ai.setModel(args.join(" ").trim());
                }
            }
        },
        {
            name: "tool",
            description: Translation.tr("Set the tool to use for the model."),
            execute: args => {
                // console.log(args)
                if (args.length == 0 || args[0] == "get") {
                    Ai.addMessage(Translation.tr("Usage: %1tool TOOL_NAME").arg(root.commandPrefix), Ai.interfaceRole);
                } else {
                    const tool = args[0];
                    const switched = Ai.setTool(tool);
                    if (switched) {
                        Ai.addMessage(Translation.tr("Tool set to: %1").arg(tool), Ai.interfaceRole);
                    }
                }
            }
        },
        {
            name: "prompt",
            description: Translation.tr("Set the system prompt for the model."),
            execute: args => {
                if (args.length === 0 || args[0] === "get") {
                    Ai.printPrompt();
                    return;
                }
                Ai.loadPrompt(args.join(" ").trim());
            }
        },
        {
            name: "key",
            description: Translation.tr("Set API key"),
            execute: args => {
                if (args[0] == "get") {
                    Ai.printApiKey();
                } else {
                    Ai.setApiKey(args[0]);
                }
            }
        },
        {
            name: "save",
            description: Translation.tr("Save chat"),
            execute: args => {
                const joinedArgs = args.join(" ");
                if (joinedArgs.trim().length == 0) {
                    Ai.addMessage(Translation.tr("Usage: %1save CHAT_NAME").arg(root.commandPrefix), Ai.interfaceRole);
                    return;
                }
                Ai.saveChat(joinedArgs);
            }
        },
        {
            name: "load",
            description: Translation.tr("Load chat"),
            execute: args => {
                const joinedArgs = args.join(" ");
                if (joinedArgs.trim().length == 0) {
                    Ai.addMessage(Translation.tr("Usage: %1load CHAT_NAME").arg(root.commandPrefix), Ai.interfaceRole);
                    return;
                }
                Ai.loadChat(joinedArgs);
            }
        },
        {
            name: "clear",
            description: Translation.tr("Clear chat history"),
            execute: () => {
                Ai.clearMessages();
            }
        },
        {
            name: "temp",
            description: Translation.tr("Set temperature (randomness) of the model. Values range between 0 to 2 for Gemini, 0 to 1 for other models. Default is 0.5."),
            execute: args => {
                // console.log(args)
                if (args.length == 0 || args[0] == "get") {
                    Ai.printTemperature();
                } else {
                    const temp = parseFloat(args[0]);
                    Ai.setTemperature(temp);
                }
            }
        },
        {
            name: "test",
            description: Translation.tr("Markdown test"),
            execute: () => {
                Ai.addMessage(`
<think>
A longer think block to test revealing animation
OwO wem ipsum dowo sit amet, consekituwet awipiscing ewit, sed do eiuwsmod tempow inwididunt ut wabowe et dowo mawa. Ut enim ad minim weniam, quis nostwud exeucitation uwuwamcow bowowis nisi ut awiquip ex ea commowo consequat. Duuis aute iwuwe dowo in wepwependewit in wowuptate velit esse ciwwum dowo eu fugiat nuwa pawiatuw. Excepteuw sint occaecat cupidatat non pwowoident, sunt in cuwpa qui officia desewunt mowit anim id est wabowum. Meouw! >w<
Mowe uwu wem ipsum!
</think>
## ✏️ Markdown test
### Formatting

- *Italic*, \`Monospace\`, **Bold**, [Link](https://example.com)
- Arch lincox icon <img src="${Quickshell.shellPath("assets/icons/arch-symbolic.svg")}" height="${Appearance.font.pixelSize.small}"/>

### Table

Quickshell vs AGS/Astal

|                          | Quickshell       | AGS/Astal         |
|--------------------------|------------------|-------------------|
| UI Toolkit               | Qt               | Gtk3/Gtk4         |
| Language                 | QML              | Js/Ts/Lua         |
| Reactivity               | Implied          | Needs declaration |
| Widget placement         | Mildly difficult | More intuitive    |
| Bluetooth & Wifi support | ❌               | ✅                |
| No-delay keybinds        | ✅               | ❌                |
| Development              | New APIs         | New syntax        |

### Code block

Just a hello world...

\`\`\`cpp
#include <bits/stdc++.h>
// This is intentionally very long to test scrolling
const std::string GREETING = \"UwU\";
int main(int argc, char* argv[]) {
    std::cout << GREETING;
}
\`\`\`

### LaTeX


Inline w/ dollar signs: $\\frac{1}{2} = \\frac{2}{4}$

Inline w/ double dollar signs: $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

Inline w/ backslash and square brackets \\[\\int_0^\\infty \\frac{1}{x^2} dx = \\infty\\]

Inline w/ backslash and round brackets \\(e^{i\\pi} + 1 = 0\\)
`, Ai.interfaceRole);
            }
        },
    ]

    function handleInput(inputText) {
        if (inputText.startsWith(root.commandPrefix)) {
            // Handle special commands
            const command = inputText.split(" ")[0].substring(1);
            const args = inputText.split(" ").slice(1);
            const commandObj = root.allCommands.find(cmd => cmd.name === `${command}`);
            if (commandObj) {
                commandObj.execute(args);
            } else {
                Ai.addMessage(Translation.tr("Unknown command: ") + command, Ai.interfaceRole);
            }
        } else {
            if (root.voiceActive) {
                voiceClientProc.write(`text ${inputText}\n`);
            } else {
                Ai.sendUserMessage(inputText);
            }
        }

        // Always scroll to bottom when user sends a message
        messageListView.positionViewAtEnd();
    }

    // Waveform animation timer: synthesises bar values from voiceRms
    Timer {
        id: waveformTimer
        running: root.voiceActive
        interval: 50
        repeat: true
        property real phase: 0
        onTriggered: {
            phase += 0.25
            const n = 40
            // Waveform amplitude is strictly driven by live microphone input (root.voiceRms)
            const minAmp = 12
            const amp = Math.max(minAmp, root.voiceRms * 500)
            const pts = []
            for (let i = 0; i < n; i++) {
                const x = (i / n) * Math.PI * 6
                const v = amp * (0.45 + 0.55 * Math.abs(Math.sin(x + phase)))
                             * (0.5  + 0.5  * Math.abs(Math.sin(x * 1.9 + phase * 0.7)))
                pts.push(v)
            }
            root.voicePoints = pts
        }
    }

    Process {
        id: voiceClientProc
        running: root.voiceActive
        command: ["/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/ai/quickshell_voice_client.py"]
        stdout: SplitParser {
            onRead: data => {
                try {
                    const msg = JSON.parse(data)
                    switch (msg.type) {
                        case "connected":
                            Ai.addMessage(Translation.tr("🟢 Voice Call connected — speak into your microphone."), Ai.interfaceRole);
                            break;
                        case "session_info":
                            if (msg.profile) {
                                Ai.addMessage(`🎙️ Active Hermes Profile: **${msg.profile}** (Session: \`${msg.session_id}\`)`, Ai.interfaceRole);
                            }
                            break;
                        case "update_audio":
                            root.voiceRms = msg.rms ?? 0
                            break
                        case "update_transcript":
                            root.voiceTranscript = msg.text ?? ""
                            break
                        case "update_agent_output":
                            root.voiceAgentOutput = msg.text ?? ""
                            break
                        case "update_agent_state":
                            root.voiceAgentState = msg.state ?? "Idle"
                            if (msg.state === "Idle" || msg.state === "Listening") {
                                root.voiceAgentOutput = ""
                            }
                            break
                        case "update_mic_status":
                            root.voiceMuted = msg.muted ?? false
                            break
                        case "add_message":
                            if (msg.text && msg.text.trim().length > 0) {
                                const targetRole = msg.sender === "Agent" ? "assistant" :
                                                 msg.sender === "User" ? "user" : Ai.interfaceRole;
                                Ai.addMessage(msg.text, targetRole);
                                if (msg.sender === "User") root.voiceTranscript = "";
                            }
                            break
                        case "error":
                            Ai.addMessage("🎙️ " + (msg.message ?? "Voice error"), Ai.interfaceRole)
                            root.voiceActive = false
                            break
                        case "disconnected":
                            root.voiceRms = 0
                            root.voiceTranscript = ""
                            root.voiceAgentOutput = ""
                            root.voiceAgentState = "Idle"
                            root.voiceMuted = false
                            break
                    }
                } catch(e) {}
            }
        }
    }

    Process {
        id: voiceConfigProc
        property string action: "get"
        stdout: SplitParser {
            onRead: data => {
                try {
                    const resp = JSON.parse(data);
                    if (resp.status === "ok") {
                        if (voiceConfigProc.action === "get") {
                            const cur = resp.config?.agent?.profile ?? "default";
                            const list = (resp.available_profiles ?? []).join(", ");
                            Ai.addMessage(`🎙️ Hermes Voice Profile: **${cur}**\nAvailable profiles: \`${list}\`\n\nTo switch profile: \`/profile <name>\``, Ai.interfaceRole);
                        } else {
                            const cur = resp.config?.agent?.profile ?? "default";
                            Ai.addMessage(`🎙️ Switched Hermes Voice Profile to: **${cur}**`, Ai.interfaceRole);
                        }
                    } else {
                        Ai.addMessage(`🎙️ Error: ${resp.message ?? "Failed to update voice config"}`, Ai.interfaceRole);
                    }
                } catch(e) {
                    Ai.addMessage("🎙️ Could not communicate with Hermes Voice service. Is it running?", Ai.interfaceRole);
                }
            }
        }
    }

    Process {
        id: decodeImageAndAttachProc
        property string imageDecodePath: Directories.cliphistDecode
        property string imageDecodeFileName: "image"
        property string imageDecodeFilePath: `${imageDecodePath}/${imageDecodeFileName}`
        function handleEntry(entry: string) {
            imageDecodeFileName = parseInt(entry.match(/^(\d+)\t/)[1]);
            decodeImageAndAttachProc.exec(["bash", "-c", `[ -f ${imageDecodeFilePath} ] || echo '${StringUtils.shellSingleQuoteEscape(entry)}' | ${Cliphist.cliphistBinary} decode > '${imageDecodeFilePath}'`]);
        }
        onExited: (exitCode, exitStatus) => {
            if (exitCode === 0) {
                Ai.attachFile(imageDecodeFilePath);
            } else {
                console.error("[AiChat] Failed to decode image in clipboard content");
            }
        }
    }

    component StatusItem: MouseArea {
        id: statusItem
        property string icon
        property string statusText
        property string description
        hoverEnabled: true
        implicitHeight: statusItemRowLayout.implicitHeight
        implicitWidth: statusItemRowLayout.implicitWidth

        RowLayout {
            id: statusItemRowLayout
            spacing: 0
            MaterialSymbol {
                text: statusItem.icon
                iconSize: Appearance.font.pixelSize.huge
                color: Appearance.colors.colSubtext
            }
            StyledText {
                font.pixelSize: Appearance.font.pixelSize.small
                text: statusItem.statusText
                color: Appearance.colors.colSubtext
                animateChange: true
            }
        }

        StyledToolTip {
            text: statusItem.description
            extraVisibleCondition: false
            alternativeVisibleCondition: statusItem.containsMouse
        }
    }

    component StatusSeparator: Rectangle {
        implicitWidth: 4
        implicitHeight: 4
        radius: implicitWidth / 2
        color: Appearance.colors.colOutlineVariant
    }

    ColumnLayout {
        id: columnLayout
        anchors {
            fill: parent
            margins: root.padding
        }
        spacing: root.padding

        Item {
            // Messages
            Layout.fillWidth: true
            Layout.fillHeight: true
            layer.enabled: true
            layer.effect: OpacityMask {
                maskSource: Rectangle {
                    width: swipeView.width
                    height: swipeView.height
                    radius: Appearance.rounding.small
                }
            }

            StyledRectangularShadow {
                z: 1
                target: statusBg
                opacity: messageListView.atYBeginning ? 0 : 1
                visible: opacity > 0
                Behavior on opacity {
                    animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                }
            }
            Rectangle {
                id: statusBg
                z: 2
                anchors {
                    horizontalCenter: parent.horizontalCenter
                    top: parent.top
                    topMargin: 4
                }
                implicitWidth: statusRowLayout.implicitWidth + 10 * 2
                implicitHeight: Math.max(statusRowLayout.implicitHeight, 38)
                radius: Appearance.rounding.normal - root.padding
                color: messageListView.atYBeginning ? Appearance.colors.colLayer2 : Appearance.colors.colLayer2Base
                Behavior on color {
                    animation: Appearance.animation.elementMoveFast.colorAnimation.createObject(this)
                }
                RowLayout {
                    id: statusRowLayout
                    anchors.centerIn: parent
                    spacing: 10

                    StatusItem {
                        icon: Ai.currentModelHasApiKey ? "key" : "key_off"
                        statusText: ""
                        description: Ai.currentModelHasApiKey ? Translation.tr("API key is set\nChange with /key YOUR_API_KEY") : Translation.tr("No API key\nSet it with /key YOUR_API_KEY")
                    }
                    StatusSeparator {}
                    StatusItem {
                        icon: "device_thermostat"
                        statusText: Ai.temperature.toFixed(1)
                        description: Translation.tr("Temperature\nChange with /temp VALUE")
                    }
                    StatusSeparator {
                        visible: Ai.tokenCount.total > 0
                    }
                    StatusItem {
                        visible: Ai.tokenCount.total > 0
                        icon: "token"
                        statusText: Ai.tokenCount.total
                        description: Translation.tr("Total token count\nInput: %1\nOutput: %2").arg(Ai.tokenCount.input).arg(Ai.tokenCount.output)
                    }
                }
            }

            ScrollEdgeFade {
                z: 1
                target: messageListView
                vertical: true
            }

            StyledListView { // Message list
                id: messageListView
                z: 0
                anchors.fill: parent
                spacing: 10
                popin: false
                topMargin: statusBg.implicitHeight + statusBg.anchors.topMargin * 2

                touchpadScrollFactor: Config.options.interactions.scrolling.touchpadScrollFactor * 1.4
                mouseScrollFactor: Config.options.interactions.scrolling.mouseScrollFactor * 1.4

                property int lastResponseLength: 0
                property bool userNearBottom: atYEnd || (contentHeight - contentY - height < 150)

                onContentHeightChanged: {
                    if (userNearBottom)
                        Qt.callLater(positionViewAtEnd);
                }
                onCountChanged: {
                    if (userNearBottom)
                        Qt.callLater(positionViewAtEnd);
                }

                add: null // Prevent function calls from being janky

                model: ScriptModel {
                    values: Ai.messageIDs.filter(id => {
                        const message = Ai.messageByID[id];
                        return message?.visibleToUser ?? true;
                    })
                }
                delegate: AiMessage {
                    required property var modelData
                    required property int index
                    messageIndex: index
                    messageData: {
                        Ai.messageByID[modelData];
                    }
                    messageInputField: root.inputField
                }
            }

            PagePlaceholder {
                z: 2
                shown: Ai.messageIDs.length === 0
                icon: "neurology"
                title: Translation.tr("Large language models")
                description: Translation.tr("Type /key to get started with online models\nCtrl+O to expand sidebar\nCtrl+P to pin sidebar\nCtrl+D to detach sidebar")
                shape: MaterialShape.Shape.PixelCircle
            }

            ScrollToBottomButton {
                z: 3
                target: messageListView
            }
        }

        DescriptionBox {
            text: root.suggestionList[suggestions.selectedIndex]?.description ?? ""
            showArrows: root.suggestionList.length > 1
        }

        FlowButtonGroup { // Suggestions
            id: suggestions
            visible: root.suggestionList.length > 0 && messageInputField.text.length > 0
            property int selectedIndex: 0
            Layout.fillWidth: true
            spacing: 5

            Repeater {
                id: suggestionRepeater
                model: {
                    suggestions.selectedIndex = 0;
                    return root.suggestionList.slice(0, 10);
                }
                delegate: ApiCommandButton {
                    id: commandButton
                    colBackground: suggestions.selectedIndex === index ? Appearance.colors.colSecondaryContainerHover : Appearance.colors.colSecondaryContainer
                    bounce: false
                    contentItem: StyledText {
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.m3colors.m3onSurface
                        horizontalAlignment: Text.AlignHCenter
                        text: modelData.displayName ?? modelData.name
                    }

                    onHoveredChanged: {
                        if (commandButton.hovered) {
                            suggestions.selectedIndex = index;
                        }
                    }
                    onClicked: {
                        suggestions.acceptSuggestion(modelData.name);
                    }
                }
            }

            function acceptSuggestion(word) {
                const words = messageInputField.text.trim().split(/\s+/);
                if (words.length > 0) {
                    words[words.length - 1] = word;
                } else {
                    words.push(word);
                }
                const updatedText = words.join(" ") + " ";
                messageInputField.text = updatedText;
                messageInputField.cursorPosition = messageInputField.text.length;
                messageInputField.forceActiveFocus();
            }

            function acceptSelectedWord() {
                if (suggestions.selectedIndex >= 0 && suggestions.selectedIndex < suggestionRepeater.count) {
                    const word = root.suggestionList[suggestions.selectedIndex].name;
                    suggestions.acceptSuggestion(word);
                }
            }
        }

        Item { // Input area wrapper (text input OR voice waveform)
            id: inputAreaWrapper
            Layout.fillWidth: true
            implicitHeight: root.voiceActive ? voiceOverlay.implicitHeight : inputWrapper.implicitHeight
            Behavior on implicitHeight {
                animation: Appearance.animation.elementMove.numberAnimation.createObject(this)
            }

            // ── Voice waveform overlay ───────────────────────────────────
            Rectangle {
                id: voiceOverlay
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                implicitHeight: 80
                radius: Appearance.rounding.normal - root.padding
                color: Appearance.colors.colLayer2
                opacity: root.voiceActive ? 1 : 0
                visible: opacity > 0
                Behavior on opacity {
                    animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                }
                clip: true

                // Animated gradient background
                Rectangle {
                    anchors.fill: parent
                    radius: parent.radius
                    color: "transparent"
                    Rectangle {
                        anchors.fill: parent
                        radius: parent.parent.radius
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0.0; color: Qt.rgba(Appearance.colors.colPrimary.r, Appearance.colors.colPrimary.g, Appearance.colors.colPrimary.b, 0.06) }
                            GradientStop { position: 0.5; color: Qt.rgba(Appearance.colors.colPrimary.r, Appearance.colors.colPrimary.g, Appearance.colors.colPrimary.b, 0.12) }
                            GradientStop { position: 1.0; color: Qt.rgba(Appearance.colors.colPrimary.r, Appearance.colors.colPrimary.g, Appearance.colors.colPrimary.b, 0.06) }
                        }
                    }
                }

                // Waveform (animated bars driven by voiceRms from the pipeline)
                WaveVisualizer {
                    id: micWaveVisualizer
                    anchors.fill: parent
                    anchors.margins: 4
                    live: root.voiceActive
                    points: root.voicePoints
                    maxVisualizerValue: 100
                    smoothing: 2
                    color: Appearance.colors.colPrimary
                }

                // Top-left Status Badges Row
                Row {
                    anchors.left: parent.left
                    anchors.top: parent.top
                    anchors.margins: 8
                    spacing: 6

                    Rectangle {
                        radius: Appearance.rounding.small
                        color: Qt.rgba(Appearance.colors.colPrimary.r, Appearance.colors.colPrimary.g, Appearance.colors.colPrimary.b, 0.25)
                        implicitWidth: agentStateLabel.implicitWidth + 12
                        implicitHeight: agentStateLabel.implicitHeight + 6
                        StyledText {
                            id: agentStateLabel
                            anchors.centerIn: parent
                            text: ({
                                    "Idle":         Translation.tr("Listening"),
                                    "Listening":    Translation.tr("Listening"),
                                    "Transcribing": Translation.tr("Transcribing…"),
                                    "Processing":   Translation.tr("Thinking…"),
                                    "Thinking":     Translation.tr("Thinking…"),
                                    "Speaking":     Translation.tr("Speaking"),
                                })[root.voiceAgentState] ?? root.voiceAgentState
                            color: Appearance.colors.colPrimary
                            font.pixelSize: Appearance.font.pixelSize.small
                            Behavior on text {
                                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                            }
                        }
                    }

                    Rectangle {
                        radius: Appearance.rounding.small
                        color: root.voiceMuted ? Qt.rgba(1.0, 0.3, 0.3, 0.3) : "transparent"
                        visible: root.voiceMuted
                        implicitWidth: micMutedLabel.implicitWidth + 10
                        implicitHeight: micMutedLabel.implicitHeight + 6
                        StyledText {
                            id: micMutedLabel
                            anchors.centerIn: parent
                            text: Translation.tr("Muted")
                            color: Appearance.colors.colError
                            font.pixelSize: Appearance.font.pixelSize.small
                        }
                    }
                }



                // Top-right Control Action Buttons Row
                Row {
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 6
                    spacing: 6

                    // Mute / Unmute Button
                    RippleButton {
                        implicitWidth: 32
                        implicitHeight: 32
                        buttonRadius: Appearance.rounding.small
                        colBackgroundToggled: root.voiceMuted ? Appearance.colors.colError : Appearance.colors.colSecondaryContainer
                        toggled: true
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.voiceMuted) {
                                    voiceClientProc.write("unmute\n");
                                } else {
                                    voiceClientProc.write("mute\n");
                                }
                            }
                        }
                        contentItem: MaterialSymbol {
                            anchors.centerIn: parent
                            text: root.voiceMuted ? "mic_off" : "mic"
                            iconSize: 18
                            color: root.voiceMuted ? Appearance.m3colors.m3onError : Appearance.m3colors.m3onSurface
                        }
                    }

                    // Stop / End Call Button
                    RippleButton {
                        implicitWidth: 32
                        implicitHeight: 32
                        buttonRadius: Appearance.rounding.small
                        colBackgroundToggled: Appearance.colors.colPrimary
                        toggled: true
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                voiceClientProc.write("stop\n");
                                root.voiceActive = false;
                                Ai.addMessage(Translation.tr("Voice Call ended."), Ai.interfaceRole);
                            }
                        }
                        contentItem: MaterialSymbol {
                            anchors.centerIn: parent
                            text: "call_end"
                            iconSize: 18
                            color: Appearance.m3colors.m3onPrimary
                        }
                    }
                }
            }

            Rectangle { // Input area
            id: inputWrapper
            property real spacing: 5
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            radius: Appearance.rounding.normal - root.padding
            color: Appearance.colors.colLayer2
            implicitHeight: (attachedFileIndicator.visible ? attachedFileIndicator.implicitHeight + spacing : 0)
                + Math.max(inputScrollView.implicitHeight, 40)
                + commandButtonsRow.implicitHeight
                + 18
            opacity: root.voiceActive ? 0 : 1
            visible: opacity > 0
            Behavior on opacity {
                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
            }
            clip: true

            Behavior on implicitHeight {
                animation: Appearance.animation.elementMove.numberAnimation.createObject(this)
            }

            AttachedFileIndicator {
                id: attachedFileIndicator
                anchors {
                    top: parent.top
                    left: parent.left
                    right: parent.right
                    margins: visible ? 5 : 0
                }
                filePath: Ai.pendingFilePath
                onRemove: Ai.attachFile("")
            }

            RowLayout { // Input field and send button
                id: inputFieldRowLayout
                anchors {
                    top: attachedFileIndicator.visible ? attachedFileIndicator.bottom : parent.top
                    topMargin: attachedFileIndicator.visible ? 5 : 4
                    bottom: commandButtonsRow.top
                    left: parent.left
                    right: parent.right
                    bottomMargin: 4
                }
                spacing: 0

                ScrollView {
                    id: inputScrollView
                    Layout.fillWidth: true
                    implicitHeight: Math.min(root.height * 3/5, Math.max(messageInputField.contentHeight + 20, 38))
                    Layout.preferredHeight: implicitHeight
                    clip: true
                    ScrollBar.vertical.policy: ScrollBar.AsNeeded

                    StyledTextArea { // The actual TextArea (inside ScrollView to enable scrolling)
                        id: messageInputField
                        anchors.fill: parent
                        wrapMode: TextArea.Wrap
                        padding: 10
                        color: activeFocus ? Appearance.m3colors.m3onSurface : Appearance.m3colors.m3onSurfaceVariant
                        placeholderText: Translation.tr('Message the model... "%1" for commands').arg(root.commandPrefix)

                        background: null

                        onTextChanged: {
                            // Handle suggestions
                            if (messageInputField.text.length === 0) {
                                root.suggestionQuery = "";
                                root.suggestionList = [];
                                return;
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}provider`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const provResults = Fuzzy.go(root.suggestionQuery, Ai.providerList.map(prov => {
                                    return {
                                        name: Fuzzy.prepare(prov),
                                        obj: prov
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = provResults.map(prov => {
                                    const p = Ai.providers[prov.target] || {};
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "provider ") : ""}${prov.target}`,
                                        displayName: `${p.name || prov.target}`,
                                        description: `${p.description || ""}`
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}profile`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const profResults = Fuzzy.go(root.suggestionQuery, Ai.profileList.map(p => {
                                    return {
                                        name: Fuzzy.prepare(p),
                                        obj: p
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = profResults.map(p => {
                                    const pObj = (Ai.profilesData || []).find(x => x.name === p.target) || {};
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "profile ") : ""}${p.target}`,
                                        displayName: `${p.target}${pObj.model ? " (" + pObj.model + ")" : ""}`,
                                        description: pObj.description || Translation.tr("Switch to Hermes profile %1").arg(p.target)
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}model`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const modelResults = Fuzzy.go(root.suggestionQuery, Ai.modelList.map(model => {
                                    return {
                                        name: Fuzzy.prepare(model),
                                        obj: model
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = modelResults.map(model => {
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "model ") : ""}${model.target}`,
                                        displayName: `${Ai.models[model.target]?.name || model.target}`,
                                        description: `${Ai.models[model.target]?.description || ""}`
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}prompt`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const promptFileResults = Fuzzy.go(root.suggestionQuery, Ai.promptFiles.map(file => {
                                    return {
                                        name: Fuzzy.prepare(file),
                                        obj: file
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = promptFileResults.map(file => {
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "prompt ") : ""}${file.target}`,
                                        displayName: `${FileUtils.trimFileExt(FileUtils.fileNameForPath(file.target))}`,
                                        description: Translation.tr("Load prompt from %1").arg(file.target)
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}save`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const promptFileResults = Fuzzy.go(root.suggestionQuery, Ai.savedChats.map(file => {
                                    return {
                                        name: Fuzzy.prepare(file),
                                        obj: file
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = promptFileResults.map(file => {
                                    const chatName = FileUtils.trimFileExt(FileUtils.fileNameForPath(file.target)).trim();
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "save ") : ""}${chatName}`,
                                        displayName: `${chatName}`,
                                        description: Translation.tr("Save chat to %1").arg(chatName)
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}load`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const promptFileResults = Fuzzy.go(root.suggestionQuery, Ai.savedChats.map(file => {
                                    return {
                                        name: Fuzzy.prepare(file),
                                        obj: file
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = promptFileResults.map(file => {
                                    const chatName = FileUtils.trimFileExt(FileUtils.fileNameForPath(file.target)).trim();
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "load ") : ""}${chatName}`,
                                        displayName: `${chatName}`,
                                        description: Translation.tr(`Load chat from %1`).arg(file.target)
                                    };
                                });
                            } else if (messageInputField.text.startsWith(`${root.commandPrefix}tool`)) {
                                root.suggestionQuery = messageInputField.text.split(" ")[1] ?? "";
                                const toolResults = Fuzzy.go(root.suggestionQuery, Ai.availableTools.map(tool => {
                                    return {
                                        name: Fuzzy.prepare(tool),
                                        obj: tool
                                    };
                                }), {
                                    all: true,
                                    key: "name"
                                });
                                root.suggestionList = toolResults.map(tool => {
                                    const toolName = tool.target;
                                    return {
                                        name: `${messageInputField.text.trim().split(" ").length == 1 ? (root.commandPrefix + "tool ") : ""}${tool.target}`,
                                        displayName: toolName,
                                        description: Ai.toolDescriptions[toolName]
                                    };
                                });
                            } else if (messageInputField.text.startsWith(root.commandPrefix)) {
                                root.suggestionQuery = messageInputField.text;
                                root.suggestionList = root.allCommands.filter(cmd => cmd.name.startsWith(messageInputField.text.substring(1))).map(cmd => {
                                    return {
                                        name: `${root.commandPrefix}${cmd.name}`,
                                        description: `${cmd.description}`
                                    };
                                });
                            }
                        }

                        function accept() {
                            root.handleInput(text);
                            text = "";
                        }

                        Keys.onPressed: event => {
                            if (event.key === Qt.Key_Tab) {
                                suggestions.acceptSelectedWord();
                                event.accepted = true;
                            } else if (event.key === Qt.Key_Up && suggestions.visible) {
                                suggestions.selectedIndex = Math.max(0, suggestions.selectedIndex - 1);
                                event.accepted = true;
                            } else if (event.key === Qt.Key_Down && suggestions.visible) {
                                suggestions.selectedIndex = Math.min(root.suggestionList.length - 1, suggestions.selectedIndex + 1);
                                event.accepted = true;
                            } else if ((event.key === Qt.Key_Enter || event.key === Qt.Key_Return)) {
                                if (event.modifiers & Qt.ShiftModifier) {
                                    // Insert newline
                                    messageInputField.insert(messageInputField.cursorPosition, "\n");
                                    event.accepted = true;
                                } else {
                                    // Accept text
                                    const inputText = messageInputField.text;
                                    messageInputField.clear();
                                    root.handleInput(inputText);
                                    event.accepted = true;
                                }
                            } else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_V) {
                                // Intercept Ctrl+V to handle image/file pasting
                                if (event.modifiers & Qt.ShiftModifier) {
                                    // Let Shift+Ctrl+V = plain paste
                                    messageInputField.text += Quickshell.clipboardText;
                                    event.accepted = true;
                                    return;
                                }
                                // Try image paste first
                                const currentClipboardEntry = Cliphist.entries[0];
                                const cleanCliphistEntry = StringUtils.cleanCliphistEntry(currentClipboardEntry);
                                if (/^\d+\t\[\[.*binary data.*\d+x\d+.*\]\]$/.test(currentClipboardEntry)) {
                                    // First entry = currently copied entry = image?
                                    decodeImageAndAttachProc.handleEntry(currentClipboardEntry);
                                    event.accepted = true;
                                    return;
                                } else if (cleanCliphistEntry.startsWith("file://")) {
                                    // First entry = currently copied entry = image?
                                    const fileName = decodeURIComponent(cleanCliphistEntry);
                                    Ai.attachFile(fileName);
                                    event.accepted = true;
                                    return;
                                }
                                event.accepted = false; // No image, let text pasting proceed
                            } else if (event.key === Qt.Key_Escape) {
                                // Esc to detach file
                                if (Ai.pendingFilePath.length > 0) {
                                    Ai.attachFile("");
                                    event.accepted = true;
                                } else {
                                    event.accepted = false;
                                }
                            }
                        }
                    }
                }
                RippleButton { // Send button
                    id: sendButton
                    Layout.alignment: Qt.AlignBottom
                    Layout.rightMargin: 5
                    implicitWidth: 40
                    implicitHeight: 40
                    buttonRadius: Appearance.rounding.small
                    enabled: messageInputField.text.length > 0
                    toggled: enabled

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: sendButton.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: {
                            const inputText = messageInputField.text;
                            root.handleInput(inputText);
                            messageInputField.clear();
                        }
                    }

                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        iconSize: 22
                        color: sendButton.enabled ? Appearance.m3colors.m3onPrimary : Appearance.colors.colOnLayer2Disabled
                        text: "arrow_upward"
                    }
                }
            }

            RowLayout { // Controls
                id: commandButtonsRow
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 5
                anchors.leftMargin: 10
                anchors.rightMargin: 5
                spacing: 4

                property var commandsShown: [
                    {
                        name: "",
                        sendDirectly: false,
                        dontAddSpace: true
                    },
                    {
                        name: "clear",
                        sendDirectly: true
                    },
                ]

                ApiInputBoxIndicator {
                    // Provider indicator
                    icon: "dns"
                    text: Ai.currentProviderId
                    tooltipText: Translation.tr("Current provider: %1\nSwitch with %2provider PROVIDER").arg(Ai.providers[Ai.currentProviderId]?.name || Ai.currentProviderId).arg(root.commandPrefix)
                }

                ApiInputBoxIndicator {
                    // Profile indicator
                    visible: Ai.currentProviderId === "hermes"
                    icon: "account_circle"
                    text: Ai.currentProfile
                    tooltipText: Translation.tr("Current Hermes profile: %1\nSwitch with %2profile PROFILE").arg(Ai.currentProfile).arg(root.commandPrefix)
                }

                ApiInputBoxIndicator {
                    // Model indicator
                    icon: "api"
                    text: Ai.currentModelId
                    tooltipText: Translation.tr("Current model: %1\nSet it with %2model MODEL").arg(Ai.getModel()?.name || Ai.currentModelId).arg(root.commandPrefix)
                }

                Item {
                    Layout.fillWidth: true
                }

                ButtonGroup {
                    // Command buttons
                    padding: 0

                    Repeater {
                        // Command buttons
                        model: commandButtonsRow.commandsShown
                        delegate: ApiCommandButton {
                            property string commandRepresentation: `${root.commandPrefix}${modelData.name}`
                            buttonText: commandRepresentation
                            downAction: () => {
                                if (modelData.sendDirectly) {
                                    root.handleInput(commandRepresentation);
                                } else {
                                    messageInputField.text = commandRepresentation + (modelData.dontAddSpace ? "" : " ");
                                    messageInputField.cursorPosition = messageInputField.text.length;
                                    messageInputField.forceActiveFocus();
                                }
                                if (modelData.name === "clear") {
                                    messageInputField.text = "";
                                }
                            }
                        }
                    }
                }
            }
        } // end inputWrapper Rectangle
        } // end inputAreaWrapper Item
    }
}
