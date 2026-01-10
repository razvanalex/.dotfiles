import { Gtk, Gdk } from "ags/gtk4"
import { createState, For, Binding } from "ags"
import Notifd from "gi://AstalNotifd"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import userOptions from "../../lib/userOptions"
import { substitute } from "../../lib/icons"

function guessMessageType(summary: string) {
    const str = summary.toLowerCase();
    if (str.includes('reboot')) return 'restart_alt';
    if (str.includes('recording')) return 'screen_record';
    if (str.includes('battery') || summary.includes('power')) return 'power';
    if (str.includes('screenshot')) return 'screenshot_monitor';
    if (str.includes('welcome')) return 'waving_hand';
    if (str.includes('time')) return 'schedule';
    if (str.includes('installed')) return 'download';
    if (str.includes('update')) return 'update';
    if (str.startsWith('file')) return 'folder_copy';
    return 'chat';
}

function NotificationIcon({ notification }: { notification: Notifd.Notification }) {
    if (notification.image) {
        return (
            <box
                valign={Gtk.Align.CENTER}
                hexpand={false}
                class="notif-icon"
                css={`
                    background-image: url("${notification.image}");
                    background-size: auto 100%;
                    background-repeat: no-repeat;
                    background-position: center;
                `}
            />
        )
    }

    let icon = "NO_ICON"
    if (notification.appIcon) icon = substitute(notification.appIcon)
    if (notification.appName && icon === "NO_ICON") icon = substitute(notification.appName)

    const isIcon = icon !== "NO_ICON" && (Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!).has_icon(icon) || icon.includes("/"))

    return (
        <box
            valign={Gtk.Align.CENTER}
            hexpand={false}
            class={`notif-icon notif-icon-material-${notification.urgency === Notifd.Urgency.CRITICAL ? 'critical' : notification.urgency === Notifd.Urgency.NORMAL ? 'normal' : 'low'}`}
            homogeneous
        >
            {isIcon ? (
                <image
                    valign={Gtk.Align.CENTER}
                    iconName={icon}
                />
            ) : (
                <label
                    class="icon-material txt-huger"
                    hexpand
                    label={notification.urgency === Notifd.Urgency.CRITICAL ? 'release_alert' : guessMessageType(notification.summary.toLowerCase())}
                />
            )}
        </box>
    )
}

