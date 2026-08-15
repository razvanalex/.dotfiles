pragma ComponentBehavior: Bound

import qs.services
import qs.modules.common
import qs.modules.common.functions
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import Quickshell

// Notes:
// We deal with keybinds being numbered 1, 2, etc by discarding 2+, keeping 1 and replacing it with a generic "<Number>"
// Binds that share the same display description are merged into one row, with each key combo
// rendered side by side separated by "/" (e.g. SUPER+left / SUPER+H / SUPER+[ -> Focus window left).
Column {
    id: root
    required property string categoryName
    readonly property bool isCategorized: categoryName?.length > 0
    property real titleSpacing: 7

    // Excellent symbol explaination and source :
    // http://xahlee.info/comp/unicode_computing_symbols.html
    // https://www.nerdfonts.com/cheat-sheet
    property var macSymbolMap: ({
        "Ctrl": "\udb81\ude34",
        "Alt": "\udb81\ude35",
        "Shift": "\udb81\ude36",
        "Space": "\udb84\udc50",
        "Tab": "\u21b9",
        "Equal": "\udb80\uddfc",
        "Minus": "\uf068",
        "Print": "\uf125",
        "BackSpace": "\udb82\udf5c",
        "Delete": "\u2326",
        "Return": "\udb80\udf11",
        "Period": ".",
        "Escape": "\u238b"
      })
    property var functionSymbolMap: ({
        "F1":  "\udb84\udeab",
        "F2":  "\udb84\udeac",
        "F3":  "\udb84\udead",
        "F4":  "\udb84\udeae",
        "F5":  "\udb84\udeaf",
        "F6":  "\udb84\udeb0",
        "F7":  "\udb84\udeb1",
        "F8":  "\udb84\udeb2",
        "F9":  "\udb84\udeb3",
        "F10": "\udb84\udeb4",
        "F11": "\udb84\udeb5",
        "F12": "\udb84\udeb6",
    })

    property var mouseSymbolMap: ({
        "mouse_up": "\udb85\udd50",
        "mouse_down": "\udb85\udd51",
        "mouse:272": "L\udb80\udf7d",
        "mouse:273": "R\udb80\udf7d",
        "Scroll \u2191/\u2193": "\udb85\udd52",
        "Page_\u2191/\u2193": "\u21de/\u21df",
    })

    property var keyBlacklist: ["SUPER_L", "SUPER_R"]
    property var keySubstitutions: Object.assign({
        "Super": "\ue8e5",
        "mouse_up": "Scroll \u2193",    // ikr, weird
        "mouse_down": "Scroll \u2191",  // trust me bro
        "mouse:272": "LMB",
        "mouse:273": "RMB",
        "mouse:275": "MouseBack",
        "Slash": "/",
        "Hash": "#",
        "Return": "Enter",
        "left": "\u2190",
        "right": "\u2192",
        "up": "\u2191",
        "down": "\u2193",
        "BracketLeft": "[",
        "BracketRight": "]",
        "Page_Down": "PgDn",
        "Page_Up": "PgUp",
        // "Shift": "\uf062",
      },
      !!Config.options.cheatsheet.superKey ? {
          "Super": Config.options.cheatsheet.superKey,
      }: {},
      Config.options.cheatsheet.useMacSymbol ? macSymbolMap : {},
      Config.options.cheatsheet.useFnSymbol ? functionSymbolMap : {},
      Config.options.cheatsheet.useMouseSymbol ? mouseSymbolMap : {},
    )

    function modMaskToStringList(modMask: int): list<string> {
        var list = [];
        // Funny mathematical order but we wanna have this natural user-facing order
        if (modMask & (1 << 2)) { list.push("Ctrl"); }
        if (modMask & (1 << 6)) { list.push("Super"); }
        if (modMask & (1 << 0)) { list.push("Shift"); }
        if (modMask & (1 << 3)) { list.push("Alt"); }
        if (modMask & (1 << 1)) { list.push("Caps"); }
        if (modMask & (1 << 4)) { list.push("Mod2"); }
        if (modMask & (1 << 5)) { list.push("Mod3"); }
        if (modMask & (1 << 7)) { list.push("Mod5"); }
        return list;
    }

    visible: repeater.model.length > 0
    spacing: titleSpacing

    StyledText {
        text: root.isCategorized ? root.categoryName : "Uncategorized"
        font.pixelSize: Appearance.font.pixelSize.title
    }

    function hasDescription(bind) {
        return bind.description?.length > 0;
    }

    function isCategory(bind, categoryName) {
        return bind.description.substring(0, bind.description.indexOf(":")) === categoryName;
    }

    function isUncategorized(bind) {
        return bind.description.indexOf(":") === -1;
    }

    function containsNonFirstRepetitive(bind) {
        const key = bind.key;
        if (key.includes("mouse") || key.includes("page")) return false;
        // Contains non-1 number
        if (/^\d+$/.test(key) && !key.includes("1")) return true;
        return false;
    }

    function containsFirstRepetitive(bind) {
        const key = bind.key;
        return key.includes("1");
    }

    function transformKey(key) {
        const replaced = root.keySubstitutions[key] || key;
        const denumbered = replaced.replace("1", "<Number>");
        const dedirectioned = denumbered.replace("Left", "<Direction>");
        return dedirectioned;
    }

    function transformDescription(bind, categoryName) {
        const description = bind.description
        const regex = new RegExp("\\s*" + categoryName + "\\s*:\\s*");
        const decategorized = description.replace(regex, "");
        if (!containsFirstRepetitive(bind)) return decategorized;
        const denumbered = decategorized.replace("1", "<Number>");
        const dedirectioned = denumbered.replace(/ \b(left|right|up|down)\b/i, " <Direction>");
        return dedirectioned;
    }

    // Group the category's binds by their final display description.
    // Each group becomes one row: all key combos side by side, then the description once.
    function groupBinds() {
        const binds = HyprlandKeybinds.keybinds.filter(bind => root.hasDescription(bind) && (root.isCategorized ? root.isCategory(bind, root.categoryName) : root.isUncategorized(bind)) && !root.containsNonFirstRepetitive(bind));
        const groups = [];
        const byText = {};
        for (const b of binds) {
            const t = root.transformDescription(b, root.categoryName);
            if (!byText[t]) {
                byText[t] = [];
                groups.push({ text: t, binds: byText[t] });
            }
            byText[t].push(b);
        }
        return groups;
    }

    Column {
        spacing: 4
        Repeater {
            id: repeater
            model: root.groupBinds()
            delegate: BindGroup {
                required property var modelData
                groupText: modelData.text
                binds: modelData.binds
            }
        }
    }

    component BindGroup: Row {
        id: group
        required property var binds
        required property string groupText
        spacing: 12

        Row {
            spacing: 6
            Repeater {
                model: group.binds
                delegate: Row {
                    required property var modelData
                    required property int index
                    readonly property var b: modelData
                    spacing: 4

                    StyledText {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: index > 0
                        text: "/"
                    }
                    Row {
                        spacing: 4
                        Repeater {
                            model: {
                                const modList = root.modMaskToStringList(b.modmask).map(mod => root.keySubstitutions[mod] || mod)
                                if (modList.length == 0) return []
                                if (Config.options.cheatsheet.splitButtons) return modList;
                                return [modList.join(" ")]
                            }
                            delegate: KeyboardKey {
                                required property var modelData
                                key: root.transformKey(modelData)
                                pixelSize: Config.options.cheatsheet.fontSize.key
                            }
                        }
                    }
                    StyledText {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: !root.keyBlacklist.includes(b.key) && b.modmask > 0
                        text: "+"
                    }
                    KeyboardKey {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: !root.keyBlacklist.includes(b.key)
                        key: root.transformKey(b.key)
                        pixelSize: Config.options.cheatsheet.fontSize.key
                        color: Appearance.colors.colOnLayer0
                    }
                }
            }
        }
        StyledText {
            anchors.verticalCenter: parent.verticalCenter
            font.pixelSize: Config.options.cheatsheet.fontSize.comment || Appearance.font.pixelSize.smaller
            text: group.groupText
        }
    }
}
