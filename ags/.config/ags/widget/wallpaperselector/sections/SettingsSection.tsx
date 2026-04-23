import { createSettingsController } from "./settings/controller";
import { createSettingsUi } from "./settings/ui";

interface SettingsSectionProps {
    onDiscoveryChanged?: () => void;
}

export default function SettingsSection(props: SettingsSectionProps = {}) {
    const { onDiscoveryChanged } = props;
    const controller = createSettingsController({ onDiscoveryChanged });
    setTimeout(() => {
        void controller.refreshEngineState();
    }, 0);
    return createSettingsUi(controller);
}
