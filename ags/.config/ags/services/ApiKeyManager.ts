import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { readFile, writeFile } from "ags/file"

interface ApiKeys {
    gpt: string
    gemini: string
}

const defaultKeys: ApiKeys = {
    gpt: "",
    gemini: ""
}

const keysFile = `${GLib.get_user_config_dir()}/ags/api_keys.json`
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
            // Create config directory if it doesn't exist
            GLib.mkdir_with_parents(`${GLib.get_user_config_dir()}/ags`, 0o755)
            saveKeys(defaultKeys)
        }
    } catch (e) {
        console.error("Failed to load API keys:", e)
        setKeysState(defaultKeys)
    }
}

function saveKeys(keys: ApiKeys) {
    try {
        const content = JSON.stringify(keys, null, 2)
        // Create config directory if it doesn't exist
        GLib.mkdir_with_parents(`${GLib.get_user_config_dir()}/ags`, 0o755)
        writeFile(keysFile, content)
    } catch (e) {
        console.error("Failed to save API keys:", e)
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
