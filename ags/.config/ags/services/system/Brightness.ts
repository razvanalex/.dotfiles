import GObject from "gi://GObject";
import GLib from "gi://GLib";
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
    #isInitialized = false;

    get screen_value() {
        return this.#screenValue;
    }
    set screen_value(percent: number) {
        if (percent < 0) percent = 0;
        if (percent > 1) percent = 1;

        if (this.#useDdc) {
            execAsync(`ddcutil setvcp 10 ${Math.round(percent * 100)}`).catch(
                (e) => log.error(e),
            );
            this.#screenValue = percent;
            this.notify("screen-value");
            this.emit("changed");
        } else if (this.#interface) {
            const devName = this.#interface.split("/").pop();
            execAsync(
                `brightnessctl -d ${devName} s ${Math.round(percent * 100)}% -q`,
            ).catch((e) => log.error(e));
            this.#screenValue = percent;
            this.notify("screen-value");
            this.emit("changed");
        } else {
            // If not initialized yet, just store the value
            this.#screenValue = percent;
        }
    }

    constructor() {
        super();

        // Start initialization with a significant delay to ensure UI is ready
        GLib.timeout_add(GLib.PRIORITY_LOW, 10000, () => {
            this.#init().catch((e) => log.error("Init failed", e));
            return GLib.SOURCE_REMOVE;
        });
    }

    async #init() {
        if (this.#isInitialized) return;

        try {
            // Try to find a backlight interface first (fast)
            const backlights = await execAsync("ls /sys/class/backlight")
                .then((out) => out.split("\n").filter(Boolean))
                .catch(() => []);

            if (backlights.length > 0) {
                this.#interface = `/sys/class/backlight/${backlights[0]}`;
                const max = await execAsync(
                    `cat ${this.#interface}/max_brightness`,
                ).then(Number);
                const current = await execAsync(
                    `cat ${this.#interface}/brightness`,
                ).then(Number);
                this.#screenValue = current / max;
                this.notify("screen-value");
                log.info(`Using backlight interface ${this.#interface}`);
                this.#isInitialized = true;
            } else {
                // Try ddcutil - this is slow, so we do it in the background
                log.info("Probing ddcutil in background...");
                try {
                    const ddc = await execAsync("ddcutil getvcp 10 --terse");
                    if (ddc) {
                        const parts = ddc.split(" ");
                        if (parts.length >= 5) {
                            const current = parseFloat(parts[3]);
                            const max = parseFloat(parts[4]);
                            this.#screenValue = current / max;
                            this.#useDdc = true;
                            this.notify("screen-value");
                            log.info("Using ddcutil");
                        }
                    }
                } catch (e) {
                    log.info("ddcutil not available or failed");
                }
                this.#isInitialized = true;
            }
        } catch (e) {
            log.error("Backlight init failed", e);
            this.#isInitialized = true;
        }
    }
}

const service = new Brightness();

Object.assign(globalThis, {
    brightness: service,
    indicator: { popup: () => {} },
});

export default service;
