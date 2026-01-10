import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import NotificationList from "./centermodules/NotificationList"
import AudioControls from "./centermodules/AudioControls"
import Bluetooth from "./centermodules/Bluetooth"
import WifiNetworks from "./centermodules/WifiNetworks"
import Configure from "./centermodules/Configure"
import { execAsync } from "ags/process"

const tabs = [
    { icon: "notifications", name: "Notifications", component: () => <NotificationList />, onFocus: undefined },
    { icon: "volume_up", name: "Audio controls", component: () => <AudioControls />, onFocus: undefined },
    { icon: "bluetooth", name: "Bluetooth", component: () => <Bluetooth />, onFocus: undefined },
    { icon: "wifi", name: "Wifi networks", component: () => <WifiNetworks />, onFocus: () => execAsync("nmcli dev wifi list").catch(console.error) },
    { icon: "tune", name: "Live config", component: () => <Configure />, onFocus: undefined },
]

// State for tab switching, exported for keybind access
let currentTab = 0
let setCurrentTab: (v: number) => void = () => {}

export function nextTab() {
    setCurrentTab((currentTab + 1) % tabs.length)
}

export function prevTab() {
    setCurrentTab((currentTab - 1 + tabs.length) % tabs.length)
}

export default function SidebarOptionsStack() {
    const [activeTab, setActiveTab] = createState(0)
    
    // Store references for external access
    currentTab = activeTab.get()
    setCurrentTab = (v: number) => {
        setActiveTab(v)
        currentTab = v
        if (tabs[v].onFocus) tabs[v].onFocus!()
    }
    
    // Subscribe to changes
    activeTab.subscribe(() => {
        currentTab = activeTab.get()
    })

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-group">
            <box halign={Gtk.Align.CENTER} class="sidebar-icontabswitcher">
                {tabs.map((tab, index) => (
                    <button
                        class={activeTab.as(current => `sidebar-iconbutton ${current === index ? "sidebar-button-active" : ""}`)}
                        onClicked={() => {
                            setActiveTab(index)
                            if (tab.onFocus) tab.onFocus()
                        }}
                        tooltipText={tab.name}
                    >
                        <label class="icon-material txt-norm" label={tab.icon} />
                    </button>
                ))}
            </box>
            <stack
                visibleChildName={activeTab.as(i => `tab-${i}`)}
                transitionType={Gtk.StackTransitionType.SLIDE_LEFT_RIGHT}
            >
                <box $type="named" name="tab-0"><NotificationList /></box>
                <box $type="named" name="tab-1"><AudioControls /></box>
                <box $type="named" name="tab-2"><Bluetooth /></box>
                <box $type="named" name="tab-3"><WifiNetworks /></box>
                <box $type="named" name="tab-4"><Configure /></box>
            </stack>
        </box>
    )
}
