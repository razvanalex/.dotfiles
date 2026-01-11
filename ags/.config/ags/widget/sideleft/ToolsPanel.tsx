import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import userOptions from "../../lib/userOptions"
import apiKeyManager from "../../services/ApiKeyManager"
import chatHistoryManager from "../../services/ChatHistoryManager"
import gptService from "../../services/GPT"
import geminiService from "../../services/Gemini"

function ApiKeyInput({ 
    provider, 
    label 
}: { 
    provider: "gpt" | "gemini"
    label: string 
}) {
    const keys = apiKeyManager.getKeys()
    const [keyValue, setKeyValue] = createState("")
    const [showKey, setShowKey] = createState(false)

    // Initialize with current key
    const currentKey = keys.as((k: any) => k[provider])

    const handleSave = () => {
        const key = keyValue.get().trim()
        if (key) {
            apiKeyManager.setKey(provider, key)
            // Update service with new key
            if (provider === "gpt") {
                gptService.api_key = key
            } else {
                geminiService.api_key = key
            }
            setKeyValue("")
        }
    }

    const handleClear = () => {
        apiKeyManager.clearKey(provider)
        setKeyValue("")
        setShowKey(false)
        if (provider === "gpt") {
            gptService.api_key = ""
        } else {
            geminiService.api_key = ""
        }
    }

    return (
        <box class="sidebar-group spacing-v-5" orientation={Gtk.Orientation.VERTICAL}>
            <label class="txt txt-small" label={label} />
            <box class="spacing-h-5">
                <entry
                    class="sidebar-chat-entry txt-small"
                    placeholderText="Enter API key..."
                    visibility={showKey.as((show: boolean) => show)}
                    text={keyValue}
                    hexpand
                    onNotify={(self: any) => {
                        setKeyValue(self.text)
                    }}
                />
                <button
                    class="txt-norm icon-material sidebar-chat-send"
                    onClicked={() => setShowKey(!showKey.get())}
                    tooltipText={showKey.as((show: boolean) => show ? "Hide key" : "Show key")}
                >
                    <label label={showKey.as((show: boolean) => show ? "visibility_off" : "visibility")} />
                </button>
            </box>
            <box class="spacing-h-5">
                <button
                    class="txt-norm txt-norm"
                    hexpand
                    onClicked={handleSave}
                >
                    <label label="Save" />
                </button>
                <button
                    class="txt-norm txt-norm"
                    hexpand
                    onClicked={handleClear}
                >
                    <label label="Clear" />
                </button>
            </box>
            <label 
                class="txt txt-smallie txt-subtext"
                label={currentKey.as((key: string) => key ? "✓ API key configured" : "✗ No API key set")}
                wrap
            />
        </box>
    )
}

export default function ToolsPanel() {
    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-tools spacing-v-10" vexpand>
            <box orientation={Gtk.Orientation.VERTICAL} class="group-padding spacing-v-10" vexpand>
                <label class="txt txt-larger" label="API Keys" />
                <label class="txt txt-smallie txt-subtext" label="Configure your API keys for different AI providers." wrap />
                
                <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
                    <ApiKeyInput provider="gpt" label="OpenAI GPT" />
                    <ApiKeyInput provider="gemini" label="Google Gemini" />
                </box>

                <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
                    <label class="txt txt-larger" label="Chat History" />
                    <label class="txt txt-smallie txt-subtext" label="Manage your chat messages and conversation history." wrap />
                    <box class="spacing-h-5">
                        <button
                            class="txt-norm txt-norm"
                            hexpand
                            onClicked={() => {
                                chatHistoryManager.clearMessages("gpt")
                                gptService.clearHistory()
                            }}
                        >
                            <label label="Clear GPT History" />
                        </button>
                        <button
                            class="txt-norm txt-norm"
                            hexpand
                            onClicked={() => {
                                chatHistoryManager.clearMessages("gemini")
                                geminiService.clearHistory()
                            }}
                        >
                            <label label="Clear Gemini History" />
                        </button>
                    </box>
                    <button
                        class="txt-norm txt-norm"
                        onClicked={() => {
                            chatHistoryManager.clearAll()
                            gptService.clearHistory()
                            geminiService.clearHistory()
                        }}
                    >
                        <label label="Clear All History" />
                    </button>
                </box>

                <box orientation={Gtk.Orientation.VERTICAL} class="group-padding spacing-v-5" vexpand={false}>
                    <label class="txt txt-small" label="About" />
                    <label 
                        class="txt txt-smallie txt-subtext"
                        label="• Get GPT API key: https://platform.openai.com/api-keys\n• Get Gemini API key: https://ai.google.dev/aistudio"
                        wrap
                    />
                </box>
            </box>
        </box>
    )
}
