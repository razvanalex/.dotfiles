import QtQuick
import QtQuick.Layouts
import Qt5Compat.GraphicalEffects
import Quickshell.Services.UPower
import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import qs.modules.common.panels.lock
import qs.modules.ii.bar as Bar
import Quickshell
import Quickshell.Services.SystemTray

MouseArea {
    id: root
    required property LockContext context
    property bool active: false
    property bool showInputField: active || context.currentText.length > 0
    readonly property bool requirePasswordToPower: Config.options.lock.security.requirePasswordToPower

    // Force focus on entry
    function forceFieldFocus() {
        passwordBox.forceActiveFocus();
    }
    Connections {
        target: context
        function onShouldReFocus() {
            forceFieldFocus();
        }
    }
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton
    onPressed: mouse => {
        forceFieldFocus();
    }
    // Background Wallpaper Image with multi-pass FastBlur and extraZoom
    Item {
        id: lockBgContainer
        anchors.fill: parent
        scale: Config.options?.lock?.blur?.enable ? (Config.options?.lock?.blur?.extraZoom ?? 1.1) : 1.0

        Image {
            id: lockBgImage
            anchors.fill: parent
            property bool wallpaperIsVideo: Config.options?.background?.wallpaperPath?.endsWith(".gif") || Config.options?.background?.wallpaperPath?.endsWith(".mp4") || Config.options?.background?.wallpaperPath?.endsWith(".webm") || Config.options?.background?.wallpaperPath?.endsWith(".mkv") || Config.options?.background?.wallpaperPath?.endsWith(".avi") || Config.options?.background?.wallpaperPath?.endsWith(".mov")
            property string wallpaperPath: {
                const rawPath = Config.options?.background?.wallpaperPath ?? "";
                const thumbPath = Config.options?.background?.thumbnailPath ?? "";
                if (wallpaperIsVideo) {
                    return thumbPath !== "" ? thumbPath : rawPath;
                }
                return rawPath;
            }
            source: wallpaperPath ? Qt.resolvedUrl(wallpaperPath) : ""
            fillMode: Image.PreserveAspectCrop
            visible: false
        }

        FastBlur {
            id: lockBlur
            anchors.fill: parent
            source: lockBgImage
            radius: Config.options?.lock?.blur?.enable ? (Config.options?.lock?.blur?.radius ?? 40) : 0
            visible: false
        }

        HueSaturation {
            id: lockVibrancy
            anchors.fill: parent
            source: lockBlur
            saturation: Config.options?.lock?.blur?.saturation ?? 0.2
            visible: false
        }

        BrightnessContrast {
            id: lockFinalEffect
            anchors.fill: parent
            source: lockVibrancy
            brightness: Config.options?.lock?.blur?.brightness ?? 0.0
            contrast: Config.options?.lock?.blur?.contrast ?? 0.1
        }

        Rectangle {
            anchors.fill: parent
            color: Qt.rgba(0, 0, 0, Config.options?.lock?.blur?.darken ?? 0.3)
        }
    }

    // Center Clock (1:1 Hyprlock Position Matching)
    Loader {
        anchors.fill: parent
        active: Config.options?.lock?.centerClock ?? true
        visible: active

        sourceComponent: Item {
            id: clockRoot
            anchors.fill: parent

            property var now: new Date()
            property bool use12h: Config.options?.lock?.use12Hour ?? false
            property bool showSec: Config.options?.lock?.showSeconds ?? true
            property string styleType: Config.options?.lock?.clockStyle ?? "stacked"

            Timer {
                interval: 1000
                running: true
                repeat: true
                onTriggered: clockRoot.now = new Date()
            }

            // Stacked Style (Hyprlock Positions: 100, 200, 460, 500)
            Item {
                anchors.fill: parent
                visible: clockRoot.styleType === "stacked"

                // Date (position = 0, -100, font_size = 34)
                StyledText {
                    anchors {
                        horizontalCenter: parent.horizontalCenter
                        top: parent.top
                        topMargin: 90
                    }
                    text: Qt.formatDateTime(clockRoot.now, "dddd, d MMMM yyyy")
                    font.pixelSize: 38
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colPrimary
                }

                // Hour-Time (position = 0, -200, font_size = 200)
                StyledText {
                    anchors {
                        horizontalCenter: parent.horizontalCenter
                        top: parent.top
                        topMargin: 140
                    }
                    text: Qt.formatDateTime(clockRoot.now, clockRoot.use12h ? "hh" : "HH")
                    font.pixelSize: 260
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colPrimary
                }

                // Seconds-Time (position = 0, -480, font_size = 40)
                StyledText {
                    visible: clockRoot.showSec
                    anchors {
                        horizontalCenter: parent.horizontalCenter
                        top: parent.top
                        topMargin: 465
                    }
                    text: Qt.formatDateTime(clockRoot.now, clockRoot.use12h ? "ss AP" : "ss")
                    font.pixelSize: 48
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colPrimary
                    z: 2
                }

                // Minute-Time (position = 0, -500, font_size = 200)
                StyledText {
                    anchors {
                        horizontalCenter: parent.horizontalCenter
                        top: parent.top
                        topMargin: 490
                    }
                    text: Qt.formatDateTime(clockRoot.now, "mm")
                    font.pixelSize: 260
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colOnLayer0
                    z: 1
                }
            }

            // Horizontal Style (Single Row Time)
            Column {
                visible: clockRoot.styleType !== "stacked"
                spacing: 10
                anchors {
                    horizontalCenter: parent.horizontalCenter
                    top: parent.top
                    topMargin: 120
                }

                // Date Header
                StyledText {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: Qt.formatDateTime(clockRoot.now, "dddd, d MMMM yyyy")
                    font.pixelSize: 34
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colPrimary
                }

                // Time (with optional seconds inline)
                StyledText {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: Qt.formatDateTime(clockRoot.now, clockRoot.use12h ? (clockRoot.showSec ? "hh:mm:ss AP" : "hh:mm AP") : (clockRoot.showSec ? "HH:mm:ss" : "HH:mm"))
                    font.pixelSize: 140
                    font.weight: Font.Black
                    font.family: "JetBrainsMono Nerd Font Mono"
                    color: Appearance.colors.colPrimary
                }
            }
        }
    }

    // Toolbar appearing animation
    property real toolbarScale: 0.9
    property real toolbarOpacity: 0
    Behavior on toolbarScale {
        NumberAnimation {
            duration: Appearance.animation.elementMove.duration
            easing.type: Appearance.animation.elementMove.type
            easing.bezierCurve: Appearance.animationCurves.expressiveFastSpatial
        }
    }
    Behavior on toolbarOpacity {
        animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
    }

    // Init
    Component.onCompleted: {
        forceFieldFocus();
        toolbarScale = 1;
        toolbarOpacity = 1;
    }

    // Key presses
    property bool ctrlHeld: false
    Keys.onPressed: event => {
        root.context.resetClearTimer();
        if (event.key === Qt.Key_Control) {
            root.ctrlHeld = true;
        }
        if (event.key === Qt.Key_Escape) { // Esc to clear
            root.context.currentText = "";
        } 
        forceFieldFocus();
    }
    Keys.onReleased: event => {
        if (event.key === Qt.Key_Control) {
            root.ctrlHeld = false;
        }
        forceFieldFocus();
    }

    // RippleButton {
    //     anchors {
    //         top: parent.top
    //         left: parent.left
    //         leftMargin: 10
    //         topMargin: 10
    //     }
    //     implicitHeight: 40
    //     colBackground: Appearance.colors.colLayer2
    //     onClicked: {
    //         context.unlocked(LockContext.ActionEnum.Unlock);
    //         GlobalStates.screenLocked = false;
    //     }
    //     contentItem: StyledText {
    //         text: "[[ DEBUG BYPASS ]]"
    //     }
    // }

    // Main toolbar: password box
    Toolbar {
        id: mainIsland
        anchors {
            horizontalCenter: parent.horizontalCenter
            bottom: parent.bottom
            bottomMargin: 20
        }
        Behavior on anchors.bottomMargin {
            animation: Appearance.animation.elementMove.numberAnimation.createObject(this)
        }

        scale: root.toolbarScale
        opacity: root.toolbarOpacity

        // Fingerprint
        Loader {
            Layout.leftMargin: 10
            Layout.rightMargin: 6
            Layout.alignment: Qt.AlignVCenter
            active: root.context.fingerprintsConfigured
            visible: active

            sourceComponent: MaterialSymbol {
                id: fingerprintIcon
                fill: 1
                text: "fingerprint"
                iconSize: Appearance.font.pixelSize.hugeass
                color: Appearance.colors.colOnSurfaceVariant
            }
        }

        ToolbarTextField {
            id: passwordBox
            Layout.rightMargin: -Layout.leftMargin
            placeholderText: GlobalStates.screenUnlockFailed ? Translation.tr("Incorrect password") : Translation.tr("Enter password")

            // Style
            clip: true
            font.pixelSize: Appearance.font.pixelSize.small
            selectedTextColor: materialShapeChars ? "transparent" : Appearance.colors.colOnSecondaryContainer
            selectionColor: materialShapeChars ? "transparent" : Appearance.colors.colSecondaryContainer

            // Password
            enabled: !root.context.unlockInProgress
            echoMode: TextInput.Password
            inputMethodHints: Qt.ImhSensitiveData

            // Synchronizing (across monitors) and unlocking
            onTextChanged: root.context.currentText = this.text
            onAccepted: {
                root.context.tryUnlock(ctrlHeld);
            }
            Connections {
                target: root.context
                function onCurrentTextChanged() {
                    passwordBox.text = root.context.currentText;
                }
            }

            Keys.onPressed: event => {
                root.context.resetClearTimer();
            }
            
            layer.enabled: true
            layer.effect: OpacityMask {
                maskSource: Rectangle {
                    width: passwordBox.width - 8
                    height: passwordBox.height
                    radius: height / 2
                }
            }

            // Shake when wrong password
            ErrorShakeAnimation {
                id: wrongPasswordShakeAnim
                target: passwordBox
            }
            Connections {
                target: GlobalStates
                function onScreenUnlockFailedChanged() {
                    if (GlobalStates.screenUnlockFailed) wrongPasswordShakeAnim.restart();
                }
            }

            // We're drawing dots manually
            property bool materialShapeChars: Config.options.lock.materialShapeChars
            color: ColorUtils.transparentize(Appearance.colors.colOnLayer1, materialShapeChars ? 1 : 0)
            Loader {
                active: passwordBox.materialShapeChars
                anchors {
                    fill: parent
                    leftMargin: passwordBox.padding
                    rightMargin: passwordBox.padding
                }
                sourceComponent: PasswordChars {
                    length: root.context.currentText.length
                    selectionStart: passwordBox.selectionStart
                    selectionEnd: passwordBox.selectionEnd
                    cursorPosition: passwordBox.cursorPosition
                }
            }
        }

        ToolbarButton {
            id: confirmButton
            implicitWidth: height
            toggled: true
            enabled: !root.context.unlockInProgress
            colBackgroundToggled: Appearance.colors.colPrimary

            onClicked: root.context.tryUnlock()

            contentItem: MaterialSymbol {
                anchors.centerIn: parent
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                iconSize: 24
                text: {
                    if (root.context.targetAction === LockContext.ActionEnum.Unlock) {
                        return root.ctrlHeld ? "coffee" : "arrow_right_alt";
                    } else if (root.context.targetAction === LockContext.ActionEnum.Poweroff) {
                        return "power_settings_new";
                    } else if (root.context.targetAction === LockContext.ActionEnum.Reboot) {
                        return "restart_alt";
                    }
                }
                color: confirmButton.enabled ? Appearance.colors.colOnPrimary : Appearance.colors.colSubtext
            }
        }
    }

    // Left toolbar
    Toolbar {
        id: leftIsland
        anchors {
            right: mainIsland.left
            top: mainIsland.top
            bottom: mainIsland.bottom
            rightMargin: 10
        }
        scale: root.toolbarScale
        opacity: root.toolbarOpacity

        // Username
        IconAndTextPair {
            Layout.leftMargin: 8
            icon: "account_circle"
            text: SystemInfo.username
        }

        // Keyboard layout (Xkb)
        Loader {
            Layout.rightMargin: 8
            Layout.fillHeight: true

            active: true
            visible: active

            sourceComponent: Row {
                spacing: 8

                MaterialSymbol {
                    id: keyboardIcon
                    anchors.verticalCenter: parent.verticalCenter
                    fill: 1
                    text: "keyboard_alt"
                    iconSize: Appearance.font.pixelSize.huge
                    color: Appearance.colors.colOnSurfaceVariant
                }
                Loader {
                    anchors.verticalCenter: parent.verticalCenter
                    sourceComponent: StyledText {
                        text: HyprlandXkb.currentLayoutCode
                        color: Appearance.colors.colOnSurfaceVariant
                        animateChange: true
                    }
                }
            }
        }

        // Keyboard layout (Fcitx)
        Bar.SysTray {
            Layout.rightMargin: 10
            Layout.alignment: Qt.AlignVCenter
            showSeparator: false
            showOverflowMenu: false
            pinnedItems: SystemTray.items.values.filter(i => i.id == "Fcitx")
            visible: pinnedItems.length > 0
        }
    }

    // Right toolbar
    Toolbar {
        id: rightIsland
        anchors {
            left: mainIsland.right
            top: mainIsland.top
            bottom: mainIsland.bottom
            leftMargin: 10
        }

        scale: root.toolbarScale
        opacity: root.toolbarOpacity

        IconAndTextPair {
            visible: Battery.available
            icon: Battery.isCharging ? "bolt" : "battery_full"
            text: Math.round(Battery.percentage * 100)
            color: (Battery.isLow && !Battery.isCharging) ? Appearance.colors.colError : Appearance.colors.colOnSurfaceVariant
        }

        IconToolbarButton {
            id: sleepButton
            onClicked: Session.suspend()
            text: "dark_mode"
        }

        PasswordGuardedIconToolbarButton {
            id: powerButton
            text: "power_settings_new"
            targetAction: LockContext.ActionEnum.Poweroff
        }

        PasswordGuardedIconToolbarButton {
            id: rebootButton
            text: "restart_alt"
            targetAction: LockContext.ActionEnum.Reboot
        }
    }

    component PasswordGuardedIconToolbarButton: IconToolbarButton {
        id: guardedBtn
        required property var targetAction

        toggled: root.context.targetAction === guardedBtn.targetAction

        onClicked: {
            if (!root.requirePasswordToPower) {
                root.context.unlocked(guardedBtn.targetAction);
                return;
            }
            if (root.context.targetAction === guardedBtn.targetAction) {
                root.context.resetTargetAction();
            } else {
                root.context.targetAction = guardedBtn.targetAction;
                root.context.shouldReFocus();
            }
        }
    }

    component IconAndTextPair: Row {
        id: pair
        required property string icon
        required property string text
        property color color: Appearance.colors.colOnSurfaceVariant

        spacing: 4
        Layout.fillHeight: true
        Layout.leftMargin: 10
        Layout.rightMargin: 10
        

        MaterialSymbol {
            anchors.verticalCenter: parent.verticalCenter
            fill: 1
            text: pair.icon
            iconSize: Appearance.font.pixelSize.huge
            animateChange: true
            color: pair.color
        }
        StyledText {
            anchors.verticalCenter: parent.verticalCenter
            text: pair.text
            color: pair.color
        }
    }
}
