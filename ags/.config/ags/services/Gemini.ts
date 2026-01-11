import GObject from "gi://GObject"
import GLib from "gi://GLib"
import apiKeyManager from "./ApiKeyManager"

export interface ChatMessage {
    role: "user" | "assistant" | "system"
    content: string
}

class GeminiService extends GObject.Object {
    static {
        GObject.registerClass(
            {
                Properties: {
                    "api-key": GObject.ParamSpec.string("api-key", "", "", GObject.ParamFlags.READWRITE, ""),
                    "model": GObject.ParamSpec.string("model", "", "", GObject.ParamFlags.READWRITE, "gemini-2.0-flash"),
                    "temperature": GObject.ParamSpec.double("temperature", "", "", GObject.ParamFlags.READWRITE, 0, 2, 1),
                    "is-loading": GObject.ParamSpec.boolean("is-loading", "", "", GObject.ParamFlags.READWRITE, false),
                    "error": GObject.ParamSpec.string("error", "", "", GObject.ParamFlags.READWRITE, ""),
                },
            },
            this
        )
    }

    #apiKey: string = ""
    #model: string = "gemini-2.0-flash"
    #temperature: number = 1
    #maxTokens: number = 2048
    #proxyUrl: string | null = null
    #isLoading: boolean = false
    #error: string = ""
    #conversationHistory: ChatMessage[] = []

    constructor(options: { apiKey?: string; model?: string; temperature?: number; maxTokens?: number; proxyUrl?: string | null } = {}) {
        super()
        this.#apiKey = options.apiKey || apiKeyManager.getKey("gemini") || ""
        this.#model = options.model || "gemini-2.0-flash"
        this.#temperature = options.temperature || 1
        this.#maxTokens = options.maxTokens || 2048
        this.#proxyUrl = options.proxyUrl || null
    }

    get api_key(): string {
        return this.#apiKey
    }
    set api_key(value: string) {
        this.#apiKey = value
        this.notify("api-key")
    }

    get model(): string {
        return this.#model
    }
    set model(value: string) {
        this.#model = value
        this.notify("model")
    }

    get temperature(): number {
        return this.#temperature
    }
    set temperature(value: number) {
        this.#temperature = Math.max(0, Math.min(2, value))
        this.notify("temperature")
    }

    get is_loading(): boolean {
        return this.#isLoading
    }

    get error(): string {
        return this.#error
    }

    async sendMessage(userMessage: string): Promise<string> {
        if (!this.#apiKey) {
            this.#error = "API key not set"
            this.notify("error")
            throw new Error("API key not set")
        }

        try {
            this.#isLoading = true
            this.notify("is-loading")
            this.#error = ""
            this.notify("error")

            // Add user message to history
            this.#conversationHistory.push({
                role: "user",
                content: userMessage
            })

            // Build messages in Gemini format (alternating user/assistant)
            const contents = this.#conversationHistory.map(msg => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }]
            }))

            // Make API request
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:generateContent?key=${this.#apiKey}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        temperature: this.#temperature,
                        maxOutputTokens: this.#maxTokens
                    }
                })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error?.message || `API error: ${response.status}`)
            }

            const data = await response.json()
            const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received"

            // Add assistant message to history
            this.#conversationHistory.push({
                role: "assistant",
                content: assistantMessage
            })

            this.#isLoading = false
            this.notify("is-loading")

            return assistantMessage
        } catch (err) {
            this.#isLoading = false
            this.#error = err instanceof Error ? err.message : "Unknown error occurred"
            this.notify("is-loading")
            this.notify("error")
            throw err
        }
    }

    clearHistory() {
        this.#conversationHistory = []
    }

    getHistory(): ChatMessage[] {
        return [...this.#conversationHistory]
    }
}

export const geminiService = new GeminiService()
export default geminiService
