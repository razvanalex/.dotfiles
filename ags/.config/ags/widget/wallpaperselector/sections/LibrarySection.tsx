import type { Accessor } from "ags";
import { createLibraryDataController } from "./library/controller";
import { createLibraryUi } from "./library/ui";

interface LibrarySectionProps {
    wallpaperDir: string;
    refreshSignal?: Accessor<number>;
    isSearchVisible?: Accessor<boolean>;
}

export default function LibrarySection({
    wallpaperDir,
    refreshSignal,
    isSearchVisible,
}: LibrarySectionProps) {
    const controller = createLibraryDataController({
        wallpaperDir,
        refreshSignal,
        isSearchVisible,
    });
    return createLibraryUi(controller);
}
