import Notifd from "gi://AstalNotifd";
import GLib from "gi://GLib";
import { Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { CONFIG_DIR } from "lib/constants";
import { requestHandler } from "lib/requestHandler";
import { COMPILED_STYLE_DIR, handleStyles } from "lib/styles";
import Bar from "widget/bar/Bar";
import Indicators from "widget/notifications/Indicators";
import Session from "widget/session/Session";
import SideLeft from "widget/sideleft/SideLeft";
import SideRight from "widget/sideright/SideRight";
import ThemeSelectorPopup from "widget/wallpaperselector/ThemeSelectorPopup";
import WallpaperSelector from "widget/wallpaperselector/WallpaperSelector";
import WallpaperSelectorPopup from "widget/wallpaperselector/WallpaperSelectorPopup";

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

        // Initialize ALL windows synchronously to ensure tracking context is maintained.
        // If some windows are slow, we optimize their internal content, but the window
        // structure must be established synchronously.
        monitors.forEach((monitor, index) => {
            Bar(monitor, index);
            Indicators(monitor, index);
            SideLeft(monitor, index);
            SideRight(monitor, index);
            Session(monitor, index);

            if (ENABLE_WALLPAPER) {
                WallpaperSelector(monitor, index);
                WallpaperSelectorPopup(monitor, index);
                ThemeSelectorPopup(monitor, index);
            }
        });
    },
    requestHandler(argv, res) {
        requestHandler(argv, res, ENABLE_WALLPAPER);
    },
});
