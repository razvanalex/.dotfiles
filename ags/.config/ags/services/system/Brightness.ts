import GObject from "gi://GObject";
import { execAsync } from "ags/process";
import Logger from "lib/logger";

const log = Logger.withScope("Brightness");

class Brightness extends GObject.Object {
	static {
		GObject.registerClass(
			{
				Properties: {
					"screen-value": GObject.ParamSpec.double(
						"screen-value",
						"Screen Value",
						"The current screen brightness",
						GObject.ParamFlags.READWRITE,
						0,
						1,
						0,
					),
				},
				Signals: {
					changed: {},
				},
			},
			Brightness,
		);
	}

	#screenValue = 0;
	#interface = "";
	#useDdc = false;

	get screen_value() {
		return this.#screenValue;
	}
	set screen_value(percent: number) {
		if (percent < 0) percent = 0;
		if (percent > 1) percent = 1;

		if (this.#useDdc) {
			execAsync(`ddcutil setvcp 10 ${Math.round(percent * 100)}`)
				.then(() => {
					this.#screenValue = percent;
					this.notify("screen-value");
					this.emit("changed");
				})
				.catch((e) => log.error(e));
		} else {
			const devName = this.#interface.split("/").pop();
			execAsync(
				`brightnessctl -d ${devName} s ${Math.round(percent * 100)}% -q`,
			).catch((e) => log.error(e));
			this.#screenValue = percent;
			this.notify("screen-value");
			this.emit("changed");
		}
	}

	constructor() {
		super();

		this.#init();
	}

	async #init() {
		try {
			// Try to find a backlight interface
			const backlights = await execAsync("ls /sys/class/backlight").then(
				(out) => out.split("\n").filter(Boolean),
			);
			if (backlights.length > 0) {
				this.#interface = `/sys/class/backlight/${backlights[0]}`;
				const max = await execAsync(
					`cat ${this.#interface}/max_brightness`,
				).then(Number);
				const current = await execAsync(
					`cat ${this.#interface}/brightness`,
				).then(Number);
				this.#screenValue = current / max;
				log.info(`Using backlight interface ${this.#interface}`);
			} else {
				// Try ddcutil
				const ddc = await execAsync("ddcutil getvcp 10 --terse").catch(
					() => "",
				);
				if (ddc) {
					const parts = ddc.split(" ");
					const current = parseFloat(parts[3]);
					const max = parseFloat(parts[4]);
					this.#screenValue = current / max;
					this.#useDdc = true;
					log.info("Using ddcutil");
				}
			}
		} catch (e) {
			log.error("Backlight init failed", e);
		}
	}
}

const service = new Brightness();

Object.assign(globalThis, {
	brightness: service,
	indicator: { popup: () => {} },
});

export default service;
