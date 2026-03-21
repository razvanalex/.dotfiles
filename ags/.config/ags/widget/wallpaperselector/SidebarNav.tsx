import { Gtk } from "ags/gtk4"
import type { Accessor } from "ags"
import type { NavSection } from "./types"

interface SidebarNavProps {
    activeSection: Accessor<NavSection>
    onSectionChange: (section: NavSection) => void
}

export default function SidebarNav({
    activeSection,
    onSectionChange,
}: SidebarNavProps) {
    const sidebar = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 14,
        vexpand: true,
        css_classes: ["wallpaper-selector-sidebar"],
    })
    sidebar.set_size_request(220, -1)
    sidebar.set_hexpand(false)

    const navBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        css_classes: ["wallpaper-sidebar-nav"],
    })

    const menuLabel = new Gtk.Label({ label: "Library" })
    menuLabel.add_css_class("wallpaper-theme-label")
    menuLabel.set_halign(Gtk.Align.START)
    navBox.append(menuLabel)

    const navButtons: Record<NavSection, Gtk.Button> = {
        library: new Gtk.Button(),
        favorites: new Gtk.Button(),
        recent: new Gtk.Button(),
        settings: new Gtk.Button(),
        about: new Gtk.Button(),
    }

    const createNavButton = (label: string, section: NavSection) => {
        const button = navButtons[section]
        button.add_css_class("wallpaper-sidebar-nav-item")
        const buttonLabel = new Gtk.Label({ label, xalign: 0 })
        button.set_child(buttonLabel)
        button.connect("clicked", () => onSectionChange(section))
        navBox.append(button)
    }

    createNavButton("Library", "library")
    createNavButton("Favorites", "favorites")
    createNavButton("Recent", "recent")
    createNavButton("Settings", "settings")
    createNavButton("About", "about")

    const updateNavActiveState = () => {
        const active = activeSection.get()
        Object.entries(navButtons).forEach(([section, button]) => {
            if (section === active) button.add_css_class("active")
            else button.remove_css_class("active")
        })
    }

    activeSection.subscribe(updateNavActiveState)
    updateNavActiveState()

    sidebar.append(navBox)

    const sidebarSep = new Gtk.Box()
    sidebarSep.add_css_class("wallpaper-sidebar-separator")
    sidebar.append(sidebarSep)

    return sidebar
}
