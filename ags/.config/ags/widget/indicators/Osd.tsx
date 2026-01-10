import { Gtk } from "ags/gtk4"
import { createState, createBinding, onCleanup } from "ags"
import Wp from "gi://AstalWp"
import BrightnessService from "../../services/Brightness"
import GLib from "gi://GLib"
import userOptions from "../../lib/userOptions"

export default function Osd({ onVisible }: { onVisible?: (v: boolean) => void }) {
    const wp = Wp.get_default()?.get_audio()
    
    const [visible, setVisible] = createState(false)
    const [mode, setMode] = createState<"volume" | "brightness" | "microphone">("brightness")
    const [val, setVal] = createState(0)
    const [isMuted, setIsMuted] = createState(false)
    const [iconName, setIconName] = createState("light_mode")
    const [isHovered, setIsHovered] = createState(false)

    // State tracking to prevent spurious updates
    let lastSpeakerVol = -1
    let lastSpeakerMute: boolean | null = null
    let lastMicVol = -1
    let lastMicMute: boolean | null = null

    let timer: number | null = null
    const resetTimer = () => {
        if (timer) GLib.source_remove(timer)
        if (isHovered.get()) {
            timer = null
            return
        }
        
        setVisible(true)
        if (onVisible) onVisible(true)
        
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            setVisible(false)
            if (onVisible) onVisible(false)
            timer = null
            return GLib.SOURCE_REMOVE
        })
    }

    const updateIcon = () => {
        if (mode.get() === "brightness") {
            setIconName("light_mode")
        } else if (mode.get() === "microphone") {
            setIconName(isMuted.get() ? "mic_off" : "mic")
        } else {
            setIconName(isMuted.get() ? "volume_off" : "volume_up")
        }
    }

    mode.subscribe(updateIcon)
    isMuted.subscribe(updateIcon)

    // Brightness subscription (Manual)
    const brightId = BrightnessService.connect("notify::screen-value", () => {
        const v = BrightnessService.screen_value
        setMode("brightness")
        setVal(v)
        resetTimer()
    })

    let currentSpeaker: Wp.Endpoint | null = null
    let currentMic: Wp.Endpoint | null = null

    // Audio Logic
    if (wp) {
        let volumeSignal: number | undefined
        let muteSignal: number | undefined
        
        let micVolumeSignal: number | undefined
        let micMuteSignal: number | undefined
        
        let audioReady = false

        // Suppress startup signals
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            audioReady = true
            return GLib.SOURCE_REMOVE
        })

        const updateAudio = (show = true) => {
            if (currentSpeaker) {
                const vol = currentSpeaker.volume
                const mute = currentSpeaker.mute
                const changed = vol !== lastSpeakerVol || mute !== lastSpeakerMute
                
                lastSpeakerVol = vol
                lastSpeakerMute = mute

                if (show && changed) {
                    setMode("volume")
                    setVal(vol)
                    setIsMuted(mute)
                    if (audioReady) resetTimer()
                }
            }
        }

        const updateMic = (show = true) => {
            if (currentMic) {
                const vol = currentMic.volume
                const mute = currentMic.mute
                const changed = vol !== lastMicVol || mute !== lastMicMute

                lastMicVol = vol
                lastMicMute = mute

                if (show && changed) {
                    setMode("microphone")
                    setVal(vol)
                    setIsMuted(mute)
                    if (audioReady) resetTimer()
                }
            }
        }

        const connectSpeaker = (speaker: Wp.Endpoint | null) => {
            if (currentSpeaker) {
                if (volumeSignal) currentSpeaker.disconnect(volumeSignal)
                if (muteSignal) currentSpeaker.disconnect(muteSignal)
            }
            currentSpeaker = speaker
            if (currentSpeaker) {
                volumeSignal = currentSpeaker.connect("notify::volume", () => updateAudio(true))
                muteSignal = currentSpeaker.connect("notify::mute", () => updateAudio(true))
                updateAudio(false)
            }
        }

        const connectMic = (mic: Wp.Endpoint | null) => {
            if (currentMic) {
                if (micVolumeSignal) currentMic.disconnect(micVolumeSignal)
                if (micMuteSignal) currentMic.disconnect(micMuteSignal)
            }
            currentMic = mic
            if (currentMic) {
                micVolumeSignal = currentMic.connect("notify::volume", () => updateMic(true))
                micMuteSignal = currentMic.connect("notify::mute", () => updateMic(true))
                updateMic(false)
            }
        }

        connectSpeaker(wp.defaultSpeaker)
        connectMic(wp.defaultMicrophone)

        const defaultSpeakerSig = wp.connect("notify::default-speaker", () => {
            connectSpeaker(wp.defaultSpeaker)
        })
        
        const defaultMicSig = wp.connect("notify::default-microphone", () => {
            connectMic(wp.defaultMicrophone)
        })

        onCleanup(() => {
            wp.disconnect(defaultSpeakerSig)
            wp.disconnect(defaultMicSig)
            if (currentSpeaker) {
                if (volumeSignal) currentSpeaker.disconnect(volumeSignal)
                if (muteSignal) currentSpeaker.disconnect(muteSignal)
            }
            if (currentMic) {
                if (micVolumeSignal) currentMic.disconnect(micVolumeSignal)
                if (micMuteSignal) currentMic.disconnect(micMuteSignal)
            }
        })
    }

    onCleanup(() => {
        BrightnessService.disconnect(brightId)
        if (timer) GLib.source_remove(timer)
    })

    const boxContent = (
        <box
            class={mode.as(m => `osd-bg osd-value margin-bottom-10 osd-${m}`)}
            spacing={15}
        >
            <button
                class="osd-icon-btn"
                valign={Gtk.Align.CENTER}
                onClicked={() => {
                    resetTimer()
                    const m = mode.get()
                    if (m === "volume" && currentSpeaker) {
                        currentSpeaker.mute = !currentSpeaker.mute
                    } else if (m === "microphone" && currentMic) {
                        currentMic.mute = !currentMic.mute
                    }
                }}
            >
                <label
                    class="icon-material txt-huger"
                    label={iconName}
                />
            </button>
            <box orientation={Gtk.Orientation.VERTICAL} spacing={5} hexpand>
                <box spacing={10}>
                    <label 
                        class="osd-label" 
                        halign={Gtk.Align.START} 
                        hexpand 
                        label={mode.as(m => {
                            if (m === "volume") return "Volume"
                            if (m === "microphone") return "Microphone"
                            return "Brightness"
                        })} 
                    />
                    <label 
                        class="osd-label" 
                        label={val.as(v => `${Math.round(v * 100)}%`)} 
                    />
                </box>
                <slider
                    class={mode.as(m => {
                        if (m === "brightness") return "osd-progress osd-brightness-progress"
                        if (m === "microphone") return "osd-progress osd-microphone-progress"
                        return "osd-progress osd-volume-progress"
                    })}
                    hexpand
                    value={val}
                    drawValue={false}
                    onChangeValue={(self) => {
                        resetTimer()
                        const v = self.value
                        const m = mode.get()
                        if (m === "volume" && currentSpeaker) {
                            currentSpeaker.volume = v
                        } else if (m === "microphone" && currentMic) {
                            currentMic.volume = v
                        } else if (m === "brightness") {
                            BrightnessService.screen_value = v
                        }
                    }}
                />
            </box>
        </box>
    ) as Gtk.Box

    const controller = new Gtk.EventControllerMotion()
    controller.connect("enter", () => {
        setIsHovered(true)
        if (timer) {
            GLib.source_remove(timer)
            timer = null
        }
        setVisible(true)
    })
    controller.connect("leave", () => {
        setIsHovered(false)
        resetTimer()
    })
    boxContent.add_controller(controller)

    return (
        <revealer
            revealChild={visible}
            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
            transitionDuration={userOptions.animations.durationLarge}
        >
            {boxContent}
        </revealer>
    )
}