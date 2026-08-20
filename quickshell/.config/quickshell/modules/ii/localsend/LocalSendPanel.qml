import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

PanelWindow {
    id: root
    visible: true   // loaded only while GlobalStates.localsendOpen
    screen: Quickshell.screens.find(s => s.name === Hyprland.focusedMonitor?.name) ?? null
    WlrLayershell.namespace: "quickshell:localsend"
    WlrLayershell.layer: WlrLayer.Overlay
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0
    color: "transparent"
    property real panelWidth: 420
    anchors { top: true; left: true }
    margins {
        top: Appearance.sizes.barHeight + Appearance.sizes.hyprlandGapsOut
        left: ((root.screen?.width ?? 1920) - panelWidth) / 2
    }

    implicitWidth: panelWidth
    implicitHeight: col.implicitHeight + 24

    mask: Region { item: card }

    Component.onCompleted: GlobalFocusGrab.addDismissable(root)
    Component.onDestruction: GlobalFocusGrab.removeDismissable(root)
    Connections {
        target: GlobalFocusGrab
        function onDismissed() { GlobalStates.localsendOpen = false }
    }

    StyledRectangularShadow {
        target: card
    }

    Rectangle {
        id: card
        anchors.fill: parent
        color: Appearance.colors.colLayer0
        radius: Appearance.rounding.screenRounding

        ColumnLayout {
            id: col
            anchors { left: parent.left; right: parent.right; top: parent.top }
            anchors.margins: 12
            spacing: 10

            // header
            RowLayout {
                Layout.fillWidth: true
                MaterialSymbol { text: "near_me"; iconSize: 22; color: Appearance.m3colors.m3primary }
                StyledText {
                    text: Translation.tr("LocalSend")
                    font.pixelSize: Appearance.font.pixelSize.large
                    color: Appearance.colors.colOnLayer0
                }
                Item { Layout.fillWidth: true }
                MaterialSymbol {
                    text: LocalSend.selfAlias.length ? "phonelink" : "cloud_off"
                    iconSize: 18; color: Appearance.m3colors.m3onSurfaceVariant
                }
                RippleButton {
                    Layout.preferredWidth: 30; Layout.preferredHeight: 30
                    buttonRadius: Appearance.rounding.full
                    colBackground: "transparent"
                    onClicked: GlobalStates.localsendOpen = false
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "close"; iconSize: 20; color: Appearance.colors.colOnLayer0
                    }
                }
            }

            // ---- RECEIVE ----
            StyledText {
                text: Translation.tr("Incoming (%1)").arg(LocalSend.inbound.length)
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.m3colors.m3onSurfaceVariant
            }

            ListView {
                Layout.fillWidth: true
                Layout.preferredHeight: LocalSend.inbound.length > 0 ? Math.min(LocalSend.inbound.length * 84 + 8, 200) : 0
                clip: true
                spacing: 6
                visible: LocalSend.inbound.length > 0
                model: LocalSend.inbound
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    color: Appearance.colors.colLayer2
                    radius: Appearance.rounding.small
                    implicitHeight: inner.implicitHeight + 16
                    ColumnLayout {
                        id: inner
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 6
                        RowLayout {
                            Layout.fillWidth: true
                            StyledText {
                                text: modelData.sender
                                color: Appearance.colors.colOnLayer0
                                font.pixelSize: Appearance.font.pixelSize.normal
                                elide: Text.ElideRight
                            }
                            Item { Layout.fillWidth: true }
                            StyledText {
                                text: {
                                    if (modelData.state === "pending") return Translation.tr("Request")
                                    if (modelData.state === "transferring") return Translation.tr("Receiving…")
                                    if (modelData.state === "done") return Translation.tr("Saved")
                                    return Translation.tr("Declined")
                                }
                                color: modelData.state === "pending" ? Appearance.m3colors.m3primary
                                     : modelData.state === "done" ? "#4caf50"
                                     : modelData.state === "declined" ? Appearance.m3colors.m3error
                                     : Appearance.m3colors.m3onSurfaceVariant
                                font.pixelSize: Appearance.font.pixelSize.small
                            }
                        }
                        StyledText {
                            Layout.fillWidth: true
                            text: modelData.files.map(f => f.fileName).join(", ")
                            color: Appearance.m3colors.m3onSurfaceVariant
                            font.pixelSize: Appearance.font.pixelSize.small
                            elide: Text.ElideRight
                        }
                        // progress
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 4
                            radius: 2
                            color: Appearance.colors.colLayer4
                            opacity: modelData.state === "transferring" ? 1 : 0
                            Rectangle {
                                width: parent.width * Math.max(0, Math.min(1, modelData.pct || 0))
                                height: parent.height
                                radius: 2
                                color: Appearance.m3colors.m3primary
                            }
                        }
                        // actions
                        RowLayout {
                            Layout.fillWidth: true
                            visible: modelData.state === "pending"
                            Item { Layout.fillWidth: true }
                            RippleButton {
                                Layout.preferredWidth: 60; Layout.preferredHeight: 26
                                buttonRadius: Appearance.rounding.full
                                colBackground: Appearance.m3colors.m3error
                                onClicked: LocalSend.declineRequest(modelData.session)
                                contentItem: StyledText {
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "Decline"; color: "white"
                                    font.pixelSize: Appearance.font.pixelSize.small
                                }
                            }
                            RippleButton {
                                Layout.preferredWidth: 60; Layout.preferredHeight: 26
                                buttonRadius: Appearance.rounding.full
                                colBackground: Appearance.m3colors.m3primary
                                onClicked: LocalSend.acceptRequest(modelData.session)
                                contentItem: StyledText {
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "Accept"; color: "white"
                                    font.pixelSize: Appearance.font.pixelSize.small
                                }
                            }
                        }
                    }
                }
            }

            // ---- SEND ----
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                Layout.topMargin: 2
                Layout.bottomMargin: 2
                opacity: 0.5
                color: Appearance.colors.colLayer4
            }
            StyledText {
                text: Translation.tr("Send")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.m3colors.m3onSurfaceVariant
            }

            StyledText {
                Layout.fillWidth: true
                visible: LocalSend.peers.length === 0
                text: Translation.tr("No nearby devices — open LocalSend on another device to discover it")
                color: Appearance.colors.colOnLayer0
                font.pixelSize: Appearance.font.pixelSize.small
                wrapMode: Text.Wrap
            }

            // peer picker: richer device cards (icon, badges, info), no Qt popup
            ListView {
                Layout.fillWidth: true
                Layout.preferredHeight: LocalSend.peers.length > 0 ? Math.min(LocalSend.peers.length * 56 + 8, 240) : 0
                clip: true
                spacing: 4
                visible: LocalSend.peers.length > 0
                model: LocalSend.peers
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    radius: Appearance.rounding.small
                    color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3primaryContainer : Appearance.colors.colLayer3
                    implicitHeight: 52
                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.selectedPeer = modelData
                    }
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 6
                        spacing: 10
                        MaterialSymbol {
                            Layout.preferredWidth: 24; Layout.preferredHeight: 24
                            iconSize: 22
                            text: root.peerIcon(modelData.deviceType || "")
                            color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3onPrimaryContainer : Appearance.m3colors.m3onSurfaceVariant
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 3
                            StyledText {
                                Layout.fillWidth: true
                                text: modelData.alias || modelData.ip
                                color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3onPrimaryContainer : Appearance.colors.colOnLayer0
                                font.pixelSize: Appearance.font.pixelSize.normal
                                elide: Text.ElideRight
                            }
                            // badges: protocol + device
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 6
                                Rectangle {
                                    Layout.preferredHeight: 18
                                    Layout.preferredWidth: protoTxt.implicitWidth + 12
                                    radius: 9
                                    color: Appearance.colors.colLayer4
                                    StyledText {
                                        id: protoTxt
                                        anchors.centerIn: parent
                                        text: (modelData.protocol || "https").toUpperCase()
                                        font.pixelSize: 10
                                        color: Appearance.colors.colOnLayer0
                                    }
                                }
                                Rectangle {
                                    visible: root.peerModel(modelData).length > 0
                                    Layout.preferredHeight: 18
                                    Layout.preferredWidth: devTxt.implicitWidth + 12
                                    radius: 9
                                    color: Appearance.colors.colLayer4
                                    StyledText {
                                        id: devTxt
                                        anchors.centerIn: parent
                                        text: root.peerModel(modelData)
                                        font.pixelSize: 10
                                        color: Appearance.colors.colOnLayer0
                                    }
                                }
                            }
                        }
                        // info button
                        RippleButton {
                            Layout.preferredWidth: 24; Layout.preferredHeight: 24
                            buttonRadius: Appearance.rounding.full
                            colBackground: "transparent"
                            onClicked: {
                                const fp = modelData.fingerprint || "";
                                root.transientMessage = Translation.tr("%1 · %2:%3 · fp %4…")
                                    .arg(modelData.alias || modelData.ip).arg(modelData.ip)
                                    .arg(modelData.port || 53317).arg(fp.slice(0, 12));
                            }
                            contentItem: MaterialSymbol {
                                anchors.centerIn: parent
                                horizontalAlignment: Text.AlignHCenter
                                text: "info"; iconSize: 16
                                color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3onPrimaryContainer : Appearance.m3colors.m3onSurfaceVariant
                            }
                        }
                    }
                }
            }

            // send selection: tile buttons (File / Folder / Text / Paste)
            RowLayout {
                Layout.fillWidth: true
                spacing: 6
                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 54
                    RippleButton {
                        anchors.fill: parent
                        buttonRadius: Appearance.rounding.small
                        colBackground: root.selectedPeer ? Appearance.colors.colLayer3 : Appearance.colors.colLayer2
                        enabled: !!root.selectedPeer
                        onClicked: LocalSend.pickAndSend(root.selectedPeer, true)
                    }
                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 3
                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "upload_file"; iconSize: 22
                            color: root.selectedPeer ? Appearance.m3colors.m3primary : Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.alignment: Qt.AlignHCenter
                            text: Translation.tr("File")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colOnLayer0
                        }
                    }
                }
                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 54
                    RippleButton {
                        anchors.fill: parent
                        buttonRadius: Appearance.rounding.small
                        colBackground: root.selectedPeer ? Appearance.colors.colLayer3 : Appearance.colors.colLayer2
                        enabled: !!root.selectedPeer
                        onClicked: LocalSend.pickAndSend(root.selectedPeer, false)
                    }
                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 3
                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "create_new_folder"; iconSize: 22
                            color: root.selectedPeer ? Appearance.m3colors.m3primary : Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.alignment: Qt.AlignHCenter
                            text: Translation.tr("Folder")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colOnLayer0
                        }
                    }
                }
                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 54
                    RippleButton {
                        anchors.fill: parent
                        buttonRadius: Appearance.rounding.small
                        colBackground: root.selectedPeer ? Appearance.colors.colLayer3 : Appearance.colors.colLayer2
                        enabled: !!root.selectedPeer
                        onClicked: root.toggleCompose()
                    }
                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 3
                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "edit_note"; iconSize: 22
                            color: root.selectedPeer ? Appearance.m3colors.m3primary : Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.alignment: Qt.AlignHCenter
                            text: Translation.tr("Text")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colOnLayer0
                        }
                    }
                }
                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 54
                    RippleButton {
                        anchors.fill: parent
                        buttonRadius: Appearance.rounding.small
                        colBackground: root.selectedPeer ? Appearance.colors.colLayer3 : Appearance.colors.colLayer2
                        enabled: !!root.selectedPeer
                        onClicked: root.pickTextPayload()
                    }
                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 3
                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "content_paste"; iconSize: 22
                            color: root.selectedPeer ? Appearance.m3colors.m3primary : Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.alignment: Qt.AlignHCenter
                            text: Translation.tr("Paste")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colOnLayer0
                        }
                    }
                }
            }

            // inline text compose (Text tile): type a message, then send
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                visible: root.textComposeVisible && !!root.selectedPeer
                MaterialTextField {
                    id: composeInput
                    Layout.fillWidth: true
                    placeholderText: Translation.tr("Type a message…")
                    text: root.composeDraft
                    onTextChanged: root.composeDraft = text
                    Keys.onReturnPressed: { if (composeInput.text.trim().length) root.sendComposed() }
                }
                RippleButton {
                    Layout.preferredWidth: 52; Layout.preferredHeight: 40
                    buttonRadius: Appearance.rounding.small
                    colBackground: Appearance.m3colors.m3primary
                    enabled: composeInput.text.trim().length > 0
                    onClicked: root.sendComposed()
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "send"; iconSize: 18; color: "white"
                    }
                }
            }

            StyledText {
                Layout.fillWidth: true
                visible: !root.selectedPeer
                text: Translation.tr("Select a device to send to")
                color: Appearance.m3colors.m3onSurfaceVariant
                font.pixelSize: Appearance.font.pixelSize.small
                horizontalAlignment: Text.AlignHCenter
            }

            // outbound transfer progress
            Rectangle {
                Layout.fillWidth: true
                visible: LocalSend.sendTransfer != null
                color: Appearance.colors.colLayer2
                radius: Appearance.rounding.small
                implicitHeight: outCol.implicitHeight + 16
                ColumnLayout {
                    id: outCol
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 6
                    RowLayout {
                        Layout.fillWidth: true
                        StyledText {
                            Layout.fillWidth: true
                            text: LocalSend.sendTransfer ? (
                                (LocalSend.sendTransfer.files && LocalSend.sendTransfer.files.length > 1
                                    ? Translation.tr("File %1 of %2").arg((LocalSend.sendTransfer.index || 0) + 1).arg(LocalSend.sendTransfer.files.length) + " · "
                                    : "")
                                + Translation.tr("Sending to %1").arg(LocalSend.sendTransfer.peer || "")
                                + (LocalSend.sendTransfer.fileName ? " · " + LocalSend.sendTransfer.fileName : "")
                            ) : ""
                            color: Appearance.colors.colOnLayer0
                            font.pixelSize: Appearance.font.pixelSize.small
                            elide: Text.ElideRight
                        }
                        StyledText {
                            text: LocalSend.sendTransfer ? (
                                LocalSend.sendTransfer.state === "done" ? Translation.tr("Sent")
                                : LocalSend.sendTransfer.state === "error" ? Translation.tr("Failed")
                                : Translation.tr("Sending…")
                            ) : ""
                            color: LocalSend.sendTransfer && LocalSend.sendTransfer.state === "error" ? Appearance.m3colors.m3error
                                 : LocalSend.sendTransfer && LocalSend.sendTransfer.state === "done" ? "#4caf50"
                                 : Appearance.m3colors.m3primary
                            font.pixelSize: Appearance.font.pixelSize.small
                        }
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 4
                        radius: 2
                        color: Appearance.colors.colLayer4
                        Rectangle {
                            width: parent.width * Math.max(0, Math.min(1, (LocalSend.sendTransfer && LocalSend.sendTransfer.pct) || 0))
                            height: parent.height
                            radius: 2
                            color: LocalSend.sendTransfer && LocalSend.sendTransfer.state === "error"
                                ? Appearance.m3colors.m3error : Appearance.m3colors.m3primary
                        }
                    }
                    StyledText {
                        Layout.fillWidth: true
                        visible: LocalSend.sendTransfer && LocalSend.sendTransfer.state === "error" && !!LocalSend.sendTransfer.message
                        text: (LocalSend.sendTransfer && LocalSend.sendTransfer.message) || ""
                        color: Appearance.m3colors.m3error
                        font.pixelSize: Appearance.font.pixelSize.small
                        wrapMode: Text.Wrap
                    }
                }
            }

            StyledText {
                Layout.fillWidth: true
                visible: root.transientMessage.length > 0
                text: root.transientMessage
                color: Appearance.m3colors.m3onSurfaceVariant
                font.pixelSize: Appearance.font.pixelSize.small
                wrapMode: Text.Wrap
            }
        }
    }

    property var selectedPeer: null
    property string transientMessage: ""
    property bool textComposeVisible: false
    property string composeDraft: ""

    // Toggle the inline text-compose field (Text tile).
    function toggleCompose() {
        if (!root.selectedPeer) { root.transientMessage = Translation.tr("Select a device first"); return; }
        root.textComposeVisible = !root.textComposeVisible;
    }

    // Send the typed message to the selected peer.
    function sendComposed() {
        const peer = root.selectedPeer;
        const text = root.composeDraft;
        if (!peer) { root.transientMessage = Translation.tr("Select a device first"); return; }
        if (!text || !text.trim().length) return;
        LocalSend.sendText(peer.ip, peer.port || 53317, peer.protocol || "https", text.trim());
        root.composeDraft = "";
        root.textComposeVisible = false;
        root.transientMessage = Translation.tr("Sending text to %1…").arg(peer.alias || peer.ip);
    }

    // Material Symbol glyph for a peer's device type.
    function peerIcon(type) {
        if (type === "mobile" || type === "phone") return "smartphone";
        if (type === "desktop" || type === "laptop") return "laptop";
        return "devices";
    }

    // Human label for the device badge: prefer the announced model ("Linux",
    // "iPhone …"), fall back to a mapped device type.
    function peerModel(peer) {
        if (peer.deviceModel) return peer.deviceModel;
        if (peer.deviceType === "mobile" || peer.deviceType === "phone") return "Phone";
        if (peer.deviceType === "desktop") return "Desktop";
        return "";
    }

    // Send the current clipboard text to the selected peer.
    function pickTextPayload() {
        const peer = root.selectedPeer;
        if (!peer) { root.transientMessage = Translation.tr("Select a device first"); return; }
        const text = Quickshell.clipboardText;
        if (!text || !text.length) { root.transientMessage = Translation.tr("Clipboard is empty"); return; }
        LocalSend.sendText(peer.ip, peer.port || 53317, peer.protocol || "https", text);
        root.transientMessage = Translation.tr("Sending clipboard text to %1…").arg(peer.alias || peer.ip);
    }
}
