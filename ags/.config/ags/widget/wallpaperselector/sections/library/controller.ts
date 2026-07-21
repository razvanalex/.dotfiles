import type GObject from "gi://GObject";
import type { Accessor, Setter } from "ags";
import { createState, onCleanup } from "ags";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";
import {
    fuzzyFilter,
    getCurrentTheme,
    loadConfig,
    loadThemes,
} from "services/wallpaper/utils/wallpaper";
import wallpaperService from "services/wallpaper/Wallpaper";
import wallpaperEngine from "services/wallpaper/WallpaperEngine";
import {
    type LibraryView,
    THEME_PREVIEW_LOAD_BATCH,
    THEME_PREVIEW_PRELOAD_LIMIT,
} from "../../types";
import type { GridItem } from "../../WallpaperGridView.js";
import { fuzzyThemeFilter } from "./filters";
import { primeWallpaperThumbnails } from "./thumbnailCache";

const DEBUG_WALLPAPER_PREVIEW = false;
const WALLPAPER_PREVIEW_LOOKBACK = 12;
const WALLPAPER_PREVIEW_LOOKAHEAD = 24;
const WALLPAPER_PREVIEW_BATCH_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 120;

// --- Shared Data Layer (The Singleton) ---
class LibraryDataManager {
    themes: Accessor<string[]>;
    setThemes: Setter<string[]>;
    themePreviews: Accessor<Record<string, string>>;
    setThemePreviews: Setter<Record<string, string>>;

    private static instance: LibraryDataManager;
    private initialized = false;

    private constructor() {
        const [t, st] = createState<string[]>([]);
        this.themes = t;
        this.setThemes = st;

        const [p, sp] = createState<Record<string, string>>({});
        this.themePreviews = p;
        this.setThemePreviews = sp;

        wallpaperService.connect(
            "config-changed",
            () => void this.loadThemeCatalog(),
        );
    }

    static getInstance() {
        if (!LibraryDataManager.instance)
            LibraryDataManager.instance = new LibraryDataManager();
        return LibraryDataManager.instance;
    }

    async init(wallpaperDir: string) {
        if (this.initialized) return;
        await this.loadThemeCatalog(wallpaperDir);
        this.initialized = true;
    }

    async loadThemeCatalog(wallpaperDir?: string) {
        const dir =
            wallpaperDir || loadConfig(PATHS.wallpaperConfig).wallpaperDir;
        const config = loadConfig(PATHS.wallpaperConfig);
        try {
            const list = await loadThemes(dir, {
                recursiveSearch: config.recursiveSearch,
                includeHidden: config.includeHidden,
            });
            this.setThemes(list);

            const previews: Record<string, string> = {};
            await Promise.all(
                list.slice(0, THEME_PREVIEW_PRELOAD_LIMIT).map(async (t) => {
                    try {
                        previews[t] = await wallpaperService.getFirstWallpaper(
                            `${dir}/${t}`,
                        );
                    } catch {
                        previews[t] = "";
                    }
                }),
            );
            this.setThemePreviews(previews);
        } catch (e) {
            Logger.error(`LibraryDataManager error: ${e}`);
        }
    }
}

const dataManager = LibraryDataManager.getInstance();

export interface LibraryDataController {
    libraryView: Accessor<LibraryView>;
    setLibraryView: (view: LibraryView) => void;
    filteredThemes: Accessor<string[]>;
    filteredImages: Accessor<string[]>;
    browsingTheme: Accessor<string>;
    selectedWallpaper: Accessor<string>;
    selectedIsFavorite: Accessor<boolean>;
    wallpaperPreviewThumbs: Accessor<Record<string, string>>;
    themeItems: Accessor<GridItem[]>;
    imageItems: Accessor<GridItem[]>;
    isSearchVisible: Accessor<boolean>;
    searchQuery: Accessor<string>;
    ensureThemePreviewRange: (start: number, end: number) => void;
    ensureWallpaperPreviewRange: (start: number, end: number) => void;
    handleThemeChange: (newTheme: string) => Promise<void>;
    showCurrentThemeWallpapers: () => Promise<void>;
    handleBackToThemes: () => void;
    handleSearchChange: (query: string) => void;
    handleSelectImage: (path: string) => void;
    handleActivateImage: (path: string) => Promise<void>;
    handleRandomInTheme: () => Promise<void>;
    toggleSelectedFavorite: () => Promise<void>;
}

