pragma Singleton
pragma ComponentBehavior: Bound

import qs.modules.common
import qs.modules.common.functions as CF
import qs
import QtQuick
import Quickshell
import Quickshell.Io

/**
 * AiUsage service: hosts the aiusage daemon (polls AI subscription usage:
 * opencode-go, agy/Antigravity, GitHub Copilot, OpenRouter) and exposes its
 * state to the panel/bar.
 *
 * Daemon contract: one JSON object per stdout line —
 *   {"type":"status","msg":...}                lifecycle
 *   {"type":"providers","updated_at":...,"providers":[...]}
 * Provider shapes (from providers/<name>/parse.py):
 *   dict form  {id, provider, metrics:[{type,name?,percentage,detail?,reset_in_seconds?,resets_at?,remaining?}]}
 *   list form  {id, list:[{provider, metrics:[...]}]}   (antigravity: two model groups)
 */
Singleton {
    id: root

    readonly property string script: `${CF.FileUtils.trimFileProtocol(Directories.scriptPath)}/aiusage/daemon.py`
    readonly property string stateFile: `${Directories.state}/user/aiusage/usage.json`

    // ---- state surfaced to the UI ----
    property var providers: []          // normalized: [{id, name, metrics, error, isList, groups}]
    property real updatedAt: 0          // epoch seconds of last full snapshot
    property bool refreshing: false
    property bool daemonRunning: false
    property string lastError: ""

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
        // one-shot run in parallel with the daemon's own cycle
        onceProc.command = ["python3", root.script, "--once"];
        onceProc.running = true;
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

    // ---- daemon process (runs for the whole session) ----
    Process {
        id: daemonProc
        running: true
        command: {
            const argv = ["python3", root.script];
            const c = Config.options.aiUsage ?? {};
            if (c.interval) argv.push("--interval", c.interval.toString());
            if (c.providers?.length) argv.push("--providers", c.providers.join(","));
            return argv;
        }
        onStarted: root.daemonRunning = true
        onExited: (code, status) => {
            root.daemonRunning = false;
            restartTimer.restart();
        }

        stderr: SplitParser {
            onRead: line => { if (line.length) print("[aiusage]", line); }
        }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    if (m.type === "providers") {
                        root.providers = (m.providers ?? []).map(p => root._normalizeProvider(p));
                        root.updatedAt = m.updated_at ?? 0;
                        root.refreshing = false;
                        root.lastError = "";
                    } else if (m.type === "status" && m.msg) {
                        print("[aiusage]", m.msg);
                    }
                } catch (e) {
                    print("[aiusage] bad line:", data.slice(0, 80));
                }
            }
        }
    }

    // manual refresh round (--once); result also arrives via daemonProc? no —
    // the daemon owns stdout, so --once output lands here and updates state.
    Process {
        id: onceProc
        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                try {
                    const m = JSON.parse(data);
                    if (m.type === "providers") {
                        root.providers = (m.providers ?? []).map(p => root._normalizeProvider(p));
                        root.updatedAt = m.updated_at ?? 0;
                        root.refreshing = false;
                    }
                } catch (e) {}
            }
        }
    }

    Timer {
        id: restartTimer
        interval: 1000
        repeat: false
        onTriggered: {
            daemonProc.command = daemonProc.command;  // re-evaluate config
            daemonProc.running = true;
        }
    }

    Timer {
        interval: 3000
        running: !root.daemonRunning && !restartTimer.running
        repeat: false
        onTriggered: restartTimer.restart()
    }

    onRefreshingChanged: print("[aiusage] refreshing:", refreshing)

    Component.onCompleted: {
        void root.worstPercent;   // touch → instantiate eagerly at shell start
        snapshotFile.reload();    // explicit load (path-set alone is unreliable)
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
