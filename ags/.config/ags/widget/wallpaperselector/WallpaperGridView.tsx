import GdkPixbuf from "gi://GdkPixbuf";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import type { Accessor } from "ags";
import { onCleanup } from "ags";
import { Gdk, Gtk } from "ags/gtk4";
import Logger from "lib/logger";

import {
    GRID_COLUMN_SPACING,
    GRID_ROW_SPACING,
    WALLPAPER_CARD_IMAGE_HEIGHT,
    WALLPAPER_CARD_LABEL_HEIGHT,
    WALLPAPER_CARD_WIDTH,
} from "./types";

const VISIBLE_ROW_OVERSCAN = 4;
const MAX_CONCURRENT_LOADS = 4;

export interface GridItem {
    id: string;
    previewPath?: string;
    label: string;
    isActive?: boolean;
    isSelected?: boolean;
    isGif?: boolean;
}

/**
 * Task Queue to limit concurrent image processing
 */
class TaskQueue {
    #pending: (() => Promise<void>)[] = [];
    #active = 0;

    add(task: () => Promise<void>) {
        this.#pending.push(task);
        this.#next();
    }

    #next() {
        if (this.#active >= MAX_CONCURRENT_LOADS || this.#pending.length === 0)
            return;
        const task = this.#pending.shift();
        if (!task) return;

        this.#active++;
        task().finally(() => {
            this.#active--;
            this.#next();
        });
    }

    clear() {
        this.#pending = [];
    }
}

const globalImageLoaderQueue = new TaskQueue();

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

interface WallpaperGridViewProps {
    items: Accessor<GridItem[]>;
    onActivate: (id: string) => void;
    onSelect?: (id: string) => void;
    previewLookup?: Accessor<Record<string, string>>;
    autoHideScrollbar?: boolean;
    onVisibleRangeChange?: (start: number, end: number) => void;
    $?: (self: Gtk.ScrolledWindow) => void;
}

