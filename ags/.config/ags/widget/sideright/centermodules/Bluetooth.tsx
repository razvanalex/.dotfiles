import { Gtk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import AstalBluetooth from "gi://AstalBluetooth"
import userOptions from "../../../lib/userOptions"
import UPower from "../../../services/UPower"

export default function Bluetooth() {
    const bluetooth = AstalBluetooth.get_default()
    const devices = createBinding(bluetooth, "devices")
    const isPowered = createBinding(bluetooth, "isPowered")

    const codecs = createPoll({}, 10000, async () => {
        try {
            const out = await execAsync("pw-dump")
            const json = JSON.parse(out)
            const map: Record<string, string> = {}
            for (const obj of json) {
                if (obj.info?.props?.["api.bluez5.address"] && obj.info?.props?.["api.bluez5.codec"]) {
                    map[obj.info.props["api.bluez5.address"].toUpperCase()] = obj.info.props["api.bluez5.codec"].toUpperCase()
                }
            }
            return map
        } catch (e) {
            return {}
        }
    })

    function BluetoothDevice({ device }: { device: AstalBluetooth.Device }) {
        const connected = createBinding(device, "connected")
        const connecting = createBinding(device, "connecting")
        const name = createBinding(device, "name")
        const batPerc = createPoll(-1, 2000, () => {
            const p = device.battery_percentage
            if (p > -1) {
                // AstalBluetooth: 0-1 is ratio (100% = 1.0), >1 is percentage
                return p > 1 ? p : p * 100
            }

            // Fallback to UPower service
            const addr = device.address.toLowerCase()
            const uDev = UPower.devices.find(d => d.serial.toLowerCase() === addr)
            if (uDev && uDev.percentage >= 0) {
                return uDev.percentage * 100
            }

            return -1
        })

        const [isTransitioning, setIsTransitioning] = createState(false)
        const [optimisticState, setOptimisticState] = createState<boolean | null>(null)
        const [showBattery, setShowBattery] = createState(false)

        // Store timeout reference so we can clear it from the subscription
        let fallbackTimeout: ReturnType<typeof setTimeout> | null = null

        // Update battery visibility when either connected or batPerc changes
        const updateBatteryVisibility = () => {
            const isConnected = connected.get()
            const p = batPerc.get()
            const opt = optimisticState.get()
            
            // Hide immediately if user clicked disconnect (optimistic state is false)
            if (opt === false) {
                setShowBattery(false)
                return
            }
            
            // Otherwise, show only when connected AND battery available
            setShowBattery(isConnected && p > -1)
        }
        
        connected.subscribe(updateBatteryVisibility)
        batPerc.subscribe(updateBatteryVisibility)
        optimisticState.subscribe(updateBatteryVisibility)

        // Clear optimistic state when the actual device state changes
        connected.subscribe(() => {
            if (optimisticState.get() !== null) {
                setOptimisticState(null)
                setIsTransitioning(false)
                // Clear the fallback timeout since the subscription fired
                if (fallbackTimeout) {
                    clearTimeout(fallbackTimeout)
                    fallbackTimeout = null
                }
            }
        })

        const toggleConnection = async () => {
            if (!bluetooth.isPowered) {
                return
            }

            // Prevent multiple rapid clicks - ignore if already transitioning
            if (isTransitioning.get()) {
                return
            }

            const isCurrentlyConnected = device.connected
            setOptimisticState(!isCurrentlyConnected)
            setIsTransitioning(true)

            // Fallback: clear optimistic state after 10 seconds regardless
            fallbackTimeout = setTimeout(() => {
                setOptimisticState(null)
                setIsTransitioning(false)
                fallbackTimeout = null
            }, 10000)

            try {
                if (isCurrentlyConnected) {
                    (device as any).disconnect_device(null)
                } else {
                    await execAsync(["bluetoothctl", "connect", device.address])
                }
            } catch (err) {
                console.error(`Bluetooth connection error: ${err}`)
                // Revert optimistic state on error
                if (fallbackTimeout) {
                    clearTimeout(fallbackTimeout)
                    fallbackTimeout = null
                }
                setOptimisticState(null)
                setIsTransitioning(false)
            }
        }

        return (
            <button
                class="sidebar-bluetooth-device"
                onClicked={toggleConnection}
                sensitive={isPowered}
            >
                <box class="spacing-h-5">
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
                        <box orientation={Gtk.Orientation.HORIZONTAL} class="spacing-h-5">
                            <label
                                halign={Gtk.Align.START}
                                maxWidthChars={20}
                                ellipsize={3}
                                class="txt-subtext"
                                label={(() => {
                                    // Create a combined binding that reacts to all states
                                    return optimisticState.as(opt => {
                                        const isConnected = connected.get()
                                        const isConnecting = connecting.get()
                                        
                                        // Use optimistic state if transitioning
                                        if (opt === true) return "Connecting..."
                                        if (opt === false) return "Disconnecting..."
                                        
                                        if (isConnecting) return "Connecting..."
                                        return isConnected ? "Connected" : (device.paired ? "Paired" : "")
                                    })
                                })()}
                            />
                            <box visible={showBattery} class="spacing-h-5">
                                <label class="txt-subtext" label="•" />
                                <box class="spacing-h-2">
                                    <label
                                        class={batPerc.as(p => p <= 20 ? "icon-material txt-error" : "icon-material txt-subtext")}
                                        label={batPerc.as(p => {
                                            if (p < 0) return ""
                                            if (p == 100) return "battery_full"
                                            if (p >= 90) return "battery_6_bar"
                                            if (p >= 75) return "battery_5_bar"
                                            if (p >= 60) return "battery_4_bar"
                                            if (p >= 45) return "battery_3_bar"
                                            if (p >= 30) return "battery_2_bar"
                                            if (p >= 15) return "battery_1_bar"
                                            if (p >= 5) return "battery_0_bar"
                                            return "battery_alert"
                                        })}
                                    />
                                    <label
                                        class={batPerc.as(p => p <= 20 ? "txt-error txt-small" : "txt-subtext txt-small")}
                                        label={batPerc.as(p => `${Math.floor(p)}%`)}
                                    />
                                    <label
                                        class="txt-subtext txt-small"
                                        visible={codecs.as(c => !!c[device.address])}
                                        label={codecs.as(c => {
                                            const codec = c[device.address];
                                            return codec ? ` • ${codec}` : "";
                                        })}
                                    />
                                </box>
                            </box>
                        </box>
                    </box>
                    <box hexpand />
                    <box class="spacing-h-5" valign={Gtk.Align.CENTER}>
                        <button
                            class="txt configtoggle-box"
                            hexpand={false}
                            sensitive={isPowered}
                            onClicked={toggleConnection}
                        >
                            <box>
                                <box
                                    class={optimisticState.as(opt => {
                                        const isConnected = connected.get()
                                        // Use optimistic state if available
                                        if (opt !== null) {
                                            return `switch-bg ${opt ? 'switch-bg-true' : ''}`
                                        }
                                        return `switch-bg ${!!isConnected ? 'switch-bg-true' : ''}`
                                    })}
                                    valign={Gtk.Align.CENTER}
                                    halign={Gtk.Align.END}
                                >
                                    <box
                                        class={optimisticState.as(opt => {
                                            const isConnected = connected.get()
                                            // Use optimistic state if available
                                            if (opt !== null) {
                                                return `switch-fg ${opt ? 'switch-fg-true' : ''}`
                                            }
                                            return `switch-fg ${!!isConnected ? 'switch-fg-true' : ''}`
                                        })}
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
