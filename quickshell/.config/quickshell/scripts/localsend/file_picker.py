#!/usr/bin/env python3
"""
Portal file picker for the quickshell LocalSend panel.

Opens the XDG desktop portal file chooser and prints the picked absolute paths
to stdout, one per line. Mirrors the omarchy-file-select approach: the portal
answers a request with a D-Bus Response signal addressed ONLY to the connection
that asked, so we must hold a single Gio connection across the call and the
wait (bash / gdbus / busctl cannot do this).

Usage:
  file_picker.py [--multiple] [--directory]

Exit codes:
  0  nothing was picked (a deliberate "no selection" — caller should stay quiet)
  1  the chooser never opened (a fault — caller should notify)
"""
import argparse
import os
import sys

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

ANSWER_TIMEOUT_SEC = 600
EXIT_NOTHING_PICKED = 0
EXIT_CHOOSER_FAILED = 1


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--multiple", action="store_true")
    parser.add_argument("--directory", action="store_true")
    args, unknown = parser.parse_known_args()
    if unknown:
        print("file_picker: unknown option %s" % unknown[0], file=sys.stderr)
        return EXIT_CHOOSER_FAILED

    try:
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    except GLib.Error as e:
        print("file_picker: no session bus: %s" % e.message, file=sys.stderr)
        return EXIT_CHOOSER_FAILED

    loop = GLib.MainLoop()
    uris = []

    def on_response(_conn, _sender, path, _iface, _signal, params):
        code, results = params.unpack()
        if code == 0:
            uris.extend(results.get("uris", []))
        loop.quit()

    def subscribe(path):
        bus.signal_subscribe(
            "org.freedesktop.portal.Desktop",
            "org.freedesktop.portal.Request",
            "Response",
            path,
            None,
            Gio.DBusSignalFlags.NONE,
            on_response,
        )

    # Predicted request path from our bus name + token; subscribe before asking
    # so we never race a dialog answered immediately.
    token = "iiqs%d" % os.getpid()
    sender = bus.get_unique_name()[1:].replace(".", "_")
    predicted = "/org/freedesktop/portal/desktop/request/%s/%s" % (sender, token)
    subscribe(predicted)

    options = {
        "handle_token": GLib.Variant("s", token),
        "multiple": GLib.Variant("b", args.multiple),
    }
    if args.directory:
        options["directory"] = GLib.Variant("b", True)

    try:
        handle = bus.call_sync(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.FileChooser",
            "OpenFile",
            GLib.Variant("(ssa{sv})", ("", "Share with LocalSend", options)),
            None,
            Gio.DBusCallFlags.NONE,
            -1,
            None,
        ).unpack()[0]
    except GLib.Error as e:
        print("file_picker: chooser failed: %s" % e.message, file=sys.stderr)
        return EXIT_CHOOSER_FAILED

    if handle != predicted:
        subscribe(handle)

    GLib.timeout_add_seconds(ANSWER_TIMEOUT_SEC, loop.quit)
    loop.run()

    for uri in uris:
        try:
            print(GLib.filename_from_uri(uri)[0])
        except GLib.Error:
            continue
    return EXIT_NOTHING_PICKED


if __name__ == "__main__":
    sys.exit(main())
