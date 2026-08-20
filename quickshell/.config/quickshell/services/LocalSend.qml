pragma Singleton
pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.functions as CF
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
        onExited: (code, status) => { root.sending = false }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    // send events (sending / sendprogress / senddone / senderror)
                    // surface a lightweight transfer entry for progress/badge
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
