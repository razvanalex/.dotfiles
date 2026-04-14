import { createState } from "ags";
import { Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import { createLibraryDataController } from "./sections/library/controller";
import WallpaperGridView from "./WallpaperGridView";

export default function ThemeSelectorPopup(
    _monitor: Gdk.Monitor,
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
    const win = new Gtk.Window({
        application: app,
        title: "Theme Selection",
        default_width: 800,
        default_height: 500,
        hide_on_close: true,
        modal: true,
    });
    win.set_name(windowName);
    win.add_css_class("theme-selector-popup-window");
    win.set_visible(false);

    // Grid View
    const libraryThemeGrid = WallpaperGridView({
        items: controller.themeItems,
        onActivate: (theme) => {
            import("ags/process").then(({ execAsync }) => {
                execAsync(["ags", "request", "wallpaper", "set-theme", theme])
                    .catch(err => console.error(`[ThemeSelector] failed to set theme: ${err}`));
            });
            win.set_visible(false);
        },
        onVisibleRangeChange: controller.ensureThemePreviewRange,
    });

    const rootBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["theme-selector-popup-root"],
        spacing: 12,
    });

    // Search Bar on Top
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: "Search themes...",
        hexpand: true,
    });
    searchEntry.add_css_class("selector-popup-search-entry");
    searchEntry.connect("search-changed", () => {
        controller.handleSearchChange(searchEntry.get_text());
    });

    // Handle navigation keys from search entry to grid
    const entryKeyController = new Gtk.EventControllerKey();
    entryKeyController.connect("key-pressed", (_, keyval) => {
        const scrolledWindow = libraryThemeGrid as Gtk.ScrolledWindow;
        const gridView = scrolledWindow.get_child() as Gtk.GridView;

        if (keyval === Gdk.KEY_Escape) {
            win.set_visible(false);
            return true;
        }

        if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
            const selectionModel = gridView.get_model() as Gtk.SingleSelection;
            const pos = selectionModel.get_selected();
            if (pos !== Gtk.INVALID_LIST_POSITION) {
                gridView.emit("activate", pos);
            }
            return true;
        }

        if ([Gdk.KEY_Up, Gdk.KEY_Down, Gdk.KEY_Left, Gdk.KEY_Right].includes(keyval)) {
            return entryKeyController.forward(gridView);
        }

        return false;
    });
    searchEntry.add_controller(entryKeyController);

    // Escape to close at window level too
    const winKeyController = new Gtk.EventControllerKey();
    winKeyController.connect("key-pressed", (_, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
            win.set_visible(false);
            return true;
        }
        return false;
    });
    win.add_controller(winKeyController);

    // Auto focus search entry when window is shown
    win.connect("notify::visible", () => {
        if (win.get_visible()) {
            searchEntry.grab_focus();
        }
    });

    rootBox.append(searchEntry);
    rootBox.append(libraryThemeGrid as Gtk.Widget);
    win.set_child(rootBox);

    return win;
}
