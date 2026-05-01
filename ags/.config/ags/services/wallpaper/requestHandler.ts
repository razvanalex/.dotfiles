import app from "ags/gtk4/app";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";

const DEBUG_WALLPAPER_REQUEST_TIMING = false;

export async function handleWallpaperRequest(
    argv: string[],
    res: (response: any) => void,
    ENABLE_WALLPAPER: boolean,
) {
    if (!ENABLE_WALLPAPER) return res("wallpaper disabled");

    if (argv[0] === "wallpaper-selector") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            app.toggle_window(`wallpaper-selector${index}`);
        });
        res("");
        return true;
    }

    if (argv[0] === "wallpaper-selector-popup") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            const name = `wallpaper-selector-popup${index}`;
            app.toggle_window(name);
            const win = app.get_window(name);
            if (win?.visible) win.present();
        });
        res("");
        return true;
    }

    if (argv[0] === "theme-selector-popup") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            const name = `theme-selector-popup${index}`;
            app.toggle_window(name);
            const win = app.get_window(name);
            if (win?.visible) win.present();
        });
        res("");
        return true;
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
                "--urgency",
                "low",
                "--transient",
                "--expire-time",
                "1000",
                "--app-name",
                "Wallpaper",
                "Themes",
                `${config.includeHidden ? "Enabled" : "Disabled"} hidden themes`,
            ]).catch(() => {});

            res(
                `hidden themes ${config.includeHidden ? "enabled" : "disabled"}`,
            );
            return true;
        }

        if (subcommand === "set-theme") {
            const themeName = argv[2];
            if (!themeName) {
                res("error: theme name required");
                return true;
            }

            wallpaperEngine.setSource("specific-theme", themeName);
            await wallpaperEngine
                .next()
                .then(() => res(`theme set to ${themeName}`))
                .catch((err: Error) => res(`error: ${err.message}`));
            return true;
        }

        if (subcommand === "engine") {
            const engineCmd = argv[2];

            if (engineCmd === "get") {
                res(wallpaperEngine.engine_state);
                return true;
            }

            if (engineCmd === "set") {
                const key = argv[3];
                const value = argv[4];

                if (key === "mode") {
                    if (value !== "manual" && value !== "automatic") {
                        res("error: mode must be manual|automatic");
                        return true;
                    }
                    wallpaperEngine.setMode(value as any);
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                if (key === "interval") {
                    const interval = parseInt(value, 10);
                    if (Number.isNaN(interval) || interval < 30) {
                        res("error: interval must be >= 30 seconds");
                        return true;
                    }
                    wallpaperEngine.setInterval(interval);
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                if (key === "source") {
                    const sourceType = value as any;
                    const sourceValue = argv.slice(5).join(" ");
                    wallpaperEngine.setSource(sourceType, sourceValue);
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                if (key === "strategy") {
                    const strategy = value as any;
                    wallpaperEngine.setStrategy(strategy);
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                res(`error: unknown engine set key ${key}`);
                return true;
            }

            if (engineCmd === "favorites") {
                const action = argv[3];
                const path = argv.slice(4).join(" ");

                if (action === "list") {
                    res(JSON.stringify(wallpaperEngine.state.favorites));
                    return true;
                }

                if (action === "add") {
                    if (!path) {
                        res("error: favorites add requires a path");
                        return true;
                    }
                    try {
                        wallpaperEngine.addFavorite(path);
                        res(wallpaperEngine.engine_state);
                    } catch (e: any) {
                        res(`error: ${e.message}`);
                    }
                    return true;
                }

                if (action === "remove") {
                    if (!path) {
                        res("error: favorites remove requires a path");
                        return true;
                    }
                    wallpaperEngine.removeFavorite(path);
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                res(`error: unknown favorites command ${action}`);
                return true;
            }

            if (engineCmd === "recent") {
                if (argv[3] === "list") {
                    res(
                        JSON.stringify(
                            [...wallpaperEngine.state.history].reverse(),
                        ),
                    );
                    return true;
                }
                res("error: unknown recent command");
                return true;
            }

            if (engineCmd === "auto") {
                const autoCmd = argv[3];

                if (autoCmd === "start") {
                    const intervalArg = argv[4];
                    const interval = intervalArg
                        ? parseInt(intervalArg, 10)
                        : undefined;

                    await wallpaperEngine
                        .startAuto(interval)
                        .then(() => res(wallpaperEngine.engine_state))
                        .catch((error: Error) =>
                            res(`error: ${error.message}`),
                        );
                    return true;
                }

                if (autoCmd === "stop") {
                    wallpaperEngine.stopAuto();
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                if (autoCmd === "status") {
                    res(wallpaperEngine.engine_state);
                    return true;
                }

                res(`error: unknown engine auto command ${autoCmd}`);
                return true;
            }

            res(`error: unknown engine command ${engineCmd}`);
            return true;
        }

        if (subcommand === "next") {
            const startedAt = Date.now();
            await wallpaperEngine
                .next()
                .then((path) => {
                    if (DEBUG_WALLPAPER_REQUEST_TIMING) {
                        Logger.info(
                            `[wallpaper-next] completed in ${Date.now() - startedAt}ms`,
                        );
                    }
                    res(String(path));
                })
                .catch((error: Error) => res(`error: ${error.message}`));
            return true;
        }

        if (subcommand === "prev") {
            await wallpaperEngine
                .prev()
                .then((path) => res(path))
                .catch((error: Error) => res(`error: ${error.message}`));
            return true;
        }

        if (subcommand === "random") {
            await wallpaper
                .setRandomWallpaper()
                .then(() => res("random wallpaper set"))
                .catch((error: Error) => res(`error: ${error.message}`));
            return true;
        }

        if (subcommand === "favorite") {
            const action = argv[2];
            const pathArg = argv.slice(3).join(" ");
            const path = pathArg || wallpaper.getCurrentWallpaper();

            if (!path) {
                res("error: no wallpaper path to favorite");
                return true;
            }

            if (action === "add") {
                try {
                    wallpaperEngine.addFavorite(path);
                    res(wallpaperEngine.engine_state);
                } catch (e: any) {
                    res(`error: ${e.message}`);
                }
                return true;
            }

            if (action === "remove") {
                wallpaperEngine.removeFavorite(path);
                res(wallpaperEngine.engine_state);
                return true;
            }

            if (action === "toggle") {
                wallpaperEngine.toggleFavorite(path);
                res(wallpaperEngine.engine_state);
                return true;
            }

            if (action === "list") {
                res(JSON.stringify(wallpaperEngine.state.favorites));
                return true;
            }

            res(`error: unknown favorite subcommand ${action}`);
            return true;
        }

        if (subcommand === "play") {
            await wallpaperEngine
                .startAuto()
                .then(() => res(wallpaperEngine.engine_state))
                .catch((error: Error) => res(`error: ${error.message}`));
            return true;
        }

        if (subcommand === "pause") {
            wallpaperEngine.stopAuto();
            res(wallpaperEngine.engine_state);
            return true;
        }

        res(`unknown wallpaper subcommand: ${subcommand}`);
        return true;
    }

    return false; // Not handled
}
