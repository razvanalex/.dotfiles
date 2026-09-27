pragma Singleton
pragma ComponentBehavior: Bound

import qs.modules.common
import qs
import QtQuick
import Quickshell
import Quickshell.Io

/**
 * AiUsage service — CLIENT of the aiusage REST endpoint.
 *
 * The poller is a systemd user service (`aiusage.service`): it refreshes the
 * providers on its own interval, writes the snapshot to
 * ~/.local/state/quickshell/user/aiusage/usage.json and serves
 * http://127.0.0.1:8787. This singleton holds one long-lived
 * `curl -sN <baseUrl>/stream` and parses the NDJSON it pushes: the snapshot on
 * connect ({"type":"providers","updated_at":…,"providers":[…]}) plus one line
 * per change and a periodic {"type":"ping"} heartbeat.
 *
 * Reads never trigger a provider run — only requestRefresh() (POST /refresh)
 * asks the service for one extra round, and the service coalesces it.
 *
 * Provider shapes (from providers/<name>/parse.py):
 *   dict form  {id, provider, metrics:[{type,name?,percentage,detail?,reset_in_seconds?,resets_at?,remaining?}]}
 *   list form  {id, list:[{provider, metrics:[...]}]}   (antigravity: two model groups)
 */
Singleton {
    id: root

    readonly property string baseUrl: (Config.options.aiUsage?.baseUrl ?? "http://127.0.0.1:8787")
    readonly property string stateFile: `${Directories.state}/user/aiusage/usage.json`

    // ---- state surfaced to the UI ----
    property var providers: []          // normalized: [{id, name, metrics, groups, error}]
    property real updatedAt: 0          // epoch seconds of the snapshot we hold
    property bool refreshing: false     // a refresh we asked for hasn't landed yet
    property bool connected: streamProc.running
    property string lastError: ""

    // epoch (s) of the round we last asked for; the spinner clears when a
    // snapshot at least that new arrives, or when the watchdog fires
    property real _refreshAskedAt: 0

    // worst-window percentage across all providers — drives the conditional
    // bar indicator (visible only when something is burning)
    readonly property int worstPercent: {
        let worst = 0;
        for (let i = 0; i < providers.length; ++i) {
            const p = providers[i];
            const mets = p.metrics || [];
            for (let j = 0; j < mets.length; ++j)
                if ((mets[j].percentage ?? 0) > worst) worst = mets[j].percentage;
            const groups = p.groups || [];
            for (let g = 0; g < groups.length; ++g)
                for (let j = 0; j < (groups[g].metrics || []).length; ++j)
                    if ((groups[g].metrics[j].percentage ?? 0) > worst) worst = groups[g].metrics[j].percentage;
        }
        return worst;
    }

    readonly property bool alarm: worstPercent >= (Config.options.aiUsage?.alarmPercent ?? 80)

    function requestRefresh() {
        root._refreshAskedAt = Date.now() / 1000;
        root.refreshing = true;
        refreshWatchdog.restart();
        refreshProc.running = false;
        refreshProc.running = true;
    }

    function formatReset(seconds) {
        if (seconds === null || seconds === undefined || seconds <= 0)
            return "";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function _normalizeProvider(raw) {
        // antigravity parse returns a list of model-group providers
        if (raw.list !== undefined) {
            const groups = (raw.list || []).map(g => ({
                name: g.provider ?? "",
                metrics: g.metrics ?? []
            }));
            return { id: raw.id, name: "Antigravity", groups, metrics: [], error: raw.error ?? null };
        }
        return {
            id: raw.id,
            name: raw.provider ?? raw.id,
            metrics: raw.metrics ?? [],
            detail: raw.detail ?? "",
            error: raw.error ?? null
        };
    }

    function _handleLine(data) {
        if (data.length === 0) return;
        let m;
        try {
            m = JSON.parse(data);
        } catch (e) {
            print("[aiusage] bad line:", data.slice(0, 80));
            return;
        }
        if (m.type === "providers") {
            root.providers = (m.providers ?? []).map(p => root._normalizeProvider(p));
            root.updatedAt = m.updated_at ?? 0;
            root.lastError = "";
            if (root._refreshAskedAt > 0 && root.updatedAt >= root._refreshAskedAt) {
                root._refreshAskedAt = 0;
                root.refreshing = false;
                refreshWatchdog.stop();
            }
        } else if (m.type === "status" && m.msg) {
            print("[aiusage]", m.msg);
        }
        // "ping" = heartbeat; nothing to do, it only proves the service is alive
    }

    // ---- endpoint stream (one connection for the whole session) ----
    Process {
        id: streamProc
        running: true
        command: ["curl", "-sN", `${root.baseUrl}/stream`]
        onStarted: root.connected = true
        onExited: (code, status) => {
            root.connected = false;
            restartTimer.restart();
        }

        stderr: SplitParser {
            onRead: line => { if (line.length) print("[aiusage]", line); }
        }

        stdout: SplitParser {
            onRead: data => root._handleLine(data)
        }
    }

    // ---- manual refresh: ask the service, never scrape from here ----
    Process {
        id: refreshProc
        command: ["curl", "-sf", "-X", "POST", `${root.baseUrl}/refresh`]

        stdout: SplitParser {
            onRead: data => {
                if (data.length) print("[aiusage] refresh:", data.replace(/\s+/g, " "));
            }
        }
        stderr: SplitParser {
            onRead: line => { if (line.length) print("[aiusage] refresh failed:", line); }
        }
    }

    // drop the spinner if the service never answers (down, or a round is stuck)
    Timer {
        id: refreshWatchdog
        interval: 75000
        repeat: false
        onTriggered: {
            root._refreshAskedAt = 0;
            root.refreshing = false;
        }
    }

    Timer {
        id: restartTimer
        interval: 2000
        repeat: false
        onTriggered: {
            streamProc.command = streamProc.command;  // re-evaluate config
            streamProc.running = true;
        }
    }

    Timer {
        interval: 5000
        running: !streamProc.running && !restartTimer.running
        repeat: false
        onTriggered: restartTimer.restart()
    }

    Component.onCompleted: {
        void root.worstPercent;   // touch → instantiate eagerly at shell start
        snapshotFile.reload();    // explicit load (path-set alone is unreliable); cold-start
                                  // fallback while the service's first round is in flight
    }

    FileView {
        id: snapshotFile
        // seed UI from the persisted snapshot so the panel opens with data
        // even before the first round completes
        path: root.stateFile
        watchChanges: false
        onLoadedChanged: {
            if (!snapshotFile.loaded) return;
            try {
                const snap = JSON.parse(snapshotFile.text());
                if ((snap.updated_at ?? 0) > root.updatedAt) {
                    root.updatedAt = snap.updated_at;
                    root.providers = (snap.providers ?? []).map(p => root._normalizeProvider(p));
                }
            } catch (e) {
                print("[aiusage] snapshot parse failed:", e);
            }
        }
    }
}
