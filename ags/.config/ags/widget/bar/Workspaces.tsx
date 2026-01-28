import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import userOptions from "../../lib/userOptions"
import Hyprland from "gi://AstalHyprland"

const hypr = Hyprland.get_default()
const count = userOptions.workspaces.shown
const WS_WIDTH_REM = 1.774 // Must match SCSS $bar_ws_width
const REM_TO_PX = 14.6666666667

// ============================================================================
// Helper Functions
// ============================================================================

function switchToWorkspace(id: number) {
    hypr.dispatch("workspace", id.toString())
}

function getInnerClasses(id: number) {
    const fw = hypr.get_focused_workspace()
    const isCurrent = fw?.id === id
    const isOccupied = isWorkspaceOccupied(id)
    
    if (isCurrent) {
        return "bar-ws-active-text-only"
    } else if (isOccupied) {
        return "bar-ws-occupied-text"
    }
    return ""
}

// Calculate which page (group of workspaces) the current workspace is on
function calculatePageBounds(currentId: number) {
    const pageIndex = Math.floor((currentId - 1) / count)
    const start = pageIndex * count + 1
    const end = start + count - 1
    return { pageIndex, start, end }
}

// Check if a workspace is occupied (has clients) or active
function isWorkspaceOccupied(id: number): boolean {
    return hypr.get_workspace(id)?.get_clients().length > 0
}

function isWorkspaceActive(id: number): boolean {
    const fw = hypr.get_focused_workspace()
    return fw?.id === id
}

// Determine if adjacent workspaces should be grouped (for rounded corners)
function shouldGroupWithAdjacent(id: number, isNext: boolean) {
    const fw = hypr.get_focused_workspace()
    // Use the page bounds for the workspace being evaluated, not the focused workspace
    const { start, end } = calculatePageBounds(id)

    const adjacentId = isNext ? id + 1 : id - 1
    const isAdjacentVisible = isNext ? adjacentId <= end : adjacentId >= start

    if (!isAdjacentVisible) return false

    return isWorkspaceOccupied(adjacentId) || fw?.id === adjacentId
}

// Determine CSS class for workspace grouping (for rounded corners)
function getOccupiedGroupClass(id: number): string {
    const isPrevGroupable = shouldGroupWithAdjacent(id, false)
    const isNextGroupable = shouldGroupWithAdjacent(id, true)

    if (isPrevGroupable && isNextGroupable) {
        return "bar-ws-occupied-middle"
    } else if (!isPrevGroupable && isNextGroupable) {
        return "bar-ws-occupied-first"
    } else if (isPrevGroupable && !isNextGroupable) {
        return "bar-ws-occupied-last"
    } else {
        return "bar-ws-occupied-single"
    }
}

function getWorkspaceClasses(id: number) {
    const classes = ["bar-ws"]
    const isOccupied = isWorkspaceOccupied(id)
    const isActive = isWorkspaceActive(id)

    if (isActive) {
        classes.push("bar-ws-active-transparent")
    }

    // Only show occupied background if workspace actually has clients
    // Active workspace without clients should not show occupied background
    if (isOccupied) {
        classes.push("bar-ws-occupied")
        classes.push(getOccupiedGroupClass(id))
    }

    return classes.join(" ")
}

function createWorkspaceButton(id: number) {
    const label = new Gtk.Label({
        label: `${id}`,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        width_chars: 2,  // Reserve space for 2 characters
        max_width_chars: 2,  // Limit to 2 characters width
    })

    const innerBox = new Gtk.Box({
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
    })
    innerBox.set_name("inner-box")
    innerBox.append(label)

    const innerClasses = getInnerClasses(id).split(" ").filter(c => c.length > 0)
    if (innerClasses.length > 0) {
        innerBox.set_css_classes(innerClasses)
    }

    const button = new Gtk.Button()
    const classes = getWorkspaceClasses(id).split(" ").filter(c => c.length > 0)
    if (classes.length > 0) {
        button.set_css_classes(classes)
    }

    button.connect("clicked", () => switchToWorkspace(id))
    button.set_child(innerBox)

    button.set_name("ws-button")
    // @ts-ignore
    button._ws_id = id

    return button
}

// ============================================================================
// Main Component
// ============================================================================

