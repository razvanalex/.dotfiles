import { Gtk } from "ags/gtk4"
import { For } from "ags"
import type { Accessor } from "ags"
import Gio from "gi://Gio"
import {
    WALLPAPER_CARD_WIDTH,
    WALLPAPER_CARD_IMAGE_HEIGHT,
    WALLPAPER_CARD_LABEL_HEIGHT,
} from "./types"

const GRID_ROW_SPACING = 8
const GRID_COLUMN_SPACING = 8
const VISIBLE_ROW_OVERSCAN = 4
const DEBUG_WALLPAPER_GRID_PREVIEW = true
const MAX_PREVIEW_DEBUG_LOGS = 80

let previewDebugLogCount = 0

function logPreviewPathDebug(message: string) {
    if (!DEBUG_WALLPAPER_GRID_PREVIEW) return
    if (previewDebugLogCount >= MAX_PREVIEW_DEBUG_LOGS) return
    previewDebugLogCount += 1
    console.log(`[wallpaper-grid-preview] ${message}`)
}

export interface GridItem {
    id: string
    previewPath?: string
    label: string
    isActive?: boolean
    isSelected?: boolean
    isGif?: boolean
}

interface WallpaperGridViewProps {
    items: Accessor<GridItem[]>
    onActivate: (id: string) => void
    previewLookup?: Accessor<Record<string, string>>
    autoHideScrollbar?: boolean
    onVisibleRangeChange?: (start: number, end: number) => void
}

