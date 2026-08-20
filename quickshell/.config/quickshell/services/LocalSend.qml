pragma Singleton
pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.functions as CF
import qs
import QtQuick
import Quickshell
import Quickshell.Io

/**
 * LocalSend service: hosts the localsend_agent.py daemon (discovery + receive,
 * always on so we can accept files anytime) and exposes its state/actions to
 * the panel and bar. Sends run as one-shot `--send` subprocesses (argv-safe).
 */
Singleton {
    id: root

    readonly property string script: `${CF.FileUtils.trimFileProtocol(Directories.scriptPath)}/localsend/localsend_agent.py`
    readonly property string control: "http://127.0.0.1:53318"

    // ---- state surfaced to the UI ----
    property string selfAlias: ""
    property bool daemonRunning: false
    property var peers: []          // [{alias, ip, port, protocol, fingerprint, deviceType}]
    property var inbound: []        // [{session, sender, files:[{id,fileName,size}], state}]
    property int inboundPendingCount: 0
    property bool sending: false
    // active outbound transfer: {state, peer, files, index, fileName, bytesDone, bytesTotal, pct, message}
    property var sendTransfer: null

    // ---- persistent staging state (retained across panel closes) ----
    property var staged: []          // [{id, type, name, path, text, meta}]
    property var selectedPeers: []   // [{alias, ip, port, protocol, fingerprint, deviceType}]
    property var selectedPeer: selectedPeers.length > 0 ? selectedPeers[0] : null
    property string composeDraft: ""
    property bool textComposeVisible: false
    property string lastPickKind: "file"

    function isPeerSelected(peer) {
        if (!peer) return false;
        return (root.selectedPeers || []).some(p => p.ip === peer.ip);
    }

    function togglePeer(peer) {
        if (!peer) return;
        const cur = (root.selectedPeers || []).slice();
        const idx = cur.findIndex(p => p.ip === peer.ip);
        if (idx >= 0) {
            cur.splice(idx, 1);
        } else {
            cur.push(peer);
        }
        root.selectedPeers = cur;
    }

    function selectAllPeers() {
        root.selectedPeers = (root.peers || []).slice();
    }

    function clearPeerSelection() {
        root.selectedPeers = [];
    }

    function _stageId() {
        return (Date.now()).toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function stagePaths(paths, kind) {
        const next = (root.staged || []).slice();
        for (let i = 0; i < paths.length; i++) {
            const p = paths[i];
            next.push({
                id: root._stageId(),
                type: kind || "file",
                name: p.split(/[\\/]/).pop(),
                path: p,
                text: "",
                meta: kind === "folder" ? Translation.tr("Folder") : Translation.tr("File")
            });
        }
        root.staged = next;
    }

    function stageText(text) {
        const t = (text || "").trim();
        if (!t.length) return;
        const next = (root.staged || []).slice();
        next.push({
            id: root._stageId(),
            type: "text",
            name: t.length > 48 ? t.slice(0, 48) + "…" : t,
            path: "",
            text: t,
            meta: Translation.tr("Text")
        });
        root.staged = next;
        root.textComposeVisible = false;
        root.composeDraft = "";
    }

    function stageClipboard() {
        const t = Quickshell.clipboardText;
        if (!t || !t.length) return false;
        root.stageText(t);
        return true;
    }

    function stageRemove(id) {
        root.staged = (root.staged || []).filter(it => it.id !== id);
    }

    function stageClear() {
        root.staged = [];
    }

    function stagedPaths() {
        return (root.staged || []).filter(it => it.path).map(it => it.path);
    }

    function stagedText() {
        return (root.staged || []).filter(it => it.type === "text").map(it => it.text).join("\n\n");
    }

    function toggleCompose() {
        root.textComposeVisible = !root.textComposeVisible;
    }

    function _mapInbound(session, fn) {
        root.inbound = root.inbound.map(s => s.session === session ? (fn(s), s) : s);
    }

    // Mark a received-transfer entry done/removed and refresh the pending badge
    function _refreshPending() {
        root.inboundPendingCount = root.inbound.filter(s => s.state === "pending").length;
    }

    // Drop terminal (Saved/Declined) entries older than `ageMs` so the floating
    // panel doesn't accumulate history forever.
    readonly property int terminalTtlMs: 30000   // 30s — enough to confirm the file landed
    function _pruneTerminal() {
        const now = Date.now();
        root.inbound = root.inbound.filter(s => {
            const terminal = s.state === "done" || s.state === "declined";
            return !(terminal && (now - (s.finishedAt || 0)) > root.terminalTtlMs);
        });
        root._refreshPending();
    }
    Timer {
        interval: 1000
        repeat: true
        running: true
        onTriggered: root._pruneTerminal()
    }

    function buildDaemonCommand() {
        let cmd = [root.script];
        if (Config.options.localsend) {
            const c = Config.options.localsend;
            if (c.alias && c.alias.length) { cmd.push("--alias"); cmd.push(c.alias); }
            if (c.deviceType && c.deviceType.length) { cmd.push("--device-type"); cmd.push(c.deviceType); }
            if (c.deviceModel && c.deviceModel.length) { cmd.push("--device-model"); cmd.push(c.deviceModel); }
            if (c.savePath && c.savePath.length) { cmd.push("--save-dir"); cmd.push(c.savePath); }
            if (c.pin && c.pin.length) { cmd.push("--pin"); cmd.push(c.pin); }
            if (c.requirePin) { cmd.push("--require-pin"); }
            if (c.autoAccept) { cmd.push("--auto-accept"); }
            if (c.verifyChecksums === false) { cmd.push("--no-verify-checksums"); }
            if (c.port) { cmd.push("--port"); cmd.push(c.port.toString()); }
            if (c.multicastGroup && c.multicastGroup.length) { cmd.push("--group"); cmd.push(c.multicastGroup); }
        }
        return cmd;
    }

    Connections {
        target: Config.options.localsend || null
        function onAliasChanged() { restartDaemonTimer.restart(); }
        function onDeviceTypeChanged() { restartDaemonTimer.restart(); }
        function onDeviceModelChanged() { restartDaemonTimer.restart(); }
        function onSavePathChanged() { restartDaemonTimer.restart(); }
        function onPinChanged() { restartDaemonTimer.restart(); }
        function onRequirePinChanged() { restartDaemonTimer.restart(); }
        function onAutoAcceptChanged() { restartDaemonTimer.restart(); }
        function onVerifyChecksumsChanged() { restartDaemonTimer.restart(); }
        function onPortChanged() { restartDaemonTimer.restart(); }
        function onMulticastGroupChanged() { restartDaemonTimer.restart(); }
    }

    Timer {
        id: restartDaemonTimer
        interval: 1200
        repeat: false
        onTriggered: {
            daemonProc.running = false;
            daemonProc.command = root.buildDaemonCommand();
            daemonProc.running = true;
        }
    }

    // ---- daemon (receive + discovery), runs for the whole session ----
    Process {
        id: daemonProc
        running: true
        command: root.buildDaemonCommand()
        onStarted: root.daemonRunning = true
        onExited: (code, status) => root.daemonRunning = false

        // daemon diagnostics (python `logging` + tracebacks) go to stderr; forward
        // them into the qs log/journal so they sit with the other shell logs.
        stderr: SplitParser {
            onRead: line => { if (line.length) print("[localsend]", line) }
        }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    switch (m.type) {
                        case "self":
                            root.selfAlias = m.alias;
                            break;
                        case "peers":
                            root.peers = m.peers || [];
                            break;
                        case "inbound":
                            root.inbound = root.inbound.concat([{
                                session: m.session,
                                sender: m.sender || "Unknown",
                                files: (m.files || []).map(f => ({
                                    id: f.id, fileName: f.fileName, size: f.size,
                                    status: "pending"
                                })),
                                state: "pending"
                            }]);
                            root._refreshPending();
                            // surface it: pop the panel open so the request can be
                            // accepted without the user having to open it manually
                            GlobalStates.localsendOpen = true;
                            break;
                        case "accepted":
                            root._mapInbound(m.session, s => s.state = "transferring");
                            break;
                        case "progress":
                            root._mapInbound(m.session, s => {
                                if (m.total > 0) s.pct = m.written / m.total;
                            });
                            break;
                        case "done":
                            root._mapInbound(m.session, s => {
                                s.state = "done";
                                s.pct = 1;
                                s.path = m.path;
                                s.isText = !!m.text;
                                s.finishedAt = Date.now();
                                if (!s.savedPaths) s.savedPaths = [];
                                if (m.path && !s.savedPaths.includes(m.path)) s.savedPaths.push(m.path);
                                root.recordHistory({
                                    direction: "received",
                                    peer: s.sender || "Unknown",
                                    status: "done",
                                    files: (s.files || []).map(f => f.fileName),
                                    paths: s.savedPaths.slice(),
                                    text: s.text || "",
                                    isText: !!s.isText
                                });
                            });
                            root._refreshPending();
                            break;
                        case "declined":
                            root._mapInbound(m.session, s => {
                                s.state = "declined";
                                s.finishedAt = Date.now();
                                root.recordHistory({
                                    direction: "received",
                                    peer: s.sender || "Unknown",
                                    status: "declined",
                                    files: (s.files || []).map(f => f.fileName)
                                });
                            });
                            root._refreshPending();
                            break;
                        default: break;
                    }
                } catch (e) { /* ignore malformed lines */ }
            }
        }
    }

    // ---- outgoing send: one-shot agent --send subprocess (argv-safe) ----
    Process {
        id: sendProc
        running: false
        property string targetAlias: ""
        command: []
        onStarted: root.sending = true
        onExited: (code, status) => {
            root.sending = false
            if (root.sendTransfer && root.sendTransfer.state === "sending") {
                root.sendTransfer = Object.assign({}, root.sendTransfer, {
                    state: "done",
                    pct: 1
                });
                const peerNames = (root.lastSendPeers || []).map(p => p.alias || p.ip).join(", ");
                root.recordHistory({
                    direction: "sent",
                    peer: peerNames || "Unknown",
                    status: "done",
                    files: (root.lastSendPaths || []).map(p => p.split("/").pop()),
                    paths: (root.lastSendPaths || []).slice(),
                    text: root.lastSendText || "",
                    isText: !!(root.lastSendText && root.lastSendText.length)
                });
                sendDoneTimer.restart();
            }
        }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    switch (m.type) {
                        case "sending":
                            root.sendTransfer = {
                                state: "sending",
                                peer: m.peer,
                                files: m.files || [],
                                filesDone: 0,
                                bytesDone: 0,
                                bytesTotal: 0,
                                pct: 0,
                                message: ""
                            };
                            break;
                        case "sendfile":
                            if (root.sendTransfer) {
                                root.sendTransfer = Object.assign({}, root.sendTransfer, {
                                    fileName: m.fileName || "",
                                    bytesTotal: root.sendTransfer.bytesTotal + (m.total || 0)
                                });
                            }
                            break;
                        case "sendprogress":
                            if (root.sendTransfer) {
                                const t = root.sendTransfer;
                                let nextFilesDone = t.filesDone || 0;
                                if (m.ok) nextFilesDone += 1;
                                let nextPct = t.pct || 0;
                                if (m.total > 0 && m.written !== undefined) {
                                    nextPct = Math.max(nextPct, Math.min(1, m.written / m.total));
                                }
                                root.sendTransfer = Object.assign({}, t, {
                                    bytesDone: m.written !== undefined ? m.written : t.bytesDone,
                                    bytesTotal: m.total > 0 ? m.total : t.bytesTotal,
                                    filesDone: nextFilesDone,
                                    pct: nextPct,
                                    fileName: m.fileName || t.fileName
                                });
                            }
                            break;
                        case "senderror":
                            const errMsg = m.error || "";
                            root.sendTransfer = Object.assign({}, root.sendTransfer || {}, {
                                state: "error",
                                message: (m.peer ? (m.peer + ": ") : "") + errMsg,
                                pct: 0
                            });
                            root.recordHistory({
                                direction: "sent",
                                peer: (m.peer || (root.lastSendPeers || []).map(p => p.alias || p.ip).join(", ") || "Unknown"),
                                status: "error",
                                error: errMsg || "Failed",
                                files: (root.lastSendPaths || []).map(p => p.split("/").pop()),
                                text: root.lastSendText || ""
                            });
                            if (errMsg && (errMsg.indexOf("PIN") !== -1 || errMsg.indexOf("401") !== -1)) {
                                let found = null;
                                if (m.ip && root.lastSendPeers) {
                                    found = root.lastSendPeers.find(p => p.ip === m.ip);
                                }
                                root.pinRequiredPeer = found || root.lastSendPeer;
                            }
                            break;
                        case "senddone":
                            if (root.sendTransfer) {
                                root.sendTransfer = Object.assign({}, root.sendTransfer, {
                                    state: "done",
                                    pct: 1
                                });
                                const pNames = (root.lastSendPeers || []).map(p => p.alias || p.ip).join(", ");
                                root.recordHistory({
                                    direction: "sent",
                                    peer: pNames || "Unknown",
                                    status: "done",
                                    files: (root.lastSendPaths || []).map(p => p.split("/").pop()),
                                    paths: (root.lastSendPaths || []).slice(),
                                    text: root.lastSendText || "",
                                    isText: !!(root.lastSendText && root.lastSendText.length)
                                });
                                sendDoneTimer.restart();
                            }
                            break;
                    }
                } catch (e) { }
            }
        }
    }

    Timer {
        id: sendDoneTimer
        interval: 4000
        repeat: false
        onTriggered: {
            if (root.sendTransfer && root.sendTransfer.state === "done") {
                root.sendTransfer = null;
            }
        }
    }

    // Emitted when the portal picker returns paths (selection-first staging).
    signal filesPicked(var paths)

    property var lastSendPeers: []
    property var lastSendPeer: lastSendPeers.length > 0 ? lastSendPeers[0] : null
    property var lastSendPaths: []
    property string lastSendText: ""
    property var pinRequiredPeer: null
    property var devicePins: ({})   // ip -> pin string

    function sendFiles(ip, port, protocol, paths) {
        root.sendSelection([ { ip: ip, port: port, protocol: protocol, alias: ip } ], paths, "");
    }

    function sendText(ip, port, protocol, text) {
        root.sendSelection([ { ip: ip, port: port, protocol: protocol, alias: ip } ], [], text);
    }

    // Send a mixed batch (files/folders + optional text) to one or multiple peers in parallel.
    function sendSelection(targets, paths, text, pin) {
        let peerList = [];
        if (Array.isArray(targets)) {
            peerList = targets;
        } else if (targets && typeof targets === "object") {
            peerList = [targets];
        } else if (typeof targets === "string") {
            peerList = [{ ip: targets, port: 53317, protocol: "https", alias: targets }];
        } else if (root.selectedPeers && root.selectedPeers.length) {
            peerList = root.selectedPeers;
        }

        if (!peerList.length) return;
        root.lastSendPeers = peerList;
        root.lastSendPaths = paths || [];
        root.lastSendText = text || "";
        root.pinRequiredPeer = null;

        let args = [root.script];
        for (let i = 0; i < peerList.length; i++) {
            const p = peerList[i];
            let targetPin = root.devicePins[p.ip] || "";
            if (pin && root.lastSendPeer && root.lastSendPeer.ip === p.ip) targetPin = pin;
            args.push("--target");
            args.push(p.ip + (targetPin ? ":" + targetPin : ""));
        }
        for (let i = 0; i < paths.length; i++) args.push(paths[i]);
        if (text && text.length) { args.push("--text"); args.push(text); }

        sendProc.command = args;
        sendProc.running = true;
    }

    function retryWithPin(pin) {
        const targetPeer = root.pinRequiredPeer || root.lastSendPeer;
        if (!targetPeer) return;
        const ip = targetPeer.ip;
        if (pin && pin.length) {
            const nextPins = Object.assign({}, root.devicePins);
            nextPins[ip] = pin;
            root.devicePins = nextPins;
        }
        const peers = root.lastSendPeers.length ? root.lastSendPeers : [targetPeer];
        const paths = root.lastSendPaths;
        const text = root.lastSendText;
        root.pinRequiredPeer = null;
        if (root.sendTransfer) root.sendTransfer = null;
        root.sendSelection(peers, paths, text);
    }

    function cancelPinPrompt() {
        root.pinRequiredPeer = null;
    }

    // ---- portal file/folder picker -> stage (selection-first) ----
    readonly property string pickerScript: `${CF.FileUtils.trimFileProtocol(Directories.scriptPath)}/localsend/file_picker.py`

    Process {
        id: pickerProc
        running: false
        property var picked: []
        command: []
        stdout: SplitParser {
            onRead: line => { if (line.length) pickerProc.picked.push(line) }
        }
        onExited: (code, status) => {
            const paths = pickerProc.picked;
            pickerProc.picked = [];
            if (paths.length) {
                root.stagePaths(paths, root.lastPickKind);
                root.filesPicked(paths);
                GlobalStates.localsendOpen = true;
            }
        }
    }

    // Open the portal chooser and emit the picked paths for staging (the target
    // device is chosen later). multiple=true → files; false → a folder.
    function pickFiles(multiple) {
        root.lastPickKind = multiple ? "file" : "folder";
        pickerProc.picked = [];
        pickerProc.command = ["python3", root.pickerScript, multiple ? "--multiple" : "--directory"];
        pickerProc.running = true;
    }

    // ---- control-server calls (accept / decline) ----
    Process {
        id: ctlProc
        running: false
        command: []
    }

    function acceptRequest(session) {
        ctlProc.command = ["curl", "-s", "--max-time", "3", `${root.control}/accept?session=${session}`];
        ctlProc.running = true;
    }

    function declineRequest(session) {
        ctlProc.command = ["curl", "-s", "--max-time", "3", `${root.control}/decline?session=${session}`];
        ctlProc.running = true;
    }

    function openItem(item) {
        if (!item) return;
        const paths = (item.savedPaths && item.savedPaths.length) ? item.savedPaths : (item.path ? [item.path] : []);
        for (let i = 0; i < paths.length; i++) {
            Quickshell.execDetached(["xdg-open", paths[i]]);
        }
    }

    function openPath(path) {
        if (!path || !path.length) return;
        Quickshell.execDetached(["xdg-open", path]);
    }

    function openContainingFolder(path) {
        if (!path || !path.length) return;
        const dir = path.substring(0, path.lastIndexOf("/"));
        Quickshell.execDetached(["xdg-open", dir && dir.length ? dir : path]);
    }

    function openSaveDirectory() {
        const dir = (Config.options.localsend && Config.options.localsend.savePath)
            ? Config.options.localsend.savePath
            : Directories.downloads.replace("file://", "");
        Quickshell.execDetached(["xdg-open", dir]);
    }

    function copyReceivedItem(item) {
        if (!item) return false;
        if (item.isText && item.text && item.text.length) {
            Quickshell.clipboardText = item.text;
            return true;
        }
        const paths = (item.savedPaths && item.savedPaths.length) ? item.savedPaths : (item.path ? [item.path] : []);
        if (!paths.length) return false;
        if (paths.length === 1) {
            const p = paths[0];
            const ext = p.split(".").pop().toLowerCase();
            if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
                Quickshell.execDetached(["bash", "-c", `wl-copy -t image/png < "${p}" || wl-copy < "${p}"`]);
            } else {
                Quickshell.clipboardText = p;
            }
        } else {
            Quickshell.clipboardText = paths.join("\n");
        }
        return true;
    }

    // ---- transfer history persistence ----
    property var history: []

    FileView {
        id: historyFileView
        path: Qt.resolvedUrl(Directories.localsendHistoryPath)
        onLoaded: {
            try {
                const text = historyFileView.text();
                root.history = text ? JSON.parse(text) : [];
            } catch (e) {
                root.history = [];
            }
        }
        onLoadFailed: error => {
            root.history = [];
            historyFileView.setText("[]");
        }
    }

    function recordHistory(entry) {
        if (!entry) return;
        const record = Object.assign({
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now()
        }, entry);
        const next = [record].concat((root.history || []).slice(0, 99));
        root.history = next;
        historyFileView.setText(JSON.stringify(next));
    }

    function clearHistory() {
        root.history = [];
        historyFileView.setText("[]");
    }

    function deleteHistoryItem(id) {
        if (!id) return;
        const next = (root.history || []).filter(h => h.id !== id);
        root.history = next;
        historyFileView.setText(JSON.stringify(next));
    }
}
