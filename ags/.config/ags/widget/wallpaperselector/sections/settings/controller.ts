import { createState } from "ags"
import type { Accessor } from "ags"
import { execAsync } from "ags/process"
import wallpaperService from "../../../../services/Wallpaper"
import type { EngineMode, EngineState } from "../../types"
import { loadConfig } from "../../../../lib/wallpaper"
import GLib from "gi://GLib"

interface CreateSettingsControllerProps {
    onDiscoveryChanged?: () => void
}

export interface SettingsController {
    engineMode: Accessor<EngineMode>
    engineIntervalSeconds: Accessor<string>
    engineIsRunning: Accessor<boolean>
    engineStatusText: Accessor<string>
    recursiveSearch: Accessor<boolean>
    includeHidden: Accessor<boolean>
    refreshEngineState: () => Promise<void>
    toggleRecursiveSearch: () => void
    toggleIncludeHidden: () => void
    toggleEngineMode: () => void
    setEngineIntervalText: (value: string) => void
    applyInterval: () => void
    startAutomatic: () => void
    stopAutomatic: () => void
}

export function createSettingsController({
    onDiscoveryChanged,
}: CreateSettingsControllerProps): SettingsController {
    const configPath = `${GLib.get_home_dir()}/.config/ags/wallpaper_config.json`
    const config = loadConfig(configPath)

    const [engineMode, setEngineMode] = createState<EngineMode>("manual")
    const [engineIntervalSeconds, setEngineIntervalSeconds] =
        createState("1800")
    const [engineIsRunning, setEngineIsRunning] = createState(false)
    const [engineStatusText, setEngineStatusText] = createState("Engine idle")
    const [recursiveSearch, setRecursiveSearch] = createState(
        config.recursiveSearch ?? true,
    )
    const [includeHidden, setIncludeHidden] = createState(
        config.includeHidden ?? false,
    )

    const parseEngineState = (raw: string): EngineState => {
        const parsed = JSON.parse(raw) as Partial<EngineState>
        return {
            mode: parsed.mode === "automatic" ? "automatic" : "manual",
            intervalSeconds: Number.isFinite(parsed.intervalSeconds)
                ? Math.max(30, Math.floor(parsed.intervalSeconds as number))
                : 1800,
            activeThemeOnly: Boolean(parsed.activeThemeOnly),
            isRunning: Boolean(parsed.isRunning),
        }
    }

    const engineRequest = async (args: string[]): Promise<string> => {
        const output = await execAsync([
            "ags",
            "request",
            "wallpaper",
            "engine",
            ...args,
        ])
        const result = output.trim()
        if (result.startsWith("error:")) {
            throw new Error(result)
        }
        return result
    }

    const syncEngineUiState = (engine: EngineState) => {
        setEngineMode(engine.mode)
        setEngineIntervalSeconds(String(engine.intervalSeconds))
        setEngineIsRunning(engine.isRunning)
        if (engine.isRunning) {
            setEngineStatusText(`Automatic every ${engine.intervalSeconds}s`)
        } else {
            setEngineStatusText("Manual mode")
        }
    }

    const refreshEngineState = async () => {
        try {
            const result = await engineRequest(["get"])
            const engine = parseEngineState(result)
            syncEngineUiState(engine)
        } catch (error) {
            setEngineStatusText(`Engine error: ${error}`)
        }
    }

    const toggleRecursiveSearch = () => {
        const next = !recursiveSearch.get()
        setRecursiveSearch(next)
        wallpaperService.setConfig({ recursiveSearch: next })
        onDiscoveryChanged?.()
    }

    const toggleIncludeHidden = () => {
        const next = !includeHidden.get()
        setIncludeHidden(next)
        wallpaperService.setConfig({ includeHidden: next })
        onDiscoveryChanged?.()
    }

    const toggleEngineMode = () => {
        const nextMode: EngineMode =
            engineMode.get() === "automatic" ? "manual" : "automatic"
        if (nextMode === engineMode.get()) return

        setEngineMode(nextMode)
        void engineRequest(["set", "mode", nextMode])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`))
    }

    const setEngineIntervalText = (value: string) => {
        if (value === engineIntervalSeconds.get()) return
        setEngineIntervalSeconds(value)
    }

    const applyInterval = () => {
        const parsed = parseInt(engineIntervalSeconds.get(), 10)
        if (isNaN(parsed) || parsed < 30) {
            setEngineStatusText("Engine error: interval must be >= 30 seconds")
            return
        }
        void engineRequest(["set", "interval", String(parsed)])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`))
    }

    const startAutomatic = () => {
        const parsed = parseInt(engineIntervalSeconds.get(), 10)
        const interval = isNaN(parsed) || parsed < 30 ? 1800 : parsed
        void engineRequest(["auto", "start", String(interval)])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`))
    }

    const stopAutomatic = () => {
        void engineRequest(["auto", "stop"])
            .then((result) => syncEngineUiState(parseEngineState(result)))
            .catch((error) => setEngineStatusText(`Engine error: ${error}`))
    }

    return {
        engineMode,
        engineIntervalSeconds,
        engineIsRunning,
        engineStatusText,
        recursiveSearch,
        includeHidden,
        refreshEngineState,
        toggleRecursiveSearch,
        toggleIncludeHidden,
        toggleEngineMode,
        setEngineIntervalText,
        applyInterval,
        startAutomatic,
        stopAutomatic,
    }
}