interface CreateLibraryDataControllerProps {
    wallpaperDir: string;
    refreshSignal?: Accessor<number>;
    isSearchVisible?: Accessor<boolean>;
}

export function createLibraryDataController(
    props: CreateLibraryDataControllerProps,
): LibraryDataController {
    const { wallpaperDir, isSearchVisible: isSearchVisibleProp } = props;

    let searchDebounceId: ReturnType<typeof setTimeout> | null = null;

    // UI State (Per-Window)
    const [browsingTheme, setBrowsingTheme] = createState("");
    const [appliedTheme, setAppliedTheme] = createState("");
    const [filteredImages, setFilteredImages] = createState<string[]>([]);
    const [filteredThemes, setFilteredThemes] = createState<string[]>([]);
    const [_searchQuery, setSearchQuery] = createState("");
    const [currentWallpaper, setCurrentWallpaper] = createState(
        wallpaperService.getCurrentWallpaper(),
    );
    const [selectedWallpaper, setSelectedWallpaper] = createState(
        wallpaperService.getCurrentWallpaper(),
    );
    const [selectedIsFavorite, setSelectedIsFavorite] = createState(false);
    const [libraryView, setLibraryView] = createState<LibraryView>("themes");
    const [wallpaperPreviewThumbs, setWallpaperPreviewThumbs] = createState<
        Record<string, string>
    >({});
    const [wallpaperVisibleRange, setWallpaperVisibleRange] = createState({
        start: 0,
        end: 96,
    });
    const isSearchVisible = isSearchVisibleProp ?? createState(false)[0];

    const themes = dataManager.themes;
    const themePreviews = dataManager.themePreviews;

    const inferThemeFromWallpaper = (path: string): string => {
        if (!path) return "";
        const prefix = `${wallpaperDir}/`;
        if (!path.startsWith(prefix)) return "";
        const relative = path.slice(prefix.length);
        const knownThemes = themes.get();
        let bestMatch = "";
        for (const t of knownThemes) {
            if (relative === t || relative.startsWith(`${t}/`)) {
                if (t.length > bestMatch.length) bestMatch = t;
            }
        }
        if (bestMatch) return bestMatch;

        const parts = relative.split("/");
        if (parts.length > 1) {
            parts.pop();
            return parts.join("/");
        }
        return "";
    };

    // Thumbnail Management
    const pendingThemePreviewLoads = new Set<string>();
    const pendingWallpaperPreviewLoads = new Set<string>();
    let wallpaperPreviewEpoch = 0;
    let queuedWallpaperRange: { start: number; end: number } | null = null;
    let wallpaperPreviewBatchActive = false;

    const processWallpaperPreviewQueue = () => {
        if (wallpaperPreviewBatchActive) return;
        const nextRange = queuedWallpaperRange;
        if (!nextRange) return;

        queuedWallpaperRange = null;
        const { start, end } = nextRange;
        const requestEpoch = wallpaperPreviewEpoch;
        const images = filteredImages.get();
        const previews = wallpaperPreviewThumbs.get();

        const toLoad: string[] = [];
        for (
            let i = Math.max(0, start);
            i < Math.min(end, images.length) &&
            toLoad.length < WALLPAPER_PREVIEW_BATCH_SIZE;
            i++
        ) {
            const path = images[i];
            if (
                path &&
                !previews[path] &&
                !pendingWallpaperPreviewLoads.has(path)
            )
                toLoad.push(path);
        }

        if (toLoad.length === 0) return;

        wallpaperPreviewBatchActive = true;
        for (const p of toLoad) pendingWallpaperPreviewLoads.add(p);

        void primeWallpaperThumbnails(toLoad)
            .then((batchMap) => {
                if (requestEpoch !== wallpaperPreviewEpoch) return;
                setWallpaperPreviewThumbs({
                    ...wallpaperPreviewThumbs.get(),
                    ...batchMap,
                });
            })
            .finally(() => {
                for (const p of toLoad) pendingWallpaperPreviewLoads.delete(p);
                wallpaperPreviewBatchActive = false;
                processWallpaperPreviewQueue();
            });
    };

    const ensureThemePreviewRange = (start: number, end: number) => {
        const list = filteredThemes.get();
        const previews = themePreviews.get();
        const toLoad: string[] = [];
        for (
            let i = Math.max(0, start);
            i < Math.min(end, list.length) &&
            toLoad.length < THEME_PREVIEW_LOAD_BATCH;
            i++
        ) {
            const t = list[i];
            if (
                t &&
                previews[t] === undefined &&
                !pendingThemePreviewLoads.has(t)
            )
                toLoad.push(t);
        }

        if (toLoad.length === 0) return;
        for (const t of toLoad) pendingThemePreviewLoads.add(t);

        void Promise.all(
            toLoad.map(async (t) => {
                const first = await wallpaperService.getFirstWallpaper(
                    `${wallpaperDir}/${t}`,
                );
                return [t, first] as const;
            }),
        ).then(async (entries) => {
            const validPaths = entries.map(([, p]) => p).filter(Boolean);
            const thumbMap =
                validPaths.length > 0
                    ? await primeWallpaperThumbnails(validPaths)
                    : {};
            const next = { ...themePreviews.get() };
            for (const [t, p] of entries) {
                next[t] = p ? thumbMap[p] || p : "";
                pendingThemePreviewLoads.delete(t);
            }
            dataManager.setThemePreviews(next);
        });
    };

    const ensureWallpaperPreviewRange = (start: number, end: number) => {
        if (
            wallpaperVisibleRange.get().start !== start ||
            wallpaperVisibleRange.get().end !== end
        ) {
            setWallpaperVisibleRange({ start, end });
        }
        queuedWallpaperRange = { start, end };
        processWallpaperPreviewQueue();
    };

    // Connections
    const conn1 = wallpaperService.connect("wallpaper-changed", (_, path) => {
        const p = String(path ?? "");
        setCurrentWallpaper(p);
        setSelectedWallpaper(p);
        const inferred = inferThemeFromWallpaper(p);
        if (inferred) setAppliedTheme(inferred);
    });

    const refreshSelectedFavorite = () => {
        const s = selectedWallpaper.get();
        setSelectedIsFavorite(
            s ? wallpaperEngine.state.favorites.includes(s) : false,
        );
    };
    const unsub1 = selectedWallpaper.subscribe(refreshSelectedFavorite);
    const conn2 = wallpaperEngine.connect("changed", refreshSelectedFavorite);

    const loadImagesForTheme = async (theme: string) => {
        if (!theme) return;
        try {
            const images = await wallpaperService.getWallpapers(
                `${wallpaperDir}/${theme}`,
            );
            setFilteredImages(fuzzyFilter(images, _searchQuery.get()));
            const current = currentWallpaper.get();
            setSelectedWallpaper(
                images.includes(current) ? current : images[0] || "",
            );
        } catch (e) {
            Logger.error(`Error loading theme images: ${e}`);
        }
    };

    const syncThemes = () =>
        setFilteredThemes(fuzzyThemeFilter(themes.get(), _searchQuery.get()));
    const unsub2 = themes.subscribe(syncThemes);

    const [themeItems, setThemeItems] = createState<GridItem[]>([]);
    const [imageItems, setImageItems] = createState<GridItem[]>([]);

    const rebuildThemeItems = () => {
        const th = filteredThemes.get();
        const prev = themePreviews.get();
        const active = appliedTheme.get();
        setThemeItems(
            th.map((t) => ({
                id: t,
                previewPath: prev[t],
                label: t,
                isActive: t === active,
            })),
        );
    };

    const rebuildImageItems = () => {
        const imgs = filteredImages.get();
        const current = currentWallpaper.get();
        setImageItems(
            imgs.map((p) => ({
                id: p,
                label: p.split("/").pop() || "",
                isActive: p === current,
                isGif: p.toLowerCase().endsWith(".gif"),
            })),
        );
    };

    const unsubs = [
        filteredThemes.subscribe(rebuildThemeItems),
        themePreviews.subscribe(rebuildThemeItems),
        appliedTheme.subscribe(rebuildThemeItems),
        filteredImages.subscribe(rebuildImageItems),
        currentWallpaper.subscribe(rebuildImageItems),
        filteredImages.subscribe(() => {
            wallpaperPreviewEpoch++;
            pendingWallpaperPreviewLoads.clear();
            ensureWallpaperPreviewRange(0, 96);
        }),
    ];

    onCleanup(() => {
        wallpaperService.disconnect(conn1);
        wallpaperEngine.disconnect(conn2);
        unsub1();
        unsub2();
        for (const unsub of unsubs) unsub();
    });

    const controller: LibraryDataController = {
        libraryView,
        setLibraryView,
        filteredThemes,
        filteredImages,
        browsingTheme,
        selectedWallpaper,
        selectedIsFavorite,
        wallpaperPreviewThumbs,
        themeItems,
        imageItems,
        isSearchVisible,
        searchQuery: _searchQuery,
        ensureThemePreviewRange,
        ensureWallpaperPreviewRange,
        handleThemeChange: async (t) => {
            setBrowsingTheme(t);
            setLibraryView("wallpapers");
            await loadImagesForTheme(t);
        },
        showCurrentThemeWallpapers: async () => {
            const t =
                appliedTheme.get() ||
                browsingTheme.get() ||
                inferThemeFromWallpaper(currentWallpaper.get());
            if (!t) return setLibraryView("themes");
            if (
                libraryView.get() === "wallpapers" &&
                browsingTheme.get() === t &&
                filteredImages.get().length > 0
            )
                return;
            await controller.handleThemeChange(t);
        },
        handleBackToThemes: () => {
            setLibraryView("themes");
            setSearchQuery("");
            syncThemes();
        },
        handleSearchChange: (q) => {
            setSearchQuery(q);
            if (searchDebounceId) clearTimeout(searchDebounceId);
            searchDebounceId = setTimeout(() => {
                if (libraryView.get() === "themes") syncThemes();
                else void loadImagesForTheme(browsingTheme.get());
            }, SEARCH_DEBOUNCE_MS);
        },
        handleSelectImage: (p) => setSelectedWallpaper(p),
        handleActivateImage: async (p) => {
            await wallpaperService.setWallpaper(p);
        },
        handleRandomInTheme: async () => {
            const t = browsingTheme.get();
            if (!t) return;
            wallpaperEngine.setSource("specific-theme", t);
            await wallpaperEngine.next();
        },
        toggleSelectedFavorite: async () => {
            const s = selectedWallpaper.get();
            if (s) wallpaperEngine.toggleFavorite(s);
        },
    };

    const init = async () => {
        await dataManager.init(wallpaperDir);
        const config = loadConfig(PATHS.wallpaperConfig);
        const themeFromFile = await getCurrentTheme(wallpaperDir, {
            recursiveSearch: config.recursiveSearch,
            includeHidden: config.includeHidden,
        });
        const effectiveTheme =
            inferThemeFromWallpaper(currentWallpaper.get()) || themeFromFile;
        setAppliedTheme(effectiveTheme);
        setBrowsingTheme(effectiveTheme);
        if (effectiveTheme) await loadImagesForTheme(effectiveTheme);
    };

    setTimeout(() => void init(), 100);

    return controller;
}
