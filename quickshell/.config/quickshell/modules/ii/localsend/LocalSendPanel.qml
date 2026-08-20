import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtQuick.Effects
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
    property real panelWidth: 440
    anchors { top: true; left: true }
    margins {
        top: Appearance.sizes.barHeight + Appearance.sizes.hyprlandGapsOut
        left: ((root.screen?.width ?? 1920) - panelWidth) / 2
    }

    implicitWidth: panelWidth
    implicitHeight: card.implicitHeight + 24   // content-fit; card animates (search pattern)

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

    // Non-cached shadow: the shared StyledRectangularShadow uses cached:true,
    // which leaves a stale dark rectangle below the card whenever it resizes
    // (tab switch, queue add/remove). cached:false re-renders on every resize.
    RectangularShadow {
        anchors.fill: card
        radius: card.radius
        blur: 0.9 * Appearance.sizes.elevationMargin
        offset: Qt.vector2d(0.0, 1.0)
        spread: 1
        color: Appearance.colors.colShadow
        cached: false
    }

    Rectangle {
        id: card
        anchors { top: parent.top; left: parent.left; right: parent.right }
        clip: true
        implicitHeight: col.implicitHeight + 24
        // Content-fit with a SMOOTH height animation — mirrors the search
        // widget, so the layer surface resize is clean (no leftover/stutter).
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

            // tab bar: Receive / Send (same pill style as the sidebar panes)
            ToolbarTabBar {
                id: tabBar
                Layout.alignment: Qt.AlignHCenter
                tabButtonList: [
                    { "icon": "wifi", "name": root.receiveTabName },
                    { "icon": "send", "name": Translation.tr("Send") }
                ]
                currentIndex: 1   // default to Send; receive is surfaced via the popup
            }

            // content: two pages, active page drives the (animated) height
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: tabBar.currentIndex === 0 ? receivePage.implicitHeight : sendPage.implicitHeight
                clip: true

                ColumnLayout {
                    id: receivePage
                    anchors { left: parent.left; right: parent.right; top: parent.top }
                    visible: tabBar.currentIndex === 0
                    spacing: 6

                    StyledText {
                        Layout.fillWidth: true
                        visible: LocalSend.inbound.length === 0
                        text: Translation.tr("No incoming transfers")
                        color: Appearance.m3colors.m3onSurfaceVariant
                        font.pixelSize: Appearance.font.pixelSize.small
                        horizontalAlignment: Text.AlignHCenter
                    }

                    ListView {
                        Layout.fillWidth: true
                        Layout.preferredHeight: LocalSend.inbound.length > 0 ? Math.min(LocalSend.inbound.length * 106 + 8, 300) : 0
                        clip: true
                        spacing: 6
                        visible: LocalSend.inbound.length > 0
                        model: LocalSend.inbound
                        delegate: Rectangle {
                            required property var modelData
                            width: ListView.view.width
                            color: Appearance.colors.colLayer2
                            radius: Appearance.rounding.small
                            // deterministic height per state so the actions row is never clipped
                            implicitHeight: modelData.state === "pending" ? 104 : 76
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
                                onClicked: { root._pickKind = "file"; LocalSend.pickFiles(true) }
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
                                onClicked: { root._pickKind = "folder"; LocalSend.pickFiles(false) }
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
                                onClicked: root.toggleCompose()
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
                    }

                    // text compose (Text tile): type a message, "Add" stages it
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        visible: root.textComposeVisible
                        MaterialTextField {
                            id: composeInput
                            Layout.fillWidth: true
                            placeholderText: Translation.tr("Type a message…")
                            text: root.composeDraft
                            onTextChanged: root.composeDraft = text
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
                            text: Translation.tr("Staged (%1)").arg(stagedModel.count)
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.m3colors.m3onSurfaceVariant
                        }
                        Item { Layout.fillWidth: true }
                        RippleButton {
                            Layout.preferredWidth: 44; Layout.preferredHeight: 20
                            buttonRadius: Appearance.rounding.full
                            colBackground: "transparent"
                            visible: stagedModel.count > 0
                            onClicked: root.stageClear()
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
                        Layout.preferredHeight: stagedModel.count > 0 ? Math.min(stagedModel.count * 30 + 4, 96) : 0
                        clip: true
                        spacing: 2
                        visible: stagedModel.count > 0
                        model: stagedModel
                        delegate: Rectangle {
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
                                    text: root.stageIcon(model.type); iconSize: 16
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                }
                                StyledText {
                                    Layout.fillWidth: true
                                    text: model.name
                                    color: Appearance.colors.colOnLayer0
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    elide: Text.ElideMiddle
                                }
                                StyledText {
                                    text: model.meta
                                    color: Appearance.m3colors.m3onSurfaceVariant
                                    font.pixelSize: Appearance.font.pixelSize.small
                                }
                                RippleButton {
                                    Layout.preferredWidth: 20; Layout.preferredHeight: 20
                                    buttonRadius: Appearance.rounding.full
                                    colBackground: "transparent"
                                    onClicked: root.stageRemove(model.id)
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

                    // 3) target device
                    StyledText {
                        Layout.fillWidth: true
                        visible: LocalSend.peers.length === 0
                        text: Translation.tr("No nearby devices — open LocalSend on another device to discover it")
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
                                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
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
    property var selectedPeer: null
    property string transientMessage: ""
    property bool textComposeVisible: false
    property string composeDraft: ""
    property string _pickKind: "file"
    property int _lastInboundCount: LocalSend.inbound.length
    property string receiveTabName: {
        const p = LocalSend.inboundPendingCount;
        return p > 0 ? Translation.tr("Receive (%1)").arg(p) : Translation.tr("Receive");
    }
    property bool sendReady: stagedModel.count > 0 && !!root.selectedPeer

    ListModel {
        id: stagedModel
        // roles: id, type (file|folder|text), name, path, text, meta
    }

    // Surface the Receive tab only on a genuinely NEW request (inbound grows).
    Connections {
        target: LocalSend
        function onInboundChanged() {
            const n = LocalSend.inbound.length;
            if (n > root._lastInboundCount) tabBar.setCurrentIndex(0);
            root._lastInboundCount = n;
        }
        function onFilesPicked(paths) { root.stagePaths(paths, root._pickKind); }
    }

    // ---------------- staging helpers ----------------
    function _stageId() {
        return (Date.now()).toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function stagePaths(paths, kind) {
        for (let i = 0; i < paths.length; i++) {
            const p = paths[i];
            stagedModel.append({
                id: root._stageId(), type: kind,
                name: p.split(/[\\/]/).pop(),
                path: p, text: "", meta: kind === "folder" ? Translation.tr("Folder") : Translation.tr("File")
            });
        }
    }
    function stageText(text) {
        const t = text.trim();
        if (!t.length) return;
        stagedModel.append({
            id: root._stageId(), type: "text",
            name: t.length > 48 ? t.slice(0, 48) + "…" : t,
            path: "", text: t, meta: Translation.tr("Text")
        });
        root.textComposeVisible = false;
        root.composeDraft = "";
    }
    function stageClipboard() {
        const t = Quickshell.clipboardText;
        if (!t || !t.length) { root.transientMessage = Translation.tr("Clipboard is empty"); return; }
        root.stageText(t);
    }
    function stageRemove(id) {
        for (let i = 0; i < stagedModel.count; i++) {
            if (stagedModel.get(i).id === id) { stagedModel.remove(i); break; }
        }
    }
    function stageClear() { stagedModel.clear(); }
    function addComposeToStaged() { root.stageText(root.composeDraft); }

    function stagedPaths() {
        const out = [];
        for (let i = 0; i < stagedModel.count; i++) { const it = stagedModel.get(i); if (it.path) out.push(it.path); }
        return out;
    }
    function stagedText() {
        const out = [];
        for (let i = 0; i < stagedModel.count; i++) { const it = stagedModel.get(i); if (it.type === "text") out.push(it.text); }
        return out.join("\n\n");
    }

    function sendLabel() {
        const peer = root.selectedPeer;
        if (stagedModel.count === 0) return Translation.tr("Select items to send");
        if (!peer) return Translation.tr("Select a target device");
        return Translation.tr("Send %1 item(s) to %2").arg(stagedModel.count).arg(peer.alias || peer.ip);
    }
    function sendStaged() {
        const peer = root.selectedPeer;
        if (!peer) { root.transientMessage = Translation.tr("Select a target device"); return; }
        const paths = root.stagedPaths();
        const text = root.stagedText();
        if (!paths.length && !text.length) { root.transientMessage = Translation.tr("Select items to send"); return; }
        const n = stagedModel.count;
        LocalSend.sendSelection(peer.ip, peer.port || 53317, peer.protocol || "https", paths, text);
        root.stageClear();
        root.transientMessage = Translation.tr("Sending %1 item(s) to %2…").arg(n).arg(peer.alias || peer.ip);
    }

    function stageIcon(type) {
        if (type === "folder") return "folder";
        if (type === "text") return "notes";
        return "description";
    }

    // Toggle the inline text-compose field (Text tile).
    function toggleCompose() {
        root.textComposeVisible = !root.textComposeVisible;
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
}
