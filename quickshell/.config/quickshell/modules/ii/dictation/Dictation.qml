pragma ComponentBehavior: Bound
import qs
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland

Scope {
    id: root

    Loader {
        id: dictationLoader
        active: GlobalStates.dictationOpen
        sourceComponent: DictationPanel {}
    }

    property real lastToggleTime: 0

    function toggle() {
        // debounce: hold/repeat of Super+T fires the bind multiple times
        const now = Date.now()
        if (now - root.lastToggleTime < 400) return
        root.lastToggleTime = now
        if (GlobalStates.dictationOpen) {
            // Super+T while recording = COMMIT: signal the sidecar, which
            // transcribes the final audio, emits "commit", and exits.
            Quickshell.execDetached([
                "bash", "-c",
                "pkill -USR1 -f '/home/razvan/Workspace/ai/tts-read/stt_dictate_sidecar.py' 2>/dev/null || true"
            ])
        } else {
            GlobalStates.dictationOpen = true
        }
    }

    function dismiss() {
        // ✕ button / focus loss: cancel WITHOUT committing. The panel's
        // Process is stopped (running: false), sending SIGTERM to the sidecar,
        // which exits cleanly without typing.
        GlobalStates.dictationOpen = false
    }

    IpcHandler {
        target: "dictation"
        function toggle() { root.toggle() }
        function dismiss() { root.dismiss() }

    }
}
