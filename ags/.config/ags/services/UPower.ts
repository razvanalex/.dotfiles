import GObject from "gi://GObject"
import GLib from "gi://GLib"
import { execAsync } from "ags/process"

export interface UPowerDevice {
    path: string
    nativePath: string
    model: string
    serial: string
    powerSupply: boolean
    updated: string
    hasHistory: boolean
    hasStatistics: boolean
    percentage: number // Normalized 0-1
    state: string
    warningLevel: string
    iconName: string
    type: string
    present: boolean
    rechargeable: boolean
}

export interface UPowerDaemonInfo {
    version: string
    onBattery: boolean
    lidIsClosed: boolean
    lidIsPresent: boolean
    criticalAction: string
}

class UPowerService extends GObject.Object {
    static {
        GObject.registerClass({
            Signals: {
                "changed": {},
            },
            Properties: {
                "devices": GObject.ParamSpec.jsobject(
                    "devices", "Devices", "List of UPower devices",
                    GObject.ParamFlags.READABLE,
                ),
                "daemon": GObject.ParamSpec.jsobject(
                    "daemon", "Daemon", "UPower Daemon Info",
                    GObject.ParamFlags.READABLE,
                ),
            },
        }, this)
    }

    #devices: UPowerDevice[] = []
    #daemon: UPowerDaemonInfo = {
        version: "",
        onBattery: false,
        lidIsClosed: false,
        lidIsPresent: false,
        criticalAction: ""
    }

    get devices() { return this.#devices }
    get daemon() { return this.#daemon }

    constructor() {
        super()
        this.#poll()
        // Poll every 5 seconds
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
            this.#poll()
            return true // keep running
        })
    }

    async #poll() {
        try {
            const out = await execAsync("upower -d")
            const newDevices: UPowerDevice[] = []
            
            // Separate Daemon block
            const sections = out.split("\nDaemon:")
            const devicesPart = sections[0]
            const daemonPart = sections.length > 1 ? sections[1] : ""

            // Parse Daemon
            if (daemonPart) {
                const lines = daemonPart.split("\n")
                for (const line of lines) {
                    const trim = line.trim()
                    if (trim.startsWith("daemon-version:")) this.#daemon.version = trim.substring(15).trim()
                    else if (trim.startsWith("on-battery:")) this.#daemon.onBattery = trim.substring(11).trim() === "yes"
                    else if (trim.startsWith("lid-is-closed:")) this.#daemon.lidIsClosed = trim.substring(14).trim() === "yes"
                    else if (trim.startsWith("lid-is-present:")) this.#daemon.lidIsPresent = trim.substring(15).trim() === "yes"
                    else if (trim.startsWith("critical-action:")) this.#daemon.criticalAction = trim.substring(16).trim()
                }
            }

            // Parse Devices
            const blocks = devicesPart.split("Device: ")
            
            for (const block of blocks) {
                if (!block.trim()) continue
                
                const lines = block.split("\n")
                const pathLine = lines[0].trim()
                if (!pathLine.startsWith("/")) continue
                
                const device: UPowerDevice = {
                    path: pathLine,
                    nativePath: "",
                    model: "Unknown",
                    serial: "",
                    powerSupply: false,
                    updated: "",
                    hasHistory: false,
                    hasStatistics: false,
                    percentage: -1,
                    state: "unknown",
                    warningLevel: "unknown",
                    iconName: "battery-missing-symbolic",
                    type: "unknown",
                    present: false,
                    rechargeable: false
                }

                let currentSection = ""
                
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i]
                    if (!line.trim()) continue

                    // Detect section headers (2 spaces, no colon, no sub-indentation overlap)
                    const isProperty = line.match(/^\s{2}[^:]+:/)
                    const isSubProperty = line.match(/^\s{4}[^:]+:/)
                    // Section header: 2 spaces, word(s), no colon
                    const isSectionHeader = !isProperty && !isSubProperty && line.match(/^\s{2}[\w\s]+$/)
                    
                    if (isSectionHeader) {
                        currentSection = line.trim()
                        device.type = currentSection
                        continue
                    }

                    const trim = line.trim()
                    
                    if (isProperty || isSubProperty) {
                        const colonIndex = trim.indexOf(":")
                        if (colonIndex === -1) continue
                        
                        const key = trim.substring(0, colonIndex).trim()
                        const val = trim.substring(colonIndex + 1).trim()
                        
                        if (key === "native-path") device.nativePath = val
                        else if (key === "model") device.model = val
                        else if (key === "serial") device.serial = val
                        else if (key === "power supply") device.powerSupply = val === "yes"
                        else if (key === "updated") device.updated = val
                        else if (key === "has history") device.hasHistory = val === "yes"
                        else if (key === "has statistics") device.hasStatistics = val === "yes"
                        else if (key === "state") device.state = val
                        else if (key === "warning-level") device.warningLevel = val
                        else if (key === "percentage") {
                            const p = parseFloat(val.replace("%", ""))
                            if (!isNaN(p)) device.percentage = p / 100
                        }
                        else if (key === "icon-name") device.iconName = val.replace(/'/g, "")
                        else if (key === "present") device.present = val === "yes"
                        else if (key === "rechargeable") device.rechargeable = val === "yes"
                    }
                }
                
                // Only add if we parsed a valid percentage or it's a known device type with serial
                // Some devices might not have percentage but are valid (e.g. power supply)
                // But for our use case (battery monitoring), we mainly care if serial exists.
                // DisplayDevice often has no serial.
                
                if (device.path.includes("DisplayDevice") || device.serial || device.percentage > -1) {
                     newDevices.push(device)
                }
            }

            this.#devices = newDevices
            this.emit("changed")
            this.notify("devices")
            this.notify("daemon")

        } catch (e) {
            console.error("UPowerService error:", e)
        }
    }
}

const service = new UPowerService()
export default service