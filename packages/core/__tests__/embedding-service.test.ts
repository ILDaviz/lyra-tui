import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { EmbeddingService } from "../src/services/embedding";
import {
  EmbeddingDb,
  legacyEmbeddingJsonPath,
} from "../src/services/embedding-db-core";
import { hasConfiguredProvider } from "../src/ai";

// Force the in-thread database backend so tests exercise the real SQLite
// database (node:sqlite) instead of spawning a worker thread.
process.env.LYRA_EMBEDDING_THREAD = "1";

const TEST_REPO_PATH = path.join(os.tmpdir(), "lyra-embedding-service-test");
const dbPath = () => path.join(TEST_REPO_PATH, ".lyra", "embeddings.db");

/** 8-dimensional unit vector with the given positions set to 1. */
const v8 = (...hotPositions: number[]): number[] => {
  const vec = new Array(8).fill(0);
  for (const position of hotPositions) vec[position] = 1;
  return vec;
};

/**
 * Mocks the batched inference entrypoint (embedTexts): every requested text
 * resolves to the given vector, one call covers any batch size.
 */
function mockEmbedding(svc: EmbeddingService, vector: number[] = v8(0)) {
  return vi
    .spyOn(svc, "embedTexts")
    .mockImplementation(async (texts: string[]) => texts.map(() => vector));
}

