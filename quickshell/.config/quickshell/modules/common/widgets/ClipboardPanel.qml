import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Qt5Compat.GraphicalEffects
import Quickshell

Rectangle {
    id: root

    signal requestClose()

    property string searchQuery: ""
    property var filteredEntries: Cliphist.fuzzyQuery(searchQuery)
    property bool confirmWipe: false

    color: Appearance.colors.colLayer0
    border.width: 1
    border.color: Appearance.colors.colLayer0Border
    radius: Appearance.rounding.windowRounding

    implicitWidth: 540
    implicitHeight: 640

    focus: true

    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
            root.requestClose();
            event.accepted = true;
        } else if (event.key === Qt.Key_Down) {
            listView.moveSelection(1);
            event.accepted = true;
        } else if (event.key === Qt.Key_Up) {
            listView.moveSelection(-1);
            event.accepted = true;
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            listView.activateCurrent();
            event.accepted = true;
        } else if (event.key === Qt.Key_Delete) {
            listView.deleteCurrent();
            event.accepted = true;
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        // Header section
        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            RowLayout {
                spacing: 8

                MaterialSymbol {
                    text: "content_paste"
                    font.pixelSize: 24
                    color: Appearance.colors.colPrimary
                }

                StyledText {
                    text: Translation.tr("Clipboard")
                    font.pixelSize: Appearance.font.pixelSize.title
                    font.weight: Font.DemiBold
                }

                Rectangle {
                    color: Appearance.colors.colPrimaryContainer
                    radius: Appearance.rounding.full
                    implicitWidth: countText.implicitWidth + 14
                    implicitHeight: 22

                    StyledText {
                        id: countText
                        anchors.centerIn: parent
                        text: root.filteredEntries.length
                        color: Appearance.colors.colOnPrimaryContainer
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.weight: Font.Medium
                    }
                }
            }

            Item { Layout.fillWidth: true }

            // Wipe All button with inline confirmation
            RippleButton {
                id: wipeButton
                implicitHeight: 34
                implicitWidth: wipeRow.implicitWidth + 20
                buttonRadius: Appearance.rounding.small
                colBackground: root.confirmWipe ? Appearance.colors.colErrorContainer : Appearance.colors.colLayer1
                colBackgroundHover: root.confirmWipe ? Appearance.colors.colErrorContainerHover : Appearance.colors.colLayer1Hover

                onClicked: {
                    if (root.confirmWipe) {
                        Cliphist.wipe();
                        root.confirmWipe = false;
                    } else {
                        root.confirmWipe = true;
                        wipeTimer.restart();
                    }
                }

                RowLayout {
                    id: wipeRow
                    anchors.centerIn: parent
                    spacing: 6

                    MaterialSymbol {
                        text: root.confirmWipe ? "warning" : "delete_sweep"
                        font.pixelSize: 18
                        color: root.confirmWipe ? Appearance.colors.colOnErrorContainer : Appearance.colors.colOnLayer1
                    }

                    StyledText {
                        text: root.confirmWipe ? Translation.tr("Confirm Wipe?") : Translation.tr("Wipe All")
                        color: root.confirmWipe ? Appearance.colors.colOnErrorContainer : Appearance.colors.colOnLayer1
                        font.pixelSize: Appearance.font.pixelSize.smallie
                        font.weight: root.confirmWipe ? Font.Bold : Font.Normal
                    }
                }

                Timer {
                    id: wipeTimer
                    interval: 3000
                    onTriggered: root.confirmWipe = false
                }
            }

            // Close button
            RippleButton {
                implicitWidth: 34
                implicitHeight: 34
                buttonRadius: Appearance.rounding.full
                colBackground: Appearance.colors.colLayer1
                colBackgroundHover: Appearance.colors.colLayer1Hover

                onClicked: root.requestClose()

                contentItem: MaterialSymbol {
                    anchors.centerIn: parent
                    text: "close"
                    font.pixelSize: 20
                    color: Appearance.colors.colOnLayer1
                }
            }
        }

        // Search bar
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 42
            color: Appearance.colors.colLayer1
            radius: Appearance.rounding.small
            border.width: searchInput.focus ? 2 : 1
            border.color: searchInput.focus ? Appearance.colors.colPrimary : Appearance.colors.colLayer1Hover

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8

                MaterialSymbol {
                    text: "search"
                    font.pixelSize: 20
                    color: searchInput.focus ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                }

                TextField {
                    id: searchInput
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    placeholderText: Translation.tr("Search clipboard history...")
                    placeholderTextColor: Appearance.colors.colSubtext
                    color: Appearance.colors.colOnLayer1
                    font.family: Appearance.font.family.main
                    font.pixelSize: Appearance.font.pixelSize.small
                    background: null
                    verticalAlignment: Text.AlignVCenter

                    onTextChanged: {
                        root.searchQuery = text;
                        listView.currentIndex = 0;
                    }

                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Down) {
                            listView.moveSelection(1);
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Up) {
                            listView.moveSelection(-1);
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                            listView.activateCurrent();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Escape) {
                            root.requestClose();
                            event.accepted = true;
                        }
                    }

                    Component.onCompleted: forceActiveFocus()
                }

                RippleButton {
                    visible: searchInput.text.length > 0
                    implicitWidth: 26
                    implicitHeight: 26
                    buttonRadius: Appearance.rounding.full
                    colBackground: "transparent"

                    onClicked: {
                        searchInput.text = "";
                        searchInput.forceActiveFocus();
                    }

                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        text: "cancel"
                        font.pixelSize: 16
                        color: Appearance.colors.colSubtext
                    }
                }
            }
        }

        // Main List area / Empty state
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Empty state
            ColumnLayout {
                visible: root.filteredEntries.length === 0
                anchors.centerIn: parent
                spacing: 12

                MaterialSymbol {
                    Layout.alignment: Qt.AlignHCenter
                    text: root.searchQuery.length > 0 ? "search_off" : "content_paste_off"
                    font.pixelSize: 48
                    color: Appearance.colors.colSubtext
                }

                StyledText {
                    Layout.alignment: Qt.AlignHCenter
                    text: root.searchQuery.length > 0 ? Translation.tr("No matching clipboard entries") : Translation.tr("Clipboard is empty")
                    color: Appearance.colors.colSubtext
                    font.pixelSize: Appearance.font.pixelSize.normal
                }
            }

            // Scrollable entries list
            ListView {
                id: listView
                visible: root.filteredEntries.length > 0
                anchors.fill: parent
                clip: true
                spacing: 8
                boundsBehavior: Flickable.StopAtBounds

                ScrollBar.vertical: StyledScrollBar {}

                model: root.filteredEntries

                function moveSelection(delta) {
                    if (count === 0) return;
                    currentIndex = Math.max(0, Math.min(count - 1, currentIndex + delta));
                    positionViewAtIndex(currentIndex, ListView.Contain);
                }

                function activateCurrent() {
                    if (currentIndex >= 0 && currentIndex < count) {
                        const entry = root.filteredEntries[currentIndex];
                        Cliphist.paste(entry);
                        root.requestClose();
                    }
                }

                function deleteCurrent() {
                    if (currentIndex >= 0 && currentIndex < count) {
                        const entry = root.filteredEntries[currentIndex];
                        Cliphist.deleteEntry(entry);
                    }
                }

                delegate: Rectangle {
                    id: delegateItem
                    required property var modelData
                    required property int index

                    readonly property bool isSelected: index === listView.currentIndex
                    readonly property bool isImage: Cliphist.entryIsImage(modelData)
                    readonly property string cleanContent: StringUtils.cleanCliphistEntry(modelData)

                    width: listView.width - (listView.ScrollBar.vertical.visible ? 12 : 0)
                    implicitHeight: Math.max(56, contentColumn.implicitHeight + 20)
                    color: isSelected ? Appearance.colors.colPrimaryContainer : (itemMouseArea.containsMouse ? Appearance.colors.colLayer1Hover : Appearance.colors.colLayer1)
                    radius: Appearance.rounding.small
                    border.width: isSelected ? 1 : 0
                    border.color: Appearance.colors.colPrimary

                    MouseArea {
                        id: itemMouseArea
                        anchors.fill: parent
                        hoverEnabled: true

                        onClicked: {
                            listView.currentIndex = index;
                            Cliphist.paste(delegateItem.modelData);
                            root.requestClose();
                        }
                    }

                    RowLayout {
                        id: mainRow
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 12

                        // Type indicator / thumbnail
                        Item {
                            implicitWidth: 44
                            implicitHeight: 44
                            Layout.alignment: Qt.AlignVCenter

                            Loader {
                                active: delegateItem.isImage
                                anchors.fill: parent
                                sourceComponent: CliphistImage {
                                    entry: delegateItem.modelData
                                    maxWidth: 44
                                    maxHeight: 44
                                }
                            }

                            MaterialSymbol {
                                visible: !delegateItem.isImage
                                anchors.centerIn: parent
                                text: "description"
                                font.pixelSize: 24
                                color: delegateItem.isSelected ? Appearance.colors.colOnPrimaryContainer : Appearance.colors.colSubtext
                            }
                        }

                        // Content snippet
                        ColumnLayout {
                            id: contentColumn
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignVCenter
                            spacing: 4

                            StyledText {
                                Layout.fillWidth: true
                                text: delegateItem.isImage ? Translation.tr("Image clip") : delegateItem.cleanContent
                                color: delegateItem.isSelected ? Appearance.colors.colOnPrimaryContainer : Appearance.colors.colOnLayer1
                                font.family: delegateItem.isImage ? Appearance.font.family.main : Appearance.font.family.monospace
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: delegateItem.isImage ? Font.Medium : Font.Normal
                                elide: Text.ElideRight
                                maximumLineCount: 2
                                wrapMode: Text.WrapAnywhere
                            }

                            RowLayout {
                                spacing: 8

                                StyledText {
                                    text: delegateItem.isImage ? delegateItem.cleanContent : `#${index + 1}`
                                    color: delegateItem.isSelected ? ColorUtils.transparentize(Appearance.colors.colOnPrimaryContainer, 0.7) : Appearance.colors.colSubtext
                                    font.pixelSize: Appearance.font.pixelSize.smaller
                                }
                            }
                        }

                        // Action Buttons (Copy & Delete)
                        RowLayout {
                            Layout.alignment: Qt.AlignVCenter
                            spacing: 4
                            visible: itemMouseArea.containsMouse || delegateItem.isSelected

                            RippleButton {
                                implicitWidth: 32
                                implicitHeight: 32
                                buttonRadius: Appearance.rounding.full
                                colBackground: Appearance.colors.colLayer2
                                colBackgroundHover: Appearance.colors.colLayer2Hover

                                onClicked: {
                                    Cliphist.copy(delegateItem.modelData);
                                }

                                contentItem: MaterialSymbol {
                                    anchors.centerIn: parent
                                    text: "content_copy"
                                    font.pixelSize: 16
                                    color: Appearance.colors.colOnLayer2
                                }

                                StyledToolTip {
                                    text: Translation.tr("Copy to clipboard without pasting")
                                }
                            }

                            RippleButton {
                                implicitWidth: 32
                                implicitHeight: 32
                                buttonRadius: Appearance.rounding.full
                                colBackground: Appearance.colors.colLayer2
                                colBackgroundHover: Appearance.colors.colErrorContainer

                                onClicked: {
                                    Cliphist.deleteEntry(delegateItem.modelData);
                                }

                                contentItem: MaterialSymbol {
                                    anchors.centerIn: parent
                                    text: "delete"
                                    font.pixelSize: 16
                                    color: Appearance.colors.colOnErrorContainer
                                }

                                StyledToolTip {
                                    text: Translation.tr("Delete from history")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
