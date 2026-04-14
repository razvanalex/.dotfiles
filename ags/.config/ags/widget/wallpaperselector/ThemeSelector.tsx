import Logger from "../../lib/logger"
import { Gtk } from "ags/gtk4"
import type { Accessor } from "ags"
import { createState } from "ags"
import {
    countImages,
    loadThemes,
    updateCurrentTheme,
} from "../../lib/wallpaperUtils"

export default function ThemeSelector({
    wallpaperDir,
    currentTheme,
    onThemeChange,
}: {
    wallpaperDir: string
    currentTheme: Accessor<string>
    onThemeChange: (theme: string) => void
}) {
    const [themes, setThemes] = createState<string[]>([])
    const [themeCounts, setThemeCounts] = createState<Record<string, number>>(
        {},
    )

    // Load themes on mount
    const initThemes = async () => {
        const themeList = await loadThemes(wallpaperDir)
        setThemes(themeList)

        const counts: Record<string, number> = {}
        await Promise.all(
            themeList.map(async (theme) => {
                counts[theme] = await countImages(`${wallpaperDir}/${theme}`)
            }),
        )
        setThemeCounts(counts)
    }

    // Initialize
    initThemes()

    const handleThemeChange = async (newTheme: string) => {
        try {
            Logger.info(`Theme change requested: ${newTheme}`)
            // Update .crt_theme file
            await updateCurrentTheme(wallpaperDir, newTheme)

            // Notify parent
            onThemeChange(newTheme)
            Logger.info(`Theme changed to: ${newTheme}`)
        } catch (error) {
            Logger.error("Failed to change theme:", error)
        }
    }

    return (
        <box
            class="wallpaper-theme-selector"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={10}
            vexpand
        >
            <label
                label="Themes"
                class="wallpaper-theme-label"
                halign={Gtk.Align.START}
            />

            <scrolledwindow
                class="wallpaper-theme-list-scroll"
                vexpand
                hscrollbarPolicy={Gtk.PolicyType.NEVER}
                vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
            >
                <box
                    class="wallpaper-theme-list"
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={4}
                    $={(self) => {
                        const rebuild = () => {
                            // Clear existing items
                            let child = self.get_first_child()
                            while (child) {
                                const next = child.get_next_sibling()
                                self.remove(child)
                                child = next
                            }

                            const themeList = themes.get()
                            const activeTheme = currentTheme.get()
                            const counts = themeCounts.get()

                            themeList.forEach((theme) => {
                                const row = new Gtk.Button()
                                row.add_css_class("wallpaper-theme-item")
                                if (theme === activeTheme) {
                                    row.add_css_class("active")
                                }

                                const rowContent = new Gtk.Box({
                                    orientation: Gtk.Orientation.HORIZONTAL,
                                    spacing: 10,
                                })

                                const icon = new Gtk.Label({ label: "📁" })
                                icon.add_css_class("wallpaper-theme-item-icon")
                                rowContent.append(icon)

                                const name = new Gtk.Label({
                                    label: theme,
                                    xalign: 0,
                                })
                                name.set_hexpand(true)
                                name.set_ellipsize(3)
                                name.add_css_class("wallpaper-theme-item-name")

                                rowContent.append(name)

                                const count = new Gtk.Label({
                                    label: `${counts[theme] ?? 0}`,
                                })
                                count.add_css_class("wallpaper-theme-count")
                                rowContent.append(count)

                                // Active indicator (checkmark)
                                if (theme === activeTheme) {
                                    const checkmark = new Gtk.Label({
                                        label: "✓",
                                    })
                                    checkmark.add_css_class(
                                        "wallpaper-theme-indicator",
                                    )
                                    rowContent.append(checkmark)
                                }

                                row.set_child(rowContent)

                                row.connect("clicked", () => {
                                    Logger.info(`Theme item clicked: ${theme}`)
                                    handleThemeChange(theme)
                                })

                                self.append(row)
                            })
                        }

                        themes.subscribe(rebuild)
                        themeCounts.subscribe(rebuild)
                        currentTheme.subscribe(rebuild)
                        rebuild()
                    }}
                />
            </scrolledwindow>
        </box>
    )
}
crolledwindow>
        </box>
    )
}
