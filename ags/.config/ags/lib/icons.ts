import Gio from "gi://Gio"
import { Gtk, Gdk } from "ags/gtk4"
import userOptions from "./userOptions"

export function levenshteinDistance(a: string, b: string): number {
    if (!a.length) return b.length
    if (!b.length) return a.length

    const f: number[][] = Array.from(
        new Array(a.length + 1),
        () => new Array(b.length + 1).fill(0)
    )

    for (let i = 0; i <= b.length; i++) {
        f[0][i] = i
    }
    for (let i = 0; i <= a.length; i++) {
        f[i][0] = i
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a.charAt(i - 1) === b.charAt(j - 1)) {
                f[i][j] = f[i - 1][j - 1]
            } else {
                f[i][j] = Math.min(f[i - 1][j - 1], Math.min(f[i][j - 1], f[i - 1][j])) + 1
            }
        }
    }

    return f[a.length][b.length]
}

export function getAllFiles(dir: string, files: string[] = []): string[] {
    const file = Gio.File.new_for_path(dir)

    if (!file.query_exists(null)) {
        return []
    }

    const enumerator = file.enumerate_children(
        "standard::name,standard::type",
        Gio.FileQueryInfoFlags.NONE,
        null
    )

    let info: Gio.FileInfo | null
    while ((info = enumerator.next_file(null)) !== null) {
        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            const subFiles = getAllFiles(`${dir}/${info.get_name()}`)
            files.push(...subFiles)
        } else {
            files.push(`${dir}/${info.get_name()}`)
        }
    }

    return files
}

export function searchIcons(appClass: string, files: string[]): string {
    appClass = appClass.toLowerCase()

    if (!files.length) return ""

    let bestScore = 0x3f3f3f3f
    let bestPath = ""

    for (const file of files) {
        const filename = file.split("/").pop()?.toLowerCase().split(".")[0] ?? ""
        const score = levenshteinDistance(filename, appClass)

        if (score < bestScore) {
            bestScore = score
            bestPath = file
        }
    }

    return bestPath
}

export function iconExists(iconName: string): boolean {
    const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!)
    return iconTheme.has_icon(iconName)
}

export function substitute(str: string): string {
    if (userOptions.icons.substitutions[str]) {
        return userOptions.icons.substitutions[str]
    }

    for (const substitution of userOptions.icons.regexSubstitutions) {
        const replacedName = str.replace(substitution.regex, substitution.replace)
        if (replacedName !== str) return replacedName
    }

    if (!iconExists(str)) {
        str = str.toLowerCase().replace(/\s+/g, "-")
    }

    return str
}