function NotificationPopup(
    {
        notification,
        onHover,
        onRequestClose,
        onRequestHide,
        closingIds
    }: {
        notification: Notifd.Notification,
        onHover: (hovered: boolean) => void,
        onRequestClose: () => void,
        onRequestHide: () => void,
        closingIds: Binding<Set<number>>
    }
) {
    const [revealed, setRevealed] = createState(false)
    const [expanded, setExpanded] = createState(false)
    const [hovered, setHovered] = createState(false)

    const urgency = notification.urgency === Notifd.Urgency.CRITICAL ? "critical" :
        notification.urgency === Notifd.Urgency.NORMAL ? "normal" : "low"

    return (
        <revealer
            revealChild={revealed}
            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
            transitionDuration={userOptions.animations.durationLarge}
            $={(self) => {
                const isClosing = closingIds.as((s: Set<number>) => s.has(notification.id))
                const sub = isClosing.subscribe((closing: boolean) => {
                    if (closing) setRevealed(false)
                })

                // Entry animation: Slide in if not already closing
                if (!closingIds.get().has(notification.id)) {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                        if (!closingIds.get().has(notification.id)) {
                            setRevealed(true)
                        }
                        return GLib.SOURCE_REMOVE
                    })
                }

                self.connect("destroy", () => sub())
            }}
        >
            <box
                class={`popup-notif-${urgency} spacing-h-10`}
                $={(self) => {
                    // Hover Controller
                    const controller = new Gtk.EventControllerMotion()
                    controller.connect("enter", () => {
                        onHover(true)
                        setHovered(true)
                    })
                    controller.connect("leave", () => {
                        onHover(false)
                        setHovered(false)
                    })
                    self.add_controller(controller)

                    // Auto-dismiss Timer (Internal to child, just requests dismiss)
                    let sourceId: number | null = null;
                    const startTimer = () => {
                        if (sourceId) GLib.source_remove(sourceId);
                        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                            if (hovered.get() || expanded.get()) {
                                return GLib.SOURCE_CONTINUE;
                            }
                            onRequestHide();
                            sourceId = null;
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                    startTimer();

                    const expandSub = expanded.subscribe((isExpanded) => {
                        if (!isExpanded) startTimer()
                    })

                    self.connect("destroy", () => {
                        expandSub()
                        if (sourceId) {
                            GLib.source_remove(sourceId);
                            sourceId = null;
                        }
                    })
                }}
            >
                <box valign={Gtk.Align.START} homogeneous>
                    <overlay>
                        <NotificationIcon notification={notification} />
                    </overlay>
                </box>

                <box class="spacing-h-5" hexpand>
                    <box valign={Gtk.Align.CENTER} orientation={Gtk.Orientation.VERTICAL} hexpand>
                        <box>
                            <label
                                xalign={0}
                                class="txt-small txt-semibold titlefont"
                                justify={Gtk.Justification.LEFT}
                                hexpand
                                maxWidthChars={30}
                                ellipsize={Pango.EllipsizeMode.END}
                                useMarkup={notification.summary.startsWith('<')}
                                label={notification.summary}
                            />
                        </box>

                        <revealer
                            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
                            transitionDuration={userOptions.animations.durationSmall}
                            revealChild={expanded.as(e => !e)}
                        >
                            <label
                                xalign={0}
                                class={`txt-smallie notif-body-${urgency}`}
                                useMarkup
                                justify={Gtk.Justification.LEFT}
                                maxWidthChars={30}
                                ellipsize={Pango.EllipsizeMode.END}
                                label={notification.body.split("\n")[0]}
                            />
                        </revealer>

                        <revealer
                            transitionType={Gtk.RevealerTransitionType.SLIDE_UP}
                            transitionDuration={userOptions.animations.durationSmall}
                            revealChild={expanded}
                        >
                            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-10">
                                <label
                                    xalign={0}
                                    class={`txt-smallie notif-body-${urgency}`}
                                    useMarkup
                                    justify={Gtk.Justification.LEFT}
                                    maxWidthChars={30}
                                    wrap
                                    label={notification.body}
                                />
                                <box class="notif-actions spacing-h-5">
                                    <button
                                        hexpand
                                        class={`notif-action notif-action-${urgency}`}
                                        onClicked={onRequestClose}
                                    >
                                        <label label="Close" />
                                    </button>
                                    {notification.get_actions().map(action => (
                                        <button
                                            hexpand
                                            class={`notif-action notif-action-${urgency}`}
                                            onClicked={() => notification.invoke(action.id)}
                                        >
                                            <label label={action.label} />
                                        </button>
                                    ))}
                                </box>
                            </box>
                        </revealer>
                    </box>

                    <button
                        valign={Gtk.Align.START}
                        class="notif-expand-btn"
                        onClicked={() => setExpanded(!expanded.get())}
                    >
                        <label
                            class="icon-material txt-norm"
                            valign={Gtk.Align.CENTER}
                            label={expanded.as(e => e ? "expand_less" : "expand_more")}
                        />
                    </button>
                </box>
            </box>
        </revealer>
    )
}

export default function NotificationPopups(
    { notifications, closingIds, dismiss }:
        {
            notifications: Binding<Notifd.Notification[]>,
            closingIds: Binding<Set<number>>,
            dismiss: (id: number, force?: boolean) => void
        }
) {
    const state = {
        hovered: new Set<number>()
    }

    return (
        <box
            orientation={Gtk.Orientation.VERTICAL}
            class="osd-notifs spacing-v-5-revealer"
            visible={notifications.as((p: Notifd.Notification[]) => p.length > 0)}
        >
            <For each={notifications}>
                {(n: Notifd.Notification) => (
                    <NotificationPopup
                        notification={n}
                        onHover={(h) => {
                            if (h) state.hovered.add(n.id)
                            else state.hovered.delete(n.id)
                        }}
                        onRequestClose={() => {
                            n.dismiss()
                            dismiss(n.id, true)
                        }}
                        onRequestHide={() => {
                            dismiss(n.id, true)
                        }}
                        closingIds={closingIds}
                    />
                )}
            </For>
        </box>
    )
}
