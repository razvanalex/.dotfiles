pragma Singleton
pragma ComponentBehavior: Bound

import qs.modules.common.functions as CF
import qs.modules.common
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.services.ai

/**
 * Basic service to handle LLM chats. Supports Google's and OpenAI's API formats.
 * Supports Gemini and OpenAI models.
 * Limitations:
 * - For now functions only work with Gemini API format
 */
Singleton {
    id: root

    property Component aiMessageComponent: AiMessageData {}
    property Component aiModelComponent: AiModel {}
    property Component geminiApiStrategy: GeminiApiStrategy {}
    property Component openaiApiStrategy: OpenAiApiStrategy {}
    property Component mistralApiStrategy: MistralApiStrategy {}
    property Component hermesApiStrategy: HermesApiStrategy {}
    readonly property string interfaceRole: "interface"
    readonly property string apiKeyEnvVarName: "API_KEY"

    signal responseFinished()

    property string systemPrompt: {
        let prompt = Config.options?.ai?.systemPrompt ?? "";
        for (let key in root.promptSubstitutions) {
            // prompt = prompt.replaceAll(key, root.promptSubstitutions[key]);
            // QML/JS doesn't support replaceAll, so use split/join
            prompt = prompt.split(key).join(root.promptSubstitutions[key]);
        }
        return prompt;
    }
    // property var messages: []
    property var messageIDs: []
    property var messageByID: ({})
    readonly property var apiKeys: KeyringStorage.keyringData?.apiKeys ?? {}
    readonly property var apiKeysLoaded: KeyringStorage.loaded
    readonly property bool currentModelHasApiKey: {
        const model = models[currentModelId];
        if (!model || !model.requires_key) return true;
        if (!apiKeysLoaded) return false;
        const key = apiKeys[model.key_id];
        return (key?.length > 0);
    }
    property var postResponseHook
    property real temperature: Persistent.states?.ai?.temperature ?? 0.5
    property QtObject tokenCount: QtObject {
        property int input: -1
        property int output: -1
        property int total: -1
    }

    function idForMessage(message) {
        // Generate a unique ID using timestamp and random value
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    }

    function safeModelName(modelName) {
        return modelName.replace(/:/g, "_").replace(/ /g, "-").replace(/\//g, "-")
    }

    property list<var> defaultPrompts: []
    property list<var> userPrompts: []
    property list<var> promptFiles: [...defaultPrompts, ...userPrompts]
    property list<var> savedChats: []

    property var promptSubstitutions: {
        "{DISTRO}": SystemInfo.distroName,
        "{DATETIME}": `${DateTime.time}, ${DateTime.collapsedCalendarFormat}`,
        "{WINDOWCLASS}": ToplevelManager.activeToplevel?.appId ?? "Unknown",
        "{DE}": `${SystemInfo.desktopEnvironment} (${SystemInfo.windowingSystem})` 
    }

    // Gemini: https://ai.google.dev/gemini-api/docs/function-calling
    // OpenAI: https://platform.openai.com/docs/guides/function-calling
    property string currentTool: Config?.options.ai.tool ?? "none"
    property var tools: {
        "gemini": {
            "functions": [{"functionDeclarations": [
                {
                    "name": "switch_to_search_mode",
                    "description": "Search the web",
                },
                {
                    "name": "get_shell_config",
                    "description": "Get the desktop shell config file contents",
                },
                {
                    "name": "set_shell_config",
                    "description": "Set a field in the desktop graphical shell config file. Must only be used after `get_shell_config`.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "key": {
                                "type": "string",
                                "description": "The key to set, e.g. `bar.borderless`. MUST NOT BE GUESSED, use `get_shell_config` to see what keys are available before setting.",
                            },
                            "value": {
                                "type": "string",
                                "description": "The value to set, e.g. `true`"
                            }
                        },
                        "required": ["key", "value"]
                    }
                },
                {
                    "name": "run_shell_command",
                    "description": "Run a shell command in bash and get its output. Use this only for quick commands that don't require user interaction. For commands that require interaction, ask the user to run manually instead.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "The bash command to run",
                            },
                        },
                        "required": ["command"]
                    }
                },
            ]}],
            "search": [{
                "google_search": {}
            }],
            "none": []
        },
        "openai": {
            "functions": [
                {
                    "type": "function",
                    "function": {
                        "name": "get_shell_config",
                        "description": "Get the desktop shell config file contents",
                        "parameters": {}
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "set_shell_config",
                        "description": "Set a field in the desktop graphical shell config file. Must only be used after `get_shell_config`.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "description": "The key to set, e.g. `bar.borderless`. MUST NOT BE GUESSED, use `get_shell_config` to see what keys are available before setting.",
                                },
                                "value": {
                                    "type": "string",
                                    "description": "The value to set, e.g. `true`"
                                }
                            },
                            "required": ["key", "value"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "run_shell_command",
                        "description": "Run a shell command in bash and get its output. Use this only for quick commands that don't require user interaction. For commands that require interaction, ask the user to run manually instead.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "command": {
                                    "type": "string",
                                    "description": "The bash command to run",
                                },
                            },
                            "required": ["command"]
                        }
                    },
                },
            ],
            "search": [],
            "none": [],
        },
        "mistral": {
            "functions": [
                {
                    "type": "function",
                    "function": {
                        "name": "get_shell_config",
                        "description": "Get the desktop shell config file contents",
                        "parameters": {}
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "set_shell_config",
                        "description": "Set a field in the desktop graphical shell config file. Must only be used after `get_shell_config`.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "description": "The key to set, e.g. `bar.borderless`. MUST NOT BE GUESSED, use `get_shell_config` to see what keys are available before setting.",
                                },
                                "value": {
                                    "type": "string",
                                    "description": "The value to set, e.g. `true`"
                                }
                            },
                            "required": ["key", "value"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "run_shell_command",
                        "description": "Run a shell command in bash and get its output. Use this only for quick commands that don't require user interaction. For commands that require interaction, ask the user to run manually instead.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "command": {
                                    "type": "string",
                                    "description": "The bash command to run",
                                },
                            },
                            "required": ["command"]
                        }
                    },
                },
            ],
            "search": [],
            "none": [],
        },
        "hermes": {
            "functions": [],
            "search": [],
            "none": [],
        }
    }
    property list<var> availableTools: Object.keys(root.tools[models[currentModelId]?.api_format] ?? root.tools["openai"])
    property var toolDescriptions: {
        "functions": Translation.tr("Commands, edit configs, search.\nTakes an extra turn to switch to search mode if that's needed"),
        "search": Translation.tr("Gives the model search capabilities (immediately)"),
        "none": Translation.tr("Disable tools")
    }

    // Model properties:
    // - name: Name of the model
    // - icon: Icon name of the model
    // - description: Description of the model
    // - endpoint: Endpoint of the model
    // - model: Model name of the model
    // - requires_key: Whether the model requires an API key
    // - key_id: The identifier of the API key. Use the same identifier for models that can be accessed with the same key.
    // - key_get_link: Link to get an API key
    // - key_get_description: Description of pricing and how to get an API key
    // - api_format: The API format of the model. Can be "openai" or "gemini". Default is "openai".
    // - extraParams: Extra parameters to be passed to the model. This is a JSON object.
    property var providers: ({})
    property list<string> providerList: []
    property string currentProviderId: Persistent.states?.ai?.provider || "hermes"
    property var providerModelsMap: ({})

    property string currentProfile: "default"
    property list<string> profileList: ["default", "custom-agent", "general-chat", "reviewer"]
    property var profilesData: []

    property var models: ({})
    property var modelList: Object.keys(root.models)
    property string selectedModelId: Persistent.states?.ai?.model || ""
    property var currentModelId: (selectedModelId && root.models[selectedModelId]) ? selectedModelId : (modelList[0] || "")

    property var apiStrategies: {
        "openai": openaiApiStrategy.createObject(this),
        "gemini": geminiApiStrategy.createObject(this),
        "mistral": mistralApiStrategy.createObject(this),
        "hermes": hermesApiStrategy.createObject(this),
    }
    property ApiStrategy currentApiStrategy: apiStrategies[models[currentModelId]?.api_format || "openai"]

    function initFallbackProviders() {
        const wsModels = {
            "qwen-3.6": aiModelComponent.createObject(root, {
                name: "Qwen 3.6",
                icon: "computer-symbolic",
                description: "Qwen 3.6 on Local Workstation",
                endpoint: "http://lx.workstation.lan:11435/v1/chat/completions",
                model: "qwen-3.6",
                requires_key: false,
                api_format: "openai"
            }),
            "qwen-3.6-fast": aiModelComponent.createObject(root, {
                name: "Qwen 3.6 Fast",
                icon: "computer-symbolic",
                description: "Qwen 3.6 Fast on Local Workstation",
                endpoint: "http://lx.workstation.lan:11435/v1/chat/completions",
                model: "qwen-3.6-fast",
                requires_key: false,
                api_format: "openai"
            }),
            "qwen-3.8-27b": aiModelComponent.createObject(root, {
                name: "Qwen 3.8 27B",
                icon: "computer-symbolic",
                description: "Qwen 3.8 27B on Local Workstation",
                endpoint: "http://lx.workstation.lan:11435/v1/chat/completions",
                model: "qwen-3.8-27b",
                requires_key: false,
                api_format: "openai"
            })
        };

        const hermesModels = {
            "qwen-3.6": aiModelComponent.createObject(root, {
                name: "Qwen 3.6 (Workstation)",
                icon: "terminal-symbolic",
                description: "Qwen 3.6 on Workstation via Hermes Agent",
                endpoint: "hermes",
                model: "qwen-3.6",
                requires_key: false,
                api_format: "hermes",
                extraParams: { provider: "custom:Lx.workstation.lan:11435", base_url: "http://lx.workstation.lan:11435/v1" }
            }),
            "qwen-3.6-fast": aiModelComponent.createObject(root, {
                name: "Qwen 3.6 Fast (Workstation)",
                icon: "terminal-symbolic",
                description: "Qwen 3.6 Fast on Workstation via Hermes Agent",
                endpoint: "hermes",
                model: "qwen-3.6-fast",
                requires_key: false,
                api_format: "hermes",
                extraParams: { provider: "custom:Lx.workstation.lan:11435", base_url: "http://lx.workstation.lan:11435/v1" }
            }),
            "deepseek-v4-flash": aiModelComponent.createObject(root, {
                name: "DeepSeek V4 Flash (OpenCode)",
                icon: "terminal-symbolic",
                description: "DeepSeek V4 Flash on OpenCode Go via Hermes",
                endpoint: "hermes",
                model: "deepseek-v4-flash",
                requires_key: false,
                api_format: "hermes",
                extraParams: { provider: "opencode-go", base_url: "https://opencode.ai/zen/go/v1" }
            }),
            "default": aiModelComponent.createObject(root, {
                name: "Hermes Default",
                icon: "terminal-symbolic",
                description: "Default configured model in Hermes",
                endpoint: "hermes",
                model: "default",
                requires_key: false,
                api_format: "hermes"
            })
        };

        root.providerModelsMap = {
            "hermes": hermesModels,
            "workstation": wsModels
        };

        root.providers = {
            "hermes": {
                id: "hermes",
                name: "Hermes Agent",
                icon: "terminal-symbolic",
                description: "Hermes Agent with tools, bash, memory & skills",
                default_model: "qwen-3.6"
            },
            "workstation": {
                id: "workstation",
                name: "Local Workstation",
                icon: "computer-symbolic",
                description: "Direct connection to local LLM server (lx.workstation.lan:11435)",
                default_model: "qwen-3.6"
            }
        };

        root.providerList = ["hermes", "workstation"];
        updateActiveModels();
    }

    function updateActiveModels() {
        if (!providerList || providerList.length === 0) return;
        if (providerList.indexOf(currentProviderId) === -1) {
            currentProviderId = providerList[0];
        }
        root.models = providerModelsMap[currentProviderId] || {};
        root.modelList = Object.keys(root.models);

        const savedModel = Persistent.states?.ai?.[`model_${currentProviderId}`] || Persistent.states?.ai?.model;
        if (savedModel && root.models[savedModel]) {
            root.selectedModelId = savedModel;
        } else {
            const defM = providers[currentProviderId]?.default_model;
            root.selectedModelId = (defM && root.models[defM]) ? defM : (modelList[0] || "");
        }
    }

    function loadDiscoveredProviders(data) {
        let newProviderModelsMap = {};
        let newProviders = {};
        let newProviderList = [];

        for (let provKey in data) {
            const pInfo = data[provKey];
            newProviders[provKey] = {
                id: provKey,
                name: pInfo.name,
                icon: pInfo.icon || "ai-symbolic",
                description: pInfo.description || "",
                default_model: pInfo.default_model || (pInfo.models && pInfo.models[0]?.id) || "default"
            };
            newProviderList.push(provKey);

            let pModels = {};
            (pInfo.models || []).forEach(m => {
                pModels[m.id] = aiModelComponent.createObject(root, {
                    name: m.name,
                    icon: m.icon || pInfo.icon || "ai-symbolic",
                    description: m.description || "",
                    endpoint: m.endpoint || pInfo.endpoint || "",
                    model: m.model,
                    requires_key: m.requires_key || false,
                    api_format: m.api_format || pInfo.api_format || "openai",
                    extraParams: {
                        provider: m.provider || "",
                        base_url: m.base_url || ""
                    }
                });
            });
            newProviderModelsMap[provKey] = pModels;
        }

        // Only add Gemini or Mistral if an API key is actually present in keyring!
        if (root.apiKeysLoaded && root.apiKeys["gemini"] && root.apiKeys["gemini"].length > 0) {
            newProviders["gemini"] = {
                id: "gemini",
                name: "Google Gemini",
                icon: "google-gemini-symbolic",
                description: "Google Gemini models (online)",
                default_model: "gemini-2.5-flash"
            };
            newProviderList.push("gemini");
            newProviderModelsMap["gemini"] = {
                "gemini-2.5-flash": aiModelComponent.createObject(root, {
                    name: "Gemini 2.5 Flash",
                    icon: "google-gemini-symbolic",
                    description: "Gemini 2.5 Flash",
                    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
                    model: "gemini-2.5-flash",
                    requires_key: true,
                    key_id: "gemini",
                    api_format: "gemini"
                }),
                "gemini-3-flash": aiModelComponent.createObject(root, {
                    name: "Gemini 3 Flash",
                    icon: "google-gemini-symbolic",
                    description: "Gemini 3 Flash",
                    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent",
                    model: "gemini-3-flash-preview",
                    requires_key: true,
                    key_id: "gemini",
                    api_format: "gemini"
                })
            };
        }

        if (root.apiKeysLoaded && root.apiKeys["mistral"] && root.apiKeys["mistral"].length > 0) {
            newProviders["mistral"] = {
                id: "mistral",
                name: "Mistral AI",
                icon: "mistral-symbolic",
                description: "Mistral AI models (online)",
                default_model: "mistral-medium-3"
            };
            newProviderList.push("mistral");
            newProviderModelsMap["mistral"] = {
                "mistral-medium-3": aiModelComponent.createObject(root, {
                    name: "Mistral Medium 3",
                    icon: "mistral-symbolic",
                    description: "Mistral Medium 3",
                    endpoint: "https://api.mistral.ai/v1/chat/completions",
                    model: "mistral-medium-2505",
                    requires_key: true,
                    key_id: "mistral",
                    api_format: "mistral"
                })
            };
        }

        root.providerModelsMap = newProviderModelsMap;
        root.providers = newProviders;
        root.providerList = newProviderList;
        updateActiveModels();
    }

    function addUserModels() {
        (Config?.options.ai?.extraModels ?? []).forEach(model => {
            const safeModelName = root.safeModelName(model["model"]);
            root.addModel(safeModelName, model)
        });
    }

    Connections {
        target: Config
        function onReadyChanged() {
            if (!Config.ready) return;
            root.addUserModels()
        }
    }

    property string requestScriptFilePath: "/tmp/quickshell/ai/request.sh"
    property string pendingFilePath: ""

    Component.onCompleted: {
        initFallbackProviders();
        root.addUserModels();
        refreshProfiles();
    }

    function guessModelLogo(model) {
        if (model.includes("llama")) return "ollama-symbolic";
        if (model.includes("gemma")) return "google-gemini-symbolic";
        if (model.includes("deepseek")) return "deepseek-symbolic";
        if (/^phi\d*:/i.test(model)) return "microsoft-symbolic";
        return "ollama-symbolic";
    }

    function guessModelName(model) {
        const replaced = model.replace(/-/g, ' ').replace(/:/g, ' ');
        let words = replaced.split(' ');
        words[words.length - 1] = words[words.length - 1].replace(/(\d+)b$/, (_, num) => `${num}B`)
        words = words.map((word) => {
            return (word.charAt(0).toUpperCase() + word.slice(1))
        });
        if (words[words.length - 1] === "Latest") words.pop();
        else words[words.length - 1] = `(${words[words.length - 1]})`;
        const result = words.join(' ');
        return result;
    }

    function addModel(modelName, data) {
        root.models = Object.assign({}, root.models, {
            [modelName]: aiModelComponent.createObject(this, data)
        });
        root.modelList = Object.keys(root.models);
    }

    Process {
        id: getAiProviders
        running: true
        command: [
            "/home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python",
            `${Directories.scriptPath}/ai/quickshell_hermes_service.py`.replace(/file:\/\//, ""),
            "providers"
        ]
        stdout: StdioCollector {
            onStreamFinished: {
                if (text.length === 0) return;
                try {
                    const data = JSON.parse(text);
                    root.loadDiscoveredProviders(data);
                } catch (e) {
                    console.log("[Ai] Failed to parse providers data:", e);
                }
            }
        }
    }

    Process {
        id: hermesProfileProc
        property string action: "list"
        property string requestedProfile: ""
        property bool feedback: true
        stdout: StdioCollector {
            onStreamFinished: {
                if (text.length === 0) return;
                try {
                    const data = JSON.parse(text);
                    if (hermesProfileProc.action === "list" || hermesProfileProc.action === "get") {
                        if (data.active) root.currentProfile = data.active;
                        if (data.profiles && Array.isArray(data.profiles)) {
                            root.profilesData = data.profiles;
                            root.profileList = data.profiles.map(p => p.name);
                        }
                    } else if (hermesProfileProc.action === "set") {
                        if (data.status === "ok") {
                            root.currentProfile = data.active;
                            if (hermesProfileProc.feedback) {
                                root.addMessage(Translation.tr("Switched Hermes Profile to: **%1**%2")
                                    .arg(data.active)
                                    .arg(data.model ? ` (Default model: \`${data.model}\`)` : ""),
                                    root.interfaceRole
                                );
                            }
                            refreshProfiles();
                        } else {
                            if (hermesProfileProc.feedback) {
                                root.addMessage(Translation.tr("⚠️ %1").arg(data.message || "Failed to set profile"), root.interfaceRole);
                            }
                        }
                    }
                } catch(e) {
                    console.log("[Ai] Failed to parse profile data:", e);
                }
            }
        }
    }

    Process {
        id: getDefaultPrompts
        running: true
        command: ["ls", "-1", Directories.defaultAiPrompts]
        stdout: StdioCollector {
            onStreamFinished: {
                if (text.length === 0) return;
                root.defaultPrompts = text.split("\n")
                    .filter(fileName => fileName.endsWith(".md") || fileName.endsWith(".txt"))
                    .map(fileName => `${Directories.defaultAiPrompts}/${fileName}`)
            }
        }
    }

    Process {
        id: getUserPrompts
        running: true
        command: ["ls", "-1", Directories.userAiPrompts]
        stdout: StdioCollector {
            onStreamFinished: {
                if (text.length === 0) return;
                root.userPrompts = text.split("\n")
                    .filter(fileName => fileName.endsWith(".md") || fileName.endsWith(".txt"))
                    .map(fileName => `${Directories.userAiPrompts}/${fileName}`)
            }
        }
    }

    Process {
        id: getSavedChats
        running: true
        command: ["ls", "-1", Directories.aiChats]
        stdout: StdioCollector {
            onStreamFinished: {
                if (text.length === 0) return;
                root.savedChats = text.split("\n")
                    .filter(fileName => fileName.endsWith(".json"))
                    .map(fileName => `${Directories.aiChats}/${fileName}`)
            }
        }
    }

    FileView {
        id: promptLoader
        watchChanges: false;
        onLoadedChanged: {
            if (!promptLoader.loaded) return;
            Config.options.ai.systemPrompt = promptLoader.text();
            root.addMessage(Translation.tr("Loaded the following system prompt\n\n---\n\n%1").arg(Config.options.ai.systemPrompt), root.interfaceRole);
        }
    }

    function printPrompt() {
        root.addMessage(Translation.tr("The current system prompt is\n\n---\n\n%1").arg(Config.options.ai.systemPrompt), root.interfaceRole);
    }

    function loadPrompt(filePath) {
        promptLoader.path = "" // Unload
        promptLoader.path = filePath; // Load
        promptLoader.reload();
    }

    function addMessage(message, role) {
        if (message.length === 0) return;
        const aiMessage = aiMessageComponent.createObject(root, {
            "role": role,
            "model": root.currentModel,
            "content": message,
            "rawContent": message,
            "thinking": false,
            "done": true,
        });
        const id = idForMessage(aiMessage);
        root.messageIDs = [...root.messageIDs, id];
        root.messageByID[id] = aiMessage;
    }

    function removeMessage(index) {
        if (index < 0 || index >= messageIDs.length) return;
        const id = root.messageIDs[index];
        root.messageIDs.splice(index, 1);
        root.messageIDs = [...root.messageIDs];
        delete root.messageByID[id];
    }

    function addApiKeyAdvice(model) {
        root.addMessage(
            Translation.tr('To set an API key, pass it with the %4 command\n\nTo view the key, pass "get" with the command<br/>\n\n### For %1:\n\n**Link**: %2\n\n%3')
                .arg(model.name).arg(model.key_get_link).arg(model.key_get_description ?? Translation.tr("<i>No further instruction provided</i>")).arg("/key"), 
            Ai.interfaceRole
        );
    }

    function getModel() {
        return models[currentModelId] || null;
    }

    function printProviders(isError = false) {
        let lines = [];
        if (isError) {
            lines.push(Translation.tr("⚠️ Invalid provider specified."));
        }
        lines.push(Translation.tr("### Available AI Providers"));
        if (!providerList || providerList.length === 0) {
            lines.push(Translation.tr("No providers available."));
        } else {
            providerList.forEach(pId => {
                const p = providers[pId] || {};
                const active = (pId === currentProviderId) ? " **[active]**" : "";
                lines.push(`- \`${pId}\`${active}: **${p.name || pId}** — ${p.description || ""}`);
            });
        }
        lines.push(Translation.tr("\nUse `/provider <name>` to switch."));
        lines.push(Translation.tr("Use `/model` to view or select models for the active provider."));
        root.addMessage(lines.join("\n"), root.interfaceRole);
    }

    function setProvider(providerId, feedback = true) {
        if (!providerId || providerId.trim() === "") {
            printProviders(false);
            return false;
        }
        providerId = providerId.trim().toLowerCase();

        let matchedId = providerList.find(p => p.toLowerCase() === providerId);
        if (!matchedId) {
            if (feedback) printProviders(true);
            return false;
        }

        root.currentProviderId = matchedId;
        if (Persistent.states?.ai) {
            Persistent.states.ai.provider = matchedId;
        }
        updateActiveModels();

        const prov = providers[matchedId] || {};
        const curM = models[currentModelId];
        if (feedback) {
            root.addMessage(
                Translation.tr("Switched to provider **%1** (`%2`)\nActive model: **%3** (`%4`)\n\nType `/model` to see all models for this provider.")
                    .arg(prov.name || matchedId)
                    .arg(matchedId)
                    .arg(curM?.name || currentModelId)
                    .arg(currentModelId),
                root.interfaceRole
            );
        }
        return true;
    }

    function refreshProfiles() {
        hermesProfileProc.action = "list";
        hermesProfileProc.command = [
            "/home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python",
            `${Directories.scriptPath}/ai/quickshell_hermes_service.py`.replace(/file:\/\//, ""),
            "profile",
            "list"
        ];
        hermesProfileProc.running = true;
    }

    function printProfiles() {
        let lines = [];
        lines.push(Translation.tr("### Hermes Profiles"));
        if (!profilesData || profilesData.length === 0) {
            profileList.forEach(p => {
                const active = (p === currentProfile) ? " **[active]**" : "";
                lines.push(`- \`${p}\`${active}`);
            });
        } else {
            profilesData.forEach(p => {
                const active = (p.name === currentProfile) ? " **[active]**" : "";
                lines.push(`- \`${p.name}\`${active}: Model \`${p.model}\` — ${p.description || ""}`);
            });
        }
        lines.push(Translation.tr("\nTo switch profile: `/profile <name>`"));
        root.addMessage(lines.join("\n"), root.interfaceRole);
    }

    function setProfile(name, feedback = true) {
        if (!name || name.trim() === "" || name === "get" || name === "list") {
            printProfiles();
            return;
        }
        name = name.trim().toLowerCase();
        hermesProfileProc.action = "set";
        hermesProfileProc.requestedProfile = name;
        hermesProfileProc.feedback = feedback;
        hermesProfileProc.command = [
            "/home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python",
            `${Directories.scriptPath}/ai/quickshell_hermes_service.py`.replace(/file:\/\//, ""),
            "profile",
            "set",
            name
        ];
        hermesProfileProc.running = true;
    }

    function printModels() {
        const prov = providers[currentProviderId] || {};
        let lines = [];
        lines.push(Translation.tr("### Models for Provider: **%1** (`%2`)").arg(prov.name || currentProviderId).arg(currentProviderId));

        if (!modelList || modelList.length === 0) {
            lines.push(Translation.tr("No models available for this provider."));
        } else {
            modelList.forEach(mId => {
                const m = models[mId];
                const active = (mId === currentModelId) ? " **[active]**" : "";
                lines.push(`- \`${mId}\`${active}: **${m.name}** — ${m.description}`);
            });
        }

        const otherProviders = providerList.filter(p => p !== currentProviderId);
        if (otherProviders.length > 0) {
            lines.push(Translation.tr("\nOther available providers: %1 (switch with `/provider <name>`)").arg(otherProviders.map(p => `\`${p}\``).join(", ")));
        }
        lines.push(Translation.tr("To select a model: `/model <name>`"));

        root.addMessage(lines.join("\n"), root.interfaceRole);
    }

    function setModel(modelId, feedback = true, setPersistentState = true) {
        if (!modelId || modelId.trim() === "") {
            printModels();
            return;
        }
        modelId = modelId.trim().toLowerCase();

        // Check if model exists in current provider
        let targetModelId = modelList.find(m => m.toLowerCase() === modelId);

        if (targetModelId) {
            const model = models[targetModelId];
            if (Config.options.policies.ai === 2 && !model.endpoint.includes("localhost") && !model.endpoint.includes("11435") && model.endpoint !== "hermes") {
                root.addMessage(
                    Translation.tr("Online models disallowed\n\nControlled by `policies.ai` config option"),
                    root.interfaceRole
                );
                return;
            }
            root.selectedModelId = targetModelId;
            if (setPersistentState && Persistent.states?.ai) {
                Persistent.states.ai.model = targetModelId;
            }
            if (feedback) {
                root.addMessage(
                    Translation.tr("Model set to **%1** (`%2`) on provider **%3**")
                        .arg(model.name)
                        .arg(targetModelId)
                        .arg(providers[currentProviderId]?.name || currentProviderId),
                    root.interfaceRole
                );
            }
            if (model.requires_key) {
                if (root.apiKeysLoaded && (!root.apiKeys[model.key_id] || root.apiKeys[model.key_id].length === 0)) {
                    root.addApiKeyAdvice(model);
                }
            }
            return;
        }

        // Check if model exists in another provider
        for (let provId of providerList) {
            if (provId === currentProviderId) continue;
            const pModels = providerModelsMap[provId] || {};
            const altModelId = Object.keys(pModels).find(m => m.toLowerCase() === modelId);
            if (altModelId) {
                setProvider(provId, false);
                root.selectedModelId = altModelId;
                if (setPersistentState && Persistent.states?.ai) {
                    Persistent.states.ai.model = altModelId;
                }
                const model = models[altModelId];
                if (feedback) {
                    root.addMessage(
                        Translation.tr("Switched provider to **%1** (`%2`) and selected model **%3** (`%4`)")
                            .arg(providers[provId]?.name || provId)
                            .arg(provId)
                            .arg(model?.name || altModelId)
                            .arg(altModelId),
                        root.interfaceRole
                    );
                }
                return;
            }
        }

        // Not found
        if (feedback) {
            let errorMsg = Translation.tr("⚠️ Invalid model `%1` for provider **%2**.\n\n").arg(modelId).arg(providers[currentProviderId]?.name || currentProviderId);
            errorMsg += Translation.tr("Supported models for this provider:\n```\n") + modelList.join("\n") + "\n```\n";
            const otherProviders = providerList.filter(p => p !== currentProviderId);
            if (otherProviders.length > 0) {
                errorMsg += Translation.tr("\nTo see models for other providers (%1), switch with `/provider <name>`").arg(otherProviders.map(p => `\`${p}\``).join(", "));
            }
            root.addMessage(errorMsg, root.interfaceRole);
        }
    }

    function setTool(tool) {
        if (!root.tools[models[currentModelId]?.api_format] || !(tool in root.tools[models[currentModelId]?.api_format])) {
            root.addMessage(Translation.tr("Invalid tool. Supported tools:\n- %1").arg(root.availableTools.join("\n- ")), root.interfaceRole);
            return false;
        }
        Config.options.ai.tool = tool;
        return true;
    }
    
    function getTemperature() {
        return root.temperature;
    }

    function setTemperature(value) {
        if (value == NaN || value < 0 || value > 2) {
            root.addMessage(Translation.tr("Temperature must be between 0 and 2"), Ai.interfaceRole);
            return;
        }
        Persistent.states.ai.temperature = value;
        root.temperature = value;
        root.addMessage(Translation.tr("Temperature set to %1").arg(value), Ai.interfaceRole);
    }

    function setApiKey(key) {
        const model = models[currentModelId];
        if (!model.requires_key) {
            root.addMessage(Translation.tr("%1 does not require an API key").arg(model.name), Ai.interfaceRole);
            return;
        }
        if (!key || key.length === 0) {
            const model = models[currentModelId];
            root.addApiKeyAdvice(model)
            return;
        }
        KeyringStorage.setNestedField(["apiKeys", model.key_id], key.trim());
        root.addMessage(Translation.tr("API key set for %1").arg(model.name), Ai.interfaceRole);
    }

    function printApiKey() {
        const model = models[currentModelId];
        if (model.requires_key) {
            const key = root.apiKeys[model.key_id];
            if (key) {
                root.addMessage(Translation.tr("API key:\n\n```txt\n%1\n```").arg(key), Ai.interfaceRole);
            } else {
                root.addMessage(Translation.tr("No API key set for %1").arg(model.name), Ai.interfaceRole);
            }
        } else {
            root.addMessage(Translation.tr("%1 does not require an API key").arg(model.name), Ai.interfaceRole);
        }
    }

    function printTemperature() {
        root.addMessage(Translation.tr("Temperature: %1").arg(root.temperature), Ai.interfaceRole);
    }

    function clearMessages() {
        root.messageIDs = [];
        root.messageByID = ({});
        root.tokenCount.input = -1;
        root.tokenCount.output = -1;
        root.tokenCount.total = -1;
    }

    FileView {
        id: requesterScriptFile
    }

    Process {
        id: requester
        property list<string> baseCommand: ["bash"]
        property AiMessageData message
        property ApiStrategy currentStrategy

        function markDone() {
            requester.message.done = true;
            if (root.postResponseHook) {
                root.postResponseHook();
                root.postResponseHook = null; // Reset hook after use
            }
            root.saveChat("lastSession")
            root.responseFinished()
        }

        function makeRequest() {
            const model = models[currentModelId];

            // Fetch API keys if needed
            if (model?.requires_key && !KeyringStorage.loaded) KeyringStorage.fetchKeyringData();
            
            requester.currentStrategy = root.currentApiStrategy;
            requester.currentStrategy.reset(); // Reset strategy state

            /* Put API key in environment variable */
            if (model?.requires_key) requester.environment[`${root.apiKeyEnvVarName}`] = root.apiKeys ? (root.apiKeys[model.key_id] ?? "") : ""

            /* Build endpoint, request data */
            const endpoint = root.currentApiStrategy.buildEndpoint(model);
            const messageArray = root.messageIDs.map(id => root.messageByID[id]);
            const filteredMessageArray = messageArray.filter(message => message.role !== Ai.interfaceRole);
            const selectedTools = (root.tools[model?.api_format] ?? root.tools["openai"])[root.currentTool] ?? [];
            const data = root.currentApiStrategy.buildRequestData(model, filteredMessageArray, root.systemPrompt, root.temperature, selectedTools, root.pendingFilePath);
            // console.log("[Ai] Request data: ", JSON.stringify(data, null, 2));

            let requestHeaders = {
                "Content-Type": "application/json",
            }
            
            /* Create local message object */
            requester.message = root.aiMessageComponent.createObject(root, {
                "role": "assistant",
                "model": currentModelId,
                "content": "",
                "rawContent": "",
                "thinking": true,
                "done": false,
            });
            const id = idForMessage(requester.message);
            root.messageIDs = [...root.messageIDs, id];
            root.messageByID[id] = requester.message;

            /* Build header string for curl */ 
            let headerString = Object.entries(requestHeaders)
                .filter(([k, v]) => v && v.length > 0)
                .map(([k, v]) => `-H '${k}: ${v}'`)
                .join(' ');

            // console.log("Request headers: ", JSON.stringify(requestHeaders));
            // console.log("Header string: ", headerString);

            /* Get authorization header from strategy */
            const authHeader = requester.currentStrategy.buildAuthorizationHeader(root.apiKeyEnvVarName);
            
            /* Script shebang */
            const scriptShebang = "#!/usr/bin/env bash\n";

            /* Create extra setup when there's an attached file */
            let scriptFileSetupContent = ""
            if (root.pendingFilePath && root.pendingFilePath.length > 0) {
                requester.message.localFilePath = root.pendingFilePath;
                scriptFileSetupContent = requester.currentStrategy.buildScriptFileSetup(root.pendingFilePath);
                root.pendingFilePath = ""
            }

            /* Create command string */
            let scriptRequestContent = ""
            scriptRequestContent += `curl --no-buffer "${endpoint}"`
                + ` ${headerString}`
                + (authHeader ? ` ${authHeader}` : "")
                + ` --data '${CF.StringUtils.shellSingleQuoteEscape(JSON.stringify(data))}'`
                + "\n"
            
            /* Send the request */
            const scriptContent = requester.currentStrategy.finalizeScriptContent(scriptShebang + scriptFileSetupContent + scriptRequestContent)
            const shellScriptPath = CF.FileUtils.trimFileProtocol(root.requestScriptFilePath)
            requesterScriptFile.path = Qt.resolvedUrl(shellScriptPath)
            requesterScriptFile.setText(scriptContent)
            requester.command = baseCommand.concat([shellScriptPath]);
            requester.running = true
        }

        stdout: SplitParser {
            onRead: data => {
                if (data.length === 0) return;
                if (requester.message.thinking) requester.message.thinking = false;
                // console.log("[Ai] Raw response line: ", data);

                // Handle response line
                try {
                    const result = requester.currentStrategy.parseResponseLine(data, requester.message);
                    // console.log("[Ai] Parsed response result: ", JSON.stringify(result, null, 2));

                    if (result.functionCall) {
                        requester.message.functionCall = result.functionCall;
                        root.handleFunctionCall(result.functionCall.name, result.functionCall.args, requester.message);
                    }
                    if (result.tokenUsage) {
                        root.tokenCount.input = result.tokenUsage.input;
                        root.tokenCount.output = result.tokenUsage.output;
                        root.tokenCount.total = result.tokenUsage.total;
                    }
                    if (result.finished) {
                        requester.markDone();
                    }
                    
                } catch (e) {
                    console.log("[AI] Could not parse response: ", e);
                    requester.message.rawContent += data;
                    requester.message.content += data;
                }
            }
        }

        onExited: (exitCode, exitStatus) => {
            const result = requester.currentStrategy.onRequestFinished(requester.message);
            
            if (result.finished) {
                requester.markDone();
            } else if (!requester.message.done) {
                requester.markDone();
            }

            // Handle error responses
            if (requester.message.content.includes("API key not valid")) {
                root.addApiKeyAdvice(models[requester.message.model]);
            }
        }
    }

    function sendUserMessage(message) {
        if (message.length === 0) return;
        root.addMessage(message, "user");
        requester.makeRequest();
    }

    function attachFile(filePath: string) {
        root.pendingFilePath = CF.FileUtils.trimFileProtocol(filePath);
    }

    function regenerate(messageIndex) {
        if (messageIndex < 0 || messageIndex >= messageIDs.length) return;
        const id = root.messageIDs[messageIndex];
        const message = root.messageByID[id];
        if (message.role !== "assistant") return;
        // Remove all messages after this one
        for (let i = root.messageIDs.length - 1; i >= messageIndex; i--) {
            root.removeMessage(i);
        }
        requester.makeRequest();
    }

    function createFunctionOutputMessage(name, output, includeOutputInChat = true) {
        return aiMessageComponent.createObject(root, {
            "role": "user",
            "content": `[[ Output of ${name} ]]${includeOutputInChat ? ("\n\n<think>\n" + output + "\n</think>") : ""}`,
            "rawContent": `[[ Output of ${name} ]]${includeOutputInChat ? ("\n\n<think>\n" + output + "\n</think>") : ""}`,
            "functionName": name,
            "functionResponse": output,
            "thinking": false,
            "done": true,
            // "visibleToUser": false,
        });
    }

    function addFunctionOutputMessage(name, output) {
        const aiMessage = createFunctionOutputMessage(name, output);
        const id = idForMessage(aiMessage);
        root.messageIDs = [...root.messageIDs, id];
        root.messageByID[id] = aiMessage;
    }

    function rejectCommand(message: AiMessageData) {
        if (!message.functionPending) return;
        message.functionPending = false; // User decided, no more "thinking"
        addFunctionOutputMessage(message.functionName, Translation.tr("Command rejected by user"))
    }

    function approveCommand(message: AiMessageData) {
        if (!message.functionPending) return;
        message.functionPending = false; // User decided, no more "thinking"

        const responseMessage = createFunctionOutputMessage(message.functionName, "", false);
        const id = idForMessage(responseMessage);
        root.messageIDs = [...root.messageIDs, id];
        root.messageByID[id] = responseMessage;

        commandExecutionProc.message = responseMessage;
        commandExecutionProc.baseMessageContent = responseMessage.content;
        commandExecutionProc.shellCommand = message.functionCall.args.command;
        commandExecutionProc.running = true; // Start the command execution
    }

    Process {
        id: commandExecutionProc
        property string shellCommand: ""
        property AiMessageData message
        property string baseMessageContent: ""
        command: ["bash", "-c", shellCommand]
        stdout: SplitParser {
            onRead: (output) => {
                commandExecutionProc.message.functionResponse += output + "\n\n";
                const updatedContent = commandExecutionProc.baseMessageContent + `\n\n<think>\n<tt>${commandExecutionProc.message.functionResponse}</tt>\n</think>`;
                commandExecutionProc.message.rawContent = updatedContent;
                commandExecutionProc.message.content = updatedContent;
            }
        }
        onExited: (exitCode, exitStatus) => {
            commandExecutionProc.message.functionResponse += `[[ Command exited with code ${exitCode} (${exitStatus}) ]]\n`;
            requester.makeRequest(); // Continue
        }
    }

    function handleFunctionCall(name, args: var, message: AiMessageData) {
        if (name === "switch_to_search_mode") {
            const modelId = root.currentModelId;
            root.currentTool = "search"
            root.postResponseHook = () => { root.currentTool = "functions" }
            addFunctionOutputMessage(name, Translation.tr("Switched to search mode. Continue with the user's request."))
            requester.makeRequest();
        } else if (name === "get_shell_config") {
            const configJson = CF.ObjectUtils.toPlainObject(Config.options)
            addFunctionOutputMessage(name, JSON.stringify(configJson));
            requester.makeRequest();
        } else if (name === "set_shell_config") {
            if (!args.key || !args.value) {
                addFunctionOutputMessage(name, Translation.tr("Invalid arguments. Must provide `key` and `value`."));
                return;
            }
            const key = args.key;
            const value = args.value;
            Config.setNestedValue(key, value);
        } else if (name === "run_shell_command") {
            if (!args.command || args.command.length === 0) {
                addFunctionOutputMessage(name, Translation.tr("Invalid arguments. Must provide `command`."));
                return;
            }
            const contentToAppend = `\n\n**Command execution request**\n\n\`\`\`command\n${args.command}\n\`\`\``;
            message.rawContent += contentToAppend;
            message.content += contentToAppend;
            message.functionPending = true; // Use thinking to indicate the command is waiting for approval
        }
        else root.addMessage(Translation.tr("Unknown function call: %1").arg(name), "assistant");
    }

    function chatToJson() {
        return root.messageIDs.map(id => {
            const message = root.messageByID[id]
            return ({
                "role": message.role,
                "rawContent": message.rawContent,
                "fileMimeType": message.fileMimeType,
                "fileUri": message.fileUri,
                "localFilePath": message.localFilePath,
                "model": message.model,
                "thinking": false,
                "done": true,
                "annotations": message.annotations,
                "annotationSources": message.annotationSources,
                "functionName": message.functionName,
                "functionCall": message.functionCall,
                "functionResponse": message.functionResponse,
                "visibleToUser": message.visibleToUser,
            })
        })
    }

    FileView {
        id: chatSaveFile
        property string chatName: ""
        path: chatName.length > 0 ? `${Directories.aiChats}/${chatName}.json` : ""
        blockLoading: true // Prevent race conditions
    }

    /**
     * Saves chat to a JSON list of message objects.
     * @param chatName name of the chat
     */
    function saveChat(chatName) {
        chatSaveFile.chatName = chatName.trim()
        const saveContent = JSON.stringify(root.chatToJson())
        chatSaveFile.setText(saveContent)
        getSavedChats.running = true;
    }

    /**
     * Loads chat from a JSON list of message objects.
     * @param chatName name of the chat
     */
    function loadChat(chatName) {
        try {
            chatSaveFile.chatName = chatName.trim()
            chatSaveFile.reload()
            const saveContent = chatSaveFile.text()
            // console.log(saveContent)
            const saveData = JSON.parse(saveContent)
            root.clearMessages()
            root.messageIDs = saveData.map((_, i) => {
                return i
            })
            // console.log(JSON.stringify(messageIDs))
            for (let i = 0; i < saveData.length; i++) {
                const message = saveData[i];
                root.messageByID[i] = root.aiMessageComponent.createObject(root, {
                    "role": message.role,
                    "rawContent": message.rawContent,
                    "content": message.rawContent,
                    "fileMimeType": message.fileMimeType,
                    "fileUri": message.fileUri,
                    "localFilePath": message.localFilePath,
                    "model": message.model,
                    "thinking": message.thinking,
                    "done": message.done,
                    "annotations": message.annotations,
                    "annotationSources": message.annotationSources,
                    "functionName": message.functionName,
                    "functionCall": message.functionCall,
                    "functionResponse": message.functionResponse,
                    "visibleToUser": message.visibleToUser,
                });
            }
        } catch (e) {
            console.log("[AI] Could not load chat: ", e);
        } finally {
            getSavedChats.running = true;
        }
    }
}
