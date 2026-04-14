import GLib from "gi://GLib";
import { execAsync } from "ags/process";
import { CONFIG_DIR, ensureDirectory, PATHS } from "lib/constants";
import Logger from "lib/logger";

export type TransitionType =
	| "none"
	| "simple"
	| "fade"
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "wipe"
	| "wave"
	| "grow"
	| "center"
	| "any"
	| "outer"
	| "random";

export interface TransitionOptions {
	fps?: number;
	type?: TransitionType;
	duration?: number;
	bezier?: string;
	angle?: number;
	pos?: string;
	wave?: string;
	invertY?: boolean;
	step?: number;
}

export interface WallpaperConfig {
	wallpaperDir: string;
	recursiveSearch: boolean;
	includeHidden: boolean;
	transition: TransitionOptions;
	colorGenerationScript: string;
	stateFile: string;
}

export const DEFAULT_CONFIG: WallpaperConfig = {
	wallpaperDir: `${GLib.get_home_dir()}/Pictures/Wallpapers`,
	recursiveSearch: true,
	includeHidden: false,
	transition: {
		fps: 60,
		type: "any",
		duration: 1,
		bezier: ".54,0,.34,.99",
	},
	colorGenerationScript: `${CONFIG_DIR}/scripts/color_generation/colorgen.sh`,
	stateFile: PATHS.wallpaperState,
};

/**
 * Expand ~ to home directory and resolve relative paths
 */
export function expandPath(path: string): string {
	if (path.startsWith("~")) {
		return path.replace("~", GLib.get_home_dir());
	}
	return path;
}

/**
 * Find all image files in a directory (jpg, jpeg, png, gif)
 * @throws Error if directory doesn't exist or no images found
 */
export async function findImages(
	directory: string,
	options?: {
		recursiveSearch?: boolean;
		includeHidden?: boolean;
	},
): Promise<string[]> {
	const expandedDir = expandPath(directory);
	const recursiveSearch = options?.recursiveSearch ?? true;
	const includeHidden = options?.includeHidden ?? false;

	// Check if directory exists
	if (!GLib.file_test(expandedDir, GLib.FileTest.IS_DIR)) {
		throw new Error(`Directory does not exist: ${expandedDir}`);
	}

	try {
		const findArgs = ["find", expandedDir];

		if (!recursiveSearch) {
			findArgs.push("-maxdepth", "1");
		}

		findArgs.push(
			"-type",
			"f",
			"(",
			"-iname",
			"*.jpg",
			"-o",
			"-iname",
			"*.jpeg",
			"-o",
			"-iname",
			"*.png",
			"-o",
			"-iname",
			"*.gif",
			")",
		);

		if (!includeHidden) {
			findArgs.push(
				"-not",
				"-path",
				`${expandedDir}/.*`,
				"-not",
				"-path",
				"*/.*",
			);
		}

		const output = await execAsync([...findArgs]);

		const images = output
			.trim()
			.split("\n")
			.filter((line) => line.length > 0);

		if (images.length === 0) {
			throw new Error(`No images found in directory: ${expandedDir}`);
		}

		return images;
	} catch (error) {
		if (error instanceof Error && error.message.includes("No images found")) {
			throw error;
		}
		throw new Error(`Failed to find images in ${expandedDir}: ${error}`);
	}
}

/**
 * Find first image file in a directory according to discovery options.
 * Returns empty string when no image is found.
 */
export async function findFirstImage(
	directory: string,
	options?: {
		recursiveSearch?: boolean;
		includeHidden?: boolean;
	},
): Promise<string> {
	const expandedDir = expandPath(directory);
	const recursiveSearch = options?.recursiveSearch ?? true;
	const includeHidden = options?.includeHidden ?? false;

	if (!GLib.file_test(expandedDir, GLib.FileTest.IS_DIR)) {
		throw new Error(`Directory does not exist: ${expandedDir}`);
	}

	const args = ["find", expandedDir];

	if (!recursiveSearch) {
		args.push("-maxdepth", "1");
	}

	args.push(
		"-type",
		"f",
		"(",
		"-iname",
		"*.jpg",
		"-o",
		"-iname",
		"*.jpeg",
		"-o",
		"-iname",
		"*.png",
		"-o",
		"-iname",
		"*.gif",
		")",
	);

	if (!includeHidden) {
		args.push("-not", "-path", `${expandedDir}/.*`, "-not", "-path", "*/.*");
	}

	args.push("-print", "-quit");

	try {
		const output = await execAsync(args);
		return output.trim();
	} catch {
		return "";
	}
}

