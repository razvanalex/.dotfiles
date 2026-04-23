import GLib from "gi://GLib";
import GObject from "gi://GObject";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";
import {
    findImages,
    loadConfig,
    fuzzyFilter,
    getCurrentTheme,
    updateCurrentTheme,
    type WallpaperConfig,
} from "./utils/wallpaper";
import {
    loadEngineState,
    normalizeEngineState,
    saveEngineState,
    type WallpaperEngineState,
    type WallpaperMode,
    type WallpaperSourceType,
    type WallpaperStrategy,
} from "./utils/wallpaperEngine";
import wallpaper from "./Wallpaper";

const log = Logger.withScope("WallpaperEngine");
const SOURCE_POOL_CACHE_TTL_MS = 60000; // Increased to 60s

class WallpaperEngine extends GObject.Object {
    static {
        GObject.registerClass(
            {
                Properties: {
                    "engine-state": GObject.ParamSpec.jsobject(
                        "engine-state",
                        "Engine State",
                        "Current state of the wallpaper engine",
                        GObject.ParamFlags.READABLE,
                    ),
                },
                Signals: {
                    changed: {},
                },
            },
            WallpaperEngine,
        );
    }

    #state: WallpaperEngineState;
    #sourcePoolCache: Map<string, { data: string[]; timestamp: number }> = new Map();

    constructor() {
        super();
        this.#state = normalizeEngineState(loadEngineState());
        this.#init();
    }

    #init() {
        // Persistent singleton listener
        wallpaper.connect("wallpaper-changed", (_, path) => {
            if (!path) return;
            this.#updateHistory(String(path));
            
            // Only update currentIndex if path is in queue
            const qIdx = this.#state.queue.indexOf(String(path));
            if (qIdx >= 0) this.#state.currentIndex = qIdx;

            const config = loadConfig(PATHS.wallpaperConfig);
            const inferredTheme = this.inferThemeFromWallpaperPath(config.wallpaperDir, String(path));
            if (inferredTheme) {
                // Await theme update to prevent race conditions during theme selection
                void updateCurrentTheme(config.wallpaperDir, inferredTheme).catch((err) => {
                    log.error(`Failed to update .crt_theme: ${err}`);
                });
            }

            this.#syncState();
        });

