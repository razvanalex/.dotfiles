import { Gdk, Gtk } from "ags/gtk4";
import WallpaperGridView from "../../WallpaperGridView.js";
import type { LibraryDataController } from "./controller";
import { onCleanup } from "ags";

export function createLibraryUi(controller: LibraryDataController): Gtk.Widget {
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: "Search...",
        hexpand: true,
    });
    searchEntry.add_css_class("wallpaper-search-entry");
    searchEntry.connect("search-changed", () => {
        controller.handleSearchChange(searchEntry.get_text());
    });

    const root = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
        vexpand: true,
        css_classes: ["wallpaper-selector-main"],
    });

    // Action Bar
    const actionBar = (
        <box 
            orientation={Gtk.Orientation.HORIZONTAL} 
            spacing={8} 
            class="wallpaper-library-actionbar"
            visible={controller.libraryView.as(m => m === "wallpapers")}
            margin_bottom={12}
        >
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4} hexpand valign={Gtk.Align.CENTER}>
                <button class="wallpaper-breadcrumb-btn" label="Library" onClicked={() => controller.handleBackToThemes()} />
                <label class="wallpaper-breadcrumb-sep" label="›" />
                <label 
                    class="wallpaper-breadcrumb-current" 
                    label={controller.browsingTheme.as(t => t || "Wallpapers")} 
                />
            </box>

            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={8}>
                <button class="wallpaper-header-button" label="Random" onClicked={() => void controller.handleRandomInTheme()} />
                <button 
                    class="wallpaper-header-button" 
                    label={controller.selectedIsFavorite.as(fav => fav ? "Unfavorite" : "Favorite")} 
                    onClicked={() => void controller.toggleSelectedFavorite()} 
                    sensitive={controller.selectedWallpaper.as(s => Boolean(s))}
                />
                <button 
                    class="wallpaper-header-button is-primary" 
                    label="Apply" 
                    onClicked={() => {
                        const selected = controller.selectedWallpaper.get();
                        if (selected) void controller.handleActivateImage(selected);
                    }} 
                    sensitive={controller.selectedWallpaper.as(s => Boolean(s))}
                />
            </box>
        </box>
    ) as Gtk.Box;
    root.append(actionBar);

    // Search Bar
    const searchContainer = (
        <box 
            orientation={Gtk.Orientation.HORIZONTAL} 
            spacing={0} 
            class="wallpaper-search-container"
            visible={controller.isSearchVisible.as(v => v)}
        >
            {searchEntry}
        </box>
    ) as Gtk.Box;
    root.append(searchContainer);

    // Stack
    const stack = (
        <stack 
            transitionType={Gtk.StackTransitionType.SLIDE_LEFT_RIGHT} 
            transitionDuration={300}
            hexpand vexpand
            visibleChildName={controller.libraryView.as(v => v)}
        >
            <box $type="named" name="themes">
                <WallpaperGridView 
                    items={controller.themeItems} 
                    onActivate={(theme) => void controller.handleThemeChange(theme)}
                    onVisibleRangeChange={controller.ensureThemePreviewRange}
                />
            </box>
            <box $type="named" name="wallpapers">
                <WallpaperGridView 
                    items={controller.imageItems} 
                    onSelect={(path) => controller.handleSelectImage(path)}
                    onActivate={(path) => void controller.handleActivateImage(path)}
                    previewLookup={controller.wallpaperPreviewThumbs}
                    onVisibleRangeChange={controller.ensureWallpaperPreviewRange}
                />
            </box>
            <box $type="named" name="ai-results" orientation={Gtk.Orientation.VERTICAL} spacing={12} valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER}>
                <image iconName="face-smile-symbolic" pixelSize={64} class="wallpaper-thumbnail-error" />
                <label class="wallpaper-placeholder-title" label="✨ AI is curating wallpapers for you..." />
            </box>
        </stack>
    ) as Gtk.Stack;
    root.append(stack);

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
    onCleanup(() => root.remove_controller(controllerKey));

    return root;
}
