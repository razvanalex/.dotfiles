import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import userOptions from "../../lib/userOptions"

export default function Crosshair(gdkmonitor: Gdk.Monitor, index: number = 0) {
  const { size, color } = userOptions.gaming.crosshair

  return (
    <window
      name={`crosshair${index}`}
      gdkmonitor={gdkmonitor}
      layer={Astal.Layer.OVERLAY}
      exclusivity={Astal.Exclusivity.IGNORE}
      visible={false}
      application={app}
    >
      <box valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER}>
        <label
          label="+"
          css={`
            font-size: ${size}px;
            color: ${color};
            font-weight: bold;
          `}
        />
      </box>
    </window>
  )
}
