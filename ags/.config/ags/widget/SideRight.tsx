import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { getDistroIcon } from "../lib/system"
import userOptions from "../lib/userOptions"
import { execAsync } from "ags/process"
import { execBashAsync } from "../lib/proc"
import { createPoll } from "ags/time"
import GLib from "gi://GLib"

import QuickToggles from "./sideright/QuickToggles"
import SidebarOptionsStack, { nextTab, prevTab } from "./sideright/SidebarOptionsStack"
import ModuleCalendar from "./sideright/ModuleCalendar"

// Helper to check keybinds
function checkKeybind(keyval: number, state: Gdk.ModifierType, keybindStr: string): boolean {
    const parts = keybindStr.split("+")
    const key = parts[parts.length - 1]
    const mods = parts.slice(0, -1)
    
    const hasCtrl = mods.includes("Ctrl")
    const hasShift = mods.includes("Shift")
    const hasAlt = mods.includes("Alt")
    
    const stateHasCtrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0
    const stateHasShift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0
    const stateHasAlt = (state & Gdk.ModifierType.ALT_MASK) !== 0
    
    if (hasCtrl !== stateHasCtrl) return false
    if (hasShift !== stateHasShift) return false
    if (hasAlt !== stateHasAlt) return false
    
    const keyName = Gdk.keyval_name(keyval)
    return keyName?.toLowerCase() === key.toLowerCase()
}

function TimeRow() {
    const uptime = createPoll("", 60000, async () => {
        try {
            const out = await execAsync(['bash', '-c', `uptime -p | sed -e 's/up //;s/ day\\| days/d/;s/ hour\\| hours/h/;s/ minute\\| minutes/m/;s/,[^,]*//2'`])
            return `Uptime: ${out}`
        } catch {
            return "Uptime: unknown"
        }
    })

    return (
        <box class="spacing-h-10 sidebar-group-invisible-morehorizpad">
            <image iconName={getDistroIcon()} class="txt txt-larger" />
            <label 
                class="txt-small txt" 
                label={uptime}
                halign={Gtk.Align.CENTER}
            />
            <box hexpand />
            <button 
                class="sidebar-iconbutton icon-material txt-norm" 
                tooltipText="Reload"
                onClicked={() => execBashAsync("hyprctl reload; killall ags ydotool; ags &")}
            >
                <label label="refresh" />
            </button>
             <button 
                class="sidebar-iconbutton icon-material txt-norm" 
                tooltipText="Settings"
                onClicked={() => execBashAsync(userOptions.apps.settings)}
            >
                <label label="settings" />
            </button>
             <button 
                class="sidebar-iconbutton icon-material txt-norm" 
                tooltipText="Power"
                onClicked={() => {
                    const monitors = app.get_monitors()
                    monitors.forEach((_, index) => {
                        app.toggle_window(`session${index}`)
                    })
                }}
            >
                <label label="power_settings_new" />
            </button>
        </box>
    )
}

export default function SideRight(monitor: Gdk.Monitor, index: number = 0) {
    const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor
    console.log("Creating SideRight window for monitor " + index)

    try {
        return (
            <window
                name={`sideright${index}`}
                application={app}
                gdkmonitor={monitor}
                anchor={TOP | RIGHT | BOTTOM | LEFT}
                layer={Astal.Layer.OVERLAY}
                keymode={Astal.Keymode.ON_DEMAND}
                visible={false}
                $={(self: Gtk.Window) => {
                    console.log("SideRight window setup " + self.name)
                    const controller = new Gtk.EventControllerKey()
                    controller.connect("key-pressed", (_, keyval, keycode, state) => {
                        // Close on Escape
                        if (keyval === Gdk.KEY_Escape) {
                            self.visible = false
                            return true
                        }
                        
                        // Tab navigation keybinds
                        if (checkKeybind(keyval, state, userOptions.keybinds.sidebar.options.nextTab)) {
                            nextTab()
                            return true
                        }
                        if (checkKeybind(keyval, state, userOptions.keybinds.sidebar.options.prevTab)) {
                            prevTab()
                            return true
                        }
                        
                        return false
                    })
                    self.add_controller(controller)
                }}
            >
                <box>
                    <button 
                        hexpand 
                        css="background: transparent; border: none; box-shadow: none;"
                        onClicked={() => app.toggle_window(`sideright${index}`)} 
                    />
                    <box 
                        orientation={Gtk.Orientation.VERTICAL}
                        class="sidebar-right spacing-v-15"
                        hexpand={false}
                    >
                        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                            <TimeRow />
                            <QuickToggles />
                        </box>
                        <box class="sidebar-group">
                            <SidebarOptionsStack />
                        </box>
                        <ModuleCalendar />
                    </box>
                </box>
            </window>
        )
    } catch (e) {
        console.error("Error creating SideRight window:", e)
        return <window name={`sideright${index}`} application={app}><label label="Error creating window. Check logs." /></window>
    }
}
