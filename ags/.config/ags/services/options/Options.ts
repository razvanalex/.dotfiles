import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Logger from "lib/logger";

export interface UserOptions {
	ai: {
		defaultGPTProvider: string;
		defaultTemperature: number;
		enhancements: boolean;
		useHistory: boolean;
		safety: boolean;
		writingCursor: string;
		proxyUrl: string | null;
	};
	animations: {
		choreographyDelay: number;
		durationSmall: number;
		durationLarge: number;
	};
	appearance: {
		autoDarkMode: {
			enabled: boolean;
			from: string;
			to: string;
		};
		keyboardUseFlag: boolean;
		layerSmoke: boolean;
		layerSmokeStrength: number;
		fakeScreenRounding: number;
	};
	apps: {
		bluetooth: string;
		imageViewer: string;
		network: string;
		settings: string;
		taskManager: string;
		terminal: string;
	};
	battery: {
		low: number;
		critical: number;
		warnLevels: number[];
		warnTitles: string[];
		warnMessages: string[];
		suspendThreshold: number;
	};
	brightness: {
		controllers: Record<string, string>;
	};
	cheatsheet: {
		keybinds: {
			configPath: string;
		};
	};
	gaming: {
		crosshair: {
			size: number;
			color: string;
		};
	};
	monitors: {
		scaleMethod: string;
	};
	music: {
		preferredPlayer: string;
	};
	onScreenKeyboard: {
		layout: string;
	};
	overview: {
		scale: number;
		numOfRows: number;
		numOfCols: number;
		wsNumScale: number;
		wsNumMarginScale: number;
	};
	sidebar: {
		ai: {
			extraGptModels: Record<string, any>;
		};
		image: {
			columns: number;
			batchCount: number;
			allowNsfw: boolean;
		};
		pages: {
			order: string[];
			apis: {
				order: string[];
			};
		};
	};
	search: {
		enableFeatures: {
			actions: boolean;
			commands: boolean;
			mathResults: boolean;
			directorySearch: boolean;
			aiSearch: boolean;
			webSearch: boolean;
		};
		engineBaseUrl: string;
		excludedSites: string[];
	};
	time: {
		format: string;
		interval: number;
		dateFormatLong: string;
		dateInterval: number;
		dateFormat: string;
	};
	weather: {
		city: string;
		preferredUnit: string;
	};
	workspaces: {
		shown: number;
	};
	dock: {
		enabled: boolean;
		hiddenThickness: number;
		pinnedApps: string[];
		layer: string;
		monitorExclusivity: boolean;
		searchPinnedAppIcons: boolean;
		trigger: string[];
		autoHide: Array<{
			trigger: string;
			interval: number;
		}>;
	};
	icons: {
		searchPaths: string[];
		symbolicIconTheme: {
			dark: string;
			light: string;
		};
		substitutions: Record<string, string>;
		regexSubstitutions: Array<{
			regex: RegExp;
			replace: string;
		}>;
	};
	keybinds: {
		overview: {
			altMoveLeft: string;
			altMoveRight: string;
			deleteToEnd: string;
		};
		sidebar: {
			apis: {
				nextTab: string;
				prevTab: string;
			};
			options: {
				nextTab: string;
				prevTab: string;
			};
			pin: string;
			cycleTab: string;
			nextTab: string;
			prevTab: string;
		};
		cheatsheet: {
			keybinds: {
				nextTab: string;
				prevTab: string;
			};
			nextTab: string;
			prevTab: string;
			cycleTab: string;
		};
	};
}

