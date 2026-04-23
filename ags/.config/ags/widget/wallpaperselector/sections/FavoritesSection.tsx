import { createState, onCleanup } from "ags";
import { Gtk } from "ags/gtk4";
import wallpaperService from "services/wallpaper/Wallpaper";
import wallpaperEngine from "services/wallpaper/WallpaperEngine";
import type { GridItem } from "../WallpaperGridView.js";
import WallpaperGridView from "../WallpaperGridView.js";
import SectionHeader from "./SectionHeader";

export default function FavoritesSection() {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        vexpand: true,
        hexpand: true,
        css_classes: ["wallpaper-selector-main"],
    });

    box.append(
        SectionHeader({
            title: "Favorites",
            subtitle: "Your saved wallpapers",
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

    const removeBtn = new Gtk.Button({ label: "Remove" });
    removeBtn.add_css_class("wallpaper-header-button");
    actions.append(removeBtn);

    box.append(actions);

    const status = new Gtk.Label({ label: "" });
    status.add_css_class("wallpaper-main-subtitle");
    status.set_halign(Gtk.Align.START);
    box.append(status);

    const rebuildItems = () => {
        const list = wallpaperEngine.state.favorites;
        const current = wallpaperService.getCurrentWallpaper();
        setItems(
            list.map((path) => ({
                id: path,
                previewPath: path,
                label: path.split("/").pop() || path,
                isActive: path === current,
            })),
        );
        status.set_label(`${list.length} favorites`);

        const currentSelected = selected.get();
        if (!currentSelected || !list.includes(currentSelected)) {
            setSelected(list[0] || "");
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

    const updateActionState = () => {
        const hasSelected = Boolean(selected.get());
        applyBtn.set_sensitive(hasSelected);
        removeBtn.set_sensitive(hasSelected);
    };

    applyBtn.connect("clicked", () => {
        const path = selected.get();
        if (!path) return;
        void wallpaperService.setWallpaper(path);
    });

    removeBtn.connect("clicked", () => {
        const path = selected.get();
        if (!path) return;
        wallpaperEngine.removeFavorite(path);
    });

    refreshBtn.connect("clicked", () => {
        rebuildItems();
    });

    const unsubSelected = selected.subscribe(updateActionState);
    onCleanup(unsubSelected);

    updateActionState();
    rebuildItems();

    return box;
}
