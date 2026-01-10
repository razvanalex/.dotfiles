import { Gtk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import { execAsync } from "ags/process"
import AstalBluetooth from "gi://AstalBluetooth"
import userOptions from "../../../lib/userOptions"

function BluetoothDevice({ device }: { device: AstalBluetooth.Device }) {
    const connected = createBinding(device, "connected")
    const paired = createBinding(device, "paired")
    const name = createBinding(device, "name")
    const [connecting, setConnecting] = createState(false)

    return (
        <box class="sidebar-bluetooth-device spacing-h-10">
            <image
                class="sidebar-bluetooth-appicon"
                valign={Gtk.Align.CENTER}
                iconName={`${device.icon || "bluetooth"}-symbolic`}
            />
            <box hexpand valign={Gtk.Align.CENTER} orientation={Gtk.Orientation.VERTICAL}>
                <label
                    halign={Gtk.Align.START}
                    maxWidthChars={30}
                    ellipsize={3}
                    label={name(name => name || device.address)}
                    class="txt-small"
                />
                <label
                    halign={Gtk.Align.START}
                    maxWidthChars={30}
                    ellipsize={3}
                    class="txt-subtext"
                    label={connected.as(c => c ? "Connected" : paired.get() ? "Paired" : "")}
                />
            </box>
            <box class="spacing-h-5">
                <button
                    valign={Gtk.Align.CENTER}
                    class={connected.as(c => `sidebar-iconbutton ${c ? "sidebar-button-active" : ""}`)}
                    tooltipText="Toggle connection"
                    sensitive={connecting.as(c => !c)}
                    onClicked={async () => {
                        setConnecting(true)
                        try {
                            if (device.connected) {
                                await device.disconnect_device()
                            } else {
                                await device.connect_device()
                            }
                        } catch (e) {
                            console.error(e)
                        }
                        setConnecting(false)
                    }}
                >
                    <label class="icon-material txt-norm" label={connected.as(c => c ? "bluetooth_connected" : "bluetooth")} />
                </button>
                <button
                    valign={Gtk.Align.CENTER}
                    class="sidebar-bluetooth-device-remove"
                    tooltipText="Remove device"
                    onClicked={() => execAsync(["bluetoothctl", "remove", device.address])}
                >
                    <label class="icon-material txt-norm" label="delete" />
                </button>
            </box>
        </box>
    )
}

export default function Bluetooth() {
    const bluetooth = AstalBluetooth.get_default()
    const devices = createBinding(bluetooth, "devices")

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
            <stack
                visibleChildName={devices.as(d => d.length > 0 ? "list" : "empty")}
                transitionType={Gtk.StackTransitionType.CROSSFADE}
                vexpand
            >
                <box $type="named" name="empty" homogeneous>
                    <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="txt spacing-v-10">
                        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 txt-subtext">
                            <label class="icon-material txt-gigantic" label="bluetooth_disabled" />
                            <label class="txt-small" label="No Bluetooth devices" />
                        </box>
                    </box>
                </box>
                <box $type="named" name="list" orientation={Gtk.Orientation.VERTICAL}>
                    <overlay>
                        <scrolledwindow
                            vexpand
                            hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                            vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                        >
                            <box
                                orientation={Gtk.Orientation.VERTICAL}
                                class="spacing-v-5 margin-bottom-15"
                            >
                                <For each={devices}>
                                    {(device) => <BluetoothDevice device={device} />}
                                </For>
                            </box>
                        </scrolledwindow>
                        <box
                            $type="overlay"
                            valign={Gtk.Align.END}
                            class="sidebar-centermodules-scrollgradient-bottom"
                        />
                    </overlay>
                </box>
            </stack>
            <box homogeneous>
                <button
                    halign={Gtk.Align.CENTER}
                    class="txt-small txt sidebar-centermodules-bottombar-button"
                    onClicked={() => execAsync(userOptions.apps.bluetooth)}
                >
                    <label label="More" />
                </button>
            </box>
        </box>
    )
}
