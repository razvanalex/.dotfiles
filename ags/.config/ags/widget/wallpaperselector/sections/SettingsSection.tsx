import { createSettingsController } from "./settings/controller"
import { createSettingsUi } from "./settings/ui"

interface SettingsSectionProps {
    onDiscoveryChanged?: () => void
}

export default function SettingsSection({
    onDiscoveryChanged,
}: SettingsSectionProps) {
    const controller = createSettingsController({ onDiscoveryChanged })
    setTimeout(() => {
        void controller.refreshEngineState()
    }, 0)
    return createSettingsUi(controller)
}
