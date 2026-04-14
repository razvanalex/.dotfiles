import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync } from "ags/process"
import SectionHeader from "./SectionHeader"
import WallpaperGridView from "../WallpaperGridView.js"
import wallpaperService from "services/wallpaper/Wallpaper"
import type { GridItem } from "../WallpaperGridView.js"

export default function FavoritesSection() {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        vexpand: true,
        hexpand: true,
        css_classes: ["wallpaper-selector-main"],
    })

    box.append(
        SectionHeader({
            title: "Favorites",
            subtitle: "Your saved wallpapers",
        }),
    )

    const [favorites, setFavorites] = createState<string[]>([])
    const [selected, setSelected] = createState("")
    const [items, setItems] = createState<GridItem[]>([])

    const actions = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-main-actions"],
    })

    const refreshBtn = new Gtk.Button({ label: "Refresh" })
    refreshBtn.add_css_class("wallpaper-header-button")
    actions.append(refreshBtn)

    const applyBtn = new Gtk.Button({ label: "Apply" })
    applyBtn.add_css_class("wallpaper-header-button")
    applyBtn.add_css_class("is-primary")
    actions.append(applyBtn)

    const removeBtn = new Gtk.Button({ label: "Remove" })
    removeBtn.add_css_class("wallpaper-header-button")
    actions.append(removeBtn)

    box.append(actions)

    const status = new Gtk.Label({ label: "" })
    status.add_css_class("wallpaper-main-subtitle")
    status.set_halign(Gtk.Align.START)
    box.append(status)

    const reloadFavorites = async () => {
        try {
            const raw = await execAsync([
                "ags",
                "request",
                "wallpaper",
                "favorite",
                "list",
            ])
            const parsed = JSON.parse(raw) as unknown
            const next = Array.isArray(parsed)
                ? parsed.filter((item): item is string => typeof item === "string")
                : []
            setFavorites(next)
            const current = selected.get()
            setSelected(current && next.includes(current) ? current : next[0] || "")
            status.set_label(`${next.length} favorites`)
        } catch (error) {
            status.set_label(`Failed to load favorites: ${error}`)
        }
    }

    favorites.subscribe(() => {
        const list = favorites.get()
        const current = wallpaperService.getCurrentWallpaper()
        setItems(
            list.map((path) => ({
                id: path,
                previewPath: path,
                label: path.split("/").pop() || path,
                isActive: path === selected.get() || path === current,
            })),
        )
    })
    selected.subscribe(() => {
        const list = favorites.get()
        const current = wallpaperService.getCurrentWallpaper()
        setItems(
            list.map((path) => ({
                id: path,
                previewPath: path,
                label: path.split("/").pop() || path,
                isActive: path === selected.get() || path === current,
            })),
        )
    })

    const grid = WallpaperGridView({
        items,
        onSelect: (id) => setSelected(id),
        onActivate: (id) => {
            void wallpaperService.setWallpaper(id)
        },
    })
    box.append(grid as Gtk.Widget)

    const updateActionState = () => {
        const hasSelected = Boolean(selected.get())
        applyBtn.set_sensitive(hasSelected)
        removeBtn.set_sensitive(hasSelected)
    }

    applyBtn.connect("clicked", () => {
        const path = selected.get()
        if (!path) return
        void wallpaperService.setWallpaper(path)
    })

    removeBtn.connect("clicked", () => {
        const path = selected.get()
        if (!path) return
        void execAsync(["ags", "request", "wallpaper", "favorite", "remove", path])
            .then(() => reloadFavorites())
    })

    refreshBtn.connect("clicked", () => {
        void reloadFavorites()
    })

    selected.subscribe(updateActionState)
    updateActionState()

    setTimeout(() => {
        void reloadFavorites()
    }, 0)

    return box
}