export function HyprlandWorkspaces() {
    let bgBox: Gtk.Box
    let buttonBox: Gtk.Box
    let cursor: Gtk.Box
    let lastPageStart = -1
    let currentCursorPos = 0
    let animationId: ReturnType<typeof setTimeout> | null = null
    let isUpdating = false // Prevent concurrent updates
    let isInitialized = false // Track if cursor has been positioned at least once

    // Smooth cursor animation with ease-out cubic
    const animateCursor = (targetPos: number, duration: number = 200) => {
        if (animationId) {
            clearTimeout(animationId)
        }

        const startPos = currentCursorPos
        const distance = targetPos - startPos
        const startTime = Date.now()

        const animate = () => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3)
            const newPos = startPos + distance * eased

            currentCursorPos = newPos
            cursor.set_margin_start(Math.round(newPos))

            if (progress < 1) {
                animationId = setTimeout(animate, 5)
            } else {
                currentCursorPos = targetPos
                animationId = null
            }
        }

        animate()
    }

    // Clear all children from a box
    const clearBox = (box: Gtk.Box) => {
        let child = box.get_first_child()
        while (child) {
            const next = child.get_next_sibling()
            box.remove(child)
            child = next
        }
    }

    // Get the current workspace ID (with fallback to hyprctl)
    const getCurrentWorkspaceId = async (): Promise<number> => {
        let currentId = hypr.focusedWorkspace?.id
        if (!currentId) {
            try {
                const result = await execAsync("hyprctl activeworkspace -j")
                const ws = JSON.parse(result)
                currentId = ws.id || 1
            } catch {
                currentId = 1
            }
        }
        return currentId
    }

    // Rebuild workspace widgets for the current page
    const rebuildWorkspacesForPage = (start: number) => {
        clearBox(bgBox)
        clearBox(buttonBox)

        const ids = Array.from({ length: count }, (_, i) => start + i)
        ids.forEach(id => {
            // Create background widget
            const bg = new Gtk.Box({
                name: `ws-bg-${id}`,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
            })
            // @ts-ignore
            bg._ws_id = id
            bgBox.append(bg)

            // Create button widget (transparent, text only)
            const btn = createWorkspaceButton(id)
            btn.add_css_class("bar-ws-active-transparent")
            buttonBox.append(btn)
        })

        lastPageStart = start
    }

    // Update CSS classes for all workspace widgets
    const updateWorkspaceClasses = (box: Gtk.Box, isButton: boolean) => {
        let child = box.get_first_child()

        while (child) {
            // @ts-ignore
            const id = child._ws_id

            if (id) {
                if (isButton) {
                    // Buttons are transparent and only show text
                    // These classes are static, set once
                    const buttonClasses = ["bar-ws", "bar-ws-active-transparent"]
                    child.set_css_classes(buttonClasses)

                    // Update inner box text styling
                    // @ts-ignore
                    const inner = child.get_child()
                    if (inner) {
                        const innerClasses = getInnerClasses(id).split(" ").filter(c => c)
                        inner.set_css_classes(innerClasses)
                    }
                } else {
                    // Background: use add/remove for proper transitions
                    const isOccupied = isWorkspaceOccupied(id)
                    const isActive = isWorkspaceActive(id)
                    
                    // Ensure base class is always present
                    if (!child.has_css_class("bar-ws")) {
                        child.add_css_class("bar-ws")
                    }
                    
                    // Handle occupied state
                    if (isOccupied || isActive) {
                        if (!child.has_css_class("bar-ws-occupied")) {
                            console.log(`[WS CSS] Adding occupied to workspace ${id}`)
                            child.add_css_class("bar-ws-occupied")
                        }
                        
                        // Remove old grouping classes
                        child.remove_css_class("bar-ws-occupied-single")
                        child.remove_css_class("bar-ws-occupied-first")
                        child.remove_css_class("bar-ws-occupied-middle")
                        child.remove_css_class("bar-ws-occupied-last")
                        
                        // Add new grouping class
                        const groupClass = getOccupiedGroupClass(id)
                        child.add_css_class(groupClass)
                    } else {
                        // Not occupied - remove all occupied classes
                        // Add a small delay to ensure GTK processes the class removal with transition
                        if (child.has_css_class("bar-ws-occupied")) {
                            console.log(`[WS CSS] Removing occupied from workspace ${id}`)
                            // Capture child reference for setTimeout
                            const element = child
                            // Force a style recalculation by querying a property
                            element.get_allocated_width()
                            // Remove classes on next tick to allow transition
                            setTimeout(() => {
                                element.remove_css_class("bar-ws-occupied")
                                element.remove_css_class("bar-ws-occupied-single")
                                element.remove_css_class("bar-ws-occupied-first")
                                element.remove_css_class("bar-ws-occupied-middle")
                                element.remove_css_class("bar-ws-occupied-last")
                            }, 0)
                        } else {
                            child.remove_css_class("bar-ws-occupied")
                            child.remove_css_class("bar-ws-occupied-single")
                            child.remove_css_class("bar-ws-occupied-first")
                            child.remove_css_class("bar-ws-occupied-middle")
                            child.remove_css_class("bar-ws-occupied-last")
                        }
                    }
                    
                    // Remove active class (backgrounds should never be active)
                    child.remove_css_class("bar-ws-active-transparent")
                }
            }
            child = child.get_next_sibling()
        }
    }

    // Update cursor position with animation
    const updateCursorPosition = (currentId: number, start: number) => {
        if (currentId < start || currentId >= start + count) {
            cursor.set_visible(false)
            return
        }

        // Calculate position relative to the start of the current page
        const relativeIndex = currentId - start

        // Calculate cumulative offset based on ACTUAL button widths
        // This handles cases where buttons may have slightly different widths
        let cumulativeOffset = 0
        let child = buttonBox.get_first_child()
        let allWidthsValid = true
        
        for (let i = 0; i < relativeIndex && child; i++) {
            const width = child.get_width()
            if (width === 0) {
                allWidthsValid = false
                break
            }
            cumulativeOffset += width
            child = child.get_next_sibling()
        }

        // If widgets aren't laid out yet (width = 0), retry after a short delay
        // Keep cursor hidden until we have valid measurements
        if (!allWidthsValid && relativeIndex > 0) {
            console.log(`[WS] Buttons not laid out yet, retrying cursor position in 50ms`)
            cursor.set_visible(false)
            setTimeout(() => updateCursorPosition(currentId, start), 50)
            return
        }

        // If this is the first time positioning (on startup), set position directly without animation
        if (!isInitialized) {
            currentCursorPos = cumulativeOffset
            cursor.set_margin_start(Math.round(cumulativeOffset))
            isInitialized = true
        } else {
            // Normal case: animate the cursor movement
            animateCursor(cumulativeOffset)
        }

        cursor.set_visible(true)
    }

    const setup = (overlay: Gtk.Overlay) => {
        // Add scroll controller for workspace switching
        const controller = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        })
        controller.connect("scroll", (_, _dx, dy) => {
            const direction = dy > 0 ? "+1" : "-1"
            execAsync(`hyprctl dispatch workspace ${direction}`).catch(console.error)
            return true
        })
        overlay.add_controller(controller)

        const update = async () => {
            // Ensure widgets are bound - retry if not ready
            if (!bgBox || !buttonBox || !cursor) {
                setTimeout(update, 10)
                return
            }

            // Prevent concurrent updates
            if (isUpdating) {
                return
            }
            isUpdating = true

            try {
                // Get current workspace and calculate page bounds
                const currentId = await getCurrentWorkspaceId()
                const { start } = calculatePageBounds(currentId)

                // Rebuild widgets if we've switched to a different page
                const pageChanged = start !== lastPageStart
                if (pageChanged) {
                    rebuildWorkspacesForPage(start)
                }

                // Update CSS classes for all widgets
                updateWorkspaceClasses(bgBox, false)
                updateWorkspaceClasses(buttonBox, true)

                // Update cursor position
                // If page changed, defer cursor update to allow GTK to layout new widgets
                // Use requestAnimationFrame-equivalent via GLib idle callback for next frame
                if (pageChanged) {
                    // Multiple deferrals to ensure GTK has time to measure widgets
                    setTimeout(() => {
                        setTimeout(() => updateCursorPosition(currentId, start), 0)
                    }, 10)
                } else {
                    updateCursorPosition(currentId, start)
                }
            } finally {
                isUpdating = false
            }
        }

        // Connect to Hyprland events
        const id = hypr.connect("notify::focused-workspace", update)
        const s2 = hypr.connect("client-added", update)
        const s3 = hypr.connect("client-removed", update)
        const s4 = hypr.connect("client-moved", update)

        overlay.connect("destroy", () => {
            hypr.disconnect(id)
            hypr.disconnect(s2)
            hypr.disconnect(s3)
            hypr.disconnect(s4)
        })

        // Initial update with retry for focusedWorkspace
        const initialUpdate = () => {
            update()
            // Retry if focusedWorkspace isn't available yet
            if (!hypr.focusedWorkspace) {
                setTimeout(update, 200)
            }
        }
        setTimeout(initialUpdate, 100)
    }

    return (
        <overlay
            class="bar-ws-wrapper"
            onRealize={setup}
        >
            {/* Main child - empty placeholder for sizing (extra space for right padding) */}
            <box css={`min-width: ${count * WS_WIDTH_REM + 0.5}rem; min-height: 1.774rem;`} />

            {/* Layer 1: Backgrounds (gray occupied bars) */}
            <box
                $type="overlay"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                spacing={0}
                $={w => bgBox = w}
            />

            {/* Layer 2: Cursor */}
            <box
                $type="overlay"
                name="bar-ws-cursor"
                class="bar-ws-cursor"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                $={w => {
                    cursor = w
                    cursor.set_visible(false)
                }}
            />

            {/* Layer 3: Buttons (transparent, text only) */}
            <box
                $type="overlay"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                spacing={0}
                $={w => buttonBox = w}
            />
        </overlay>
    )
}
