# AGS v2 GTK4 Wallpaper Selector - Implementation Summary

## Overview
Implemented a complete GTK4 wallpaper selector UI for AGS v2 (Astal) that allows users to browse, search, and apply wallpapers organized by themes (directories).

## Project Goal
Replace the existing rofi-based wallpaper selection scripts with a modern, integrated GTK4 UI that fits seamlessly into the AGS v2 application framework.

## Architecture

### Core Components Created

#### 1. **Wallpaper Service** (`services/Wallpaper.ts`)
- GObject-based service handling wallpaper operations
- Properties: `current-wallpaper`, `is-animating`
- Methods: `setWallpaper()`, `setRandomWallpaper()`, `getWallpapers()`, `getCurrentWallpaper()`
- Signals: `wallpaper-changed`, `wallpaper-error`
- Auto-triggers color generation script after wallpaper changes
- State persistence at `~/.config/ags/wallpaper_state.json`
- Integration with `awww` wallpaper daemon

#### 2. **Wallpaper Utilities** (`lib/wallpaper.ts` and `lib/wallpaperUtils.ts`)

**lib/wallpaper.ts**:
- Config management
- Image discovery and filtering
- Transition options handling
- Color generation triggering
- State persistence

**lib/wallpaperUtils.ts**:
- `loadThemes()` - Load theme directories
- `getCurrentTheme()` - Get current theme with fallback validation
- `updateCurrentTheme()` - Persist theme selection to `.crt_theme` file
- `fuzzyFilter()` - Fuzzy search on filenames
- `countImages()` - Count images in directory

#### 3. **UI Components**

**ImageCard.tsx** (`widget/wallpaperselector/ImageCard.tsx`)
- Individual wallpaper thumbnail display
- 16:9 aspect ratio (240x135px)
- Double-click to apply, single-click to select
- Green checkmark indicator for active wallpaper
- Hover effects with elevation

**SearchBar.tsx** (`widget/wallpaperselector/SearchBar.tsx`)
- Fuzzy search input with 300ms debouncing
- Real-time image filtering
- Placeholder: "Search..."

**ImageGrid.tsx** (`widget/wallpaperselector/ImageGrid.tsx`)
- GTK4 FlowBox for responsive grid layout
- Auto-responsive columns (2-6 based on content)
- Scrollable container
- Dynamic image card generation

**WallpaperSelector.tsx** (`widget/WallpaperSelector.tsx`)
- Main window (default 1000x700px)
- Integrates all sub-components
- Keyboard controls (Escape to close)
- Theme and image state management
- Integration with Wallpaper service

**ThemeSelector.tsx** (`widget/wallpaperselector/ThemeSelector.tsx`)
- Sidebar-based theme navigation menu (left panel)
- Folder icon (📁) indicator for each theme
- Active theme indicator (✓ checkmark) on selected theme
- Images count badge for each theme
- Darker background styling matching GNOME design
- Responsive button list with hover/active states
- Updates `.crt_theme` on selection change
- Scrollable container for many themes

#### 4. **Styling** (`scss/_wallpaper-selector.scss`)
- Material Design 3 color system integration with GNOME 3 design principles
- Uses project's color variables: `$layer0`, `$layer1`, `$onLayer1`, etc.
- Typography mixins: `@include titlefont`, `@include mainfont`
- Border radius mixins: `@include normal-rounding`, `@include large-rounding`
- Proper hover/active states matching Material UI patterns
- GTK4-compatible CSS (no flexbox/media queries)
- Dark sidebar background (mix of $layer0 and black) for premium feel
- Subtle transparency and opacity effects for hierarchy
- Primary color accents for active theme selection
- Window-level elevation and rounding for modern appearance

### Command Interface

Integrated into `app.ts` request handler:

```bash
ags request wallpaper-selector          # Toggle UI window
ags request wallpaper random             # Random wallpaper
ags request wallpaper next               # Next wallpaper (placeholder)
ags request wallpaper prev               # Previous wallpaper (placeholder)
```

## Technical Challenges & Solutions

### Challenge 1: Missing Images (0 images shown)
**Problem**: The `.crt_theme` file pointed to a non-existent nested directory structure.

**Solution**: Enhanced `getCurrentTheme()` to:
- Validate that theme directory exists
- Fall back to first available theme if not found
- Handle corrupted theme references gracefully

### Challenge 2: "Out of Tracking Context" Error
**Problem**: Creating JSX components inside async subscribe callbacks caused AGS tracking context errors.

**Solution**: 
- Refactored ImageGrid to create native GTK4 widgets directly
- Avoid JSX component generation within async contexts
- Maintained component structure but used lower-level GTK APIs

### Challenge 3: GTK4 CSS Limitations
**Problem**: Initial SCSS used CSS features not supported by GTK4 (flexbox, media queries, etc.).

