pragma ComponentBehavior: Bound

import qs.services
import qs.modules.common
import qs.modules.common.functions
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import Quickshell

Item {
    id: root
    property real padding: 4
    property real maxColumnHeight: 0
    implicitWidth: QsWindow?.window?.screen.width * 0.7 ?? 0
    implicitHeight: QsWindow?.window?.screen.height * 0.7 ?? 0

    StyledFlickable {
        id: flickable
        clip: true
        anchors.fill: parent
        anchors.margins: Appearance.rounding.small
        contentHeight: Math.max(height, root.maxColumnHeight)
        contentWidth: flow.implicitWidth

        Flow {
            id: flow
            height: Math.max(flickable.height, root.maxColumnHeight)
            flow: Flow.TopToBottom
            spacing: 10
            Repeater {
                model: [...HyprlandKeybinds.keybindCategories, ""]
                delegate: CheatsheetKeybindsCategory {
                    required property var modelData
                    categoryName: modelData
                    Component.onCompleted: root.maxColumnHeight = Math.max(root.maxColumnHeight, implicitHeight)
                    onImplicitHeightChanged: root.maxColumnHeight = Math.max(root.maxColumnHeight, implicitHeight)
                }
            }
        }
    }

    ScrollEdgeFade {
        target: flickable
        vertical: false
        color: Appearance.colors.colLayer0Base
    }

    ScrollEdgeFade {
        target: flickable
        color: Appearance.colors.colLayer0Base
    }
}
