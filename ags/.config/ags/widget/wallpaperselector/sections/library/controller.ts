import type GObject from "gi://GObject";
import type { Accessor } from "ags";
import { createState } from "ags";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import Logger from "lib/logger";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import {
	fuzzyFilter,
	getCurrentTheme,
	loadThemes,
	updateCurrentTheme,
} from "services/wallpaper/utils/wallpaperUtils";
import wallpaperService from "services/wallpaper/Wallpaper";
import {
	type LibraryView,
	THEME_PREVIEW_LOAD_BATCH,
	THEME_PREVIEW_PRELOAD_LIMIT,
} from "../../types";
import type { GridItem } from "../../WallpaperGridView.js";
import { fuzzyThemeFilter } from "./filters";
import { primeWallpaperThumbnails } from "./thumbnailCache";

const DEBUG_WALLPAPER_PREVIEW = true;
const WALLPAPER_PREVIEW_LOOKBACK = 12;
const WALLPAPER_PREVIEW_LOOKAHEAD = 24;
const WALLPAPER_PREVIEW_BATCH_SIZE = 24;

function logPreviewDebug(message: string) {
	if (!DEBUG_WALLPAPER_PREVIEW) return;
	Logger.info(`[wallpaper-preview] ${message}`);
}

interface CreateLibraryDataControllerProps {
	wallpaperDir: string;
	refreshSignal?: Accessor<number>;
}

export interface LibraryDataController {
	libraryView: Accessor<LibraryView>;
	filteredThemes: Accessor<string[]>;
	filteredImages: Accessor<string[]>;
	browsingTheme: Accessor<string>;
	selectedWallpaper: Accessor<string>;
	selectedIsFavorite: Accessor<boolean>;
	wallpaperPreviewThumbs: Accessor<Record<string, string>>;
	themeItems: Accessor<GridItem[]>;
	imageItems: Accessor<GridItem[]>;
	ensureThemePreviewRange: (start: number, end: number) => void;
	ensureWallpaperPreviewRange: (start: number, end: number) => void;
	handleThemeChange: (newTheme: string) => Promise<void>;
	handleBackToThemes: () => void;
	handleSearchChange: (query: string) => void;
	handleSelectImage: (path: string) => void;
	handleActivateImage: (path: string) => Promise<void>;
	handleRandomInTheme: () => Promise<void>;
	toggleSelectedFavorite: () => Promise<void>;
}

