import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { scanTodos, scanTodosForFile } from "../src/services/todos-service";
import { getLinks, scanLinksForFile } from "../src/services/links-service";
import { listNotes } from "../src/services/notes-service";
import { createFolder } from "../src/services/folders-service";
import {
  getCachedScan,
  setCachedScan,
  clearScanCacheFile,
  flushScanCache,
  resetScanCacheForTests,
} from "../src/services/scan-cache";
import { resetServices } from "../src/helpers";

let tmpRepo = "";
let cacheDir = "";
let cachePath = "";

describe("Scan Cache (incremental vault scanning)", () => {
  beforeAll(async () => {
    tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), "lyra-scan-cache-"));
    cacheDir = path.join(tmpRepo, "CacheDir");
    cachePath = path.join(tmpRepo, ".lyra", "scan-cache.json");
    process.env.LYRA_REPO_PATH = tmpRepo;
    process.env.LYRA_CLI_MODE = "1";
    resetServices();
    resetScanCacheForTests();
    await createFolder("CacheDir");
    await fs.writeFile(
      path.join(cacheDir, "tasks.md"),
      "# Tasks\n- [ ] First task #alpha\n- [x] Done task\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(cacheDir, "readme.md"),
      "# Readme\nSome intro text here with [docs](https://example.com) link.\n",
      "utf-8",
    );
  });

  afterAll(async () => {
    resetScanCacheForTests();
    resetServices();
    delete process.env.LYRA_REPO_PATH;
    delete process.env.LYRA_CLI_MODE;
    await fs.rm(tmpRepo, { recursive: true, force: true }).catch(() => {});
  });

  it("scanTodos returns todos and writes the cache file", async () => {
    const todos = await scanTodos();
    const texts = todos.map((t) => t.text);
    expect(texts).toContain("First task");
    expect(texts).toContain("Done task");

    const raw = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    expect(raw.version).toBe(1);
    expect(
      Object.keys(raw.entries.todos ?? {}).some((p) => p.endsWith("tasks.md")),
    ).toBe(true);
  });

  it("second scan serves from cache without re-reading files", async () => {
    const tasksPath = path.join(cacheDir, "tasks.md");
    const stat = await fs.stat(tasksPath);
    const entry = await getCachedScan<any>("todos", tasksPath, stat);
    expect(entry).not.toBeNull();
    expect(entry.length).toBe(2);

    entry[0].text = "SENTINEL_FROM_CACHE";
    await setCachedScan("todos", tasksPath, stat, entry);

    const todos = await scanTodos();
    expect(todos.map((t) => t.text)).toContain("SENTINEL_FROM_CACHE");
  });

  it("editing a note invalidates the cached todos", async () => {
    await new Promise((r) => setTimeout(r, 10));
    const tasksPath = path.join(cacheDir, "tasks.md");
    await fs.writeFile(
      tasksPath,
      "# Tasks\n- [ ] First task #alpha\n- [ ] Brand new task\n",
      "utf-8",
    );

    const todos = await scanTodos();
    const texts = todos.map((t) => t.text);
    expect(texts).toContain("Brand new task");
    expect(texts).toContain("First task");
    expect(texts).not.toContain("Done task");
    expect(texts).not.toContain("SENTINEL_FROM_CACHE");
  });

  it("deleting a note prunes its cache entries", async () => {
    await fs.rm(path.join(cacheDir, "tasks.md"));

    const todos = await scanTodos();
    expect(todos.map((t) => t.text)).not.toContain("First task");

    const raw = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    expect(
      Object.keys(raw.entries.todos ?? {}).some((p) => p.endsWith("tasks.md")),
    ).toBe(false);
  });

  it("listNotes caches title and snippet per folder", async () => {
    const notes = await listNotes("CacheDir");
    const readme = notes.find((n) => n.filename === "readme.md");
    expect(readme?.title).toBe("Readme");
    expect(readme?.snippet).toContain("Some intro text");

    const readmePath = path.join(cacheDir, "readme.md");
    const stat = await fs.stat(readmePath);
    const cacheKind = `notes:${cacheDir}`;
    const cached = await getCachedScan<any>(cacheKind, readmePath, stat);
    expect(cached).not.toBeNull();
    cached.title = "SENTINEL_TITLE";
    await setCachedScan(cacheKind, readmePath, stat, cached);

    const again = await listNotes("CacheDir");
    expect(again.find((n) => n.filename === "readme.md")?.title).toBe(
      "SENTINEL_TITLE",
    );
  });

  it("getLinks caches extracted links per note", async () => {
    const links = await getLinks();
    const docLink = links.find(
      (l) => !l.isManual && l.url === "https://example.com",
    );
    expect(docLink).toBeDefined();
    expect(docLink?.noteTitle).toBe("Readme");
    expect(docLink?.folderName).toBe("CacheDir");

    const readmePath = path.join(cacheDir, "readme.md");
    const stat = await fs.stat(readmePath);
    const cached = await getCachedScan<any>("links", readmePath, stat);
    expect(cached).not.toBeNull();
    cached.noteTitle = "SENTINEL_LINK_NOTE";
    await setCachedScan("links", readmePath, stat, cached);

    const again = await getLinks();
    expect(again.find((l) => l.url === "https://example.com")?.noteTitle).toBe(
      "SENTINEL_LINK_NOTE",
    );
  });

  it("clearScanCacheFile empties all entries and repopulates from disk", async () => {
    await clearScanCacheFile();
    const raw = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    expect(Object.keys(raw.entries)).toHaveLength(0);

    await scanTodos();
    const repopulated = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    expect(
      Object.keys(repopulated.entries.todos ?? {}).some((p) =>
        p.endsWith("readme.md"),
      ),
    ).toBe(true);
  });

  it("scanTodosForFile and scanLinksForFile re-parse a single file after edit", async () => {
    // warm cache
    await scanTodos();
    await getLinks();

    await new Promise((r) => setTimeout(r, 10));
    const readmePath = path.join(cacheDir, "readme.md");
    await fs.writeFile(
      readmePath,
      "# Readme\nEdited body with [fresh](https://fresh.example.com) link.\n- [ ] Fresh task\n",
      "utf-8",
    );

    const todos = await scanTodosForFile("CacheDir", "readme.md");
    expect(todos.map((t) => t.text)).toEqual(["Fresh task"]);
    expect(todos[0].noteTitle).toBe("Readme");

    const links = await scanLinksForFile("CacheDir", "readme.md");
    expect(links.map((l) => l.url)).toEqual(["https://fresh.example.com"]);

    // Per-file scans update the in-memory cache; persistence is batched.
    await flushScanCache();

    const raw = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    const cachedTodos = Object.entries(raw.entries.todos ?? {}).find(([p]) =>
      p.endsWith("readme.md"),
    );
    expect(cachedTodos).toBeDefined();
    expect(
      (cachedTodos![1] as { data: Array<{ text: string }> }).data[0].text,
    ).toBe("Fresh task");
  });
});
