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

    function _mapInbound(session, fn) {
        root.inbound = root.inbound.map(s => s.session === session ? (fn(s), s) : s);
    }

    // Mark a received-transfer entry done/removed and refresh the pending badge
    function _refreshPending() {
        root.inboundPendingCount = root.inbound.filter(s => s.state === "pending").length;
    }

    // ---- daemon (receive + discovery), runs for the whole session ----
    Process {
        id: daemonProc
        running: true
        command: [root.script]
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
                            });
                            root._refreshPending();
                            break;
                        case "declined":
                            root._mapInbound(m.session, s => s.state = "declined");
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
                root.sendTransfer.state = "done"
                root.sendTransfer.pct = 1
            }
        }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    switch (m.type) {
                        case "sending":
                            root.sendTransfer = { state: "sending", peer: m.peer,
                                files: m.files || [], index: -1, fileName: "",
                                bytesDone: 0, bytesTotal: 0, pct: 0, message: "" };
                            break;
                        case "sendfile":
                            if (root.sendTransfer) {
                                root.sendTransfer.index = m.idx;
                                root.sendTransfer.fileName = m.fileName;
                                root.sendTransfer.bytesTotal += m.total || 0;
                            }
                            break;
                        case "sendprogress":
                            if (root.sendTransfer && m.written !== undefined && m.total > 0) {
                                const t = root.sendTransfer;
                                const denom = t.bytesTotal > 0 ? t.bytesTotal : m.total;
                                t.pct = Math.max(0, Math.min(1, (t.bytesDone + (m.written || 0)) / denom));
                            } else if (root.sendTransfer && m.idx !== undefined) {
                                // per-file completion
                                root.sendTransfer.bytesDone += m.total || 0;
                                root.sendTransfer.index = m.idx;
                                if (m.fileName) root.sendTransfer.fileName = m.fileName;
                                const t = root.sendTransfer;
                                if (t.bytesTotal > 0) t.pct = Math.max(0, Math.min(1, t.bytesDone / t.bytesTotal));
                            }
                            break;
                        case "senderror":
                            if (root.sendTransfer) {
                                root.sendTransfer.state = "error";
                                root.sendTransfer.message = m.error || "";
                            } else {
                                root.sendTransfer = { state: "error", message: m.error || "", pct: 0 };
                            }
                            break;
                        case "senddone":
                            if (root.sendTransfer) {
                                root.sendTransfer.state = "done";
                                root.sendTransfer.pct = 1;
                            }
                            break;
                    }
                } catch (e) { }
            }
        }
    }

    function sendFiles(ip, port, protocol, paths) {
        let args = [root.script, "--send", ip];
        for (let i = 0; i < paths.length; i++) args.push(paths[i]);
        sendProc.command = args;
        sendProc.running = true;
    }

    function sendText(ip, port, protocol, text) {
        sendProc.command = [root.script, "--send", ip, "--text", text];
        sendProc.running = true;
    }

    // ---- portal file/folder picker -> send ----
    readonly property string pickerScript: `${CF.FileUtils.trimFileProtocol(Directories.scriptPath)}/localsend/file_picker.py`

    Process {
        id: pickerProc
        running: false
        property var target: null
        property var picked: []
        command: []
        stdout: SplitParser {
            onRead: line => { if (line.length) pickerProc.picked.push(line) }
        }
        onExited: (code, status) => {
            const paths = pickerProc.picked;
            pickerProc.picked = [];
            const peer = pickerProc.target;
            pickerProc.target = null;
            if (paths.length && peer)
                root.sendFiles(peer.ip, peer.port || 53317, peer.protocol || "https", paths);
        }
    }

    // Open the portal chooser and send the picked paths to `peer`.
    // multiple=true → files (multi-select); multiple=false → a folder.
    function pickAndSend(peer, multiple) {
        pickerProc.picked = [];
        pickerProc.target = peer;
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
}
