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

    // PRESS/RELEASE split: the press opens the panel (or arms the commit),
    // the RELEASE triggers the commit. Triggering on release guarantees the
    // Super key is physically UP before the paste key is injected -- no
    // Super+ctrl+v collisions (pavucontrol etc).
    property real lastToggleTime: 0
    property bool commitArmed: false

    function toggle() {
        // press: debounce key-repeat
        const now = Date.now()
        if (now - root.lastToggleTime < 400) return
        root.lastToggleTime = now
        if (GlobalStates.dictationOpen) {
            // panel already open: arm the commit, fire it on Super release
            root.commitArmed = true
        } else {
            GlobalStates.dictationOpen = true
            root.commitArmed = false
        }
    }

    function onRelease() {
        if (root.commitArmed) {
            root.commitArmed = false
            // Super is released: safe to signal the sidecar to commit
            Quickshell.execDetached([
                "bash", "-c",
                "pkill -USR1 -f stt_dictate_sidecar.py 2>/dev/null || true"
            ])
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
        function release() { root.onRelease() }
    }
}
