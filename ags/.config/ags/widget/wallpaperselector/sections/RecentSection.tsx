import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync } from "ags/process"
import SectionHeader from "./SectionHeader"
import WallpaperGridView from "../WallpaperGridView.js"
import wallpaperService from "../../../services/Wallpaper"
import type { GridItem } from "../WallpaperGridView.js"

export default function RecentSection() {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        vexpand: true,
        hexpand: true,
        css_classes: ["wallpaper-selector-main"],
    })

    box.append(
        SectionHeader({
            title: "Recent",
            subtitle: "Recently applied wallpapers",
        }),
    )

    const [recent, setRecent] = createState<string[]>([])
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

    box.append(actions)

    const status = new Gtk.Label({ label: "" })
    status.add_css_class("wallpaper-main-subtitle")
    status.set_halign(Gtk.Align.START)
    box.append(status)

    const reloadRecent = async () => {
        try {
            const raw = await execAsync([
                "ags",
                "request",
                "wallpaper",
                "engine",
                "recent",
                "list",
            ])
            const parsed = JSON.parse(raw) as unknown
            const next = Array.isArray(parsed)
                ? parsed.filter((item): item is string => typeof item === "string")
                : []
            setRecent(next)
            const current = selected.get()
            setSelected(current && next.includes(current) ? current : next[0] || "")
            status.set_label(`${next.length} recent`)
        } catch (error) {
            status.set_label(`Failed to load recent: ${error}`)
        }
    }

    const rebuildItems = () => {
        const list = recent.get()
        const current = wallpaperService.getCurrentWallpaper()
        setItems(
            list.map((path) => ({
                id: path,
                previewPath: path,
                label: path.split("/").pop() || path,
                isActive: path === selected.get() || path === current,
            })),
        )
    }

    recent.subscribe(rebuildItems)
    selected.subscribe(rebuildItems)

    const grid = WallpaperGridView({
        items,
        onSelect: (id) => setSelected(id),
        onActivate: (id) => {
            void wallpaperService.setWallpaper(id)
        },
    })
    box.append(grid as Gtk.Widget)

    applyBtn.connect("clicked", () => {
        const path = selected.get()
        if (!path) return
        void wallpaperService.setWallpaper(path)
    })

    refreshBtn.connect("clicked", () => {
        void reloadRecent()
    })

    const updateActions = () => {
        applyBtn.set_sensitive(Boolean(selected.get()))
    }
    selected.subscribe(updateActions)
    updateActions()

    setTimeout(() => {
        void reloadRecent()
    }, 0)

    return box
}
