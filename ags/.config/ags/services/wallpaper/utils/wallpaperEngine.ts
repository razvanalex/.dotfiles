import GLib from "gi://GLib";
import { ensureDirectory, PATHS } from "lib/constants";
import Logger from "lib/logger";

export type WallpaperMode = "manual" | "automatic";
export type WallpaperSourceType =
    | "current-theme"
    | "specific-theme"
    | "favorites"
    | "filtered-library";
export type WallpaperStrategy = "random" | "shuffle" | "sequential";

export interface WallpaperEngineState {
    mode: WallpaperMode;
    intervalSeconds: number;
    activeThemeOnly: boolean;
    isRunning: boolean;
    sourceType: WallpaperSourceType;
    sourceValue: string;
    strategy: WallpaperStrategy;
    queue: string[];
    currentIndex: number;
    history: string[];
    historyCursor: number;
    favorites: string[];
    maxHistory: number;
}

export const DEFAULT_ENGINE_STATE: WallpaperEngineState = {
    mode: "manual",
    intervalSeconds: 1800,
    activeThemeOnly: true,
    isRunning: false,
    sourceType: "current-theme",
    sourceValue: "",
    strategy: "shuffle",
    queue: [],
    currentIndex: -1,
    history: [],
    historyCursor: -1,
    favorites: [],
    maxHistory: 200,
};

const MIN_INTERVAL_SECONDS = 30;
const MAX_HISTORY_DEFAULT = 200;

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === "string")
        .filter((entry) => entry.length > 0);
}

function normalizeSourceType(value: unknown): WallpaperSourceType {
    if (value === "specific-theme") return "specific-theme";
    if (value === "favorites") return "favorites";
    if (value === "filtered-library") return "filtered-library";
    return "current-theme";
}

function normalizeStrategy(value: unknown): WallpaperStrategy {
    if (value === "random") return "random";
    if (value === "sequential") return "sequential";
    return "shuffle";
}

function normalizeMode(value: unknown): WallpaperMode {
    return value === "automatic" ? "automatic" : "manual";
}

export function normalizeEngineState(
    raw: Partial<WallpaperEngineState>,
): WallpaperEngineState {
    const maxHistory = Number.isFinite(raw.maxHistory)
        ? Math.max(50, Math.floor(raw.maxHistory as number))
        : MAX_HISTORY_DEFAULT;

    const history = asStringArray(raw.history).slice(-maxHistory);
    const historyCursorRaw = Number.isFinite(raw.historyCursor)
        ? Math.floor(raw.historyCursor as number)
        : history.length - 1;
    const historyCursor =
        history.length === 0
            ? -1
            : Math.max(0, Math.min(historyCursorRaw, history.length - 1));

    const queue = asStringArray(raw.queue);
    const currentIndexRaw = Number.isFinite(raw.currentIndex)
        ? Math.floor(raw.currentIndex as number)
        : -1;
    const currentIndex =
        queue.length === 0
            ? -1
            : Math.max(0, Math.min(currentIndexRaw, queue.length - 1));

    return {
        ...DEFAULT_ENGINE_STATE,
        ...raw,
        mode: normalizeMode(raw.mode),
        intervalSeconds: Number.isFinite(raw.intervalSeconds)
            ? Math.max(
                  MIN_INTERVAL_SECONDS,
                  Math.floor(raw.intervalSeconds as number),
              )
            : DEFAULT_ENGINE_STATE.intervalSeconds,
        activeThemeOnly: Boolean(raw.activeThemeOnly),
        isRunning: Boolean(raw.isRunning),
        sourceType: normalizeSourceType(raw.sourceType),
        sourceValue: typeof raw.sourceValue === "string" ? raw.sourceValue : "",
        strategy: normalizeStrategy(raw.strategy),
        queue,
        currentIndex,
        history,
        historyCursor,
        favorites: asStringArray(raw.favorites),
        maxHistory,
    };
}

export function getEngineStatePath(): string {
    return PATHS.wallpaperEngineState;
}

let cachedState: WallpaperEngineState | null = null;

export function loadEngineState(path?: string): WallpaperEngineState {
    if (cachedState) return cachedState;
    const statePath = path || getEngineStatePath();

    if (!GLib.file_test(statePath, GLib.FileTest.EXISTS)) {
        saveEngineState(DEFAULT_ENGINE_STATE, statePath);
        return { ...DEFAULT_ENGINE_STATE };
    }

    try {
        const contents = GLib.file_get_contents(statePath);
        const text = new TextDecoder().decode(contents[1]);
        const parsed = JSON.parse(text) as Partial<WallpaperEngineState>;

        cachedState = normalizeEngineState(parsed);
        return cachedState!;
    } catch (error) {
        Logger.error(
            "WallpaperEngine: Failed to load state, using defaults:",
            error,
        );
        return { ...DEFAULT_ENGINE_STATE };
    }
}

export function saveEngineState(
    state: WallpaperEngineState,
    path?: string,
): void {
    const statePath = path || getEngineStatePath();

    const normalized = normalizeEngineState(state);

    try {
        ensureDirectory(statePath);
        GLib.file_set_contents(statePath, JSON.stringify(normalized, null, 2));
        cachedState = normalized;
    } catch (error) {
        Logger.error("WallpaperEngine: Failed to save state:", error);
    }
}
