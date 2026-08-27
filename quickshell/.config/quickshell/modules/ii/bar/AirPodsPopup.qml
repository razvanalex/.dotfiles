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
 * AirPods panel — omarchy-pods structure, illogical-impulse idiom.
 *
 * Header (device + close) · Battery trio (L/R/Case with in-ear + charging
 * hints) · Noise Control segmented selector (Off/Transparency/Adaptive/ANC)
 * with Adaptive Noise Level slider shown only in Adaptive · Feature toggles
 * (Conversation Awareness, One-Bud ANC, Volume Swipe, Ear Detection).
 */
PanelWindow {
    id: root

    required property Item anchorItem
    signal closeRequested()

    readonly property real padding: 14
    readonly property string activeMode: AirPods.noiseMode

    function open() {
        root.visible = true;
    }
    function close() {
        root.closeRequested();
    }

    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0
    WlrLayershell.namespace: "quickshell:popup"
    WlrLayershell.layer: WlrLayer.Overlay

    // ii StyledPopup convention: for a horizontal top bar anchor left+top so
    // margins.left positions the popup under the clicked item (single-edge
    // anchoring would let the compositor center it on screen).
    anchors {
        left: !Config.options.bar.vertical || (Config.options.bar.vertical && !Config.options.bar.bottom)
        right: Config.options.bar.vertical && Config.options.bar.bottom
        top: Config.options.bar.vertical || (!Config.options.bar.vertical && !Config.options.bar.bottom)
        bottom: !Config.options.bar.vertical && Config.options.bar.bottom
    }

    implicitWidth: 384 + Appearance.sizes.elevationMargin * 2
    implicitHeight: popupBackground.implicitHeight + Appearance.sizes.elevationMargin * 2

    // No input mask: outside interaction is handled by GlobalFocusGrab
    // (same mechanism as the sidebars) — clicking anywhere outside this
    // window clears the grab and dismisses the popup.

    margins {
        left: {
            if (!Config.options.bar.vertical) {
                const win = root.QsWindow?.window;
                const desired = win ? win.mapFromItem(root.anchorItem, (root.anchorItem.width - popupBackground.implicitWidth) / 2, 0).x : 0;
                // keep the popup fully on-screen (8px breathing room)
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

    // dismiss on outside click: register with GlobalFocusGrab like the
    // sidebars do; a click anywhere outside this window clears the grab
    // and emits dismissed()
    onVisibleChanged: {
        if (visible) {
            GlobalFocusGrab.addDismissable(root);
        } else {
            GlobalFocusGrab.removeDismissable(root);
        }
    }
    Connections {
        target: GlobalFocusGrab
        function onDismissed() {
            root.closeRequested();
        }
    }

    StyledRectangularShadow {
        target: popupBackground
    }

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

        // block the dismiss-MouseArea behind the background from
        // closing the popup when clicking inside the card itself
        MouseArea {
            anchors.fill: parent
        }

        ColumnLayout {
            id: contentColumn
            anchors {
                left: parent.left
                right: parent.right
                top: parent.top
                margins: root.padding
            }
            spacing: 12

            // ---- header -------------------------------------------------
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                AirPodsIcon {
                    iconSize: Appearance.font.pixelSize.larger
                    variant: "pro"
                    color: Appearance.colors.colPrimary
                }
                StyledText {
                    Layout.fillWidth: true
                    text: AirPods.deviceName || "AirPods"
                    font.pixelSize: Appearance.font.pixelSize.large
                    color: Appearance.colors.colOnLayer2
                }
            }

            // ---- battery trio: L / R / Case -------------------------------
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Repeater {
                    model: [
                        {
                            label: "Left",
                            level: AirPods.batteryLeft,
                            ear: AirPods.earLeft,
                            glyph: "left"
                        },
                        {
                            label: "Right",
                            level: AirPods.batteryRight,
                            ear: AirPods.earRight,
                            glyph: "right"
                        },
                        {
                            label: "Case",
                            level: AirPods.batteryCase,
                            ear: "",
                            glyph: "case"
                        }
                    ]

                    delegate: Rectangle {
                        id: batteryCell
                        required property var modelData
                        readonly property bool known: batteryCell.modelData.level >= 0

                        Layout.fillWidth: true
                        implicitHeight: batteryCellContent.implicitHeight + 14
                        radius: Appearance.rounding.small
                        color: Appearance.colors.colSurfaceContainerHigh
                        visible: batteryCell.known

                        ColumnLayout {
                            id: batteryCellContent
                            anchors.centerIn: parent
                            width: parent.width - 12
                            spacing: 5

                            // glyph dominant + big %; ear state as a corner
                            // dot (filled=in ear, hollow=out, gray=in case)
                            Item {
                                id: glyphBox
                                Layout.alignment: Qt.AlignHCenter
                                implicitWidth: 34
                                implicitHeight: 30
                                readonly property bool isCase: batteryCell.modelData.glyph === "case"

                                AirPodsIcon {
                                    anchors.centerIn: parent
                                    visible: glyphBox.isCase
                                    iconSize: 26
                                    variant: "case"
                                    color: Appearance.colors.colOnLayer2
                                }
                                Item {
                                    anchors.centerIn: parent
                                    visible: !glyphBox.isCase
                                    width: 16
                                    height: 26
                                    clip: true

                                    AirPodsIcon {
                                        iconSize: 32
                                        variant: "pro"
                                        color: Appearance.colors.colOnLayer2
                                        // pair is mirrored (back view, stems inward):
                                        // left card clips the LEFT half, right card the RIGHT half
                                        x: batteryCell.modelData.glyph === "left" ? 0 : -16
                                    }
                                }
                                // ear-state dot (buds only)
                                Rectangle {
                                    visible: !glyphBox.isCase && batteryCell.modelData.ear !== ""
                                    anchors.right: parent.right
                                    anchors.bottom: parent.bottom
                                    width: 8
                                    height: 8
                                    radius: 4
                                    color: batteryCell.modelData.ear === "in" ? Appearance.colors.colPrimary : "transparent"
                                    border.width: batteryCell.modelData.ear === "in" ? 0 : 1
                                    border.color: Appearance.colors.colOutline
                                }
                            }

                            StyledText {
                                Layout.alignment: Qt.AlignHCenter
                                text: batteryCell.modelData.level + "%"
                                font.pixelSize: Appearance.font.pixelSize.large
                                color: batteryCell.modelData.level <= 20 ? Appearance.m3colors.m3error : Appearance.colors.colOnLayer2
                            }
                        }
                    }
                }
            }

            // ---- noise control --------------------------------------------
            StyledText {
                text: Translation.tr("Noise Control")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colOnLayer1
            }

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 2

                Repeater {
                    model: [
                        {
                            label: "Off",
                            icon: "noise_control_off",
                            value: "off"
                        },
                        {
                            label: "Transparency",
                            icon: "noise_aware",
                            value: "transparency"
                        },
                        {
                            label: "Adaptive",
                            icon: "__adaptive_audio",
                            value: "adaptive"
                        },
                        {
                            label: "ANC",
                            icon: "noise_control_on",
                            value: "anc"
                        }
                    ]

                    delegate: AirPodsModeChip {
                        leftmost: index === 0
                        rightmost: index === 3
                        required property int index
                    }
                }
            }

            // Adaptive noise level — only while Adaptive is active
            RowLayout {
                Layout.fillWidth: true
                visible: root.activeMode === "adaptive" && AirPods.adaptiveLevelKnown
                spacing: 8

                StyledText {
                    text: Translation.tr("Noise level")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnLayer2
                }
                Slider {
                    id: adaptiveSlider
                    Layout.fillWidth: true
                    from: 0
                    to: 100
                    stepSize: 1
                    value: AirPods.adaptiveLevel

                    // commit on release, not per-tick (AACP is chatty)
                    onMoved: AirPods.setAdaptiveLevel(adaptiveSlider.value)

                    background: Rectangle {
                        x: adaptiveSlider.leftPadding
                        y: adaptiveSlider.topPadding + adaptiveSlider.availableHeight / 2 - height / 2
                        width: adaptiveSlider.availableWidth
                        height: 4
                        radius: 2
                        color: Appearance.colors.colSurfaceContainerHighest

                        Rectangle {
                            width: adaptiveSlider.visualPosition * parent.width
                            height: parent.height
                            radius: 2
                            color: Appearance.colors.colPrimary
                        }
                    }
                    handle: Rectangle {
                        x: adaptiveSlider.leftPadding + adaptiveSlider.visualPosition * (adaptiveSlider.availableWidth - width)
                        y: adaptiveSlider.topPadding + adaptiveSlider.availableHeight / 2 - height / 2
                        width: 14
                        height: 14
                        radius: 7
                        color: Appearance.colors.colPrimary
                    }
                }
                StyledText {
                    text: AirPods.adaptiveLevel + "%"
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnLayer2
                }
            }

            // ---- features ---------------------------------------------------
            StyledText {
                visible: AirPods.caKnown || AirPods.oneBudAncKnown || AirPods.volumeSwipeKnown || AirPods.earDetectionKnown || AirPods.personalisedVolumeKnown || AirPods.sleepDetectionKnown
                text: Translation.tr("Features")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colOnLayer1
            }

            Repeater {
                model: [
                    {
                        label: "Conversation Awareness",
                        known: AirPods.caKnown,
                        value: AirPods.conversationAwareness,
                        setter: v => AirPods.setConversationAwareness(v)
                    },
                    {
                        label: "NC with One AirPod",
                        known: AirPods.oneBudAncKnown,
                        value: AirPods.oneBudAnc,
                        setter: v => AirPods.setOneBudAnc(v)
                    },
                    {
                        label: "Volume Swipe",
                        known: AirPods.volumeSwipeKnown,
                        value: AirPods.volumeSwipe,
                        setter: v => AirPods.setVolumeSwipe(v)
                    },
                    {
                        label: "Ear Detection",
                        known: AirPods.earDetectionKnown,
                        value: AirPods.earDetection,
                        setter: v => AirPods.setEarDetection(v)
                    },
                    {
                        label: "Personalised Volume",
                        known: AirPods.personalisedVolumeKnown,
                        value: AirPods.personalisedVolume,
                        setter: v => AirPods.setPersonalisedVolume(v)
                    },
                    {
                        label: "Pause When Falling Asleep",
                        known: AirPods.sleepDetectionKnown,
                        value: AirPods.sleepDetection,
                        setter: v => AirPods.setSleepDetection(v)
                    }
                ]

                delegate: RowLayout {
                    id: toggleDelegate
                    required property var modelData

                    Layout.fillWidth: true
                    visible: toggleDelegate.modelData.known

                    StyledText {
                        Layout.fillWidth: true
                        text: toggleDelegate.modelData.label
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.colors.colOnLayer2
                    }
                    StyledSwitch {
                        checked: toggleDelegate.modelData.value
                        onToggled: toggleDelegate.modelData.setter(checked)
                    }
                }
            }

            StyledText {
                Layout.alignment: Qt.AlignHCenter
                visible: !AirPods.connected
                text: Translation.tr("AirPods daemon not connected")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colOnLayer1
            }
        }
    }
}
