pragma Singleton
pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Bluetooth
import Quickshell.Io
import QtQuick

/**
 * AirPods service — client for the airpods-tui headless daemon.
 *
 * Speaks the daemon's Unix-socket IPC ($XDG_RUNTIME_DIR/airpods-tui.sock):
 * length-prefixed (u32 big-endian) JSON frames. On connect the daemon
 * replays a state snapshot, then streams live events. Commands are sent
 * as ["<mac>", {"ControlCommand": [<identifier>, [<bytes>]]}].
 *
 * Requires: systemctl --user enable --now airpods-tui
 */
Singleton {
    id: root

    // ---- public state -------------------------------------------------
    readonly property bool connected: mac !== ""
    property string mac: ""
    property string deviceName: ""
    property int product_id: 0

    // Battery: -1 = unknown
    property int batteryLeft: -1
    property int batteryRight: -1
    property int batteryCase: -1
    readonly property int batteryMin: {
        const vals = [batteryLeft, batteryRight].filter(v => v >= 0);
        return vals.length ? Math.min(...vals) : -1;
    }
    // Ear detection: "in" | "out" | "case" | "" (unknown)
    property string earLeft: ""
    property string earRight: ""

    // "" = unknown yet
    property string noiseMode: "" // off | anc | transparency | adaptive
    property bool caKnown: false
    property bool conversationAwareness: false
    property bool oneBudAncKnown: false
    property bool oneBudAnc: false
    property bool volumeSwipeKnown: false
    property bool volumeSwipe: false
    property bool adaptiveLevelKnown: false
    property int adaptiveLevel: 50 // 0-100, only meaningful in Adaptive mode
    property bool earDetectionKnown: false
    property bool earDetection: true
    property bool sleepDetectionKnown: false
    property bool sleepDetection: true
    property bool personalisedVolumeKnown: false
    property bool personalisedVolume: false
    // Case-battery retention (iOS/macOS behavior): case reads 0 while both
    // pods are worn; keep showing the last real value until a dock event.
    property bool caseReportStale: false
    property bool lastCaseReadValid: true

    // ---- AACP constants (from airpods-tui src/bluetooth/aacp.rs) -------
    readonly property int idListeningMode: 0x0D
    readonly property int idEarDetectionConfig: 0x0A
    readonly property int idOneBudAncMode: 0x1B
    readonly property int idVolumeSwipeMode: 0x25
    readonly property int idConversationDetect: 0x28
    readonly property int idAutoAncStrength: 0x2E
    readonly property int idSleepDetectionConfig: 0x35
    readonly property int idAdaptiveVolumeConfig: 0x26
    readonly property var modeBytes: ({ "off": 0x01, "anc": 0x02, "transparency": 0x03, "adaptive": 0x04 })

    function setNoiseMode(mode) {
        if (!(mode in modeBytes))
            return;
        sendCommand(idListeningMode, [modeBytes[mode]]);
    }
    function setConversationAwareness(on) {
        sendCommand(idConversationDetect, [on ? 0x01 : 0x02]);
    }
    function setOneBudAnc(on) {
        sendCommand(idOneBudAncMode, [on ? 0x01 : 0x02]);
    }
    function setVolumeSwipe(on) {
        sendCommand(idVolumeSwipeMode, [on ? 0x01 : 0x02]);
    }
    function setAdaptiveLevel(level) {
        sendCommand(idAutoAncStrength, [Math.max(0, Math.min(100, Math.round(level)))]);
    }
    function setEarDetection(on) {
        sendCommand(idEarDetectionConfig, [on ? 0x01 : 0x02]);
    }
    function setSleepDetection(on) {
        sendCommand(idSleepDetectionConfig, [on ? 0x01 : 0x02]);
    }
    function setPersonalisedVolume(on) {
        sendCommand(idAdaptiveVolumeConfig, [on ? 0x01 : 0x02]);
    }

    // ---- framing --------------------------------------------------------
    // Frames are u32-BE-length-prefixed JSON. Quickshell.Io has no length
    // parser, so StdioCollector accumulates the raw stream and we extract
    // frames from the latin1-decoded buffer (re-parse is idempotent).
    property int consumed: 0 // bytes already processed in collector text
    property string rxBuffer: "" // latin1-encoded tail of the stream, from byte `consumed` on

    function sendCommand(identifier, valueBytes) {
        if (!connected || !sock.connected) {
            console.warn("[AirPods] cannot send command: not connected");
            return;
        }
        const payload = JSON.stringify([root.mac, {
                ControlCommand: [identifier, valueBytes]
            }]);
        const len = payload.length;
        const header = String.fromCharCode((len >>> 24) & 0xFF, (len >>> 16) & 0xFF, (len >>> 8) & 0xFF, len & 0xFF);
        sock.write(header + payload);
        sock.flush();
    }

    function consume(buffer) {
        if (!buffer)
            return;
        let bytes;
        try {
            bytes = new Uint8Array(buffer);
        } catch (e) {
            // detached/empty buffer during early startup — nothing to read
            return;
        }
        let chunk = "";
        for (let i = consumed; i < bytes.length; i++)
            chunk += String.fromCharCode(bytes[i]);
        if (chunk !== "") {
            rxBuffer += chunk;
            consumed = bytes.length;
        }
        drain();
    }

    function drain() {
        // extract all complete frames from rxBuffer
        for (;;) {
            if (rxBuffer.length < 4)
                break;
            const n = (rxBuffer.charCodeAt(0) << 24) | (rxBuffer.charCodeAt(1) << 16) | (rxBuffer.charCodeAt(2) << 8) | rxBuffer.charCodeAt(3);
            if (rxBuffer.length < 4 + n)
                break;
            handlePayload(rxBuffer.slice(4, 4 + n));
            rxBuffer = rxBuffer.slice(4 + n);
        }
    }

    function handlePayload(json) {
        let msg;
        try {
            msg = JSON.parse(json);
        } catch (e) {
            console.warn("[AirPods] bad JSON from daemon:", e);
            return;
        }

        if (msg.DeviceConnected !== undefined) {
            root.mac = msg.DeviceConnected.mac ?? "";
            root.product_id = msg.DeviceConnected.product_id ?? 0;
            root.deviceName = friendlyName(root.mac);
            resetTransient();
        } else if (msg.DeviceDisconnected !== undefined) {
            resetAll();
        } else if (msg.AACPEvent !== undefined && msg.AACPEvent.length === 2) {
            handleAacp(msg.AACPEvent[0], msg.AACPEvent[1]);
        }
    }

    function handleAacp(mac, ev) {
        if (ev.BatteryInfo !== undefined) {
            for (const b of ev.BatteryInfo) {
                // component: Left=4 Right=2 Case=8 Headphone=1; status Charging=1 NotCharging=2 Disconnected=4 InUse=5
                switch (b.component) {
                case 4:
                    batteryLeft = b.level;
                    break;
                case 2:
                    batteryRight = b.level;
                    break;
                case 8:
                    // 0 while both pods are worn is "unknown", not empty
                    if (b.level > 0) {
                        batteryCase = b.level;
                        caseReportStale = false;
                        lastCaseReadValid = true;
                    } else if (!lastCaseReadValid) {
                        batteryCase = -1; // genuinely unknown (no prior read)
                    } else if (!caseReportStale) {
                        batteryCase = b.level; // real 0 (rare, but possible)
                    }
                    // else: retain previous value
                    break;
                }
            }
        } else if (ev.ControlCommand !== undefined) {
            const id = ev.ControlCommand.identifier;
            const v = (ev.ControlCommand.value ?? [])[0];
            if (v === undefined)
                return;
            if (id === idListeningMode) {
                noiseMode = ({ 1: "off", 2: "anc", 3: "transparency", 4: "adaptive" })[v] ?? "";
            } else if (id === idConversationDetect) {
                conversationAwareness = (v === 0x01);
                caKnown = true;
            } else if (id === idOneBudAncMode) {
                oneBudAnc = (v === 0x01);
                oneBudAncKnown = true;
            } else if (id === idVolumeSwipeMode) {
                volumeSwipe = (v === 0x01);
                volumeSwipeKnown = true;
            } else if (id === idAutoAncStrength) {
                adaptiveLevel = v;
                adaptiveLevelKnown = true;
            } else if (id === idEarDetectionConfig) {
                earDetection = (v === 0x01);
                earDetectionKnown = true;
            } else if (id === idSleepDetectionConfig) {
                sleepDetection = (v === 0x01);
                sleepDetectionKnown = true;
            } else if (id === idAdaptiveVolumeConfig) {
                personalisedVolume = (v === 0x01);
                personalisedVolumeKnown = true;
            }
        } else if (ev.EarDetection !== undefined) {
            const map = { 0: "in", 1: "out", 2: "case", 3: "" };
            earLeft = map[ev.EarDetection.new_left] ?? "";
            earRight = map[ev.EarDetection.new_right] ?? "";
            // Like iOS/macOS: with both pods worn the case can't be read
            // and reports 0 — retain the last real value until a pod is
            // docked (ear state "case") re-opens the measurement window.
            if (earLeft === "case" || earRight === "case") {
                lastCaseReadValid = false; // next Case battery report is fresh
            } else if (earLeft === "in" && earRight === "in") {
                caseReportStale = true;
            }
        }
    }

    function friendlyName(mac) {
        const dev = Bluetooth.devices.values.find(d => d.address === mac);
        return dev?.deviceName ?? dev?.name ?? "AirPods";
    }

    function resetTransient() {
        batteryLeft = -1;
        batteryRight = -1;
        batteryCase = -1;
        caseReportStale = false;
        lastCaseReadValid = true;
        earLeft = "";
        earRight = "";
        noiseMode = "";
        caKnown = false;
        oneBudAncKnown = false;
        volumeSwipeKnown = false;
        adaptiveLevelKnown = false;
        earDetectionKnown = false;
        sleepDetectionKnown = false;
        personalisedVolumeKnown = false;
    }
    function resetAll() {
        resetTransient();
        mac = "";
        deviceName = "";
        product_id = 0;
    }

    // ---- socket lifecycle -----------------------------------------------
    Socket {
        id: sock
        path: Quickshell.env("XDG_RUNTIME_DIR") + "/airpods-tui.sock"
        connected: true

        onConnectedChanged: {
            if (sock.connected) {
                root.rxBuffer = "";
                root.consumed = 0;
                // The snapshot may already be buffered before this handler
                // runs; drain immediately instead of waiting for new bytes.
                root.consume(sock.parser.data);
                console.log("[AirPods] connected to daemon");
            }
        }
        onError: error => console.warn("[AirPods] socket error:", error)

        parser: StdioCollector {
            waitForEnd: false
            onDataChanged: {
                root.consume(data);
                // Drain any frame completed by this chunk but left in the
                // buffer because its length prefix arrived split across
                // chunks — no further traffic may come for a while.
                root.drain();
            }
        }
    }

    Timer {
        // reconnect loop while the daemon is down/restarting
        running: !sock.connected
        interval: 3000
        repeat: true
        onTriggered: {
            sock.connected = false;
            sock.connected = true;
        }
    }

    // keep friendly name fresh (BlueZ may learn it after connect)
    Timer {
        interval: 10000
        repeat: true
        running: root.connected
        onTriggered: root.deviceName = Qt.binding(() => root.friendlyName(root.mac))
    }
}
