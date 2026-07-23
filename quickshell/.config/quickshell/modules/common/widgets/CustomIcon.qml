import QtQuick
import Quickshell
import Quickshell.Widgets
import Qt5Compat.GraphicalEffects
import qs.modules.common
import qs.modules.common.widgets

Item {
    id: root

    property bool colorize: false
    property color color
    property string source: ""
    property string iconFolder: Qt.resolvedUrl(Quickshell.shellPath("assets/icons"))
    width: 30
    height: 30

    property bool failed: false
    property bool triedSystemFallback: false

    onSourceChanged: {
        root.failed = false;
        root.triedSystemFallback = false;
    }

    IconImage {
        id: iconImage
        anchors.fill: parent
        visible: status === Image.Ready && !root.failed
        source: {
            if (!root.source || root.source.length === 0) return "";

            // Explicit path
            if (root.source.startsWith("file://") || root.source.startsWith("/")) return root.source;

            // Try local asset folder first
            let localPath = root.iconFolder + "/" + root.source;
            if (!root.source.endsWith(".svg") && !root.source.endsWith(".png")) {
                localPath += ".svg";
            }
            return localPath;
        }
        implicitSize: root.height
        onStatusChanged: {
            if (status === Image.Error) {
                if (!root.triedSystemFallback) {
                    root.triedSystemFallback = true;
                    const sysPath = Quickshell.iconPath(root.source, "");
                    if (sysPath && sysPath.length > 0) {
                        source = sysPath;
                    } else {
                        root.failed = true;
                    }
                } else {
                    root.failed = true;
                }
            }
        }
    }

    Loader {
        active: root.colorize && iconImage.visible
        anchors.fill: iconImage
        sourceComponent: ColorOverlay {
            source: iconImage
            color: root.color
        }
    }
}
