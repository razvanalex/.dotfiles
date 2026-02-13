import GObject from "gi://GObject"
import GLib from "gi://GLib"
import { execAsync } from "ags/process"
import {
    WallpaperConfig,
    TransitionOptions,
    expandPath,
    findImages,
    selectRandom,
    triggerColorGen,
    buildTransitionParams,
    loadConfig,
    saveConfig,
    loadState,
    saveState
} from "../lib/wallpaper"

class Wallpaper extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                "current-wallpaper": GObject.ParamSpec.string(
                    "current-wallpaper",
                    "Current Wallpaper",
                    "Path to the current wallpaper",
                    GObject.ParamFlags.READWRITE,
                    ""
                ),
                "is-animating": GObject.ParamSpec.boolean(
                    "is-animating",
                    "Is Animating",
                    "Whether a transition is in progress",
                    GObject.ParamFlags.READWRITE,
                    false
                ),
            },
            Signals: {
                "wallpaper-changed": {
                    param_types: [GObject.TYPE_STRING]
                },
                "wallpaper-error": {
                    param_types: [GObject.TYPE_STRING]
                }
            }
        }, this)
    }

    #currentWallpaper = ""
    #isAnimating = false
    #autoChangeTimer: number | null = null
    #config: WallpaperConfig
    #configPath: string

    get current_wallpaper() { return this.#currentWallpaper }
    set current_wallpaper(value: string) {
        this.#currentWallpaper = value
        this.notify("current-wallpaper")
    }

    get is_animating() { return this.#isAnimating }
    set is_animating(value: boolean) {
        this.#isAnimating = value
        this.notify("is-animating")
    }

    constructor() {
        super()
        this.#configPath = `${GLib.get_home_dir()}/.config/ags/wallpaper_config.json`
        this.#config = loadConfig(this.#configPath)
        this.#init()
    }

    #init() {
        // Load last wallpaper from state
        const state = loadState(this.#config.stateFile)
        if (state?.currentWallpaper) {
            this.#currentWallpaper = state.currentWallpaper
            this.notify("current-wallpaper")
            console.log(`Wallpaper: Restored last wallpaper: ${this.#currentWallpaper}`)
        }

        // Ensure awww daemon is running
        this.#ensureAwwwDaemon().catch(err => {
            console.error("Wallpaper: Failed to start awww daemon:", err)
        })
    }

    /**
     * Ensure awww-daemon is running
     */
    async #ensureAwwwDaemon(): Promise<void> {
        try {
            // Check if daemon is running
            await execAsync("awww query")
            console.log("Wallpaper: awww daemon is already running")
        } catch {
            // Start daemon
            console.log("Wallpaper: Starting awww daemon...")
            try {
                await execAsync("awww-daemon --format xrgb &")
                // Give it a moment to start
                await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    resolve(null)
                    return GLib.SOURCE_REMOVE
                }))
                console.log("Wallpaper: awww daemon started")
            } catch (error) {
                throw new Error(`Failed to start awww daemon: ${error}`)
            }
        }
    }

    /**
     * Apply a wallpaper with transition effects
     */
    async #applyWallpaper(path: string, options?: TransitionOptions): Promise<void> {
        const expandedPath = expandPath(path)

        // Check if file exists
        if (!GLib.file_test(expandedPath, GLib.FileTest.EXISTS)) {
            throw new Error(`Wallpaper file does not exist: ${expandedPath}`)
        }

        // Merge options with config defaults
        const transitionOptions: TransitionOptions = {
            ...this.#config.transition,
            ...(options || {})
        }

        // Build awww command
        const params = buildTransitionParams(transitionOptions)
        const cmd = ["awww", "img", expandedPath, ...params]

        // Ensure daemon is running
        await this.#ensureAwwwDaemon()

        // Set animating flag
        this.is_animating = true

        try {
            // Apply wallpaper
            await execAsync(cmd)

            // Update state
            this.current_wallpaper = expandedPath
            this.#saveState()

            // Trigger color generation
            await triggerColorGen(this.#config.colorGenerationScript, expandedPath)

            // Emit signal
            this.emit("wallpaper-changed", expandedPath)

            console.log(`Wallpaper: Applied ${expandedPath}`)
        } catch (error) {
            const errorMsg = `Failed to apply wallpaper: ${error}`
            this.emit("wallpaper-error", errorMsg)
            throw new Error(errorMsg)
        } finally {
            // Clear animating flag after transition
            const duration = (transitionOptions.duration || 1) * 1000
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                this.is_animating = false
                return GLib.SOURCE_REMOVE
            })
        }
    }

    /**
     * Save current state to file
     */
    #saveState() {
        saveState(this.#config.stateFile, {
            currentWallpaper: this.#currentWallpaper
        })
    }

    /**
     * Set a specific wallpaper
     */
    async setWallpaper(path: string, options?: TransitionOptions): Promise<void> {
        try {
            await this.#applyWallpaper(path, options)
        } catch (error) {
            // Error is already emitted in #applyWallpaper
            throw error
        }
    }

    /**
     * Set a random wallpaper from a directory
     */
    async setRandomWallpaper(directory?: string, options?: TransitionOptions): Promise<void> {
        const dir = directory || this.#config.wallpaperDir

        try {
            const images = await findImages(dir)
            const randomImage = selectRandom(images)
            await this.#applyWallpaper(randomImage, options)
        } catch (error) {
            const errorMsg = `Failed to set random wallpaper: ${error}`
            this.emit("wallpaper-error", errorMsg)
            throw new Error(errorMsg)
        }
    }

    /**
     * Get list of wallpapers from a directory
     */
    async getWallpapers(directory?: string): Promise<string[]> {
        const dir = directory || this.#config.wallpaperDir
        
        try {
            return await findImages(dir)
        } catch (error) {
            const errorMsg = `Failed to get wallpapers: ${error}`
            this.emit("wallpaper-error", errorMsg)
            throw new Error(errorMsg)
        }
    }

    /**
     * Get current wallpaper path
     */
    getCurrentWallpaper(): string {
        return this.#currentWallpaper
    }

    /**
     * Start auto-changing wallpapers at intervals
     */
    async startAutoChange(directory?: string, interval?: number, options?: TransitionOptions): Promise<void> {
        // Stop any existing auto-change
        this.stopAutoChange()

        const dir = directory || this.#config.wallpaperDir
        const intervalMs = (interval || 3000) * 1000 // Default 3000 seconds

        try {
            // Verify directory has images first
            const images = await findImages(dir)
            
            if (images.length === 0) {
                const errorMsg = `No images found in directory: ${dir}`
                this.emit("wallpaper-error", errorMsg)
                throw new Error(errorMsg)
            }

            // Apply first wallpaper immediately
            const randomImage = selectRandom(images)
            await this.#applyWallpaper(randomImage, options)

            // Set up timer for subsequent changes
            this.#autoChangeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
                // Async operation in timer - don't await
                this.setRandomWallpaper(dir, options).catch(err => {
                    console.error("Auto-change error:", err)
                })
                return GLib.SOURCE_CONTINUE
            })

            console.log(`Wallpaper: Auto-change started (interval: ${interval}s)`)
        } catch (error) {
            const errorMsg = `Failed to start auto-change: ${error}`
            this.emit("wallpaper-error", errorMsg)
            throw new Error(errorMsg)
        }
    }

    /**
     * Stop auto-changing wallpapers
     */
    stopAutoChange(): void {
        if (this.#autoChangeTimer !== null) {
            GLib.source_remove(this.#autoChangeTimer)
            this.#autoChangeTimer = null
            console.log("Wallpaper: Auto-change stopped")
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): WallpaperConfig {
        return { ...this.#config }
    }

    /**
     * Update configuration (partial update)
     */
    setConfig(partialConfig: Partial<WallpaperConfig>): void {
        this.#config = {
            ...this.#config,
            ...partialConfig,
            transition: {
                ...this.#config.transition,
                ...(partialConfig.transition || {})
            }
        }
        saveConfig(this.#configPath, this.#config)
        console.log("Wallpaper: Configuration updated")
    }

    /**
     * Restore last wallpaper (useful for re-applying after system changes)
     */
    async restoreLast(options?: TransitionOptions): Promise<void> {
        if (!this.#currentWallpaper) {
            const errorMsg = "No wallpaper to restore"
            this.emit("wallpaper-error", errorMsg)
            throw new Error(errorMsg)
        }

        try {
            await this.#applyWallpaper(this.#currentWallpaper, options)
        } catch (error) {
            throw error
        }
    }
}

const service = new Wallpaper()

Object.assign(globalThis, {
    wallpaper: service
})

export default service
