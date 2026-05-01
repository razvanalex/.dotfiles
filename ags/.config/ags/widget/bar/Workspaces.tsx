import Hyprland from "gi://AstalHyprland";
import { onCleanup } from "ags";
import { Gtk } from "ags/gtk4";
import userOptions from "services/options/Options";

const hypr = Hyprland.get_default();
const count = userOptions.workspaces.shown;
const WS_WIDTH_REM = 1.774; // Must match SCSS $bar_ws_width

// ============================================================================
// Helper Functions
// ============================================================================

function switchToWorkspace(id: number) {
    hypr.dispatch("workspace", id.toString());
}

function getInnerClasses(id: number) {
    const fw = hypr.get_focused_workspace();
    const isCurrent = fw?.id === id;
    const isOccupied = isWorkspaceOccupied(id);

    if (isCurrent) {
        return "bar-ws-active-text-only";
    } else if (isOccupied) {
        return "bar-ws-occupied-text";
    }
    return "";
}

// Calculate which page (group of workspaces) the current workspace is on
function calculatePageBounds(currentId: number) {
    const pageIndex = Math.floor((currentId - 1) / count);
    const start = pageIndex * count + 1;
    const end = start + count - 1;
    return { pageIndex, start, end };
}

// Check if a workspace is occupied (has clients) or active
function isWorkspaceOccupied(id: number): boolean {
    return hypr.get_workspace(id)?.get_clients().length > 0;
}

function isWorkspaceActive(id: number): boolean {
    const fw = hypr.get_focused_workspace();
    return fw?.id === id;
}

// Determine if adjacent workspaces should be grouped (for rounded corners)
function shouldGroupWithAdjacent(id: number, isNext: boolean) {
    const fw = hypr.get_focused_workspace();
    const { start, end } = calculatePageBounds(id);

    const adjacentId = isNext ? id + 1 : id - 1;
    const isAdjacentVisible = isNext ? adjacentId <= end : adjacentId >= start;

    if (!isAdjacentVisible) return false;

    return isWorkspaceOccupied(adjacentId) || fw?.id === adjacentId;
}

// Determine CSS class for workspace grouping (for rounded corners)
function getOccupiedGroupClass(id: number): string {
    const isPrevGroupable = shouldGroupWithAdjacent(id, false);
    const isNextGroupable = shouldGroupWithAdjacent(id, true);

    if (isPrevGroupable && isNextGroupable) {
        return "bar-ws-occupied-middle";
    } else if (!isPrevGroupable && isNextGroupable) {
        return "bar-ws-occupied-first";
    } else if (isPrevGroupable && !isNextGroupable) {
        return "bar-ws-occupied-last";
    } else {
        return "bar-ws-occupied-single";
    }
}

function getWorkspaceClasses(id: number) {
    const classes = ["bar-ws"];
    const isOccupied = isWorkspaceOccupied(id);
    const isActive = isWorkspaceActive(id);

    if (isActive) {
        classes.push("bar-ws-active-transparent");
    }

    if (isOccupied) {
        classes.push("bar-ws-occupied");
        classes.push(getOccupiedGroupClass(id));
    }

    return classes.join(" ");
}

function createWorkspaceButton(id: number) {
    const label = new Gtk.Label({
        label: `${id}`,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        width_chars: 2,
        max_width_chars: 2,
    });

    const innerBox = new Gtk.Box({
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
    });
    innerBox.set_name("inner-box");
    innerBox.append(label);

    const innerClasses = getInnerClasses(id)
        .split(" ")
        .filter((c) => c.length > 0);
    if (innerClasses.length > 0) {
        innerBox.set_css_classes(innerClasses);
    }

    const button = new Gtk.Button();
    const classes = getWorkspaceClasses(id)
        .split(" ")
        .filter((c) => c.length > 0);
    if (classes.length > 0) {
        button.set_css_classes(classes);
    }

    button.connect("clicked", () => switchToWorkspace(id));
    button.set_child(innerBox);
    button.set_name("ws-button");
    // @ts-expect-error
    button._ws_id = id;

    return button;
}

// ============================================================================
// Main Component
// ============================================================================

