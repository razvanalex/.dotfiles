import { createState } from "ags";
import { Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import { createLibraryDataController } from "./sections/library/controller";
import WallpaperGridView from "./WallpaperGridView";

export default function WallpaperSelectorPopup(
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

    const windowName = `wallpaper-selector-popup${index}`;
    const win = new Gtk.Window({
        application: app,
        title: "Wallpaper Selection",
        default_width: 800,
        default_height: 500,
        hide_on_close: true,
        modal: true,
    });
    win.set_name(windowName);
    win.add_css_class("wallpaper-selector-popup-window");
    win.set_visible(false);

    // Grid View
    const stack = new Gtk.Stack({
        transition_type: Gtk.StackTransitionType.CROSSFADE,
        transition_duration: 200,
        hexpand: true,
        vexpand: true,
    });

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
            win.set_visible(false);
        },
        previewLookup: controller.wallpaperPreviewThumbs,
        onVisibleRangeChange: controller.ensureWallpaperPreviewRange,
    });

    stack.add_named(libraryThemeGrid as Gtk.Widget, "themes");
    stack.add_named(wallpaperGrid as Gtk.Widget, "wallpapers");

    const rootBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["wallpaper-selector-popup-root"],
        spacing: 12,
    });

    // Search Bar on Top
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: "Search wallpapers...",
        hexpand: true,
    });
    searchEntry.add_css_class("selector-popup-search-entry");
    searchEntry.connect("search-changed", () => {
        controller.handleSearchChange(searchEntry.get_text());
    });

    // Handle navigation keys from search entry to grid
    const entryKeyController = new Gtk.EventControllerKey();
    entryKeyController.connect("key-pressed", (_, keyval, _keycode, state) => {
        const mode = controller.libraryView.get();
        const activeGrid = (mode === "themes" ? libraryThemeGrid : wallpaperGrid) as Gtk.Widget;
        
        // Find the GridView inside the scrolled window
        const scrolledWindow = activeGrid as Gtk.ScrolledWindow;
        const gridView = scrolledWindow.get_child() as Gtk.GridView;

        if (keyval === Gdk.KEY_Escape) {
            win.set_visible(false);
            return true;
        }

        if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
            // Activate current selection
            const selection = gridView.get_model() as Gtk.SingleSelection;
            const pos = selection.get_selected();
            if (pos !== Gtk.INVALID_LIST_POSITION) {
                gridView.emit("activate", pos);
            }
            return true;
        }

        if ([Gdk.KEY_Up, Gdk.KEY_Down, Gdk.KEY_Left, Gdk.KEY_Right].includes(keyval)) {
            // Forward arrow keys to GridView
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

    rootBox.append(stack);
    win.set_child(rootBox);

    return win;
}
