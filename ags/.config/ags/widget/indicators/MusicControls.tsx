import { Gtk } from "ags/gtk4";
import { createState } from "ags";
import GLib from "gi://GLib";
import { execAsync } from "ags/process";

interface PlayerState {
    status: "playing" | "paused" | "stopped";
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    position: number;
    length: number;
    available: boolean;
}

const [playerState, setPlayerState] = createState<PlayerState>({
    status: "stopped",
    title: "",
    artist: "",
    album: "",
    coverUrl: "",
    position: 0,
    length: 0,
    available: false,
});

let currentPlayerState: PlayerState = {
    status: "stopped",
    title: "",
    artist: "",
    album: "",
    coverUrl: "",
    position: 0,
    length: 0,
    available: false,
};

const updateState = (newState: PlayerState) => {
    currentPlayerState = newState;
    setPlayerState(newState);
}

const execNoExcept = (cmd: string): string => {
    try {
        const result = GLib.spawn_command_line_sync(cmd);
        return result[1] ? new TextDecoder().decode(result[1]).trim() : "";
    } catch (e) {
        return "";
    }
};

async function updatePlayerState() {
    try {
        const status = execNoExcept("playerctl status");

        if (!status || status.includes("No players found")) {
            updateState({
                status: "stopped",
                title: "",
                artist: "",
                album: "",
                coverUrl: "",
                position: 0,
                length: 0,
                available: false,
            });
            return;
        }

        const title = execNoExcept("playerctl metadata title");
        const artist = execNoExcept("playerctl metadata artist");
        const album = execNoExcept("playerctl metadata album");
        const coverUrl = execNoExcept("playerctl metadata mpris:artUrl");
        const positionStr = execNoExcept("playerctl position");
        const lengthStr = execNoExcept("playerctl metadata mpris:length");

        updateState({
            status: status.toLowerCase() as "playing" | "paused" | "stopped",
            title: title || "Unknown",
            artist: artist || "Unknown Artist",
            album: album || "",
            coverUrl: coverUrl || "",
            position: parseFloat(positionStr) || 0,
            length: parseInt(lengthStr) / 1000000 || 0,
            available: true,
        });
    } catch (e) {
        updateState({
            ...currentPlayerState,
            available: false,
        });
    }
}

GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    updatePlayerState().catch(console.error);
    return true;
});

updatePlayerState().catch(console.error);

function formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
}

function PlayButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl play-pause").catch(console.error);
            }}
        >
            <label
                class="icon-material osd-music-controlbtn-txt"
                label={playerState.as((s) => (s.status === "playing" ? "pause" : "play_arrow"))}
            />
        </button>
    );
}

function PreviousButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl previous").catch(console.error);
            }}
        >
            <label class="icon-material osd-music-controlbtn-txt" label="skip_previous" />
        </button>
    );
}

function NextButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl next").catch(console.error);
            }}
        >
            <label class="icon-material osd-music-controlbtn-txt" label="skip_next" />
        </button>
    );
}

export default function MusicControls() {
    return ""
    //     return (
    //         <revealer
    //             transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
    //             revealChild={playerState.as((s) => s.available)}
    //             transitionDuration={200}
    //         >
    //             <box class="osd-music spacing-h-20" visible={playerState.as((s) => s.available)}>
    //                 <box class="osd-music-cover" valign={Gtk.Align.CENTER}>
    //                     <box class="osd-music-cover-art" homogeneous>
    //                         {playerState.as((s) =>
    //                             s.coverUrl && s.coverUrl.startsWith("file://") ? (
    //                                 <box
    //                                     css={`background-image: url('${s.coverUrl.replace("file://", "")}');`}
    //                                     class="osd-music-cover-real"
    //                                 />
    //                             ) : (
    //                                 <box class="osd-music-cover-fallback" homogeneous>
    //                                     <label class="icon-material txt-gigantic" label="music_note" />
    //                                 </box>
    //                             )
    //                         )}
    //                     </box>
    //                 </box>
    //
    //                 <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 osd-music-info">
    //                     <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
    //                         <label
    //                             class="osd-music-title"
    //                             label={playerState.as((s) => s.title || "No music playing")}
    //                             xalign={0}
    //                             ellipsize={3}
    //                         />
    //                         <label
    //                             class="osd-music-artists"
    //                             label={playerState.as((s) => s.artist || "")}
    //                             xalign={0}
    //                             ellipsize={3}
    //                         />
    //                     </box>
    //
    //                     <box vexpand />
    //
    //                     <box class="spacing-h-10">
    //                         <box class="spacing-h-3" valign={Gtk.Align.CENTER}>
    //                             <PreviousButton />
    //                             <NextButton />
    //                         </box>
    //
    //                         <box hexpand />
    //
    //                         <PlayButton />
    //
    //                         <revealer
    //                             transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
    //                             revealChild={playerState.as((s) => s.available)}
    //                             transitionDuration={200}
    //                         >
    //                             <box class="osd-music-pill spacing-h-5" valign={Gtk.Align.CENTER}>
    //                                 <label label={playerState.as((s) => formatTime(s.position))} />
    //                                 <label label="/" />
    //                                 <label label={playerState.as((s) => formatTime(s.length))} />
    //                             </box>
    //                         </revealer>
    //                     </box>
    //                 </box>
    //             </box>
    //         </revealer>
    //     );
}
