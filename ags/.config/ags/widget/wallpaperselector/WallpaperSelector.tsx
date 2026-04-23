import { createState, onCleanup } from "ags";
import { Astal, Gdk, Gtk } from "ags/gtk4";
import app from "ags/gtk4/app";
import { CONFIG_DIR, PATHS } from "lib/constants";
import { loadConfig } from "services/wallpaper/utils/wallpaper";
import wallpaperEngine from "services/wallpaper/WallpaperEngine";
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
    const [isSearchVisible, setIsSearchVisible] = createState(false);

    // --- Engine State Direct Binding ---
    const [isEngineRunning, setIsEngineRunning] = createState(
        wallpaperEngine.state.isRunning,
    );

    const updateEngineState = () => {
        setIsEngineRunning(wallpaperEngine.state.isRunning);
    };

    const engineChangedId = wallpaperEngine.connect("changed", updateEngineState);

    onCleanup(() => {
        wallpaperEngine.disconnect(engineChangedId);
    });

    const handleNavChange = (section: NavSection) => {
        setNavSection(section);
    };

    // Create a regular GTK window (Movable, Rounded by WM/Theme)
    const windowName = `wallpaper-selector${index}`;
    const win = new Gtk.Window({
        application: app,
        name: windowName,
        title: "Wallpaper Selector",
        default_width: 1000,
        default_height: 700,
    });
    win.add_css_class("wallpaper-selector-window");
    
    // Minimum size
    win.set_size_request(600, 400);

    // Close on Escape
    const keyController = new Gtk.EventControllerKey();
    keyController.connect("key-pressed", (_, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
            win.visible = false;
            return true;
        }
        return false;
    });
    win.add_controller(keyController);

    const rootBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["wallpaper-selector-root"],
    });

    // --- Global HeaderBar ---
    const headerBar = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        css_classes: ["wallpaper-global-headerbar"],
    });

    // Header Left
    const headerLeft = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        halign: Gtk.Align.START,
    });
    headerLeft.set_size_request(220, -1);
    
    const searchBtn = new Gtk.Button({
        icon_name: "system-search-symbolic",
        css_classes: ["wallpaper-header-icon-btn"],
    });
    searchBtn.connect("clicked", () => {
        handleNavChange("library");
        setIsSearchVisible(!isSearchVisible.get());
    });
    headerLeft.append(searchBtn);
    headerBar.append(headerLeft);

    // Header Center
    const windowTitle = new Gtk.Label({
        label: "Wallpaper Selector",
        css_classes: ["wallpaper-header-title"],
        halign: Gtk.Align.CENTER,
        hexpand: true,
    });
    headerBar.append(windowTitle);

    // Header Right
    const headerRight = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        halign: Gtk.Align.END,
    });
    headerRight.set_size_request(220, -1);
    
    const rightSpacer = new Gtk.Box({ hexpand: true });
    headerRight.append(rightSpacer);

    const aiBtn = new Gtk.Button({
        css_classes: ["wallpaper-header-icon-btn"],
    });
    const aiIcon = new Gtk.Image({ file: `${CONFIG_DIR}/assets/icons/spark-symbolic.svg` });
    aiBtn.set_child(aiIcon);
    headerRight.append(aiBtn);

    const settingsBtn = new Gtk.Button({
        icon_name: "emblem-system-symbolic",
        css_classes: ["wallpaper-header-icon-btn"],
    });
    settingsBtn.connect("clicked", () => handleNavChange("settings"));
    headerRight.append(settingsBtn);

    const closeBtn = new Gtk.Button({
        icon_name: "window-close-symbolic",
        css_classes: ["wallpaper-header-icon-btn"],
    });
    closeBtn.connect("clicked", () => {
        win.visible = false;
    });
    headerRight.append(closeBtn);

    headerBar.append(headerRight);
    rootBox.append(headerBar);

    // Content Area
    const contentBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        hexpand: true,
        vexpand: true,
    });

    const sidebar = SidebarNav({
        activeSection: navSection,
        onSectionChange: handleNavChange,
    });
    contentBox.append(sidebar);

    const mainContentOverlay = new Gtk.Overlay({
        hexpand: true,
        vexpand: true,
    });

    const mainArea = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
        vexpand: true,
        css_classes: ["wallpaper-selector-main-area"],
    });

    // Use GObject tags to embed reactive sections
    mainArea.append(<box visible={navSection.as(s => s === "library")} hexpand vexpand>
        <LibrarySection 
            wallpaperDir={wallpaperDir} 
            isSearchVisible={isSearchVisible} 
        />
    </box> as unknown as Gtk.Widget);
    
    mainArea.append(<box visible={navSection.as(s => s === "favorites")} hexpand vexpand>
        <FavoritesSection />
    </box> as unknown as Gtk.Widget);
    
    mainArea.append(<box visible={navSection.as(s => s === "recent")} hexpand vexpand>
        <RecentSection />
    </box> as unknown as Gtk.Widget);
    
    mainArea.append(<box visible={navSection.as(s => s === "settings")} hexpand vexpand>
        <SettingsSection />
    </box> as unknown as Gtk.Widget);
    
    mainArea.append(<box visible={navSection.as(s => s === "about")} hexpand vexpand>
        <AboutSection />
    </box> as unknown as Gtk.Widget);

    mainContentOverlay.set_child(mainArea);

    // Playback pill
    const playbackPill = (
        <revealer
            transitionType={Gtk.RevealerTransitionType.SLIDE_UP}
            valign={Gtk.Align.END}
            halign={Gtk.Align.CENTER}
            margin_bottom={24}
            revealChild={true}
        >
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={8} class="wallpaper-playback-pill">
                <button
                    class="pill-btn"
                    iconName="media-skip-backward-symbolic"
                    onClicked={() => void wallpaperEngine.prev().catch(e => console.error(e))}
                />
                <button
                    class="pill-btn"
                    iconName={isEngineRunning.as(running => 
                        running ? "media-playback-pause-symbolic" : "media-playback-start-symbolic"
                    )}
                    onClicked={() => {
                        if (wallpaperEngine.state.isRunning) wallpaperEngine.stopAuto();
                        else void wallpaperEngine.startAuto().catch(e => console.error(e));
                    }}
                />
                <button
                    class="pill-btn"
                    iconName="media-skip-forward-symbolic"
                    onClicked={() => void wallpaperEngine.next().catch(e => console.error(e))}
                />
            </box>
        </revealer>
    ) as unknown as Gtk.Widget;

    mainContentOverlay.add_overlay(playbackPill);
    contentBox.append(mainContentOverlay);
    rootBox.append(contentBox);

    win.set_child(rootBox);

    return win;
}
