import GObject from "gi://GObject"
import { monitorFile, readFile } from "ags/file"
import { execAsync } from "ags/process"

class Brightness extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                "screen-value": GObject.ParamSpec.double(
                    "screen-value", "Screen Value", "Screen Brightness 0.0-1.0",
                    GObject.ParamFlags.READWRITE,
                    0, 1, 0
                ),
            },
        }, this)
    }

    #screenValue = 0
    #max = 0
    #interface = ""
    #useDdc = false
    #ddcTimer: number | null = null
    #pendingDdcValue: number | null = null

    get screen_value() { return this.#screenValue }
    set screen_value(percent: number) {
        if (percent < 0) percent = 0
        if (percent > 1) percent = 1
        
        this.#screenValue = percent
        this.notify("screen-value")

        if (this.#useDdc) {
            // Debounce ddcutil calls
            this.#pendingDdcValue = percent
            if (this.#ddcTimer) return

            this.#ddcTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                if (this.#pendingDdcValue !== null) {
                    execAsync(`ddcutil setvcp 10 ${Math.round(this.#pendingDdcValue * 100)}`)
                        .catch(console.error)
                        .finally(() => {
                            this.#pendingDdcValue = null
                        })
                }
                this.#ddcTimer = null
                return GLib.SOURCE_REMOVE
            })
        } else if (this.#interface) {
            // extract device name from path
            const devName = this.#interface.split('/').pop()
            execAsync(`brightnessctl -d ${devName} s ${Math.round(percent * 100)}% -q`).catch(console.error)
        }
    }

    constructor() {
        super()
        this.#init()
    }

    async #init() {
        try {
            // Try backlight
            const devices = await execAsync("ls /sys/class/backlight").catch(() => "")
            if (devices && devices.trim().length > 0) {
                const device = devices.split("\n")[0]
                this.#interface = `/sys/class/backlight/${device}`
                this.#max = Number(readFile(`${this.#interface}/max_brightness`))
                
                const update = () => {
                    const val = Number(readFile(`${this.#interface}/brightness`))
                    this.#screenValue = val / this.#max
                    this.notify("screen-value")
                }
                monitorFile(`${this.#interface}/brightness`, update)
                update()
                console.log(`Brightness: Using backlight interface ${this.#interface}`)
                return
            }
        } catch (e) { console.error("Brightness: Backlight init failed", e) }

        // Try ddcutil
        try {
            const out = await execAsync("ddcutil getvcp 10 --brief")
            // Expected: "VCP 10 C 50 100"
            const parts = out.trim().split(" ")
            if (parts.length >= 5) {
                const current = parseFloat(parts[3])
                const max = parseFloat(parts[4])
                this.#screenValue = current / max
                this.#useDdc = true
                console.log("Brightness: Using ddcutil")
            }
        } catch (e) {
            console.error("Brightness: ddcutil init failed (no device found or ddcutil error)", e)
        }
    }
}

const service = new Brightness()

Object.assign(globalThis, { 
    brightness: service,
    indicator: { popup: () => {} }
})

export default service