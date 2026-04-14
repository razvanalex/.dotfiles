import GLib from "gi://GLib";
import GObject from "gi://GObject";
import { readFile } from "ags/file";
import Logger from "lib/logger";
import { execAsyncNoExcept, execNoExcept } from "lib/proc";

const LIGHTDARK_FILE_LOCATION = `${GLib.get_user_state_dir()}/ags/user/colormode.txt`;

class SystemService extends GObject.Object {
	static {
		GObject.registerClass(
			{
				Properties: {
					"dark-mode": GObject.ParamSpec.boolean(
						"dark-mode",
						"Dark Mode",
						"Whether dark mode is enabled",
						GObject.ParamFlags.READWRITE,
						true,
					),
				},
				Signals: {
					changed: {},
				},
			},
			SystemService,
		);
	}

	private _distroID = execNoExcept(
		`bash -c 'cat /etc/os-release | grep "^ID=" | cut -d "=" -f 2 | sed "s/\\"//g"'`,
	).trim();
	private _darkMode = true;

	constructor() {
		super();
		this._darkMode = this.readDarkMode();
	}

	private readDarkMode(): boolean {
		try {
			return (
				readFile(LIGHTDARK_FILE_LOCATION).split("\n")[0].trim() !== "light"
			);
		} catch {
			return true;
		}
	}

	get dark_mode() {
		return this._darkMode;
	}
	set dark_mode(value: boolean) {
		if (this._darkMode === value) return;

		this._darkMode = value;
		const lightdark = value ? "dark" : "light";
		const stateDir = GLib.get_user_state_dir();
		const configDir = GLib.get_user_config_dir();

		execAsyncNoExcept(
			`bash -c "mkdir -p ${stateDir}/ags/user && sed -i '1s/.*/${lightdark}/' ${stateDir}/ags/user/colormode.txt"`,
		)
			.then(() =>
				execAsyncNoExcept(
					`bash -c "${configDir}/ags/scripts/color_generation/switchcolor.sh"`,
				),
			)
			.catch((e) => Logger.error(e));

		this.notify("dark-mode");
		this.emit("changed");
	}

	toggleDarkMode() {
		this.dark_mode = !this.dark_mode;
	}

	get distroID() {
		return this._distroID;
	}
	get isDebianDistro() {
		return [
			"linuxmint",
			"ubuntu",
			"debian",
			"zorin",
			"popos",
			"raspbian",
			"kali",
		].includes(this._distroID);
	}
	get isArchDistro() {
		return ["arch", "endeavouros", "cachyos"].includes(this._distroID);
	}
	get hasFlatpak() {
		return !!execNoExcept(`bash -c 'command -v flatpak'`);
	}
	get hasPlasmaIntegration() {
		return !!execNoExcept(
			'bash -c "command -v plasma-browser-integration-host"',
		);
	}

	getDistroIcon(): string {
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
		};
		return iconMap[this._distroID] || "linux-symbolic";
	}

	getDistroName(): string {
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
		};
		return nameMap[this._distroID] || "Linux";
	}
}

const service = new SystemService();
export default service;
