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

    function toggle() {
        if (GlobalStates.dictationOpen) {
            // Super+T while recording = COMMIT (mode A): signal the sidecar,
            // which transcribes the final audio, emits "commit", and exits.
            // The panel's commit handler then closes dictationOpen.
            Quickshell.execDetached([
                "bash", "-c",
                "pkill -USR1 -f stt_dictate_sidecar.py 2>/dev/null || true"
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
    }
}
