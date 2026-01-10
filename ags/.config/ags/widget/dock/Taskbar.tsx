import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import GLib from "gi://GLib"
import { execNoExcept } from "../../lib/proc"
import { getAllFiles, searchIcons, substitute } from "../../lib/icons"
import userOptions from "../../lib/userOptions"
import { AppButton } from "./DockComponents"

interface HyprlandClient {
  address: string
  class: string
  title: string
  workspace: { id: number }
  pid: number
}

const iconFiles = userOptions.icons.searchPaths.flatMap(path => getAllFiles(path))
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

function shouldExcludeWindow(client: HyprlandClient | null): boolean {
  if (!client) return true
  if (client.pid === -1) return true
  if (client.title.includes("win")) return true
  if (client.title === "" && client.class === "") return true
  return false
}

function getIconForClient(client: HyprlandClient): string {
  const appClass = substitute(client.class)
  const appClassLower = appClass.toLowerCase()
  
  if (cachePath[appClassLower]) {
    return cachePath[appClassLower]
  }
  
  const path = searchIcons(appClassLower, iconFiles)
  cachePath[appClassLower] = path || substitute(appClass)
  
  return cachePath[appClassLower]
}

interface TaskbarButtonData {
  address: string
  icon: string
  title: string
  class: string
  workspace: number
}

export function Taskbar() {
  const buttons = createState<TaskbarButtonData[]>([])

  function updateTaskbar() {
    const clients = getHyprlandClients()
    const newButtons: TaskbarButtonData[] = []

    for (const client of clients) {
      if (shouldExcludeWindow(client)) continue

      newButtons.push({
        address: client.address,
        icon: getIconForClient(client),
        title: client.title,
        class: client.class,
        workspace: client.workspace.id,
      })
    }

    buttons.set(newButtons)
  }

  updateTaskbar()

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    updateTaskbar()
    return true
  })

  return (
    <box class="dock-apps">
      {buttons.bind().as(btns =>
        btns.map(btn => (
          <AppButton
            key={btn.address}
            icon={btn.icon}
            tooltipText={`${btn.title} (${btn.class})`}
            onClicked={() => focusWindow(btn.address)}
          />
        ))
      )}
    </box>
  )
}
