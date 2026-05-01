import GLib from "gi://GLib";
import app from "ags/gtk4/app";
import { handleStyles } from "lib/styles";

export async function handleUIRequest(
    argv: string[],
    res: (response: any) => void,
) {
    if (argv[0] === "handleStyles") {
        const visibleWindows: string[] = [];
        const allWindows = app.get_windows();
        for (const win of allWindows) {
            if (win.visible && win.name) {
                visibleWindows.push(win.name);
            }
        }

        handleStyles(true);

        if (visibleWindows.length > 0) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                for (const winName of visibleWindows) {
                    const win = app.get_window(winName);
                    if (win && !win.visible) {
                        win.set_visible(true);
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        return res("");
    }

    if (argv[0] === "session") {
        const monitors = app.get_monitors();
        monitors.forEach((_, index) => {
            app.toggle_window(`session${index}`);
        });
        return res("");
    }

    return false; // Not handled
}
