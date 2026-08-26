pragma ComponentBehavior: Bound
import qs
import qs.modules.common
import qs.modules.common.functions
import qs.modules.common.widgets
import qs.services
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Qt5Compat.GraphicalEffects
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

// Options toolbar: capture action picker + selection shape tabs
Toolbar {
    id: root

    // Use a synchronizer on these
    property var action
    property var selectionMode
    // Signals
    signal dismiss()

    readonly property string includeCursorLabel: Translation.tr("Include mouse cursor in capture")

    readonly property var actionList: [
        { "action": RegionSelection.SnipAction.Copy, "icon": "content_copy", "name": Translation.tr("Copy") },
        { "action": RegionSelection.SnipAction.Edit, "icon": "edit", "name": Translation.tr("Edit") },
        { "action": RegionSelection.SnipAction.Search, "icon": "image_search", "name": Translation.tr("Search") },
        { "action": RegionSelection.SnipAction.CharRecognition, "icon": "document_scanner", "name": Translation.tr("Copy text (OCR)") },
        { "action": RegionSelection.SnipAction.Record, "icon": "videocam", "name": Translation.tr("Record") },
        { "action": RegionSelection.SnipAction.RecordWithSound, "icon": "mic", "name": Translation.tr("Record with sound") }
    ]

    Repeater {
        model: root.actionList

        delegate: IconToolbarButton {
            required property var modelData
            toggled: root.action === modelData.action
            text: modelData.icon
            onClicked: root.action = modelData.action

            StyledToolTip {
                text: modelData.name
            }
        }
    }

    Rectangle {
        Layout.fillHeight: true
        implicitWidth: 1
        implicitHeight: 24
        color: Appearance.colors.colOutlineVariant
    }

    IconToolbarButton {
        toggled: Config.options.regionSelector.includeCursor
        text: "mouse"
        onClicked: Config.options.regionSelector.includeCursor = !Config.options.regionSelector.includeCursor

        StyledToolTip {
            text: root.includeCursorLabel
        }
    }

    ToolbarTabBar {
        id: tabBar
        tabButtonList: [
            {"icon": "activity_zone", "name": Translation.tr("Rect")},
            {"icon": "gesture", "name": Translation.tr("Circle")}
        ]
        currentIndex: root.selectionMode === RegionSelection.SelectionMode.RectCorners ? 0 : 1
        onCurrentIndexChanged: {
            root.selectionMode = currentIndex === 0 ? RegionSelection.SelectionMode.RectCorners : RegionSelection.SelectionMode.Circle;
        }
    }
}
