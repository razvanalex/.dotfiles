import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import GLib from "gi://GLib"
import userOptions from "../../lib/userOptions"

export function DockSeparator() {
  return (
    <box class="dock-separator" />
  )
}

interface AppButtonProps {
  icon: string
  tooltipText: string
  onClicked: () => void
  onMiddleClick?: () => void
  class?: string
}

export function AppButton({ icon, tooltipText, onClicked, onMiddleClick, class = "" }: AppButtonProps) {
  const revealed = createState(false)

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
    revealed.set(true)
    return false
  })

  return (
    <revealer
      revealChild={revealed.bind()}
      transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
      transitionDuration={userOptions.animations.durationLarge}
    >
      <button
        class={`dock-app-btn dock-app-btn-animate ${class}`}
        tooltipText={tooltipText}
        onClicked={onClicked}
        onMiddleClick={onMiddleClick}
      >
        <box>
          <overlay>
            <box class="dock-app-icon" homogeneous>
              <icon icon={icon} />
            </box>
            <box class="indicator" vpack={Gtk.Align.END} hpack={Gtk.Align.CENTER} />
          </overlay>
        </box>
      </button>
    </revealer>
  )
}

interface PinButtonProps {}

export function PinButton({}: PinButtonProps) {
  const pinned = createState(false)

  return (
    <button
      class={pinned.bind().as(p => p ? "pinned-dock-app-btn dock-app-btn-animate" : "dock-app-btn dock-app-btn-animate")}
      tooltipText="Pin Dock"
      onClicked={() => pinned.set(!pinned.get())}
    >
      <box class="dock-app-icon txt" homogeneous>
        <label label="󰐃" class="icon-material" />
      </box>
    </button>
  )
}

interface LauncherButtonProps {
  onClicked: () => void
}

export function LauncherButton({ onClicked }: LauncherButtonProps) {
  return (
    <button
      class="dock-app-btn dock-app-btn-animate"
      tooltipText="Open launcher"
      onClicked={onClicked}
    >
      <box class="dock-app-icon txt" homogeneous>
        <label label="" class="icon-material" />
      </box>
    </button>
  )
}
