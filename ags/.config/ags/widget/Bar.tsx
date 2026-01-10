import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import userOptions from "../lib/userOptions"
import { HyprlandWorkspaces } from "./bar/Workspaces"
import { WindowTitle } from "./bar/WindowTitle"
import StatusIcons from "./bar/StatusIcons"
import { SystemTray } from "./bar/SystemTray"
import SystemMonitor from "./bar/SystemMonitor"
import Battery from "gi://AstalBattery"

interface BatteryInfo {
    percentage: number
    charging: boolean
    charged: boolean
    available: boolean
}

function getBatteryInfo(): BatteryInfo {
    try {
        const battery = Battery.get_default()

        if (!battery) {
            return { percentage: 0, charging: false, charged: false, available: false }
        }

        return {
            percentage: battery.get_percentage(),
            charging: battery.get_state() === Battery.State.CHARGING,
            charged: battery.get_state() === Battery.State.FULLY_CHARGED,
            available: true
        }
    } catch {
        return { percentage: 0, charging: false, charged: false, available: false }
    }
}

function BarBattery() {
    const battery = createPoll(
        { percentage: 0, charging: false, charged: false, available: false },
        5000,
        getBatteryInfo
    )

    if (!battery.get().available)
        return null

    return (
        <box class="spacing-h-4 bar-batt-txt" visible={battery.get().available}>
            <revealer
                transitionDuration={userOptions.animations.durationSmall}
                revealChild={battery.get().charging}
                transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
            >
                <box>
                    <label class="icon-material txt-norm" label="bolt" tooltipText="Charging" />
                </box>
            </revealer>
            <label
                class="txt-smallie"
                label={(() => `${battery.get().percentage}%`)()}
            />
            <box
                class={(() => {
                    let classes = "bar-batt"
                    if (battery.get().percentage <= userOptions.battery.low) classes += " bar-batt-low"
                    if (battery.get().charged) classes += " bar-batt-full"
                    return classes
                })()}
                valign={Gtk.Align.CENTER}
            >
                <label class="icon-material txt-small" label="battery_full" />
            </box>
        </box>
    )
}

function UtilButton({ name, icon, onClicked }: { name: string; icon: string; onClicked: () => void }) {
    return (
        <button
            class="bar-util-btn icon-material txt-norm"
            tooltipText={name}
            onClicked={onClicked}
            valign={Gtk.Align.CENTER}
        >
            <label label={icon} />
        </button>
    )
}

function Utilities() {
    return (
        <box class="spacing-h-4" halign={Gtk.Align.CENTER}>
            <UtilButton
                name="Screenshot region"
                icon="screenshot_region"
                onClicked={() => {
                    execAsync(`${GLib.getenv("HOME")}/.dotfiles/ags/.config/ags/scripts/grimblast.sh copy area`)
                        .catch(console.error)
                }}
            />
            <UtilButton
                name="Screenshot monitor"
                icon="screenshot_monitor"
                onClicked={() => {
                    execAsync(`${GLib.getenv("HOME")}/.dotfiles/ags/.config/ags/scripts/grimblast.sh copy screen`)
                        .catch(console.error)
                }}
            />
            <UtilButton
                name="Screenshot window"
                icon="capture"
                onClicked={() => {
                    // Future implementation
                }}
            />
        </box>
    )
}

function BarClock() {
    const time = createPoll("", userOptions.time.interval, () =>
        GLib.DateTime.new_now_local().format(userOptions.time.format)
    )
    const date = createPoll("", userOptions.time.dateInterval, () =>
        GLib.DateTime.new_now_local().format(userOptions.time.dateFormatLong)
    )

    return (
        <box class="spacing-h-4 bar-clock-box" valign={Gtk.Align.CENTER}>
            <label class="bar-time" label={time} />
            <label class="txt-norm txt-onLayer1" label="•" />
            <label class="txt-smallie bar-date" label={date} />
        </box>
    )
}

function BarGroup({ children }: { children: JSX.Element }) {
    return (
        <box class="bar-group-margin bar-sides">
            <box class="bar-group bar-group-standalone bar-group-pad-system">
                {children}
            </box>
        </box>
    )
}

function RightSection({ index }: { index: number }) {
    return (
        <box class="spacing-h-4">
            { /*<BarGroup> <BarBattery /> </BarGroup> */}
            <BarGroup>
                <SystemMonitor />
            </BarGroup>
            <BarGroup>
                <Utilities />
            </BarGroup>
            <SystemTray />
            <button
                onClicked={() => app.toggle_window(`sideright${index}`)}
                css="background: transparent; border: none; padding: 0; box-shadow: none;"
            >
                <BarGroup>
                    <StatusIcons />
                </BarGroup>
            </button>
            <button
                onClicked={() => app.toggle_window(`sideright${index}`)}
                css="background: transparent; border: none; padding: 0; box-shadow: none;"
            >
                <BarGroup>
                    <BarClock />
                </BarGroup>
            </button>
        </box>
    )
}

function LeftSection() {
    return (
        <box class="bar-sidemodule">
            <box class="bar-space-button">
                <WindowTitle />
            </box>
        </box>
    )
}

export default function Bar(gdkmonitor: Gdk.Monitor, index: number = 0) {
    const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

    return (
        <window
            visible
            name={`bar${index}`}
            class="Bar"
            gdkmonitor={gdkmonitor}
            exclusivity={Astal.Exclusivity.EXCLUSIVE}
            anchor={TOP | LEFT | RIGHT}
            application={app}
        >
            <centerbox class="bar-bg" cssName="centerbox">
                <box $type="start" hexpand halign={Gtk.Align.START}>
                    <WindowTitle />
                </box>
                <box $type="center" hexpand halign={Gtk.Align.CENTER}>
                    <box class="spacing-h-4">
                        <BarGroup>
                            <box class="spacing-h-4">
                                <box homogeneous>
                                    <HyprlandWorkspaces />
                                </box>
                            </box>
                        </BarGroup>
                    </box>
                </box>
                <box $type="end" hexpand halign={Gtk.Align.END}>
                    <box class="spacing-h-5 bar-spaceright">
                        <box hexpand />
                        <box class="spacing-h-15">
                            <RightSection index={index} />
                        </box>
                    </box>
                    <box class="bar-corner-spacing" />
                </box>
            </centerbox>
        </window>
    )
}
