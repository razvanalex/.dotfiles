import type { Accessor } from "ags";
import { createLibraryDataController } from "./library/controller";
import { createLibraryUi } from "./library/ui";

interface LibrarySectionProps {
	wallpaperDir: string;
	refreshSignal?: Accessor<number>;
}

export default function LibrarySection({
	wallpaperDir,
	refreshSignal,
}: LibrarySectionProps) {
	const controller = createLibraryDataController({
		wallpaperDir,
		refreshSignal,
	});
	return createLibraryUi(controller);
}
