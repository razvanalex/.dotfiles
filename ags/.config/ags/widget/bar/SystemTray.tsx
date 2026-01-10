import { Gtk, Gdk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import Tray from "gi://AstalTray"
import userOptions from "../../lib/userOptions"

function TrayItem({ item }: { item: Tray.TrayItem }) {
    const tooltipBinding = createBinding(item, "tooltipMarkup")
    const giconBinding = createBinding(item, "gicon")
    const actionGroupBinding = createBinding(item, "actionGroup")

    const btn = (
        <button
            class="bar-systray-item"
            tooltipMarkup={tooltipBinding}
        >
            <image gicon={giconBinding} halign={Gtk.Align.CENTER} css="min-width: 1.25rem; min-height: 1.25rem;" />
        </button>
    ) as Gtk.Button

    actionGroupBinding.subscribe(ag => {
        if (ag) btn.insert_action_group("dbusmenu", ag)
    })

    const click = new Gtk.GestureClick()
    click.set_button(0) // Listen to all buttons
    click.connect("released", (gesture, n, x, y) => {
        const button = gesture.get_current_button()
        if (button === Gdk.BUTTON_PRIMARY) {
            item.activate(x, y)
        } else if (button === Gdk.BUTTON_SECONDARY) {
            const menuModel = item.menuModel
            if (menuModel) {
                const menu = Gtk.PopoverMenu.new_from_model(menuModel)
                menu.set_parent(btn)
                menu.popup()
            } else {
                item.activate(x, y)
            }
        }
    })
    btn.add_controller(click)

    return btn
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
