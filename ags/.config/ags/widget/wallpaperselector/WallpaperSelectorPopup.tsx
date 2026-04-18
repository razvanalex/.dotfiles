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

export default function WallpaperSelectorPopup(
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

    const windowName = `wallpaper-selector-popup${index}`;

    // Grid View
    const libraryThemeGrid = WallpaperGridView({
        items: controller.themeItems,
        onActivate: (theme) => {
            void controller.handleThemeChange(theme);
        },
        onVisibleRangeChange: controller.ensureThemePreviewRange,
    });

    const wallpaperGrid = WallpaperGridView({
        items: controller.imageItems,
        onSelect: (path) => {
            controller.handleSelectImage(path);
        },
        onActivate: (path) => {
            void controller.handleActivateImage(path);
            app.get_window(windowName)?.set_visible(false);
        },
        previewLookup: controller.wallpaperPreviewThumbs,
        onVisibleRangeChange: controller.ensureWallpaperPreviewRange,
    });

    const stack = new Gtk.Stack({
        transition_type: Gtk.StackTransitionType.CROSSFADE,
        transition_duration: 200,
        hexpand: true,
        vexpand: true,
    });
    stack.add_named(libraryThemeGrid as Gtk.Widget, "themes");
    stack.add_named(wallpaperGrid as Gtk.Widget, "wallpapers");

    const getActiveGridView = () => {
        const mode = controller.libraryView.get();
        const activeGrid = (
            mode === "themes" ? libraryThemeGrid : wallpaperGrid
        ) as Gtk.ScrolledWindow;
        return activeGrid.get_child() as Gtk.GridView;
    };

    const updateState = () => {
        const mode = controller.libraryView.get();
        if (mode === "themes") {
            stack.set_visible_child_name("themes");
        } else {
            stack.set_visible_child_name("wallpapers");
        }
    };

    controller.libraryView.subscribe(updateState);
    updateState();

    return (
        <PopupSelectorWindow
            name="wallpaper-selector-popup"
            index={index}
            monitor={monitor}
            title="Wallpaper Selection"
            searchPlaceholder="Search wallpapers..."
            onSearchChange={controller.handleSearchChange}
            getActiveGridView={getActiveGridView}
            onShow={() => { void controller.showCurrentThemeWallpapers(); }}
        >
            {stack as JSX.Element}
        </PopupSelectorWindow>
    );
}
