import GLib from "gi://GLib"
import { interval } from "ags/time"
import { darkMode, setDarkMode, toggleDarkMode } from "../lib/system"
import userOptions from "../lib/userOptions"

function timeBefore(time1: number[], time2: number[]): boolean {
    if (time1[0] === time2[0]) return time1[1] < time2[1]
    return time1[0] < time2[0]
}

function timeSame(time1: number[], time2: number[]): boolean {
    return time1[0] === time2[0] && time1[1] === time2[1]
}

function timeBeforeOrSame(time1: number[], time2: number[]): boolean {
    return timeBefore(time1, time2) || timeSame(time1, time2)
}

function timeInRange(
    time: number[],
    rangeStart: number[],
    rangeEnd: number[]
): boolean {
    if (timeBefore(rangeStart, rangeEnd)) {
        return timeBeforeOrSame(rangeStart, time) && timeBeforeOrSame(time, rangeEnd)
    } else {
        // rangeEnd < rangeStart, meaning it ends the following day
        const adjustedRangeEnd = [rangeEnd[0] + 24, rangeEnd[1]]
        const adjustedTime = timeBefore(time, rangeStart)
            ? [time[0] + 24, time[1]]
            : time
        return (
            timeBeforeOrSame(rangeStart, adjustedTime) &&
            timeBeforeOrSame(adjustedTime, adjustedRangeEnd)
        )
    }
}

export function startAutoDarkModeService() {
    interval(userOptions.time.interval, () => {
        if (!userOptions.appearance.autoDarkMode.enabled) return

        const fromTime = userOptions.appearance.autoDarkMode.from
            .split(":")
            .map(Number)
        const toTime = userOptions.appearance.autoDarkMode.to.split(":").map(Number)

        if (fromTime === toTime) return

        const currentDateTime = GLib.DateTime.new_now_local()
        const currentTime = [
            currentDateTime.get_hour(),
            currentDateTime.get_minute(),
        ]

        const shouldBeDark = timeInRange(currentTime, fromTime, toTime)
        if (darkMode() !== shouldBeDark) {
            toggleDarkMode()
        }
    })
}
