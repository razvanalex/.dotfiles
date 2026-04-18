import { handleUIRequest } from "./uiRequestHandler";

export async function requestHandler(argv: string[], res: (response: any) => void, ENABLE_WALLPAPER: boolean) {
    const uiHandled = await handleUIRequest(argv, res);
    if (uiHandled !== false) return;

    if (argv[0] === "brightness") {
        const { handleSystemRequest } = await import("services/system/requestHandler");
        const systemHandled = await handleSystemRequest(argv, res);
        if (systemHandled !== false) return;
    }

    if (argv[0] === "wallpaper" || argv[0].includes("wallpaper-selector") || argv[0] === "theme-selector-popup") {
        const { handleWallpaperRequest } = await import("services/wallpaper/requestHandler");
        const wallpaperHandled = await handleWallpaperRequest(argv, res, ENABLE_WALLPAPER);
        if (wallpaperHandled !== false) return;
    }

    res("unknown command");
}
