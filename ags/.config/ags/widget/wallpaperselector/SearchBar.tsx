import { Gtk } from "ags/gtk4"
import { createState } from "ags"

interface SearchBarProps {
    onSearchChange: (query: string) => void
    placeholder?: string
}

export default function SearchBar({
    onSearchChange,
    placeholder = "Search...",
}: SearchBarProps) {
    const [searchText, setSearchText] = createState("")
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleChange = (text: string) => {
        setSearchText(text)

        // Debounce search by 300ms
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer)
        }

        debounceTimer = setTimeout(() => {
            onSearchChange(text)
            debounceTimer = null
        }, 300)
    }

    return (
        <box
            class="wallpaper-search-container"
            orientation={Gtk.Orientation.HORIZONTAL}
        >
            <entry
                class="wallpaper-search-entry"
                placeholderText={placeholder}
                hexpand
                text={searchText}
                $={(self) => {
                    self.connect("changed", () => {
                        handleChange(self.text)
                    })

                    self.connect("destroy", () => {
                        if (debounceTimer !== null) {
                            clearTimeout(debounceTimer)
                            debounceTimer = null
                        }
                    })
                }}
            />
        </box>
    )
}
