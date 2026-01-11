import { Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"
import { For } from "ags"
import userOptions from "../../lib/userOptions"
import gptService from "../../services/GPT"
import geminiService from "../../services/Gemini"
import chatHistoryManager from "../../services/ChatHistoryManager"
import apiKeyManager from "../../services/ApiKeyManager"
import ChatMessage from "./ChatMessage"

type Message = {
    role: "user" | "assistant"
    content: string
    timestamp?: number
    model?: string
    provider?: "gpt" | "gemini"
    isIncomplete?: boolean
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

function ChatHistory({
     messages,
     isLoading,
     onDeleteMessage,
     onEditMessage,
}: {
     messages: any
     isLoading: any
     onDeleteMessage: (role: "user" | "assistant", content: string) => void
     onEditMessage: (oldContent: string, newContent: string) => void
}) {
     let scrolledWindow: any = null

     return (
         <box orientation={Gtk.Orientation.VERTICAL} vexpand>
             <scrolledwindow
                 hscrollbarPolicy={Gtk.PolicyType.NEVER}
                 vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                 vexpand
                 $={(self: any) => {
                     scrolledWindow = self
                 }}
             >
                 <box
                     orientation={Gtk.Orientation.VERTICAL}
                     class="chat-history spacing-v-5"
                     $={() => {
                         // Scroll to bottom when messages change
                         if (scrolledWindow && messages.get().length > 0) {
                             setTimeout(() => {
                                 const vadjustment = scrolledWindow.get_vadjustment()
                                 if (vadjustment) {
                                     vadjustment.set_value(vadjustment.get_upper() - vadjustment.get_page_size())
                                 }
                             }, 100)
                         }
                     }}
                 >
                    {(() => {
                        const msgs = messages.get()
                        if (msgs.length === 0) {
                            return (
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
                            )
                        }
                        return null
                    })()}
                    <For each={messages}>
                        {(msg: Message) => (
                            <ChatMessage
                                message={msg}
                                onDelete={onDeleteMessage}
                                onEdit={onEditMessage}
                                showActions={true}
                            />
                        )}
                    </For>
                    {isLoading.get() && <TypingIndicator />}
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
                     placeholderText="Ask anything..."
                     text={text}
                     onNotify={(self: any) => {
                         setText(self.text)
                     }}
                     onActivate={handleSend}
                     hexpand
                     sensitive={isLoading.as((loading: boolean) => !loading)}
                     $={(self: any) => {
                         // Add keyboard event handler for Ctrl+Enter
                         const keyController = new Gtk.EventControllerKey()
                         keyController.connect("key-pressed", (_, keyval, keycode, state: number) => {
                             // Check if Ctrl is pressed (bit 2 of state)
                             const isCtrlPressed = (state & 4) === 4
                             
                             if (isCtrlPressed && (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter)) {
                                 handleSend()
                                 return true // Consume the event
                             }
                             return false
                         })
                         self.add_controller(keyController)
                     }}
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
     const [initialized, setInitialized] = createState(false)

     // Initialize messages from current provider's history
     const loadMessagesForProvider = (provider: "gpt" | "gemini") => {
         const history = chatHistoryManager.getMessages(provider)
         setMessages([...history])
     }

     // Load initial messages from history for default provider
     const initializeChatHistory = () => {
         if (!initialized.get()) {
             loadMessagesForProvider("gpt")
             setInitialized(true)
         }
     }

    // Handle message deletion
    const handleDeleteMessage = (role: "user" | "assistant", content: string) => {
        const currentProvider = apiProvider.get()
        const currentMessages = messages.get()
        
        // Remove message from state
        const updatedMessages = currentMessages.filter(
            (msg: Message) => !(msg.role === role && msg.content === content)
        )
        setMessages(updatedMessages)
        
        // Clear and re-add all messages to update chat history
        // (ChatHistoryManager doesn't have delete yet, so we rebuild)
        chatHistoryManager.clearMessages(currentProvider)
        updatedMessages.forEach((msg: Message) => {
            chatHistoryManager.addMessage(currentProvider, {
                role: msg.role,
                content: msg.content
            })
        })
    }

    // Handle message editing
    const handleEditMessage = (oldContent: string, newContent: string) => {
        const currentProvider = apiProvider.get()
        const currentMessages = messages.get()
        
        // Update message in state
        const updatedMessages = currentMessages.map((msg: Message) => 
            msg.content === oldContent
                ? { ...msg, content: newContent }
                : msg
        )
        setMessages(updatedMessages)
        
        // Clear and re-add all messages to update chat history
        // (ChatHistoryManager doesn't have update yet, so we rebuild)
        chatHistoryManager.clearMessages(currentProvider)
        updatedMessages.forEach((msg: Message) => {
            chatHistoryManager.addMessage(currentProvider, {
                role: msg.role,
                content: msg.content
            })
        })
    }

    const handleSendMessage = async (text: string) => {
        const currentProvider = apiProvider.get()
        
        // Add user message to display and save
        const userMessage: Message = { 
            role: "user", 
            content: text,
            timestamp: Date.now(),
            provider: currentProvider,
        }
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
            const assistantMessage: Message = { 
                role: "assistant", 
                content: response,
                timestamp: Date.now(),
                model: currentProvider === "gpt" ? "gpt-4" : "gemini-pro",
                provider: currentProvider,
            }
            setMessages([...messages.get(), assistantMessage])
            chatHistoryManager.addMessage(currentProvider, assistantMessage)
         } catch (err) {
             // Show error as assistant message
             let errorMsg = "Unknown error occurred"
             if (err instanceof Error) {
                 errorMsg = err.message
             } else if (typeof err === 'string') {
                 errorMsg = err
             }
             
             // Check for common error patterns
             if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
                 errorMsg = `❌ Authentication failed. Please check your API key for ${currentProvider.toUpperCase()}.`
             } else if (errorMsg.includes("429") || errorMsg.includes("Too Many")) {
                 errorMsg = `⏳ Rate limit exceeded. Please wait a moment and try again.`
             } else if (errorMsg.includes("500") || errorMsg.includes("Internal")) {
                 errorMsg = `🔧 Server error. The API service is experiencing issues.`
             } else if (errorMsg.includes("ENOTFOUND") || errorMsg.includes("ECONNREFUSED")) {
                 errorMsg = `🌐 Network error. Please check your connection.`
             } else {
                 errorMsg = `❌ Error: ${errorMsg}`
             }
             
             const errorMessage: Message = {
                 role: "assistant",
                 content: errorMsg,
                 timestamp: Date.now(),
                 provider: currentProvider,
             }
             setMessages([...messages.get(), errorMessage])
             chatHistoryManager.addMessage(currentProvider, errorMessage)
         } finally {
             setIsLoading(false)
         }
    }

     return (
         <box orientation={Gtk.Orientation.VERTICAL} class="chat-widget spacing-v-10" vexpand
             $={() => {
                 // Initialize on first render
                 initializeChatHistory()
             }}
         >
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
                 <label 
                     class="txt txt-smallie txt-subtext"
                     label={apiProvider.as((p) => {
                         const keys = apiKeyManager.getKeys().get()
                         const hasKey = keys[p]
                         return hasKey ? "✓" : "✗"
                     })}
                     tooltipText={apiProvider.as((p) => {
                         const keys = apiKeyManager.getKeys().get()
                         const hasKey = keys[p]
                         return hasKey ? `${p.toUpperCase()} API key configured` : `No API key for ${p.toUpperCase()}`
                     })}
                 />
             </box>
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5" vexpand>
                <ChatHistory 
                    messages={messages} 
                    isLoading={isLoading}
                    onDeleteMessage={handleDeleteMessage}
                    onEditMessage={handleEditMessage}
                />
                <ChatEntry onSendMessage={handleSendMessage} isLoading={isLoading} />
            </box>
        </box>
    )
}
