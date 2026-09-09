pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.widgets
import qs.services
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland

/**
 * AI usage popup — AirPods-style anchored popup (ii idiom).
 *
 * Header (title + refresh + close) · one card per provider, each listing its
 * quota windows as a labeled bar + used% + reset hint. OpenRouter shows
 * remaining dollars. Provider data comes from the AiUsage daemon.
 */
PanelWindow {
    id: root

    required property Item anchorItem
    signal closeRequested()

    readonly property real padding: 14

    function open() { root.visible = true; }
    function close() { root.closeRequested(); }

    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0
    WlrLayershell.namespace: "quickshell:popup"
    WlrLayershell.layer: WlrLayer.Overlay

    // ii StyledPopup convention (single-edge anchoring + margins.left)
    anchors {
        left: !Config.options.bar.vertical || (Config.options.bar.vertical && !Config.options.bar.bottom)
        right: Config.options.bar.vertical && Config.options.bar.bottom
        top: Config.options.bar.vertical || (!Config.options.bar.vertical && !Config.options.bar.bottom)
        bottom: !Config.options.bar.vertical && Config.options.bar.bottom
    }

    implicitWidth: 384 + Appearance.sizes.elevationMargin * 2
    implicitHeight: popupBackground.implicitHeight + Appearance.sizes.elevationMargin * 2

    margins {
        left: {
            if (!Config.options.bar.vertical) {
                const win = root.QsWindow?.window;
                const desired = win ? win.mapFromItem(root.anchorItem, (root.anchorItem.width - popupBackground.implicitWidth) / 2, 0).x : 0;
                const maxLeft = win ? win.width - root.implicitWidth - 8 : desired;
                return Math.max(8, Math.min(desired, maxLeft));
            }
            return Appearance.sizes.verticalBarWidth;
        }
        top: {
            if (!Config.options.bar.vertical)
                return Appearance.sizes.barHeight;
            return root.QsWindow?.mapFromItem(root.anchorItem, 0, (root.anchorItem.height - popupBackground.implicitHeight) / 2).y;
        }
        right: Appearance.sizes.verticalBarWidth
        bottom: Appearance.sizes.barHeight
    }

    onVisibleChanged: {
        if (visible) GlobalFocusGrab.addDismissable(root);
        else GlobalFocusGrab.removeDismissable(root);
    }
    Connections {
        target: GlobalFocusGrab
        function onDismissed() { root.closeRequested(); }
    }

    StyledRectangularShadow { target: popupBackground }

    Rectangle {
        id: popupBackground
        anchors {
            fill: parent
            leftMargin: Appearance.sizes.elevationMargin
            rightMargin: Appearance.sizes.elevationMargin
        }
        implicitWidth: 384
        implicitHeight: contentColumn.implicitHeight + root.padding * 2
        color: Appearance.m3colors.m3surfaceContainer
        radius: Appearance.rounding.small
        border.width: 1
        border.color: Appearance.colors.colLayer0Border

        MouseArea { anchors.fill: parent }  // block dismiss-on-click-through

        ColumnLayout {
            id: contentColumn
            anchors {
                left: parent.left
                right: parent.right
                top: parent.top
                margins: root.padding
            }
            spacing: 10

            // ---- header -------------------------------------------------
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                MaterialSymbol {
                    text: "monitoring"
                    iconSize: Appearance.font.pixelSize.larger
                    color: Appearance.colors.colPrimary
                }
                StyledText {
                    Layout.fillWidth: true
                    text: Translation.tr("AI Usage")
                    font.pixelSize: Appearance.font.pixelSize.large
                    color: Appearance.colors.colOnLayer2
                }
                // refresh
                ButtonMouseArea {
                    id: refreshButton
                    onClicked: AiUsage.requestRefresh()
                    Item {
                        implicitWidth: 22
                        implicitHeight: 22
                        MaterialSymbol {
                            anchors.centerIn: parent
                            text: AiUsage.refreshing ? "progress_activity" : "refresh"
                            iconSize: Appearance.font.pixelSize.normal
                            color: Appearance.colors.colOnLayer2
                        }
                    }
                }
                // close
                ButtonMouseArea {
                    onClicked: root.closeRequested()
                    Item {
                        implicitWidth: 22
                        implicitHeight: 22
                        MaterialSymbol {
                            anchors.centerIn: parent
                            text: "close"
                            iconSize: Appearance.font.pixelSize.normal
                            color: Appearance.colors.colOnLayer2
                        }
                    }
                }
            }

            // ---- provider cards -----------------------------------------
            Repeater {
                model: AiUsage.providers

                delegate: Rectangle {
                    id: providerCard
                    required property var modelData

                    readonly property var metrics: providerCard.modelData.metrics ?? []
                    readonly property var groups: providerCard.modelData.groups ?? []
                    readonly property bool hasError: providerCard.modelData.error !== null && providerCard.modelData.error !== undefined

                    Layout.fillWidth: true
                    implicitHeight: cardColumn.implicitHeight + 12
                    radius: Appearance.rounding.small
                    color: Appearance.colors.colSurfaceContainerHigh
                    border.width: 1
                    border.color: Appearance.colors.colLayer0Border

                    ColumnLayout {
                        id: cardColumn
                        anchors {
                            left: parent.left
                            right: parent.right
                            top: parent.top
                            margins: 8
                        }
                        spacing: 6

                        // provider name row (+error or per-group header)
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 6

                            StyledText {
                                Layout.fillWidth: true
                                text: providerCard.modelData.name
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: Appearance.colors.colOnLayer2
                            }
                            MaterialSymbol {
                                visible: providerCard.hasError
                                text: "error"
                                iconSize: Appearance.font.pixelSize.small
                                color: Appearance.m3colors.m3error
                            }
                        }

                        // flat metrics (opencode/copilot/openrouter)
                        Repeater {
                            model: providerCard.metrics

                            delegate: RowLayout {
                                id: metricRow
                                required property var modelData

                                readonly property real pct: metricRow.modelData.percentage ?? 0
                                readonly property bool credit: metricRow.modelData.type === "credits"

                                Layout.fillWidth: true
                                spacing: 8

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2

                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 6
                                        StyledText {
                                            Layout.fillWidth: true
                                            text: metricRow.modelData.name ?? metricRow.modelData.type ?? ""
                                            font.pixelSize: Appearance.font.pixelSize.small
                                            color: Appearance.colors.colOnLayer1
                                        }
                                        StyledText {
                                            text: {
                                                const m = metricRow.modelData;
                                                if (m.detail) return m.detail;
                                                const reset = m.resets_at ? Qt.formatDateTime(new Date(m.resets_at), "d MMM HH:mm") : "";
                                                return reset ? ("resets " + reset) : "";
                                            }
                                            font.pixelSize: Appearance.font.pixelSize.small
                                            color: Appearance.colors.colSubtext
                                        }
                                    }

                                    StyledProgressBar {
                                        Layout.fillWidth: true
                                        value: metricRow.pct / 100
                                    }
                                }

                                StyledText {
                                    Layout.preferredWidth: 40
                                    text: metricRow.pct + "%"
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    color: metricRow.pct >= (Config.options.aiUsage?.alarmPercent ?? 80) ? Appearance.m3colors.m3error : Appearance.colors.colOnLayer1
                                    horizontalAlignment: Text.AlignRight
                                }
                            }
                        }

                        // grouped metrics (antigravity model groups)
                        Repeater {
                            model: providerCard.groups

                            delegate: ColumnLayout {
                                id: groupBlock
                                required property var modelData

                                Layout.fillWidth: true
                                spacing: 4

                                StyledText {
                                    text: groupBlock.modelData.name
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    color: Appearance.colors.colSubtext
                                }

                                Repeater {
                                    model: groupBlock.modelData.metrics ?? []

                                    delegate: RowLayout {
                                        id: groupMetricRow
                                        required property var modelData

                                        readonly property real pct: groupMetricRow.modelData.percentage ?? 0
                                        readonly property string windowLabel: groupMetricRow.modelData.type === "rolling" ? "5-hour" : "weekly"

                                        Layout.fillWidth: true
                                        spacing: 8

                                        StyledText {
                                            Layout.preferredWidth: 52
                                            text: groupMetricRow.windowLabel
                                            font.pixelSize: Appearance.font.pixelSize.small
                                            color: Appearance.colors.colSubtext
                                        }

                                        StyledProgressBar {
                                            Layout.fillWidth: true
                                            value: groupMetricRow.pct / 100
                                        }

                                        StyledText {
                                            Layout.preferredWidth: 70
                                            text: {
                                                const secs = groupMetricRow.modelData.reset_in_seconds;
                                                const reset = secs ? (" " + AiUsage.formatReset(secs)) : "";
                                                return groupMetricRow.pct + "%" + reset;
                                            }
                                            font.pixelSize: Appearance.font.pixelSize.small
                                            color: groupMetricRow.pct >= (Config.options.aiUsage?.alarmPercent ?? 80) ? Appearance.m3colors.m3error : Appearance.colors.colOnLayer1
                                            horizontalAlignment: Text.AlignRight
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // empty state
            StyledText {
                visible: AiUsage.providers.length === 0
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                text: AiUsage.refreshing ? Translation.tr("Fetching usage…") : Translation.tr("No data yet — first refresh in progress")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colSubtext
            }
        }
    }
}
