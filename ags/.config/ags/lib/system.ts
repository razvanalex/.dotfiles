import GLib from "gi://GLib"
import { execNoExcept, execAsyncNoExcept } from "../lib/proc"
import { readFile } from "ags/file"
import { createState } from "ags"

export const distroID = execNoExcept(`bash -c 'cat /etc/os-release | grep "^ID=" | cut -d "=" -f 2 | sed "s/\\"//g"'`).trim()
export const isDebianDistro = ["linuxmint", "ubuntu", "debian", "zorin", "popos", "raspbian", "kali"].includes(distroID)
export const isArchDistro = ["arch", "endeavouros", "cachyos"].includes(distroID)
export const hasFlatpak = !!execNoExcept(`bash -c 'command -v flatpak'`)

const LIGHTDARK_FILE_LOCATION = `${GLib.get_user_state_dir()}/ags/user/colormode.txt`

function readDarkMode(): boolean {
    try {
        return readFile(LIGHTDARK_FILE_LOCATION).split("\n")[0].trim() !== "light"
    } catch {
        return true
    }
}

export const [darkMode, setDarkMode] = createState(readDarkMode())

export function toggleDarkMode() {
    const newValue = !darkMode.get()
    setDarkMode(newValue)

    const lightdark = newValue ? "dark" : "light"
    const stateDir = GLib.get_user_state_dir()
    const configDir = GLib.get_user_config_dir()

    execAsyncNoExcept(`bash -c "mkdir -p ${stateDir}/ags/user && sed -i '1s/.*/${lightdark}/' ${stateDir}/ags/user/colormode.txt"`)
        .then(() => execAsyncNoExcept(`bash -c "${configDir}/ags/scripts/color_generation/switchcolor.sh"`))
        .catch(console.error)
}

export const hasPlasmaIntegration = !!execNoExcept('bash -c "command -v plasma-browser-integration-host"')

export function getDistroIcon(): string {
    const iconMap: Record<string, string> = {
        arch: "arch-symbolic",
        endeavouros: "endeavouros-symbolic",
        cachyos: "cachyos-symbolic",
        nixos: "nixos-symbolic",
        fedora: "fedora-symbolic",
        linuxmint: "ubuntu-symbolic",
        ubuntu: "ubuntu-symbolic",
        debian: "debian-symbolic",
        zorin: "ubuntu-symbolic",
        popos: "ubuntu-symbolic",
        raspbian: "debian-symbolic",
        kali: "debian-symbolic",
    }
    return iconMap[distroID] || "linux-symbolic"
}

export function getDistroName(): string {
    const nameMap: Record<string, string> = {
        arch: "Arch Linux",
        endeavouros: "EndeavourOS",
        cachyos: "CachyOS",
        nixos: "NixOS",
        fedora: "Fedora",
        linuxmint: "Linux Mint",
        ubuntu: "Ubuntu",
        debian: "Debian",
        zorin: "Zorin",
        popos: "Pop!_OS",
        raspbian: "Raspbian",
        kali: "Kali Linux",
    }
    return nameMap[distroID] || "Linux"
}
