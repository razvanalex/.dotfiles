import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { execAsync } from "ags/process";
import { CONFIG_DIR, ensureDirectory, PATHS } from "lib/constants";
import Logger from "lib/logger";

export type TransitionType =
    | "none"
    | "simple"
    | "fade"
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "wipe"
    | "wave"
    | "grow"
    | "center"
    | "any"
    | "outer"
    | "random";

export interface TransitionOptions {
    fps?: number;
    type?: TransitionType;
    duration?: number;
    bezier?: string;
    angle?: number;
    pos?: string;
    wave?: string;
    invertY?: boolean;
    step?: number;
}

export interface WallpaperConfig {
    wallpaperDir: string;
    recursiveSearch: boolean;
    includeHidden: boolean;
    transition: TransitionOptions;
    colorGenerationScript: string;
    stateFile: string;
}

const COLORGEN_DEBOUNCE_MS = 400;
const COLORGEN_MIN_INTERVAL_MS = 2000;
let colorGenTimerId: number | null = null;
let colorGenPendingImagePath = "";
let lastColorGenLaunchAt = 0;

export const DEFAULT_CONFIG: WallpaperConfig = {
    wallpaperDir: `${GLib.get_home_dir()}/Pictures/Wallpapers`,
    recursiveSearch: true,
    includeHidden: false,
    transition: {
        fps: 60,
        type: "any",
        duration: 1,
        bezier: ".54,0,.34,.99",
    },
    colorGenerationScript: `${CONFIG_DIR}/scripts/color_generation/colorgen.sh`,
    stateFile: PATHS.wallpaperState,
};

/**
 * Expand ~ to home directory and resolve relative paths
 */
export function expandPath(path: string): string {
    if (path.startsWith("~")) {
        return path.replace("~", GLib.get_home_dir());
    }
    return path;
}

let cachedImages = new Map<string, string[]>();
let cachedThemes: string[] | null = null;
let cachedThemesKey = "";

const isImage = (filename: string) => {
    const lower = filename.toLowerCase();
    return (
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".png") ||
        lower.endsWith(".gif")
    );
};

/**
 * Find image files in a directory using non-blocking Gio enumeration
 */
export async function enumerateImages(
    dirPath: string,
    recursive: boolean,
    includeHidden: boolean,
    limitOne = false,
): Promise<string[]> {
    const images: string[] = [];
    const visited = new Set<string>();
    const file = Gio.File.new_for_path(dirPath);

    const processDirectory = async (currentFile: Gio.File): Promise<void> => {
        const path = currentFile.get_path();
        if (!path) return;
        
        const realPath = GLib.canonicalize_filename(path, null);
        if (visited.has(realPath)) return;
        visited.add(realPath);

        if (limitOne && images.length > 0) return;

        return new Promise((resolve) => {
            currentFile.enumerate_children_async(
                "standard::name,standard::type",
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null,
                async (obj, res) => {
                    try {
                        const enumerator = currentFile.enumerate_children_finish(res);
                        let info: Gio.FileInfo | null;

                        const children: Gio.File[] = [];
                        while ((info = enumerator.next_file(null)) !== null) {
                            const name = info.get_name();
                            const type = info.get_file_type();

                            if (!includeHidden && name.startsWith(".")) continue;

                            const childFile = enumerator.get_child(info);
                            const childPath = childFile.get_path() || "";

                            if (type === Gio.FileType.DIRECTORY && recursive) {
                                children.push(childFile);
                            } else if (type === Gio.FileType.REGULAR && isImage(name)) {
                                images.push(childPath);
                                if (limitOne) {
                                    resolve();
                                    return;
                                }
                            }
                        }
                        
                        // Process subdirectories sequentially to avoid too many open enumerators
                        for (const child of children) {
                            await processDirectory(child);
                        }
                        
                        resolve();
                    } catch (e) {
                        resolve(); // Ignore errors in subdirectories
                    }
                },
            );
        });
    };

    await processDirectory(file);
    return images;
}

/**
 * Find all image files in a directory (jpg, jpeg, png, gif)
 * @throws Error if directory doesn't exist or no images found
 */
export async function findImages(
    directory: string,
    options?: {
        recursiveSearch?: boolean;
        includeHidden?: boolean;
        forceRefresh?: boolean;
    },
): Promise<string[]> {
    const expandedDir = expandPath(directory);
    const recursiveSearch = options?.recursiveSearch ?? true;
    const includeHidden = options?.includeHidden ?? false;
    const forceRefresh = options?.forceRefresh ?? false;

    const cacheKey = `${expandedDir}|${recursiveSearch}|${includeHidden}`;
    if (!forceRefresh && cachedImages.has(cacheKey)) {
        return cachedImages.get(cacheKey)!;
    }

    // Check if directory exists
    if (!GLib.file_test(expandedDir, GLib.FileTest.IS_DIR)) {
        throw new Error(`Directory does not exist: ${expandedDir}`);
    }

    try {
        const images = await enumerateImages(expandedDir, recursiveSearch, includeHidden);

        if (images.length === 0) {
            throw new Error(`No images found in directory: ${expandedDir}`);
        }

        cachedImages.set(cacheKey, images);
        return images;
    } catch (error) {
        if (error instanceof Error && error.message.includes("No images found")) {
            throw error;
        }
        throw new Error(`Failed to find images in ${expandedDir}: ${error}`);
    }
}