export default function WallpaperGridView({
    items,
    onActivate,
    onSelect,
    previewLookup,
    onVisibleRangeChange,
    $,
}: WallpaperGridViewProps) {
    const store = new Gio.ListStore({ item_type: WallpaperItem.$gtype });
    const selectionModel = new Gtk.SingleSelection({
        model: store,
        autoselect: true,
        can_unselect: false,
    });

    const selectionId = selectionModel.connect("notify::selected", () => {
        const selectedIndex = selectionModel.selected;
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
        if (!adjustment) return;

        const allocatedWidth = Math.max(
            gridViewRef?.get_allocated_width() ?? 0,
            WALLPAPER_CARD_WIDTH,
        );
        const cols = Math.max(
            1,
            Math.floor(
                (allocatedWidth + GRID_COLUMN_SPACING) /
                    (WALLPAPER_CARD_WIDTH + GRID_COLUMN_SPACING),
            ),
        );
        const rowHeight =
            WALLPAPER_CARD_IMAGE_HEIGHT +
            WALLPAPER_CARD_LABEL_HEIGHT +
            GRID_ROW_SPACING;

        const value = adjustment.get_value();
        const pageSize = adjustment.get_page_size();
        const firstRow = Math.floor(value / rowHeight);
        const visibleRows = Math.ceil(pageSize / rowHeight);
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

        let initialSelected = Gtk.INVALID_LIST_POSITION;
        const lookup = previewLookup?.get();
        const newGObjects = newItems.map((item, i) => {
            const gobj = new WallpaperItem();
            gobj.id = item.id;
            gobj.label = item.label || "";
            gobj.is_active = item.isActive || false;
            if (gobj.is_active) initialSelected = i;
            gobj.preview_path = lookup?.[item.id] || item.previewPath || "";
            return gobj;
        });
        store.splice(0, currentCount, newGObjects);
        selectionModel.selected = initialSelected;
        setTimeout(emitVisibleRange, 0);
    });

    const unsubscribeLookup = previewLookup
        ? previewLookup.subscribe(() => {
              const lookup = previewLookup.get();
              const count = store.get_n_items();
              for (let i = 0; i < count; i++) {
                  const item = store.get_item(i) as WallpaperItem;
                  const nextPath = lookup?.[item.id] || "";
                  if (item.preview_path !== nextPath)
                      item.preview_path = nextPath;
              }
          })
        : () => {};

    const factory = new Gtk.SignalListItemFactory();
    factory.connect("setup", (_, listItem: Gtk.ListItem) => {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            width_request: WALLPAPER_CARD_WIDTH,
            height_request:
                WALLPAPER_CARD_IMAGE_HEIGHT + WALLPAPER_CARD_LABEL_HEIGHT,
            can_focus: true,
            focusable: true,
        });
        box.add_css_class("wallpaper-card");

        const thumbBox = new Gtk.Box({
            width_request: WALLPAPER_CARD_WIDTH,
            height_request: WALLPAPER_CARD_IMAGE_HEIGHT,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.FILL,
            overflow: Gtk.Overflow.HIDDEN,
            css_classes: ["wallpaper-thumbnail", "is-placeholder"],
        });

        const picture = new Gtk.Picture({
            can_shrink: true,
            content_fit: Gtk.ContentFit.COVER,
            hexpand: true,
            vexpand: true,
        });
        picture.add_css_class("wallpaper-image");
        thumbBox.append(picture);

        const activeBadge = new Gtk.Label({
            label: "✓",
            halign: Gtk.Align.END,
            valign: Gtk.Align.START,
            visible: false,
        });
        activeBadge.add_css_class("checkmark");

        const overlay = new Gtk.Overlay();
        overlay.set_child(thumbBox);
        overlay.add_overlay(activeBadge);
        box.append(overlay);

        const label = new Gtk.Label({
            halign: Gtk.Align.CENTER,
            ellipsize: 3,
            max_width_chars: 22,
        });
        label.add_css_class("wallpaper-filename");
        box.append(label);

        const gesture = new Gtk.GestureClick();
        box.add_controller(gesture);

        (box as any)._ui = { picture, thumbBox, label, activeBadge, gesture };
        listItem.set_child(box);
    });

    factory.connect("bind", (_, listItem: Gtk.ListItem) => {
        const item = listItem.get_item() as WallpaperItem;
        if (!item) return;

        const box = listItem.get_child() as Gtk.Box;
        const { picture, thumbBox, label, activeBadge, gesture } = (box as any)
            ._ui;

        label.set_label(item.label || "");
        activeBadge.set_visible(item.is_active);
        if (item.is_active) box.add_css_class("active");
        else box.remove_css_class("active");

        // Sync selection state to CSS class
        const updateSelected = () => {
            if (listItem.get_selected()) {
                box.add_css_class("selected");
            } else {
                box.remove_css_class("selected");
            }
        };
        updateSelected();
        const selectedId = listItem.connect("notify::selected", updateSelected);

        const cancellable = new Gio.Cancellable();
        (box as any)._cancellable = cancellable;

        const updateImage = () => {
            const previewPath = item.preview_path;
            if (
                !previewPath ||
                !GLib.file_test(previewPath, GLib.FileTest.EXISTS)
            ) {
                picture.set_paintable(null);
                thumbBox.add_css_class("is-placeholder");
                return;
            }

            if (item.texture) {
                picture.set_paintable(item.texture);
                thumbBox.remove_css_class("is-placeholder");
                return;
            }

            globalImageLoaderQueue.add(async () => {
                if (cancellable.is_cancelled()) return;
                try {
                    const file = Gio.File.new_for_path(previewPath);
                    const stream = await new Promise<Gio.InputStream>(
                        (resolve, reject) => {
                            file.read_async(
                                GLib.PRIORITY_LOW,
                                cancellable,
                                (obj, res) => {
                                    try {
                                        resolve(obj!.read_finish(res));
                                    } catch (e) {
                                        reject(e);
                                    }
                                },
                            );
                        },
                    );

                    const pixbuf = await new Promise<GdkPixbuf.Pixbuf>(
                        (resolve, reject) => {
                            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                                stream,
                                WALLPAPER_CARD_WIDTH,
                                WALLPAPER_CARD_IMAGE_HEIGHT,
                                true,
                                cancellable,
                                (obj, res) => {
                                    try {
                                        resolve(
                                            GdkPixbuf.Pixbuf.new_from_stream_finish(
                                                res,
                                            ),
                                        );
                                    } catch (e) {
                                        reject(e);
                                    }
                                },
                            );
                        },
                    );

                    if (!cancellable.is_cancelled()) {
                        const texture = Gdk.Texture.new_for_pixbuf(pixbuf);
                        item.texture = texture;
                        picture.set_paintable(texture);
                        thumbBox.remove_css_class("is-placeholder");
                    }
                } catch (e) {
                    if (!cancellable.is_cancelled())
                        picture.set_paintable(null);
                }
            });
        };

        updateImage();

        const ids = [
            item.connect("notify::preview-path", updateImage),
            item.connect("notify::is-active", () =>
                activeBadge.set_visible(item.is_active),
            ),
            selectedId,
            gesture.connect("pressed", (_g, n, x, y) => {
                // Visual feedback (Ripple effect)
                (box as any).css =
                    `background-image: radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 0%);`;
                box.add_css_class("growingRadial");
                // The transition in SCSS will animate the background-size or similar if defined,
                // but for a pure JS ripple we'd need a timer.
                // Let's use the project's standard approach:
                (box as any).css =
                    `background-image: radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%); background-size: 200% 200%; background-position: center;`;

                if (n === 1) onSelect?.(item.id);
                if (n === 2) onActivate(item.id);
            }),
            gesture.connect("released", () => {
                box.remove_css_class("growingRadial");
                // Clear ripple
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    (box as any).css = "";
                    return GLib.SOURCE_REMOVE;
                });
            }),
        ];
        (box as any)._ids = ids;
    });

    factory.connect("unbind", (_, listItem: Gtk.ListItem) => {
        const item = listItem.get_item() as WallpaperItem;
        const box = listItem.get_child() as Gtk.Box;
        if (!box) return;
        if ((box as any)._cancellable) {
            (box as any)._cancellable.cancel();
            delete (box as any)._cancellable;
        }
        const { picture, gesture } = (box as any)._ui;
        const ids = (box as any)._ids as number[];
        if (ids) {
            if (item) {
                item.disconnect(ids[0]);
                item.disconnect(ids[1]);
            }
            listItem.disconnect(ids[2]); // disconnect selectedNotifyId
            gesture.disconnect(ids[3]);
            gesture.disconnect(ids[4]);
        }
        picture.set_paintable(null);
    });

    onCleanup(() => {
        unsubscribeItems();
        unsubscribeLookup();
        selectionModel.disconnect(selectionId);
    });

    const gridView = new Gtk.GridView({
        model: selectionModel,
        factory,
        max_columns: 20,
        min_columns: 1,
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
            $={(self) => {
                scrollerRef = self;
                const adj = self.get_vadjustment();
                const ids = [
                    adj.connect("value-changed", emitVisibleRange),
                    self.connect("notify::allocated-width", emitVisibleRange),
                ];
                onCleanup(() => {
                    adj.disconnect(ids[0]);
                    self.disconnect(ids[1]);
                });
                if ($) $(self);
            }}
        >
            {gridView}
        </scrolledwindow>
    );
}