/**
 * Select a random element from an array
 */
export function selectRandom<T>(array: T[]): T {
	if (array.length === 0) {
		throw new Error("Cannot select random element from empty array");
	}
	return array[Math.floor(Math.random() * array.length)];
}

/**
 * Trigger color generation script
 */
export async function triggerColorGen(
	script: string,
	imagePath: string,
): Promise<void> {
	const expandedScript = expandPath(script);

	// Check if script exists
	if (!GLib.file_test(expandedScript, GLib.FileTest.EXISTS)) {
		Logger.warn(`Color generation script not found: ${expandedScript}`);
		return;
	}

	try {
		// Activate venv and run colorgen script
		const venvActivate = `${GLib.get_home_dir()}/.config/ags/scripts/.venv/bin/activate`;
		await execAsync(
			`bash -c 'source ${venvActivate} && ${expandedScript} "${imagePath}" --apply'`,
		);
	} catch (error) {
		Logger.error("Failed to trigger color generation:", error);
		// Non-blocking error - don't throw
	}
}

/**
 * Build awww command line parameters from transition options
 */
export function buildTransitionParams(options: TransitionOptions): string[] {
	const params: string[] = [];

	if (options.fps !== undefined) {
		params.push("--transition-fps", options.fps.toString());
	}
	if (options.type !== undefined) {
		params.push("--transition-type", options.type);
	}
	if (options.duration !== undefined) {
		params.push("--transition-duration", options.duration.toString());
	}
	if (options.bezier !== undefined) {
		params.push("--transition-bezier", options.bezier);
	}
	if (options.angle !== undefined) {
		params.push("--transition-angle", options.angle.toString());
	}
	if (options.pos !== undefined) {
		params.push("--transition-pos", options.pos);
	}
	if (options.wave !== undefined) {
		params.push("--transition-wave", options.wave);
	}
	if (options.step !== undefined) {
		params.push("--transition-step", options.step.toString());
	}
	if (options.invertY) {
		params.push("--invert-y");
	}

	return params;
}

/**
 * Load config from file, or create default if missing
 */
export function loadConfig(configPath: string): WallpaperConfig {
	const expandedPath = expandPath(configPath);

	if (GLib.file_test(expandedPath, GLib.FileTest.EXISTS)) {
		try {
			const contents = GLib.file_get_contents(expandedPath);
			const text = new TextDecoder().decode(contents[1]);
			const config = JSON.parse(text);

			// Merge with defaults to ensure all fields exist
			return {
				...DEFAULT_CONFIG,
				...config,
				transition: {
					...DEFAULT_CONFIG.transition,
					...(config.transition || {}),
				},
			};
		} catch (error) {
			Logger.error("Failed to load config, using defaults:", error);
			return DEFAULT_CONFIG;
		}
	} else {
		// Create default config
		saveConfig(expandedPath, DEFAULT_CONFIG);
		return DEFAULT_CONFIG;
	}
}

/**
 * Save config to file
 */
export function saveConfig(configPath: string, config: WallpaperConfig): void {
	const expandedPath = expandPath(configPath);
	const json = JSON.stringify(config, null, 2);

	try {
		ensureDirectory(expandedPath);
		GLib.file_set_contents(expandedPath, json);
	} catch (error) {
		Logger.error("Failed to save config:", error);
	}
}

/**
 * Load state from file
 */
export function loadState(
	statePath: string,
): { currentWallpaper: string } | null {
	const expandedPath = expandPath(statePath);

	if (!GLib.file_test(expandedPath, GLib.FileTest.EXISTS)) {
		return null;
	}

	try {
		const contents = GLib.file_get_contents(expandedPath);
		const text = new TextDecoder().decode(contents[1]);
		return JSON.parse(text);
	} catch (error) {
		Logger.error("Failed to load state:", error);
		return null;
	}
}

/**
 * Save state to file
 */
export function saveState(
	statePath: string,
	state: { currentWallpaper: string },
): void {
	const expandedPath = expandPath(statePath);
	const json = JSON.stringify(state, null, 2);

	try {
		ensureDirectory(expandedPath);
		GLib.file_set_contents(expandedPath, json);
	} catch (error) {
		Logger.error("Failed to save state:", error);
	}
}
