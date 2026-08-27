pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import qs.services
import QtQuick
import QtQuick.Layouts

/**
 * Mode segment for the AirPods "Noise Control" selector. One column per
 * mode: a segmented-group pill (icon only, contiguous with its neighbours
 * via the shared GroupButton radius idiom — active segment pops as a full
 * pill, row ends rounded on their outer side) with the mode label BELOW
 * it (outside the pill), like the Google/Pixel noise-control UI.
 *
 * The RowLayout that hosts these must use spacing: 2 (the shell's
 * ConfigSelectionArray segmented-group gap) so the segments read as one
 * connected row, not isolated capsules.
 */
ColumnLayout {
    id: root

    required property var modelData
    property bool leftmost: false
    property bool rightmost: false
    readonly property bool isActive: AirPods.noiseMode === root.modelData.value

    readonly property real segWidth: 84
    readonly property real segHeight: 52
    readonly property real iconSize: 26

    Layout.preferredWidth: root.segWidth
    Layout.minimumWidth: root.segWidth
    Layout.maximumWidth: root.segWidth
    spacing: 0

    GroupButton {
        id: segment
        horizontalPadding: 0
        verticalPadding: 0
        bounce: false
        toggled: root.isActive

        Layout.fillWidth: true
        implicitHeight: root.segHeight
        // Segmented-group idiom: active segment pops as a full pill, the row
        // ends are rounded on their outer side, middles stay slightly rounded.
        leftRadius: (toggled || root.leftmost) ? (height / 2) : Appearance.rounding.unsharpenmore
        rightRadius: (toggled || root.rightmost) ? (height / 2) : Appearance.rounding.unsharpenmore

        // light primary tint when idle, solid primary when active
        colBackground: ColorUtils.applyAlpha(Appearance.colors.colPrimary, 0.10)
        colBackgroundHover: ColorUtils.applyAlpha(Appearance.colors.colPrimary, 0.18)
        colBackgroundActive: ColorUtils.applyAlpha(Appearance.colors.colPrimary, 0.26)
        colBackgroundToggled: Appearance.colors.colPrimary
        colBackgroundToggledHover: Appearance.colors.colPrimaryHover
        colBackgroundToggledActive: Appearance.colors.colPrimaryActive

        contentItem: Item {
            implicitWidth: root.iconSize
            implicitHeight: root.iconSize

            // Custom-drawn Adaptive Audio glyph — not in the Material Symbols
            // font, so it's an SVG asset tinted via CustomIcon. Other modes
            // keep their MaterialSymbol font glyphs below.
            // NOTE: anchors.centerIn + explicit size — anchors.fill would make
            // the Loader adopt the button's whole content rect (~84x52) and
            // blow the icon up ~2x vs the font glyphs.
            Loader {
                anchors.centerIn: parent
                width: root.iconSize
                height: root.iconSize
                active: root.modelData.icon === "__adaptive_audio"
                sourceComponent: CustomIcon {
                    source: "adaptive-audio"
                    colorize: true
                    color: segment.toggled ? Appearance.colors.colOnPrimary : Appearance.colors.colPrimary
                    width: root.iconSize
                    height: root.iconSize
                }
            }

            MaterialSymbol {
                anchors.centerIn: parent
                visible: root.modelData.icon !== "__adaptive_audio"
                text: root.modelData.icon
                iconSize: root.iconSize
                color: segment.toggled ? Appearance.colors.colOnPrimary : Appearance.colors.colPrimary
            }
        }

        onClicked: AirPods.setNoiseMode(root.modelData.value)
    }

    // small visual gap between segment and label (font carries leading)
    Item {
        Layout.fillWidth: true
        implicitHeight: 4
    }

    StyledText {
        Layout.fillWidth: true
        Layout.preferredWidth: root.segWidth
        text: root.modelData.label
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
        font.pixelSize: Appearance.font.pixelSize.smaller
        font.weight: root.isActive ? Font.DemiBold : Font.Normal
        color: root.isActive ? Appearance.colors.colOnLayer2 : Appearance.colors.colOnLayer1
    }
}
