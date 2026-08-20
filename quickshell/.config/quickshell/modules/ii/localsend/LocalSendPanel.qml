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
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0
    color: "transparent"
    property real panelWidth: 440

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    mask: Region {
        item: card
    }

    Component.onCompleted: {
        GlobalFocusGrab.addDismissable(root);
        // ToolbarTabBar's active pill isn't painted on first layout (its
        // indicator starts undefined); nudge the index so it renders, then land
        // on the right tab: Receive if something is pending (auto-open), else Send.
        tabBar.setCurrentIndex(tabBar.currentIndex === 1 ? 0 : 1);
        tabBar.setCurrentIndex(LocalSend.inboundPendingCount > 0 ? 0 : 1);
    }
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
        width: root.panelWidth
        anchors {
            top: parent.top
            horizontalCenter: parent.horizontalCenter
            topMargin: (Config?.options.bar.vertical ?? false) ? Appearance.sizes.hyprlandGapsOut : Appearance.sizes.barHeight + Appearance.sizes.hyprlandGapsOut
        }
        clip: true
        implicitHeight: col.implicitHeight + 24
        // Content-fit with smooth height animation within the static full-screen
        // layer surface (matches search/clipboard widgets).
        Behavior on implicitHeight {
            animation: Appearance.animation.elementMove.numberAnimation.createObject(this)
        }
        color: Appearance.colors.colLayer0
        radius: Appearance.rounding.screenRounding

        ColumnLayout {
            id: col
            anchors { top: parent.top; left: parent.left; right: parent.right }
            anchors.margins: 12
            spacing: 10

            // header
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                MaterialSymbol { text: "near_me"; iconSize: 22; color: Appearance.m3colors.m3primary }
                StyledText {
                    text: Translation.tr("LocalSend")
                    font.pixelSize: Appearance.font.pixelSize.large
                    color: Appearance.colors.colOnLayer0
                }
                Item { Layout.fillWidth: true }
                StyledText {
                    visible: LocalSend.selfAlias.length > 0
                    text: LocalSend.selfAlias
                    color: Appearance.m3colors.m3onSurfaceVariant
                    font.pixelSize: Appearance.font.pixelSize.small
                }
                MaterialSymbol {
                    text: LocalSend.selfAlias.length ? "phonelink" : "cloud_off"
                    iconSize: 18; color: Appearance.m3colors.m3onSurfaceVariant
                }
                RippleButton {
                    Layout.preferredWidth: 30; Layout.preferredHeight: 30
                    buttonRadius: Appearance.rounding.full
                    colBackground: "transparent"
                    onClicked: LocalSend.openSaveDirectory()
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "folder_open"; iconSize: 18; color: Appearance.m3colors.m3onSurfaceVariant
                    }
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

            // tab bar: Receive / Send / History (same pill style as the sidebar panes)
            ToolbarTabBar {
                id: tabBar
                Layout.alignment: Qt.AlignHCenter
                tabButtonList: [
                    { "icon": "wifi", "name": root.receiveTabName },
                    { "icon": "send", "name": Translation.tr("Send") },
                    { "icon": "history", "name": Translation.tr("History") }
                ]
                currentIndex: 0
            }

            // StackLayout or swipe area for the tabs
            Item {
                Layout.fillWidth: true
                implicitHeight: {
                    if (tabBar.currentIndex === 0) return recvPage.implicitHeight + 4;
                    if (tabBar.currentIndex === 1) return sendPage.implicitHeight + 4;
                    return historyPage.implicitHeight + 4;
                }
                Behavior on implicitHeight {
                    animation: Appearance.animation.elementMove.numberAnimation.createObject(this)
                }

                // ===================== RECEIVE PAGE =====================
                ColumnLayout {
                    id: recvPage
                    anchors { left: parent.left; right: parent.right; top: parent.top }
                    visible: tabBar.currentIndex === 0
                    spacing: 8

                    // idle banner when no incoming requests
                    ColumnLayout {
                        Layout.fillWidth: true
                        visible: LocalSend.inbound.length === 0
                        spacing: 4
                        Layout.topMargin: 12
                        Layout.bottomMargin: 12

                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "downloading"
                            iconSize: 32
                            color: Appearance.m3colors.m3primary
                        }

                        StyledText {
                            Layout.fillWidth: true
                            text: Translation.tr("No incoming transfers")
                            color: Appearance.colors.colOnLayer0
                            font.pixelSize: Appearance.font.pixelSize.normal
                            horizontalAlignment: Text.AlignHCenter
                        }

                        StyledText {
                            Layout.fillWidth: true
                            text: LocalSend.selfAlias.length
                                ? Translation.tr("Visible to nearby devices as \"%1\"").arg(LocalSend.selfAlias)
                                : Translation.tr("Ready to receive from nearby devices")
                            color: Appearance.m3colors.m3onSurfaceVariant
                            font.pixelSize: Appearance.font.pixelSize.small
                            horizontalAlignment: Text.AlignHCenter
                        }
                    }

                    ListView {
                        Layout.fillWidth: true
                        Layout.preferredHeight: LocalSend.inbound.length > 0 ? Math.min(contentHeight + 8, 360) : 0
                        clip: true
                        spacing: 8
                        visible: LocalSend.inbound.length > 0
                        reuseItems: true
                        cacheBuffer: 400
                        model: LocalSend.inbound
                        delegate: Rectangle {
                            required property var modelData
                            width: ListView.view.width
                            color: Appearance.colors.colLayer2
                            radius: Appearance.rounding.small
                            implicitHeight: inner.implicitHeight + 20
                            ColumnLayout {
                                id: inner
                                anchors.fill: parent
                                anchors.margins: 10
                                spacing: 8
                                RowLayout {
                                    Layout.fillWidth: true
                                    StyledText {
                                        text: modelData.sender
                                        color: Appearance.colors.colOnLayer0
                                        font.pixelSize: Appearance.font.pixelSize.normal
                                        font.weight: Font.Medium
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
                                        font.weight: Font.DemiBold
                                    }
                                }
                                StyledText {
                                    Layout.fillWidth: true
                                    text: (modelData.isText && modelData.text && modelData.text.length)
                                        ? modelData.text
                                        : modelData.files.map(f => f.fileName).join(", ")
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    elide: modelData.isText ? Text.ElideNone : Text.ElideRight
                                    wrapMode: modelData.isText ? Text.Wrap : Text.NoWrap
                                    maximumLineCount: 3
                                }
                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 4
                                    radius: 2
                                    color: Appearance.colors.colLayer4
                                    visible: modelData.state === "transferring"
                                    Rectangle {
                                        width: parent.width * Math.max(0, Math.min(1, modelData.pct || 0))
                                        height: parent.height
                                        radius: 2
                                        color: Appearance.m3colors.m3primary
                                    }
                                }
                                RowLayout {
                                    Layout.fillWidth: true
                                    visible: modelData.state === "pending"
                                    spacing: 8
                                    Item { Layout.fillWidth: true }
                                    RippleButton {
                                        Layout.preferredWidth: 64; Layout.preferredHeight: 28
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.m3colors.m3error
                                        onClicked: LocalSend.declineRequest(modelData.session)
                                        contentItem: StyledText {
                                            horizontalAlignment: Text.AlignHCenter
                                            text: Translation.tr("Decline"); color: "white"
                                            font.pixelSize: Appearance.font.pixelSize.small
                                        }
                                    }
                                    RippleButton {
                                        Layout.preferredWidth: 64; Layout.preferredHeight: 28
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.m3colors.m3primary
                                        onClicked: LocalSend.acceptRequest(modelData.session)
                                        contentItem: StyledText {
                                            horizontalAlignment: Text.AlignHCenter
                                            text: Translation.tr("Accept"); color: "white"
                                            font.pixelSize: Appearance.font.pixelSize.small
                                        }
                                    }
                                }
                                RowLayout {
                                    Layout.fillWidth: true
                                    visible: modelData.state === "done"
                                    spacing: 8
                                    Item { Layout.fillWidth: true }
                                    RippleButton {
                                        Layout.preferredHeight: 28
                                        Layout.preferredWidth: openTxt.implicitWidth + 24
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        onClicked: LocalSend.openItem(modelData)
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "visibility"; iconSize: 14; color: Appearance.colors.colOnLayer0 }
                                            StyledText {
                                                id: openTxt
                                                text: (modelData.savedPaths && modelData.savedPaths.length > 1) ? Translation.tr("Open all") : Translation.tr("Open")
                                                font.pixelSize: Appearance.font.pixelSize.small
                                                color: Appearance.colors.colOnLayer0
                                            }
                                        }
                                    }
                                    RippleButton {
                                        Layout.preferredHeight: 28
                                        Layout.preferredWidth: fldTxt.implicitWidth + 24
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        onClicked: LocalSend.openContainingFolder(modelData.path || (modelData.savedPaths && modelData.savedPaths[0]))
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "folder_open"; iconSize: 14; color: Appearance.colors.colOnLayer0 }
                                            StyledText { id: fldTxt; text: Translation.tr("Folder"); font.pixelSize: Appearance.font.pixelSize.small; color: Appearance.colors.colOnLayer0 }
                                        }
                                    }
                                    RippleButton {
                                        Layout.preferredHeight: 28
                                        Layout.preferredWidth: cpyTxt.implicitWidth + 24
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        onClicked: {
                                            if (LocalSend.copyReceivedItem(modelData)) {
                                                root.setTransient(Translation.tr("Copied to clipboard!"));
                                            }
                                        }
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "content_copy"; iconSize: 14; color: Appearance.colors.colOnLayer0 }
                                            StyledText {
                                                id: cpyTxt
                                                text: modelData.isText ? Translation.tr("Copy text") : ((modelData.savedPaths && modelData.savedPaths.length > 1) ? Translation.tr("Copy paths") : Translation.tr("Copy"))
                                                font.pixelSize: Appearance.font.pixelSize.small
                                                color: Appearance.colors.colOnLayer0
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // ===================== SEND PAGE (selection-first) =====================
                ColumnLayout {
                    id: sendPage
                    anchors { left: parent.left; right: parent.right; top: parent.top }
                    visible: tabBar.currentIndex === 1
                    spacing: 8

                    // 1) source tiles: ALWAYS enabled — click to ADD to the staging queue
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 52
                            RippleButton {
                                anchors.fill: parent
                                buttonRadius: Appearance.rounding.small
                                colBackground: Appearance.colors.colLayer3
                                onClicked: LocalSend.pickFiles(true)
                            }
                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 3
                                MaterialSymbol { Layout.alignment: Qt.AlignHCenter; text: "upload_file"; iconSize: 22; color: Appearance.m3colors.m3primary }
                                StyledText { Layout.alignment: Qt.AlignHCenter; text: Translation.tr("File"); font.pixelSize: Appearance.font.pixelSize.small; color: Appearance.colors.colOnLayer0 }
                            }
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 52
                            RippleButton {
                                anchors.fill: parent
                                buttonRadius: Appearance.rounding.small
                                colBackground: Appearance.colors.colLayer3
                                onClicked: LocalSend.pickFiles(false)
                            }
                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 3
                                MaterialSymbol { Layout.alignment: Qt.AlignHCenter; text: "create_new_folder"; iconSize: 22; color: Appearance.m3colors.m3primary }
                                StyledText { Layout.alignment: Qt.AlignHCenter; text: Translation.tr("Folder"); font.pixelSize: Appearance.font.pixelSize.small; color: Appearance.colors.colOnLayer0 }
                            }
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 52
                            RippleButton {
                                anchors.fill: parent
                                buttonRadius: Appearance.rounding.small
                                colBackground: Appearance.colors.colLayer3
                                onClicked: LocalSend.toggleCompose()
                            }
                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 3
                                MaterialSymbol { Layout.alignment: Qt.AlignHCenter; text: "edit_note"; iconSize: 22; color: Appearance.m3colors.m3primary }
                                StyledText { Layout.alignment: Qt.AlignHCenter; text: Translation.tr("Text"); font.pixelSize: Appearance.font.pixelSize.small; color: Appearance.colors.colOnLayer0 }
                            }
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 52
                            RippleButton {
                                anchors.fill: parent
                                buttonRadius: Appearance.rounding.small
                                colBackground: Appearance.colors.colLayer3
                                onClicked: root.stageClipboard()
                            }
                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 3
                                MaterialSymbol { Layout.alignment: Qt.AlignHCenter; text: "content_paste"; iconSize: 22; color: Appearance.m3colors.m3primary }
                                StyledText { Layout.alignment: Qt.AlignHCenter; text: Translation.tr("Paste"); font.pixelSize: Appearance.font.pixelSize.small; color: Appearance.colors.colOnLayer0 }
                            }
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 52
                            RippleButton {
                                anchors.fill: parent
                                buttonRadius: Appearance.rounding.small
                                colBackground: LocalSend.webShareActive ? Appearance.m3colors.m3primary : Appearance.colors.colLayer3
                                onClicked: {
                                    if (LocalSend.webShareActive) {
                                        LocalSend.stopWebShare();
                                    } else {
                                        LocalSend.startWebShare(LocalSend.stagedPaths, LocalSend.stagedText);
                                    }
                                }
                            }
                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 3
                                MaterialSymbol { Layout.alignment: Qt.AlignHCenter; text: "language"; iconSize: 22; color: LocalSend.webShareActive ? "white" : Appearance.m3colors.m3primary }
                                StyledText { Layout.alignment: Qt.AlignHCenter; text: Translation.tr("Web"); font.pixelSize: Appearance.font.pixelSize.small; color: LocalSend.webShareActive ? "white" : Appearance.colors.colOnLayer0 }
                            }
                        }
                    }

                    // text compose (Text tile): type a message, "Add" stages it
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        visible: LocalSend.textComposeVisible
                        MaterialTextField {
                            id: composeInput
                            Layout.fillWidth: true
                            placeholderText: Translation.tr("Type a message…")
                            text: LocalSend.composeDraft
                            onTextChanged: LocalSend.composeDraft = text
                            Keys.onReturnPressed: { if (composeInput.text.trim().length) root.addComposeToStaged() }
                        }
                        RippleButton {
                            Layout.preferredWidth: 56; Layout.preferredHeight: 40
                            buttonRadius: Appearance.rounding.small
                            colBackground: Appearance.m3colors.m3primary
                            enabled: composeInput.text.trim().length > 0
                            onClicked: root.addComposeToStaged()
                            contentItem: MaterialSymbol {
                                anchors.centerIn: parent
                                horizontalAlignment: Text.AlignHCenter
                                text: "add"; iconSize: 18; color: "white"
                            }
                        }
                    }

                    // 2) staging queue (editable "what to send")
                    RowLayout {
                        Layout.fillWidth: true
                        StyledText {
                            text: Translation.tr("Staged (%1)").arg(LocalSend.staged.length)
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.m3colors.m3onSurfaceVariant
                        }
                        Item { Layout.fillWidth: true }
                        RippleButton {
                            Layout.preferredWidth: 44; Layout.preferredHeight: 20
                            buttonRadius: Appearance.rounding.full
                            colBackground: "transparent"
                            visible: LocalSend.staged.length > 0
                            onClicked: LocalSend.stageClear()
                            contentItem: StyledText {
                                horizontalAlignment: Text.AlignHCenter
                                text: "Clear"; color: Appearance.m3colors.m3error
                                font.pixelSize: Appearance.font.pixelSize.small
                            }
                        }
                    }
                    // (the Send button below covers all three states; no extra hint needed)
                    ListView {
                        Layout.fillWidth: true
                        Layout.preferredHeight: LocalSend.staged.length > 0 ? Math.min(LocalSend.staged.length * 30 + 4, 96) : 0
                        clip: true
                        spacing: 2
                        visible: LocalSend.staged.length > 0
                        reuseItems: true
                        cacheBuffer: 200
                        model: LocalSend.staged
                        delegate: Rectangle {
                            required property var modelData
                            width: ListView.view.width
                            radius: Appearance.rounding.small
                            color: Appearance.colors.colLayer2
                            implicitHeight: 28
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 8
                                anchors.rightMargin: 4
                                spacing: 6
                                MaterialSymbol {
                                    Layout.preferredWidth: 18; Layout.preferredHeight: 18
                                    text: root.stageIcon(modelData.type); iconSize: 16
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                }
                                StyledText {
                                    Layout.fillWidth: true
                                    text: modelData.name
                                    color: Appearance.colors.colOnLayer0
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    elide: Text.ElideMiddle
                                }
                                StyledText {
                                    text: modelData.meta
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                    font.pixelSize: Appearance.font.pixelSize.small
                                }
                                RippleButton {
                                    Layout.preferredWidth: 20; Layout.preferredHeight: 20
                                    buttonRadius: Appearance.rounding.full
                                    colBackground: "transparent"
                                    onClicked: LocalSend.stageRemove(modelData.id)
                                    contentItem: MaterialSymbol {
                                        anchors.centerIn: parent
                                        horizontalAlignment: Text.AlignHCenter
                                        text: "close"; iconSize: 14
                                        color: Appearance.m3colors.m3onSurfaceVariant
                                    }
                                }
                            }
                        }
                    }

                    // 2.5) Web Share active card
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: webShareCol.implicitHeight + 20
                        radius: Appearance.rounding.normal
                        color: Appearance.colors.colLayer2
                        border.color: Appearance.m3colors.m3primary
                        border.width: 1
                        visible: LocalSend.webShareActive

                        ColumnLayout {
                            id: webShareCol
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 10 }
                            spacing: 6

                            RowLayout {
                                Layout.fillWidth: true
                                MaterialSymbol { text: "language"; iconSize: 18; color: Appearance.m3colors.m3primary }
                                StyledText {
                                    Layout.fillWidth: true
                                    text: Translation.tr("Web Share Active")
                                    font.weight: Font.DemiBold
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    color: Appearance.colors.colOnLayer0
                                }
                                RippleButton {
                                    Layout.preferredHeight: 22
                                    buttonRadius: Appearance.rounding.full
                                    colBackground: Appearance.m3colors.m3error
                                    onClicked: LocalSend.stopWebShare()
                                    contentItem: StyledText {
                                        anchors.centerIn: parent
                                        text: Translation.tr("Stop"); color: "white"
                                        font.pixelSize: Appearance.font.pixelSize.smaller
                                    }
                                }
                            }

                            StyledText {
                                Layout.fillWidth: true
                                text: Translation.tr("Anyone on Wi-Fi can open this link in their browser to download:")
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                color: Appearance.m3colors.m3onSurfaceVariant
                            }

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 6
                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 32
                                    radius: Appearance.rounding.small
                                    color: Appearance.colors.colLayer3
                                    StyledText {
                                        anchors.centerIn: parent
                                        text: `http://${LocalSend.localIp}:${Config.options.localsend?.port || 53317}/web`
                                        font.pixelSize: Appearance.font.pixelSize.small
                                        color: Appearance.m3colors.m3primary
                                        font.bold: true
                                    }
                                }
                                RippleButton {
                                    Layout.preferredHeight: 32
                                    Layout.preferredWidth: 60
                                    buttonRadius: Appearance.rounding.small
                                    colBackground: Appearance.m3colors.m3primary
                                    onClicked: {
                                        Quickshell.clipboardText = `http://${LocalSend.localIp}:${Config.options.localsend?.port || 53317}/web`;
                                        root.setTransient(Translation.tr("Link copied!"));
                                    }
                                    contentItem: StyledText {
                                        anchors.centerIn: parent
                                        text: Translation.tr("Copy"); color: "white"
                                        font.pixelSize: Appearance.font.pixelSize.small
                                    }
                                }
                            }
                        }
                    }

                    // 3) target device section header
                    property bool manualIpVisible: false

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        StyledText {
                            Layout.fillWidth: true
                            text: LocalSend.peers.length > 0 ? Translation.tr("Nearby devices (%1)").arg(LocalSend.peers.length) : Translation.tr("Devices")
                            color: Appearance.m3colors.m3onSurfaceVariant
                            font.pixelSize: Appearance.font.pixelSize.small
                        }
                        RippleButton {
                            Layout.preferredHeight: 24
                            colBackground: "transparent"
                            onClicked: sendPage.manualIpVisible = !sendPage.manualIpVisible
                            contentItem: RowLayout {
                                anchors.centerIn: parent
                                spacing: 3
                                MaterialSymbol { text: sendPage.manualIpVisible ? "expand_less" : "add"; iconSize: 14; color: Appearance.m3colors.m3primary }
                                StyledText {
                                    text: Translation.tr("Add IP")
                                    color: Appearance.m3colors.m3primary
                                    font.pixelSize: Appearance.font.pixelSize.small
                                }
                            }
                        }
                        RippleButton {
                            Layout.preferredHeight: 24
                            colBackground: "transparent"
                            visible: LocalSend.peers.length > 1
                            onClicked: {
                                if (LocalSend.selectedPeers.length === LocalSend.peers.length) {
                                    LocalSend.clearPeerSelection();
                                } else {
                                    LocalSend.selectAllPeers();
                                }
                            }
                            contentItem: StyledText {
                                anchors.centerIn: parent
                                text: LocalSend.selectedPeers.length === LocalSend.peers.length ? Translation.tr("Deselect all") : Translation.tr("Select all")
                                color: Appearance.m3colors.m3primary
                                font.pixelSize: Appearance.font.pixelSize.small
                            }
                        }
                    }

                    // Manual IP input row
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        visible: sendPage.manualIpVisible
                        MaterialTextField {
                            id: manualIpInput
                            Layout.fillWidth: true
                            placeholderText: Translation.tr("IP (e.g. 192.168.1.50)")
                            Keys.onReturnPressed: {
                                if (manualIpInput.text.trim().length) {
                                    LocalSend.addManualPeer(manualIpInput.text.trim(), parseInt(manualPortInput.text.trim()) || 53317);
                                    manualIpInput.text = "";
                                    sendPage.manualIpVisible = false;
                                }
                            }
                        }
                        MaterialTextField {
                            id: manualPortInput
                            Layout.preferredWidth: 65
                            placeholderText: "53317"
                            text: "53317"
                        }
                        RippleButton {
                            Layout.preferredHeight: 40
                            Layout.preferredWidth: 50
                            buttonRadius: Appearance.rounding.small
                            colBackground: Appearance.m3colors.m3primary
                            onClicked: {
                                if (manualIpInput.text.trim().length) {
                                    LocalSend.addManualPeer(manualIpInput.text.trim(), parseInt(manualPortInput.text.trim()) || 53317);
                                    manualIpInput.text = "";
                                    sendPage.manualIpVisible = false;
                                }
                            }
                            contentItem: StyledText {
                                anchors.centerIn: parent
                                text: Translation.tr("Add"); color: "white"
                                font.pixelSize: Appearance.font.pixelSize.small
                            }
                        }
                    }

                    StyledText {
                        Layout.fillWidth: true
                        visible: LocalSend.peers.length === 0 && !sendPage.manualIpVisible
                        text: Translation.tr("No nearby devices found — open LocalSend on another device or click 'Add IP'")
                        color: Appearance.colors.colOnLayer0
                        font.pixelSize: Appearance.font.pixelSize.small
                        wrapMode: Text.Wrap
                    }

                    ListView {
                        Layout.fillWidth: true
                        Layout.preferredHeight: LocalSend.peers.length > 0 ? Math.min(LocalSend.peers.length * 56 + 8, 260) : 0
                        clip: true
                        spacing: 4
                        visible: LocalSend.peers.length > 0
                        reuseItems: true
                        cacheBuffer: 400
                        model: LocalSend.peers
                        delegate: Rectangle {
                            required property var modelData
                            readonly property bool isSelected: LocalSend.isPeerSelected(modelData)
                            width: ListView.view.width
                            radius: Appearance.rounding.small
                            color: isSelected ? Appearance.m3colors.m3primaryContainer : Appearance.colors.colLayer3
                            implicitHeight: 52
                            MouseArea {
                                anchors.fill: parent
                                onClicked: LocalSend.togglePeer(modelData)
                            }
                            RowLayout {
                                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
                                anchors.leftMargin: 12
                                anchors.rightMargin: 6
                                spacing: 10
                                MaterialSymbol {
                                    Layout.preferredWidth: 24; Layout.preferredHeight: 24
                                    iconSize: 22
                                    text: root.peerIcon(modelData.deviceType || "")
                                    color: isSelected ? Appearance.m3colors.m3onPrimaryContainer : Appearance.m3colors.m3onSurfaceVariant
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 3
                                    StyledText {
                                        Layout.fillWidth: true
                                        text: modelData.alias || modelData.ip
                                        color: isSelected ? Appearance.m3colors.m3onPrimaryContainer : Appearance.colors.colOnLayer0
                                        font.pixelSize: Appearance.font.pixelSize.normal
                                        elide: Text.ElideRight
                                    }
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
                                MaterialSymbol {
                                    Layout.preferredWidth: 22; Layout.preferredHeight: 22
                                    iconSize: 20
                                    text: isSelected ? "check_circle" : "radio_button_unchecked"
                                    color: isSelected ? Appearance.m3colors.m3primary : Appearance.colors.colLayer4
                                }
                                RippleButton {
                                    Layout.preferredWidth: 24; Layout.preferredHeight: 24
                                    buttonRadius: Appearance.rounding.full
                                    colBackground: "transparent"
                                    onClicked: {
                                        const fp = modelData.fingerprint || "";
                                        root.setTransient(Translation.tr("%1 · %2:%3 · fp %4…")
                                            .arg(modelData.alias || modelData.ip).arg(modelData.ip)
                                            .arg(modelData.port || 53317).arg(fp.slice(0, 12)));
                                    }
                                    contentItem: MaterialSymbol {
                                        anchors.centerIn: parent
                                        horizontalAlignment: Text.AlignHCenter
                                        text: "info"; iconSize: 16
                                        color: isSelected ? Appearance.m3colors.m3onPrimaryContainer : Appearance.m3colors.m3onSurfaceVariant
                                    }
                                }
                            }
                        }
                    }

                    // 4) Send button (primary CTA with dynamic state)
                    RippleButton {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 44
                        buttonRadius: Appearance.rounding.full
                        colBackground: root.sendReady ? Appearance.m3colors.m3primary : Appearance.colors.colLayer3
                        enabled: root.sendReady
                        onClicked: root.sendStaged()
                        contentItem: StyledText {
                            horizontalAlignment: Text.AlignHCenter
                            text: root.sendLabel()
                            font.pixelSize: Appearance.font.pixelSize.normal
                            color: root.sendReady ? "white" : Appearance.m3colors.m3onSurfaceVariant
                        }
                    }

                    // 5) inline PIN prompt card (appears when receiver requires a PIN / returns 401)
                    Rectangle {
                        id: pinCard
                        property bool showPinText: false
                        Layout.fillWidth: true
                        visible: LocalSend.pinRequiredPeer != null
                        color: Appearance.colors.colLayer2
                        radius: Appearance.rounding.small
                        implicitHeight: pinCol.implicitHeight + 16
                        border.width: 1
                        border.color: Appearance.m3colors.m3primary

                        ColumnLayout {
                            id: pinCol
                            anchors.fill: parent
                            anchors.margins: 10
                            spacing: 8

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8
                                MaterialSymbol {
                                    text: "lock"
                                    iconSize: 20
                                    color: Appearance.m3colors.m3primary
                                }
                                StyledText {
                                    Layout.fillWidth: true
                                    text: LocalSend.pinRequiredPeer
                                        ? Translation.tr("PIN required for %1").arg(LocalSend.pinRequiredPeer.alias || LocalSend.pinRequiredPeer.ip)
                                        : Translation.tr("PIN required")
                                    color: Appearance.colors.colOnLayer0
                                    font.pixelSize: Appearance.font.pixelSize.normal
                                    font.weight: Font.DemiBold
                                    elide: Text.ElideRight
                                }
                            }

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 6

                                MaterialTextField {
                                    id: pinField
                                    Layout.fillWidth: true
                                    placeholderText: Translation.tr("Enter PIN code…")
                                    echoMode: pinCard.showPinText ? TextField.Normal : TextField.Password
                                    inputMethodHints: Qt.ImhHiddenText | Qt.ImhDigitsOnly
                                    Keys.onReturnPressed: {
                                        if (pinField.text.trim().length > 0) {
                                            LocalSend.retryWithPin(pinField.text.trim());
                                            pinField.text = "";
                                        }
                                    }
                                }

                                RippleButton {
                                    Layout.preferredWidth: 36
                                    Layout.preferredHeight: 36
                                    buttonRadius: Appearance.rounding.small
                                    colBackground: "transparent"
                                    onClicked: pinCard.showPinText = !pinCard.showPinText
                                    contentItem: MaterialSymbol {
                                        anchors.centerIn: parent
                                        horizontalAlignment: Text.AlignHCenter
                                        text: pinCard.showPinText ? "visibility_off" : "visibility"
                                        iconSize: 18
                                        color: Appearance.m3colors.m3onSurfaceVariant
                                    }
                                }

                                RippleButton {
                                    Layout.preferredWidth: 54
                                    Layout.preferredHeight: 36
                                    buttonRadius: Appearance.rounding.small
                                    colBackground: Appearance.colors.colLayer3
                                    onClicked: {
                                        LocalSend.cancelPinPrompt();
                                        pinField.text = "";
                                    }
                                    contentItem: StyledText {
                                        anchors.centerIn: parent
                                        horizontalAlignment: Text.AlignHCenter
                                        text: Translation.tr("Cancel")
                                        color: Appearance.colors.colOnLayer0
                                        font.pixelSize: Appearance.font.pixelSize.small
                                    }
                                }

                                RippleButton {
                                    Layout.preferredWidth: 58
                                    Layout.preferredHeight: 36
                                    buttonRadius: Appearance.rounding.small
                                    colBackground: Appearance.m3colors.m3primary
                                    enabled: pinField.text.trim().length > 0
                                    onClicked: {
                                        LocalSend.retryWithPin(pinField.text.trim());
                                        pinField.text = "";
                                    }
                                    contentItem: StyledText {
                                        anchors.centerIn: parent
                                        horizontalAlignment: Text.AlignHCenter
                                        text: Translation.tr("Send")
                                        color: "white"
                                        font.pixelSize: Appearance.font.pixelSize.small
                                        font.weight: Font.DemiBold
                                    }
                                }
                            }
                        }
                    }

                    // outbound transfer progress
                    Rectangle {
                        Layout.fillWidth: true
                        visible: LocalSend.sendTransfer != null && LocalSend.pinRequiredPeer == null
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
                                    text: {
                                        const t = LocalSend.sendTransfer;
                                        if (!t) return "";
                                        const n = t.files ? t.files.length : 0;
                                        const peer = t.peer || "";
                                        if (n > 1) {
                                            return t.filesDone > 0
                                                ? Translation.tr("%1 of %2 files sent · %3").arg(t.filesDone).arg(n).arg(peer)
                                                : Translation.tr("Sending %1 files to %2").arg(n).arg(peer);
                                        } else if (n === 1 && t.files[0]) {
                                            return Translation.tr("Sending %1 to %2").arg(t.files[0]).arg(peer);
                                        }
                                        return Translation.tr("Sending to %1").arg(peer);
                                    }
                                    color: Appearance.colors.colOnLayer0
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    elide: Text.ElideRight
                                }
                                StyledText {
                                    text: {
                                        const t = LocalSend.sendTransfer;
                                        if (!t) return "";
                                        if (t.state === "done") return Translation.tr("Sent");
                                        if (t.state === "error") return Translation.tr("Failed");
                                        return Math.round(t.pct * 100) + "%";
                                    }
                                    color: LocalSend.sendTransfer && LocalSend.sendTransfer.state === "error" ? Appearance.m3colors.m3error
                                         : LocalSend.sendTransfer && LocalSend.sendTransfer.state === "done" ? "#4caf50"
                                         : Appearance.m3colors.m3primary
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
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
                                    Behavior on width {
                                        NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
                                    }
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
                }

                // ===================== HISTORY PAGE =====================
                ColumnLayout {
                    id: historyPage
                    anchors { left: parent.left; right: parent.right; top: parent.top }
                    visible: tabBar.currentIndex === 2
                    spacing: 8

                    // Header / clear row
                    RowLayout {
                        Layout.fillWidth: true
                        visible: LocalSend.history && LocalSend.history.length > 0
                        StyledText {
                            text: Translation.tr("Recent Transfers (%1)").arg(LocalSend.history.length)
                            color: Appearance.colors.colOnLayer0
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.Medium
                        }
                        Item { Layout.fillWidth: true }
                        RippleButton {
                            Layout.preferredHeight: 22
                            Layout.preferredWidth: 60
                            buttonRadius: Appearance.rounding.full
                            colBackground: "transparent"
                            onClicked: LocalSend.clearHistory()
                            contentItem: StyledText {
                                horizontalAlignment: Text.AlignHCenter
                                text: Translation.tr("Clear"); color: Appearance.m3colors.m3error
                                font.pixelSize: Appearance.font.pixelSize.small
                            }
                        }
                    }

                    // Empty banner
                    ColumnLayout {
                        Layout.fillWidth: true
                        visible: !LocalSend.history || LocalSend.history.length === 0
                        spacing: 4
                        Layout.topMargin: 16
                        Layout.bottomMargin: 16

                        MaterialSymbol {
                            Layout.alignment: Qt.AlignHCenter
                            text: "history"
                            iconSize: 32
                            color: Appearance.m3colors.m3onSurfaceVariant
                        }
                        StyledText {
                            Layout.fillWidth: true
                            text: Translation.tr("No transfer history yet")
                            color: Appearance.colors.colOnLayer0
                            font.pixelSize: Appearance.font.pixelSize.normal
                            horizontalAlignment: Text.AlignHCenter
                        }
                        StyledText {
                            Layout.fillWidth: true
                            text: Translation.tr("Transfers you send and receive will appear here")
                            color: Appearance.m3colors.m3onSurfaceVariant
                            font.pixelSize: Appearance.font.pixelSize.small
                            horizontalAlignment: Text.AlignHCenter
                        }
                    }

                    // History list
                    ListView {
                        Layout.fillWidth: true
                        Layout.preferredHeight: (LocalSend.history && LocalSend.history.length > 0) ? Math.min(contentHeight + 8, 380) : 0
                        clip: true
                        spacing: 8
                        visible: LocalSend.history && LocalSend.history.length > 0
                        reuseItems: true
                        cacheBuffer: 400
                        model: LocalSend.history
                        delegate: Rectangle {
                            required property var modelData
                            width: ListView.view.width
                            color: Appearance.colors.colLayer2
                            radius: Appearance.rounding.small
                            implicitHeight: histInner.implicitHeight + 20

                            ColumnLayout {
                                id: histInner
                                anchors.fill: parent
                                anchors.margins: 10
                                spacing: 6

                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 6
                                    MaterialSymbol {
                                        text: modelData.direction === "received" ? "call_received" : "call_made"
                                        iconSize: 16
                                        color: modelData.direction === "received" ? "#4caf50" : Appearance.m3colors.m3primary
                                    }
                                    StyledText {
                                        text: modelData.peer || Translation.tr("Unknown")
                                        color: Appearance.colors.colOnLayer0
                                        font.pixelSize: Appearance.font.pixelSize.normal
                                        font.weight: Font.Medium
                                        elide: Text.ElideRight
                                    }
                                    Item { Layout.fillWidth: true }
                                    StyledText {
                                        text: {
                                            if (modelData.status === "declined") return Translation.tr("Declined");
                                            if (modelData.status === "error") return Translation.tr("Failed");
                                            return modelData.direction === "received" ? Translation.tr("Saved") : Translation.tr("Sent");
                                        }
                                        color: modelData.status === "error" || modelData.status === "declined"
                                            ? Appearance.m3colors.m3error
                                            : (modelData.direction === "received" ? "#4caf50" : Appearance.m3colors.m3primary)
                                        font.pixelSize: Appearance.font.pixelSize.small
                                        font.weight: Font.DemiBold
                                    }
                                    StyledText {
                                        text: NotificationUtils.getFriendlyNotifTimeString(modelData.timestamp)
                                        color: Appearance.m3colors.m3onSurfaceVariant
                                        font.pixelSize: Appearance.font.pixelSize.smaller
                                    }
                                    RippleButton {
                                        Layout.preferredWidth: 20; Layout.preferredHeight: 20
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: "transparent"
                                        onClicked: LocalSend.deleteHistoryItem(modelData.id)
                                        contentItem: MaterialSymbol {
                                            anchors.centerIn: parent
                                            horizontalAlignment: Text.AlignHCenter
                                            text: "close"; iconSize: 14
                                            color: Appearance.m3colors.m3onSurfaceVariant
                                        }
                                    }
                                }

                                StyledText {
                                    Layout.fillWidth: true
                                    text: (modelData.isText && modelData.text && modelData.text.length)
                                        ? modelData.text
                                        : ((modelData.files && modelData.files.length) ? modelData.files.join(", ") : (modelData.text || ""))
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    elide: modelData.isText ? Text.ElideNone : Text.ElideRight
                                    wrapMode: modelData.isText ? Text.Wrap : Text.NoWrap
                                    maximumLineCount: 3
                                    visible: !!text.length
                                }

                                StyledText {
                                    Layout.fillWidth: true
                                    visible: modelData.status === "error" && !!modelData.error
                                    text: modelData.error || ""
                                    color: Appearance.m3colors.m3error
                                    font.pixelSize: Appearance.font.pixelSize.smaller
                                    wrapMode: Text.Wrap
                                }

                                RowLayout {
                                    Layout.fillWidth: true
                                    visible: modelData.status === "done" && ((modelData.paths && modelData.paths.length > 0) || (modelData.isText && modelData.text))
                                    spacing: 6
                                    Item { Layout.fillWidth: true }
                                    RippleButton {
                                        Layout.preferredHeight: 24
                                        Layout.preferredWidth: hOpenTxt.implicitWidth + 20
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        visible: !!(modelData.paths && modelData.paths.length > 0)
                                        onClicked: LocalSend.openItem(modelData)
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "visibility"; iconSize: 13; color: Appearance.colors.colOnLayer0 }
                                            StyledText {
                                                id: hOpenTxt
                                                text: (modelData.paths && modelData.paths.length > 1) ? Translation.tr("Open all") : Translation.tr("Open")
                                                font.pixelSize: Appearance.font.pixelSize.smaller
                                                color: Appearance.colors.colOnLayer0
                                            }
                                        }
                                    }
                                    RippleButton {
                                        Layout.preferredHeight: 24
                                        Layout.preferredWidth: hFldTxt.implicitWidth + 20
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        visible: !!(modelData.paths && modelData.paths.length > 0)
                                        onClicked: LocalSend.openContainingFolder(modelData.paths[0])
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "folder_open"; iconSize: 13; color: Appearance.colors.colOnLayer0 }
                                            StyledText { id: hFldTxt; text: Translation.tr("Folder"); font.pixelSize: Appearance.font.pixelSize.smaller; color: Appearance.colors.colOnLayer0 }
                                        }
                                    }
                                    RippleButton {
                                        Layout.preferredHeight: 24
                                        Layout.preferredWidth: hCpyTxt.implicitWidth + 20
                                        buttonRadius: Appearance.rounding.full
                                        colBackground: Appearance.colors.colLayer3
                                        onClicked: {
                                            if (LocalSend.copyReceivedItem(modelData)) {
                                                root.setTransient(Translation.tr("Copied to clipboard!"));
                                            }
                                        }
                                        contentItem: RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            MaterialSymbol { text: "content_copy"; iconSize: 13; color: Appearance.colors.colOnLayer0 }
                                            StyledText {
                                                id: hCpyTxt
                                                text: modelData.isText ? Translation.tr("Copy text") : ((modelData.paths && modelData.paths.length > 1) ? Translation.tr("Copy paths") : Translation.tr("Copy"))
                                                font.pixelSize: Appearance.font.pixelSize.smaller
                                                color: Appearance.colors.colOnLayer0
                                            }
                                        }
                                    }
                                }
                            }
                        }
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

    // ---------------- state ----------------
    property string transientMessage: ""
    function setTransient(msg) {
        root.transientMessage = msg;
        transientTimer.restart();
    }
    Timer {
        id: transientTimer
        interval: 3500
        repeat: false
        onTriggered: root.transientMessage = ""
    }

    property int _lastInboundCount: LocalSend.inbound.length
    property string receiveTabName: {
        const p = LocalSend.inboundPendingCount;
        return p > 0 ? Translation.tr("Receive (%1)").arg(p) : Translation.tr("Receive");
    }
    property bool sendReady: (LocalSend.staged && LocalSend.staged.length > 0) && (LocalSend.selectedPeers && LocalSend.selectedPeers.length > 0)

    // Surface the Receive tab only on a genuinely NEW request (inbound grows).
    Connections {
        target: LocalSend
        function onInboundChanged() {
            const n = LocalSend.inbound.length;
            if (n > root._lastInboundCount) tabBar.setCurrentIndex(0);
            root._lastInboundCount = n;
        }
    }

    // ---------------- staging helpers ----------------
    function stageClipboard() {
        if (!LocalSend.stageClipboard()) {
            root.setTransient(Translation.tr("Clipboard is empty"));
        }
    }
    function addComposeToStaged() {
        LocalSend.stageText(LocalSend.composeDraft);
    }

    function sendLabel() {
        const count = LocalSend.staged ? LocalSend.staged.length : 0;
        const peers = LocalSend.selectedPeers || [];
        if (count === 0) return Translation.tr("Select items to send");
        if (peers.length === 0) return Translation.tr("Select a target device");
        if (peers.length === 1) {
            return Translation.tr("Send %1 item(s) to %2").arg(count).arg(peers[0].alias || peers[0].ip);
        }
        return Translation.tr("Send %1 item(s) to %2 devices").arg(count).arg(peers.length);
    }
    function sendStaged() {
        const peers = LocalSend.selectedPeers || [];
        if (!peers.length) { root.setTransient(Translation.tr("Select a target device")); return; }
        const paths = LocalSend.stagedPaths();
        const text = LocalSend.stagedText();
        if (!paths.length && !text.length) { root.setTransient(Translation.tr("Select items to send")); return; }
        root.transientMessage = "";
        LocalSend.sendSelection(peers, paths, text);
        LocalSend.stageClear();
    }

    function stageIcon(type) {
        if (type === "folder") return "folder";
        if (type === "text") return "notes";
        return "description";
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
        if (!peer) return "";
        if (peer.deviceModel) return peer.deviceModel;
        if (peer.deviceType === "mobile" || peer.deviceType === "phone") return "Phone";
        if (peer.deviceType === "desktop") return "Desktop";
        return "";
    }
}
