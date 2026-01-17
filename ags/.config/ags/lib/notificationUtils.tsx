import { Gtk } from "ags/gtk4"
import Notifd from "gi://AstalNotifd"

export function isScreenshotNotification(notification: Notifd.Notification): boolean {
    return notification.summary.toLowerCase().includes('copied') || 
           notification.summary.toLowerCase().includes('screenshot')
}

export function ScreenshotNotificationIcon({ notification, expanded }: { notification: Notifd.Notification, expanded?: any }) {
    if (!isScreenshotNotification(notification) || !notification.image) {
        return null
    }

    return (
        <stack
            visibleChildName={expanded?.as ? expanded.as((e: boolean) => e ? "camera" : "preview") : "preview"}
            transitionType={Gtk.StackTransitionType.CROSSFADE}
            transitionDuration={200}
        >
            <box 
                $type="named" 
                name="preview" 
                valign={Gtk.Align.CENTER} 
                hexpand={false} 
                class="notif-icon" 
                css={`background-image: url("${notification.image}"); background-size: cover; background-repeat: no-repeat; background-position: center;`} 
            />
            <box 
                $type="named" 
                name="camera" 
                valign={Gtk.Align.CENTER} 
                hexpand={false} 
                class="notif-icon notif-icon-material-normal" 
                homogeneous
            >
                <label class="icon-material txt-huger" label="photo_camera" />
            </box>
        </stack>
    )
}

export function ScreenshotNotificationPreview({ notification, width = 300, height = 200 }: { notification: Notifd.Notification, width?: number, height?: number }) {
    if (!isScreenshotNotification(notification) || !notification.image) {
        return null
    }

    return (
        <box
            class="notif-expanded-image"
            css={`
                background-image: url("${notification.image}");
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                min-width: ${width}px;
                min-height: ${height}px;
            `}
        />
    )
}
