import { Gtk } from "ags/gtk4"
import { createState, createBinding, For } from "ags"
import Wp from "gi://AstalWp"
import userOptions from "../../../lib/userOptions"

function AppVolume({ stream }: { stream: Wp.Stream }) {
    const volume = createBinding(stream, "volume")
    const description = createBinding(stream, "description")

    return (
        <box class="sidebar-volmixer-stream spacing-h-10">
            <image
                class="sidebar-volmixer-stream-appicon"
                valign={Gtk.Align.CENTER}
                iconName={stream.icon || "audio-x-generic-symbolic"}
            />
            <box hexpand valign={Gtk.Align.CENTER} orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <label
                    halign={Gtk.Align.START}
                    maxWidthChars={30}
                    ellipsize={3}
                    class="txt-small"
                    label={description}
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

function AudioDeviceSelector({ input = false }: { input?: boolean }) {
    const wp = Wp.get_default()!
    const audio = wp.get_audio()!
    const [dropdownShown, setDropdownShown] = createState(false)

    const speakers = createBinding(audio, "speakers")
    const microphones = createBinding(audio, "microphones")
    const devices = input ? microphones : speakers

    const defaultDevice = input
        ? createBinding(audio, "defaultMicrophone")
        : createBinding(audio, "defaultSpeaker")

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
                        label={defaultDevice.as(d => `${input ? "[In]" : "[Out]"} ${d?.description || "Unknown"}`)}
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
                            {(device) => (
                                <button onClicked={() => {
                                    device.set_is_default(true)
                                    setDropdownShown(false)
                                }}>
                                    <box class="txt spacing-h-10">
                                        <label class="icon-material txt-norm" label={input ? "mic_external_on" : "media_output"} />
                                        <label
                                            hexpand
                                            halign={Gtk.Align.START}
                                            class="txt-small"
                                            ellipsize={3}
                                            maxWidthChars={30}
                                            label={device.description || "Unknown"}
                                        />
                                    </box>
                                </button>
                            )}
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

    const streams = createBinding(audio, "streams")

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
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
