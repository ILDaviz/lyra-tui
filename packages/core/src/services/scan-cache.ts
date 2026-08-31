import * as fs from "fs/promises";
import * as path from "path";
import { getRepoPath, captureException } from "../helpers";

const SCAN_CACHE_VERSION = 1;

interface ScanCacheEntry {
  mtimeMs: number;
  size: number;
  data: unknown;
}

type ScanCacheMap = Record<string, Record<string, ScanCacheEntry>>;

let cacheMap: ScanCacheMap | null = null;
let loaded = false;
let dirty = false;
let flushChain: Promise<void> = Promise.resolve();

function getCacheFilePath(): string {
  return path.join(getRepoPath(), ".lyra", "scan-cache.json");
}

async function ensureLoaded(): Promise<ScanCacheMap> {
  if (loaded && cacheMap) return cacheMap;
  cacheMap = {};
  loaded = true;
  try {
    const raw = await fs.readFile(getCacheFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.version === SCAN_CACHE_VERSION &&
      parsed.entries &&
      typeof parsed.entries === "object"
    ) {
      cacheMap = parsed.entries as ScanCacheMap;
    }
  } catch {
    // Missing or corrupt cache: start fresh.
  }
  return cacheMap;
}

export interface ScanStat {
  mtimeMs: number;
  size: number;
}

export async function getCachedScan<T>(
  kind: string,
  filePath: string,
  stat: ScanStat,
): Promise<T | null> {
  const map = await ensureLoaded();
  const entry = map[kind]?.[filePath];
  if (!entry) return null;
  if (entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) return null;
  return (entry.data as T) ?? null;
}

export async function setCachedScan(
  kind: string,
  filePath: string,
  stat: ScanStat,
  data: unknown,
): Promise<void> {
  const map = await ensureLoaded();
  if (!map[kind]) map[kind] = {};
  map[kind][filePath] = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  dirty = true;
}

export async function cachedFileScan<T>(
  kind: string,
  filePath: string,
  stat: ScanStat,
  parse: () => Promise<T>,
): Promise<T> {
  const hit = await getCachedScan<T>(kind, filePath, stat);
  if (hit !== null) return hit;
  const data = await parse();
  await setCachedScan(kind, filePath, stat, data);
  return data;
}

export async function pruneScanKind(
  kind: string,
  keepPaths: Set<string>,
): Promise<void> {
  const map = await ensureLoaded();
  const entries = map[kind];
  if (!entries) return;
  let pruned = false;
  for (const p of Object.keys(entries)) {
    if (!keepPaths.has(p)) {
      delete entries[p];
      pruned = true;
    }
  }
  if (pruned) dirty = true;
}

export function flushScanCache(): Promise<void> {
  if (!loaded || !dirty || !cacheMap) return Promise.resolve();
  flushChain = flushChain.then(async () => {
    if (!dirty || !cacheMap) return;
    dirty = false;
    try {
      const cachePath = getCacheFilePath();
      const tmpPath = `${cachePath}.tmp`;
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(
        tmpPath,
        JSON.stringify({ version: SCAN_CACHE_VERSION, entries: cacheMap }),
        "utf-8",
      );
      await fs.rename(tmpPath, cachePath);
    } catch (err) {
      dirty = true;
      console.error("Failed to write scan cache:", err);
      captureException(err);
    }
  });
  return flushChain;
}

export async function clearScanCacheFile(): Promise<void> {
  cacheMap = {};
  loaded = true;
  dirty = true;
  await flushScanCache();
}

export function resetScanCacheForTests(): void {
  cacheMap = null;
  loaded = false;
  dirty = false;
  flushChain = Promise.resolve();
}
