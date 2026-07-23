import QtQuick
import Quickshell
import Quickshell.Io
import qs.modules.common
import qs.modules.common.functions
import qs.modules.common.widgets

Item {
    id: root
    required property var fileModelData

    anchors.fill: parent

    property string firstImagePath: ""

    Process {
        running: fileModelData.fileIsDir
        command: ["bash", "-c", "find \"" + fileModelData.filePath + "\" -maxdepth 1 -type f \\( -iname \"*.png\" -o -iname \"*.jpg\" -o -iname \"*.jpeg\" -o -iname \"*.webp\" \\) | sort | head -n 1"]
        stdout: StdioCollector {
            onStreamFinished: {
                const img = text.trim()
                if (img.length > 0) {
                    root.firstImagePath = img
                }
            }
        }
    }

    Rectangle {
        id: bgCard
        anchors.fill: parent
        color: Appearance.colors.colLayer1
        radius: Appearance.rounding.small
        clip: true

        Image {
            id: previewImg
            anchors.fill: parent
            visible: root.firstImagePath !== ""
            source: root.firstImagePath !== "" ? ("file://" + root.firstImagePath) : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            cache: true
        }

        MaterialSymbol {
            anchors.centerIn: parent
            visible: root.firstImagePath === ""
            text: fileModelData.fileIsDir ? "folder" : "image"
            iconSize: 36
            color: Appearance.colors.colPrimary
        }
    }
}
