import { Gtk } from "ags/gtk4"

interface MessageHeaderProps {
    role: "user" | "assistant"
    model?: string
    timestamp?: number
    provider?: "gpt" | "gemini"
    onAction?: (action: string) => void
}

export default function MessageHeader({
    role,
    model,
    timestamp,
    provider,
    onAction,
}: MessageHeaderProps) {
    const formatTime = (ts?: number): string => {
        if (!ts) return ""
        const date = new Date(ts)
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    const getProviderIcon = (): string => {
        if (role === "user") return "person"
        if (provider === "gemini") return "sparkles"
        return "smart_toy" // default for GPT
    }

    return (
        <box
            class="chat-message-header"
            orientation={Gtk.Orientation.HORIZONTAL}
            halign={role === "user" ? Gtk.Align.END : Gtk.Align.START}
            spacing={5}
        >
            {/* Provider/Role icon and name on the left */}
            <box
                class="chat-message-header-left"
                orientation={Gtk.Orientation.HORIZONTAL}
                spacing={3}
            >
                <label
                    class="icon-material txt-small"
                    label={getProviderIcon()}
                />
                <label
                    class="txt txt-small chat-message-header-provider"
                    label={role === "user" ? "You" : model || provider || "Assistant"}
                />
            </box>

            {/* Metadata on the right */}
            {timestamp && (
                <label
                    class="txt txt-subtext chat-message-header-time"
                    label={formatTime(timestamp)}
                />
            )}
        </box>
    )
}
