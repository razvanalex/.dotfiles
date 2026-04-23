import { createState, onCleanup } from "ags";
import { Gtk } from "ags/gtk4";
import wallpaperService from "services/wallpaper/Wallpaper";
import wallpaperEngine from "services/wallpaper/WallpaperEngine";
import type { GridItem } from "../WallpaperGridView.js";
import WallpaperGridView from "../WallpaperGridView.js";
import SectionHeader from "./SectionHeader";

export default function RecentSection() {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        vexpand: true,
        hexpand: true,
        css_classes: ["wallpaper-selector-main"],
    });

    box.append(
        SectionHeader({
            title: "Recent",
            subtitle: "Recently applied wallpapers",
        }),
    );

    const [selected, setSelected] = createState("");
    const [items, setItems] = createState<GridItem[]>([]);

    const actions = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-main-actions"],
    });

    const refreshBtn = new Gtk.Button({ label: "Refresh" });
    refreshBtn.add_css_class("wallpaper-header-button");
    actions.append(refreshBtn);

    const applyBtn = new Gtk.Button({ label: "Apply" });
    applyBtn.add_css_class("wallpaper-header-button");
    applyBtn.add_css_class("is-primary");
    actions.append(applyBtn);

    box.append(actions);

    const status = new Gtk.Label({ label: "" });
    status.add_css_class("wallpaper-main-subtitle");
    status.set_halign(Gtk.Align.START);
    box.append(status);

    const rebuildItems = () => {
        const history = [...wallpaperEngine.state.history].reverse();
        const current = wallpaperService.getCurrentWallpaper();
        setItems(
            history.map((path) => ({
                id: path,
                previewPath: path,
                label: path.split("/").pop() || path,
                isActive: path === current,
            })),
        );
        status.set_label(`${history.length} recent`);

        const currentSelected = selected.get();
        if (!currentSelected || !history.includes(currentSelected)) {
            setSelected(history[0] || "");
        }
    };

    const s1 = wallpaperEngine.connect("changed", rebuildItems);
    const s2 = wallpaperService.connect("wallpaper-changed", rebuildItems);

    onCleanup(() => {
        wallpaperEngine.disconnect(s1);
        wallpaperService.disconnect(s2);
    });

    const grid = WallpaperGridView({
        items,
        onSelect: (id) => setSelected(id),
        onActivate: (id) => {
            void wallpaperService.setWallpaper(id);
        },
    });
    box.append(grid as Gtk.Widget);

    applyBtn.connect("clicked", () => {
        const path = selected.get();
        if (!path) return;
        void wallpaperService.setWallpaper(path);
    });

    refreshBtn.connect("clicked", () => {
        rebuildItems();
    });

    const unsubSelected = selected.subscribe(() => {
        applyBtn.set_sensitive(Boolean(selected.get()));
    });
    onCleanup(unsubSelected);

    applyBtn.set_sensitive(Boolean(selected.get()));
    rebuildItems();

    box.connect("map", () => {
        rebuildItems();
    });

    return box;
}
