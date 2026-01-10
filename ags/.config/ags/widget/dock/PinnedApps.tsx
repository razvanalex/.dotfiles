import Gio from "gi://Gio"
import GLib from "gi://GLib"
import { execNoExcept } from "../../lib/proc"
import { getAllFiles, searchIcons } from "../../lib/icons"
import { substitute } from "../../lib/icons"
import userOptions from "../../lib/userOptions"
import { AppButton } from "./DockComponents"

interface HyprlandClient {
  address: string
  class: string
  title: string
  workspace: { id: number }
}

const iconFiles = userOptions.icons.searchPaths
  .flatMap(path => getAllFiles(path))

const cachePath: Record<string, string> = {}

function focusWindow(address: string) {
  execNoExcept(`hyprctl dispatch focuswindow address:${address}`)
}

function getHyprlandClients(): HyprlandClient[] {
  try {
    const output = execNoExcept("hyprctl clients -j")
    if (output) {
      return JSON.parse(output)
    }
  } catch (e) {
    console.error("Failed to get Hyprland clients:", e)
  }
  return []
}

function launchApp(desktopId: string) {
  const appInfo = Gio.DesktopAppInfo.new(desktopId)
  if (appInfo) {
    try {
      appInfo.launch([], null)
    } catch (e) {
      console.error(`Failed to launch ${desktopId}:`, e)
    }
  }
}

function getAppIcon(appName: string): string {
  const appInfo = Gio.DesktopAppInfo.new(appName)
  if (appInfo) {
    const icon = appInfo.get_icon()
    if (icon) {
      return icon.to_string()
    }
  }
  
  if (userOptions.dock.searchPinnedAppIcons) {
    return searchIcons(appName, iconFiles)
  }
  
  return appName
}

export function PinnedApps() {
  const pinnedApps = userOptions.dock.pinnedApps

  return (
    <box class="dock-apps" homogeneous>
      {pinnedApps.map(appName => {
        const icon = getAppIcon(appName)
        
        return (
          <AppButton
            icon={icon}
            tooltipText={appName}
            onClicked={() => {
              const clients = getHyprlandClients()
              const running = clients.find(client =>
                client.class.toLowerCase().includes(appName.toLowerCase())
              )
              
              if (running) {
                focusWindow(running.address)
              } else {
                launchApp(appName)
              }
            }}
            onMiddleClick={() => launchApp(appName)}
          />
        )
      })}
    </box>
  )
}
