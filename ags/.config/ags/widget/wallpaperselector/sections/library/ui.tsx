import { Gtk, Gdk } from "ags/gtk4"
import SearchBar from "../../SearchBar"
import WallpaperGridView from "../../WallpaperGridView.js"
import type { LibraryDataController } from "./controller"

export function createLibraryUi(controller: LibraryDataController): Gtk.Widget {
    const root = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        hexpand: true,
        vexpand: true,
        css_classes: ["wallpaper-selector-main"],
    })

    const header = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-main-header"],
    })

    const headerText = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        hexpand: true,
    })

    const title = new Gtk.Label({ label: "Library" })
    title.add_css_class("wallpaper-selector-title")
    title.set_halign(Gtk.Align.START)
    headerText.append(title)

    const subtitle = new Gtk.Label({ label: "" })
    subtitle.add_css_class("wallpaper-main-subtitle")
    subtitle.set_halign(Gtk.Align.START)
    const updateHeader = () => {
        const mode = controller.libraryView.get()

        if (mode === "themes") {
            title.set_label("Library")
            subtitle.set_label(
                `${controller.filteredThemes.get().length} themes`,
            )
            return
        }

        const theme = controller.browsingTheme.get()
        title.set_label(theme || "Wallpapers")
        subtitle.set_label(
            `${controller.filteredImages.get().length} wallpapers`,
        )
    }
    controller.filteredImages.subscribe(updateHeader)
    controller.filteredThemes.subscribe(updateHeader)
    controller.browsingTheme.subscribe(updateHeader)
    controller.libraryView.subscribe(updateHeader)
    updateHeader()
    headerText.append(subtitle)

    header.append(headerText)

    const headerActions = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-main-actions"],
    })

    const backBtn = new Gtk.Button({ label: "Back" })
    backBtn.add_css_class("wallpaper-header-button")
    backBtn.connect("clicked", controller.handleBackToThemes)
    headerActions.append(backBtn)

    const randomBtn = new Gtk.Button({ label: "Random" })
    randomBtn.add_css_class("wallpaper-header-button")
    randomBtn.connect("clicked", () => {
        void controller.handleRandomInTheme()
    })
    headerActions.append(randomBtn)

    const applyBtn = new Gtk.Button({ label: "Apply" })
    applyBtn.add_css_class("wallpaper-header-button")
    applyBtn.add_css_class("is-primary")
    applyBtn.connect("clicked", () => {
        const selected = controller.selectedWallpaper.get()
        if (selected) void controller.handleActivateImage(selected)
    })
    headerActions.append(applyBtn)

    const updateHeaderActions = () => {
        const showWallpaperActions =
            controller.libraryView.get() === "wallpapers"
        backBtn.set_visible(showWallpaperActions)
        randomBtn.set_visible(showWallpaperActions)
        applyBtn.set_visible(showWallpaperActions)

        const selected = controller.selectedWallpaper.get()
        applyBtn.set_sensitive(Boolean(selected))
    }
    controller.libraryView.subscribe(updateHeaderActions)
    controller.selectedWallpaper.subscribe(updateHeaderActions)
    updateHeaderActions()

    header.append(headerActions)
    root.append(header)

    const searchBar = SearchBar({
        onSearchChange: controller.handleSearchChange,
        placeholder: "Search...",
    })
    root.append(searchBar as Gtk.Widget)

    const libraryThemeGrid = WallpaperGridView({
        items: controller.themeItems,
        onActivate: (theme) => {
            void controller.handleThemeChange(theme)
        },
        onVisibleRangeChange: controller.ensureThemePreviewRange,
    })

    const wallpaperGrid = WallpaperGridView({
        items: controller.imageItems,
        onActivate: (path) => {
            void controller.handleActivateImage(path)
        },
        previewLookup: controller.wallpaperPreviewThumbs,
        onVisibleRangeChange: controller.ensureWallpaperPreviewRange,
    })

    root.append(libraryThemeGrid as Gtk.Widget)
    root.append(wallpaperGrid as Gtk.Widget)

    const updateMainContentVisibility = () => {
        const inThemes = controller.libraryView.get() === "themes"
        const inWallpapers = controller.libraryView.get() === "wallpapers"

        ;(searchBar as Gtk.Widget).set_visible(true)
        ;(libraryThemeGrid as Gtk.Widget).set_visible(inThemes)
        ;(wallpaperGrid as Gtk.Widget).set_visible(inWallpapers)
    }

    controller.libraryView.subscribe(updateMainContentVisibility)
    updateMainContentVisibility()

    const controllerKey = new Gtk.EventControllerKey()
    controllerKey.connect("key-pressed", (_, keyval) => {
        if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
            if (controller.libraryView.get() !== "wallpapers") return false
            const selected = controller.selectedWallpaper.get()
            if (selected) {
                void controller.handleActivateImage(selected)
                return true
            }
        }
        return false
    })
    root.add_controller(controllerKey)

    return root
}
