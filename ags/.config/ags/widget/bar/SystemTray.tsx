import { Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"
import Tray from "gi://AstalTray"
import userOptions from "../../lib/userOptions"

function TrayItem({ item }: { item: any }) {
    return (
        <button
            class="bar-systray-item"
            tooltipMarkup={item.tooltipMarkup}
            onClickRelease={(self, event) => {
                if (event.button === Gdk.BUTTON_PRIMARY) {
                    item.activate(event.x, event.y)
                } else if (event.button === Gdk.BUTTON_SECONDARY) {
                    item.menu?.popup_at_widget(
                        self,
                        Gdk.Gravity.SOUTH,
                        Gdk.Gravity.NORTH,
                        null
                    )
                }
            }}
        >
            <icon icon={item.iconName || item.iconPixbuf} halign={Gtk.Align.CENTER} />
        </button>
    )
}

export function SystemTray() {
    const tray = Tray.get_default()
    const [items, setItems] = createState(tray.get_items())

    tray.connect("item-added", () => {
        setItems([...tray.get_items()])
    })

    tray.connect("item-removed", () => {
        setItems([...tray.get_items()])
    })

    return (
        <revealer
            revealChild={items.get().length > 0}
            transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
            transitionDuration={userOptions.animations.durationLarge}
        >
            <box class="margin-right-5 spacing-h-15">
                {items.get().map((item) => (
                    <TrayItem key={item.itemId} item={item} />
                ))}
            </box>
        </revealer>
    )
}
