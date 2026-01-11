import { Gtk } from "ags/gtk4"
import { createState } from "ags"

interface MessageActionsProps {
    role: "user" | "assistant"
    content: string
    onCopy?: () => void
    onEdit?: () => void
    onDelete?: () => void
    onToggleMarkdown?: () => void
}

export default function MessageActions({
    role,
    content,
    onCopy,
    onEdit,
    onDelete,
    onToggleMarkdown,
}: MessageActionsProps) {
    const [copySuccess, setCopySuccess] = createState(false)

    const handleCopy = () => {
        if (onCopy) {
            onCopy()
        }
        // Show checkmark briefly
        setCopySuccess(true)
        setTimeout(() => {
            setCopySuccess(false)
        }, 1500)
    }

    return (
        <box
            class="chat-action-buttons"
            orientation={Gtk.Orientation.HORIZONTAL}
            spacing={2}
        >
            {/* Copy button */}
            <button
                class="chat-action-button chat-action-copy icon-material"
                tooltipText="Copy message"
                onClicked={handleCopy}
            >
                <label
                    label={copySuccess.as((success: boolean) => 
                        success ? "check" : "content_copy"
                    )}
                />
            </button>

            {/* Edit button - only for user messages */}
            {role === "user" && (
                <button
                    class="chat-action-button chat-action-edit icon-material"
                    tooltipText="Edit message"
                    onClicked={() => onEdit?.()}
                >
                    <label label="edit" />
                </button>
            )}

            {/* Markdown toggle - only for assistant messages */}
            {role === "assistant" && (
                <button
                    class="chat-action-button chat-action-markdown icon-material"
                    tooltipText="Toggle markdown"
                    onClicked={() => onToggleMarkdown?.()}
                >
                    <label label="code" />
                </button>
            )}

            {/* Code button - for code-containing messages */}
            {content.includes("```") && (
                <button
                    class="chat-action-button chat-action-code icon-material"
                    tooltipText="Code block"
                    sensitive={false}
                >
                    <label label="terminal" />
                </button>
            )}

            {/* Delete button */}
            <button
                class="chat-action-button chat-action-delete icon-material"
                tooltipText="Delete message"
                onClicked={() => onDelete?.()}
            >
                <label label="delete" />
            </button>
        </box>
    )
}
