import Logger from "lib/logger"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { readFile, writeFile } from "ags/file"
import { PATHS, ensureDirectory } from "lib/constants"

interface ApiKeys {
    gpt: string
    gemini: string
}

const defaultKeys: ApiKeys = {
    gpt: "",
    gemini: ""
}

const keysFile = PATHS.apiKeys
const [keysState, setKeysState] = createState<ApiKeys>(defaultKeys)

// Load keys on initialization
function loadKeys() {
    try {
        const file = Gio.File.new_for_path(keysFile)
        if (file.query_exists(null)) {
            const contents = readFile(keysFile)
            const loaded = JSON.parse(contents) as ApiKeys
            setKeysState(loaded)
        } else {
            // Create config directory and file if it doesn't exist
            ensureDirectory(keysFile)
            saveKeys(defaultKeys)
        }
    } catch (e) {
        Logger.error("Failed to load API keys:", e)
        setKeysState(defaultKeys)
    }
}

function saveKeys(keys: ApiKeys) {
    try {
        const content = JSON.stringify(keys, null, 2)
        ensureDirectory(keysFile)
        writeFile(keysFile, content)
    } catch (e) {
        Logger.error("Failed to save API keys:", e)
    }
}

class ApiKeyManager {
    constructor() {
        loadKeys()
    }

    getKeys() {
        return keysState
    }

    getKey(provider: "gpt" | "gemini"): string {
        return keysState.get()[provider]
    }

    setKey(provider: "gpt" | "gemini", key: string) {
        const current = keysState.get()
        const updated = { ...current, [provider]: key }
        setKeysState(updated)
        saveKeys(updated)
    }

    clearKey(provider: "gpt" | "gemini") {
        this.setKey(provider, "")
    }

    clearAll() {
        setKeysState(defaultKeys)
        saveKeys(defaultKeys)
    }
}

export const apiKeyManager = new ApiKeyManager()
export default apiKeyManager