beforeEach(async () => {
  process.env.LYRA_REPO_PATH = TEST_REPO_PATH;
  await fs.rm(path.join(TEST_REPO_PATH, ".lyra"), {
    recursive: true,
    force: true,
  });
  await fs.mkdir(path.join(TEST_REPO_PATH, ".lyra"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEST_REPO_PATH, { recursive: true, force: true });
});

describe("EmbeddingService", () => {
  it("supports semantic search independently of remote AI providers", async () => {
    const svc = new EmbeddingService();
    mockEmbedding(svc, v8(0));

    expect(hasConfiguredProvider({ provider: "openai" })).toBe(false);
    await expect(
      svc.search("deploy", 5, undefined, "semantic"),
    ).resolves.toEqual([]);
  });

  it("persists indexNote immediately without explicit save passes", async () => {
    const svc = new EmbeddingService();
    mockEmbedding(svc, v8(0));

    await svc.indexNote("a.md", "A", "", "# A\n\ncontent about deploy", 111);

    const db = new EmbeddingDb(dbPath());
    await db.load();
    expect(await db.getIndexedFiles()).toEqual([["a.md", 111]]);
    db.close();

    await expect(
      fs.access(legacyEmbeddingJsonPath(dbPath())),
    ).rejects.toThrow();
    await expect(fs.access(`${dbPath()}.tmp`)).rejects.toThrow();
  });

  it("returns one result per file even for multi-chunk notes", async () => {
    const svc = new EmbeddingService();
    mockEmbedding(svc, v8(0));

    const longText = Array.from(
      { length: 40 },
      (_, i) => `paragraph ${i} mentions deploy frequently`,
    ).join("\n\n");
    await svc.indexNote("a.md", "A", "notes", `# A\n\n${longText}`, 1);
    await svc.indexNote("b.md", "B", "notes", "# B\n\ndeploy once", 2);

    const results = await svc.search("deploy", 10, undefined, "text");
    const filenames = results.map((r) => r.filename);
    expect(new Set(filenames).size).toBe(filenames.length);
    expect(filenames.sort()).toEqual(["a.md", "b.md"]);
  });

  it("serializes index mutations", async () => {
    const svc = new EmbeddingService();
    const events: string[] = [];
    const enqueue = (svc as any).enqueueMutation.bind(svc);

    await Promise.all([
      enqueue(async () => {
        events.push("first:start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push("first:end");
      }),
      enqueue(async () => {
        events.push("second:start");
        events.push("second:end");
      }),
    ]);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("routes query: and passage: prefixes to the AI worker for multilingual-e5-small", async () => {
    const svc = new EmbeddingService();
    const dispatchMock = vi
      .spyOn(svc as any, "aiDispatch")
      .mockResolvedValue([v8(0)]);
    (svc as any).isInitialized = true;
    (svc as any).isAvailable = true;

    await svc.getEmbedding("test search", "query");
    expect(dispatchMock).toHaveBeenLastCalledWith("embed", {
      texts: ["test search"],
      prefix: "query",
    });

    await svc.getEmbedding("test document text", "passage");
    expect(dispatchMock).toHaveBeenLastCalledWith("embed", {
      texts: ["test document text"],
      prefix: "passage",
    });

    // getEmbedding delegates to the batched entrypoint.
    await svc.embedTexts(["a", "b"], "passage");
    expect(dispatchMock).toHaveBeenLastCalledWith("embed", {
      texts: ["a", "b"],
      prefix: "passage",
    });
  });

  it("batches buffered notes into a single inference call during sync", async () => {
    const svc = new EmbeddingService();
    const embedCalls: number[] = [];
    vi.spyOn(svc, "embedTexts").mockImplementation(async (texts: string[]) => {
      embedCalls.push(texts.length);
      return texts.map(() => v8(0));
    });
    (svc as any).isInitialized = true;
    (svc as any).isAvailable = true;

    // Small batch size so two short notes coalesce into one flush.
    process.env.LYRA_EMBEDDING_BATCH = "2";
    try {
      for (const name of ["batch-a.md", "batch-b.md", "batch-c.md"]) {
        await fs.writeFile(
          path.join(TEST_REPO_PATH, name),
          `# ${name}\n\ncontent for ${name}`,
          "utf-8",
        );
      }
      const result = await svc.syncIndex();
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(3);
      // Call 1 is the dimension probe from startBackend; the notes then
      // coalesce into as few inference calls as possible: a full flush
      // (batch-a + batch-b) and the final flush (batch-c).
      expect(embedCalls).toEqual([1, 2, 1]);
    } finally {
      delete process.env.LYRA_EMBEDDING_BATCH;
    }

    const db = new EmbeddingDb(dbPath());
    await db.load(8);
    const missing = await db.getFilesMissingVectors();
    expect(missing).toEqual([]);
    db.close();
  });

  it("closes the in-thread database on dispose and rejects later operations", async () => {
    const svc = new EmbeddingService();
    mockEmbedding(svc, v8(0));

    await svc.indexNote("a.md", "A", "", "# A\n\ntext", 1);

    const backend = (svc as any).backend;
    expect(backend?.kind).toBe("thread");
    expect(backend.db.db).not.toBeNull();

    await svc.dispose();
    expect(backend.db.db).toBeNull();

    await expect(svc.search("anything")).rejects.toThrow(
      "embedding service has been disposed",
    );
  });
});

describe("EmbeddingDb (SQLite backend)", () => {
  const doc = (
    overrides: Partial<{
      relativeFilePath: string;
      title: string;
      folder: string;
      text: string;
      updatedAt: number;
      embedding: number[] | undefined;
    }> = {},
  ) => ({
    relativeFilePath: "a.md",
    title: "A",
    folder: "notes",
    text: "some text",
    updatedAt: 1,
    ...overrides,
  });

  it("replaces notes transactionally and skips unchanged updates", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    expect(await db.replaceNote("a.md", [doc({ updatedAt: 5 })])).toEqual({
      removedCount: 0,
      skipped: false,
    });
    expect(await db.replaceNote("a.md", [doc({ updatedAt: 5 })])).toEqual({
      removedCount: 0,
      skipped: true,
    });
    expect(await db.replaceNote("a.md", [doc({ updatedAt: 6 })])).toEqual({
      removedCount: 1,
      skipped: false,
    });

    expect(await db.removeNote("a.md")).toBe(1);
    expect(await db.getIndexedFiles()).toEqual([]);

    db.close();
  });

  it("deduplicates fulltext results per file and ranks by score", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    await db.replaceNote("a.md", [
      doc({ text: "deploy the server now", updatedAt: 1 }),
      doc({ text: "deploy again tomorrow", updatedAt: 1 }),
    ]);
    await db.replaceNote("b.md", [
      doc({ relativeFilePath: "b.md", text: "how to deploy things" }),
    ]);

    const results = await db.search({ term: "deploy", mode: "fulltext" }, 10);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.filename).sort()).toEqual(["a.md", "b.md"]);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);

    db.close();
  });

  it("ranks vector search by cosine similarity and honors the threshold", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    await db.replaceNote("a.md", [doc({ embedding: v8(0) })]);
    await db.replaceNote("b.md", [
      doc({ relativeFilePath: "b.md", embedding: v8(1) }),
    ]);

    const vectorParams = (similarity: number) => ({
      term: "anything",
      mode: "vector",
      vector: { value: v8(0), property: "embedding" },
      similarity,
    });

    const relaxed = await db.search(vectorParams(0.3), 5);
    expect(relaxed.map((r) => r.filename)).toEqual(["a.md"]);
    expect(relaxed[0].score).toBeCloseTo(1, 5);

    const strict = await db.search(vectorParams(0.999), 5);
    expect(strict.map((r) => r.filename)).toEqual(["a.md"]);

    db.close();
  });

  it("boosts chunks found by both strategies in hybrid mode", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    await db.replaceNote("a.md", [
      doc({ text: "deploy server alpha", embedding: v8(0) }),
    ]);
    await db.replaceNote("b.md", [
      doc({
        relativeFilePath: "b.md",
        text: "deploy client beta",
        embedding: v8(1),
      }),
    ]);

    const results = await db.search(
      {
        term: "deploy",
        mode: "hybrid",
        vector: { value: v8(0), property: "embedding" },
        similarity: 0.3,
      },
      5,
    );

    expect(results.map((r) => r.filename)).toEqual(["a.md", "b.md"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);

    db.close();
  });

  it("filters searches by folder", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    await db.replaceNote("a.md", [
      doc({ folder: "notes", text: "deploy notes file", embedding: v8(0) }),
    ]);
    await db.replaceNote("b.md", [
      doc({
        relativeFilePath: "b.md",
        folder: "work",
        text: "deploy work file",
        embedding: v8(0),
      }),
    ]);

    const fulltext = await db.search(
      { term: "deploy", mode: "fulltext", where: { folder: { eq: "work" } } },
      10,
    );
    expect(fulltext.map((r) => r.folderName)).toEqual(["work"]);

    const vector = await db.search(
      {
        term: "deploy",
        mode: "vector",
        vector: { value: v8(0), property: "embedding" },
        similarity: 0.3,
        where: { folder: { eq: "work" } },
      },
      10,
    );
    expect(vector.map((r) => r.filename)).toEqual(["b.md"]);

    db.close();
  });

  it("persists data across instances and never leaves snapshot files", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);
    await db.replaceNote("a.md", [doc({ text: "persist me", updatedAt: 9 })]);
    await db.save();
    db.close();

    await expect(fs.access(`${dbPath()}.tmp`)).rejects.toThrow();

    const reloaded = new EmbeddingDb(dbPath());
    await reloaded.load();
    expect(await reloaded.getIndexedFiles()).toEqual([["a.md", 9]]);
    const results = await reloaded.search(
      { term: "persist", mode: "fulltext" },
      5,
    );
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe("persist me");
    reloaded.close();
  });

  it("migrates the legacy JSON snapshot on first load", async () => {
    const legacyPath = legacyEmbeddingJsonPath(dbPath());

    // Hand-written fixture in the @orama/plugin-data-persistence "json"
    // format (docs.docs keyed by id, vectors as plain arrays): the migration
    // reads this structure directly, without Orama itself.
    const legacySnapshot = {
      internalDocumentIDStore: {
        internalIdToId: ["fixture-1", "fixture-2"],
      },
      index: {},
      docs: {
        docs: {
          "1": {
            relativeFilePath: "a.md",
            title: "A",
            folder: "notes",
            text: "deploy the stack",
            updatedAt: 100,
            embedding: v8(0),
          },
          "2": {
            relativeFilePath: "b.md",
            title: "B",
            folder: "notes",
            text: "kubernetes notes",
            updatedAt: 200,
          },
        },
        count: 2,
      },
    };
    await fs.writeFile(legacyPath, JSON.stringify(legacySnapshot), "utf-8");

    const db = new EmbeddingDb(dbPath());
    await db.load(384);

    expect(Object.fromEntries(await db.getIndexedFiles())).toEqual({
      "a.md": 100,
      "b.md": 200,
    });

    const results = await db.search({ term: "deploy", mode: "fulltext" }, 5);
    expect(results[0].filename).toBe("a.md");

    await expect(fs.access(legacyPath)).rejects.toThrow();
    await expect(fs.access(`${legacyPath}.bak`)).resolves.toBeUndefined();

    // The dimension was derived from the migrated vectors (8), so 8-dim
    // embeddings remain usable for vector search.
    await db.replaceNote("c.md", [
      doc({
        relativeFilePath: "c.md",
        text: "c content",
        updatedAt: 3,
        embedding: v8(1),
      }),
    ]);
    const vectorHits = await db.search(
      {
        term: "kubernetes",
        mode: "vector",
        vector: { value: v8(1), property: "embedding" },
        similarity: 0.3,
      },
      5,
    );
    expect(vectorHits.map((r) => r.filename)).toEqual(["c.md"]);

    db.close();
  });

  it("stamps the schema version into meta on load", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);
    db.close();

    // A second load must recognize the current version without re-migrating.
    const reloaded = new EmbeddingDb(dbPath());
    await reloaded.load(8);
    reloaded.close();

    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(dbPath());
    const row = raw
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as any;
    raw.close();
    expect(String(row?.value)).toBe("1");
  });

  it("keeps a failed legacy migration retryable instead of parking it", async () => {
    const legacyPath = legacyEmbeddingJsonPath(dbPath());
    await fs.writeFile(legacyPath, "{ this is not json", "utf-8");

    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    // The unimported snapshot stays in place, unparked, and the dimension
    // stays unstamped so the next load retries the migration.
    await expect(fs.access(legacyPath)).resolves.toBeUndefined();
    await expect(fs.access(`${legacyPath}.bak`)).rejects.toThrow();
    expect(await db.getIndexedFiles()).toEqual([]);
    db.close();

    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(dbPath());
    const row = raw
      .prepare("SELECT value FROM meta WHERE key = 'dimension'")
      .get() as any;
    raw.close();
    expect(row).toBeUndefined();

    // Fixing the snapshot makes the next load migrate it successfully.
    await fs.writeFile(
      legacyPath,
      JSON.stringify({
        docs: {
          docs: {
            "1": {
              relativeFilePath: "a.md",
              title: "A",
              folder: "",
              text: "recovered",
              updatedAt: 42,
            },
          },
        },
      }),
      "utf-8",
    );
    const reloaded = new EmbeddingDb(dbPath());
    await reloaded.load(8);
    expect(await reloaded.getIndexedFiles()).toEqual([["a.md", 42]]);
    await expect(fs.access(legacyPath)).rejects.toThrow();
    await expect(fs.access(`${legacyPath}.bak`)).resolves.toBeUndefined();
    reloaded.close();
  });
});

