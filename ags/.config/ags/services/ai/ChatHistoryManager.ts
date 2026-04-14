import { createState } from "ags";
import { readFile, writeFile } from "ags/file";
import { ensureDirectory, PATHS } from "lib/constants";
import Logger from "lib/logger";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

interface ChatHistory {
	gpt: ChatMessage[];
	gemini: ChatMessage[];
}

const defaultHistory: ChatHistory = {
	gpt: [],
	gemini: [],
};

const historyFile = PATHS.chatHistory;
const [historyState, setHistoryState] =
	createState<ChatHistory>(defaultHistory);

// Load history on initialization
function loadHistory() {
	try {
		const contents = readFile(historyFile);
		const loaded = JSON.parse(contents) as ChatHistory;
		setHistoryState(loaded);
	} catch (_e) {
		// File doesn't exist or is invalid, use defaults
		setHistoryState(defaultHistory);
	}
}

function saveHistory(history: ChatHistory) {
	try {
		const content = JSON.stringify(history, null, 2);
		ensureDirectory(historyFile);
		writeFile(historyFile, content);
	} catch (e) {
		Logger.error("Failed to save chat history:", e);
	}
}

class ChatHistoryManager {
	constructor() {
		loadHistory();
	}

	getHistory() {
		return historyState;
	}

	getMessages(provider: "gpt" | "gemini"): ChatMessage[] {
		return historyState.get()[provider];
	}

	addMessage(provider: "gpt" | "gemini", message: ChatMessage) {
		const current = historyState.get();
		const messages = [...current[provider], message];
		const updated = { ...current, [provider]: messages };
		setHistoryState(updated);
		saveHistory(updated);
	}

	clearMessages(provider: "gpt" | "gemini") {
		const current = historyState.get();
		const updated = { ...current, [provider]: [] };
		setHistoryState(updated);
		saveHistory(updated);
	}

	clearAll() {
		setHistoryState(defaultHistory);
		saveHistory(defaultHistory);
	}
}

export const chatHistoryManager = new ChatHistoryManager();
export default chatHistoryManager;
