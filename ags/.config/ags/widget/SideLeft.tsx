import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState } from "ags"
import userOptions from "../lib/userOptions"
import ChatWidget from "./sideleft/ChatWidget"
import ToolsPanel from "./sideleft/ToolsPanel"

function TabButton({ label, isActive, onClicked }: { label: string; isActive: any; onClicked: () => void }) {
    return (
        <button
            class={isActive.as((active: boolean) => active ? "sidebar-tab-button sidebar-tab-button-active" : "sidebar-tab-button")}
            onClicked={onClicked}
        >
            <label class="icon-material txt-norm" label={label} />
        </button>
    )
}

function TabView() {
    const [activeTab, setActiveTab] = createState<"chat" | "tools">("chat")

    return (
        <box orientation={Gtk.Orientation.VERTICAL} vexpand>
            <box class="sidebar-tabs spacing-h-5 group-padding">
                <TabButton
                    label="chat"
                    isActive={activeTab.as((t) => t === "chat")}
                    onClicked={() => setActiveTab("chat")}
                />
                <TabButton
                    label="build"
                    isActive={activeTab.as((t) => t === "tools")}
                    onClicked={() => setActiveTab("tools")}
                />
            </box>
            <box
                orientation={Gtk.Orientation.VERTICAL}
                vexpand
            >
                <stack
                    visibleChildName={activeTab.as((t) => t)}
                    transitionType={Gtk.StackTransitionType.CROSSFADE}
                    transitionDuration={userOptions.animations.durationSmall}
                    vexpand
                >
                    <box $type="named" name="chat" orientation={Gtk.Orientation.VERTICAL} vexpand>
                        <ChatWidget />
                    </box>
                    <box
                        $type="named"
                        name="tools"
                        orientation={Gtk.Orientation.VERTICAL}
                        valign={Gtk.Align.START}
                        halign={Gtk.Align.FILL}
                        vexpand
                    >
                        <ToolsPanel />
                    </box>
                </stack>
            </box>
        </box>
    )
}

export default function SideLeft(monitor: Gdk.Monitor, index: number = 0) {
    const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor

    console.log("Creating SideLeft window for monitor " + index)

    try {
        return (
            <window
                name={`sideleft${index}`}
                application={app}
                gdkmonitor={monitor}
                anchor={TOP | BOTTOM | LEFT}
                layer={Astal.Layer.OVERLAY}
                keymode={Astal.Keymode.ON_DEMAND}
                visible={false}
                $={(self: Gtk.Window) => {
                    console.log("SideLeft window setup " + self.name)
                    const controller = new Gtk.EventControllerKey()
                    controller.connect("key-pressed", (_, keyval) => {
                        // Close on Escape
                        if (keyval === Gdk.KEY_Escape) {
                            self.visible = false
                            return true
                        }
                        return false
                    })
                    self.add_controller(controller)
                }}
            >
                <box vexpand>
                    <button 
                        hexpand 
                        vexpand
                        css="background: transparent; border: none; box-shadow: none;"
                        onClicked={() => app.toggle_window(`sideleft${index}`)} 
                    />
                    <box 
                        orientation={Gtk.Orientation.VERTICAL}
                        class="sidebar-left spacing-v-10"
                        hexpand={false}
                    >
                        <TabView />
                    </box>
                </box>
            </window>
        )
    } catch (e) {
        console.error("Error creating SideLeft:", e)
        return <box />
    }
}
