import { Gtk } from "ags/gtk4";
import { execAsync } from "ags/process";
import userOptions from "../../lib/userOptions";
import Hyprland from "gi://AstalHyprland";

export function HyprlandWorkspaces() {
    const hypr = Hyprland.get_default();
    const count = userOptions.workspaces.shown;

    const switchToWorkspace = (id: number) => {
        execAsync(`hyprctl dispatch workspace ${id}`).catch(console.error);
    };

    const getWorkspaceClasses = (id: number) => {
        const fw = hypr.focusedWorkspace;
        let classes = ["bar-ws"];
        const isOccupied = hypr.get_workspace(id)?.get_clients().length > 0;
        const isActive = fw?.id === id;

        if (isOccupied || isActive) {
            classes.push("bar-ws-occupied");

            const currentId = fw?.id || 1;
            const pageIndex = Math.floor((currentId - 1) / count);
            const start = pageIndex * count + 1;
            const end = start + count - 1;

            const prevId = id - 1;
            const nextId = id + 1;

            const isPrevVisible = prevId >= start;
            const isNextVisible = nextId <= end;

            const isPrevGroupable = (isPrevVisible && hypr.get_workspace(prevId)?.get_clients().length > 0) || fw?.id === prevId;
            const isNextGroupable = (isNextVisible && hypr.get_workspace(nextId)?.get_clients().length > 0) || fw?.id === nextId;

            if (isPrevGroupable && isNextGroupable) {
                classes.push("bar-ws-occupied-middle");
            } else if (!isPrevGroupable && isNextGroupable) {
                classes.push("bar-ws-occupied-first");
            } else if (isPrevGroupable && !isNextGroupable) {
                classes.push("bar-ws-occupied-last");
            } else {
                classes.push("bar-ws-occupied-single");
            }
        }
        return classes.join(" ");
    };

    const getInnerClasses = (id: number) => {
        const fw = hypr.focusedWorkspace;
        return fw?.id === id ? "bar-ws-active" : "";
    };

    const createWorkspaceButton = (id: number) => {
        const label = new Gtk.Label({
            label: `${id}`,
            hexpand: true,
            vexpand: true,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        const innerBox = new Gtk.Box({
            hexpand: true,
            vexpand: true,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.FILL,
        });

        const innerClasses = getInnerClasses(id).split(" ").filter(c => c.length > 0);
        if (innerClasses.length > 0) {
            innerBox.set_css_classes(innerClasses);
        }
        innerBox.append(label);

        const button = new Gtk.Button();
        const classes = getWorkspaceClasses(id).split(" ").filter(c => c.length > 0);
        if (classes.length > 0) {
            button.set_css_classes(classes);
        }

        button.connect("clicked", () => switchToWorkspace(id));
        button.set_child(innerBox);

        return button;
    };

    return (
        <box
            class="bar-ws-wrapper"
            onRealize={(self) => {
                const controller = new Gtk.EventControllerScroll({
                    flags: Gtk.EventControllerScrollFlags.VERTICAL,
                });
                controller.connect("scroll", (_, _dx, dy) => {
                    const direction = dy > 0 ? "+1" : "-1";
                    execAsync(`hyprctl dispatch workspace ${direction}`).catch(console.error);
                    return true;
                });
                self.add_controller(controller);

                let currentPageIndex = -1;

                const update = () => {
                    const currentId = hypr.focusedWorkspace?.id || 1;
                    const pageIndex = Math.floor((currentId - 1) / count);

                    // Always recreate buttons to ensure styles are up to date
                    // (since we are in imperative mode and styles depend on focus)

                    const start = pageIndex * count + 1;
                    const ids = Array.from({ length: count }, (_, i) => start + i);

                    // Clear existing children
                    let child = self.get_first_child();
                    while (child) {
                        const next = child.get_next_sibling();
                        self.remove(child);
                        child = next;
                    }

                    // Append new children
                    ids.forEach(id => {
                        self.append(createWorkspaceButton(id));
                    });

                    // Update pagination state
                    currentPageIndex = pageIndex;
                };

                const id = hypr.connect("notify::focused-workspace", update);
                self.connect("destroy", () => hypr.disconnect(id));
                update(); // Initial render
            }}
        />
    );
}
