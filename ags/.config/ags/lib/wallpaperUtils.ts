import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Logger from "./logger"

/**
 * Load list of theme directories from wallpaper base directory
 * Supports optional recursive discovery and hidden directory inclusion
 */
export async function loadThemes(
    baseDir: string,
    options?: {
        recursiveSearch?: boolean
        includeHidden?: boolean
    },
): Promise<string[]> {
    const recursiveSearch = options?.recursiveSearch ?? false
    const includeHidden = options?.includeHidden ?? false

    try {
        const args = [
            "find",
            baseDir,
            "-type", "d",
            "-not", "-path", `${baseDir}`,
        ]

        if (!recursiveSearch) {
            args.splice(2, 0, "-maxdepth", "1")
        }

        if (!includeHidden) {
            args.push("-not", "-path", `${baseDir}/.*`, "-not", "-path", "*/.*")
        }

        args.push("-printf", "%P\\n")

        const result = await execAsync(args)

        return result.trim()
            .split("\n")
            .filter(name => name && name !== "")
            .sort()
    } catch (error) {
        Logger.error("Failed to load themes:", error)
        return []
    }
}

/**
 * Get current theme from .crt_theme file
 * Returns directory name only (not full path)
 */
export async function getCurrentTheme(
    wallpaperDir: string,
    options?: {
        recursiveSearch?: boolean
        includeHidden?: boolean
    },
): Promise<string> {
    try {
        const crtThemeFile = `${wallpaperDir}/.crt_theme`
        
        if (!GLib.file_test(crtThemeFile, GLib.FileTest.EXISTS)) {
            // Return first available theme if .crt_theme doesn't exist
            const themes = await loadThemes(wallpaperDir, options)
            return themes[0] || ""
        }

        const contents = GLib.file_get_contents(crtThemeFile)
        const themePath = new TextDecoder().decode(contents[1]).trim()

        // Keep theme as relative path under wallpaperDir (supports nested themes)
        let themeName = ""
        if (themePath.startsWith(`${wallpaperDir}/`)) {
            themeName = themePath.slice(`${wallpaperDir}/`.length)
        } else {
            const parts = themePath.split("/")
            themeName = parts[parts.length - 1] || ""
        }
        
        // Verify that the theme directory actually exists
        const themeFullPath = `${wallpaperDir}/${themeName}`
        if (!GLib.file_test(themeFullPath, GLib.FileTest.IS_DIR)) {
            Logger.info(`Theme directory ${themeFullPath} does not exist, falling back to first available theme`)
            const themes = await loadThemes(wallpaperDir, options)
            return themes[0] || ""
        }
        
        return themeName
    } catch (error) {
        Logger.error("Failed to read current theme:", error)
        // Fallback to first available theme
        const themes = await loadThemes(wallpaperDir, options)
        return themes[0] || ""
    }
}

/**
 * Update .crt_theme file with new theme
 */
export async function updateCurrentTheme(wallpaperDir: string, themeName: string): Promise<void> {
    try {
        const crtThemeFile = `${wallpaperDir}/.crt_theme`
        const themePath = `${wallpaperDir}/${themeName}`
        
        GLib.file_set_contents(crtThemeFile, themePath)
        Logger.info(`Updated current theme to: ${themeName}`)
    } catch (error) {
        Logger.error("Failed to update current theme:", error)
        throw error
    }
}

/**
 * Extract filename from full path
 */
export function getFilename(path: string): string {
    const parts = path.split("/")
    return parts[parts.length - 1] || ""
}

/**
 * Fuzzy search/filter images by filename
 * Simple implementation that matches characters in sequence
 */
export function fuzzyFilter(images: string[], query: string): string[] {
    if (!query || query.trim() === "") {
        return images
    }

    const q = query.toLowerCase().replace(/\s+/g, "")
    
    return images.filter(imagePath => {
        const filename = getFilename(imagePath).toLowerCase()
        
        // Simple fuzzy matching: check if all query characters appear in order
        let queryIndex = 0
        for (let i = 0; i < filename.length && queryIndex < q.length; i++) {
            if (filename[i] === q[queryIndex]) {
                queryIndex++
            }
        }
        
        return queryIndex === q.length
    })
}

/**
 * Count images in a directory
 */
export async function countImages(
    directory: string,
    options?: {
        recursiveSearch?: boolean
        includeHidden?: boolean
    },
): Promise<number> {
    const recursiveSearch = options?.recursiveSearch ?? true
    const includeHidden = options?.includeHidden ?? false

    try {
        const args = [
            "find",
            directory,
        ]

        if (!recursiveSearch) {
            args.push("-maxdepth", "1")
        }

        args.push(
            "-type", "f",
            "(",
            "-iname", "*.jpg",
            "-o", "-iname", "*.jpeg",
            "-o", "-iname", "*.png",
            "-o", "-iname", "*.gif",
            ")",
        )

        if (!includeHidden) {
            args.push("-not", "-path", `${directory}/.*`, "-not", "-path", "*/.*")
        }

        const result = await execAsync(args)

        const images = result.trim().split("\n").filter(line => line.length > 0)
        return images.length
    } catch (error) {
        Logger.error("Failed to count images:", error)
        return 0
    }
}
