import { Astal, Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import {
    WALLPAPER_CARD_WIDTH,
    WALLPAPER_CARD_IMAGE_HEIGHT,
    WALLPAPER_CARD_LABEL_HEIGHT,
    GRID_COLUMN_SPACING,
    GRID_ROW_SPACING,
} from "./types";

export interface PopupSelectorWindowProps {
    name: string;
    index: number;
    monitor: Gdk.Monitor;
    title: string;
    searchPlaceholder: string;
    onSearchChange: (query: string) => void;
    getActiveGridView: () => Gtk.GridView;
    onShow?: () => void;
    children: JSX.Element;
}

export default function PopupSelectorWindow({
    name,
    index,
    monitor,
    title,
    searchPlaceholder,
    onSearchChange,
    getActiveGridView,
    onShow,
    children,
}: PopupSelectorWindowProps) {
    const windowName = `${name}${index}`;

    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: searchPlaceholder,
        hexpand: true,
    });
    searchEntry.add_css_class("selector-popup-search-entry");
    searchEntry.connect("search-changed", () => {
        onSearchChange(searchEntry.get_text());
    });

    const handleNavigation = (
        keyval: number,
        gridView: Gtk.GridView,
    ): boolean => {
        const selection = gridView.get_model() as Gtk.SingleSelection;
        const model = selection.get_model();
        if (!model) return false;

        const nItems = model.get_n_items();
        if (nItems === 0) return false;

        const selected = selection.get_selected();

        if (selected === Gtk.INVALID_LIST_POSITION) {
            if (
                [
                    Gdk.KEY_Up,
                    Gdk.KEY_Down,
                    Gdk.KEY_Left,
                    Gdk.KEY_Right,
                    Gdk.KEY_Home,
                    Gdk.KEY_End,
                    Gdk.KEY_Page_Up,
                    Gdk.KEY_Page_Down,
                ].includes(keyval)
            ) {
                selection.set_selected(0);
                return true;
            }
            return false;
        }

        const width = gridView.get_allocated_width();
        const colWidth = WALLPAPER_CARD_WIDTH + GRID_COLUMN_SPACING;
        const cols = Math.max(
            1,
            Math.floor((width + GRID_COLUMN_SPACING) / colWidth),
        );

        let next = selected;
        switch (keyval) {
            case Gdk.KEY_Up:
                next = selected - cols;
                break;
            case Gdk.KEY_Down:
                next = selected + cols;
                break;
            case Gdk.KEY_Left:
                next = selected - 1;
                break;
            case Gdk.KEY_Right:
                next = selected + 1;
                break;
            case Gdk.KEY_Page_Up:
                next = selected - cols * 3;
                break;
            case Gdk.KEY_Page_Down:
                next = selected + cols * 3;
                break;
            case Gdk.KEY_Home:
                next = 0;
                break;
            case Gdk.KEY_End:
                next = nItems - 1;
                break;
            default:
                return false;
        }

        if (next < 0) next = 0;
        if (next >= nItems) next = nItems - 1;

        if (next !== selected) {
            selection.set_selected(next);
            if ((gridView as any).scroll_to) {
                (gridView as any).scroll_to(
                    next,
                    Gtk.ListScrollFlags.NONE,
                    null,
                );
            } else {
                const row = Math.floor(next / cols);
                const rowHeight =
                    WALLPAPER_CARD_IMAGE_HEIGHT +
                    WALLPAPER_CARD_LABEL_HEIGHT +
                    GRID_ROW_SPACING;
                const y = row * rowHeight;

                const sw = gridView.get_parent() as Gtk.ScrolledWindow;
                if (sw && sw.get_vadjustment) {
                    const adj = sw.get_vadjustment();
                    if (adj) {
                        const page = adj.get_page_size();
                        const current = adj.get_value();
                        if (y < current) {
                            adj.set_value(y);
                        } else if (y + rowHeight > current + page) {
                            adj.set_value(y + rowHeight - page);
                        }
                    }
                }
            }
        }
        return true;
    };

    return (
        <window
            name={windowName}
            class={`${name}-window`}
            application={app}
            gdkmonitor={monitor}
            title={title}
            defaultWidth={800}
            defaultHeight={500}
            hideOnClose
            modal
            layer={Astal.Layer.OVERLAY}
            keymode={Astal.Keymode.EXCLUSIVE}
            visible={false}
            $={(self) => {
                const entryKeyController = new Gtk.EventControllerKey();
                entryKeyController.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
                entryKeyController.connect("key-pressed", (_, keyval) => {
                    const gridView = getActiveGridView();

                    if (keyval === Gdk.KEY_Escape) {
                        self.set_visible(false);
                        return true;
                    }

                    if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
                        const selection = gridView.get_model() as Gtk.SingleSelection;
                        const pos = selection.get_selected();
                        if (pos !== Gtk.INVALID_LIST_POSITION) {
                            gridView.emit("activate", pos);
                        }
                        return true;
                    }

                    if (
                        [
                            Gdk.KEY_Up,
                            Gdk.KEY_Down,
                            Gdk.KEY_Left,
                            Gdk.KEY_Right,
                            Gdk.KEY_Home,
                            Gdk.KEY_End,
                            Gdk.KEY_Page_Up,
                            Gdk.KEY_Page_Down,
                        ].includes(keyval)
                    ) {
                        handleNavigation(keyval, gridView);
                        return true;
                    }

                    return false;
                });
                searchEntry.add_controller(entryKeyController);

                const winKeyController = new Gtk.EventControllerKey();
                winKeyController.connect("key-pressed", (_, keyval) => {
                    if (keyval === Gdk.KEY_Escape) {
                        self.set_visible(false);
                        return true;
                    }
                    return false;
                });
                self.add_controller(winKeyController);

                self.connect("notify::visible", () => {
                    if (self.get_visible()) {
                        if (onShow) onShow();
                        searchEntry.grab_focus();
                    }
                });
            }}
        >
            <box
                orientation={Gtk.Orientation.VERTICAL}
                class={`${name}-root`}
                spacing={12}
            >
                {searchEntry}
                {children}
            </box>
        </window>
    );
}
