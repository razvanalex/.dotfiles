import app from "ags/gtk4/app";
import { Astal, Gtk, Gdk } from "ags/gtk4";
import { createState } from "ags";
import Notifd from "gi://AstalNotifd";
import GLib from "gi://GLib";
import userOptions from "../lib/userOptions";
import MusicControls from "./indicators/MusicControls";
import NotificationPopups from "./indicators/NotificationPopups";

export default function Indicators(gdkmonitor: Gdk.Monitor, index: number = 0) {
  const { TOP } = Astal.WindowAnchor;
  const notifd = Notifd.get_default();
  
  const [notifications, setNotifications] = createState<Notifd.Notification[]>([]);
  const [closingIds, setClosingIds] = createState<Set<number>>(new Set());

  const dismiss = (id: number, force = false) => {
    if (closingIds.get().has(id)) return;
    
    const nextClosing = new Set(closingIds.get());
    nextClosing.add(id);
    setClosingIds(nextClosing);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, userOptions.animations.durationLarge + 50, () => {
      setNotifications(notifications.get().filter(n => n.id !== id));
      const finalClosing = new Set(closingIds.get());
      finalClosing.delete(id);
      setClosingIds(finalClosing);
      return GLib.SOURCE_REMOVE;
    });
  };

  notifd.connect("notified", (_, id, replaced) => {
    if (notifd.dont_disturb) return;
    const n = notifd.get_notification(id);
    if (!n) return;

    const ns = notifications.get();
    const idx = ns.findIndex(x => x.id === id);

    if (replaced && idx !== -1) {
      const next = [...ns];
      next[idx] = n;
      setNotifications(next);
    } else {
      const next = [n, ...ns];
      const active = next.filter(x => !closingIds.get().has(x.id));
      if (active.length > 5) {
        dismiss(active[active.length - 1].id, true);
      }
      setNotifications(next);
    }
  });

  notifd.connect("resolved", (_, id) => {
    dismiss(id, true);
  });

  return (
    <window
      visible={notifications.as(ns => ns.length > 0)}
      name={`indicator${index}`}
      class="Indicator"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP}
      layer={Astal.Layer.OVERLAY}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} class="osd-window">
        <MusicControls />
        <NotificationPopups 
            notifications={notifications} 
            closingIds={closingIds} 
            dismiss={dismiss} 
        />
      </box>
    </window>
  );
}
