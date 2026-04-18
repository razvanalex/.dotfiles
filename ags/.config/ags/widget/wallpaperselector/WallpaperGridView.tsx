import Gio from "gi://Gio";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import GdkPixbuf from "gi://GdkPixbuf";
import type { Accessor } from "ags";
import { Gdk, Gtk } from "ags/gtk4";

import {
    WALLPAPER_CARD_IMAGE_HEIGHT,
    WALLPAPER_CARD_LABEL_HEIGHT,
    WALLPAPER_CARD_WIDTH,
    GRID_ROW_SPACING,
    GRID_COLUMN_SPACING,
} from "./types";

const VISIBLE_ROW_OVERSCAN = 4;

export interface GridItem {
    id: string;
    previewPath?: string;
    label: string;
    isActive?: boolean;
    isSelected?: boolean;
    isGif?: boolean;
}

interface WallpaperGridViewProps {
    items: Accessor<GridItem[]>;
    onActivate: (id: string) => void;
    onSelect?: (id: string) => void;
    previewLookup?: Accessor<Record<string, string>>;
    autoHideScrollbar?: boolean;
    onVisibleRangeChange?: (start: number, end: number) => void;
}

export class WallpaperItem extends GObject.Object {
    static {
        GObject.registerClass(
            {
                Properties: {
                    id: GObject.ParamSpec.string(
                        "id",
                        "ID",
                        "Item ID",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    label: GObject.ParamSpec.string(
                        "label",
                        "Label",
                        "Item Label",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    "is-active": GObject.ParamSpec.boolean(
                        "is-active",
                        "Is Active",
                        "Is Active",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                    "preview-path": GObject.ParamSpec.string(
                        "preview-path",
                        "Preview Path",
                        "Preview Path",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    texture: GObject.ParamSpec.object(
                        "texture",
                        "Texture",
                        "Cached thumbnail texture",
                        GObject.ParamFlags.READWRITE,
                        Gdk.Texture.$gtype,
                    ),
                },
            },
            WallpaperItem,
        );
    }

    declare id: string;
    declare label: string;
    declare is_active: boolean;
    declare preview_path: string;
    declare texture: Gdk.Texture | null;
}

export default function WallpaperGridView({
    items,
    onActivate,
    onSelect,
    previewLookup,
    autoHideScrollbar,
    onVisibleRangeChange,
}: WallpaperGridViewProps) {
    const useAutoHideScrollbar = autoHideScrollbar ?? true;

    const store = new Gio.ListStore({ item_type: WallpaperItem.$gtype });
    const selectionModel = new Gtk.SingleSelection({
        model: store,
        autoselect: true,
        can_unselect: false,
    });

    selectionModel.connect("notify::selected", () => {
        const selectedIndex = selectionModel.selected;
        const count = store.get_n_items();

        // Update all items' is-active state based on selection
        for (let i = 0; i < count; i++) {
            const item = store.get_item(i) as WallpaperItem | null;
            if (item) {
                const shouldBeActive =
                    i === selectedIndex &&
                    selectedIndex !== Gtk.INVALID_LIST_POSITION;
                if ((item as any)["is-active"] !== shouldBeActive) {
                    (item as any)["is-active"] = shouldBeActive;
                }
            }
        }

        if (onSelect && selectedIndex !== Gtk.INVALID_LIST_POSITION) {
            const item = store.get_item(selectedIndex) as WallpaperItem | null;
            if (item) onSelect(item.id);
        }
    });

    let scrollerRef: Gtk.ScrolledWindow | undefined;
    let gridViewRef: Gtk.GridView | undefined;

    const emitVisibleRange = () => {
        const count = store.get_n_items();
        if (count <= 0) {
            if (onVisibleRangeChange) onVisibleRangeChange(0, 0);
            return;
        }

        const adjustment = scrollerRef?.get_vadjustment();
        const allocatedWidth = Math.max(
            gridViewRef?.get_allocated_width() ?? 0,
            scrollerRef?.get_allocated_width() ?? 0,
            WALLPAPER_CARD_WIDTH,
        );

        const columnWidth = WALLPAPER_CARD_WIDTH + GRID_COLUMN_SPACING;
        const cols = Math.max(
            1,
            Math.floor((allocatedWidth + GRID_COLUMN_SPACING) / columnWidth),
        );

        const rowHeight =
            WALLPAPER_CARD_IMAGE_HEIGHT +
            WALLPAPER_CARD_LABEL_HEIGHT +
            GRID_ROW_SPACING;

        const visibleRows = adjustment
            ? Math.max(1, Math.ceil(adjustment.get_page_size() / rowHeight))
            : Math.max(1, Math.ceil(count / cols));

        const visibleCount = Math.min(count, visibleRows * cols);
        const maxStart = Math.max(0, count - visibleCount);

        let firstIndex = 0;
        if (adjustment) {
            const pageSize = Math.max(0, adjustment.get_page_size());
            const upper = Math.max(pageSize, adjustment.get_upper());
            const scrollable = Math.max(0, upper - pageSize);
            const value = Math.max(0, adjustment.get_value());

            if (scrollable > 0 && maxStart > 0) {
                const progress = Math.min(1, Math.max(0, value / scrollable));
                firstIndex = Math.floor(progress * maxStart);
            }
        }

        const firstRow = Math.floor(firstIndex / cols);

        const start = Math.max(0, (firstRow - VISIBLE_ROW_OVERSCAN) * cols);
        const end = Math.min(
            count,
            (firstRow + visibleRows + VISIBLE_ROW_OVERSCAN) * cols,
        );

        if (onVisibleRangeChange) onVisibleRangeChange(start, end);
    };

    const unsubscribeItems = items.subscribe(() => {
        const newItems = items.get() || [];
        const currentCount = store.get_n_items();
        if (currentCount === newItems.length) {
            let allMatch = true;
            for (let i = 0; i < currentCount; i++) {
                const item = store.get_item(i) as WallpaperItem;
                if (item.id !== newItems[i].id) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                let anyActive = false;
                for (let i = 0; i < currentCount; i++) {
                    const item = store.get_item(i) as WallpaperItem;
                    const newItem = newItems[i];
                    const isActive = (item as any)["is-active"] as boolean;
                    if (isActive !== newItem.isActive) {
                        (item as any)["is-active"] = newItem.isActive || false;
                    }
                    if (newItem.isActive) {
                        selectionModel.selected = i;
                        anyActive = true;
                    }

                    const newPreviewPath = previewLookup
                        ? previewLookup.get()?.[newItem.id] ||
                          newItem.previewPath ||
                          ""
                        : newItem.previewPath || "";
                    const currentPreviewPath = (item as any)[
                        "preview-path"
                    ] as string;
                    if (currentPreviewPath !== newPreviewPath) {
                        (item as any)["preview-path"] = newPreviewPath;
                    }
                }
                if (!anyActive)
                    selectionModel.selected = Gtk.INVALID_LIST_POSITION;
                return;
            }
        }

        let initialSelected = Gtk.INVALID_LIST_POSITION;
        const newGObjects = newItems.map((item, i) => {
            const gobj = new WallpaperItem();
            gobj.id = item.id;
            gobj.label = item.label || "";
            const isActive = item.isActive || false;
            (gobj as any)["is-active"] = isActive;
            if (isActive) initialSelected = i;

            (gobj as any)["preview-path"] = previewLookup
                ? previewLookup.get()?.[item.id] || item.previewPath || ""
                : item.previewPath || "";
            return gobj;
        });
        store.splice(0, currentCount, newGObjects);
        selectionModel.selected = initialSelected;
        setTimeout(emitVisibleRange, 0);
    });

    const factory = new Gtk.SignalListItemFactory();

    factory.connect("setup", (_, listItem: Gtk.ListItem) => {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            width_request: WALLPAPER_CARD_WIDTH,
            height_request:
                WALLPAPER_CARD_IMAGE_HEIGHT + WALLPAPER_CARD_LABEL_HEIGHT,
        });
        box.add_css_class("wallpaper-card");

        const overlay = new Gtk.Overlay();

        const thumbBox = new Gtk.Box({
            width_request: WALLPAPER_CARD_WIDTH,
            height_request: WALLPAPER_CARD_IMAGE_HEIGHT,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.FILL,
            overflow: Gtk.Overflow.HIDDEN,
        });
        thumbBox.add_css_class("wallpaper-thumbnail");
        thumbBox.add_css_class("is-placeholder");

        const picture = new Gtk.Picture({
            can_shrink: true,
            content_fit: Gtk.ContentFit.COVER,
            hexpand: true,
            vexpand: true,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.FILL,
        });
        picture.add_css_class("wallpaper-image");
        thumbBox.append(picture);

        overlay.set_child(thumbBox);

        const activeBadge = new Gtk.Label({
            label: "✓",
            halign: Gtk.Align.END,
            valign: Gtk.Align.START,
            visible: false,
        });
        activeBadge.add_css_class("checkmark");
        overlay.add_overlay(activeBadge);

        box.append(overlay);

        const label = new Gtk.Label({
            halign: Gtk.Align.CENTER,
            xalign: 0.5,
            justify: Gtk.Justification.CENTER,
            ellipsize: 3,
            max_width_chars: 22,
        });
        label.add_css_class("wallpaper-filename");
        box.append(label);

        const gesture = new Gtk.GestureClick();
        box.add_controller(gesture);

        (box as any)._picture = picture;
        (box as any)._thumbBox = thumbBox;
        (box as any)._label = label;
        (box as any)._activeBadge = activeBadge;
        (box as any)._gesture = gesture;

        listItem.set_child(box);
    });

    factory.connect("bind", (_, listItem: Gtk.ListItem) => {
        const item = listItem.get_item() as WallpaperItem;
        if (!item) return;

        const box = listItem.get_child() as Gtk.Box;
        const picture = (box as any)._picture as Gtk.Picture;
        const thumbBox = (box as any)._thumbBox as Gtk.Box;
        const label = (box as any)._label as Gtk.Label;
        const activeBadge = (box as any)._activeBadge as Gtk.Label;
        const gesture = (box as any)._gesture as Gtk.GestureClick;

        label.set_label(item.label || "");
        const isActive = (item as any)["is-active"] as boolean;
        activeBadge.set_visible(isActive);
        if (isActive) box.add_css_class("active");
        else box.remove_css_class("active");

        if ((box as any)._cancellable) {
            (box as any)._cancellable.cancel();
        }
        const cancellable = new Gio.Cancellable();
        (box as any)._cancellable = cancellable;

        const updateImage = async () => {
            if (item.texture) {
                picture.set_paintable(item.texture);
                thumbBox.remove_css_class("is-placeholder");
                return;
            }

            const previewPath = (item as any)["preview-path"] as string;
            if (!previewPath) {
                picture.set_paintable(null);
                thumbBox.add_css_class("is-placeholder");
                return;
            }

            const localPath = previewPath.startsWith("file://")
                ? previewPath.replace(/^file:\/\//, "")
                : previewPath;

            if (!GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
                picture.set_paintable(null);
                thumbBox.add_css_class("is-placeholder");
                return;
            }

            try {
                const file = Gio.File.new_for_path(localPath);
                const stream = await new Promise<Gio.InputStream>((resolve, reject) => {
                    file.read_async(GLib.PRIORITY_DEFAULT, cancellable, (obj, res) => {
                        try {
                            resolve(obj!.read_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                const pixbuf = await new Promise<GdkPixbuf.Pixbuf>((resolve, reject) => {
                    GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                        stream,
                        WALLPAPER_CARD_WIDTH,
                        WALLPAPER_CARD_IMAGE_HEIGHT,
                        true,
                        cancellable,
                        (obj, res) => {
                            try {
                                resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(res));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });

                if (!cancellable.is_cancelled()) {
                    const texture = Gdk.Texture.new_for_pixbuf(pixbuf);
                    item.texture = texture;
                    picture.set_paintable(texture);
                    thumbBox.remove_css_class("is-placeholder");
                }
            } catch (error) {
                if (!cancellable.is_cancelled()) {
                    console.error(`Failed to load thumbnail for ${localPath}: ${error}`);
                    picture.set_paintable(null);
                    thumbBox.add_css_class("is-placeholder");
                }
            }
        };

        if (previewLookup) {
            const currentLookup = previewLookup.get() || {};
            const nextPreviewPath = currentLookup[item.id] || "";
            if (((item as any)["preview-path"] as string) !== nextPreviewPath) {
                (item as any)["preview-path"] = nextPreviewPath;
            }
        }

        void updateImage();

        const notifyId = item.connect("notify::preview-path", () => {
            void updateImage();
        });
        let previewSub: (() => void) | undefined;
        if (previewLookup) {
            previewSub = previewLookup.subscribe(() => {
                const lookup = previewLookup.get() || {};
                const nextPath = lookup?.[item.id] || "";
                if (((item as any)["preview-path"] as string) !== nextPath) {
                    (item as any)["preview-path"] = nextPath;
                }
            });
        }
        const notifyActiveId = item.connect("notify::is-active", () => {
            const currentIsActive = (item as any)["is-active"] as boolean;
            activeBadge.set_visible(currentIsActive);
            if (currentIsActive) box.add_css_class("active");
            else box.remove_css_class("active");
        });

        const clickedId = gesture.connect("pressed", (_gesture, nPress) => {
            if (onSelect) {
                if (nPress === 1) onSelect(item.id);
                else if (nPress === 2) onActivate(item.id);
            } else {
                if (nPress === 1) onActivate(item.id);
            }
        });

        (box as any)._notifyId = notifyId;
        (box as any)._previewSub = previewSub;
        (box as any)._notifyActiveId = notifyActiveId;
        (gesture as any)._clickedId = clickedId;
    });

    factory.connect("unbind", (_, listItem: Gtk.ListItem) => {
        const item = listItem.get_item() as WallpaperItem;
        if (!item) return;

        const box = listItem.get_child() as Gtk.Box;
        const picture = (box as any)._picture as Gtk.Picture;
        const gesture = (box as any)._gesture as Gtk.GestureClick;

        if ((box as any)._cancellable) {
            (box as any)._cancellable.cancel();
            delete (box as any)._cancellable;
        }

        if ((box as any)._notifyId) {
            item.disconnect((box as any)._notifyId);
            delete (box as any)._notifyId;
        }
        if ((box as any)._previewSub) {
            (box as any)._previewSub();
            delete (box as any)._previewSub;
        }
        if ((box as any)._notifyActiveId) {
            item.disconnect((box as any)._notifyActiveId);
            delete (box as any)._notifyActiveId;
        }
        if ((gesture as any)._clickedId) {
            gesture.disconnect((gesture as any)._clickedId);
            delete (gesture as any)._clickedId;
        }

        picture.set_paintable(null);
    });

    const gridView = new Gtk.GridView({
        model: selectionModel,
        factory: factory,
        max_columns: 20,
        min_columns: 1,
        enable_rubberband: false,
    });
    gridView.add_css_class("wallpaper-grid-flow");
    gridViewRef = gridView;

    gridView.connect("activate", (_, pos) => {
        const item = store.get_item(pos) as WallpaperItem | null;
        if (item) onActivate(item.id);
    });

    return (
        <scrolledwindow
            class="wallpaper-grid-scroll"
            vexpand
            hexpand
            hscrollbarPolicy={Gtk.PolicyType.NEVER}
            vscrollbarPolicy={
                useAutoHideScrollbar
                    ? Gtk.PolicyType.AUTOMATIC
                    : Gtk.PolicyType.ALWAYS
            }
            propagateNaturalHeight={false}
            propagateNaturalWidth={false}
            overlayScrolling={useAutoHideScrollbar}
            $={(self) => {
                scrollerRef = self;
                gridViewRef = gridView;

                const adjustment = self.get_vadjustment();

                let valueChangedId = 0;
                let changedId = 0;
                if (adjustment) {
                    valueChangedId = adjustment.connect(
                        "value-changed",
                        emitVisibleRange,
                    );
                    changedId = adjustment.connect("changed", emitVisibleRange);
                }

                const allocationId = self.connect(
                    "notify::allocated-width",
                    emitVisibleRange,
                );

                setTimeout(emitVisibleRange, 0);

                self.connect("destroy", () => {
                    unsubscribeItems();

                    if (adjustment && valueChangedId > 0) {
                        adjustment.disconnect(valueChangedId);
                    }
                    if (adjustment && changedId > 0) {
                        adjustment.disconnect(changedId);
                    }
                    if (allocationId > 0) {
                        self.disconnect(allocationId);
                    }
                });
            }}
        >
            {gridView}
        </scrolledwindow>
    );
}
