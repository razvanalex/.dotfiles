pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.widgets
import qs.services
import QtQuick
import QtQuick.Layouts

/**
 * Vertical mode chip for the AirPods panel: glyph above (large), label
 * below. Local to this panel so the shared SelectionGroupButton stays
 * stock; colors/states mirror it exactly.
 */
GroupButton {
    id: root

    required property var modelData
    property bool leftmost: false
    property bool rightmost: false
    readonly property bool isActive: AirPods.noiseMode === root.modelData.value

    horizontalPadding: 14
    verticalPadding: 10
    bounce: false
    toggled: isActive
    // Flow-container capsule feel: active chip is a full pill, row ends
    // are rounded on their outer side, middles stay slightly rounded.
    leftRadius: (toggled || leftmost) ? (height / 2) : Appearance.rounding.unsharpenmore
    rightRadius: (toggled || rightmost) ? (height / 2) : Appearance.rounding.unsharpenmore
    colBackground: Appearance.colors.colLayer2
    colBackgroundHover: Appearance.colors.colLayer2Hover
    colBackgroundActive: Appearance.colors.colLayer2Active
    colBackgroundToggled: Appearance.colors.colPrimary
    colBackgroundToggledHover: Appearance.colors.colPrimaryHover
    colBackgroundToggledActive: Appearance.colors.colPrimaryActive

    contentItem: ColumnLayout {
        spacing: 0

        MaterialSymbol {
            Layout.alignment: Qt.AlignHCenter
            text: root.modelData.icon
            iconSize: Appearance.font.pixelSize.larger * 1.4
            color: root.toggled ? Appearance.colors.colOnPrimary : Appearance.colors.colOnLayer2
        }
        Item {
            // 3px visual gap: the glyph font carries internal leading, so
            // the layout spacing stays 0 and we trim the em-box padding.
            Layout.alignment: Qt.AlignHCenter
            implicitHeight: 3
        }
        StyledText {
            Layout.alignment: Qt.AlignHCenter
            text: root.modelData.label
            font.pixelSize: Appearance.font.pixelSize.small
            color: root.toggled ? Appearance.colors.colOnPrimary : Appearance.colors.colOnLayer2
        }
    }

    onClicked: AirPods.setNoiseMode(root.modelData.value)
}
