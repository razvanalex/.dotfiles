import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"
import { loadConfig } from "services/wallpaper/utils/wallpaper"
import { PATHS } from "lib/constants"
import GLib from "gi://GLib"
import type { NavSection } from "./types"
import SidebarNav from "./SidebarNav"
import LibrarySection from "./sections/LibrarySection"
import SettingsSection from "./sections/SettingsSection"
import FavoritesSection from "./sections/FavoritesSection"
import RecentSection from "./sections/RecentSection"
import AboutSection from "./sections/AboutSection"

export default function WallpaperSelector(monitor: Gdk.Monitor, index: number) {
    const configPath = PATHS.wallpaperConfig
    const config = loadConfig(configPath)
    const wallpaperDir = config.wallpaperDir

    const [navSection, setNavSection] = createState<NavSection>("library")

    const [discoveryRefreshSignal, setDiscoveryRefreshSignal] = createState(0)

    const handleNavChange = (section: NavSection) => {
        setNavSection(section)
    }

    // Create a regular GTK window (movable, resizable)
    const windowName = `wallpaper-selector${index}`
    const win = new Gtk.Window({
        application: app,
        title: "Wallpaper Selector",
        default_width: 1000,
        default_height: 700,
        hide_on_close: true,
    })
    win.set_name(windowName)
    win.add_css_class("wallpaper-selector-window")
    win.set_visible(false)

    // Minimum size: sidebar (220) + separator (1) + one wallpaper column (~320)
    win.set_size_request(540, 400)

    // Escape to close
    const controller = new Gtk.EventControllerKey()
    controller.connect("key-pressed", (_, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
            win.set_visible(false)
            return true
        }
        return false
    })
    win.add_controller(controller)

    // --- Shell: horizontal layout ---
    const shell = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        css_classes: ["wallpaper-selector-shell"],
    })

    const sidebar = SidebarNav({
        activeSection: navSection,
        onSectionChange: handleNavChange,
    })
    shell.append(sidebar)

    // --- Vertical separator ---
    const sep = new Gtk.Separator({
        orientation: Gtk.Orientation.VERTICAL,
    })
    sep.add_css_class("wallpaper-main-separator")
    shell.append(sep)

    const mainArea = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
        vexpand: true,
        css_classes: ["wallpaper-selector-main-area"],
    })

    const librarySection = LibrarySection({
        wallpaperDir,
        refreshSignal: discoveryRefreshSignal,
    })

    const settingsSection = SettingsSection({
        onDiscoveryChanged: () => {
            setDiscoveryRefreshSignal(discoveryRefreshSignal.get() + 1)
        },
    })

    const favoritesSection = FavoritesSection()
    const recentSection = RecentSection()
    const aboutSection = AboutSection()

    mainArea.append(librarySection)
    mainArea.append(favoritesSection)
    mainArea.append(recentSection)
    mainArea.append(settingsSection)
    mainArea.append(aboutSection)

    const updateMainContentVisibility = () => {
        const section = navSection.get()

        librarySection.set_visible(section === "library")
        favoritesSection.set_visible(section === "favorites")
        recentSection.set_visible(section === "recent")
        settingsSection.set_visible(section === "settings")
        aboutSection.set_visible(section === "about")
    }

    navSection.subscribe(updateMainContentVisibility)
    updateMainContentVisibility()

    shell.append(mainArea)
    win.set_child(shell)

    return win
}
