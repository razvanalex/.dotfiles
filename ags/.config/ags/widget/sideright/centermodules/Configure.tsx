import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync, exec } from "ags/process"
import GLib from "gi://GLib"
import userOptions from "../../../lib/userOptions"
import { darkMode, toggleDarkMode } from "../../../lib/system"

function ConfigGap({ vertical = true, size = 5 }: { vertical?: boolean, size?: number }) {
    return <box class={`gap-${vertical ? 'v' : 'h'}-${size}`} />
}

function ConfigToggle({ 
    icon, 
    name, 
    desc, 
    initValue, 
    onChange 
}: { 
    icon?: string
    name?: string
    desc?: string
    initValue: boolean
    onChange: (newValue: boolean) => void
}) {
    const [enabled, setEnabled] = createState(initValue)
    
    return (
        <button
            tooltipText={desc}
            class="txt configtoggle-box"
            hexpand
            onClicked={() => {
                const newValue = !enabled.get()
                setEnabled(newValue)
                onChange(newValue)
            }}
        >
            <box class="spacing-h-5">
                {icon && <label class="txt icon-material txt-norm" label={icon} />}
                {name && <label class="txt txt-small" label={name} />}
                <box hexpand />
                <box 
                    class={enabled.as(e => `switch-bg ${e ? 'switch-bg-true' : ''}`)}
                    valign={Gtk.Align.CENTER}
                    halign={Gtk.Align.END}
                >
                    <box 
                        class={enabled.as(e => `switch-fg ${e ? 'switch-fg-true' : ''}`)}
                        halign={Gtk.Align.START}
                        valign={Gtk.Align.CENTER}
                    />
                </box>
            </box>
        </button>
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
        <box class="txt spacing-h-5 configtoggle-box" tooltipText={desc} hexpand>
            <label class="txt icon-material txt-norm" label={icon} />
            <label class="txt txt-small" label={name} />
            <box hexpand />
            <Gtk.SpinButton
                class="spinbutton"
                valign={Gtk.Align.CENTER}
                adjustment={new Gtk.Adjustment({
                    lower: minValue,
                    upper: maxValue,
                    step_increment: step,
                    page_increment: step * 10,
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
    disableValue = 0,
    extraOnChange
}: { 
    icon: string
    name: string
    desc?: string
    option: string
    enableValue?: number
    disableValue?: number
    extraOnChange?: (newValue: boolean) => void
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
                if (extraOnChange) extraOnChange(newValue)
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

function calculateSchemeInitIndex(optionsArr: { name: string, value: any }[][], searchValue: string): [number, number] {
    if (!searchValue) searchValue = 'vibrant';
    for (let i = 0; i < optionsArr.length; i++) {
        for (let j = 0; j < optionsArr[i].length; j++) {
            if (optionsArr[i][j].value === searchValue) {
                return [i, j];
            }
        }
    }
    return [0, 0];
}

const schemeOptionsArr = [
    [
        { name: 'Tonal Spot', value: 'tonalspot' },
        { name: 'Fruit Salad', value: 'fruitsalad' },
        { name: 'Fidelity', value: 'fidelity' },
        { name: 'Rainbow', value: 'rainbow' },
    ],
    [
        { name: 'Neutral', value: 'neutral' },
        { name: 'Monochrome', value: 'monochrome' },
        { name: 'Expressive', value: 'expressive' },
        { name: 'Vibrant', value: 'vibrant' },
    ],
    [
        { name: 'Vibrant+', value: 'morevibrant' },
    ],
];

function ConfigMulipleSelection({
    optionsArr,
    initIndex,
    onChange
}: {
    optionsArr: { name: string, value: any }[][]
    initIndex: [number, number]
    onChange: (value: any, name: string) => void
}) {
    const [lastSelected, setLastSelected] = createState(initIndex)

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="multipleselection-container spacing-v-3">
            {optionsArr.map((options, grp) => (
                <box class="spacing-h-5" halign={Gtk.Align.CENTER}>
                    {options.map((option, id) => (
                        <button
                            class={lastSelected.as(([g, i]) => 
                                `multipleselection-btn ${i === id && g === grp ? 'multipleselection-btn-enabled' : ''}`
                            )}
                            onClicked={() => {
                                setLastSelected([grp, id])
                                onChange(option.value, option.name)
                            }}
                            label={option.name}
                        />
                    ))}
                </box>
            ))}
        </box>
    )
}

function ColorSchemeSettings() {
    const stateDir = GLib.get_user_state_dir()
    const configDir = GLib.get_user_config_dir()
    
    let initScheme = 'vibrant'
    let transparencyInit = false
    let gradienceInit = 0
    
    try {
        initScheme = exec(`bash -c "sed -n '3p' ${stateDir}/ags/user/colormode.txt"`).trim()
        transparencyInit = exec(`bash -c "sed -n '2p' ${stateDir}/ags/user/colormode.txt"`).trim() === "transparent"
        gradienceInit = exec(`bash -c "sed -n '4p' ${stateDir}/ags/user/colormode.txt"`).trim() === "yesgradience" ? 1 : 0
    } catch (e) {}

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="osd-colorscheme-settings spacing-v-5 margin-20" valign={Gtk.Align.CENTER}>
            <box orientation={Gtk.Orientation.VERTICAL}>
                <label halign={Gtk.Align.CENTER} class="txt-norm titlefont txt" label="Options" />
                <ConfigToggle
                    icon="dark_mode"
                    name="Dark Mode"
                    desc="Ya should go to sleep!"
                    initValue={darkMode.get()}
                    onChange={() => toggleDarkMode()}
                />
                <ConfigToggle
                    icon="border_clear"
                    name="Transparency"
                    desc="Make shell elements transparent"
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
                
                <box class="txt spacing-h-5 configtoggle-box" tooltipText="Theme GTK apps using accent color\n(drawback: dark/light mode switching requires restart)">
                    <label class="icon-material txt-norm" label="imagesearch_roller" />
                    <label class="txt txt-small" label="Use Gradience" />
                    <box hexpand />
                    <ConfigMulipleSelection
                        optionsArr={[[{ name: 'Off', value: 0 }, { name: 'On', value: 1 }]]}
                        initIndex={[0, gradienceInit]}
                        onChange={(value) => {
                             const ADWAITA_BLUE = "#3584E4";
                             if (value) execAsync(["bash", "-c", `${configDir}/ags/scripts/color_generation/switchcolor.sh - --yes-gradience`]).catch(console.error);
                             else execAsync(["bash", "-c", `${configDir}/ags/scripts/color_generation/switchcolor.sh "${ADWAITA_BLUE}" --no-gradience`]).catch(console.error);
                        }}
                    />
                </box>
            </box>
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <label halign={Gtk.Align.CENTER} class="txt-norm titlefont txt margin-top-5" label="Scheme styles" />
                <ConfigMulipleSelection
                    optionsArr={schemeOptionsArr}
                    initIndex={calculateSchemeInitIndex(schemeOptionsArr, initScheme)}
                    onChange={(value) => {
                        execAsync(["bash", "-c", `mkdir -p ${stateDir}/ags/user && sed -i "3s/.*/${value}/" ${stateDir}/ags/user/colormode.txt`])
                            .then(() => execAsync(["bash", "-c", `${configDir}/ags/scripts/color_generation/switchcolor.sh`]))
                            .catch(console.error)
                    }}
                />
            </box>
        </box>
    )
}

function ColorSchemeSettingsRevealer() {
    const [revealed, setRevealed] = createState(false)
    
    return (
        <box orientation={Gtk.Orientation.VERTICAL}>
            <button
                halign={Gtk.Align.END}
                class="osd-settings-btn-arrow"
                onClicked={() => setRevealed(!revealed.get())}
            >
                <label 
                    class="icon-material txt-norm" 
                    label={revealed.as(r => r ? "expand_less" : "expand_more")} 
                />
            </button>
            <revealer
                revealChild={revealed}
                transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
                transitionDuration={200}
            >
                <ColorSchemeSettings />
            </revealer>
        </box>
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
        transparencyInit = colorMode.trim() === "transparent"
    } catch (e) {
        // File may not exist
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5" vexpand hexpand>
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
                        <ColorSchemeSettingsRevealer />
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
                        <ConfigGap />
                        <HyprlandToggle
                            icon="animation"
                            name="Animations"
                            desc="Enable animations"
                            option="animations:enabled"
                            extraOnChange={(newValue) => {
                                execAsync(["gsettings", "set", "org.gnome.desktop.interface", "enable-animations", `${newValue}`])
                                    .catch(console.error)
                            }}
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