function normalizePreviewPath(path: string): string {
    if (!path) return ""
    const source = path.trim()
    const localPath = source.startsWith("file://")
        ? source.replace(/^file:\/\//, "")
        : source
    logPreviewPathDebug(`source=${source} path=${localPath}`)
    return localPath
}

export default function WallpaperGridView({
    items,
    onActivate,
    previewLookup,
    autoHideScrollbar,
    onVisibleRangeChange,
}: WallpaperGridViewProps) {
    const useAutoHideScrollbar = autoHideScrollbar ?? true

    let scrollerRef: Gtk.ScrolledWindow | undefined
    let flowRef: Gtk.FlowBox | undefined

    const emitVisibleRange = () => {
        const count = items.get().length
        if (count <= 0) {
            if (onVisibleRangeChange) onVisibleRangeChange(0, 0)
            return
        }

        const adjustment = scrollerRef?.get_vadjustment()

        const allocatedWidth = Math.max(
            flowRef?.get_allocated_width() ?? 0,
            scrollerRef?.get_allocated_width() ?? 0,
            WALLPAPER_CARD_WIDTH,
        )

        const columnWidth = WALLPAPER_CARD_WIDTH + GRID_COLUMN_SPACING
        const cols = Math.max(
            1,
            Math.floor((allocatedWidth + GRID_COLUMN_SPACING) / columnWidth),
        )

        const rowHeight =
            WALLPAPER_CARD_IMAGE_HEIGHT +
            WALLPAPER_CARD_LABEL_HEIGHT +
            GRID_ROW_SPACING
        const firstRow = adjustment
            ? Math.max(0, Math.floor(adjustment.get_value() / rowHeight))
            : 0
        const visibleRows = adjustment
            ? Math.max(1, Math.ceil(adjustment.get_page_size() / rowHeight))
            : Math.max(1, Math.ceil(count / cols))

        const start = Math.max(0, (firstRow - VISIBLE_ROW_OVERSCAN) * cols)
        const end = Math.min(
            count,
            (firstRow + visibleRows + VISIBLE_ROW_OVERSCAN) * cols,
        )

        if (onVisibleRangeChange) onVisibleRangeChange(start, end)
    }

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
                scrollerRef = self
                emitVisibleRange()
                const unsubscribe = items.subscribe(emitVisibleRange)
                const adjustment = self.get_vadjustment()

                let valueChangedId = 0
                let changedId = 0
                if (adjustment) {
                    valueChangedId = adjustment.connect(
                        "value-changed",
                        emitVisibleRange,
                    )
                    changedId = adjustment.connect("changed", emitVisibleRange)
                }

                const allocationId = self.connect(
                    "notify::allocated-width",
                    emitVisibleRange,
                )

                setTimeout(emitVisibleRange, 0)

                self.connect("destroy", () => {
                    unsubscribe()
                    if (adjustment && valueChangedId > 0) {
                        adjustment.disconnect(valueChangedId)
                    }
                    if (adjustment && changedId > 0) {
                        adjustment.disconnect(changedId)
                    }
                    if (allocationId > 0) {
                        self.disconnect(allocationId)
                    }
                })
            }}
        >
            <box
                class="wallpaper-grid"
                orientation={Gtk.Orientation.VERTICAL}
                hexpand
                vexpand
                halign={Gtk.Align.FILL}
                valign={Gtk.Align.START}
            >
                <Gtk.FlowBox
                    class="wallpaper-grid-flow"
                    selectionMode={Gtk.SelectionMode.NONE}
                    minChildrenPerLine={1}
                    maxChildrenPerLine={10}
                    rowSpacing={8}
                    columnSpacing={8}
                    activateOnSingleClick={false}
                    homogeneous={false}
                    hexpand
                    halign={Gtk.Align.FILL}
                    valign={Gtk.Align.START}
                    $={(self) => {
                        flowRef = self
                        const allocationId = self.connect(
                            "notify::allocated-width",
                            emitVisibleRange,
                        )
                        self.connect("destroy", () => {
                            if (allocationId > 0) {
                                self.disconnect(allocationId)
                            }
                        })
                        setTimeout(emitVisibleRange, 0)
                    }}
                >
                    <For each={items}>
                        {(item) => {
                            const previewPath = previewLookup
                                ? previewLookup(
                                      (lookup) =>
                                          lookup[item.id] || item.previewPath || "",
                                  )
                                : item.previewPath || ""

                            const imageFile =
                                typeof previewPath === "string"
                                    ? normalizePreviewPath(previewPath)
                                    : previewPath((path) =>
                                          normalizePreviewPath(path),
                                      )

                            const showFallback =
                                typeof imageFile === "string"
                                    ? !imageFile
                                    : imageFile((path) => !path)

                            return (
                                <box
                                    class={`wallpaper-card ${item.isActive ? "active" : ""} ${item.isSelected ? "selected" : ""}`}
                                    orientation={Gtk.Orientation.VERTICAL}
                                    spacing={8}
                                    halign={Gtk.Align.CENTER}
                                    valign={Gtk.Align.START}
                                    widthRequest={WALLPAPER_CARD_WIDTH}
                                    heightRequest={
                                        WALLPAPER_CARD_IMAGE_HEIGHT +
                                        WALLPAPER_CARD_LABEL_HEIGHT
                                    }
                                    hexpand={false}
                                    vexpand={false}
                                >
                                    <button
                                        class="wallpaper-card-button"
                                        halign={Gtk.Align.CENTER}
                                        widthRequest={WALLPAPER_CARD_WIDTH}
                                        heightRequest={WALLPAPER_CARD_IMAGE_HEIGHT}
                                        hexpand={false}
                                        vexpand={false}
                                        onClicked={() => onActivate(item.id)}
                                    >
                                        <overlay hexpand={false} vexpand={false}>
                                            <box
                                                class="wallpaper-thumbnail"
                                                widthRequest={WALLPAPER_CARD_WIDTH}
                                                heightRequest={WALLPAPER_CARD_IMAGE_HEIGHT}
                                                hexpand={false}
                                                vexpand={false}
                                                halign={Gtk.Align.FILL}
                                                valign={Gtk.Align.FILL}
                                                overflow={Gtk.Overflow.HIDDEN}
                                            >
                                                <box
                                                    hexpand
                                                    vexpand
                                                    halign={Gtk.Align.FILL}
                                                    valign={Gtk.Align.FILL}
                                                    $={(self) => {
                                                        const picture = new Gtk.Picture({
                                                            canShrink: true,
                                                            contentFit:
                                                                Gtk.ContentFit.COVER,
                                                            hexpand: true,
                                                            vexpand: true,
                                                            halign: Gtk.Align.FILL,
                                                            valign: Gtk.Align.FILL,
                                                        })
                                                        picture.add_css_class(
                                                            "wallpaper-image",
                                                        )
                                                        self.append(picture)

                                                        const applyFile =
                                                            (path: string) => {
                                                                if (!path) {
                                                                    picture.set_file(
                                                                        null,
                                                                    )
                                                                    return
                                                                }

                                                                const file =
                                                                    Gio.File.new_for_path(
                                                                        path,
                                                                    )
                                                                picture.set_file(
                                                                    file,
                                                                )
                                                            }

                                                        if (
                                                            typeof imageFile ===
                                                            "string"
                                                        ) {
                                                            applyFile(imageFile)
                                                            return
                                                        }

                                                        const unsubscribe =
                                                            imageFile.subscribe(
                                                                () => {
                                                                    applyFile(
                                                                        imageFile.get(),
                                                                    )
                                                                },
                                                            )

                                                        if (
                                                            typeof imageFile.get ===
                                                            "function"
                                                        ) {
                                                            applyFile(
                                                                imageFile.get(),
                                                            )
                                                        }

                                                        self.connect(
                                                            "destroy",
                                                            () => {
                                                                unsubscribe()
                                                            },
                                                        )
                                                    }}
                                                />
                                            </box>
                                            <label
                                                label="?"
                                                class="wallpaper-thumbnail-error"
                                                halign={Gtk.Align.CENTER}
                                                valign={Gtk.Align.CENTER}
                                                visible={showFallback}
                                            />
                                            {item.isActive && (
                                                <box
                                                    class="active-indicator"
                                                    halign={Gtk.Align.END}
                                                    valign={Gtk.Align.START}
                                                >
                                                    <label
                                                        label="✓"
                                                        class="checkmark"
                                                    />
                                                </box>
                                            )}
                                            {item.isGif && (
                                                <box
                                                    class="gif-badge-container"
                                                    halign={Gtk.Align.START}
                                                    valign={Gtk.Align.END}
                                                >
                                                    <label
                                                        label="▶"
                                                        class="gif-badge"
                                                    />
                                                </box>
                                            )}
                                        </overlay>
                                    </button>
                                    <label
                                        label={item.label ?? ""}
                                        class="wallpaper-filename"
                                        halign={Gtk.Align.CENTER}
                                        xalign={0.5}
                                        justify={Gtk.Justification.CENTER}
                                        ellipsize={3}
                                        maxWidthChars={22}
                                    />
                                </box>
                            )
                        }}
                    </For>
                </Gtk.FlowBox>
            </box>
        </scrolledwindow>
    )
}
