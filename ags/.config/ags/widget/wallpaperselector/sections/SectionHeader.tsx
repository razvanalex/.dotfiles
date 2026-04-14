import { Gtk } from "ags/gtk4";

interface SectionHeaderProps {
    title: string;
    subtitle: string;
}

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
    const header = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 2,
        css_classes: ["wallpaper-main-header"],
    });

    const sectionTitle = new Gtk.Label({ label: title });
    sectionTitle.add_css_class("wallpaper-selector-title");
    sectionTitle.set_halign(Gtk.Align.START);
    header.append(sectionTitle);

    const sectionSubtitle = new Gtk.Label({ label: subtitle });
    sectionSubtitle.add_css_class("wallpaper-main-subtitle");
    sectionSubtitle.set_halign(Gtk.Align.START);
    header.append(sectionSubtitle);

    return header;
}
