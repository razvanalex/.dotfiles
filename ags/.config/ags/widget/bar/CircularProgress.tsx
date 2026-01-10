import { Gdk, Gtk } from "ags/gtk4"
import { Binding } from "ags"

function parseCSSColor(colorStr: string): { r: number, g: number, b: number, a: number } {
    const rgba = new Gdk.RGBA()
    if (rgba.parse(colorStr)) {
        return { r: rgba.red, g: rgba.green, b: rgba.blue, a: rgba.alpha }
    }
    return { r: 0.5, g: 0.5, b: 0.5, a: 0.5 }
}

function getCSSVariable(varName: string, className: string): string {
    const tempLabel = new Gtk.Label()
    tempLabel.get_style_context().add_class(className)

    const css = `* { color: var(${varName}); }`
    const provider = new Gtk.CssProvider()
    provider.load_from_data(css, -1)

    // Use a high priority to ensure this rule overrides others
    tempLabel.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    const color = tempLabel.get_style_context().get_color()
    return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

export function CircularProgress({
    value,
    className = "bar-circprog"
}: {
    value: Binding<number>
    className?: string
}) {
    const drawingArea = <drawingarea
        class={className}
        css="background-color: transparent;"
        hexpand={true}
        vexpand={true}
    /> as Gtk.DrawingArea

    const drawFunc = (area: Gtk.DrawingArea, cr: any, width: number, height: number) => {
        const progressValue = value.get() / 100.0
        const styleContext = area.get_style_context()

        // Read standard GTK color property (matches 'color' in SCSS)
        const fgColor = styleContext.get_color()

        // Resolve background color from CSS variable using a temporary widget
        let bgColor = { r: 0.2, g: 0.2, b: 0.2, a: 0.2 } // Default fallback
        try {
            const bgColorStr = getCSSVariable('--bg-color', className)
            bgColor = parseCSSColor(bgColorStr)
        } catch (e) { }

        const bg_stroke = 2.5
        const fg_stroke = 2.5
        const radius = Math.min(width, height) / 2.0 - Math.max(bg_stroke, fg_stroke) / 2.0
        const center_x = width / 2.0
        const center_y = height / 2.0
        const start_angle = -Math.PI / 2.0
        const end_angle = start_angle + (2 * Math.PI * progressValue)

        // Draw Background (Trough)
        cr.setSourceRGBA(bgColor.r, bgColor.g, bgColor.b, bgColor.a)
        cr.arc(center_x, center_y, radius, 0, 2 * Math.PI)
        cr.setLineWidth(bg_stroke)
        cr.stroke()

        if (progressValue > 0) {
            // Draw Progress
            cr.setSourceRGBA(fgColor.red, fgColor.green, fgColor.blue, fgColor.alpha)
            cr.arc(center_x, center_y, radius, start_angle, end_angle)
            cr.setLineWidth(fg_stroke)
            cr.stroke()

            // Rounded ends
            const start_x = center_x + Math.cos(start_angle) * radius
            const start_y = center_y + Math.sin(start_angle) * radius
            const end_x = center_x + Math.cos(end_angle) * radius
            const end_y = center_y + Math.sin(end_angle) * radius

            cr.setLineWidth(0)
            cr.arc(start_x, start_y, fg_stroke / 2, 0, 0 - 0.01)
            cr.fill()
            cr.arc(end_x, end_y, fg_stroke / 2, 0, 0 - 0.01)
            cr.fill()
        }
    }

    drawingArea.set_draw_func(drawFunc)

    value.subscribe(() => {
        drawingArea.queue_draw()
    })

    return drawingArea
}