export function createLibraryDataController({
	wallpaperDir,
	refreshSignal,
}: CreateLibraryDataControllerProps): LibraryDataController {
	const configPath = PATHS.wallpaperConfig;

	const [browsingTheme, setBrowsingTheme] = createState("");
	const [appliedTheme, setAppliedTheme] = createState("");
	const [allImages, setAllImages] = createState<string[]>([]);
	const [filteredImages, setFilteredImages] = createState<string[]>([]);
	const [themes, setThemes] = createState<string[]>([]);
	const [filteredThemes, setFilteredThemes] = createState<string[]>([]);
	const [themePreviews, setThemePreviews] = createState<Record<string, string>>(
		{},
	);
	const [_searchQuery, setSearchQuery] = createState("");
	const [currentWallpaper, setCurrentWallpaper] = createState("");
	const [selectedWallpaper, setSelectedWallpaper] = createState("");
	const [favoritesSet, setFavoritesSet] = createState<Set<string>>(new Set());
	const [selectedIsFavorite, setSelectedIsFavorite] = createState(false);
	const [libraryView, setLibraryView] = createState<LibraryView>("themes");
	const [wallpaperPreviewThumbs, setWallpaperPreviewThumbs] = createState<
		Record<string, string>
	>({});
	const [wallpaperVisibleRange, setWallpaperVisibleRange] = createState({
		start: 0,
		end: 96,
	});

	const inferThemeFromWallpaper = (wallpaperPath: string): string => {
		if (!wallpaperPath) return "";
		const prefix = `${wallpaperDir}/`;
		if (!wallpaperPath.startsWith(prefix)) return "";
		const relative = wallpaperPath.slice(prefix.length);

		const knownThemes = themes.get();
		let bestMatch = "";
		for (const theme of knownThemes) {
			if (relative === theme || relative.startsWith(`${theme}/`)) {
				if (theme.length > bestMatch.length) bestMatch = theme;
			}
		}
		if (bestMatch) return bestMatch;

		const parts = relative.split("/");
		return parts[0] || "";
	};

	const pendingThemePreviewLoads = new Set<string>();
	const pendingWallpaperPreviewLoads = new Set<string>();
	let wallpaperPreviewEpoch = 0;
	let queuedWallpaperRange: { start: number; end: number } | null = null;
	let wallpaperPreviewBatchActive = false;

	const invalidateWallpaperPreviewQueue = () => {
		wallpaperPreviewEpoch += 1;
		pendingWallpaperPreviewLoads.clear();
		queuedWallpaperRange = null;
	};

	const enqueueWallpaperPreviewRange = (start: number, end: number) => {
		queuedWallpaperRange = { start, end };
	};

	const getLiveWindowSet = (images: string[], start: number, end: number) => {
		const windowStart = Math.max(0, start - WALLPAPER_PREVIEW_LOOKBACK);
		const windowEnd = Math.min(
			images.length,
			end + WALLPAPER_PREVIEW_LOOKAHEAD,
		);
		const liveWindow = new Set<string>();
		for (let i = windowStart; i < windowEnd; i++) {
			const path = images[i];
			if (path) liveWindow.add(path);
		}
		return {
			liveWindow,
			windowStart,
			windowEnd,
		};
	};

	const buildWallpaperPreviewBatch = (
		images: string[],
		previews: Record<string, string>,
		start: number,
		end: number,
	): string[] => {
		const ordered = new Set<string>();
		const visibleStart = Math.max(0, start);
		const visibleEnd = Math.min(images.length, end);
		const prefetchStart = Math.max(
			0,
			visibleStart - WALLPAPER_PREVIEW_LOOKBACK,
		);
		const prefetchEnd = Math.min(
			images.length,
			visibleEnd + WALLPAPER_PREVIEW_LOOKAHEAD,
		);

		const pushIfNeeded = (sourcePath: string | undefined) => {
			if (!sourcePath) return;
			if (previews[sourcePath]) return;
			if (pendingWallpaperPreviewLoads.has(sourcePath)) return;
			ordered.add(sourcePath);
		};

		for (let index = visibleStart; index < visibleEnd; index++) {
			pushIfNeeded(images[index]);
			if (ordered.size >= WALLPAPER_PREVIEW_BATCH_SIZE) {
				return Array.from(ordered);
			}
		}

		for (let index = visibleEnd; index < prefetchEnd; index++) {
			pushIfNeeded(images[index]);
			if (ordered.size >= WALLPAPER_PREVIEW_BATCH_SIZE) {
				return Array.from(ordered);
			}
		}

		for (let index = visibleStart - 1; index >= prefetchStart; index--) {
			pushIfNeeded(images[index]);
			if (ordered.size >= WALLPAPER_PREVIEW_BATCH_SIZE) {
				return Array.from(ordered);
			}
		}

		return Array.from(ordered);
	};

	const processWallpaperPreviewQueue = () => {
		if (wallpaperPreviewBatchActive) return;
		const nextRange = queuedWallpaperRange;
		if (!nextRange) return;

		queuedWallpaperRange = null;

		const start = nextRange.start;
		const end = nextRange.end;
		const requestEpoch = wallpaperPreviewEpoch;
		const images = filteredImages.get();
		const previews = wallpaperPreviewThumbs.get();
		const toLoad = buildWallpaperPreviewBatch(images, previews, start, end);

		if (toLoad.length === 0) {
			return;
		}

		wallpaperPreviewBatchActive = true;

		logPreviewDebug(
			`range=${start}-${end} queued=${toLoad.length} batch=${WALLPAPER_PREVIEW_BATCH_SIZE}`,
		);

		for (const sourcePath of toLoad) {
			pendingWallpaperPreviewLoads.add(sourcePath);
		}

		void primeWallpaperThumbnails(toLoad)
			.then((batchMap) => {
				if (requestEpoch !== wallpaperPreviewEpoch) {
					logPreviewDebug("discarding stale thumbnail batch (epoch changed)");
					return;
				}

				const liveImages = filteredImages.get();
				const liveRange = wallpaperVisibleRange.get();
				const { liveWindow } = getLiveWindowSet(
					liveImages,
					liveRange.start,
					liveRange.end,
				);

				const current = wallpaperPreviewThumbs.get();
				const next = { ...current };
				let changed = false;

				for (const [sourcePath, thumbPath] of Object.entries(batchMap)) {
					if (!thumbPath) continue;
					if (!liveWindow.has(sourcePath)) continue;
					if (next[sourcePath] === thumbPath) continue;
					next[sourcePath] = thumbPath;
					changed = true;
				}

				if (changed) {
					setWallpaperPreviewThumbs(next);
					logPreviewDebug(
						`applied map updates=${Object.keys(batchMap).length}`,
					);
				}
			})
			.catch((err) => {
				Logger.error("Failed to prime thumbnails:", err);
			})
			.finally(() => {
				for (const sourcePath of toLoad) {
					pendingWallpaperPreviewLoads.delete(sourcePath);
				}

				wallpaperPreviewBatchActive = false;

				if (!queuedWallpaperRange) {
					const liveRange = wallpaperVisibleRange.get();
					enqueueWallpaperPreviewRange(liveRange.start, liveRange.end);
				}

				logPreviewDebug(
					`queue drain complete remainingInFlight=${pendingWallpaperPreviewLoads.size}`,
				);
				processWallpaperPreviewQueue();
			});
	};

	const ensureThemePreviewRange = (start: number, end: number) => {
		const list = filteredThemes.get();
		const previews = themePreviews.get();

		const toLoad: string[] = [];
		const rangeEnd = Math.min(end, list.length);
		for (let index = Math.max(0, start); index < rangeEnd; index++) {
			const theme = list[index];
			if (!theme) continue;
			if (previews[theme] !== undefined) continue;
			if (pendingThemePreviewLoads.has(theme)) continue;
			toLoad.push(theme);
			if (toLoad.length >= THEME_PREVIEW_LOAD_BATCH) break;
		}

		if (toLoad.length === 0) return;

		for (const theme of toLoad) pendingThemePreviewLoads.add(theme);

		void Promise.all(
			toLoad.map(async (theme) => {
				try {
					const first = await wallpaperService.getFirstWallpaper(
						`${wallpaperDir}/${theme}`,
					);
					return [theme, first] as const;
				} catch {
					return [theme, ""] as const;
				}
			}),
		).then(async (entries) => {
			const validPaths = entries.map(([, p]) => p).filter(Boolean);
			const thumbMap =
				validPaths.length > 0 ? await primeWallpaperThumbnails(validPaths) : {};

			const current = themePreviews.get();
			const next = { ...current };
			let changed = false;

			for (const [theme, path] of entries) {
				const thumbPath = path ? thumbMap[path] || path : "";
				if (next[theme] !== thumbPath) {
					next[theme] = thumbPath;
					changed = true;
				}
				pendingThemePreviewLoads.delete(theme);
			}

			if (changed) setThemePreviews(next);
		});
	};

	const ensureWallpaperPreviewRange = (start: number, end: number) => {
		const currentRange = wallpaperVisibleRange.get();
		if (currentRange.start !== start || currentRange.end !== end) {
			wallpaperPreviewEpoch += 1;
			pendingWallpaperPreviewLoads.clear();
			setWallpaperVisibleRange({ start, end });
		}

		enqueueWallpaperPreviewRange(start, end);
		processWallpaperPreviewQueue();
	};

	wallpaperService.connect(
		"wallpaper-changed",
		(_source: GObject.Object, wallpaperPathObj: unknown) => {
			const newWallpaper =
				typeof wallpaperPathObj === "string"
					? wallpaperPathObj
					: String(wallpaperPathObj ?? "");
			setCurrentWallpaper(newWallpaper);
			setSelectedWallpaper(newWallpaper);

			const inferredTheme = inferThemeFromWallpaper(newWallpaper);
			if (!inferredTheme) return;

			setAppliedTheme(inferredTheme);
			void updateCurrentTheme(wallpaperDir, inferredTheme).catch(
				(error: unknown) => {
					Logger.error(
						"Failed to sync .crt_theme after wallpaper change:",
						error,
					);
				},
			);
		},
	);

	const initialWallpaper = wallpaperService.getCurrentWallpaper();
	setCurrentWallpaper(initialWallpaper);
	setSelectedWallpaper(initialWallpaper);
	const initialInferredTheme = inferThemeFromWallpaper(initialWallpaper);
	if (initialInferredTheme) {
		setAppliedTheme(initialInferredTheme);
		setBrowsingTheme(initialInferredTheme);
	}

	const loadThemeCatalog = async () => {
		const config = loadConfig(configPath);
		const recursiveSearch = config.recursiveSearch ?? true;
		const includeHidden = config.includeHidden ?? false;

		try {
			const themeList = await loadThemes(wallpaperDir, {
				recursiveSearch,
				includeHidden,
			});
			setThemes(themeList);
			setFilteredThemes(themeList);

			const previews: Record<string, string> = {};
			await Promise.all(
				themeList
					.slice(0, THEME_PREVIEW_PRELOAD_LIMIT)
					.map(async (theme: string) => {
						try {
							previews[theme] = await wallpaperService.getFirstWallpaper(
								`${wallpaperDir}/${theme}`,
							);
						} catch {
							previews[theme] = "";
						}
					}),
			);
			setThemePreviews(previews);
			ensureThemePreviewRange(0, THEME_PREVIEW_PRELOAD_LIMIT * 2);
		} catch (error) {
			Logger.error("Failed to load themes:", error);
			setThemes([]);
			setFilteredThemes([]);
			setThemePreviews({});
		}
	};

	const loadImagesForTheme = async (theme: string) => {
		if (!theme) return;

		try {
			const themeDir = `${wallpaperDir}/${theme}`;
			const images = await wallpaperService.getWallpapers(themeDir);
			setAllImages(images);
			setFilteredImages(images);
			const current = currentWallpaper.get();
			if (current && images.includes(current)) {
				setSelectedWallpaper(current);
			} else {
				setSelectedWallpaper(images[0] || "");
			}
			setSearchQuery("");
		} catch (error) {
			Logger.error(`Failed to load images for theme ${theme}:`, error);
			setAllImages([]);
			setFilteredImages([]);
			setSelectedWallpaper("");
		}
	};

	const refreshDiscoveryData = async () => {
		await loadThemeCatalog();
		const theme = browsingTheme.get();
		if (theme) {
			await loadImagesForTheme(theme);
		} else {
			setAllImages([]);
			setFilteredImages([]);
		}
	};

	const init = async () => {
		try {
			const config = loadConfig(configPath);
			const recursiveSearch = config.recursiveSearch ?? true;
			const includeHidden = config.includeHidden ?? false;
			const themeFromFile = await getCurrentTheme(wallpaperDir, {
				recursiveSearch,
				includeHidden,
			});
			const inferredFromWallpaper = inferThemeFromWallpaper(
				currentWallpaper.get(),
			);
			const effectiveTheme = inferredFromWallpaper || themeFromFile;

			setAppliedTheme(effectiveTheme);
			setBrowsingTheme(effectiveTheme);
			const favoritesRaw = await execAsync([
				"ags",
				"request",
				"wallpaper",
				"favorite",
				"list",
			]);

			try {
				const favorites = JSON.parse(favoritesRaw) as unknown;
				if (Array.isArray(favorites)) {
					setFavoritesSet(
						new Set(
							favorites.filter(
								(item): item is string => typeof item === "string",
							),
						),
					);
				}
			} catch (_parseError) {
				Logger.warn("Failed to parse favorites list:", favoritesRaw);
				setFavoritesSet(new Set());
			}

			await loadThemeCatalog();
		} catch (error) {
			Logger.error("Failed to initialize library section:", error);
		}
	};

	const refreshSelectedFavorite = () => {
		const selected = selectedWallpaper.get();
		if (!selected) {
			setSelectedIsFavorite(false);
			return;
		}
		setSelectedIsFavorite(favoritesSet.get().has(selected));
	};
	selectedWallpaper.subscribe(refreshSelectedFavorite);

	const [themeItems, setThemeItems] = createState<GridItem[]>([]);
	const rebuildThemeItems = () => {
		const th = filteredThemes.get();
		const prev = themePreviews.get();
		const active = appliedTheme.get();
		setThemeItems(
			th.map((t) => ({
				id: t,
				previewPath: prev[t] || undefined,
				label: t,
				isActive: t === active,
			})),
		);
	};
	filteredThemes.subscribe(rebuildThemeItems);
	themePreviews.subscribe(rebuildThemeItems);
	appliedTheme.subscribe(rebuildThemeItems);

	const [imageItems, setImageItems] = createState<GridItem[]>([]);
	const rebuildImageItems = () => {
		const imgs = filteredImages.get();
		const current = selectedWallpaper.get();
		setImageItems(
			imgs.map((p) => ({
				id: p,
				previewPath: undefined,
				label: p.split("/").pop() || "",
				isActive: p === current,
				isGif: p.toLowerCase().endsWith(".gif"),
			})),
		);
	};
	filteredImages.subscribe(rebuildImageItems);
	selectedWallpaper.subscribe(rebuildImageItems);
	filteredImages.subscribe(() => {
		invalidateWallpaperPreviewQueue();
		ensureWallpaperPreviewRange(0, 96);
	});

	setTimeout(() => {
		void init();
	}, 0);

	favoritesSet.subscribe(refreshSelectedFavorite);

	if (refreshSignal) {
		refreshSignal.subscribe(() => {
			void refreshDiscoveryData();
		});
	}

	const handleThemeChange = async (newTheme: string) => {
		invalidateWallpaperPreviewQueue();
		setBrowsingTheme(newTheme);
		setLibraryView("wallpapers");
		await loadImagesForTheme(newTheme);
	};

	const handleBackToThemes = () => {
		invalidateWallpaperPreviewQueue();
		setLibraryView("themes");
		setSearchQuery("");
		setFilteredThemes(themes.get());
	};

	const handleSearchChange = (query: string) => {
		setSearchQuery(query);

		if (libraryView.get() === "themes") {
			setFilteredThemes(fuzzyThemeFilter(themes.get(), query));
			return;
		}

		const filtered = fuzzyFilter(allImages.get(), query);
		setFilteredImages(filtered);
	};

	const handleSelectImage = (path: string) => {
		setSelectedWallpaper(path);
	};

	const handleActivateImage = async (path: string) => {
		try {
			await wallpaperService.setWallpaper(path);
		} catch (error) {
			Logger.error("Failed to set wallpaper:", error);
		}
	};

	const handleRandomInTheme = async () => {
		const theme = browsingTheme.get();
		if (!theme) return;
		try {
			await wallpaperService.setRandomWallpaper(`${wallpaperDir}/${theme}`);
		} catch (error) {
			Logger.error("Failed to set random wallpaper in theme:", error);
		}
	};

	const toggleSelectedFavorite = async () => {
		const selected = selectedWallpaper.get();
		if (!selected) return;

		try {
			const result = await execAsync([
				"ags",
				"request",
				"wallpaper",
				"favorite",
				"toggle",
				selected,
			]);

			try {
				const parsed = JSON.parse(result) as { favorites?: string[] };
				const favorites = Array.isArray(parsed.favorites)
					? parsed.favorites.filter(
							(item): item is string => typeof item === "string",
						)
					: [];
				setFavoritesSet(new Set(favorites));
			} catch (_parseError) {
				Logger.warn("Failed to parse toggle favorite response:", result);
			}
		} catch (error) {
			Logger.error("Failed to toggle favorite wallpaper:", error);
		}
	};

	return {
		libraryView,
		filteredThemes,
		filteredImages,
		browsingTheme,
		selectedWallpaper,
		selectedIsFavorite,
		wallpaperPreviewThumbs,
		themeItems,
		imageItems,
		ensureThemePreviewRange,
		ensureWallpaperPreviewRange,
		handleThemeChange,
		handleBackToThemes,
		handleSearchChange,
		handleSelectImage,
		handleActivateImage,
		handleRandomInTheme,
		toggleSelectedFavorite,
	};
}
