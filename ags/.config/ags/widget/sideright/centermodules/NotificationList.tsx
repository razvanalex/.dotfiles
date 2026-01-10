import { Gtk, Gdk } from "ags/gtk4"
import { createState, createBinding } from "ags"
import Notifd from "gi://AstalNotifd"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import userOptions from "../../../lib/userOptions"
import { For } from "ags"
import { substitute } from "../../../lib/icons"

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

const getFriendlyNotifTimeString = (timeObject: number) => {
    const messageTime = GLib.DateTime.new_from_unix_local(timeObject);
    const now = GLib.DateTime.new_now_local();
    const oneMinuteAgo = now.add_seconds(-60);
    if (oneMinuteAgo && messageTime.compare(oneMinuteAgo) > 0)
        return 'Now';
    else if (messageTime.get_day_of_year() == now.get_day_of_year())
        return messageTime.format(userOptions.time.format) || "";
    else if (messageTime.get_day_of_year() == now.get_day_of_year() - 1)
        return 'Yesterday';
    else
        return messageTime.format(userOptions.time.dateFormat) || "";
}

function NotificationIcon({ notification }: { notification: Notifd.Notification }) {
    // Check for image
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

    // Check if icon exists using Astal/Gtk logic or fallback
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

function NotificationItem({ notification }: { notification: Notifd.Notification }) {
    const [revealed, setRevealed] = createState(true)
    const [expanded, setExpanded] = createState(false)

    const urgency = notification.urgency === Notifd.Urgency.CRITICAL ? "critical" :
        notification.urgency === Notifd.Urgency.NORMAL ? "normal" : "low"

    const destroyWithAnims = () => {
        setRevealed(false)
        setTimeout(() => notification.dismiss(), userOptions.animations.durationLarge)
    }

    return (
        <revealer
            revealChild={revealed}
            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
            transitionDuration={userOptions.animations.durationLarge}
        >
            <box
                class={`notif-${urgency} spacing-h-10`}
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
                            <label
                                valign={Gtk.Align.CENTER}
                                justify={Gtk.Justification.RIGHT}
                                class="txt-smaller txt-semibold"
                                label={getFriendlyNotifTimeString(notification.time)}
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
                                        onClicked={() => destroyWithAnims()}
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

export default function NotificationList() {
    const notifd = Notifd.get_default()

    // Force update notifications binding when signals fire
    const updateNotifications = () => {
        notifd.notify("notifications")
    }

    notifd.connect("notified", updateNotifications)
    notifd.connect("resolved", updateNotifications)

    // Prevent notifications from disappearing automatically
    notifd.set_ignore_timeout(true)

    const notifications = createBinding(notifd, "notifications")
    const [dndState, setDndState] = createState(notifd.get_dont_disturb())

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
            <stack
                visibleChildName={notifications.as(n => n.length > 0 ? "list" : "empty")}
                transitionType={Gtk.StackTransitionType.CROSSFADE}
                transitionDuration={userOptions.animations.durationLarge}
                vexpand
            >
                <box $type="named" name="empty" homogeneous>
                    <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="txt spacing-v-10">
                        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 txt-subtext">
                            <label class="icon-material txt-gigantic" label="notifications_active" />
                            <label class="txt-small" label="No notifications" />
                        </box>
                    </box>
                </box>
                <box $type="named" name="list" orientation={Gtk.Orientation.VERTICAL}>
                    <scrolledwindow
                        vexpand
                        hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                    >
                        <box
                            orientation={Gtk.Orientation.VERTICAL}
                            class="spacing-v-5-revealer"
                        >
                            <For each={notifications}>
                                {(n) => <NotificationItem notification={n} />}
                            </For>
                        </box>
                    </scrolledwindow>
                </box>
            </stack>
            <box class="txt spacing-h-5">
                <label
                    hexpand
                    halign={Gtk.Align.START}
                    class="txt-small margin-left-10"
                    label={notifications.as(n => n.length > 0 ? `${n.length} notifications` : "")}
                />
                <button
                    class={dndState.as(d => `sidebar-centermodules-bottombar-button ${d ? "notif-listaction-btn-enabled" : ""}`)}
                    onClicked={() => {
                        notifd.set_dont_disturb(!notifd.get_dont_disturb())
                        setDndState(notifd.get_dont_disturb())
                    }}
                >
                    <box class="spacing-h-5" halign={Gtk.Align.CENTER}>
                        <label class="icon-material txt-norm" label="notifications_paused" />
                        <label class="txt-small" label="Silence" />
                    </box>
                </button>
                <revealer
                    transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
                    transitionDuration={userOptions.animations.durationSmall}
                    revealChild={notifications.as(n => n.length > 0)}
                >
                    <button
                        class="sidebar-centermodules-bottombar-button"
                        onClicked={() => {
                            const notifs = notifd.get_notifications()
                            notifs.forEach((n, i) => {
                                setTimeout(() => n.dismiss(), userOptions.animations.choreographyDelay * i)
                            })
                        }}
                    >
                        <box class="spacing-h-5" halign={Gtk.Align.CENTER}>
                            <label class="icon-material txt-norm" label="clear_all" />
                            <label class="txt-small" label="Clear" />
                        </box>
                    </button>
                </revealer>
            </box>
        </box>
    )
}
