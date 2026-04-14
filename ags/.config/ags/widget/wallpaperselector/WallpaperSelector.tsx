import { createState } from "ags";
import { createPoll } from "ags/time";
import { Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { execAsync } from "ags/process";
import { PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import SidebarNav from "./SidebarNav";
import AboutSection from "./sections/AboutSection";
import FavoritesSection from "./sections/FavoritesSection";
import LibrarySection from "./sections/LibrarySection";
import RecentSection from "./sections/RecentSection";
import SettingsSection from "./sections/SettingsSection";
import type { NavSection } from "./types";

export default function WallpaperSelector(
	_monitor: Gdk.Monitor,
	index: number,
) {
	const configPath = PATHS.wallpaperConfig;
	const config = loadConfig(configPath);
	const wallpaperDir = config.wallpaperDir;

	const [navSection, setNavSection] = createState<NavSection>("library");

	const [discoveryRefreshSignal, setDiscoveryRefreshSignal] = createState(0);
	const [globalSearchQuery, setGlobalSearchQuery] = createState("");

	// --- Engine State Polling for Playback Pill ---
	const [isEngineRunning, setIsEngineRunning] = createState(false);
	createPoll(0, 2000, async () => {
		try {
			const result = await execAsync(["ags", "request", "wallpaper", "engine", "get"]);
			const parsed = JSON.parse(result.trim());
			setIsEngineRunning(Boolean(parsed.isRunning));
		} catch {
			setIsEngineRunning(false);
		}
		return 0; // The return value doesn't matter for the poll
	});

	const handleNavChange = (section: NavSection) => {
		setNavSection(section);
	};

	// Create a regular GTK window
	const windowName = `wallpaper-selector${index}`;
	const win = new Gtk.Window({
		application: app,
		title: "Wallpaper Selector",
		default_width: 1000,
		default_height: 700,
		hide_on_close: true,
	});
	win.set_name(windowName);
	win.add_css_class("wallpaper-selector-window");
	win.set_visible(false);

	// Minimum size
	win.set_size_request(600, 400);

	// Escape to close
	const controller = new Gtk.EventControllerKey();
	controller.connect("key-pressed", (_, keyval) => {
		if (keyval === Gdk.KEY_Escape) {
			win.set_visible(false);
			return true;
		}
		return false;
	});
	win.add_controller(controller);

	// --- Root Box (Vertical: HeaderBar + Content) ---
	const rootBox = new Gtk.Box({
		orientation: Gtk.Orientation.VERTICAL,
		css_classes: ["wallpaper-selector-root"],
	});

	// --- Global HeaderBar ---
	const headerBar = new Gtk.Box({
		orientation: Gtk.Orientation.HORIZONTAL,
		css_classes: ["wallpaper-global-headerbar"],
	});

	// Header Left: Search/Omnibar (Aligned with sidebar width)
	const searchEntry = new Gtk.SearchEntry({
		placeholder_text: "Search or ask AI...",
		hexpand: true,
	});
	searchEntry.add_css_class("wallpaper-omnibar");
	searchEntry.connect("search-changed", () => {
		setGlobalSearchQuery(searchEntry.get_text());
	});
	
	const headerLeft = new Gtk.Box({
		orientation: Gtk.Orientation.HORIZONTAL,
		spacing: 8,
		halign: Gtk.Align.START,
		hexpand: false,
	});
	headerLeft.set_size_request(220, -1);
	headerLeft.append(searchEntry);
	headerBar.append(headerLeft);

	// Header Center: Window Title
	const windowTitle = new Gtk.Label({ label: "Wallpaper Selector" });
	windowTitle.add_css_class("wallpaper-header-title");
	windowTitle.set_halign(Gtk.Align.CENTER);
	windowTitle.set_hexpand(true);
	headerBar.append(windowTitle);

	// Header Right: AI Sparkle, Settings, Close
	const headerRight = new Gtk.Box({
		orientation: Gtk.Orientation.HORIZONTAL,
		spacing: 8,
		halign: Gtk.Align.END,
		hexpand: false,
	});
	// Try to match width on right side to keep title perfectly centered
	headerRight.set_size_request(220, -1);
	
	// spacer to push icons to the right
	const rightSpacer = new Gtk.Box({ hexpand: true });
	headerRight.append(rightSpacer);
	
	const aiBtn = new Gtk.Button({ icon_name: "starred-symbolic" }); // Fallback icon for sparkle
	aiBtn.add_css_class("wallpaper-header-icon-btn");
	// AI Mock flow: when clicked, populate search and trigger AI query (to be implemented)
	aiBtn.connect("clicked", () => {
		searchEntry.set_text("AI: Find me a dark anime theme");
	});
	headerRight.append(aiBtn);

	const settingsBtn = new Gtk.Button({ icon_name: "emblem-system-symbolic" });
	settingsBtn.add_css_class("wallpaper-header-icon-btn");
	settingsBtn.connect("clicked", () => handleNavChange("settings"));
	headerRight.append(settingsBtn);

	const closeBtn = new Gtk.Button({ icon_name: "window-close-symbolic" });
	closeBtn.add_css_class("wallpaper-header-icon-btn");
	closeBtn.connect("clicked", () => win.set_visible(false));
	headerRight.append(closeBtn);
	
	headerBar.append(headerRight);

	rootBox.append(headerBar);

	// --- Content Area (Horizontal: Sidebar + Main) ---
	const contentBox = new Gtk.Box({
		orientation: Gtk.Orientation.HORIZONTAL,
		hexpand: true,
		vexpand: true,
	});

	const sidebar = SidebarNav({
		activeSection: navSection,
		onSectionChange: handleNavChange,
	});

	// --- Main Content Overlay (Main Area + Pill) ---
	const mainContentOverlay = new Gtk.Overlay();
	mainContentOverlay.set_hexpand(true);
	mainContentOverlay.set_vexpand(true);
	
	const mainArea = new Gtk.Box({
		orientation: Gtk.Orientation.VERTICAL,
		spacing: 0,
		hexpand: true,
		vexpand: true,
		css_classes: ["wallpaper-selector-main-area"],
	});

	const librarySection = LibrarySection({
		wallpaperDir,
		refreshSignal: discoveryRefreshSignal,
		searchQuery: globalSearchQuery,
	});

	const settingsSection = SettingsSection({
		onDiscoveryChanged: () => {
			setDiscoveryRefreshSignal(discoveryRefreshSignal.get() + 1);
		},
	});

	const favoritesSection = FavoritesSection();
	const recentSection = RecentSection();
	const aboutSection = AboutSection();

	mainArea.append(librarySection);
	mainArea.append(favoritesSection);
	mainArea.append(recentSection);
	mainArea.append(settingsSection);
	mainArea.append(aboutSection);

	const updateMainContentVisibility = () => {
		const section = navSection.get();

		librarySection.set_visible(section === "library");
		favoritesSection.set_visible(section === "favorites");
		recentSection.set_visible(section === "recent");
		settingsSection.set_visible(section === "settings");
		aboutSection.set_visible(section === "about");
	};

	navSection.subscribe(updateMainContentVisibility);
	updateMainContentVisibility();

	mainContentOverlay.set_child(mainArea);

	// --- Overlay for Floating Playback Pill ---
	const playbackPill = new Gtk.Revealer({
		transitionType: Gtk.RevealerTransitionType.SLIDE_UP,
		valign: Gtk.Align.END,
		halign: Gtk.Align.CENTER,
		margin_bottom: 24,
	});
	
	const pillBox = new Gtk.Box({
		orientation: Gtk.Orientation.HORIZONTAL,
		spacing: 8,
		css_classes: ["wallpaper-playback-pill"],
	});
	
	const prevBtn = new Gtk.Button({ icon_name: "media-skip-backward-symbolic" });
	prevBtn.connect("clicked", () => {
		void execAsync(["ags", "request", "wallpaper", "prev"]);
	});

	const playBtn = new Gtk.Button({ icon_name: "media-playback-pause-symbolic" }); // It's visible when running, so it pauses
	playBtn.connect("clicked", () => {
		void execAsync(["ags", "request", "wallpaper", "pause"]).then(() => {
			setIsEngineRunning(false);
		});
	});

	const nextBtn = new Gtk.Button({ icon_name: "media-skip-forward-symbolic" });
	nextBtn.connect("clicked", () => {
		void execAsync(["ags", "request", "wallpaper", "next"]);
	});
	
	[prevBtn, playBtn, nextBtn].forEach(btn => {
		btn.add_css_class("pill-btn");
		pillBox.append(btn);
	});
	
	playbackPill.set_child(pillBox);

	// Bind play button icon to engine running state
	isEngineRunning.subscribe((running) => {
		playBtn.set_icon_name(running ? "media-playback-pause-symbolic" : "media-playback-start-symbolic");
	});

	// Make pill always visible to allow starting/stopping globally
	playbackPill.set_reveal_child(true);

	mainContentOverlay.add_overlay(playbackPill);

	// Append sidebar and main content to the contentBox
	contentBox.append(sidebar);
	contentBox.append(mainContentOverlay);
	rootBox.append(contentBox);

	win.set_child(rootBox);

	return win;
}