export function HyprlandWorkspaces() {
    let bgBox: Gtk.Box;
    let buttonBox: Gtk.Box;
    let cursor: Gtk.Box;
    let lastPageStart = -1;
    let currentCursorPos = 0;
    let animationId: ReturnType<typeof setTimeout> | null = null;
    let cursorRetryId: ReturnType<typeof setTimeout> | null = null;
    let isUpdating = false;
    let isInitialized = false;

    // Smooth cursor animation with ease-out cubic
    const animateCursor = (targetPos: number, duration: number = 200) => {
        if (animationId) clearTimeout(animationId);

        const startPos = currentCursorPos;
        const distance = targetPos - startPos;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - (1 - progress) ** 3;
            const newPos = startPos + distance * eased;

            currentCursorPos = newPos;
            if (cursor) cursor.set_margin_start(Math.round(newPos));

            if (progress < 1) {
                animationId = setTimeout(animate, 5);
            } else {
                currentCursorPos = targetPos;
                animationId = null;
            }
        };

        animate();
    };

    const clearBox = (box: Gtk.Box) => {
        let child = box.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            box.remove(child);
            child = next;
        }
    };

    const getCurrentWorkspaceId = (): number => {
        const focused =
            hypr.focusedWorkspace?.id || hypr.get_focused_workspace()?.id;
        return focused || 1;
    };

    const rebuildWorkspacesForPage = (start: number) => {
        clearBox(bgBox);
        clearBox(buttonBox);

        const ids = Array.from({ length: count }, (_, i) => start + i);
        ids.forEach((id) => {
            const bg = new Gtk.Box({
                name: `ws-bg-${id}`,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
            });
            // @ts-expect-error
            bg._ws_id = id;
            bgBox.append(bg);

            const btn = createWorkspaceButton(id);
            btn.add_css_class("bar-ws-active-transparent");
            buttonBox.append(btn);
        });

        lastPageStart = start;
    };

    const updateWorkspaceClasses = (box: Gtk.Box, isButton: boolean) => {
        let child = box.get_first_child();

        while (child) {
            // @ts-expect-error
            const id = child._ws_id;

            if (id) {
                if (isButton) {
                    const buttonClasses = [
                        "bar-ws",
                        "bar-ws-active-transparent",
                    ];
                    child.set_css_classes(buttonClasses);

                    // @ts-expect-error
                    const inner = child.get_child();
                    if (inner) {
                        const innerClasses = getInnerClasses(id)
                            .split(" ")
                            .filter((c) => c);
                        inner.set_css_classes(innerClasses);
                    }
                } else {
                    const isOccupied = isWorkspaceOccupied(id);
                    const isActive = isWorkspaceActive(id);

                    if (!child.has_css_class("bar-ws"))
                        child.add_css_class("bar-ws");

                    if (isOccupied || isActive) {
                        if (!child.has_css_class("bar-ws-occupied"))
                            child.add_css_class("bar-ws-occupied");
                        child.remove_css_class("bar-ws-occupied-single");
                        child.remove_css_class("bar-ws-occupied-first");
                        child.remove_css_class("bar-ws-occupied-middle");
                        child.remove_css_class("bar-ws-occupied-last");
                        child.add_css_class(getOccupiedGroupClass(id));
                    } else {
                        child.remove_css_class("bar-ws-occupied");
                        child.remove_css_class("bar-ws-occupied-single");
                        child.remove_css_class("bar-ws-occupied-first");
                        child.remove_css_class("bar-ws-occupied-middle");
                        child.remove_css_class("bar-ws-occupied-last");
                    }
                    child.remove_css_class("bar-ws-active-transparent");
                }
            }
            child = child.get_next_sibling();
        }
    };

    const updateCursorPosition = (currentId: number, start: number) => {
        if (!cursor) return;
        if (currentId < start || currentId >= start + count) {
            cursor.set_visible(false);
            return;
        }

        const relativeIndex = currentId - start;
        let cumulativeOffset = 0;
        let child = buttonBox.get_first_child();
        let allWidthsValid = true;

        for (let i = 0; i < relativeIndex && child; i++) {
            const width = child.get_width();
            if (width === 0) {
                allWidthsValid = false;
                break;
            }
            cumulativeOffset += width;
            child = child.get_next_sibling();
        }

        if (!allWidthsValid && relativeIndex > 0) {
            cursor.set_visible(false);
            if (cursorRetryId) clearTimeout(cursorRetryId);
            cursorRetryId = setTimeout(() => {
                cursorRetryId = null;
                updateCursorPosition(currentId, start);
            }, 50);
            return;
        }

        if (!isInitialized) {
            currentCursorPos = cumulativeOffset;
            cursor.set_margin_start(Math.round(cumulativeOffset));
            isInitialized = true;
        } else {
            animateCursor(cumulativeOffset);
        }
        cursor.set_visible(true);
    };

    const setup = (overlay: Gtk.Overlay) => {
        const controller = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        const scrollId = controller.connect("scroll", (_, _dx, dy) => {
            const direction = dy > 0 ? "+1" : "-1";
            hypr.dispatch("workspace", direction);
            return true;
        });
        overlay.add_controller(controller);

        const update = () => {
            if (!bgBox || !buttonBox || !cursor) {
                const retryId = setTimeout(update, 10);
                onCleanup(() => clearTimeout(retryId));
                return;
            }
            if (isUpdating) return;
            isUpdating = true;
            try {
                const currentId = getCurrentWorkspaceId();
                const { start } = calculatePageBounds(currentId);
                const pageChanged = start !== lastPageStart;
                if (pageChanged) rebuildWorkspacesForPage(start);
                updateWorkspaceClasses(bgBox, false);
                updateWorkspaceClasses(buttonBox, true);
                if (pageChanged) {
                    setTimeout(
                        () =>
                            setTimeout(
                                () => updateCursorPosition(currentId, start),
                                0,
                            ),
                        10,
                    );
                } else {
                    updateCursorPosition(currentId, start);
                }
            } finally {
                isUpdating = false;
            }
        };

        const ids = [
            hypr.connect("notify::focused-workspace", update),
            hypr.connect("client-added", update),
            hypr.connect("client-removed", update),
            hypr.connect("client-moved", update),
        ];

        onCleanup(() => {
            if (cursorRetryId) clearTimeout(cursorRetryId);
            if (animationId) clearTimeout(animationId);
            for (const id of ids) hypr.disconnect(id);
            controller.disconnect(scrollId);
        });

        const initialUpdateId = setTimeout(() => {
            update();
            if (!hypr.focusedWorkspace) setTimeout(update, 200);
        }, 100);
        onCleanup(() => clearTimeout(initialUpdateId));
    };

    return (
        <overlay class="bar-ws-wrapper" onRealize={setup}>
            <box
                css={`min-width: ${count * WS_WIDTH_REM + 0.5}rem; min-height: 1.774rem;`}
            />
            <box
                $type="overlay"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                spacing={0}
                $={(w) => (bgBox = w)}
            />
            <box
                $type="overlay"
                name="bar-ws-cursor"
                class="bar-ws-cursor"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                $={(w) => {
                    cursor = w;
                    cursor.set_visible(false);
                }}
            />
            <box
                $type="overlay"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                spacing={0}
                $={(w) => (buttonBox = w)}
            />
        </overlay>
    );
}
