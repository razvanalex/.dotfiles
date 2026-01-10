import { Gtk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import { execAsync } from "ags/process"
import Network from "gi://AstalNetwork"
import userOptions from "../../../lib/userOptions"

const SIGNAL_STRENGTH_ICONS: Record<string, string> = {
    "network-wireless-signal-excellent-symbolic": "signal_wifi_4_bar",
    "network-wireless-signal-good-symbolic": "network_wifi_3_bar",
    "network-wireless-signal-ok-symbolic": "network_wifi_2_bar",
    "network-wireless-signal-weak-symbolic": "network_wifi_1_bar",
    "network-wireless-signal-none-symbolic": "signal_wifi_0_bar",
}

function WifiNetwork({ accessPoint, wifi }: { accessPoint: Network.AccessPoint, wifi: Network.Wifi }) {
    const isActive = accessPoint.ssid === wifi.ssid
    
    return (
        <button
            class="sidebar-wifinetworks-network"
            onClicked={() => {
                if (!isActive) {
                    execAsync(`nmcli device wifi connect ${accessPoint.bssid}`).catch(console.error)
                }
            }}
        >
            <box class="spacing-h-10">
                <label 
                    class="icon-material txt-huger sidebar-wifinetworks-signal" 
                    label={SIGNAL_STRENGTH_ICONS[accessPoint.iconName] || "signal_wifi_0_bar"} 
                />
                <box orientation={Gtk.Orientation.VERTICAL} hexpand>
                    <label halign={Gtk.Align.START} label={accessPoint.ssid} />
                    {isActive && (
                        <label halign={Gtk.Align.START} class="txt-smaller txt-subtext" label="Selected" />
                    )}
                </box>
                <box hexpand />
                {isActive && <label class="icon-material txt-large" label="check" />}
            </box>
        </button>
    )
}

function CurrentNetwork() {
    const network = Network.get_default()
    const wifi = network.get_wifi()
    
    if (!wifi) return <box />
    
    const ssid = createBinding(wifi, "ssid")
    const state = createBinding(wifi, "state")
    const [showAuth, setShowAuth] = createState(false)
    const [authSsid, setAuthSsid] = createState("")
    
    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
            <revealer
                transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
                transitionDuration={userOptions.animations.durationLarge}
                revealChild={ssid.as(s => !!s)}
            >
                <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
                    <box class="sidebar-wifinetworks-network" orientation={Gtk.Orientation.VERTICAL}>
                        <box class="spacing-h-10">
                            <label class="icon-material txt-huger" label="language" />
                            <box orientation={Gtk.Orientation.VERTICAL} hexpand>
                                <label halign={Gtk.Align.START} class="txt-smaller txt-subtext" label="Current network" />
                                <label halign={Gtk.Align.START} label={ssid} />
                            </box>
                            <label valign={Gtk.Align.CENTER} class="txt-subtext" label={state.as(s => {
                                const stateStr = Network.DeviceState[s] || "Unknown"
                                return stateStr
                            })} />
                        </box>
                        <revealer
                            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
                            transitionDuration={userOptions.animations.durationLarge}
                            revealChild={showAuth}
                        >
                            <box orientation={Gtk.Orientation.VERTICAL} class="margin-top-10 spacing-v-5">
                                <label class="margin-left-5" halign={Gtk.Align.START} label="Authentication" />
                                <entry
                                    class="sidebar-wifinetworks-auth-entry"
                                    visibility={false}
                                    onActivate={(self) => {
                                        setShowAuth(false)
                                        execAsync(`nmcli device wifi connect '${authSsid.get()}' password '${self.get_text()}'`)
                                            .catch(console.error)
                                    }}
                                />
                            </box>
                        </revealer>
                    </box>
                    <box class="separator-line" />
                </box>
            </revealer>
        </box>
    )
}

export default function WifiNetworks() {
    const network = Network.get_default()
    const wifi = network.get_wifi()
    
    if (!wifi) {
        return (
            <box homogeneous>
                <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="txt spacing-v-10">
                    <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 txt-subtext">
                        <label class="icon-material txt-gigantic" label="wifi_off" />
                        <label class="txt-small" label="WiFi not available" />
                    </box>
                </box>
            </box>
        )
    }

    // Trigger a wifi scan
    execAsync("nmcli dev wifi list").catch(console.error)

    const accessPoints = createBinding(wifi, "accessPoints")
    const uniqueAccessPoints = accessPoints.as(aps => {
        // Deduplicate by SSID, keep strongest signal
        return Object.values(
            aps.reduce((acc: Record<string, Network.AccessPoint>, ap) => {
                if (!ap.ssid) return acc; // Skip hidden networks or empty SSIDs
                if (!acc[ap.ssid] || acc[ap.ssid].strength < ap.strength) {
                    acc[ap.ssid] = ap
                }
                return acc
            }, {})
        ).sort((a, b) => b.strength - a.strength)
    })

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
            <CurrentNetwork />
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
                        <For each={uniqueAccessPoints}>
                            {(ap) => <WifiNetwork accessPoint={ap} wifi={wifi} />}
                        </For>
                    </box>
                </scrolledwindow>
                <box 
                    $type="overlay"
                    valign={Gtk.Align.END}
                    class="sidebar-centermodules-scrollgradient-bottom" 
                />
            </overlay>
            <box homogeneous>
                <button
                    halign={Gtk.Align.CENTER}
                    class="txt-small txt sidebar-centermodules-bottombar-button"
                    onClicked={() => execAsync(userOptions.apps.network)}
                >
                    <label label="More" />
                </button>
            </box>
        </box>
    )
}
