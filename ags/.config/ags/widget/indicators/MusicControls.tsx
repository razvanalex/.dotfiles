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

const execAsyncNoExcept = async (cmd: string | string[]): Promise<string> => {
    try {
        return await execAsync(cmd);
    } catch (_e) {
        return "";
    }
};

async function updatePlayerState() {
    try {
        const status = (await execAsyncNoExcept("playerctl status")).trim();

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

        const [title, artist, album, coverUrl, positionStr, lengthStr] =
            await Promise.all([
                execAsyncNoExcept(["playerctl", "metadata", "title"]),
                execAsyncNoExcept(["playerctl", "metadata", "artist"]),
                execAsyncNoExcept(["playerctl", "metadata", "album"]),
                execAsyncNoExcept(["playerctl", "metadata", "mpris:artUrl"]),
                execAsyncNoExcept(["playerctl", "position"]),
                execAsyncNoExcept(["playerctl", "metadata", "mpris:length"]),
            ]);

        updateState({
            status: status.toLowerCase() as "playing" | "paused" | "stopped",
            title: title.trim() || "Unknown",
            artist: artist.trim() || "Unknown Artist",
            album: album.trim() || "",
            coverUrl: coverUrl.trim() || "",
            position: parseFloat(positionStr.trim()) || 0,
            length: parseInt(lengthStr.trim(), 10) / 1000000 || 0,
            available: true,
        });
    } catch (_e) {
        updateState({
            ...currentPlayerState,
            available: false,
        });
    }
}

// Start updating with a delay to not block initial startup
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    updatePlayerState().catch((e) => log.error(e));
    // Continue timeout every 1s after initial delay
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        updatePlayerState().catch((e) => log.error(e));
        return true;
    });
    return false; // Stop the 2s initial delay timer
});

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
