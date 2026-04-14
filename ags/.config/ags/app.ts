import Notifd from "gi://AstalNotifd";
import GLib from "gi://GLib";
import { Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";
import { COMPILED_STYLE_DIR, handleStyles } from "lib/styles";
import brightness from "services/system/Brightness";
import { findImages, loadConfig } from "services/wallpaper/utils/wallpaper";
import {
	loadEngineState,
	normalizeEngineState,
	saveEngineState,
	type WallpaperEngineState,
	type WallpaperMode,
	type WallpaperSourceType,
	type WallpaperStrategy,
} from "services/wallpaper/utils/wallpaperEngine";
import {
	fuzzyFilter,
	getCurrentTheme,
} from "services/wallpaper/utils/wallpaperUtils";
import wallpaper from "services/wallpaper/Wallpaper";
// import { startAutoDarkModeService } from "services/system/darkmode"
// import { firstRunWelcome, startBatteryWarningService } from "services/ai/messages"
// import Crosshair from "widget/modules/Crosshair"
import Bar from "widget/bar/Bar";
import Indicators from "widget/notifications/Indicators";
import Session from "widget/session/Session";
import SideLeft from "widget/sideleft/SideLeft";
import SideRight from "widget/sideright/SideRight";
import WallpaperSelector from "widget/wallpaperselector/WallpaperSelector";

// import Dock from "widget/Dock"
// import userOptions from "services/options/Options"

app.start({
	css: `${COMPILED_STYLE_DIR}/style.css`,
	main() {
		handleStyles(true);

		const settings = Gtk.Settings.get_default();
		if (settings) {
			settings.gtk_enable_animations = true;
		}

		// Configure notification daemon to keep notifications
		const notifd = Notifd.get_default();
		notifd.set_ignore_timeout(true);

		// Initialize services
		void wallpaper; // Ensure wallpaper service is loaded

		// startAutoDarkModeService()
		// firstRunWelcome()
		// startBatteryWarningService()

		const monitors = app.get_monitors();

		monitors.forEach((monitor, index) => {
			Bar(monitor, index);
			SideLeft(monitor, index);
			SideRight(monitor, index);
			Indicators(monitor, index);
			Session(monitor, index);
			WallpaperSelector(monitor, index);
			// Crosshair(monitor, index)
			//
			// if (userOptions.dock.enabled) {
			//     Dock(monitor, index)
			// }
		});
	},
	requestHandler(argv: string[], res: (response: any) => void) {
		let engineState = normalizeEngineState(loadEngineState());

		const syncEngineState = () => {
			engineState = normalizeEngineState(engineState);
			saveEngineState(engineState);
		};

		const uniquePaths = (paths: string[]) => {
			const seen = new Set<string>();
			const out: string[] = [];
			for (const p of paths) {
				if (!p || seen.has(p)) continue;
				seen.add(p);
				out.push(p);
			}
			return out;
		};

		const shufflePaths = (paths: string[]) => {
			const copy = [...paths];
			for (let i = copy.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const tmp = copy[i];
				copy[i] = copy[j];
				copy[j] = tmp;
			}
			return copy;
		};

		const normalizePoolForState = (
			state: WallpaperEngineState,
			pool: string[],
		) => {
			const uniquePool = uniquePaths(pool);
			const queueSet = new Set(state.queue);
			const poolSet = new Set(uniquePool);
			const sameSize = queueSet.size === poolSet.size;
			let sameValues = sameSize;
			if (sameValues) {
				for (const item of queueSet) {
					if (!poolSet.has(item)) {
						sameValues = false;
						break;
					}
				}
			}

			if (!sameValues || state.queue.length === 0) {
				state.queue =
					state.strategy === "shuffle"
						? shufflePaths(uniquePool)
						: [...uniquePool];
				state.currentIndex = -1;
			}

			return uniquePool;
		};

		const updateHistory = (
			state: WallpaperEngineState,
			wallpaperPath: string,
		) => {
			const last = state.history[state.history.length - 1];
			if (last !== wallpaperPath) {
				state.history.push(wallpaperPath);
				if (state.history.length > state.maxHistory) {
					state.history = state.history.slice(-state.maxHistory);
				}
			}
			state.historyCursor = state.history.length - 1;
		};

		const getDiscoveryOptions = () => {
			const configPath = PATHS.wallpaperConfig;
			const config = loadConfig(configPath);
			return {
				wallpaperDir: config.wallpaperDir,
				recursiveSearch: config.recursiveSearch ?? true,
				includeHidden: config.includeHidden ?? false,
			};
		};

		const resolveSourcePool = async (state: WallpaperEngineState) => {
			const { wallpaperDir, recursiveSearch, includeHidden } =
				getDiscoveryOptions();
			const findOptions = { recursiveSearch, includeHidden };

			if (state.sourceType === "specific-theme") {
				if (!state.sourceValue) {
					throw new Error("specific-theme source requires a theme path");
				}
				return findImages(`${wallpaperDir}/${state.sourceValue}`, findOptions);
			}

			if (state.sourceType === "favorites") {
				const valid = state.favorites.filter((path) =>
					GLib.file_test(path, GLib.FileTest.EXISTS),
				);
				state.favorites = valid;
				return valid;
			}

			const all = await findImages(wallpaperDir, findOptions);
			if (state.sourceType === "filtered-library") {
				if (!state.sourceValue.trim()) return all;
				return fuzzyFilter(all, state.sourceValue);
			}

			const activeTheme = await getCurrentTheme(wallpaperDir, findOptions);
			if (!activeTheme) return all;
			return findImages(`${wallpaperDir}/${activeTheme}`, findOptions);
		};

		const selectNextWallpaper = async (
			state: WallpaperEngineState,
			forwardInHistory: boolean,
		) => {
			if (forwardInHistory && state.historyCursor < state.history.length - 1) {
				state.historyCursor += 1;
				const fromHistory = state.history[state.historyCursor];
				if (fromHistory) return fromHistory;
			}

			const pool = await resolveSourcePool(state);
			if (pool.length === 0) {
				throw new Error("source has no wallpapers");
			}

			const currentWallpaper = wallpaper.getCurrentWallpaper();

			if (state.strategy === "random") {
				if (pool.length === 1) return pool[0];
				const candidates = pool.filter((path) => path !== currentWallpaper);
				const pickerPool = candidates.length > 0 ? candidates : pool;
				const pickIndex = Math.floor(Math.random() * pickerPool.length);
				return pickerPool[pickIndex];
			}

			const normalizedPool = normalizePoolForState(state, pool);
			if (state.currentIndex < 0 && currentWallpaper) {
				state.currentIndex = state.queue.indexOf(currentWallpaper);
			}

			let nextIndex = state.currentIndex + 1;
			if (nextIndex >= state.queue.length) {
				if (state.strategy === "shuffle") {
					state.queue = shufflePaths(normalizedPool);
				}
				nextIndex = 0;
			}

			state.currentIndex = nextIndex;
			return state.queue[nextIndex];
		};

		const selectPreviousWallpaper = (state: WallpaperEngineState) => {
			if (state.history.length === 0) {
				throw new Error("history is empty");
			}

			if (state.historyCursor < 0) {
				state.historyCursor = state.history.length - 1;
			}

			if (state.historyCursor === 0) {
				throw new Error("already at oldest wallpaper in history");
			}

			state.historyCursor -= 1;
			const path = state.history[state.historyCursor];
			if (!path) {
				throw new Error("failed to resolve previous wallpaper");
			}
			return path;
		};

		const applyWallpaperAndTrack = async (path: string) => {
			await wallpaper.setWallpaper(path);
			const queueIndex = engineState.queue.indexOf(path);
			if (queueIndex >= 0) engineState.currentIndex = queueIndex;
			updateHistory(engineState, path);
			syncEngineState();
			return path;
		};

		const startEngineAutomatic = async () => {
			const picker = async () => {
				const nextPath = await selectNextWallpaper(engineState, false);
				updateHistory(engineState, nextPath);
				syncEngineState();
				return nextPath;
			};

			await wallpaper.startAutoChange(
				undefined,
				engineState.intervalSeconds,
				undefined,
				picker,
			);

			engineState.mode = "automatic";
			engineState.isRunning = true;
			syncEngineState();
		};

		if (argv[0] === "handleStyles") {
			// Save which windows are currently visible before style reset
			const visibleWindows: string[] = [];
			const allWindows = app.get_windows();
			for (const win of allWindows) {
				if (win.visible && win.name) {
					visibleWindows.push(win.name);
				}
			}

			handleStyles(true);

			// Restore visibility of windows that were open before the style reset
			if (visibleWindows.length > 0) {
				// Use a short timeout to let the style application settle

				GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
					for (const winName of visibleWindows) {
						const win = app.get_window(winName);
						if (win && !win.visible) {
							win.set_visible(true);
						}
					}
					return GLib.SOURCE_REMOVE;
				});
			}
			return res("ok");
		}

		if (argv[0] === "session") {
			const monitors = app.get_monitors();
			monitors.forEach((_, index) => {
				app.toggle_window(`session${index}`);
			});
			return res("ok");
		}

		if (argv[0] === "wallpaper-selector") {
			const monitors = app.get_monitors();
			monitors.forEach((_, index) => {
				app.toggle_window(`wallpaper-selector${index}`);
			});
			return res("ok");
		}

		if (argv[0] === "wallpaper") {
			const _configPath = PATHS.wallpaperConfig;
			const subcommand = argv[1];

			if (subcommand === "engine") {
				const engineCmd = argv[2];

				if (engineCmd === "get") {
					return res(JSON.stringify(engineState));
				}

				if (engineCmd === "set") {
					const key = argv[3];
					const value = argv[4];

					if (key === "mode") {
						if (value !== "manual" && value !== "automatic") {
							return res("error: mode must be manual|automatic");
						}
						engineState.mode = value as WallpaperMode;
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					if (key === "interval") {
						const interval = parseInt(value, 10);
						if (Number.isNaN(interval) || interval < 30) {
							return res("error: interval must be >= 30 seconds");
						}
						engineState.intervalSeconds = interval;

						if (engineState.isRunning) {
							wallpaper
								.updateAutoChangeInterval(interval)
								.catch((error: Error) => {
									Logger.error(
										"Failed to update running auto mode interval:",
										error,
									);
								});
						}

						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					if (key === "source") {
						const sourceType = value as WallpaperSourceType;
						const sourceValue = argv.slice(5).join(" ");
						const allowed: WallpaperSourceType[] = [
							"current-theme",
							"specific-theme",
							"favorites",
							"filtered-library",
						];
						if (!allowed.includes(sourceType)) {
							return res(
								"error: source must be current-theme|specific-theme|favorites|filtered-library",
							);
						}

						engineState.sourceType = sourceType;
						engineState.sourceValue = sourceValue;
						engineState.queue = [];
						engineState.currentIndex = -1;
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					if (key === "strategy") {
						const strategy = value as WallpaperStrategy;
						const allowed: WallpaperStrategy[] = [
							"random",
							"shuffle",
							"sequential",
						];
						if (!allowed.includes(strategy)) {
							return res("error: strategy must be random|shuffle|sequential");
						}

						engineState.strategy = strategy;
						engineState.queue = [];
						engineState.currentIndex = -1;
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					return res(`error: unknown engine set key ${key}`);
				}

				if (engineCmd === "favorites") {
					const action = argv[3];
					const path = argv.slice(4).join(" ");

					if (action === "list") {
						return res(JSON.stringify(engineState.favorites));
					}

					if (action === "add") {
						if (!path) return res("error: favorites add requires a path");
						if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
							return res("error: file does not exist");
						}
						if (!engineState.favorites.includes(path)) {
							engineState.favorites = [...engineState.favorites, path];
						}
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					if (action === "remove") {
						if (!path) return res("error: favorites remove requires a path");
						engineState.favorites = engineState.favorites.filter(
							(item) => item !== path,
						);
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					return res(`error: unknown favorites command ${action}`);
				}

				if (engineCmd === "recent") {
					if (argv[3] === "list") {
						return res(JSON.stringify(engineState.history.slice().reverse()));
					}
					return res("error: unknown recent command");
				}

				if (engineCmd === "auto") {
					const autoCmd = argv[3];

					if (autoCmd === "start") {
						const intervalArg = argv[4];
						const interval = intervalArg
							? parseInt(intervalArg, 10)
							: engineState.intervalSeconds;

						if (Number.isNaN(interval) || interval < 30) {
							return res("error: interval must be >= 30 seconds");
						}

						engineState.intervalSeconds = interval;
						startEngineAutomatic()
							.then(() => {
								res(JSON.stringify(engineState));
							})
							.catch((error: Error) => {
								res(`error: ${error.message}`);
							});
						return;
					}

					if (autoCmd === "stop") {
						wallpaper.stopAutoChange();
						engineState.isRunning = false;
						engineState.mode = "manual";
						syncEngineState();
						return res(JSON.stringify(engineState));
					}

					if (autoCmd === "status") {
						return res(JSON.stringify(engineState));
					}

					return res(`error: unknown engine auto command ${autoCmd}`);
				}

				return res(`error: unknown engine command ${engineCmd}`);
			}

			if (subcommand === "next") {
				selectNextWallpaper(engineState, true)
					.then((path) => applyWallpaperAndTrack(path))
					.then((path) => res(path))
					.catch((error: Error) => res(`error: ${error.message}`));
				return;
			}

			if (subcommand === "prev") {
				try {
					const path = selectPreviousWallpaper(engineState);
					wallpaper
						.setWallpaper(path)
						.then(() => {
							syncEngineState();
							res(path);
						})
						.catch((error: Error) => res(`error: ${error.message}`));
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					res(`error: ${message}`);
				}
				return;
			}

			if (subcommand === "random") {
				wallpaper
					.setRandomWallpaper()
					.then(() => {
						res("random wallpaper set");
					})
					.catch((error: Error) => {
						res(`error: ${error.message}`);
					});
				return;
			}

			if (subcommand === "favorite") {
				const action = argv[2];
				const pathArg = argv.slice(3).join(" ");
				const path = pathArg || wallpaper.getCurrentWallpaper();

				if (!path) {
					return res("error: no wallpaper path to favorite");
				}

				if (action === "add") {
					if (!engineState.favorites.includes(path)) {
						engineState.favorites = [...engineState.favorites, path];
					}
					syncEngineState();
					return res(JSON.stringify(engineState));
				}

				if (action === "remove") {
					engineState.favorites = engineState.favorites.filter(
						(item) => item !== path,
					);
					syncEngineState();
					return res(JSON.stringify(engineState));
				}

				if (action === "toggle") {
					const exists = engineState.favorites.includes(path);
					engineState.favorites = exists
						? engineState.favorites.filter((item) => item !== path)
						: [...engineState.favorites, path];
					syncEngineState();
					return res(JSON.stringify(engineState));
				}

				if (action === "list") {
					return res(JSON.stringify(engineState.favorites));
				}

				return res(`error: unknown favorite subcommand ${action}`);
			}

			if (subcommand === "play") {
				startEngineAutomatic()
					.then(() => res(JSON.stringify(engineState)))
					.catch((error: Error) => res(`error: ${error.message}`));
				return;
			}

			if (subcommand === "pause") {
				wallpaper.stopAutoChange();
				engineState.isRunning = false;
				engineState.mode = "manual";
				syncEngineState();
				return res(JSON.stringify(engineState));
			}

			return res(`unknown wallpaper subcommand: ${subcommand}`);
		}

		if (argv[0] === "brightness") {
			let valStr = argv[1];
			if (valStr === "--") valStr = argv[2];

			const val = parseFloat(valStr);
			if (Number.isNaN(val)) return res(`invalid value: ${valStr}`);

			if (valStr.startsWith("+") || valStr.startsWith("-")) {
				brightness.screen_value += val;
			} else {
				brightness.screen_value = val;
			}
			return res(String(brightness.screen_value));
		}

		res("unknown command");
	},
});
