import { Gtk } from "ags/gtk4"
import type { SettingsController } from "./controller"
import SectionHeader from "../SectionHeader"

export function createSettingsUi(controller: SettingsController): Gtk.Widget {
    const container = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        vexpand: true,
        css_classes: ["wallpaper-settings-view", "wallpaper-selector-main"],
    })

    container.append(
        SectionHeader({
            title: "Settings",
            subtitle: "Automation and discovery",
        }),
    )

    const title = new Gtk.Label({ label: "Engine" })
    title.add_css_class("wallpaper-placeholder-title")
    title.set_halign(Gtk.Align.START)
    container.append(title)

    const createConfigToggle = (isOn: () => boolean, onToggle: () => void) => {
        const button = new Gtk.Button()
        button.add_css_class("txt")
        button.add_css_class("configtoggle-box")
        button.set_hexpand(false)
        button.connect("clicked", onToggle)

        const wrapper = new Gtk.Box()
        const bg = new Gtk.Box({
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END,
        })
        const fg = new Gtk.Box({
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.START,
        })

        bg.add_css_class("switch-bg")
        fg.add_css_class("switch-fg")
        bg.append(fg)
        wrapper.append(bg)
        button.set_child(wrapper)

        const update = () => {
            const enabled = isOn()
            if (enabled) {
                bg.add_css_class("switch-bg-true")
                fg.add_css_class("switch-fg-true")
            } else {
                bg.remove_css_class("switch-bg-true")
                fg.remove_css_class("switch-fg-true")
            }
        }

        update()
        return { button, update }
    }

    const searchTitle = new Gtk.Label({ label: "Discovery" })
    searchTitle.add_css_class("wallpaper-placeholder-title")
    searchTitle.set_halign(Gtk.Align.START)
    container.append(searchTitle)

    const recursiveRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-settings-row"],
    })

    const recursiveLabel = new Gtk.Label({ label: "Recursive search" })
    recursiveLabel.add_css_class("wallpaper-settings-label")
    recursiveLabel.set_hexpand(true)
    recursiveLabel.set_halign(Gtk.Align.START)
    recursiveRow.append(recursiveLabel)

    const recursiveToggle = createConfigToggle(
        () => controller.recursiveSearch.get(),
        controller.toggleRecursiveSearch,
    )
    controller.recursiveSearch.subscribe(recursiveToggle.update)
    recursiveRow.append(recursiveToggle.button)
    container.append(recursiveRow)

    const hiddenRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-settings-row"],
    })

    const hiddenLabel = new Gtk.Label({ label: "Include hidden" })
    hiddenLabel.add_css_class("wallpaper-settings-label")
    hiddenLabel.set_hexpand(true)
    hiddenLabel.set_halign(Gtk.Align.START)
    hiddenRow.append(hiddenLabel)

    const hiddenToggle = createConfigToggle(
        () => controller.includeHidden.get(),
        controller.toggleIncludeHidden,
    )
    controller.includeHidden.subscribe(hiddenToggle.update)
    hiddenRow.append(hiddenToggle.button)
    container.append(hiddenRow)

    const modeRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-settings-row"],
    })

    const modeLabel = new Gtk.Label({ label: "Automatic mode" })
    modeLabel.add_css_class("wallpaper-settings-label")
    modeLabel.set_hexpand(true)
    modeLabel.set_halign(Gtk.Align.START)
    modeRow.append(modeLabel)

    const modeToggle = createConfigToggle(
        () => controller.engineMode.get() === "automatic",
        controller.toggleEngineMode,
    )
    controller.engineMode.subscribe(modeToggle.update)
    modeRow.append(modeToggle.button)
    container.append(modeRow)

    const intervalRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-settings-row"],
    })

    const intervalEntry = new Gtk.Entry({
        text: controller.engineIntervalSeconds.get(),
        hexpand: true,
        placeholder_text: "Interval seconds",
    })
    intervalEntry.add_css_class("wallpaper-settings-entry")
    let syncingIntervalEntry = false
    intervalEntry.connect("changed", (entry) => {
        if (syncingIntervalEntry) return
        controller.setEngineIntervalText(entry.text)
    })
    controller.engineIntervalSeconds.subscribe(() => {
        const value = controller.engineIntervalSeconds.get()
        if (intervalEntry.text === value) return
        syncingIntervalEntry = true
        intervalEntry.set_text(value)
        syncingIntervalEntry = false
    })
    intervalRow.append(intervalEntry)

    const applyIntervalBtn = new Gtk.Button({ label: "Set interval" })
    applyIntervalBtn.add_css_class("wallpaper-header-button")
    applyIntervalBtn.connect("clicked", controller.applyInterval)
    intervalRow.append(applyIntervalBtn)
    container.append(intervalRow)

    const controlsRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        css_classes: ["wallpaper-settings-row"],
    })

    const startBtn = new Gtk.Button({ label: "Start automatic" })
    startBtn.add_css_class("wallpaper-header-button")
    startBtn.add_css_class("is-primary")
    startBtn.connect("clicked", controller.startAutomatic)
    controlsRow.append(startBtn)

    const stopBtn = new Gtk.Button({ label: "Stop automatic" })
    stopBtn.add_css_class("wallpaper-header-button")
    stopBtn.connect("clicked", controller.stopAutomatic)
    controlsRow.append(stopBtn)

    const updateControls = () => {
        const running = controller.engineIsRunning.get()
        startBtn.set_sensitive(!running)
        stopBtn.set_sensitive(running)
    }

    controller.engineIsRunning.subscribe(updateControls)
    updateControls()
    container.append(controlsRow)

    const statusLabel = new Gtk.Label({
        label: controller.engineStatusText.get(),
    })
    statusLabel.add_css_class("wallpaper-settings-status")
    statusLabel.set_halign(Gtk.Align.START)
    controller.engineStatusText.subscribe(() => {
        statusLabel.set_label(controller.engineStatusText.get())
    })
    container.append(statusLabel)

    return container
}
