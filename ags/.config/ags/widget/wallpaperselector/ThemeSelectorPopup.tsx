import { createState } from "ags";
import { Astal, Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import { createLibraryDataController } from "./sections/library/controller";
import PopupSelectorWindow from "./PopupSelectorWindow";
import WallpaperGridView from "./WallpaperGridView";
import {
    WALLPAPER_CARD_WIDTH,
    WALLPAPER_CARD_IMAGE_HEIGHT,
    WALLPAPER_CARD_LABEL_HEIGHT,
    GRID_COLUMN_SPACING,
    GRID_ROW_SPACING,
} from "./types";

export default function ThemeSelectorPopup(
    monitor: Gdk.Monitor,
    index: number,
) {
    const configPath = PATHS.wallpaperConfig;
    const config = loadConfig(configPath);
    const wallpaperDir = config.wallpaperDir;

    const [isSearchVisible] = createState(true);
    const controller = createLibraryDataController({
        wallpaperDir,
        isSearchVisible,
    });

    // For Theme selector, we strictly stay in "themes" view
    controller.setLibraryView("themes");

    const windowName = `theme-selector-popup${index}`;

    // Grid View
    const libraryThemeGrid = WallpaperGridView({
        items: controller.themeItems,
        onActivate: (theme) => {
            import("ags/process").then(({ execAsync }) => {
                execAsync(["ags", "request", "wallpaper", "set-theme", theme])
                    .catch(err => console.error(`[ThemeSelector] failed to set theme: ${err}`));
            });
            app.get_window(windowName)?.set_visible(false);
        },
        onVisibleRangeChange: controller.ensureThemePreviewRange,
    });

    const getActiveGridView = () => {
        const scrolledWindow = libraryThemeGrid as Gtk.ScrolledWindow;
        return scrolledWindow.get_child() as Gtk.GridView;
    };

    return (
        <PopupSelectorWindow
            name="theme-selector-popup"
            index={index}
            monitor={monitor}
            title="Theme Selection"
            searchPlaceholder="Search themes..."
            onSearchChange={controller.handleSearchChange}
            getActiveGridView={getActiveGridView}
        >
            {libraryThemeGrid as JSX.Element}
        </PopupSelectorWindow>
    );
}
