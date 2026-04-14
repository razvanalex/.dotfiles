import { Gdk, Gtk } from "ags/gtk4";
import WallpaperGridView from "../../WallpaperGridView.js";
import type { LibraryDataController } from "./controller";

export function createLibraryUi(controller: LibraryDataController): Gtk.Widget {
    const root = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
        vexpand: true,
        css_classes: ["wallpaper-selector-main"],
    });

    // --- Action Bar (Breadcrumbs & Tools) ---
    const actionBar = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-library-actionbar"],
    });
    actionBar.set_margin_bottom(12);

    const breadcrumbBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 4,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });

    const breadcrumbLibrary = new Gtk.Button({ label: "Library" });
    breadcrumbLibrary.add_css_class("wallpaper-breadcrumb-btn");
    breadcrumbLibrary.connect("clicked", controller.handleBackToThemes);
    breadcrumbBox.append(breadcrumbLibrary);

    const breadcrumbSeparator = new Gtk.Label({ label: "›" });
    breadcrumbSeparator.add_css_class("wallpaper-breadcrumb-sep");
    breadcrumbBox.append(breadcrumbSeparator);

    const breadcrumbTheme = new Gtk.Label({ label: "" });
    breadcrumbTheme.add_css_class("wallpaper-breadcrumb-current");
    breadcrumbBox.append(breadcrumbTheme);

    actionBar.append(breadcrumbBox);

    const headerActions = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
    });

    const randomBtn = new Gtk.Button({ label: "Random" });
    randomBtn.add_css_class("wallpaper-header-button");
    randomBtn.connect("clicked", () => {
        void controller.handleRandomInTheme();
    });
    headerActions.append(randomBtn);

    const favoriteBtn = new Gtk.Button({
        label: controller.selectedIsFavorite.get() ? "Unfavorite" : "Favorite",
    });
    favoriteBtn.add_css_class("wallpaper-header-button");
    favoriteBtn.connect("clicked", () => {
        void controller.toggleSelectedFavorite();
    });
    headerActions.append(favoriteBtn);

    const applyBtn = new Gtk.Button({ label: "Apply" });
    applyBtn.add_css_class("wallpaper-header-button");
    applyBtn.add_css_class("is-primary");
    applyBtn.connect("clicked", () => {
        const selected = controller.selectedWallpaper.get();
        if (selected) void controller.handleActivateImage(selected);
    });
    headerActions.append(applyBtn);

    actionBar.append(headerActions);
    root.append(actionBar);

    // --- Search Bar ---
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: "Search...",
        hexpand: true,
    });
    searchEntry.add_css_class("wallpaper-search-entry");
    searchEntry.connect("search-changed", () => {
        controller.handleSearchChange(searchEntry.get_text());
    });

    const searchContainer = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 0,
        css_classes: ["wallpaper-search-container"],
    });
    searchContainer.append(searchEntry);
    root.append(searchContainer);

    // --- Stack for Master/Detail ---
    const stack = new Gtk.Stack({
        transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
        transition_duration: 300,
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
        },
        previewLookup: controller.wallpaperPreviewThumbs,
        onVisibleRangeChange: controller.ensureWallpaperPreviewRange,
    });

    // --- AI Results Mock View ---
    const aiResultsBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        hexpand: true,
        vexpand: true,
    });
    const aiIcon = new Gtk.Image({
        icon_name: "face-smile-symbolic",
        pixel_size: 64,
    });
    aiIcon.add_css_class("wallpaper-thumbnail-error");
    const aiLabel = new Gtk.Label({
        label: "✨ AI is curating wallpapers for you...",
    });
    aiLabel.add_css_class("wallpaper-placeholder-title");
    aiResultsBox.append(aiIcon);
    aiResultsBox.append(aiLabel);

    stack.add_named(libraryThemeGrid as Gtk.Widget, "themes");
    stack.add_named(wallpaperGrid as Gtk.Widget, "wallpapers");
    stack.add_named(aiResultsBox, "ai-results");

    root.append(stack);

    // Let's hook into the global search query to trigger the AI view
    const updateState = () => {
        const mode = controller.libraryView.get();
        const showWallpaperActions = mode === "wallpapers";

        actionBar.set_visible(showWallpaperActions);
        searchContainer.set_visible(controller.isSearchVisible.get());

        const currentQuery = ""; // Search query state is now internal, and not used for AI view here
        if (false) {
            // AI view removed
            stack.set_visible_child_name("ai-results");
            actionBar.set_visible(false);
        } else if (mode === "themes") {
            stack.set_visible_child_name("themes");
        } else {
            stack.set_visible_child_name("wallpapers");
            breadcrumbTheme.set_label(
                controller.browsingTheme.get() || "Wallpapers",
            );
        }

        const selected = controller.selectedWallpaper.get();
        applyBtn.set_sensitive(Boolean(selected));
        favoriteBtn.set_sensitive(Boolean(selected));
        favoriteBtn.set_label(
            controller.selectedIsFavorite.get() ? "Unfavorite" : "Favorite",
        );
    };

    controller.libraryView.subscribe(updateState);
    controller.selectedWallpaper.subscribe(updateState);
    controller.selectedIsFavorite.subscribe(updateState);
    controller.browsingTheme.subscribe(updateState);
    controller.isSearchVisible.subscribe(updateState);
    updateState();

    const controllerKey = new Gtk.EventControllerKey();
    controllerKey.connect("key-pressed", (_, keyval) => {
        if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
            if (controller.libraryView.get() !== "wallpapers") return false;
            const selected = controller.selectedWallpaper.get();
            if (selected) {
                void controller.handleActivateImage(selected);
                return true;
            }
        }
        return false;
    });
    root.add_controller(controllerKey);

    return root;
}
