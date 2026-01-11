import { Gtk } from "ags/gtk4"
import { createState } from "ags"

interface CodeBlockProps {
    code: string
    language: string
    editable?: boolean
    onSave?: (newCode: string) => void
}

export default function CodeBlock({
    code,
    language,
    editable = false,
    onSave,
}: CodeBlockProps) {
    const [isEditing, setIsEditing] = createState(editable)
    const [editedCode, setEditedCode] = createState(code)

    const handleSave = () => {
        if (onSave) {
            onSave(editedCode.get())
        }
        setIsEditing(false)
    }

    const handleCancel = () => {
        setEditedCode(code)
        setIsEditing(false)
    }

    return (
        <box
            class="chat-message-code-block"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={5}
        >
            {/* Top bar with language and action buttons */}
            <box
                class="chat-message-code-block-topbar"
                orientation={Gtk.Orientation.HORIZONTAL}
                spacing={5}
            >
                <label
                    class="txt txt-small chat-message-code-block-lang"
                    label={language || "code"}
                    halign={Gtk.Align.START}
                    hexpand
                />
                <box
                    orientation={Gtk.Orientation.HORIZONTAL}
                    spacing={3}
                    visible={isEditing.as((editing: boolean) => editing)}
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
                <box
                    orientation={Gtk.Orientation.HORIZONTAL}
                    spacing={3}
                    visible={isEditing.as((editing: boolean) => !editing)}
                >
                    {editable && (
                        <button
                            class="chat-action-button icon-material txt-small"
                            tooltipText="Edit code"
                            onClicked={() => setIsEditing(true)}
                        >
                            <label label="edit" />
                        </button>
                    )}
                    <button
                        class="chat-action-button icon-material txt-small"
                        tooltipText="Copy code"
                        onClicked={() => {
                            // Copy to clipboard (implementation depends on AGS)
                            console.log("Copy code:", code)
                        }}
                    >
                        <label label="content_copy" />
                    </button>
                </box>
            </box>

            {/* Code content - edit mode */}
            <entry
                class="chat-message-code-block-code-edit"
                text={editedCode}
                onNotify={(self: any) => {
                    setEditedCode(self.text)
                }}
                hexpand
                vexpand
                visible={isEditing}
            />

            {/* Code content - view mode */}
            <scrolledwindow
                class="chat-message-code-block-scroll"
                hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                visible={isEditing.as((editing: boolean) => !editing)}
            >
                <label
                    class="chat-message-code-block-code"
                    label={code}
                    selectable
                    wrap={false}
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                />
            </scrolledwindow>
        </box>
    )
}