/**
 * Find first image file in a directory according to discovery options.
 * Returns empty string when no image is found.
 */
export async function findFirstImage(
    directory: string,
    options?: {
        recursiveSearch?: boolean;
        includeHidden?: boolean;
    },
): Promise<string> {
    const expandedDir = expandPath(directory);
    const recursiveSearch = options?.recursiveSearch ?? true;
    const includeHidden = options?.includeHidden ?? false;

    if (!GLib.file_test(expandedDir, GLib.FileTest.IS_DIR)) {
        throw new Error(`Directory does not exist: ${expandedDir}`);
    }

    try {
        const images = await enumerateImages(expandedDir, recursiveSearch, includeHidden, true);
        return images[0] || "";
    } catch {
        return "";
    }
}

/**
 * Load list of theme directories from wallpaper base directory.
 * If recursiveSearch is true, it finds all subdirectories.
 */
export async function loadThemes(
    baseDir: string,
    options?: {
        recursiveSearch?: boolean;
        includeHidden?: boolean;
        forceRefresh?: boolean;
    },
): Promise<string[]> {
    const expandedBaseDir = expandPath(baseDir);
    const recursiveSearch = options?.recursiveSearch ?? true;
    const includeHidden = options?.includeHidden ?? false;
    const forceRefresh = options?.forceRefresh ?? false;

    const cacheKey = `${expandedBaseDir}|${recursiveSearch}|${includeHidden}`;
    if (!forceRefresh && cachedThemes && cachedThemesKey === cacheKey) {
        return cachedThemes;
    }

    try {
        const themes: string[] = [];
        const visited = new Set<string>();

        const scan = async (dirPath: string) => {
            const realPath = GLib.canonicalize_filename(dirPath, null);
            if (visited.has(realPath)) return;
            visited.add(realPath);

            const file = Gio.File.new_for_path(dirPath);
            let enumerator: Gio.FileEnumerator;
            try {
                enumerator = await new Promise<Gio.FileEnumerator>((resolve, reject) => {
                    file.enumerate_children_async(
                        "standard::name,standard::type",
                        Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (obj, res) => {
                            try {
                                resolve(file.enumerate_children_finish(res));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            } catch (e) {
                return; // Skip directories we can't read
            }

            let info: Gio.FileInfo | null;
            const subdirs: string[] = [];
            while ((info = enumerator.next_file(null)) !== null) {
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    const name = info.get_name();
                    if (!includeHidden && name.startsWith(".")) continue;
                    
                    const fullSubdirPath = `${dirPath}/${name}`;
                    const relativePath = fullSubdirPath.slice(expandedBaseDir.length).replace(/^\/+/, "");
                    
                    themes.push(relativePath);
                    subdirs.push(fullSubdirPath);
                }
            }
            
            if (recursiveSearch) {
                for (const subdir of subdirs) {
                    await scan(subdir);
                }
            }
        };

        await scan(expandedBaseDir);
        themes.sort();
        cachedThemes = themes;
        cachedThemesKey = cacheKey;
        return themes;
    } catch (error) {
        Logger.error("Failed to load themes:", error);
        return [];
    }
}

/**
 * Get current theme from .crt_theme file asynchronously
 */
export async function getCurrentTheme(
    wallpaperDir: string,
    options?: {
        recursiveSearch?: boolean;
        includeHidden?: boolean;
    },
): Promise<string> {
    try {
        const crtThemeFile = `${wallpaperDir}/.crt_theme`;

        if (!GLib.file_test(crtThemeFile, GLib.FileTest.EXISTS)) {
            const themes = await loadThemes(wallpaperDir, options);
            return themes[0] || "";
        }

        const contents = await readFileAsync(crtThemeFile);
        const themePath = new TextDecoder().decode(contents).trim();

        // If themePath is absolute and valid, try to extract relative name
        const expandedDir = expandPath(wallpaperDir);
        let themeName = "";
        if (themePath.startsWith(expandedDir)) {
            themeName = themePath.slice(expandedDir.length).replace(/^\/+/, "");
        } else if (themePath.startsWith(`${wallpaperDir}/`)) {
            themeName = themePath.slice(`${wallpaperDir}/`.length);
        } else {
            const parts = themePath.split("/");
            themeName = parts[parts.length - 1] || "";
        }

        // We only care about the top-level part for the UI, but let's check if the path is valid
        const themeFullPath = `${wallpaperDir}/${themeName}`;
        if (!GLib.file_test(themeFullPath, GLib.FileTest.IS_DIR)) {
             const themes = await loadThemes(wallpaperDir, options);
             return themes[0] || "";
        }

        return themeName;
    } catch (error) {
        Logger.error(`Failed to read current theme: ${error}`);
        const themes = await loadThemes(wallpaperDir, options);
        return themes[0] || "";
    }
}

/**
 * Update .crt_theme file with new theme asynchronously
 */
export async function updateCurrentTheme(
    wallpaperDir: string,
    themeName: string,
): Promise<void> {
    try {
        const crtThemeFile = `${wallpaperDir}/.crt_theme`;
        const themePath = `${wallpaperDir}/${themeName}`;

        await writeFileAsync(crtThemeFile, themePath);
        Logger.info(`Updated current theme to: ${themeName}`);
    } catch (error) {
        Logger.error(`Failed to update current theme: ${error}`);
        throw error;
    }
}

/**
 * Extract filename from full path
 */
export function getFilename(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] || "";
}

/**
 * Fuzzy search/filter images by filename
 */
export function fuzzyFilter(images: string[], query: string): string[] {
    if (!query || query.trim() === "") {
        return images;
    }

    const q = query.toLowerCase().replace(/\s+/g, "");

    return images.filter((imagePath) => {
        const filename = getFilename(imagePath).toLowerCase();
        let queryIndex = 0;
        for (let i = 0; i < filename.length && queryIndex < q.length; i++) {
            if (filename[i] === q[queryIndex]) {
                queryIndex++;
            }
        }
        return queryIndex === q.length;
    });
}

/**
 * Count images in a directory
 */
export async function countImages(
    directory: string,
    options?: {
        recursiveSearch?: boolean;
        includeHidden?: boolean;
    },
): Promise<number> {
    try {
        const images = await enumerateImages(
            directory,
            options?.recursiveSearch ?? true,
            options?.includeHidden ?? false
        );
        return images.length;
    } catch (error) {
        Logger.error("Failed to count images:", error);
        return 0;
    }
}

/**
 * Select a random element from an array
 */
export function selectRandom<T>(array: T[]): T {
    if (array.length === 0) {
        throw new Error("Cannot select random element from empty array");
    }
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Trigger color generation script
 */
export async function triggerColorGen(
    script: string,
    imagePath: string,
): Promise<void> {
    const expandedScript = expandPath(script);

    if (!GLib.file_test(expandedScript, GLib.FileTest.EXISTS)) {
        Logger.warn(`Color generation script not found: ${expandedScript}`);
        return;
    }

    colorGenPendingImagePath = imagePath;

    if (colorGenTimerId !== null) {
        GLib.source_remove(colorGenTimerId);
        colorGenTimerId = null;
    }

    const runLatest = () => {
        if (!colorGenPendingImagePath) return;
        const latestImagePath = colorGenPendingImagePath;
        colorGenPendingImagePath = "";

        try {
            const venvActivate = `${GLib.get_home_dir()}/.config/ags/scripts/.venv/bin/activate`;
            
            Logger.info(`Launching color generation for ${latestImagePath}`);
            
            // Use spawn_command_line_async for truly non-blocking background execution
            const cmdStr = `bash -c "source \"${venvActivate}\" && \"${expandedScript}\" \"${latestImagePath}\" --apply"`;
            
            try {
                GLib.spawn_command_line_async(cmdStr);
            } catch (err) {
                Logger.error(`Failed to spawn color generation: ${err}`);
            }
            
            lastColorGenLaunchAt = Date.now();
        } catch (error) {
            Logger.error(`Failed to trigger color generation: ${error}`);
        }
    };

    const now = Date.now();
    const timeSinceLast = now - lastColorGenLaunchAt;
    
    if (timeSinceLast >= COLORGEN_MIN_INTERVAL_MS) {
        runLatest();
    } else {
        const scheduleDelay = Math.max(COLORGEN_DEBOUNCE_MS, COLORGEN_MIN_INTERVAL_MS - timeSinceLast);
        Logger.info(`Scheduling color generation in ${scheduleDelay}ms`);
        colorGenTimerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            scheduleDelay,
            () => {
                colorGenTimerId = null;
                runLatest();
                return GLib.SOURCE_REMOVE;
            },
        );
    }
}

/**
 * Build awww command line parameters from transition options
 */
export function buildTransitionParams(options: TransitionOptions): string[] {
    const params: string[] = [];

    if (options.fps !== undefined) params.push("--transition-fps", options.fps.toString());
    if (options.type !== undefined) params.push("--transition-type", options.type);
    if (options.duration !== undefined) params.push("--transition-duration", options.duration.toString());
    if (options.bezier !== undefined) params.push("--transition-bezier", options.bezier);
    if (options.angle !== undefined) params.push("--transition-angle", options.angle.toString());
    if (options.pos !== undefined) params.push("--transition-pos", options.pos);
    if (options.wave !== undefined) params.push("--transition-wave", options.wave);
    if (options.step !== undefined) params.push("--transition-step", options.step.toString());
    if (options.invertY) params.push("--invert-y");

    return params;
}

let cachedConfig: WallpaperConfig | null = null;

const SAVE_DEBOUNCE_MS = 100;
let configSaveTimer: number | null = null;
let stateSaveTimer: number | null = null;
let pendingConfigSave: { path: string; config: WallpaperConfig } | null = null;
let pendingStateSave: { path: string; state: { currentWallpaper: string } } | null = null;

async function readFileAsync(path: string): Promise<Uint8Array> {
    const file = Gio.File.new_for_path(path);
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (obj, res) => {
            try {
                const [ok, data] = file.load_contents_finish(res);
                if (ok) resolve(data);
                else reject(new Error(`Failed to read ${path}`));
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function writeFileAsync(path: string, content: string): Promise<void> {
    try {
        // For small configuration and state files, synchronous write is extremely fast
        // and avoids the 'buffer != NULL' Gio async errors.
        GLib.file_set_contents(path, content);
    } catch (e) {
        throw new Error(`Failed to write to ${path}: ${e}`);
    }
}

/**
 * Load config from file, or create default if missing
 */
export function loadConfig(configPath: string): WallpaperConfig {
    if (cachedConfig) return cachedConfig;
    const expandedPath = expandPath(configPath);

    if (GLib.file_test(expandedPath, GLib.FileTest.EXISTS)) {
        try {
            const contents = GLib.file_get_contents(expandedPath);
            const text = new TextDecoder().decode(contents[1]);
            const config = JSON.parse(text);

            cachedConfig = {
                ...DEFAULT_CONFIG,
                ...config,
                transition: {
                    ...DEFAULT_CONFIG.transition,
                    ...(config.transition || {}),
                },
            };
            return cachedConfig!;
        } catch (error) {
            Logger.error("Failed to load config, using defaults:", error);
            return DEFAULT_CONFIG;
        }
    } else {
        const config = { ...DEFAULT_CONFIG };
        saveConfig(expandedPath, config);
        return config;
    }
}

/**
 * Save config to file asynchronously with 100ms debounce
 */
export function saveConfig(configPath: string, config: WallpaperConfig): void {
    const expandedPath = expandPath(configPath);
    cachedConfig = config;
    pendingConfigSave = { path: expandedPath, config };

    if (configSaveTimer !== null) GLib.source_remove(configSaveTimer);

    configSaveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DEBOUNCE_MS, () => {
        if (!pendingConfigSave) return GLib.SOURCE_REMOVE;
        const { path, config: data } = pendingConfigSave;
        pendingConfigSave = null;
        configSaveTimer = null;
        ensureDirectory(path);
        writeFileAsync(path, JSON.stringify(data, null, 2)).catch(err => {
            Logger.error(`Failed to save config asynchronously: ${err}`);
        });
        return GLib.SOURCE_REMOVE;
    });
}

/**
 * Load state from file
 */
export function loadState(statePath: string): { currentWallpaper: string } | null {
    const expandedPath = expandPath(statePath);
    if (!GLib.file_test(expandedPath, GLib.FileTest.EXISTS)) return null;

    try {
        const contents = GLib.file_get_contents(expandedPath);
        const text = new TextDecoder().decode(contents[1]);
        return JSON.parse(text);
    } catch (error) {
        Logger.error("Failed to load state:", error);
        return null;
    }
}

/**
 * Save state to file asynchronously with 100ms debounce
 */
export function saveState(statePath: string, state: { currentWallpaper: string }): void {
    const expandedPath = expandPath(statePath);
    pendingStateSave = { path: expandedPath, state };

    if (stateSaveTimer !== null) GLib.source_remove(stateSaveTimer);

    stateSaveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DEBOUNCE_MS, () => {
        if (!pendingStateSave) return GLib.SOURCE_REMOVE;
        const { path, state: data } = pendingStateSave;
        pendingStateSave = null;
        stateSaveTimer = null;
        ensureDirectory(path);
        writeFileAsync(path, JSON.stringify(data, null, 2)).catch(err => {
            Logger.error(`Failed to save state asynchronously: ${err}`);
        });
        return GLib.SOURCE_REMOVE;
    });
}