        if (this.#state.mode === "automatic" && this.#state.isRunning) {
            void this.startAuto(undefined, true);
        }
    }

    get state() {
        return this.#state;
    }

    get engine_state() {
        return JSON.stringify(this.#state);
    }

    #syncState() {
        this.#state = normalizeEngineState(this.#state);
        saveEngineState(this.#state);
        this.notify("engine-state");
        this.emit("changed");
    }

    #updateHistory(wallpaperPath: string) {
        const last = this.#state.history[this.#state.history.length - 1];
        if (last !== wallpaperPath) {
            this.#state.history.push(wallpaperPath);
            if (this.#state.history.length > this.#state.maxHistory) {
                this.#state.history = this.#state.history.slice(-this.#state.maxHistory);
            }
        }
        this.#state.historyCursor = this.#state.history.length - 1;
    }

    inferThemeFromWallpaperPath(wallpaperDir: string, wallpaperPath: string): string {
        if (!wallpaperPath) return "";
        const prefix = `${wallpaperDir}/`;
        if (!wallpaperPath.startsWith(prefix)) return "";

        const relativePath = wallpaperPath.slice(prefix.length);
        const parts = relativePath.split("/");
        if (parts.length <= 1) return "";

        // Return the full directory path relative to wallpaperDir
        parts.pop(); // remove filename
        return parts.join("/");
    }

    #shufflePaths(paths: string[]) {
        const copy = [...paths];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    #normalizePoolForState(pool: string[]) {
        const start = Date.now();
        const seen = new Set<string>();
        const uniquePool: string[] = [];
        for (const p of pool) {
            if (p && !seen.has(p)) {
                seen.add(p);
                uniquePool.push(p);
            }
        }

        const queueSet = new Set(this.#state.queue);
        const poolSet = new Set(uniquePool);
        
        let poolChanged = queueSet.size !== poolSet.size;
        if (!poolChanged) {
            for (const item of queueSet) {
                if (!poolSet.has(item)) {
                    poolChanged = true;
                    break;
                }
            }
        }

        if (poolChanged) {
            if (this.#state.strategy === "shuffle") {
                this.#state.queue = this.#shufflePaths(uniquePool);
            } else {
                this.#state.queue = uniquePool;
            }
            this.#state.currentIndex = -1;
        }
        
        const duration = Date.now() - start;
        if (duration > 50) log.info(`Pool normalization took ${duration}ms for ${pool.length} items`);
    }

    async #withSourcePoolCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const cached = this.#sourcePoolCache.get(key);
        if (cached && (now - cached.timestamp < SOURCE_POOL_CACHE_TTL_MS)) {
            return cached.data as unknown as T;
        }
        const data = await fetcher();
        this.#sourcePoolCache.set(key, { data: data as unknown as string[], timestamp: now });
        return data;
    }

    async resolveSourcePool(): Promise<string[]> {
        const config = loadConfig(PATHS.wallpaperConfig);
        const findOptions = {
            recursiveSearch: config.recursiveSearch ?? true,
            includeHidden: config.includeHidden ?? false,
        };
        const optionsKey = `${config.wallpaperDir}|${findOptions.recursiveSearch ? 1 : 0}|${findOptions.includeHidden ? 1 : 0}`;

        if (this.#state.sourceType === "specific-theme") {
            if (!this.#state.sourceValue) throw new Error("specific-theme source requires a theme path");
            return this.#withSourcePoolCache(
                `specific-theme|${optionsKey}|${this.#state.sourceValue}`,
                () => findImages(`${config.wallpaperDir}/${this.#state.sourceValue}`, findOptions),
            );
        }

        if (this.#state.sourceType === "favorites") {
            return this.#state.favorites;
        }

        if (this.#state.sourceType === "filtered-library") {
            const all = await this.#withSourcePoolCache(`all|${optionsKey}`, () => findImages(config.wallpaperDir, findOptions));
            if (!this.#state.sourceValue.trim()) return all;
            return fuzzyFilter(all, this.#state.sourceValue);
        }

        const currentWallpaper = wallpaper.getCurrentWallpaper();
        const inferredTheme = this.inferThemeFromWallpaperPath(config.wallpaperDir, currentWallpaper);

        if (inferredTheme) {
            return this.#withSourcePoolCache(
                `current-theme-inferred|${optionsKey}|${inferredTheme}`,
                () => findImages(`${config.wallpaperDir}/${inferredTheme}`, findOptions),
            );
        }

        const activeTheme = await getCurrentTheme(config.wallpaperDir, findOptions);
        if (!activeTheme) {
            return this.#withSourcePoolCache(`all|${optionsKey}`, () => findImages(config.wallpaperDir, findOptions));
        }
        return this.#withSourcePoolCache(
            `current-theme-active|${optionsKey}|${activeTheme}`,
            () => findImages(`${config.wallpaperDir}/${activeTheme}`, findOptions),
        );
    }

    async getNextPath(forwardInHistory = true): Promise<string> {
        if (forwardInHistory && this.#state.historyCursor < this.#state.history.length - 1) {
            this.#state.historyCursor += 1;
            return this.#state.history[this.#state.historyCursor];
        }

        const currentWallpaper = wallpaper.getCurrentWallpaper();

        if (this.#state.strategy !== "random" && this.#state.queue.length > 0) {
            if (this.#state.currentIndex < 0 && currentWallpaper) {
                this.#state.currentIndex = this.#state.queue.indexOf(currentWallpaper);
            }

            if (this.#state.currentIndex >= 0 && this.#state.currentIndex < this.#state.queue.length - 1) {
                this.#state.currentIndex += 1;
                return this.#state.queue[this.#state.currentIndex];
            }

            if (this.#state.currentIndex >= this.#state.queue.length - 1) {
                if (this.#state.strategy === "shuffle" && this.#state.queue.length > 1) {
                    this.#state.queue = this.#shufflePaths(this.#state.queue);
                    this.#state.currentIndex = 0;
                    return this.#state.queue[0];
                }

                if (this.#state.strategy === "sequential") {
                    this.#state.currentIndex = 0;
                    return this.#state.queue[0];
                }
            }
        }

        const pool = await this.resolveSourcePool();
        if (pool.length === 0) throw new Error("source has no wallpapers");

        if (this.#state.strategy === "random") {
            if (pool.length === 1) return pool[0];
            const candidates = pool.filter((path) => path !== currentWallpaper);
            const pickerPool = candidates.length > 0 ? candidates : pool;
            return pickerPool[Math.floor(Math.random() * pickerPool.length)];
        }

        this.#normalizePoolForState(pool);
        if (this.#state.currentIndex < 0 && currentWallpaper) {
            this.#state.currentIndex = this.#state.queue.indexOf(currentWallpaper);
        }

        let nextIndex = this.#state.currentIndex + 1;
        if (nextIndex >= this.#state.queue.length) {
            if (this.#state.strategy === "shuffle") {
                this.#state.queue = this.#shufflePaths(this.#state.queue);
            }
            nextIndex = 0;
        }

        this.#state.currentIndex = nextIndex;
        return this.#state.queue[nextIndex] || pool[0];
    }

    async getPreviousPath(): Promise<string> {
        if (this.#state.historyCursor > 0) {
            this.#state.historyCursor -= 1;
            return this.#state.history[this.#state.historyCursor];
        }

        const pool = await this.resolveSourcePool();
        if (pool.length === 0) throw new Error("source has no wallpapers");

        if (this.#state.strategy === "random") {
            return pool[Math.floor(Math.random() * pool.length)];
        }

        this.#normalizePoolForState(pool);
        const currentWallpaper = wallpaper.getCurrentWallpaper();
        if (this.#state.currentIndex < 0 && currentWallpaper) {
            this.#state.currentIndex = this.#state.queue.indexOf(currentWallpaper);
        }

        let prevIndex = this.#state.currentIndex - 1;
        if (prevIndex < 0) {
            prevIndex = this.#state.queue.length - 1;
        }

        this.#state.currentIndex = prevIndex;
        return this.#state.queue[prevIndex] || pool[0];
    }

    async next() {
        const path = await this.getNextPath(true);
        void wallpaper.setWallpaper(path).catch(err => {
            log.error(`Failed to apply next wallpaper: ${err}`);
        });
        return path;
    }

    async prev() {
        const path = await this.getPreviousPath();
        void wallpaper.setWallpaper(path).catch(err => {
            log.error(`Failed to apply previous wallpaper: ${err}`);
        });
        return path;
    }

    async startAuto(interval?: number, skipInitial = false) {
        if (interval) this.#state.intervalSeconds = interval;
        
        await wallpaper.startAutoChange(
            undefined,
            this.#state.intervalSeconds,
            undefined,
            () => this.getNextPath(false),
            skipInitial,
        );

        this.#state.mode = "automatic";
        this.#state.isRunning = true;
        this.#syncState();
    }

    stopAuto() {
        wallpaper.stopAutoChange();
        this.#state.mode = "manual";
        this.#state.isRunning = false;
        this.#syncState();
    }

    setInterval(seconds: number) {
        this.#state.intervalSeconds = seconds;
        if (this.#state.mode === "automatic") {
            void this.startAuto(seconds);
        } else {
            this.#syncState();
        }
    }

    setMode(mode: WallpaperMode) {
        if (mode === "automatic") {
            void this.startAuto();
        } else {
            this.stopAuto();
        }
    }

    setStrategy(strategy: WallpaperStrategy) {
        this.#state.strategy = strategy;
        this.#syncState();
    }

    setSource(type: WallpaperSourceType, value: string = "") {
        this.#state.sourceType = type;
        this.#state.sourceValue = value;
        this.#state.queue = [];
        this.#state.currentIndex = -1;
        this.#syncState();
    }

    addFavorite(path: string) {
        if (!this.#state.favorites.includes(path)) {
            this.#state.favorites.push(path);
            this.#syncState();
        }
    }

    removeFavorite(path: string) {
        this.#state.favorites = this.#state.favorites.filter((p) => p !== path);
        this.#syncState();
    }

    toggleFavorite(path: string) {
        if (this.#state.favorites.includes(path)) {
            this.removeFavorite(path);
        } else {
            this.addFavorite(path);
        }
    }
}

const service = new WallpaperEngine();
export default service;
