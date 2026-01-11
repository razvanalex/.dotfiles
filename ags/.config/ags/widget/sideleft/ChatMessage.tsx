import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { parseMarkdown } from "../../lib/markdown"
import MessageHeader from "./components/MessageHeader"
import MessageActions from "./components/MessageActions"
import CodeBlock from "./components/CodeBlock"
import TextBlock from "./components/TextBlock"

/**
 * Message object structure
 */
interface Message {
    role: "user" | "assistant"
    content: string
    timestamp?: number
    model?: string
    provider?: "gpt" | "gemini"
    isIncomplete?: boolean
}

/**
 * Props for ChatMessage component
 */
interface ChatMessageProps {
    message: Message
    onDelete?: (role: "user" | "assistant", content: string) => void
    onEdit?: (oldContent: string, newContent: string) => void
    showActions?: boolean
}

/**
 * Main ChatMessage component
 * Renders a single chat message with support for:
 * - Markdown parsing and rendering
 * - Edit mode with save/cancel
 * - Delete with confirmation
 * - Different styling for user vs assistant messages
 * - Loading/thinking indicators
 * - Code blocks and text blocks
 */
export default function ChatMessage({
    message,
    onDelete,
    onEdit,
    showActions = true,
}: ChatMessageProps) {
    const [isEditing, setIsEditing] = createState(false)
    const [editedContent, setEditedContent] = createState(message.content)
    const [showDeleteConfirm, setShowDeleteConfirm] = createState(false)
    const [renderMarkdown, setRenderMarkdown] = createState(true)

    /**
     * Parse message content into markdown blocks
     */
    const blocks = parseMarkdown(message.content)

    /**
     * Handle save when editing
     */
    const handleSave = () => {
        const newContent = editedContent.get()
        if (newContent.trim() && newContent !== message.content) {
            onEdit?.(message.content, newContent)
        }
        setIsEditing(false)
    }

    /**
     * Handle cancel editing
     */
    const handleCancel = () => {
        setEditedContent(message.content)
        setIsEditing(false)
    }

    /**
     * Handle delete with confirmation
     */
    const handleDelete = () => {
        if (!showDeleteConfirm.get()) {
            setShowDeleteConfirm(true)
            // Auto-hide confirmation after 3 seconds
            setTimeout(() => {
                setShowDeleteConfirm(false)
            }, 3000)
            return
        }

        onDelete?.(message.role, message.content)
        setShowDeleteConfirm(false)
    }

    /**
     * Handle copy to clipboard
     */
    const handleCopy = () => {
        // Copy implementation depends on AGS/GTK clipboard support
        console.log("Copied to clipboard:", message.content)
    }

    /**
     * Render markdown blocks as JSX
     */
    const renderBlocks = () => {
        return blocks.map((block, index) => {
            switch (block.type) {
                case "code":
                    return (
                        <CodeBlock
                            code={block.content}
                            language={block.lang || ""}
                            editable={message.role === "user" && isEditing.get()}
                            onSave={
                                message.role === "user"
                                    ? (newCode) => {
                                          const newContent = editedContent.get().replace(
                                              block.content,
                                              newCode
                                          )
                                          setEditedContent(newContent)
                                      }
                                    : undefined
                            }
                        />
                    )

                case "text":
                case "heading":
                    return (
                        <TextBlock
                            content={
                                block.type === "heading"
                                    ? `${"#".repeat(block.level || 1)} ${block.content}`
                                    : block.content
                            }
                            renderMarkdown={renderMarkdown.get()}
                            editable={message.role === "user" && isEditing.get()}
                            onSave={
                                message.role === "user"
                                    ? (newText) => {
                                          const newContent = editedContent.get().replace(
                                              block.content,
                                              newText
                                          )
                                          setEditedContent(newContent)
                                      }
                                    : undefined
                            }
                        />
                    )

                case "list":
                    return (
                        <box
                            class="chat-message-list"
                            orientation={Gtk.Orientation.VERTICAL}
                            spacing={2}
                        >
                            {(() => {
                                return (block.items || []).map(
                                    (item: string, i: number) => (
                                        <box
                                            class="chat-message-list-item"
                                            orientation={Gtk.Orientation.HORIZONTAL}
                                            spacing={3}
                                        >
                                            <label
                                                class="txt txt-smallie"
                                                label="•"
                                                halign={Gtk.Align.START}
                                            />
                                            <label
                                                class="txt txt-smallie"
                                                label={item}
                                                wrap
                                                halign={Gtk.Align.START}
                                            />
                                        </box>
                                    )
                                )
                            })()}
                        </box>
                    )

                case "quote":
                    return (
                        <box
                            class="chat-message-quote"
                            orientation={Gtk.Orientation.HORIZONTAL}
                            spacing={5}
                        >
                            <box class="chat-message-quote-border" />
                            <label
                                class="txt txt-smallie txt-subtext"
                                label={block.content}
                                wrap
                                halign={Gtk.Align.START}
                            />
                        </box>
                    )

                default:
                    return null
            }
        })
    }

     return (
         <box
             class={`chat-message chat-message-${message.role}`}
             orientation={Gtk.Orientation.VERTICAL}
             spacing={3}
             halign={message.role === "user" ? Gtk.Align.END : Gtk.Align.START}
             widthRequest={300}
         >
            {/* Message Header */}
            <MessageHeader
                role={message.role}
                model={message.model}
                timestamp={message.timestamp}
                provider={message.provider}
            />

            {/* Message Content Area */}
            <box
                class="chat-message-content-wrapper"
                orientation={Gtk.Orientation.VERTICAL}
                spacing={3}
            >
                {/* Edit Mode */}
                {(() => {
                    const isEditingValue = isEditing.get()
                    return (
                        <box
                            orientation={Gtk.Orientation.VERTICAL}
                            spacing={3}
                            visible={isEditingValue}
                        >
                            <entry
                                class="chat-message-edit-input txt-small"
                                text={editedContent}
                                onNotify={(self: any) => {
                                    setEditedContent(self.text)
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
                                    tooltipText="Save changes"
                                    onClicked={handleSave}
                                >
                                    <label label="check" />
                                </button>
                                <button
                                    class="chat-action-button icon-material txt-small"
                                    tooltipText="Cancel editing"
                                    onClicked={handleCancel}
                                >
                                    <label label="close" />
                                </button>
                            </box>
                        </box>
                    )
                })()}

                {/* View Mode */}
                {(() => {
                    const isEditingValue = isEditing.get()
                    return (
                        <box
                            orientation={Gtk.Orientation.VERTICAL}
                            spacing={3}
                            visible={!isEditingValue}
                        >
                            {/* Loading/Thinking Indicator */}
                            {message.isIncomplete && (
                                <box
                                    class="chat-message-loading"
                                    orientation={Gtk.Orientation.HORIZONTAL}
                                    spacing={3}
                                >
                                    <label
                                        class="icon-material txt-small"
                                        label="schedule"
                                    />
                                    <label
                                        class="txt txt-smallie txt-subtext"
                                        label="Assistant is thinking..."
                                    />
                                </box>
                            )}

                            {/* Content Blocks */}
                            {blocks.length > 0 ? (
                                <box
                                    orientation={Gtk.Orientation.VERTICAL}
                                    spacing={3}
                                    hexpand={false}
                                >
                                    {renderBlocks()}
                                </box>
                            ) : (
                                <label
                                    class="txt txt-smallie"
                                    label={message.content}
                                    wrap
                                />
                            )}
                        </box>
                    )
                })()}
            </box>

            {/* Message Actions */}
            {(() => {
                const isEditingValue = isEditing.get()
                const showConfirm = showDeleteConfirm.get()
                return showActions ? (
                    <box
                        orientation={Gtk.Orientation.VERTICAL}
                        spacing={2}
                        visible={!isEditingValue}
                    >
                        <MessageActions
                            role={message.role}
                            content={message.content}
                            onCopy={handleCopy}
                            onEdit={() => {
                                setIsEditing(true)
                                setEditedContent(message.content)
                            }}
                            onDelete={handleDelete}
                            onToggleMarkdown={() => {
                                setRenderMarkdown(!renderMarkdown.get())
                            }}
                        />

                        {/* Delete Confirmation */}
                        {showConfirm && (
                            <box
                                class="chat-message-delete-confirm"
                                orientation={Gtk.Orientation.HORIZONTAL}
                                spacing={3}
                                halign={Gtk.Align.END}
                            >
                                <label
                                    class="txt txt-smallie txt-warning"
                                    label="Are you sure?"
                                />
                                <button
                                    class="chat-action-button txt-small"
                                    label="Yes, delete"
                                    onClicked={handleDelete}
                                />
                                <button
                                    class="chat-action-button txt-small"
                                    label="Cancel"
                                    onClicked={() => setShowDeleteConfirm(false)}
                                />
                            </box>
                        )}
                    </box>
                ) : null
            })()}
        </box>
    )
}
