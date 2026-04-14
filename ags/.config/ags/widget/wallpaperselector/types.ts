export type NavSection =
    | "library"
    | "favorites"
    | "recent"
    | "settings"
    | "about";
export type LibraryView = "themes" | "wallpapers";
export type EngineMode = "manual" | "automatic";
export type WallpaperSourceType =
    | "current-theme"
    | "specific-theme"
    | "favorites"
    | "filtered-library";
export type WallpaperStrategy = "random" | "shuffle" | "sequential";

export interface EngineState {
    mode: EngineMode;
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

export const THEME_PREVIEW_PRELOAD_LIMIT = 24;
export const THEME_PREVIEW_LOAD_BATCH = 36;
export const WALLPAPER_PREVIEW_DISABLE_THRESHOLD = 1200;

export const WALLPAPER_CARD_WIDTH = 280;
export const WALLPAPER_CARD_IMAGE_HEIGHT = 158;
export const WALLPAPER_CARD_LABEL_HEIGHT = 28;
