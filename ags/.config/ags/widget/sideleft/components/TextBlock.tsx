import { Gtk } from "ags/gtk4"
import { createState } from "ags"

interface TextBlockProps {
    content: string
    renderMarkdown?: boolean
    editable?: boolean
    onSave?: (newContent: string) => void
}

/**
 * Simple markdown parser for inline formatting
 * Supports: **bold**, *italic*, [links](url)
 */
function parseMarkdown(text: string): string {
    if (!text) return ""
    
    // Note: GTK labels have limited markup support
    // We'll apply basic transformations that GTK can handle
    let result = text
    
    // Bold: **text** -> markup for bold
    result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    
    // Italic: *text* -> markup for italic
    result = result.replace(/\*(.+?)\*/g, "<i>$1</i>")
    
    // Code inline: `text` -> monospace
    result = result.replace(/`(.+?)`/g, "<tt>$1</tt>")
    
    return result
}

export default function TextBlock({
    content,
    renderMarkdown = true,
    editable = false,
    onSave,
}: TextBlockProps) {
    const [isEditing, setIsEditing] = createState(false)
    const [editedText, setEditedText] = createState(content)

    const handleSave = () => {
        if (onSave) {
            onSave(editedText.get())
        }
        setIsEditing(false)
    }

    const handleCancel = () => {
        setEditedText(content)
        setIsEditing(false)
    }

    const displayText = renderMarkdown ? parseMarkdown(content) : content

    return (
        <box
            class="chat-message-text-block"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={3}
        >
            {/* Edit mode - visible only when editing */}
            <box
                orientation={Gtk.Orientation.VERTICAL}
                spacing={3}
                visible={isEditing}
            >
                <entry
                    class="chat-message-text-edit"
                    text={editedText}
                    onNotify={(self: any) => {
                        setEditedText(self.text)
                    }}
                    hexpand
                />
                <box
                    orientation={Gtk.Orientation.HORIZONTAL}
                    spacing={3}
                    halign={Gtk.Align.END}
                >
                    <button
                        class="chat-action-button icon-material txt-small"
                        tooltipText="Save"
                        onClicked={handleSave}
                    >
                        <label label="check" />
                    </button>
                    <button
                        class="chat-action-button icon-material txt-small"
                        tooltipText="Cancel"
                        onClicked={handleCancel}
                    >
                        <label label="close" />
                    </button>
                </box>
            </box>

            {/* View mode - visible only when not editing */}
            <box
                orientation={Gtk.Orientation.VERTICAL}
                spacing={3}
                visible={isEditing.as((editing: boolean) => !editing)}
            >
                <label
                    wrap
                    selectable
                    useMarkup={renderMarkdown}
                    class="txt txt-smallie chat-message-text"
                    label={displayText}
                />
                {editable && (
                    <button
                        class="chat-action-button icon-material txt-small"
                        tooltipText="Edit text"
                        onClicked={() => setIsEditing(true)}
                        halign={Gtk.Align.END}
                    >
                        <label label="edit" />
                    </button>
                )}
            </box>
        </box>
    )
}
