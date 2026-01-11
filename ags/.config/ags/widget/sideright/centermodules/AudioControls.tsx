import { Gtk, Gdk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import Wp from "gi://AstalWp"
import userOptions from "../../../lib/userOptions"
import { substitute } from "../../../lib/icons"

function ConfigToggle({ 
    icon, 
    name, 
    desc, 
    value, 
    enabled = true,
    onChange 
}: { 
    icon?: any
    name?: string
    desc?: string
    value: any
    enabled?: any
    onChange: (newValue: boolean) => void
}) {
    // Accessors (functions) and Bindings (objects) both have .as in Astal
    const isReactive = value && (typeof value === "object" || typeof value === "function") && "as" in value
    const active = isReactive ? value : createState(!!value)[0]
    
    const isSensitive = (enabled && typeof enabled === "object" && "as" in enabled)
        ? enabled : createState(!!enabled)[0]
    
    // Check if icon is reactive
    const isIconReactive = icon && (typeof icon === "object" || typeof icon === "function") && "as" in icon
    
    return (
        <button
            tooltipText={desc}
            class="txt configtoggle-box"
            hexpand
            sensitive={isSensitive}
            onClicked={() => {
                const current = !!(typeof active === "function" ? active() : (active as any).get?.() ?? active)
                onChange(!current)
            }}
        >
            <box class="spacing-h-5">
                {isIconReactive ? (
                    <label class="txt icon-material txt-norm" label={icon} />
                ) : icon ? (
                    <label class="txt icon-material txt-norm" label={icon} />
                ) : null}
                {name && <label class="txt txt-small" label={name} />}
                <box hexpand />
                <box 
                    class={active.as((e: any) => `switch-bg ${!!e ? 'switch-bg-true' : ''}`)}
                    valign={Gtk.Align.CENTER}
                    halign={Gtk.Align.END}
                >
                    <box 
                        class={active.as((e: any) => `switch-fg ${!!e ? 'switch-fg-true' : ''}`)}
                        halign={Gtk.Align.START}
                        valign={Gtk.Align.CENTER}
                    />
                </box>
            </box>
        </button>
    )
}

function AppVolume({ stream }: { stream: Wp.Stream }) {
    const volume = createBinding(stream, "volume")
    const description = createBinding(stream, "description")
    const name = createBinding(stream, "name")
    
    // Try to use the icon property from the stream first, fall back to app name
    const baseIconName = stream.icon || stream.name?.toLowerCase() || "audio-x-generic-symbolic"
    const iconName = substitute(baseIconName)
    const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!)
    const iconExists = iconTheme.has_icon(iconName)

    return (
        <box class="sidebar-volmixer-stream spacing-h-10">
            {iconExists ? (
                <image
                    class="sidebar-volmixer-stream-appicon"
                    valign={Gtk.Align.CENTER}
                    iconName={iconName}
                />
            ) : (
                <label
                    class="sidebar-volmixer-stream-appicon icon-material txt-gigantic"
                    valign={Gtk.Align.CENTER}
                    label="audiotrack"
                />
            )}
            <box hexpand valign={Gtk.Align.CENTER} orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <label
                    halign={Gtk.Align.START}
                    maxWidthChars={30}
                    ellipsize={3}
                    class="txt-small"
                    label={createBinding(stream, "name").as(n => `${n} • ${stream.description}`)}
                />
                <slider
                    drawValue={false}
                    class="sidebar-volmixer-stream-slider"
                    hexpand
                    value={volume}
                    min={0}
                    max={1}
                    onChangeValue={(self) => {
                        stream.set_volume(self.get_value())
                    }}
                />
            </box>
        </box>
    )
}

import { iconExists } from "../../../lib/icons"

