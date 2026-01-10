import { Gtk } from "ags/gtk4"
import { createBinding, createState } from "ags"
import Network from "gi://AstalNetwork"
import Bluetooth from "gi://AstalBluetooth"
import Wp from "gi://AstalWp"
import Notifd from "gi://AstalNotifd"
import userOptions from "../../lib/userOptions"

export function NetworkIndicator() {
    const network = Network.get_default()
    const wifiBinding = createBinding(network, "wifi")
    const wiredBinding = createBinding(network, "wired")
    const primaryBinding = createBinding(network, "primary")

    return (
        <label
            class="txt-norm icon-material"
            label={(() => {
                const primary = primaryBinding.get()
                const wifi = wifiBinding.get()
                const wired = wiredBinding.get()

                if (primary === Network.Primary.WIRED && wired) {
                    return "lan"
                }

                if (primary === Network.Primary.WIFI && wifi) {
                    const strength = wifi.get_strength()
                    if (strength > 75) return "signal_wifi_4_bar"
                    if (strength > 50) return "network_wifi_3_bar"
                    if (strength > 25) return "network_wifi_2_bar"
                    if (strength > 0) return "network_wifi_1_bar"
                    return "signal_wifi_0_bar"
                }

                return "wifi_off"
            })()}
        />
    )
}

export function BluetoothIndicator() {
    const bluetooth = Bluetooth.get_default()
    const enabledBinding = createBinding(bluetooth, "isPowered")

    return (
        <label
            class="txt-norm icon-material"
            label={enabledBinding.as((enabled) => enabled ? "bluetooth" : "bluetooth_disabled")}
        />
    )
}

function MicMuteIndicator() {
    const audio = Wp.get_default()?.get_audio()
    if (!audio) return <box />

    const defaultMic = createBinding(audio, "defaultMicrophone")

    return (
        <revealer
            transitionDuration={userOptions.animations.durationSmall}
            revealChild={defaultMic.as((mic) => mic?.get_mute() || false)}
            transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
        >
            <box>
                <label class="txt-norm icon-material" label="mic_off" />
            </box>
        </revealer>
    )
}

function NotificationIndicator() {
    const notifd = Notifd.get_default()

    // Force update notifications binding when signals fire
    const updateNotifications = () => {
        notifd.notify("notifications")
    }

    notifd.connect("notified", updateNotifications)
    notifd.connect("resolved", updateNotifications)

    const notificationsBinding = createBinding(notifd, "notifications")

    return (
        <revealer
            transitionDuration={userOptions.animations.durationSmall}
            revealChild={notificationsBinding.as((notifs) => notifs.length > 0)}
            transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
        >
            <box class="spacing-h-4">
                <label class="txt-norm icon-material" label="notifications" />
                <label
                    class="txt-small titlefont"
                    label={notificationsBinding.as((notifs) => `${notifs.length}`)}
                />
            </box>
        </revealer>
    )
}

export default function StatusIcons() {
    return (
        <box class="spacing-h-5">
            <NotificationIndicator />
            <MicMuteIndicator />
            <NetworkIndicator />
            <BluetoothIndicator />
        </box>
    )
}
