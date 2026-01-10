import { Gtk, Gdk, Astal } from "ags/gtk4"
import app from "ags/gtk4/app"
import { createState } from "ags"
import { DockSeparator, LauncherButton } from "./dock/DockComponents"
import { PinnedApps } from "./dock/PinnedApps"
import { Taskbar } from "./dock/Taskbar"
import userOptions from "../lib/userOptions"

export default function Dock(gdkmonitor: Gdk.Monitor, index: number = 0) {
  const revealed = createState(false)
  const isPinned = createState(false)

  function PinButton() {
    return (
      <button
        class={isPinned.bind().as(p => p ? "pinned-dock-app-btn dock-app-btn-animate" : "dock-app-btn dock-app-btn-animate")}
        tooltipText="Pin Dock"
        onClicked={() => isPinned.set(!isPinned.get())}
      >
        <box class="dock-app-icon txt" homogeneous>
          <label label="󰐃" class="icon-material" />
        </box>
      </button>
    )
  }

  return (
    <window
      name={`dock${index}`}
      class="Dock"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
      application={app}
      visible={true}
    >
      <eventbox
        onHover={() => revealed.set(true)}
        onHoverLost={() => {
          if (!isPinned.get()) {
            revealed.set(false)
          }
        }}
      >
        <box
          homogeneous
          css={`min-height: ${userOptions.dock.hiddenThickness}px;`}
        >
          <revealer
            revealChild={revealed.bind()}
            transitionType={Gtk.RevealerTransitionType.SLIDE_UP}
            transitionDuration={userOptions.animations.durationLarge}
          >
            <box class="dock-bg spacing-h-5">
              <PinButton />
              <PinnedApps />
              <DockSeparator />
              <Taskbar />
              <LauncherButton onClicked={() => app.toggle_window("overview")} />
            </box>
          </revealer>
        </box>
      </eventbox>
    </window>
  )
}
