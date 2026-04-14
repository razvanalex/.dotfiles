import type { Accessor } from "ags";
import { Gtk } from "ags/gtk4";
import type { NavSection } from "./types";

interface SidebarNavProps {
    activeSection: Accessor<NavSection>;
    onSectionChange: (section: NavSection) => void;
}

export default function SidebarNav({
    activeSection,
    onSectionChange,
}: SidebarNavProps) {
    const sidebar = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        vexpand: true,
        css_classes: ["wallpaper-selector-sidebar"],
    });
    sidebar.set_size_request(220, -1);
    sidebar.set_hexpand(false);

    const listBox = new Gtk.ListBox({
        css_classes: ["wallpaper-sidebar-list"],
        selection_mode: Gtk.SelectionMode.SINGLE,
    });

    const navItems: { section: NavSection; label: string; icon: string }[] = [
        { section: "library", label: "Library", icon: "view-grid-symbolic" },
        {
            section: "favorites",
            label: "Favorites",
            icon: "emblem-favorite-symbolic",
        },
        {
            section: "recent",
            label: "Recent",
            icon: "document-open-recent-symbolic",
        },
        {
            section: "settings",
            label: "Settings",
            icon: "emblem-system-symbolic",
        },
        {
            section: "about",
            label: "About",
            icon: "dialog-information-symbolic",
        },
    ];

    const rows: Record<string, Gtk.ListBoxRow> = {};

    navItems.forEach(({ section, label, icon }) => {
        const row = new Gtk.ListBoxRow({
            css_classes: ["wallpaper-sidebar-row"],
        });
        rows[section] = row;

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            css_classes: ["wallpaper-sidebar-item"],
        });

        const iconLabel = new Gtk.Image({ icon_name: icon });
        box.append(iconLabel);

        const textLabel = new Gtk.Label({ label, xalign: 0 });
        box.append(textLabel);

        row.set_child(box);
        listBox.append(row);
    });

    listBox.connect("row-activated", (_, row) => {
        const index = row.get_index();
        if (index >= 0 && index < navItems.length) {
            onSectionChange(navItems[index].section);
        }
    });

    const updateSelection = () => {
        const active = activeSection.get();
        const row = rows[active];
        if (row) {
            listBox.select_row(row);
        }
    };

    activeSection.subscribe(updateSelection);
    updateSelection();

    sidebar.append(listBox);

    return sidebar;
}
