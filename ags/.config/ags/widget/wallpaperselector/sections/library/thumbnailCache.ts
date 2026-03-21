import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import {
    WALLPAPER_CARD_WIDTH,
    WALLPAPER_CARD_IMAGE_HEIGHT,
} from "../../types"

const THUMB_WIDTH = WALLPAPER_CARD_WIDTH
const THUMB_HEIGHT = WALLPAPER_CARD_IMAGE_HEIGHT
const THUMB_SIZE_HINT = Math.max(THUMB_WIDTH, THUMB_HEIGHT)
const MAX_PARALLEL_THUMB_JOBS = Math.max(
    2,
    Math.min(8, GLib.get_num_processors()),
)
const CACHE_DIR = `${GLib.get_user_cache_dir()}/ags/wallpaper-thumbnails`
const DEBUG_THUMB_CACHE = true
const LOG_PREFIX = "[wallpaper-thumb-cache]"

let cacheDirReady = false

function logDebug(message: string) {
    if (!DEBUG_THUMB_CACHE) return
    console.log(`${LOG_PREFIX} ${message}`)
}

function errorToString(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`
    return String(error)
}

function ensureCacheDir() {
    if (cacheDirReady) return
    GLib.mkdir_with_parents(CACHE_DIR, 0o755)
    cacheDirReady = true
    logDebug(`cache dir ready: ${CACHE_DIR}`)
}

function hashString(value: string): string {
    let hash = 5381
    for (let index = 0; index < value.length; index++) {
        hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
    }
    return hash.toString(16)
}

function getThumbPath(sourcePath: string): string {
    const key = hashString(`${sourcePath}|${THUMB_WIDTH}x${THUMB_HEIGHT}|v2`)
    return `${CACHE_DIR}/${key}.png`
}

const inFlight = new Set<string>()

function createManifest(entries: Array<[string, string]>): string {
    const [ok, path] = GLib.file_open_tmp("ags-thumb-manifest-XXXXXX")
    if (!ok) return ""

    const content = entries.map(([source, target]) => `${source}\t${target}`).join("\n")
    GLib.file_set_contents(path, content)
    return path
}

function getCachedResult(sourcePath: string): string {
    ensureCacheDir()
    const target = getThumbPath(sourcePath)
    if (GLib.file_test(target, GLib.FileTest.EXISTS)) {
        return target
    }
    return ""
}

const PYTHON_BATCH_SCRIPT = String.raw`
import concurrent.futures
import json
import os
import subprocess
import sys

manifest = sys.argv[1]
size_hint = sys.argv[2]
thumb_width = sys.argv[3]
thumb_height = sys.argv[4]
workers = int(sys.argv[5])

entries = []
with open(manifest, "r", encoding="utf-8", errors="ignore") as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        entries.append((parts[0], parts[1]))

def run_cmd(args):
    return subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def worker(pair):
    src, dst = pair
    if os.path.exists(dst):
        return src, dst

    ok = run_cmd(["gdk-pixbuf-thumbnailer", "-s", str(size_hint), src, dst])
    if not ok:
        ok = run_cmd([
            "magick",
            src,
            "-auto-orient",
            "-strip",
            "-thumbnail",
            f"{thumb_width}x{thumb_height}^",
            "-gravity",
            "center",
            "-extent",
            f"{thumb_width}x{thumb_height}",
            dst,
        ])
    if not ok:
        ok = run_cmd([
            "convert",
            src,
            "-auto-orient",
            "-strip",
            "-thumbnail",
            f"{thumb_width}x{thumb_height}^",
            "-gravity",
            "center",
            "-extent",
            f"{thumb_width}x{thumb_height}",
            dst,
        ])

    if ok and os.path.exists(dst):
        return src, dst
    return src, src

result = {}
if entries:
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for src, out in pool.map(worker, entries):
            result[src] = out

print(json.dumps(result))
`

export async function primeWallpaperThumbnails(
    sourcePaths: string[],
): Promise<Record<string, string>> {
    ensureCacheDir()

    const result: Record<string, string> = {}
    const pendingEntries: Array<[string, string]> = []
    let cacheHits = 0
    let inFlightSkips = 0

    for (const sourcePath of sourcePaths) {
        if (!sourcePath) continue
        const cached = getCachedResult(sourcePath)
        if (cached) {
            result[sourcePath] = cached
            cacheHits++
            continue
        }
        if (inFlight.has(sourcePath)) {
            inFlightSkips++
            continue
        }
        inFlight.add(sourcePath)
        pendingEntries.push([sourcePath, getThumbPath(sourcePath)])
    }

    logDebug(
        `request=${sourcePaths.length} cacheHits=${cacheHits} inflightSkipped=${inFlightSkips} queued=${pendingEntries.length} workers=${MAX_PARALLEL_THUMB_JOBS}`,
    )

    if (pendingEntries.length === 0) return result

    const manifestPath = createManifest(pendingEntries)
    if (!manifestPath) {
        logDebug("manifest creation failed, skipping batch")
        for (const [sourcePath] of pendingEntries) {
            inFlight.delete(sourcePath)
        }
        return result
    }

    logDebug(`batch start queued=${pendingEntries.length}`)

    try {
        const raw = await execAsync([
            "python3",
            "-c",
            PYTHON_BATCH_SCRIPT,
            manifestPath,
            String(THUMB_SIZE_HINT),
            String(THUMB_WIDTH),
            String(THUMB_HEIGHT),
            String(MAX_PARALLEL_THUMB_JOBS),
        ])

        const parsed = JSON.parse(raw) as Record<string, string>
        let generated = 0
        let fallback = 0
        for (const [sourcePath, outPath] of Object.entries(parsed)) {
            if (!outPath) continue
            result[sourcePath] = outPath
            if (outPath === sourcePath) fallback++
            else generated++
        }
        logDebug(
            `batch done queued=${pendingEntries.length} generated=${generated} fallback=${fallback}`,
        )
    } catch (error) {
        logDebug(`batch failed: ${errorToString(error)}`)
        for (const [sourcePath] of pendingEntries) {
            result[sourcePath] = sourcePath
        }
    } finally {
        try {
            GLib.unlink(manifestPath)
        } catch {
            // no-op
        }

        for (const [sourcePath] of pendingEntries) {
            inFlight.delete(sourcePath)
        }
        logDebug(`batch cleanup completed inFlightNow=${inFlight.size}`)
    }

    return result
}
