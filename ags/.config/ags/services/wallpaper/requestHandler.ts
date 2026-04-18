import app from "ags/gtk4/app";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";

const DEBUG_WALLPAPER_REQUEST_TIMING = false;

export async function handleWallpaperRequest(argv: string[], res: (response: any) => void, ENABLE_WALLPAPER: boolean) {
    if (!ENABLE_WALLPAPER) return res("wallpaper disabled");

    if (argv[0] === "wallpaper-selector") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            app.toggle_window(`wallpaper-selector${index}`);
        });
        return res("ok");
    }

    if (argv[0] === "wallpaper-selector-popup") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            const name = `wallpaper-selector-popup${index}`;
            app.toggle_window(name);
            const win = app.get_window(name);
            if (win?.visible) win.present();
        });
        return res("ok");
    }

    if (argv[0] === "theme-selector-popup") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            const name = `theme-selector-popup${index}`;
            app.toggle_window(name);
            const win = app.get_window(name);
            if (win?.visible) win.present();
        });
        return res("ok");
    }

    if (argv[0] === "wallpaper") {
        const { default: wallpaper } = await import("./Wallpaper");
        const { default: wallpaperEngine } = await import("./WallpaperEngine");
        const { loadConfig } = await import("./utils/wallpaper");

        const subcommand = argv[1];

        if (subcommand === "toggle-hidden") {
            const configPath = PATHS.wallpaperConfig;
            const config = loadConfig(configPath);
            config.includeHidden = !config.includeHidden;
            const { saveConfig } = await import("./utils/wallpaper");
            saveConfig(configPath, config);
            wallpaper.setConfig({ includeHidden: config.includeHidden });

            execAsync([
                "notify-send",
                "--urgency", "low",
                "--transient",
                "--expire-time", "1000",
                "--app-name", "Wallpaper",
                "Themes",
                `${config.includeHidden ? "Enabled" : "Disabled"} hidden themes`,
            ]).catch(() => { });

            return res(`hidden themes ${config.includeHidden ? "enabled" : "disabled"}`);
        }

        if (subcommand === "set-theme") {
            const themeName = argv[2];
            if (!themeName) return res("error: theme name required");

            wallpaperEngine.setSource("specific-theme", themeName);
            wallpaperEngine.next()
                .then(() => res(`theme set to ${themeName}`))
                .catch((err: Error) => res(`error: ${err.message}`));
            return;
        }

        if (subcommand === "engine") {
            const engineCmd = argv[2];

            if (engineCmd === "get") {
                return res(wallpaperEngine.engine_state);
            }

            if (engineCmd === "set") {
                const key = argv[3];
                const value = argv[4];

                if (key === "mode") {
                    if (value !== "manual" && value !== "automatic") {
                        return res("error: mode must be manual|automatic");
                    }
                    wallpaperEngine.setMode(value as any);
                    return res(wallpaperEngine.engine_state);
                }

                if (key === "interval") {
                    const interval = parseInt(value, 10);
                    if (Number.isNaN(interval) || interval < 30) {
                        return res("error: interval must be >= 30 seconds");
                    }
                    wallpaperEngine.setInterval(interval);
                    return res(wallpaperEngine.engine_state);
                }

                if (key === "source") {
                    const sourceType = value as any;
                    const sourceValue = argv.slice(5).join(" ");
                    wallpaperEngine.setSource(sourceType, sourceValue);
                    return res(wallpaperEngine.engine_state);
                }

                if (key === "strategy") {
                    const strategy = value as any;
                    wallpaperEngine.setStrategy(strategy);
                    return res(wallpaperEngine.engine_state);
                }

                return res(`error: unknown engine set key ${key}`);
            }

            if (engineCmd === "favorites") {
                const action = argv[3];
                const path = argv.slice(4).join(" ");

                if (action === "list") {
                    return res(JSON.stringify(wallpaperEngine.state.favorites));
                }

                if (action === "add") {
                    if (!path) return res("error: favorites add requires a path");
                    try {
                        wallpaperEngine.addFavorite(path);
                        return res(wallpaperEngine.engine_state);
                    } catch (e: any) {
                        return res(`error: ${e.message}`);
                    }
                }

                if (action === "remove") {
                    if (!path) return res("error: favorites remove requires a path");
                    wallpaperEngine.removeFavorite(path);
                    return res(wallpaperEngine.engine_state);
                }

                return res(`error: unknown favorites command ${action}`);
            }

            if (engineCmd === "recent") {
                if (argv[3] === "list") {
                    return res(JSON.stringify([...wallpaperEngine.state.history].reverse()));
                }
                return res("error: unknown recent command");
            }

            if (engineCmd === "auto") {
                const autoCmd = argv[3];

                if (autoCmd === "start") {
                    const intervalArg = argv[4];
                    const interval = intervalArg ? parseInt(intervalArg, 10) : undefined;

                    wallpaperEngine.startAuto(interval)
                        .then(() => res(wallpaperEngine.engine_state))
                        .catch((error: Error) => res(`error: ${error.message}`));
                    return;
                }

                if (autoCmd === "stop") {
                    wallpaperEngine.stopAuto();
                    return res(wallpaperEngine.engine_state);
                }

                if (autoCmd === "status") {
                    return res(wallpaperEngine.engine_state);
                }

                return res(`error: unknown engine auto command ${autoCmd}`);
            }

            return res(`error: unknown engine command ${engineCmd}`);
        }

        if (subcommand === "next") {
            const startedAt = Date.now();
            wallpaperEngine.next()
                .then((path) => {
                    if (DEBUG_WALLPAPER_REQUEST_TIMING) {
                        Logger.info(`[wallpaper-next] completed in ${Date.now() - startedAt}ms`);
                    }
                    res(String(path));
                })
                .catch((error: Error) => res(`error: ${error.message}`));
            return;
        }

        if (subcommand === "prev") {
            wallpaperEngine.prev()
                .then((path) => res(path))
                .catch((error: Error) => res(`error: ${error.message}`));
            return;
        }

        if (subcommand === "random") {
            wallpaper.setRandomWallpaper()
                .then(() => res("random wallpaper set"))
                .catch((error: Error) => res(`error: ${error.message}`));
            return;
        }

        if (subcommand === "favorite") {
            const action = argv[2];
            const pathArg = argv.slice(3).join(" ");
            const path = pathArg || wallpaper.getCurrentWallpaper();

            if (!path) return res("error: no wallpaper path to favorite");

            if (action === "add") {
                try {
                    wallpaperEngine.addFavorite(path);
                    return res(wallpaperEngine.engine_state);
                } catch (e: any) {
                    return res(`error: ${e.message}`);
                }
            }

            if (action === "remove") {
                wallpaperEngine.removeFavorite(path);
                return res(wallpaperEngine.engine_state);
            }

            if (action === "toggle") {
                wallpaperEngine.toggleFavorite(path);
                return res(wallpaperEngine.engine_state);
            }

            if (action === "list") {
                return res(JSON.stringify(wallpaperEngine.state.favorites));
            }

            return res(`error: unknown favorite subcommand ${action}`);
        }

        if (subcommand === "play") {
            wallpaperEngine.startAuto()
                .then(() => res(wallpaperEngine.engine_state))
                .catch((error: Error) => res(`error: ${error.message}`));
            return;
        }

        if (subcommand === "pause") {
            wallpaperEngine.stopAuto();
            return res(wallpaperEngine.engine_state);
        }

        return res(`unknown wallpaper subcommand: ${subcommand}`);
    }

    return false; // Not handled
}
