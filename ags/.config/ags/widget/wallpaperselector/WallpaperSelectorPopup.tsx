import GLib from "gi://GLib";
import { createState, onCleanup } from "ags";
import { Astal, type Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import PopupSelectorWindow from "./PopupSelectorWindow";
import { createLibraryDataController } from "./sections/library/controller";
import WallpaperGridView from "./WallpaperGridView";

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

    let themeGridRef: Gtk.GridView | null = null;
    let imageGridRef: Gtk.GridView | null = null;

    const getActiveGridView = () => {
        const lv = controller.libraryView as any;
        let mode = "themes";
        try {
            if (lv && typeof lv.get === "function") mode = lv.get();
            else if (typeof lv === "function") mode = lv();
        } catch (e) {
            console.error("Error getting libraryView mode:", e);
        }

        if (mode === "themes") return themeGridRef;
        return imageGridRef;
    };

    const placeholder = controller.libraryView.as((v) =>
        v === "themes" ? "Search themes..." : "Search wallpapers...",
    );

    const navHeader = (
        <box
            orientation={Gtk.Orientation.HORIZONTAL}
            spacing={8}
            visible={controller.libraryView.as((v) => v === "wallpapers")}
            margin_bottom={4}
        >
            <button
                class="wallpaper-breadcrumb-btn"
                label="‹ Back to Themes"
                onClicked={() => controller.handleBackToThemes()}
            />
            <label
                class="wallpaper-breadcrumb-current"
                label={controller.browsingTheme.as((t) => t)}
            />
        </box>
    ) as JSX.Element;

    const themesView = (
        <box $type="named" name="themes">
            <WallpaperGridView
                items={controller.themeItems}
                onActivate={(theme) => void controller.handleThemeChange(theme)}
                onVisibleRangeChange={controller.ensureThemePreviewRange}
                $={(grid) => {
                    themeGridRef = (
                        grid as Gtk.ScrolledWindow
                    ).get_child() as Gtk.GridView;
                }}
            />
        </box>
    );

    const wallpapersView = (
        <box $type="named" name="wallpapers">
            <WallpaperGridView
                items={controller.imageItems}
                onSelect={(path) => controller.handleSelectImage(path)}
                onActivate={(path) => {
                    void controller.handleActivateImage(path);
                    app.get_window(windowName)?.set_visible(false);
                }}
                previewLookup={controller.wallpaperPreviewThumbs}
                onVisibleRangeChange={controller.ensureWallpaperPreviewRange}
                $={(grid) => {
                    imageGridRef = (
                        grid as Gtk.ScrolledWindow
                    ).get_child() as Gtk.GridView;
                }}
            />
        </box>
    );

    return (
        <PopupSelectorWindow
            name="wallpaper-selector-popup"
            index={index}
            monitor={monitor}
            title="Wallpaper Selection"
            searchPlaceholder={placeholder}
            onSearchChange={controller.handleSearchChange}
            getActiveGridView={getActiveGridView as any}
            onShow={() => {
                // Delay showing current wallpapers to ensure stack is fully initialized
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    void controller.showCurrentThemeWallpapers();
                    return GLib.SOURCE_REMOVE;
                });
            }}
            navHeader={navHeader}
        >
            <stack
                hexpand
                vexpand
                transitionType={Gtk.StackTransitionType.CROSSFADE}
                transitionDuration={200}
                visibleChildName={controller.libraryView}
            >
                {themesView}
                {wallpapersView}
            </stack>
        </PopupSelectorWindow>
    );
}
