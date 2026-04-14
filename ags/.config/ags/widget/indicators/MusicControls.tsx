import GLib from "gi://GLib";
import { createState } from "ags";
import { execAsync } from "ags/process";
import Logger from "lib/logger";

const log = Logger.withScope("Music");

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
};

const execNoExcept = (cmd: string): string => {
    try {
        const result = GLib.spawn_command_line_sync(cmd);
        return result[1] ? new TextDecoder().decode(result[1]).trim() : "";
    } catch (_e) {
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
            length: parseInt(lengthStr, 10) / 1000000 || 0,
            available: true,
        });
    } catch (_e) {
        updateState({
            ...currentPlayerState,
            available: false,
        });
    }
}

GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    updatePlayerState().catch((e) => log.error(e));
    return true;
});

updatePlayerState().catch((e) => log.error(e));

function _formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
}

function _PlayButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl play-pause").catch((e) => log.error(e));
            }}
        >
            <label
                class="icon-material osd-music-controlbtn-txt"
                label={playerState.as((s) =>
                    s.status === "playing" ? "pause" : "play_arrow",
                )}
            />
        </button>
    );
}

function _PreviousButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl previous").catch((e) => log.error(e));
            }}
        >
            <label
                class="icon-material osd-music-controlbtn-txt"
                label="skip_previous"
            />
        </button>
    );
}

function _NextButton() {
    return (
        <button
            class="osd-music-controlbtn"
            onClicked={() => {
                execAsync("playerctl next").catch((e) => log.error(e));
            }}
        >
            <label
                class="icon-material osd-music-controlbtn-txt"
                label="skip_next"
            />
        </button>
    );
}

export default function MusicControls() {
    return "";
}
