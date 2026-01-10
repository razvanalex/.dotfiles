import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { execAsyncNoExcept } from "../lib/proc"
import { writeFile } from "ags/file"
import { timeout } from "ags/time"
import { onCleanup } from "ags"
import userOptions from "../lib/userOptions"

export function fileExists(filePath: string): boolean {
    const file = Gio.File.new_for_path(filePath)
    return file.query_exists(null)
}

const FIRST_RUN_FILE = "firstrun.txt"
const FIRST_RUN_PATH = `${GLib.get_user_state_dir()}/ags/user/${FIRST_RUN_FILE}`
const FIRST_RUN_FILE_CONTENT =
    "Just a file to confirm that you have been greeted ;)"
const APP_NAME = "illogical-impulse"
const FIRST_RUN_NOTIF_TITLE = "Welcome!"
const FIRST_RUN_NOTIF_BODY = `First run? 👀 <span foreground="#FF0202" font_weight="bold">CTRL+SUPER+T</span> to pick a wallpaper (or styles will break!)\nFor a list of keybinds, hit <span foreground="#c06af1" font_weight="bold">Super + /</span>.`

let batteryWarned = false

// Note: AGS v2 uses external AstalBattery library
// For now, this is a stub. Install libastal-battery and update imports:
// import Battery from "gi://AstalBattery"
async function batteryMessage() {
    // TODO: Replace with AstalBattery when installed
    // const battery = Battery.get_default()
    // const perc = battery.percentage
    // const charging = battery.charging

    // Stub for now
    console.log("Battery service requires AstalBattery library")
}

export function startBatteryWarningService() {
    timeout(1, () => {
        // TODO: Connect to battery.connect("changed", batteryMessage)
        console.log("Battery warning service requires AstalBattery library")
    })
}

export function firstRunWelcome() {
    GLib.mkdir_with_parents(`${GLib.get_user_state_dir()}/ags/user`, 0o755)

    if (!fileExists(FIRST_RUN_PATH)) {
        try {
            writeFile(FIRST_RUN_PATH, FIRST_RUN_FILE_CONTENT)

            execAsyncNoExcept([
                "hyprctl",
                "keyword",
                "bind",
                "Super,Slash,exec,ags toggle cheatsheet",
            ]).catch(console.error)

            execAsyncNoExcept([
                "bash",
                "-c",
                `sleep 0.5; notify-send "Millis since epoch" "$(date +%s%N | cut -b1-13)"; sleep 0.5; notify-send '${FIRST_RUN_NOTIF_TITLE}' '${FIRST_RUN_NOTIF_BODY}' -a '${APP_NAME}' &`,
            ]).catch(console.error)
        } catch (e) {
            console.error("First run welcome failed:", e)
        }
    }
}
