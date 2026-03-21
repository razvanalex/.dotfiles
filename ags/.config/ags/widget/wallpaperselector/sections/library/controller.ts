import { createState } from "ags"
import type { Accessor } from "ags"
import wallpaperService from "../../../../services/Wallpaper"
import {
    getCurrentTheme,
    fuzzyFilter,
    loadThemes,
    updateCurrentTheme,
} from "../../../../lib/wallpaperUtils"
import { loadConfig } from "../../../../lib/wallpaper"
import GLib from "gi://GLib"
import GObject from "gi://GObject"
import {
    type LibraryView,
    THEME_PREVIEW_PRELOAD_LIMIT,
    THEME_PREVIEW_LOAD_BATCH,
} from "../../types"
import type { GridItem } from "../../WallpaperGridView.js"
import { fuzzyThemeFilter } from "./filters"
import { primeWallpaperThumbnails } from "./thumbnailCache"

const DEBUG_WALLPAPER_PREVIEW = true

function logPreviewDebug(message: string) {
    if (!DEBUG_WALLPAPER_PREVIEW) return
    console.log(`[wallpaper-preview] ${message}`)
}

interface CreateLibraryDataControllerProps {
    wallpaperDir: string
    refreshSignal?: Accessor<number>
}

export interface LibraryDataController {
    libraryView: Accessor<LibraryView>
    filteredThemes: Accessor<string[]>
    filteredImages: Accessor<string[]>
    browsingTheme: Accessor<string>
    selectedWallpaper: Accessor<string>
    wallpaperPreviewThumbs: Accessor<Record<string, string>>
    themeItems: Accessor<GridItem[]>
    imageItems: Accessor<GridItem[]>
    ensureThemePreviewRange: (start: number, end: number) => void
    ensureWallpaperPreviewRange: (start: number, end: number) => void
    handleThemeChange: (newTheme: string) => Promise<void>
    handleBackToThemes: () => void
    handleSearchChange: (query: string) => void
    handleActivateImage: (path: string) => Promise<void>
    handleRandomInTheme: () => Promise<void>
}

