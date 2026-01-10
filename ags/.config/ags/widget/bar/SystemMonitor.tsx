import { Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { CircularProgress } from "./CircularProgress"

const widgets = [
    {
        "name": "cpu",
        "command": `LANG=C top -bn1 | grep Cpu | sed 's/\\,/\\./g' | awk '{printf("%.2f", $2)}'`,
        "interval": 1000,
        "tooltip": "CPU Usage",
        "icon": "developer_board"
    },
    {
        "name": "memory",
        "command": `LANG=C free | awk '/^Mem/ {printf("%.2f", ($3/$2) * 100)}'`,
        "interval": 1000,
        "tooltip": "RAM Usage",
        "icon": "memory"
    },
    {
        "name": "disk",
        "command": `LANG=C df -h / | grep -vE '^Filesystem' | awk '{printf("%.2f", $5)}'`,
        "interval": 1000,
        "tooltip": "Disk Usage",
        "icon": "storage"
    },
    {
        "name": "gpu",
        "command": `LANG=C nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | awk '{printf("%.2f", $1)}' || echo "0"`,
        "interval": 1000,
        "tooltip": "GPU Usage",
        "icon": "videogame_asset"
    },
    {
        "name": "gpu_mem",
        "command": `LANG=C nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | awk '{if ($1 > 0) printf("%.2f", ($1/$2) * 100); else print "0";}' || echo "0"`,
        "interval": 1000,
        "tooltip": "GPU Mem Usage",
        "icon": "memory"
    }
]

function ResourceIndicator({
    icon,
    command,
    interval = 1000,
    tooltip,
    circprogClass = "bar-circprog",
    iconClass = "bar-icon"
}: {
    icon: string
    command: string
    interval?: number
    tooltip: string
    circprogClass?: string
    iconClass?: string
}) {
    const data = createPoll("0", interval, ['bash', '-c', command])

    const parseValue = (d: string) => {
        const val = parseFloat(d.replace(",", "."))
        return isNaN(val) ? 0 : val
    }

    return (
        <button
            tooltipText={data.as(d => `  ${tooltip}: ${Math.round(parseValue(d))}%  `)}
            valign={Gtk.Align.CENTER}
        >
            <box homogeneous>
                <overlay>
                    <box class={iconClass} valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} homogeneous={true} css="min-width: 2rem; min-height: 2rem; background-color: transparent;">
                        <label class="icon-material txt-small" label={icon} valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} />
                    </box>
                    <CircularProgress value={data.as(parseValue)} className={circprogClass} $type="overlay" />
                </overlay>
            </box>
        </button>
    )
}

export default function SystemMonitor() {
    return (
        <box class="spacing-h-10">
            {widgets.map((widget) =>
                <ResourceIndicator
                    icon={widget.icon}
                    command={widget.command}
                    interval={widget.interval}
                    tooltip={widget.tooltip}
                    circprogClass="bar-circprog"
                    iconClass="bar-icon"
                />
            )}
        </box>
    )
}
