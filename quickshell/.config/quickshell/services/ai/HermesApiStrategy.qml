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
            "prompt": lastUserMessage,
            "model": model ? (model.model || "") : "",
            "provider": model?.extraParams?.provider || "",
            "base_url": model?.extraParams?.base_url || "",
        };
    }

    function buildAuthorizationHeader(apiKeyEnvVarName: string): string {
        return "";
    }

    function finalizeScriptContent(scriptContent: string): string {
        try {
            const dataPrefix = " --data '";
            const idx = scriptContent.indexOf(dataPrefix);
            if (idx !== -1) {
                let jsonStr = scriptContent.substring(idx + dataPrefix.length);
                if (jsonStr.endsWith("'\n")) jsonStr = jsonStr.slice(0, -2);
                else if (jsonStr.endsWith("'")) jsonStr = jsonStr.slice(0, -1);
                jsonStr = jsonStr.replace(/'\\''/g, "'");
                const data = JSON.parse(jsonStr);
                const prompt = data.prompt || "";
                const escapedPrompt = CF.StringUtils.shellSingleQuoteEscape(prompt);
                let cmd = `/home/razvan/.dotfiles/quickshell/.config/quickshell/scripts/ai/quickshell_hermes_service.py text`;
                if (data.model) cmd += ` --model ${CF.StringUtils.shellSingleQuoteEscape(data.model)}`;
                if (data.provider) cmd += ` --provider ${CF.StringUtils.shellSingleQuoteEscape(data.provider)}`;
                if (data.base_url) cmd += ` --base-url ${CF.StringUtils.shellSingleQuoteEscape(data.base_url)}`;
                cmd += ` -- ${escapedPrompt}`;
                return `#!/usr/bin/env bash\n${cmd}\n`;
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