export function createLibraryDataController({
    wallpaperDir,
    refreshSignal,
}: CreateLibraryDataControllerProps): LibraryDataController {
    const configPath = `${GLib.get_home_dir()}/.config/ags/wallpaper_config.json`

    const [browsingTheme, setBrowsingTheme] = createState("")
    const [appliedTheme, setAppliedTheme] = createState("")
    const [allImages, setAllImages] = createState<string[]>([])
    const [filteredImages, setFilteredImages] = createState<string[]>([])
    const [themes, setThemes] = createState<string[]>([])
    const [filteredThemes, setFilteredThemes] = createState<string[]>([])
    const [themePreviews, setThemePreviews] = createState<
        Record<string, string>
    >({})
    const [searchQuery, setSearchQuery] = createState("")
    const [currentWallpaper, setCurrentWallpaper] = createState("")
    const [selectedWallpaper, setSelectedWallpaper] = createState("")
    const [libraryView, setLibraryView] = createState<LibraryView>("themes")
    const [wallpaperPreviewThumbs, setWallpaperPreviewThumbs] = createState<
        Record<string, string>
    >({})
    const [wallpaperVisibleRange, setWallpaperVisibleRange] = createState({
        start: 0,
        end: 96,
    })

    const inferThemeFromWallpaper = (wallpaperPath: string): string => {
        if (!wallpaperPath) return ""
        const prefix = `${wallpaperDir}/`
        if (!wallpaperPath.startsWith(prefix)) return ""
        const relative = wallpaperPath.slice(prefix.length)

        const knownThemes = themes.get()
        let bestMatch = ""
        for (const theme of knownThemes) {
            if (relative === theme || relative.startsWith(`${theme}/`)) {
                if (theme.length > bestMatch.length) bestMatch = theme
            }
        }
        if (bestMatch) return bestMatch

        const parts = relative.split("/")
        return parts[0] || ""
    }

    const pendingThemePreviewLoads = new Set<string>()
    const pendingWallpaperPreviewLoads = new Set<string>()

    const ensureThemePreviewRange = (start: number, end: number) => {
        const list = filteredThemes.get()
        const previews = themePreviews.get()

        const toLoad: string[] = []
        const rangeEnd = Math.min(end, list.length)
        for (let index = Math.max(0, start); index < rangeEnd; index++) {
            const theme = list[index]
            if (!theme) continue
            if (previews[theme] !== undefined) continue
            if (pendingThemePreviewLoads.has(theme)) continue
            toLoad.push(theme)
            if (toLoad.length >= THEME_PREVIEW_LOAD_BATCH) break
        }

        if (toLoad.length === 0) return

        for (const theme of toLoad) pendingThemePreviewLoads.add(theme)

        void Promise.all(
            toLoad.map(async (theme) => {
                try {
                    const first = await wallpaperService.getFirstWallpaper(
                        `${wallpaperDir}/${theme}`,
                    )
                    return [theme, first] as const
                } catch {
                    return [theme, ""] as const
                } finally {
                    pendingThemePreviewLoads.delete(theme)
                }
            }),
        ).then((entries) => {
            const current = themePreviews.get()
            const next = { ...current }
            let changed = false

            for (const [theme, path] of entries) {
                if (next[theme] !== undefined) continue
                next[theme] = path
                changed = true
            }

            if (changed) setThemePreviews(next)
        })
    }

    const ensureWallpaperPreviewRange = (start: number, end: number) => {
        const currentRange = wallpaperVisibleRange.get()
        if (currentRange.start !== start || currentRange.end !== end) {
            setWallpaperVisibleRange({ start, end })
        }

        const images = filteredImages.get()
        const previews = wallpaperPreviewThumbs.get()

        const prefetchStart = Math.max(0, start - 24)
        const prefetchEnd = Math.min(images.length, end + 48)

        const toLoad: string[] = []
        for (let index = prefetchStart; index < prefetchEnd; index++) {
            const sourcePath = images[index]
            if (!sourcePath) continue
            if (previews[sourcePath]) continue
            if (pendingWallpaperPreviewLoads.has(sourcePath)) continue
            toLoad.push(sourcePath)
            if (toLoad.length >= 96) break
        }

        if (toLoad.length === 0) return

        logPreviewDebug(
            `range=${start}-${end} prefetch=${prefetchStart}-${prefetchEnd} queued=${toLoad.length}`,
        )

        for (const sourcePath of toLoad) {
            pendingWallpaperPreviewLoads.add(sourcePath)
        }

        void primeWallpaperThumbnails(toLoad)
            .then((batchMap) => {
            const current = wallpaperPreviewThumbs.get()
            const next = { ...current }
            let changed = false

            for (const [sourcePath, thumbPath] of Object.entries(batchMap)) {
                if (!thumbPath) continue
                if (next[sourcePath] === thumbPath) continue
                next[sourcePath] = thumbPath
                changed = true
            }

            if (changed) {
                setWallpaperPreviewThumbs(next)
                logPreviewDebug(`applied map updates=${Object.keys(batchMap).length}`)
            }
            })
            .finally(() => {
                for (const sourcePath of toLoad) {
                    pendingWallpaperPreviewLoads.delete(sourcePath)
                }
                logPreviewDebug(
                    `queue drain complete remainingInFlight=${pendingWallpaperPreviewLoads.size}`,
                )
        })
    }

    wallpaperService.connect(
        "wallpaper-changed",
        (_source: GObject.Object, wallpaperPathObj: unknown) => {
            const newWallpaper =
                typeof wallpaperPathObj === "string"
                    ? wallpaperPathObj
                    : String(wallpaperPathObj ?? "")
            setCurrentWallpaper(newWallpaper)
            setSelectedWallpaper(newWallpaper)

            const inferredTheme = inferThemeFromWallpaper(newWallpaper)
            if (!inferredTheme) return

            setAppliedTheme(inferredTheme)
            void updateCurrentTheme(wallpaperDir, inferredTheme).catch(
                (error: unknown) => {
                    console.error(
                        "Failed to sync .crt_theme after wallpaper change:",
                        error,
                    )
                },
            )
        },
    )

    const initialWallpaper = wallpaperService.getCurrentWallpaper()
    setCurrentWallpaper(initialWallpaper)
    setSelectedWallpaper(initialWallpaper)
    const initialInferredTheme = inferThemeFromWallpaper(initialWallpaper)
    if (initialInferredTheme) {
        setAppliedTheme(initialInferredTheme)
        setBrowsingTheme(initialInferredTheme)
    }

    const loadThemeCatalog = async () => {
        const config = loadConfig(configPath)
        const recursiveSearch = config.recursiveSearch ?? true
        const includeHidden = config.includeHidden ?? false

        try {
            const themeList = await loadThemes(wallpaperDir, {
                recursiveSearch,
                includeHidden,
            })
            setThemes(themeList)
            setFilteredThemes(themeList)

            const previews: Record<string, string> = {}
            await Promise.all(
                themeList
                    .slice(0, THEME_PREVIEW_PRELOAD_LIMIT)
                    .map(async (theme: string) => {
                        try {
                            previews[theme] =
                                await wallpaperService.getFirstWallpaper(
                                    `${wallpaperDir}/${theme}`,
                                )
                        } catch {
                            previews[theme] = ""
                        }
                    }),
            )
            setThemePreviews(previews)
            ensureThemePreviewRange(0, THEME_PREVIEW_PRELOAD_LIMIT * 2)
        } catch (error) {
            console.error("Failed to load themes:", error)
            setThemes([])
            setFilteredThemes([])
            setThemePreviews({})
        }
    }

    const loadImagesForTheme = async (theme: string) => {
        if (!theme) return

        try {
            const themeDir = `${wallpaperDir}/${theme}`
            const images = await wallpaperService.getWallpapers(themeDir)
            setAllImages(images)
            setFilteredImages(images)
            const current = currentWallpaper.get()
            if (current && images.includes(current)) {
                setSelectedWallpaper(current)
            } else {
                setSelectedWallpaper(images[0] || "")
            }
            setSearchQuery("")
        } catch (error) {
            console.error(`Failed to load images for theme ${theme}:`, error)
            setAllImages([])
            setFilteredImages([])
            setSelectedWallpaper("")
        }
    }

    const refreshDiscoveryData = async () => {
        await loadThemeCatalog()
        const theme = browsingTheme.get()
        if (theme) {
            await loadImagesForTheme(theme)
        } else {
            setAllImages([])
            setFilteredImages([])
        }
    }

    const init = async () => {
        try {
            const config = loadConfig(configPath)
            const recursiveSearch = config.recursiveSearch ?? true
            const includeHidden = config.includeHidden ?? false
            const themeFromFile = await getCurrentTheme(wallpaperDir, {
                recursiveSearch,
                includeHidden,
            })
            const inferredFromWallpaper = inferThemeFromWallpaper(
                currentWallpaper.get(),
            )
            const effectiveTheme = inferredFromWallpaper || themeFromFile

            setAppliedTheme(effectiveTheme)
            setBrowsingTheme(effectiveTheme)
            await loadThemeCatalog()
        } catch (error) {
            console.error("Failed to initialize library section:", error)
        }
    }

    const [themeItems, setThemeItems] = createState<GridItem[]>([])
    const rebuildThemeItems = () => {
        const th = filteredThemes.get()
        const prev = themePreviews.get()
        const active = appliedTheme.get()
        setThemeItems(
            th.map((t) => ({
                id: t,
                previewPath: prev[t] || undefined,
                label: t,
                isActive: t === active,
            })),
        )
    }
    filteredThemes.subscribe(rebuildThemeItems)
    themePreviews.subscribe(rebuildThemeItems)
    appliedTheme.subscribe(rebuildThemeItems)

    const [imageItems, setImageItems] = createState<GridItem[]>([])
    const rebuildImageItems = () => {
        const imgs = filteredImages.get()
        const current = currentWallpaper.get()
        setImageItems(
            imgs.map((p) => ({
                id: p,
                previewPath: undefined,
                label: p.split("/").pop() || "",
                isActive: p === current,
                isGif: p.toLowerCase().endsWith(".gif"),
            })),
        )
    }
    filteredImages.subscribe(rebuildImageItems)
    currentWallpaper.subscribe(rebuildImageItems)
    filteredImages.subscribe(() => {
        ensureWallpaperPreviewRange(0, 96)
    })

    setTimeout(() => {
        void init()
    }, 0)

    if (refreshSignal) {
        refreshSignal.subscribe(() => {
            void refreshDiscoveryData()
        })
    }

    const handleThemeChange = async (newTheme: string) => {
        setBrowsingTheme(newTheme)
        setLibraryView("wallpapers")
        await loadImagesForTheme(newTheme)
    }

    const handleBackToThemes = () => {
        setLibraryView("themes")
        setSearchQuery("")
        setFilteredThemes(themes.get())
    }

    const handleSearchChange = (query: string) => {
        setSearchQuery(query)

        if (libraryView.get() === "themes") {
            setFilteredThemes(fuzzyThemeFilter(themes.get(), query))
            return
        }

        const filtered = fuzzyFilter(allImages.get(), query)
        setFilteredImages(filtered)
    }

    const handleActivateImage = async (path: string) => {
        try {
            await wallpaperService.setWallpaper(path)
        } catch (error) {
            console.error("Failed to set wallpaper:", error)
        }
    }

    const handleRandomInTheme = async () => {
        const theme = browsingTheme.get()
        if (!theme) return
        try {
            await wallpaperService.setRandomWallpaper(
                `${wallpaperDir}/${theme}`,
            )
        } catch (error) {
            console.error("Failed to set random wallpaper in theme:", error)
        }
    }

    return {
        libraryView,
        filteredThemes,
        filteredImages,
        browsingTheme,
        selectedWallpaper,
        wallpaperPreviewThumbs,
        themeItems,
        imageItems,
        ensureThemePreviewRange,
        ensureWallpaperPreviewRange,
        handleThemeChange,
        handleBackToThemes,
        handleSearchChange,
        handleActivateImage,
        handleRandomInTheme,
    }
}
