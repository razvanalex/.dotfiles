import { handleUIRequest } from "./uiRequestHandler";

export async function requestHandler(inputArgv: string[], res: (response: any) => void, ENABLE_WALLPAPER: boolean) {
    try {
        let argv = inputArgv;
        if (argv.length === 1 && argv[0].includes(" ")) {
            argv = argv[0].split(" ");
        }

        if (argv.length === 0) {
            return res("error: no arguments provided");
        }

        const cmd = argv[0];

        const uiHandled = await handleUIRequest(argv, res);
        if (uiHandled !== false) return;

        if (cmd === "brightness") {
            const { handleSystemRequest } = await import("services/system/requestHandler");
            const systemHandled = await handleSystemRequest(argv, res);
            if (systemHandled !== false) return;
        }

        if (cmd === "wallpaper" || (cmd && cmd.includes("wallpaper-selector")) || cmd === "theme-selector-popup") {
            const { handleWallpaperRequest } = await import("services/wallpaper/requestHandler");
            const wallpaperHandled = await handleWallpaperRequest(argv, res, ENABLE_WALLPAPER);
            if (wallpaperHandled !== false) return;
        }

        res("unknown command");
    } catch (error) {
        console.error(`Error in requestHandler: ${error}`);
        res(`error: ${error}`);
    }
}
