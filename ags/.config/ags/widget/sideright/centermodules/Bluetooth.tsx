import { Gtk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import { execAsync } from "ags/process"
import AstalBluetooth from "gi://AstalBluetooth"
import userOptions from "../../../lib/userOptions"



export default function Bluetooth() {

    const bluetooth = AstalBluetooth.get_default()

    const devices = createBinding(bluetooth, "devices")

    const isPowered = createBinding(bluetooth, "isPowered")



     function BluetoothDevice({ device }: { device: AstalBluetooth.Device }) {

         const connected = createBinding(device, "connected")

         const connecting = createBinding(device, "connecting")

         const name = createBinding(device, "name")

         const [isTransitioning, setIsTransitioning] = createState(false)



         const toggleConnection = async () => {

             if (!bluetooth.isPowered) return

             console.log(`Action: Toggling connection for ${device.name}`)

             setIsTransitioning(true)

             if (device.connected) {

                 (device as any).disconnect_device(null)

             } else {

                 try {

                     await execAsync(["bluetoothctl", "connect", device.address])

                 } catch (err) {

                     console.error(`Bluetooth connect error: ${err}`)

                 }

             }

             setIsTransitioning(false)

         }



        return (

            <button

                class="sidebar-bluetooth-device"

                onClicked={toggleConnection}

                sensitive={isPowered}

            >

                <box class="spacing-h-10">

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

                            label={name.as(name => name || device.address)}

                            class="txt-small"

                        />

                        <label

                            halign={Gtk.Align.START}

                            maxWidthChars={30}

                            ellipsize={3}

                            class="txt-subtext"

                            label={connected.as((isConnected: any) => {

                                // Check if we're in a transitioning state by checking connecting property
                                if (connecting.get()) {
                                    return "Connecting..."
                                }

                                // Check if disconnecting - device was connected but is no longer
                                if (isTransitioning.get() && !isConnected) {
                                    return "Disconnecting..."
                                }

                                // Show final state
                                return isConnected ? "Connected" : (device.paired ? "Paired" : "")

                            })}

                        />

                    </box>

                    <box class="spacing-h-5" valign={Gtk.Align.CENTER}>

                        <button
                            class="txt configtoggle-box"
                            hexpand={false}
                            sensitive={isPowered}
                            onClicked={() => {
                                const current = device.connected
                                if (current) {
                                    (device as any).disconnect_device(null)
                                } else {
                                    execAsync(["bluetoothctl", "connect", device.address])
                                }
                            }}
                        >
                            <box class="spacing-h-5">
                                <box 
                                    class={connected.as((e: any) => `switch-bg ${!!e ? 'switch-bg-true' : ''}`)}
                                    valign={Gtk.Align.CENTER}
                                    halign={Gtk.Align.END}
                                >
                                    <box 
                                        class={connected.as((e: any) => `switch-fg ${!!e ? 'switch-fg-true' : ''}`)}
                                        halign={Gtk.Align.START}
                                        valign={Gtk.Align.CENTER}
                                    />
                                </box>
                            </box>
                        </button>

                        <button

                            valign={Gtk.Align.CENTER}

                            class="sidebar-bluetooth-device-remove"

                            tooltipText="Remove device"

                            sensitive={isPowered}

                            onClicked={(self) => {

                                console.log(`Remove: ${device.name}`)

                                execAsync(["bluetoothctl", "remove", device.address])

                            }}

                        >

                            <label class="icon-material txt-norm" label="delete" />

                        </button>

                    </box>

                </box>

            </button>

        )

    }
    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <button
                    class="txt configtoggle-box"
                    hexpand
                    onClicked={() => {
                        if (bluetooth.adapter) {
                            bluetooth.adapter.set_powered(!bluetooth.isPowered)
                        }
                    }}
                >
                    <box class="spacing-h-5">
                        <label class="txt icon-material txt-norm" label="bluetooth" />
                        <label class="txt txt-small" label="Bluetooth Adapter" />
                        <box hexpand />
                        <box 
                            class={isPowered.as((e: any) => `switch-bg ${!!e ? 'switch-bg-true' : ''}`)}
                            valign={Gtk.Align.CENTER}
                            halign={Gtk.Align.END}
                        >
                            <box 
                                class={isPowered.as((e: any) => `switch-fg ${!!e ? 'switch-fg-true' : ''}`)}
                                halign={Gtk.Align.START}
                                valign={Gtk.Align.CENTER}
                            />
                        </box>
                    </box>
                </button>
                <box class="separator-line" />
            </box>
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
