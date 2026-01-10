import GLib from "gi://GLib"
import app from "ags/gtk4/app"
import { exec } from "ags/process"
import { execBash } from "../lib/proc"
import { writeFile } from "ags/file"
import { darkMode } from "./system"
import userOptions from "./userOptions"

export const COMPILED_STYLE_DIR = `${GLib.get_user_cache_dir()}/ags/user/generated`

export function handleStyles(resetMusic: boolean = false) {
    // Reset
    exec(`mkdir -p "${GLib.get_user_state_dir()}/ags/scss"`)
    if (resetMusic) {
        exec(`bash -c 'echo "" > ${GLib.get_user_state_dir()}/ags/scss/_musicwal.scss'`)
        exec(`bash -c 'echo "" > ${GLib.get_user_state_dir()}/ags/scss/_musicmaterial.scss'`)
    }

    // Generate overrides
    const lightdark = darkMode.get() ? "dark" : "light"
    const symbolicIconTheme = userOptions.icons.symbolicIconTheme[lightdark as "dark" | "light"]

    const mixinOverrides = `@mixin symbolic-icon {
    --gtk-icon-theme-name: '${symbolicIconTheme}';
}
`

    try {
        const path = `${GLib.get_user_state_dir()}/ags/scss/_mixin_overrides.scss`
        writeFile(path, mixinOverrides)

        console.log("Mixin overrides written to", path)
    } catch (e) {
        console.error("Failed to write mixin overrides:", e)
    }

    // Compile and apply
    applyStyle()
}

async function applyStyle() {
    try {
        const configDir = GLib.get_user_config_dir()
        const stateDir = GLib.get_user_state_dir()

        exec(`mkdir -p ${COMPILED_STYLE_DIR}`)
        execBash(
            `sass -I "${stateDir}/ags/scss" ` +
            `"${configDir}/ags/scss/main.scss" ` +
            `"${COMPILED_STYLE_DIR}/style.css"`,
            [{
                "name": "PATH",
                "value": "${PATH}:/home/razvan/.nvm/versions/node/v24.11.1/bin"
            }]
        )

        app.reset_css()
        app.apply_css(`${COMPILED_STYLE_DIR}/style.css`)
        console.log("[LOG] Styles loaded:", `${COMPILED_STYLE_DIR}/style.css`)
    } catch (e) {
        console.error("Failed to apply styles:", e)
    }
}
