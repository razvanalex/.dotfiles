import { Gtk, Gdk } from "ags/gtk4"
import { execAsync, exec } from "ags/process"
import { createState, createBinding } from "ags"
import Network from "gi://AstalNetwork"
import Bluetooth from "gi://AstalBluetooth"
import { NetworkIndicator, BluetoothIndicator } from "../bar/StatusIcons"
import userOptions from "../../lib/userOptions"
import GLib from "gi://GLib"

function ToggleButton({ 
    onClick, 
    onSecondaryClick, 
    child, 
    tooltipText, 
    className
}: { 
    onClick: () => void, 
    onSecondaryClick?: () => void, 
    child: JSX.Element, 
    tooltipText?: string | any,
    className?: string | any
}) {
    return (
        <button
            class={className}
            tooltipText={tooltipText}
            onClicked={onClick}
            $={(self: Gtk.Button) => {
                const controller = new Gtk.GestureClick()
                controller.set_button(Gdk.BUTTON_SECONDARY)
                controller.connect("released", () => {
                    if (onSecondaryClick) onSecondaryClick()
                })
                self.add_controller(controller)
            }}
        >
            {child}
        </button>
    )
}

export function ToggleIconWifi() {
    const network = Network.get_default()
    if (!network) return <box />
    
    const wifi = createBinding(network, "wifi")
    
    return (
        <ToggleButton
            onClick={() => {
                const w = network.get_wifi()
                if (w) w.set_enabled(!w.get_enabled())
            }}
            onSecondaryClick={() => execAsync(userOptions.apps.network)}
            child={<NetworkIndicator />}
            tooltipText={wifi.as(w => w ? `${w.ssid} | Right-click to configure` : "Wifi | Right-click to configure")}
            className={wifi.as(w => `txt-small sidebar-iconbutton ${w?.get_internet() === Network.Internet.CONNECTED ? "sidebar-button-active" : ""}`)}
        />
    )
}

export function ToggleIconBluetooth() {
    const bluetooth = Bluetooth.get_default()
    if (!bluetooth) return <box />

    const isPowered = createBinding(bluetooth, "isPowered")

    return (
        <ToggleButton
            onClick={() => bluetooth.toggle()}
            onSecondaryClick={() => execAsync(userOptions.apps.bluetooth)}
            child={<BluetoothIndicator />}
            tooltipText="Bluetooth | Right-click to configure"
            className={isPowered.as(p => `txt-small sidebar-iconbutton ${p ? "sidebar-button-active" : ""}`)}
        />
    )
}

export function ModuleNightLight() {
    const [enabled, setEnabled] = createState(false)

    // Initial check
    execAsync("pidof gammastep").then(() => setEnabled(true)).catch(() => setEnabled(false))

    return (
        <ToggleButton
            onClick={() => {
                if (enabled.get()) {
                    execAsync("pkill gammastep").then(() => setEnabled(false))
                } else {
                    execAsync("gammastep").then(() => setEnabled(true))
                }
            }}
            child={<label class="icon-material txt-norm" label="nightlight" />}
            tooltipText="Night Light"
            className={enabled.as(e => `txt-small sidebar-iconbutton ${e ? "sidebar-button-active" : ""}`)}
        />
    )
}

export function ModuleInvertColors() {
    const [enabled, setEnabled] = createState(false)

    const checkState = async () => {
        try {
            const out = await execAsync("hyprctl -j getoption decoration:screen_shader")
            const shader = JSON.parse(out).str.trim()
            setEnabled(shader !== "[[EMPTY]]" && shader !== "")
        } catch (e) {
            console.error(e)
        }
    }

    checkState()

    return (
        <ToggleButton
            onClick={async () => {
                try {
                    const out = await execAsync("hyprctl -j getoption decoration:screen_shader")
                    const shader = JSON.parse(out).str.trim()
                    if (shader !== "[[EMPTY]]" && shader !== "") {
                        await execAsync("hyprctl keyword decoration:screen_shader '[[EMPTY]]'")
                        setEnabled(false)
                    } else {
                        await execAsync(`hyprctl keyword decoration:screen_shader ${GLib.get_user_config_dir()}/hypr/shaders/invert.frag`)
                        setEnabled(true)
                    }
                } catch (e) {
                    console.error(e)
                }
            }}
            child={<label class="icon-material txt-norm" label="invert_colors" />}
            tooltipText="Color inversion"
            className={enabled.as(e => `txt-small sidebar-iconbutton ${e ? "sidebar-button-active" : ""}`)}
        />
    )
}

export function ModuleIdleInhibitor() {
    const [enabled, setEnabled] = createState(false)
    const scriptPath = `${GLib.get_user_config_dir()}/ags/scripts/wayland-idle-inhibitor.py`

    execAsync(`pidof -x wayland-idle-inhibitor.py`).then(() => setEnabled(true)).catch(() => setEnabled(false))

    return (
        <ToggleButton
            onClick={() => {
                if (enabled.get()) {
                    execAsync("pkill -f wayland-idle-inhibitor.py").then(() => setEnabled(false))
                } else {
                    execAsync(`python3 ${scriptPath}`).then(() => setEnabled(true))
                }
            }}
            child={<label class="icon-material txt-norm" label="coffee" />}
            tooltipText="Keep system awake"
            className={enabled.as(e => `txt-small sidebar-iconbutton ${e ? "sidebar-button-active" : ""}`)}
        />
    )
}

export default function QuickToggles() {
    return (
        <box class="sidebar-togglesbox spacing-h-5" halign={Gtk.Align.CENTER}>
            <ToggleIconWifi />
            <ToggleIconBluetooth />
            <ModuleNightLight />
            <ModuleInvertColors />
            <ModuleIdleInhibitor />
        </box>
    )
}
