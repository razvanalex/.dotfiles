import type { Accessor } from "ags";
import { createLibraryDataController } from "./library/controller";
import { createLibraryUi } from "./library/ui";

interface LibrarySectionProps {
	wallpaperDir: string;
	refreshSignal?: Accessor<number>;
	searchQuery?: Accessor<string>;
}

export default function LibrarySection({
	wallpaperDir,
	refreshSignal,
	searchQuery,
}: LibrarySectionProps) {
	const controller = createLibraryDataController({
		wallpaperDir,
		refreshSignal,
		searchQuery,
	});
	return createLibraryUi(controller);
}
