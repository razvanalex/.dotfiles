import Notifd from "gi://AstalNotifd";
import GLib from "gi://GLib";
import { Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { CONFIG_DIR } from "lib/constants";
import { COMPILED_STYLE_DIR, handleStyles } from "lib/styles";
import { requestHandler } from "lib/requestHandler";
import Bar from "widget/bar/Bar";
import Indicators from "widget/notifications/Indicators";
import Session from "widget/session/Session";
import SideLeft from "widget/sideleft/SideLeft";
import SideRight from "widget/sideright/SideRight";

const ENABLE_WALLPAPER = true;

app.start({
    css: `${COMPILED_STYLE_DIR}/style.css`,
    main() {
        handleStyles(true);

        const iconTheme = Gtk.IconTheme.get_for_display(
            Gdk.Display.get_default()!,
        );
        const paths = [
            GLib.get_current_dir(),
            GLib.getenv("PWD"),
            CONFIG_DIR,
            `${GLib.get_user_config_dir()}/ags`,
        ];

        for (const path of paths) {
            if (!path) continue;
            const iconPath = `${path}/assets/icons`;
            if (GLib.file_test(iconPath, GLib.FileTest.IS_DIR)) {
                iconTheme.add_search_path(iconPath);
                iconTheme.add_search_path(`${iconPath}/fluent`);
            }
        }

        const settings = Gtk.Settings.get_default();
        if (settings) {
            settings.gtk_enable_animations = true;
        }

        // Configure notification daemon to keep notifications
        const notifd = Notifd.get_default();
        notifd.set_ignore_timeout(true);

        const monitors = app.get_monitors();

        // Initialize UI synchronously to keep tracking context
        monitors.forEach((monitor, index) => {
            Bar(monitor, index);
            SideLeft(monitor, index);
            SideRight(monitor, index);
            Indicators(monitor, index);
            Session(monitor, index);
        });

        const initWallpaper = async () => {
            if (ENABLE_WALLPAPER) {
                // Initialize services
                const { default: wallpaper } = await import("services/wallpaper/Wallpaper");
                const { default: wallpaperEngine } = await import("services/wallpaper/WallpaperEngine");
                void wallpaper;
                void wallpaperEngine;

                const { default: WallpaperSelector } = await import("widget/wallpaperselector/WallpaperSelector");
                const { default: WallpaperSelectorPopup } = await import("widget/wallpaperselector/WallpaperSelectorPopup");
                const { default: ThemeSelectorPopup } = await import("widget/wallpaperselector/ThemeSelectorPopup");

                monitors.forEach((monitor, index) => {
                    WallpaperSelector(monitor, index);
                    WallpaperSelectorPopup(monitor, index);
                    ThemeSelectorPopup(monitor, index);
                });
            }
        };

        // Initialize wallpaper services and windows asynchronously
        // We defer this slightly to ensure core UI is fully initialized
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            initWallpaper().catch(err => {
                console.error("Failed to initialize wallpaper service:", err);
            });
            return GLib.SOURCE_REMOVE;
        });
    },
    requestHandler(argv, res) {
        requestHandler(argv, res, ENABLE_WALLPAPER);
    },
});
