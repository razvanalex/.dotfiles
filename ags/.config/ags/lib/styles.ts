import GLib from "gi://GLib";
import Gio from "gi://Gio";
import app from "ags/gtk4/app";
import { execAsync } from "ags/process";
import userOptions from "services/options/Options";
import SystemService from "services/system/System";
import Logger from "./logger";

export const COMPILED_STYLE_DIR = `${GLib.get_user_cache_dir()}/ags/user/generated`;

async function writeFileAsync(path: string, content: string): Promise<void> {
    try {
        // For small configuration and state files, synchronous write is extremely fast
        // and avoids the 'buffer != NULL' Gio async errors.
        GLib.file_set_contents(path, content);
    } catch (e) {
        throw new Error(`Failed to write to ${path}: ${e}`);
    }
}

let isStyleApplying = false;
let pendingStyleApply = false;

export function handleStyles(resetMusic: boolean = false) {
    if (isStyleApplying) {
        pendingStyleApply = true;
        return;
    }

    isStyleApplying = true;
    
    // Run the style generation in background to avoid blocking
    void (async () => {
        try {
            const stateDir = GLib.get_user_state_dir();
            
            // Create directory if missing
            await execAsync(["mkdir", "-p", `${stateDir}/ags/scss`]).catch(() => {});

            if (resetMusic) {
                try {
                    await Promise.all([
                        writeFileAsync(`${stateDir}/ags/scss/_musicwal.scss`, ""),
                        writeFileAsync(`${stateDir}/ags/scss/_musicmaterial.scss`, ""),
                    ]);
                } catch (e) {
                    Logger.error("Failed to reset music styles:", e);
                }
            }

            // Generate overrides
            const lightdark = SystemService.dark_mode ? "dark" : "light";
            const symbolicIconTheme =
                userOptions.icons.symbolicIconTheme[lightdark as "dark" | "light"];

            const mixinOverrides = `@mixin symbolic-icon {
    --gtk-icon-theme-name: '${symbolicIconTheme}';
}
`;

            const path = `${stateDir}/ags/scss/_mixin_overrides.scss`;
            try {
                await writeFileAsync(path, mixinOverrides);
                Logger.info("Mixin overrides written to", path);
            } catch (e) {
                Logger.error("Failed to write mixin overrides:", e);
            }

            // Compile and apply
            await applyStyle();
        } catch (e) {
            Logger.error("Error in handleStyles:", e);
        } finally {
            isStyleApplying = false;
            if (pendingStyleApply) {
                pendingStyleApply = false;
                handleStyles(false);
            }
        }
    })();
}

async function applyStyle() {
    try {
        const configDir = GLib.get_user_config_dir();
        const stateDir = GLib.get_user_state_dir();

        await execAsync(["mkdir", "-p", COMPILED_STYLE_DIR]).catch(() => {});
        
        // Find node path to ensure sass (which often uses #!/usr/bin/env node) can find it
        const home = GLib.get_home_dir();
        // Try common NVM locations
        const nvmBin = `${home}/.nvm/versions/node/v24.11.1/bin`;
        const currentPath = GLib.getenv("PATH") || "";
        const nodePath = `${nvmBin}:/usr/local/bin:/usr/bin:/bin`;
        const combinedPath = `${currentPath}:${nodePath}`;

        try {
            // Use absolute path to sass if possible, or assume it's in PATH
            await execAsync([
                "bash", "-c",
                `export PATH="${combinedPath}"; sass -I "${stateDir}/ags/scss" "${configDir}/ags/scss/main.scss" "${COMPILED_STYLE_DIR}/style.css"`
            ]);
        } catch (e: any) {
            // execAsync error might be an object with output
            const errorMsg = e.output || e.message || String(e);
            Logger.error(`SASS compilation failed: ${errorMsg}`);
            return;
        }

        // app.reset_css(); // REMOVED: reset_css() is too aggressive and causes flicker. 
        // GTK4 will correctly apply the new CSS on top of the old one if it's the same provider.
        app.apply_css(`${COMPILED_STYLE_DIR}/style.css`);
        Logger.info("Styles loaded:", `${COMPILED_STYLE_DIR}/style.css`);
    } catch (e) {
        Logger.error("Failed to apply styles:", e);
    }
}
