import QtQuick
import qs.modules.common.functions as CF

ApiStrategy {
    function buildEndpoint(model: AiModel): string {
        return "hermes";
    }

    function buildRequestData(model: AiModel, messages, systemPrompt: string, temperature: real, tools: list<var>, filePath: string) {
        let lastUserMessage = "";
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                lastUserMessage = messages[i].rawContent;
                break;
            }
        }
        return {
            "prompt": lastUserMessage
        };
    }

    function buildAuthorizationHeader(apiKeyEnvVarName: string): string {
        return "";
    }

    function finalizeScriptContent(scriptContent: string): string {
        try {
            const match = scriptContent.match(/--data '(.*)'/);
            if (match && match[1]) {
                const data = JSON.parse(match[1]);
                const prompt = data.prompt || "";
                const escapedPrompt = CF.StringUtils.shellSingleQuoteEscape(prompt);
                return `#!/usr/bin/env bash\n/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/ai/quickshell_hermes_service.py text ${escapedPrompt}\n`;
            }
        } catch(e) {
            console.log("[HermesApiStrategy] Parse error: ", e);
        }
        return scriptContent;
    }

    function parseResponseLine(line, message) {
        if (!line || line.length === 0) return {};
        if (line.startsWith("state.db") || line.startsWith("Failed to register")) return {};
        
        message.content += line + "\n";
        message.rawContent += line + "\n";
        return {};
    }

    function onRequestFinished(message) {
        return { finished: true };
    }

    function reset() {}
}
