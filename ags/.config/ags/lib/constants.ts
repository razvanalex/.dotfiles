import GLib from "gi://GLib";

/**
 * Standard XDG directory paths for the application.
 */
export const CONFIG_DIR = `${GLib.get_user_config_dir()}/ags`;
export const STATE_DIR = `${GLib.get_user_state_dir()}/ags`;
export const DATA_DIR = `${GLib.get_user_data_dir()}/ags`;
export const CACHE_DIR = `${GLib.get_user_cache_dir()}/ags`;

/**
 * Centralized file paths for configuration and state management.
 */
export const PATHS = {
	// Persistent Data (Secrets and User-defined Settings)
	apiKeys: `${DATA_DIR}/api_keys.json`,
	wallpaperConfig: `${DATA_DIR}/wallpaper_config.json`,

	// State (History, Session Data, Application State)
	chatHistory: `${STATE_DIR}/chat_history.json`,
	wallpaperState: `${STATE_DIR}/wallpaper_state.json`,
	wallpaperEngineState: `${STATE_DIR}/wallpaper_engine_state.json`,
	todo: `${STATE_DIR}/user/todo.json`,
};

/**
 * Ensures the parent directory of a given file path exists.
 * @param filePath The full path to a file whose parent directory should be created.
 */
export function ensureDirectory(filePath: string) {
	const lastSlash = filePath.lastIndexOf("/");
	if (lastSlash === -1) return;

	const dir = filePath.substring(0, lastSlash);
	if (!GLib.file_test(dir, GLib.FileTest.IS_DIR)) {
		GLib.mkdir_with_parents(dir, 0o755);
	}
}