describe("EmbeddingDb.getFilesMissingVectors (SQLite backend)", () => {
  it("lists only files with at least one chunk lacking a vector", async () => {
    const db = new EmbeddingDb(dbPath());
    await db.load(8);

    await db.replaceNote("with.md", [
      {
        relativeFilePath: "with.md",
        title: "With",
        folder: "/",
        text: "vectorized",
        updatedAt: 1,
        embedding: v8(0),
      },
    ]);
    await db.replaceNote("without.md", [
      {
        relativeFilePath: "without.md",
        title: "Without",
        folder: "/",
        text: "no vector",
        updatedAt: 2,
      },
    ]);
    await db.replaceNote("mixed.md", [
      {
        relativeFilePath: "mixed.md",
        title: "Mixed",
        folder: "/",
        text: "first chunk",
        updatedAt: 3,
        embedding: v8(1),
      },
      {
        relativeFilePath: "mixed.md",
        title: "Mixed",
        folder: "/",
        text: "second chunk",
        updatedAt: 3,
      },
    ]);

    expect(await db.getFilesMissingVectors()).toEqual([
      "mixed.md",
      "without.md",
    ]);
    db.close();
  });
});

describe("EmbeddingService vector backfill", () => {
  it("re-embeds notes indexed without vectors on the next sync", async () => {
    const notePath = path.join(TEST_REPO_PATH, "backfill.md");
    const content = "# Backfill\n\ncontent about deploy";
    await fs.writeFile(notePath, content, "utf-8");
    const stats = await fs.stat(notePath);

    const svc = new EmbeddingService();
    mockEmbedding(svc, v8(0));
    await svc.indexNote("backfill.md", "Backfill", "/", content, stats.mtimeMs);
    await svc.dispose();

    // Simulate the state left by the legacy JSON migration (vectors dropped)
    // or by indexing while the model was unavailable.
    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(dbPath());
    raw.exec("UPDATE chunks SET embedding = NULL");
    raw.close();

    const db = new EmbeddingDb(dbPath());
    await db.load(8);
    const missingBefore = await db.getFilesMissingVectors();
    expect(missingBefore).toEqual(["backfill.md"]);
    db.close();

    // Second pass: model works, sync must regenerate the vectors. The
    // init flags are set by hand so the real model pipeline never loads.
    const recovered = new EmbeddingService();
    mockEmbedding(recovered, v8(0));
    (recovered as any).isInitialized = true;
    (recovered as any).isAvailable = true;
    const result = await recovered.syncIndex();
    expect(result.success).toBe(true);
    expect(result.indexedCount).toBeGreaterThanOrEqual(1);
    await recovered.dispose();

    const dbAfter = new EmbeddingDb(dbPath());
    await dbAfter.load(8);
    expect(await dbAfter.getFilesMissingVectors()).toEqual([]);
    dbAfter.close();
  });

  it("skips the backfill entirely when the model is unavailable", async () => {
    const svc = new EmbeddingService();
    // Simulate a failed model load: init() short-circuits to false and the
    // backfill is a no-op instead of an error.
    (svc as any).isInitialized = true;
    (svc as any).isAvailable = false;
    const result = await svc.syncIndex();
    expect(result.success).toBe(true);
    await svc.dispose();
  });
});
