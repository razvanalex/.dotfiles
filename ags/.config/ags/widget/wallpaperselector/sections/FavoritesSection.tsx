import { Gtk } from "ags/gtk4"
import SectionHeader from "./SectionHeader"

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
            subtitle: "Pinned wallpapers",
        }),
    )

    const body = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        vexpand: true,
        hexpand: true,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        spacing: 8,
        css_classes: ["wallpaper-placeholder-view"],
    })

    const subtitle = new Gtk.Label({
        label: "Pinned wallpapers will appear here.",
    })
    subtitle.add_css_class("wallpaper-placeholder-subtitle")
    body.append(subtitle)

    box.append(body)

    return box
}
