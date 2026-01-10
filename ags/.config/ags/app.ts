import app from "ags/gtk4/app"
import { handleStyles, COMPILED_STYLE_DIR } from "./lib/styles"
// import { startAutoDarkModeService } from "./services/darkmode"
// import { firstRunWelcome, startBatteryWarningService } from "./services/messages"
// import Crosshair from "./widget/modules/Crosshair"
import Bar from "./widget/Bar"
import SideRight from "./widget/SideRight"
import Notifd from "gi://AstalNotifd"
import Indicators from "./widget/Indicators"
import brightness from "./services/Brightness"
// import Dock from "./widget/Dock"
// import userOptions from "./lib/userOptions"

app.start({
    css: `${COMPILED_STYLE_DIR}/style.css`,
    main() {
        handleStyles(true)
        
        // Configure notification daemon to keep notifications
        const notifd = Notifd.get_default()
        notifd.set_ignore_timeout(true)

        // startAutoDarkModeService()
        // firstRunWelcome()
        // startBatteryWarningService()

        const monitors = app.get_monitors()

        monitors.forEach((monitor, index) => {
            Bar(monitor, index)
            SideRight(monitor, index)
            Indicators(monitor, index)
            // Crosshair(monitor, index)
            //
            // if (userOptions.dock.enabled) {
            //     Dock(monitor, index)
            // }
        })
    },
    requestHandler(argv: string[], res: (response: any) => void) {
        if (argv[0] == "handleStyles") {
            handleStyles(true)
            return res("ok")
        }
        
        if (argv[0] === "brightness") {
            let valStr = argv[1]
            if (valStr === "--") valStr = argv[2]
            
            const val = parseFloat(valStr)
            if (isNaN(val)) return res("invalid value: " + valStr)
            
            if (valStr.startsWith("+") || valStr.startsWith("-")) {
                brightness.screen_value += val
            } else {
                brightness.screen_value = val
            }
            return res(String(brightness.screen_value))
        }
        
        res("unknown command")
    },

})