function AudioDeviceSelector({ input = false }: { input?: boolean }) {
    const wp = Wp.get_default()!
    const audio = wp.get_audio()!
    const [dropdownShown, setDropdownShown] = createState(false)

    const speakers = createBinding(audio, "speakers")
    const microphones = createBinding(audio, "microphones")
    const devices = input ? microphones : speakers

    const prefix = input ? "[In]" : "[Out]"
    
    // Use the devices binding to find the currently selected default device
    // The devices list has fully populated properties, unlike the defaultDevice binding
    const displayText = devices.as((devicesList: any[]) => {
        if (!devicesList || devicesList.length === 0) {
            return `${prefix} No devices`
        }
        
        // Find the device marked as default
        for (const device of devicesList) {
            const isDefault = device.is_default || device.isDefault || (typeof device.get_is_default === 'function' ? device.get_is_default() : false)
            
            if (isDefault && device.description) {
                return `${prefix} ${device.description}`
            }
        }
        
        // Fallback if no default found
        return `${prefix} Default Device`
    })

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-volmixer-deviceselector">
            <button onClicked={() => setDropdownShown(!dropdownShown.get())}>
                <box class="txt spacing-h-10">
                    <label class="icon-material txt-norm" label={input ? "mic_external_on" : "media_output"} />
                    <label
                        hexpand
                        halign={Gtk.Align.START}
                        class="txt-small"
                        ellipsize={3}
                        maxWidthChars={30}
                        label={displayText}
                    />
                    <label class="icon-material txt-norm" label={dropdownShown.as(s => s ? "expand_less" : "expand_more")} />
                </box>
            </button>
            <revealer
                transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
                transitionDuration={userOptions.animations.durationSmall}
                revealChild={dropdownShown}
            >
                <box orientation={Gtk.Orientation.VERTICAL}>
                    <box class="separator-line margin-top-5 margin-bottom-5" />
                    <box
                        orientation={Gtk.Orientation.VERTICAL}
                        class="spacing-v-5 margin-top-5"
                    >
                        <For each={devices}>
                            {(device) => {
                                const hasIcon = device.icon && iconExists(device.icon)
                                const isSelected = createBinding(device, "isDefault")
                                
                                return (
                                    <button 
                                        class="sidebar-device-option"
                                        onClicked={() => {
                                            device.set_is_default(true)
                                            setDropdownShown(false)
                                        }}
                                    >
                                        <box class="txt spacing-h-10">
                                            {hasIcon ? (
                                                <image 
                                                    class="txt-norm symbolic-icon" 
                                                    iconName={device.icon} 
                                                />
                                            ) : (
                                                <label 
                                                    class="icon-material txt-norm" 
                                                    label={input ? "mic_external_on" : "media_output"} 
                                                />
                                            )}
                                            <label
                                                hexpand
                                                halign={Gtk.Align.START}
                                                class="txt-small"
                                                ellipsize={3}
                                                maxWidthChars={30}
                                                label={device.description || device.name || "Unknown Device"}
                                            />
                                            <label 
                                                class="txt-norm sidebar-device-selected-indicator" 
                                                label={isSelected.as(s => s ? "•" : "")} 
                                            />
                                        </box>
                                    </button>
                                )
                            }}
                        </For>
                    </box>
                </box>
            </revealer>
        </box>
    )
}

export default function AudioControls() {
     const wp = Wp.get_default()
     if (!wp) return <box><label label="WirePlumber not available" /></box>

     const audio = wp.get_audio()
     if (!audio) return <box><label label="Audio not available" /></box>

     const streams = createBinding(audio, "streams").as((s) => {
         // Sort streams to keep newest at the bottom (in reverse order of addition)
         return [...s].reverse()
     })
     const speaker = audio.get_default_speaker()
     const isMuted = speaker ? createBinding(speaker, "mute") : createState(false)[0]

     return (
         <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
             <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                 <ConfigToggle
                     icon={isMuted.as((m: boolean) => m ? "volume_off" : "volume_up")}
                     name="Mute Audio"
                     value={isMuted}
                     onChange={(newValue) => {
                         if (speaker) {
                             speaker.mute = newValue
                         }
                     }}
                 />
                <box class="separator-line" />
            </box>
            <stack
                visibleChildName={streams.as(s => s.length > 0 ? "list" : "empty")}
                transitionType={Gtk.StackTransitionType.CROSSFADE}
                vexpand
            >
                <box $type="named" name="empty" homogeneous>
                    <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="txt spacing-v-10">
                        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 txt-subtext">
                            <label class="icon-material txt-gigantic" label="brand_awareness" />
                            <label class="txt-small" label="No audio source" />
                        </box>
                    </box>
                </box>
                <box $type="named" name="list" orientation={Gtk.Orientation.VERTICAL}>
                    <scrolledwindow
                        vexpand
                        hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                    >
                        <box
                            orientation={Gtk.Orientation.VERTICAL}
                            class="spacing-v-5"
                        >
                            <For each={streams}>
                                {(stream) => <AppVolume stream={stream} />}
                            </For>
                        </box>
                    </scrolledwindow>
                </box>
            </stack>
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <AudioDeviceSelector input={false} />
                <AudioDeviceSelector input={true} />
            </box>
        </box>
    )
}
