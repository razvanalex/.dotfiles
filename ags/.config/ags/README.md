# AGS

## Setup

Note: these should have already been installed

``` bash
sudo apt install libgjs-dev libgtk-3-dev libgtk-4-dev gobject-introspection libgirepository1.0-dev network-manager-dev libnm-dev
```

```bash
npx -y @ts-for-gir/cli generate Astal-4.0 AstalNetwork-0.1 AstalBluetooth-0.1 AstalWp-0.1 AstalNotifd-0.1 AstalHyprland-0.1 AstalTray-0.1  AstalBattery-0.1 Gtk-4.0 Gdk-4.0 GdkPixbuf-2.0 --ignoreVersionConflicts --outdir @girs -g /usr/share/gir-1.0
```

