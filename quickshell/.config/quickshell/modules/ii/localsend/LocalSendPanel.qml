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
    anchors { bottom: true; left: true; right: true }
    margins { bottom: Appearance.sizes.barHeight + Appearance.sizes.hyprlandGapsOut }

    implicitWidth: panelWidth
    implicitHeight: col.implicitHeight

    mask: Region { item: card }

    Component.onCompleted: GlobalFocusGrab.addDismissable(root)
    Component.onDestruction: GlobalFocusGrab.removeDismissable(root)
    Connections {
        target: GlobalFocusGrab
        function onDismissed() { GlobalStates.localsendOpen = false }
    }

    Rectangle {
        id: card
        anchors.fill: parent
        color: Appearance.colors.colLayer1
        radius: Appearance.rounding.screenRounding

        ColumnLayout {
            id: col
            anchors.fill: parent
            anchors.margins: 12
            spacing: 10

            // header
            RowLayout {
                Layout.fillWidth: true
                MaterialSymbol { text: "near_me"; iconSize: 22; color: Appearance.m3colors.m3primary }
                StyledText {
                    text: Translation.tr("LocalSend")
                    font.pixelSize: Appearance.font.pixelSize.large
                    color: Appearance.colors.colOnLayer1
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
                        text: "close"; iconSize: 20; color: Appearance.colors.colOnLayer1
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
                Layout.preferredHeight: 200
                clip: true
                spacing: 6
                model: LocalSend.inbound
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    color: Appearance.colors.colLayer2
                    radius: Appearance.rounding.small
                    implicitHeight: inner.implicitHeight + 12
                    ColumnLayout {
                        id: inner
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 6
                        RowLayout {
                            Layout.fillWidth: true
                            StyledText {
                                text: modelData.sender
                                color: Appearance.colors.colOnLayer1
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
            StyledText {
                text: Translation.tr("Send")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.m3colors.m3onSurfaceVariant
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 120
                color: Appearance.colors.colLayer2
                radius: Appearance.rounding.small
                DropArea {
                    anchors.fill: parent
                    onDropped: drop => { /* quickshell file drop hook */ }
                    ColumnLayout {
                        anchors.centerIn: parent
                        MaterialSymbol { text: "upload_file"; iconSize: 24; color: Appearance.m3colors.m3onSurfaceVariant
                            Layout.alignment: Qt.AlignHCenter }
                        StyledText {
                            text: Translation.tr("Pick devices & send below")
                            color: Appearance.m3colors.m3onSurfaceVariant
                            font.pixelSize: Appearance.font.pixelSize.small
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }
            }

            // peer picker (inline list, no Qt popup)
            ListView {
                Layout.fillWidth: true
                Layout.preferredHeight: 140
                clip: true
                spacing: 4
                model: LocalSend.peers
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    radius: Appearance.rounding.small
                    color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3primaryContainer : Appearance.colors.colLayer3
                    implicitHeight: 26
                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.selectedPeer = modelData
                    }
                    StyledText {
                        anchors.left: parent.left
                        anchors.leftMargin: 10
                        anchors.verticalCenter: parent.verticalCenter
                        text: (modelData.alias || modelData.ip) + (modelData.alias ? " · " + modelData.ip : "")
                        color: modelData.ip === root.selectedPeer?.ip ? Appearance.m3colors.m3onPrimaryContainer : Appearance.colors.colOnLayer1
                        font.pixelSize: Appearance.font.pixelSize.small
                    }
                }
            }

            RippleButton {
                Layout.fillWidth: true
                Layout.preferredHeight: 30
                buttonRadius: Appearance.rounding.full
                colBackground: root.selectedPeer ? Appearance.m3colors.m3primary : Appearance.colors.colLayer3
                enabled: !!root.selectedPeer
                onClicked: root.pickTextPayload()
                contentItem: StyledText {
                    horizontalAlignment: Text.AlignHCenter
                    text: root.selectedPeer ? Translation.tr("Send clipboard text to %1").arg(root.selectedPeer.alias || root.selectedPeer.ip) : Translation.tr("Select a device first")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: root.selectedPeer ? "white" : Appearance.colors.colOnLayer1
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
