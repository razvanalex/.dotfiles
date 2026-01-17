import { Gtk, Gdk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import Tray from "gi://AstalTray"
import userOptions from "../../lib/userOptions"

function TrayItem({ item }: { item: Tray.TrayItem }) {
    const titleBinding = createBinding(item, "title")
    const idBinding = createBinding(item, "id")
    const giconBinding = createBinding(item, "gicon")

    const init = (self: Gtk.MenuButton) => {
        self.menu_model = item.menu_model
        self.insert_action_group("dbusmenu", item.action_group)
        item.connect("notify::action-group", () => {
            self.insert_action_group("dbusmenu", item.action_group)
        })

        // Override default click behavior
        const controller = new Gtk.GestureClick()
        controller.set_button(0) // Listen to all buttons
        controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE) // Catch event before button
        controller.connect("released", (gesture, n, x, y) => {
            const btn = gesture.get_current_button()
            if (btn === Gdk.BUTTON_PRIMARY) {
                // Left Click: Activate the app
                item.activate(x, y)
                gesture.set_state(Gtk.EventSequenceState.CLAIMED)
            } else if (btn === Gdk.BUTTON_SECONDARY) {
                // Right Click: Open the menu
                self.set_active(true)
                gesture.set_state(Gtk.EventSequenceState.CLAIMED)
            }
        })
        self.add_controller(controller)
    }

    return (
        <menubutton
            class="bar-systray-item"
            tooltipText={titleBinding.as(t => t || idBinding.get() || "System Tray Item")}
            $={init}
        >
            <image gicon={giconBinding} halign={Gtk.Align.CENTER} css="min-width: 1.25rem; min-height: 1.25rem;" />
        </menubutton>
    )
}

export function SystemTray() {
    const tray = Tray.get_default()
    const [items, setItems] = createState(tray.get_items())

    const update = () => setItems([...tray.get_items()])
    tray.connect("item-added", update)
    tray.connect("item-removed", update)

    return (
        <revealer
            revealChild={items.as(i => i.length > 0)}
            transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
            transitionDuration={userOptions.animations.durationLarge}
        >
            <box class="margin-right-5 spacing-h-15">
                <For each={items}>
                    {(item) => <TrayItem key={item.id} item={item} />}
                </For>
            </box>
        </revealer>
    )
}
