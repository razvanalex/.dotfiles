import type { Accessor } from "ags";
import { createState } from "ags";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import wallpaperService from "services/wallpaper/Wallpaper";
import type {
    EngineMode,
    EngineState,
    WallpaperSourceType,
    WallpaperStrategy,
} from "../../types";

interface CreateSettingsControllerProps {
    onDiscoveryChanged?: () => void;
}

export interface SettingsController {
    engineMode: Accessor<EngineMode>;
    engineIntervalSeconds: Accessor<string>;
    engineIsRunning: Accessor<boolean>;
    engineStatusText: Accessor<string>;
    sourceType: Accessor<WallpaperSourceType>;
    sourceValue: Accessor<string>;
    strategy: Accessor<WallpaperStrategy>;
    favoritesCount: Accessor<number>;
    recentCount: Accessor<number>;
    recursiveSearch: Accessor<boolean>;
    includeHidden: Accessor<boolean>;
    refreshEngineState: () => Promise<void>;
    toggleRecursiveSearch: () => void;
    toggleIncludeHidden: () => void;
    toggleEngineMode: () => void;
    setEngineIntervalText: (value: string) => void;
    applyInterval: () => void;
    setIntervalPreset: (seconds: number) => void;
    cycleSourceType: () => void;
    setSourceValueText: (value: string) => void;
    applySource: () => void;
    cycleStrategy: () => void;
    goNext: () => void;
    goPrev: () => void;
    togglePlayPause: () => void;
    startAutomatic: () => void;
    stopAutomatic: () => void;
}