const defaultOptions: UserOptions = {
	ai: {
		defaultGPTProvider: "ollama",
		defaultTemperature: 0.9,
		enhancements: true,
		useHistory: true,
		safety: true,
		writingCursor: " ...",
		proxyUrl: null,
	},
	animations: {
		choreographyDelay: 35,
		durationSmall: 110,
		durationLarge: 180,
	},
	appearance: {
		autoDarkMode: {
			enabled: false,
			from: "18:10",
			to: "6:10",
		},
		keyboardUseFlag: false,
		layerSmoke: false,
		layerSmokeStrength: 0.2,
		fakeScreenRounding: 1,
	},
	apps: {
		bluetooth: "blueman-manager",
		imageViewer: "loupe",
		network:
			"bash -c 'XDG_CURRENT_DESKTOP=\"gnome\" gnome-control-center wifi'",
		settings: "bash -c 'XDG_CURRENT_DESKTOP=\"gnome\" gnome-control-center'",
		taskManager: "gnome-system-monitor",
		terminal: "kitty",
	},
	battery: {
		low: 20,
		critical: 10,
		warnLevels: [20, 15, 5],
		warnTitles: ["Low battery", "Very low battery", "Critical Battery"],
		warnMessages: [
			"Plug in the charger",
			"You there?",
			"PLUG THE CHARGER ALREADY",
		],
		suspendThreshold: 3,
	},
	brightness: {
		controllers: {
			default: "auto",
		},
	},
	cheatsheet: {
		keybinds: {
			configPath: "",
		},
	},
	gaming: {
		crosshair: {
			size: 20,
			color: "rgba(113,227,32,0.9)",
		},
	},
	monitors: {
		scaleMethod: "division",
	},
	music: {
		preferredPlayer: "plasma-browser-integration",
	},
	onScreenKeyboard: {
		layout: "qwerty_full",
	},
	overview: {
		scale: 0.18,
		numOfRows: 2,
		numOfCols: 5,
		wsNumScale: 0.09,
		wsNumMarginScale: 0.07,
	},
	sidebar: {
		ai: {
			extraGptModels: {
				oxygen3: {
					name: "Oxygen (GPT-3.5)",
					logo_name: "ai-oxygen-symbolic",
					description:
						"An API from Tornado Softwares\nPricing: Free: 100/day\nRequires you to join their Discord for a key",
					base_url: "https://app.oxyapi.uk/v1/chat/completions",
					key_get_url: "https://discord.com/invite/kM6MaCqGKA",
					key_file: "oxygen_key.txt",
					model: "gpt-3.5-turbo",
				},
			},
		},
		image: {
			columns: 2,
			batchCount: 20,
			allowNsfw: false,
		},
		pages: {
			order: ["apis", "tools"],
			apis: {
				order: ["gpt", "gemini"],
			},
		},
	},
	search: {
		enableFeatures: {
			actions: true,
			commands: true,
			mathResults: true,
			directorySearch: true,
			aiSearch: true,
			webSearch: true,
		},
		engineBaseUrl: "https://www.google.com/search?q=",
		excludedSites: ["quora.com"],
	},
	time: {
		format: "%H:%M",
		interval: 5000,
		dateFormatLong: "%A, %d/%m",
		dateInterval: 5000,
		dateFormat: "%d/%m",
	},
	weather: {
		city: "Bucharest",
		preferredUnit: "C",
	},
	workspaces: {
		shown: 10,
	},
	dock: {
		enabled: true,
		hiddenThickness: 5,
		pinnedApps: ["firefox", "org.gnome.Nautilus"],
		layer: "top",
		monitorExclusivity: true,
		searchPinnedAppIcons: false,
		trigger: ["client-added", "client-removed"],
		autoHide: [
			{
				trigger: "client-added",
				interval: 500,
			},
			{
				trigger: "client-removed",
				interval: 500,
			},
		],
	},
	icons: {
		searchPaths: [""],
		symbolicIconTheme: {
			dark: "Adwaita",
			light: "Adwaita",
		},
		substitutions: {
			"code-url-handler": "visual-studio-code",
			Code: "visual-studio-code",
			"GitHub Desktop": "github-desktop",
			"Minecraft* 1.20.1": "minecraft",
			"gnome-tweaks": "org.gnome.tweaks",
			"pavucontrol-qt": "pavucontrol",
			wps: "wps-office2019-kprometheus",
			wpsoffice: "wps-office2019-kprometheus",
			vivaldi: "vivaldi-stable",
			"playback * vivaldi": "vivaldi-stable",
			"": "image-missing",
		},
		regexSubstitutions: [
			{
				regex: /^steam_app_(\d+)$/,
				replace: "steam_icon_$1",
			},
			{
				regex: /playback\s*[•.*]\s*vivaldi/i,
				replace: "vivaldi-stable",
			},
		],
	},
	keybinds: {
		overview: {
			altMoveLeft: "Ctrl+b",
			altMoveRight: "Ctrl+f",
			deleteToEnd: "Ctrl+k",
		},
		sidebar: {
			apis: {
				nextTab: "Page_Down",
				prevTab: "Page_Up",
			},
			options: {
				nextTab: "Page_Down",
				prevTab: "Page_Up",
			},
			pin: "Ctrl+p",
			cycleTab: "Ctrl+Tab",
			nextTab: "Ctrl+Page_Down",
			prevTab: "Ctrl+Page_Up",
		},
		cheatsheet: {
			keybinds: {
				nextTab: "Page_Down",
				prevTab: "Page_Up",
			},
			nextTab: "Ctrl+Page_Down",
			prevTab: "Ctrl+Page_Up",
			cycleTab: "Ctrl+Tab",
		},
	},
};

class OptionsService extends GObject.Object {
	static {
		GObject.registerClass(
			{
				Signals: {
					changed: {},
				},
			},
			OptionsService,
		);
	}

	private _options: UserOptions = defaultOptions;

	constructor() {
		super();
		this.load();
	}

	private load() {
		try {
			const _userOverridesPath = `${GLib.get_user_config_dir()}/ags/user_options.ts`;
			// Note: In v2, dynamic imports work differently. For now, using defaults.
			// Users can modify this file directly or create a separate override mechanism
			Logger.info("Using default options");
		} catch (_e) {
			Logger.info("Using default options");
		}
	}

	get options() {
		return this._options;
	}

	// Proxy properties for easier access
	get ai() {
		return this._options.ai;
	}
	get animations() {
		return this._options.animations;
	}
	get appearance() {
		return this._options.appearance;
	}
	get apps() {
		return this._options.apps;
	}
	get battery() {
		return this._options.battery;
	}
	get brightness() {
		return this._options.brightness;
	}
	get cheatsheet() {
		return this._options.cheatsheet;
	}
	get gaming() {
		return this._options.gaming;
	}
	get monitors() {
		return this._options.monitors;
	}
	get music() {
		return this._options.music;
	}
	get onScreenKeyboard() {
		return this._options.onScreenKeyboard;
	}
	get overview() {
		return this._options.overview;
	}
	get sidebar() {
		return this._options.sidebar;
	}
	get search() {
		return this._options.search;
	}
	get time() {
		return this._options.time;
	}
	get weather() {
		return this._options.weather;
	}
	get workspaces() {
		return this._options.workspaces;
	}
	get dock() {
		return this._options.dock;
	}
	get icons() {
		return this._options.icons;
	}
	get keybinds() {
		return this._options.keybinds;
	}

	update(newOptions: Partial<UserOptions>) {
		this._options = { ...this._options, ...newOptions };
		this.emit("changed");
	}
}

const service = new OptionsService();
export default service;
