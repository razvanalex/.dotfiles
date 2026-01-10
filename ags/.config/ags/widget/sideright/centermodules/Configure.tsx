import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync, exec } from "ags/process"
import GLib from "gi://GLib"
import userOptions from "../../../lib/userOptions"

function ConfigToggle({ 
    icon, 
    name, 
    desc, 
    initValue, 
    onChange 
}: { 
    icon: string
    name: string
    desc?: string
    initValue: boolean
    onChange: (newValue: boolean) => void
}) {
    const [enabled, setEnabled] = createState(initValue)
    
    return (
        <box class="spacing-h-10" tooltipText={desc}>
            <label class="icon-material txt-norm" label={icon} />
            <label hexpand halign={Gtk.Align.START} class="txt-small" label={name} />
            <switch
                active={enabled}
                valign={Gtk.Align.CENTER}
                onStateSet={(self) => {
                    const newValue = self.get_active()
                    setEnabled(newValue)
                    onChange(newValue)
                    return false
                }}
            />
        </box>
    )
}

function ConfigSpinButton({
    icon,
    name,
    desc,
    initValue,
    minValue,
    maxValue,
    step = 1,
    onChange
}: {
    icon: string
    name: string
    desc?: string
    initValue: number
    minValue: number
    maxValue: number
    step?: number
    onChange: (newValue: number) => void
}) {
    return (
        <box class="spacing-h-10" tooltipText={desc}>
            <label class="icon-material txt-norm" label={icon} />
            <label hexpand halign={Gtk.Align.START} class="txt-small" label={name} />
            <Gtk.SpinButton
                valign={Gtk.Align.CENTER}
                adjustment={new Gtk.Adjustment({
                    lower: minValue,
                    upper: maxValue,
                    step_increment: step,
                    value: initValue
                })}
                onValueChanged={(self) => onChange(self.get_value())}
            />
        </box>
    )
}

function HyprlandToggle({ 
    icon, 
    name, 
    desc, 
    option, 
    enableValue = 1, 
    disableValue = 0 
}: { 
    icon: string
    name: string
    desc?: string
    option: string
    enableValue?: number
    disableValue?: number
}) {
    let initValue = false
    try {
        const result = exec(`hyprctl getoption -j ${option}`)
        initValue = JSON.parse(result).int !== 0
    } catch (e) {
        console.error(e)
    }
    
    return (
        <ConfigToggle
            icon={icon}
            name={name}
            desc={desc}
            initValue={initValue}
            onChange={(newValue) => {
                execAsync(["hyprctl", "keyword", option, `${newValue ? enableValue : disableValue}`])
                    .catch(console.error)
            }}
        />
    )
}

function HyprlandSpinButton({
    icon,
    name,
    desc,
    option,
    minValue,
    maxValue,
    step = 1
}: {
    icon: string
    name: string
    desc?: string
    option: string
    minValue: number
    maxValue: number
    step?: number
}) {
    let initValue = 0
    try {
        const result = exec(`hyprctl getoption -j ${option}`)
        initValue = JSON.parse(result).int
    } catch (e) {
        console.error(e)
    }
    
    return (
        <ConfigSpinButton
            icon={icon}
            name={name}
            desc={desc}
            initValue={initValue}
            minValue={minValue}
            maxValue={maxValue}
            step={step}
            onChange={(newValue) => {
                execAsync(["hyprctl", "keyword", option, `${newValue}`])
                    .catch(console.error)
            }}
        />
    )
}

function Subcategory({ children }: { children: JSX.Element | JSX.Element[] }) {
    return (
        <box class="margin-left-20" orientation={Gtk.Orientation.VERTICAL}>
            {children}
        </box>
    )
}

function ConfigSection({ name, children }: { name: string, children: JSX.Element | JSX.Element[] }) {
    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
            <label halign={Gtk.Align.CENTER} class="txt txt-large margin-left-10" label={name} />
            <box class="margin-left-10 margin-right-10" orientation={Gtk.Orientation.VERTICAL}>
                {children}
            </box>
        </box>
    )
}

function ColorBox({ name, className }: { name: string, className: string }) {
    return (
        <box class={className} tooltipText={name}>
            <label class="txt-tiny" label={name} />
        </box>
    )
}