export function createSettingsController({
    onDiscoveryChanged,
}: CreateSettingsControllerProps): SettingsController {
    const configPath = PATHS.wallpaperConfig;
    const config = loadConfig(configPath);

    const [engineMode, setEngineMode] = createState<EngineMode>("manual");
    const [engineIntervalSeconds, setEngineIntervalSeconds] =
        createState("1800");
    const [engineIsRunning, setEngineIsRunning] = createState(false);
    const [engineStatusText, setEngineStatusText] = createState("Engine idle");
    const [sourceType, setSourceType] =
        createState<WallpaperSourceType>("current-theme");
    const [sourceValue, setSourceValue] = createState("");
    const [strategy, setStrategy] = createState<WallpaperStrategy>("shuffle");
    const [favoritesCount, setFavoritesCount] = createState(0);
    const [recentCount, setRecentCount] = createState(0);
    const [recursiveSearch, setRecursiveSearch] = createState(
        config.recursiveSearch ?? true,
    );
    const [includeHidden, setIncludeHidden] = createState(
        config.includeHidden ?? false,
    );

    const parseEngineState = (raw: string): EngineState => {
        const parsed = JSON.parse(raw) as Partial<EngineState>;
        return {
            mode: parsed.mode === "automatic" ? "automatic" : "manual",
            intervalSeconds: Number.isFinite(parsed.intervalSeconds)
                ? Math.max(30, Math.floor(parsed.intervalSeconds as number))
                : 1800,
            activeThemeOnly: Boolean(parsed.activeThemeOnly),
            isRunning: Boolean(parsed.isRunning),
            sourceType:
                parsed.sourceType === "specific-theme"
                    ? "specific-theme"
                    : parsed.sourceType === "favorites"
                      ? "favorites"
                      : parsed.sourceType === "filtered-library"
                        ? "filtered-library"
                        : "current-theme",
            sourceValue:
                typeof parsed.sourceValue === "string"
                    ? parsed.sourceValue
                    : "",
            strategy:
                parsed.strategy === "random"
                    ? "random"
                    : parsed.strategy === "sequential"
                      ? "sequential"
                      : "shuffle",
            queue: Array.isArray(parsed.queue)
                ? parsed.queue.filter(
                      (item): item is string => typeof item === "string",
                  )
                : [],
            currentIndex: Number.isFinite(parsed.currentIndex)
                ? Math.floor(parsed.currentIndex as number)
                : -1,
            history: Array.isArray(parsed.history)
                ? parsed.history.filter(
                      (item): item is string => typeof item === "string",
                  )
                : [],
            historyCursor: Number.isFinite(parsed.historyCursor)
                ? Math.floor(parsed.historyCursor as number)
                : -1,
            favorites: Array.isArray(parsed.favorites)
                ? parsed.favorites.filter(
                      (item): item is string => typeof item === "string",
                  )
                : [],
            maxHistory: Number.isFinite(parsed.maxHistory)
                ? Math.max(50, Math.floor(parsed.maxHistory as number))
                : 200,
        };
    };

    const engineRequest = async (args: string[]): Promise<string> => {
        const output = await execAsync([
            "ags",
            "request",
            "wallpaper",
            "engine",
            ...args,
        ]);
        const result = output.trim();
        if (result.startsWith("error:")) {
            throw new Error(result);
        }
        return result;
    };

    const syncEngineUiState = (engine: EngineState) => {
        setEngineMode(engine.mode);
        setEngineIntervalSeconds(String(engine.intervalSeconds));
        setEngineIsRunning(engine.isRunning);
        setSourceType(engine.sourceType);
        setSourceValue(engine.sourceValue);
        setStrategy(engine.strategy);
        setFavoritesCount(engine.favorites.length);
        setRecentCount(engine.history.length);
        if (engine.isRunning) {
            setEngineStatusText(
                `Auto ${engine.intervalSeconds}s • ${engine.strategy} • ${engine.sourceType}`,
            );
        } else {
            setEngineStatusText("Manual mode");
        }
    };

    const refreshEngineState = async () => {
        try {
            const result = await engineRequest(["get"]);
            const engine = parseEngineState(result);
            syncEngineUiState(engine);
        } catch (error) {
            setEngineStatusText(`Engine error: ${error}`);
        }
    };

    const toggleRecursiveSearch = () => {
        const next = !recursiveSearch.get();
        setRecursiveSearch(next);
        wallpaperService.setConfig({ recursiveSearch: next });
        onDiscoveryChanged?.();
    };

    const toggleIncludeHidden = () => {
        const next = !includeHidden.get();
        setIncludeHidden(next);
        wallpaperService.setConfig({ includeHidden: next });
        onDiscoveryChanged?.();
    };

    const toggleEngineMode = () => {
        const nextMode: EngineMode =
            engineMode.get() === "automatic" ? "manual" : "automatic";
        if (nextMode === engineMode.get()) return;

        setEngineMode(nextMode);
        void engineRequest(["set", "mode", nextMode])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const setEngineIntervalText = (value: string) => {
        if (value === engineIntervalSeconds.get()) return;
        setEngineIntervalSeconds(value);
    };

    const applyInterval = () => {
        const parsed = parseInt(engineIntervalSeconds.get(), 10);
        if (Number.isNaN(parsed) || parsed < 30) {
            setEngineStatusText("Engine error: interval must be >= 30 seconds");
            return;
        }
        void engineRequest(["set", "interval", String(parsed)])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const setIntervalPreset = (seconds: number) => {
        setEngineIntervalSeconds(String(seconds));
        void engineRequest(["set", "interval", String(seconds)])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const cycleSourceType = () => {
        const order: WallpaperSourceType[] = [
            "current-theme",
            "specific-theme",
            "favorites",
            "filtered-library",
        ];
        const current = sourceType.get();
        const index = order.indexOf(current);
        const next = order[(index + 1) % order.length];
        setSourceType(next);
    };

    const setSourceValueText = (value: string) => {
        if (value === sourceValue.get()) return;
        setSourceValue(value);
    };

    const applySource = () => {
        void engineRequest([
            "set",
            "source",
            sourceType.get(),
            sourceValue.get(),
        ])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const cycleStrategy = () => {
        const order: WallpaperStrategy[] = ["shuffle", "sequential", "random"];
        const current = strategy.get();
        const index = order.indexOf(current);
        const next = order[(index + 1) % order.length];
        void engineRequest(["set", "strategy", next])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const goNext = () => {
        void execAsync(["ags", "request", "wallpaper", "next"])
            .then((result) => {
                if (result.trim().startsWith("error:")) {
                    throw new Error(result.trim());
                }
                return refreshEngineState();
            })
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const goPrev = () => {
        void execAsync(["ags", "request", "wallpaper", "prev"])
            .then((result) => {
                if (result.trim().startsWith("error:")) {
                    throw new Error(result.trim());
                }
                return refreshEngineState();
            })
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const togglePlayPause = () => {
        const cmd = engineIsRunning.get() ? "pause" : "play";
        void execAsync(["ags", "request", "wallpaper", cmd])
            .then((result) => {
                const trimmed = result.trim();
                if (trimmed.startsWith("error:")) {
                    throw new Error(trimmed);
                }
                syncEngineUiState(parseEngineState(trimmed));
            })
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const startAutomatic = () => {
        const parsed = parseInt(engineIntervalSeconds.get(), 10);
        const interval = Number.isNaN(parsed) || parsed < 30 ? 1800 : parsed;
        void engineRequest(["auto", "start", String(interval)])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    const stopAutomatic = () => {
        void engineRequest(["auto", "stop"])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`));
    };

    return {
        engineMode,
        engineIntervalSeconds,
        engineIsRunning,
        engineStatusText,
        sourceType,
        sourceValue,
        strategy,
        favoritesCount,
        recentCount,
        recursiveSearch,
        includeHidden,
        refreshEngineState,
        toggleRecursiveSearch,
        toggleIncludeHidden,
        toggleEngineMode,
        setEngineIntervalText,
        applyInterval,
        setIntervalPreset,
        cycleSourceType,
        setSourceValueText,
        applySource,
        cycleStrategy,
        goNext,
        goPrev,
        togglePlayPause,
        startAutomatic,
        stopAutomatic,
    };
}
