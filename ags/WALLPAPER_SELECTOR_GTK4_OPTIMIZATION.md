# Wallpaper Selector GTK4 Optimization Report

This document summarizes the architectural overhaul of the AGS Wallpaper Selector to support high-performance browsing of thousands of images.

## 1. Architectural Shift: Native Virtualization
- **Before:** Used `Gtk.FlowBox` with a `<For>` loop. Every single image in a folder was instantiated as a widget immediately upon loading, leading to massive memory spikes and UI freezing for large libraries.
- **After:** Implemented true GTK4 virtualization using `Gtk.GridView`.
    - **Data Layer:** Switched to `Gio.ListStore` for native object management.
    - **Factory Pattern:** Used `Gtk.SignalListItemFactory` to recycle a fixed number of widgets (roughly 20-30) regardless of the total library size (10,000+).
    - **Selection Model:** Integrated `Gtk.SingleSelection` to synchronize native GTK selection with the application's reactive state.

## 2. Technical Challenges & Solutions

### GObject Property Shadowing
- **Issue:** TypeScript class fields (e.g., `preview_path!: string`) were shadowing GObject's internal property accessors, preventing the `notify::` signals from firing when state changed. This resulted in blank thumbnails.
- **Solution:** Switched to the `declare` keyword for properties in the `WallpaperItem` GObject class. This allows GJS to use its native property getters/setters while maintaining TypeScript type safety.
- **Refinement:** Standardized on bracket notation (`item["preview-path"]`) to ensure reliable property access across the GJS/C boundary.

### Circular Sizing & Layout Failures
- **Issue:** Nested `Gtk.Button > Gtk.Overlay > Gtk.Picture` structures with `hexpand/vexpand` caused circular size calculations in the GTK4 layout engine, leading to invisible items or grid rendering aborts.
- **Solution:** Flattened the hierarchy by replacing `Gtk.Button` with a simple `Gtk.Box` using a `Gtk.GestureClick` controller. This provided a stable sizing container for the `Gtk.Picture` elements.

### Image Rendering & Fallbacks
- **Issue:** Virtualization meant thumbnails were often not yet available when an item scrolled into view, resulting in blank boxes.
- **Current Behavior:** The fallback currently loads the full original high-res image (`item.id`) before cached thumbnails are ready.
- **Observed Regression:** In folders with many large images (50+), this creates bursty disk I/O and decode pressure, which can stall the UI.
- **Required Fix:** Replace full-res fallback with a lightweight placeholder and only decode:
    1. Ready thumbnail cache entries.
    2. A small, bounded set of near-viewport images (strict concurrency limit).
    3. Nothing outside the visible/prefetch window.
- **Thumbnail Hot-Swap:** Keep the `notify::preview-path` update path so visible items switch to cached thumbnails as soon as they become available.

## 3. Performance & UX Improvements
- **Fast Base Rendering:** Grid virtualization avoids widget explosion and keeps layout work bounded.
- **Memory Efficiency:** RAM usage for widgets is close to constant regardless of folder size.
- **Known Bottleneck:** Image decode bandwidth can still spike when many items fall back to full-res loads in a short interval.
- **Next Optimization Targets:** Add decode throttling, request cancellation, and viewport-only prefetch to remove large-folder hangs.
- **GIF Support:** Fixed theme previews by ensuring GIFs are correctly frame-extracted for folder thumbnails.
- **Keyboard Navigation:** Full support for Arrow keys and Enter key (Select vs. Activate) via the native Selection Model.
- **Robustness:** Added error-guarded property lookups and unhandled promise rejection handling in the thumbnail preloading queue.

## 4. Interaction Model
- **Single Click / Arrow Keys:** Selects the wallpaper and updates the "Apply" button state.
- **Double Click / Enter Key:** Instantly applies the wallpaper and triggers the system-wide update.