**Solution**:
- Removed `display: flex`, `gap`, `justify-content` properties
- Removed `@media` queries
- Used FlowBox widget for responsive layout instead of CSS flex
- Applied sizing with GTK4-compatible properties

### Challenge 4: Material UI Integration
**Problem**: Custom hardcoded colors didn't match project's Material Design 3 theme.

**Solution**:
- Replaced all hex colors with project variables
- Applied typography mixins for consistency
- Used transition timings matching project standards
- Integrated with existing hover/active state system

## File Structure

```
widget/
├── WallpaperSelector.tsx                 # Main window
└── wallpaperselector/
    ├── ThemeSelector.tsx                # Theme dropdown
    ├── SearchBar.tsx                    # Search input
    ├── ImageCard.tsx                   # Thumbnail card
    └── ImageGrid.tsx                   # Grid container

lib/
├── wallpaper.ts                        # Core utilities
└── wallpaperUtils.ts                   # UI helpers

scss/
└── _wallpaper-selector.scss            # Material UI styling

services/
└── Wallpaper.ts                        # GObject service

Config files:
~/.config/ags/wallpaper_config.json     # Configuration
~/.config/ags/wallpaper_state.json      # State persistence
~/Pictures/Wallpapers/.crt_theme        # Current theme
```

## Features Implemented

✅ GTK4 resizable window (default 1000x700px) with rounded corners and shadow
✅ Two-pane layout (left sidebar + main content area)
✅ Theme selector sidebar with folder icons and active indicators
✅ Active theme indicator (✓ checkmark) with primary color accent
✅ Image count badge for each theme
✅ GNOME 3-style dark sidebar with premium appearance
✅ Fuzzy search functionality with debouncing
✅ Responsive image grid (2-6 columns)
✅ 16:9 aspect ratio thumbnails (240x135px) with rounded corners
✅ Active wallpaper indicator (checkmark overlay)
✅ Single-click to apply wallpaper
✅ Window stays open after applying
✅ Escape key closes window
✅ Theme persistence via `.crt_theme` file
✅ Material Design 3 theming with GNOME integration
✅ Integration with existing Wallpaper service
✅ Command-line interface via AGS request handlers
✅ Responsive layout that adapts to window size

## Key AGS v2 (Astal) Patterns Used

1. **State Management**: `createState()` for local reactive state
2. **GObject Binding**: Direct signal connections for wallpaper service updates
3. **Window Definition**: Functions taking `(monitor, index)` parameters
4. **Styling**: SCSS with project color variables and mixins
5. **Event Handling**: `EventControllerKey` for keyboard events, `GestureClick` for mouse
6. **Async Operations**: Deferred initialization via `setTimeout()` to avoid tracking context issues

## Dependencies

- **AGS v2 (Astal)**: GTK4 application framework
- **Wallpaper Service**: Manages wallpaper application via `awww` daemon
- **GObject Introspection**: For GObject-based service pattern
- **GLib**: File operations and timing

## Configuration

Default wallpaper directory: `~/Pictures/Wallpapers/`

Wallpaper themes are subdirectories containing image files (jpg, jpeg, png, gif).

Example structure:
```
~/Pictures/Wallpapers/
├── Kitty/
│   ├── kitty_dark.png
│   └── kitty_light.png
├── Kitty2/
├── ModernKali-Blue/
└── ModernKali-Red/
```

## Future Enhancements (Placeholders)

- `ags request wallpaper next` - Navigate to next wallpaper in theme
- `ags request wallpaper prev` - Navigate to previous wallpaper in theme
- Favorites/bookmarking system
- Wallpaper auto-rotation scheduler
- Wallpaper categories/tagging
- Preview animations

## Testing & Validation

✅ Window opens/closes properly
✅ Themes load and display images
✅ Fuzzy search filters correctly
✅ Wallpaper application works
✅ Theme persistence works
✅ No runtime errors in AGS logs
✅ Material UI styling applied
✅ Responsive layout works
✅ Keyboard controls functional

## Lessons Learned

1. **Async in Constructors**: Avoid `await` in component constructors; defer with `setTimeout()`
2. **GTK4 CSS**: CSS feature support is limited; use native widgets (FlowBox) for responsive layouts
3. **Component Creation Context**: Creating JSX components in subscribe callbacks causes tracking context errors
4. **Theme Fallback**: Always validate external references (theme directories) with fallbacks
5. **Material Design Integration**: Use project's color system for consistency rather than custom colors

---

**Status**: Production Ready
**Last Updated**: Feb 14, 2026
**Integration**: Fully integrated into AGS v2 with command handlers in `app.ts`
**Latest Release**: GNOME-style redesign with sidebar-based theme navigation and active theme indicators
