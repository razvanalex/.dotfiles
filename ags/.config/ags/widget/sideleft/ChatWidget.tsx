import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { For } from "ags"
import userOptions from "../../lib/userOptions"
import gptService from "../../services/GPT"
import geminiService from "../../services/Gemini"
import chatHistoryManager from "../../services/ChatHistoryManager"

type Message = { role: "user" | "assistant"; content: string }

function ChatMessage({ role, content }: Message) {
    return (
        <box
            class={`chat-message chat-message-${role}`}
            orientation={Gtk.Orientation.VERTICAL}
            halign={role === "user" ? Gtk.Align.END : Gtk.Align.START}
        >
            <label
                wrap
                selectable
                class="txt txt-smallie chat-message-text"
                label={content}
            />
        </box>
    )
}

function TypingIndicator() {
    return (
        <box class="chat-message chat-message-assistant" orientation={Gtk.Orientation.HORIZONTAL} halign={Gtk.Align.START}>
            <label
                class="txt txt-smallie chat-message-text"
                label="typing"
            />
            <box class="typing-indicator">
                <label class="typing-dot" label="●" />
                <label class="typing-dot" label="●" />
                <label class="typing-dot" label="●" />
            </box>
        </box>
    )
}

function ChatHistory({ messages, isLoading }: { messages: any; isLoading: any }) {
    return (
        <box orientation={Gtk.Orientation.VERTICAL} vexpand>
            <scrolledwindow
                hscrollbarPolicy={Gtk.PolicyType.NEVER}
                vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                vexpand
            >
                <box
                    orientation={Gtk.Orientation.VERTICAL}
                    class="chat-history spacing-v-5"
                >
                    {messages.as((msgs: Message[]) => msgs.length === 0 ? (
                        <box
                            orientation={Gtk.Orientation.VERTICAL}
                            valign={Gtk.Align.CENTER}
                            halign={Gtk.Align.CENTER}
                            class="txt txt-subtext spacing-v-5"
                            vexpand
                        >
                            <label class="icon-material txt-gigantic" label="chat" />
                            <label class="txt-small" label="Start a conversation..." />
                        </box>
                    ) : null)}
                    <For each={messages}>
                        {(msg: Message) => <ChatMessage role={msg.role} content={msg.content} />}
                    </For>
                    {isLoading.as((loading: boolean) => loading ? <TypingIndicator /> : null)}
                </box>
            </scrolledwindow>
        </box>
    )
}

function ChatEntry({ onSendMessage, isLoading }: { onSendMessage: (text: string) => void; isLoading: any }) {
    const [text, setText] = createState("")

    const handleSend = () => {
        const trimmed = text.get().trim()
        if (trimmed && !isLoading.get()) {
            onSendMessage(trimmed)
            setText("")
        }
    }

    return (
        <box class="chat-entry-container" orientation={Gtk.Orientation.VERTICAL}>
            <box class="chat-input-box spacing-h-5">
                <entry
                    class="chat-entry txt-small"
                    placeholderText="Message..."
                    text={text}
                    onNotify={(self: any) => {
                        setText(self.text)
                    }}
                    onActivate={handleSend}
                    hexpand
                    sensitive={isLoading.as((loading: boolean) => !loading)}
                />
                <button
                    class="chat-send-button icon-material"
                    onClicked={handleSend}
                    tooltipText="Send (Enter)"
                    sensitive={isLoading.as((loading: boolean) => !loading)}
                >
                    <label label={isLoading.as((loading: boolean) => loading ? "hourglass_empty" : "send")} />
                </button>
            </box>
        </box>
    )
}

export default function ChatWidget() {
    const [messages, setMessages] = createState<Message[]>([])
    const [apiProvider, setApiProvider] = createState<"gpt" | "gemini">("gpt")
    const [isLoading, setIsLoading] = createState(false)

    // Initialize messages from current provider's history
    const loadMessagesForProvider = (provider: "gpt" | "gemini") => {
        const history = chatHistoryManager.getMessages(provider)
        setMessages([...history])
    }

    // Load initial messages from history for default provider
    const initializeChatHistory = () => {
        loadMessagesForProvider("gpt")
    }

    // Execute on component mount
    if (typeof initializeChatHistory === 'function') {
        initializeChatHistory()
    }

    const handleSendMessage = async (text: string) => {
        const currentProvider = apiProvider.get()
        
        // Add user message to display and save
        const userMessage: Message = { role: "user", content: text }
        setMessages([...messages.get(), userMessage])
        chatHistoryManager.addMessage(currentProvider, userMessage)
        setIsLoading(true)

        try {
            let response: string
            if (currentProvider === "gpt") {
                response = await gptService.sendMessage(text)
            } else {
                response = await geminiService.sendMessage(text)
            }

            // Add assistant message to display and save
            const assistantMessage: Message = { role: "assistant", content: response }
            setMessages([...messages.get(), assistantMessage])
            chatHistoryManager.addMessage(currentProvider, assistantMessage)
        } catch (err) {
            // Show error as assistant message
            const errorMessage: Message = {
                role: "assistant",
                content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`
            }
            setMessages([...messages.get(), errorMessage])
            chatHistoryManager.addMessage(currentProvider, errorMessage)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="chat-widget spacing-v-10" vexpand>
            <box class="chat-header spacing-h-5" orientation={Gtk.Orientation.HORIZONTAL}>
                <label class="txt txt-title" label="Chat" hexpand halign={Gtk.Align.START} />
                <box class="chat-provider-selector spacing-h-3">
                    <button
                        class={apiProvider.as((p) => p === "gpt" ? "provider-button provider-button-active" : "provider-button")}
                        onClicked={() => {
                            const newProvider = "gpt" as const
                            loadMessagesForProvider(newProvider)
                            setApiProvider(newProvider)
                        }}
                    >
                        <label class="txt-smallie" label="GPT" />
                    </button>
                    <button
                        class={apiProvider.as((p) => p === "gemini" ? "provider-button provider-button-active" : "provider-button")}
                        onClicked={() => {
                            const newProvider = "gemini" as const
                            loadMessagesForProvider(newProvider)
                            setApiProvider(newProvider)
                        }}
                    >
                        <label class="txt-smallie" label="Gemini" />
                    </button>
                </box>
            </box>
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5" vexpand>
                <ChatHistory messages={messages} isLoading={isLoading} />
                <ChatEntry onSendMessage={handleSendMessage} isLoading={isLoading} />
            </box>
        </box>
    )
}
