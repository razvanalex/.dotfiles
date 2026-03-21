import GLib from "gi://GLib"

export type WallpaperMode = "manual" | "automatic"

export interface WallpaperEngineState {
    mode: WallpaperMode
    intervalSeconds: number
    activeThemeOnly: boolean
    isRunning: boolean
}

export const DEFAULT_ENGINE_STATE: WallpaperEngineState = {
    mode: "manual",
    intervalSeconds: 1800,
    activeThemeOnly: true,
    isRunning: false,
}

export function getEngineStatePath(): string {
    return `${GLib.get_home_dir()}/.config/ags/wallpaper_engine_state.json`
}

export function loadEngineState(path?: string): WallpaperEngineState {
    const statePath = path || getEngineStatePath()

    if (!GLib.file_test(statePath, GLib.FileTest.EXISTS)) {
        saveEngineState(DEFAULT_ENGINE_STATE, statePath)
        return { ...DEFAULT_ENGINE_STATE }
    }

    try {
        const contents = GLib.file_get_contents(statePath)
        const text = new TextDecoder().decode(contents[1])
        const parsed = JSON.parse(text)

        return {
            ...DEFAULT_ENGINE_STATE,
            ...parsed,
            mode: parsed?.mode === "automatic" ? "automatic" : "manual",
            intervalSeconds: Number.isFinite(parsed?.intervalSeconds)
                ? Math.max(30, Math.floor(parsed.intervalSeconds))
                : DEFAULT_ENGINE_STATE.intervalSeconds,
            activeThemeOnly: Boolean(parsed?.activeThemeOnly),
            isRunning: Boolean(parsed?.isRunning),
        }
    } catch (error) {
        console.error("WallpaperEngine: Failed to load state, using defaults:", error)
        return { ...DEFAULT_ENGINE_STATE }
    }
}

export function saveEngineState(state: WallpaperEngineState, path?: string): void {
    const statePath = path || getEngineStatePath()

    const normalized: WallpaperEngineState = {
        ...DEFAULT_ENGINE_STATE,
        ...state,
        mode: state.mode === "automatic" ? "automatic" : "manual",
        intervalSeconds: Math.max(30, Math.floor(state.intervalSeconds || DEFAULT_ENGINE_STATE.intervalSeconds)),
        activeThemeOnly: Boolean(state.activeThemeOnly),
        isRunning: Boolean(state.isRunning),
    }

    try {
        GLib.file_set_contents(statePath, JSON.stringify(normalized, null, 2))
    } catch (error) {
        console.error("WallpaperEngine: Failed to save state:", error)
    }
}
