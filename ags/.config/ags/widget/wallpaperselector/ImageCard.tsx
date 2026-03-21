import { Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"

interface ImageCardProps {
    imagePath: string
    isActive: boolean
    onSelect: (path: string) => void
    onActivate: (path: string) => void
}

export default function ImageCard({
    imagePath,
    isActive,
    onSelect,
    onActivate,
}: ImageCardProps) {
    const fileName = imagePath.split("/").pop() || ""

    return (
        <box
            class={`wallpaper-card ${isActive ? "active" : ""}`}
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
        >
            <button
                class="wallpaper-card-button"
                css="background: transparent; border: none; padding: 0;"
                onClicked={() => onSelect(imagePath)}
                $={(self) => {
                    const gestureClick = new Gtk.GestureClick()
                    gestureClick.connect("pressed", (gesture, nPress) => {
                        if (nPress === 2) {
                            // Double-click
                            onActivate(imagePath)
                        }
                    })
                    self.add_controller(gestureClick)
                }}
            >
                <overlay>
                    <box
                        class="wallpaper-thumbnail"
                        css={`
                            min-width: 240px;
                            min-height: 135px;
                            background-image: url("file://${imagePath}");
                            background-size: cover;
                            background-position: center;
                            border-radius: 8px;
                        `}
                    />
                    {isActive && (
                        <box
                            class="active-indicator"
                            halign={Gtk.Align.END}
                            valign={Gtk.Align.START}
                            css="margin: 8px;"
                        >
                            <label
                                label="✓"
                                class="checkmark"
                                css={`
                                    font-size: 24px;
                                    color: #00ff00;
                                    background-color: rgba(0, 0, 0, 0.7);
                                    border-radius: 50%;
                                    padding: 4px 8px;
                                `}
                            />
                        </box>
                    )}
                </overlay>
            </button>
            <label
                label={fileName}
                class="wallpaper-filename"
                halign={Gtk.Align.CENTER}
                ellipsize={3}
                maxWidthChars={20}
                css="font-size: 12px;"
            />
        </box>
    )
}
