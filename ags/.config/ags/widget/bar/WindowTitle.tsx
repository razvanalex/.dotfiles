import { Gtk } from "ags/gtk4";
import { createBinding } from "gnim";
import Hyprland from "gi://AstalHyprland";

function displayWithDefault(title: string | undefined, defaultTitle: string): string {
    return title && title.length > 0 ? title : defaultTitle;
}

export function WindowTitle(): JSX.Element {
    const hypr = Hyprland.get_default();
    const focusedClient = createBinding(hypr, "focusedClient");
    const focusedWorkspace = createBinding(hypr, "focusedWorkspace");

    const appName = focusedClient.as(client => {
        return displayWithDefault(client?.class, "Desktop");
    });
    const windowTitle = focusedWorkspace.as(fw => {
        const workspaceId = fw?.get_id() || 0;
        const windowTitle = focusedClient.as(client => client?.title).get();

        return displayWithDefault(windowTitle, `Workspace ${workspaceId}`);
    });

    return (
        <box orientation={Gtk.Orientation.VERTICAL}>
            <label
                xalign={0}
                ellipsize={3}
                maxWidthChars={50}
                class="txt-smaller bar-wintitle-topname"
                label={appName}
            />
            <label
                xalign={0}
                ellipsize={3}
                maxWidthChars={50}
                class="txt-smallie bar-wintitle-bottomname"
                label={windowTitle}
            />
        </box>
    );
}
