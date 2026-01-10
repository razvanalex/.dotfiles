import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync } from "ags/process"
import userOptions from "../lib/userOptions"

function SessionButton({ 

    name, 

    icon, 

    command, 

    colorid = 0,

    className = "",

    setup 

}: { 

    name: string

    icon: string

    command: () => void

    colorid?: number

    className?: string

    setup?: (self: Gtk.Button) => void

}) {

    const [isRevealed, setIsRevealed] = createState(false)

    const [isFocused, setIsFocused] = createState(false)



    return (

        <button

            onClicked={command}

            class={isFocused.as(f => `session-button session-color-${colorid} ${className} ${f ? "session-button-focused" : ""}`)}

                        $={(self) => {

                            const motionController = new Gtk.EventControllerMotion()

                            motionController.connect("enter", () => setIsRevealed(true))

                            motionController.connect("leave", () => setIsRevealed(false))

                            self.add_controller(motionController)

                            

                            const focusController = new Gtk.EventControllerFocus()

                            focusController.connect("enter", () => {

                                setIsRevealed(true)

                                setIsFocused(true)

                            })

                            focusController.connect("leave", () => {

                                setIsRevealed(false)

                                setIsFocused(false)

                            })

                            self.add_controller(focusController)

                            

                            if (setup) setup(self)

                        }}

        >

            <box orientation={Gtk.Orientation.VERTICAL} class="session-button-box">

                <label 

                    vexpand 

                    class="icon-material" 

                    label={icon} 

                />

                <revealer

                    transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}

                    transitionDuration={userOptions.animations.durationSmall}

                    revealChild={isRevealed}

                >

                    <label 

                        class="txt-smaller session-button-desc" 

                        label={name} 

                    />

                </revealer>

            </box>

        </button>

    )

}



export default function Session(monitor: Gdk.Monitor, index: number) {

    const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor



    const close = () => app.get_windows().forEach(w => {

        if (w.name.startsWith("session")) w.visible = false

    })



    const lock = () => { close(); execAsync(["loginctl", "lock-session"]).catch(console.error) }

    const logout = () => { close(); execAsync(["bash", "-c", "pkill Hyprland || pkill sway || pkill niri || loginctl terminate-user $USER"]).catch(console.error) }

    const sleep = () => { close(); execAsync(["bash", "-c", "systemctl suspend || loginctl suspend"]).catch(console.error) }

    const hibernate = () => { close(); execAsync(["bash", "-c", "systemctl hibernate || loginctl hibernate"]).catch(console.error) }

    const shutdown = () => { close(); execAsync(["bash", "-c", "systemctl poweroff || loginctl poweroff"]).catch(console.error) }

    const reboot = () => { close(); execAsync(["bash", "-c", "systemctl reboot || loginctl reboot"]).catch(console.error) }



    let lockButton: Gtk.Button | null = null



    return (

        <window

            name={`session${index}`}

            class="session-window"

            application={app}

            gdkmonitor={monitor}

            anchor={TOP | RIGHT | BOTTOM | LEFT}

            layer={Astal.Layer.OVERLAY}

            keymode={Astal.Keymode.EXCLUSIVE}

            visible={false}

            $={(self) => {

                const controller = new Gtk.EventControllerKey()

                controller.connect("key-pressed", (_, keyval) => {

                    if (keyval === Gdk.KEY_Escape) {

                        close()

                        return true

                    }

                    return false

                })

                self.add_controller(controller)



                self.connect("notify::visible", () => {

                    if (self.visible && lockButton) {

                        lockButton.grab_focus()

                    }

                })

            }}

        >

            <box class="session-bg" orientation={Gtk.Orientation.VERTICAL}>

                <button 

                    vexpand 

                    onClicked={close} 

                    css="background: transparent; border: none; box-shadow: none;"

                />

                <box halign={Gtk.Align.CENTER} vexpand orientation={Gtk.Orientation.VERTICAL}>

                    <box valign={Gtk.Align.CENTER} orientation={Gtk.Orientation.VERTICAL} class="spacing-v-15">

                        <box orientation={Gtk.Orientation.VERTICAL} css="margin-bottom: 0.682rem;">

                            <label class="txt-title txt" label="Session" />

                            <label 

                                justify={Gtk.Justification.CENTER} 

                                class="txt-small txt" 

                                label={"Use arrow keys to navigate.\nEnter to select, Esc to cancel."} 

                            />

                        </box>

                        <box class="spacing-h-15" halign={Gtk.Align.CENTER}>

                            <SessionButton 

                                name="Lock" 

                                icon="lock" 

                                command={lock} 

                                colorid={1} 

                                setup={(self) => { lockButton = self }}

                            />

                            <SessionButton name="Logout" icon="logout" command={logout} colorid={2} />

                            <SessionButton name="Sleep" icon="sleep" command={sleep} colorid={3} />

                        </box>                        <box class="spacing-h-15" halign={Gtk.Align.CENTER}>
                            <SessionButton name="Hibernate" icon="downloading" command={hibernate} colorid={4} />
                            <SessionButton name="Shutdown" icon="power_settings_new" command={shutdown} colorid={5} />
                            <SessionButton name="Reboot" icon="restart_alt" command={reboot} colorid={6} />
                        </box>
                        <box class="spacing-h-15" halign={Gtk.Align.CENTER}>
                            <SessionButton name="Cancel" icon="close" command={close} colorid={7} className="session-button-cancel" />
                        </box>
                    </box>
                </box>
                <button
                    vexpand
                    onClicked={close}
                    css="background: transparent; border: none; box-shadow: none;"
                />
            </box>
        </window>
    )
}