export default function Configure() {
    const stateDir = GLib.get_user_state_dir()
    const configDir = GLib.get_user_config_dir()
    
    let transparencyInit = false
    try {
        const colorMode = exec(`bash -c "sed -n '2p' ${stateDir}/ags/user/colormode.txt"`)
        transparencyInit = colorMode === "transparent"
    } catch (e) {
        // File may not exist
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
            <scrolledwindow vexpand hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC} vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}>
                <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
                    <ConfigSection name="Color scheme">
                        <box class="spacing-h-5" halign={Gtk.Align.CENTER}>
                            <ColorBox name="P" className="osd-color osd-color-primary" />
                            <ColorBox name="S" className="osd-color osd-color-secondary" />
                            <ColorBox name="T" className="osd-color osd-color-tertiary" />
                            <ColorBox name="Sf" className="osd-color osd-color-surface" />
                            <ColorBox name="Sf-i" className="osd-color osd-color-inverseSurface" />
                            <ColorBox name="E" className="osd-color osd-color-error" />
                        </box>
                        <box class="spacing-h-5" halign={Gtk.Align.CENTER}>
                            <ColorBox name="P-c" className="osd-color osd-color-primaryContainer" />
                            <ColorBox name="S-c" className="osd-color osd-color-secondaryContainer" />
                            <ColorBox name="T-c" className="osd-color osd-color-tertiaryContainer" />
                            <ColorBox name="Sf-c" className="osd-color osd-color-surfaceContainer" />
                            <ColorBox name="Sf-v" className="osd-color osd-color-surfaceVariant" />
                            <ColorBox name="E-c" className="osd-color osd-color-errorContainer" />
                        </box>
                    </ConfigSection>
                    
                    <ConfigSection name="Effects">
                        <ConfigToggle
                            icon="border_clear"
                            name="Transparency"
                            desc="Make shell elements transparent. Blur is also recommended if you enable this."
                            initValue={transparencyInit}
                            onChange={(newValue) => {
                                const transparency = newValue ? "transparent" : "opaque"
                                execAsync([
                                    "bash", "-c",
                                    `mkdir -p ${stateDir}/ags/user && sed -i "2s/.*/${transparency}/" ${stateDir}/ags/user/colormode.txt`
                                ]).then(() => 
                                    execAsync(["bash", "-c", `${configDir}/ags/scripts/color_generation/switchcolor.sh`])
                                ).catch(console.error)
                            }}
                        />
                        <HyprlandToggle
                            icon="blur_on"
                            name="Blur"
                            desc="Enable blur on transparent elements"
                            option="decoration:blur:enabled"
                        />
                        <Subcategory>
                            <HyprlandToggle
                                icon="stack_off"
                                name="X-ray"
                                desc="Make everything behind a window except wallpaper not rendered on blurred surface"
                                option="decoration:blur:xray"
                            />
                            <HyprlandSpinButton
                                icon="target"
                                name="Size"
                                desc="Adjust blur radius"
                                option="decoration:blur:size"
                                minValue={1}
                                maxValue={1000}
                            />
                            <HyprlandSpinButton
                                icon="repeat"
                                name="Passes"
                                desc="Number of blur passes"
                                option="decoration:blur:passes"
                                minValue={1}
                                maxValue={10}
                            />
                        </Subcategory>
                        <box css="min-height: 10px;" />
                        <HyprlandToggle
                            icon="animation"
                            name="Animations"
                            desc="Enable animations"
                            option="animations:enabled"
                        />
                        <Subcategory>
                            <ConfigSpinButton
                                icon="clear_all"
                                name="Choreography delay"
                                desc="Delay between animations of a series (ms)"
                                initValue={userOptions.animations.choreographyDelay}
                                minValue={0}
                                maxValue={1000}
                                step={10}
                                onChange={(newValue) => {
                                    userOptions.animations.choreographyDelay = newValue
                                }}
                            />
                        </Subcategory>
                    </ConfigSection>
                    
                    <ConfigSection name="Developer">
                        <HyprlandToggle
                            icon="speed"
                            name="Show FPS"
                            desc="Show FPS overlay on top-left corner"
                            option="debug:overlay"
                        />
                        <HyprlandToggle
                            icon="sort"
                            name="Log to stdout"
                            desc="Print LOG, ERR, WARN messages to console"
                            option="debug:enable_stdout_logs"
                        />
                        <HyprlandToggle
                            icon="motion_sensor_active"
                            name="Damage tracking"
                            desc="Enable damage tracking"
                            option="debug:damage_tracking"
                            enableValue={2}
                        />
                        <HyprlandToggle
                            icon="destruction"
                            name="Damage blink"
                            desc="Show screen damage flashes (Epilepsy warning!)"
                            option="debug:damage_blink"
                        />
                    </ConfigSection>
                </box>
            </scrolledwindow>
            <box homogeneous>
                <label halign={Gtk.Align.CENTER} class="txt txt-italic txt-subtext margin-5" label="Not all changes are saved" />
            </box>
        </box>
    )
}
