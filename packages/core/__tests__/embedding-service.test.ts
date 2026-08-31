import { describe, it, expect, vi, beforeAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const { searchMock, createMock, removeMultipleMock } = vi.hoisted(() => ({
  searchMock: vi.fn().mockResolvedValue({ hits: [] }),
  createMock: vi.fn().mockResolvedValue({ mockedDb: true }),
  removeMultipleMock: vi.fn(),
}));

vi.mock("@orama/orama", () => ({
  create: createMock,
  insert: vi.fn(),
  removeMultiple: removeMultipleMock,
  search: searchMock,
}));

vi.mock("@orama/plugin-data-persistence", () => ({
  persist: vi.fn().mockResolvedValue("{}"),
  restore: vi.fn().mockRejectedValue(new Error("no index in test")),
}));

import { EmbeddingService } from "../src/services/embedding";
import { hasConfiguredProvider } from "../src/ai";

const TEST_REPO_PATH = "/tmp/lyra-embedding-service-test";

// Force the in-thread database backend so the @orama mocks in this module
// graph apply (the worker thread would use the real modules).
process.env.LYRA_EMBEDDING_THREAD = "1";

beforeAll(async () => {
  process.env.LYRA_REPO_PATH = TEST_REPO_PATH;
  await fs.rm(TEST_REPO_PATH, { recursive: true, force: true });
  await fs.mkdir(TEST_REPO_PATH, { recursive: true });
});

describe("EmbeddingService.search", () => {
  it("supports semantic search independently of remote AI providers", async () => {
    const svc = new EmbeddingService();
    vi.spyOn(svc, "getEmbedding").mockResolvedValue(new Array(384).fill(0.1));

    expect(hasConfiguredProvider({ provider: "openai" })).toBe(false);
    await svc.search("deploy", 5, undefined, "semantic");

    const params = searchMock.mock.calls.at(-1)?.[1];
    expect(params.mode).toBe("vector");
    expect(params.vector).toBeDefined();
  });

  it("passes a similarity threshold below the Orama default (0.8) in semantic mode", async () => {
    const svc = new EmbeddingService();
    vi.spyOn(svc, "getEmbedding").mockResolvedValue(new Array(384).fill(0.1));

    await svc.search("deploy", 5, undefined, "semantic");

    expect(searchMock).toHaveBeenCalled();
    const params = searchMock.mock.calls.at(-1)?.[1];
    expect(params.mode).toBe("vector");
    expect(params.vector).toBeDefined();
    expect(params.similarity).toBeDefined();
    expect(params.similarity).toBeLessThan(0.8);
  });

  it("passes the similarity threshold in hybrid mode as well", async () => {
    const svc = new EmbeddingService();
    vi.spyOn(svc, "getEmbedding").mockResolvedValue(new Array(384).fill(0.1));

    await svc.search("deploy", 5, undefined, "hybrid");

    const params = searchMock.mock.calls.at(-1)?.[1];
    expect(params.mode).toBe("hybrid");
    expect(params.similarity).toBeLessThan(0.8);
  });

  it("does not pass vector params in text mode", async () => {
    const svc = new EmbeddingService();
    const embeddingSpy = vi
      .spyOn(svc, "getEmbedding")
      .mockResolvedValue(new Array(384).fill(0.1));

    await (svc as any).ensureBackend();
    embeddingSpy.mockClear();

    await svc.search("deploy", 5, undefined, "text");

    const params = searchMock.mock.calls.at(-1)?.[1];
    expect(params.mode).toBe("fulltext");
    expect(params.vector).toBeUndefined();
    expect(params.similarity).toBeUndefined();
    expect(embeddingSpy).not.toHaveBeenCalled();
  });

  it("saves the index atomically (temp file + rename)", async () => {
    const svc = new EmbeddingService();
    vi.spyOn(svc, "getEmbedding").mockResolvedValue(new Array(384).fill(0.1));

    await (svc as any).ensureBackend();

    const indexPath = path.join(TEST_REPO_PATH, ".lyra", "embeddings.json");
    const content = await fs.readFile(indexPath, "utf-8");
    expect(JSON.parse(content)).toEqual({});
    await expect(fs.access(`${indexPath}.tmp`)).rejects.toThrow();
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

  it("removes every page of indexed chunks for a note", async () => {
    const svc = new EmbeddingService();
    vi.spyOn(svc, "getEmbedding").mockResolvedValue(new Array(384).fill(0.1));
    searchMock
      .mockResolvedValueOnce({ hits: [{ id: "1" }, { id: "2" }] })
      .mockResolvedValueOnce({ hits: [] });

    await svc.removeNote("long-note.md");

    expect(removeMultipleMock).toHaveBeenCalledWith(expect.anything(), [
      "1",
      "2",
    ]);
  });

  it("adds query: and passage: prefixes appropriately for multilingual-e5-small", async () => {
    const svc = new EmbeddingService();
    const extractorMock = vi.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0.2),
    });
    (svc as any).extractor = extractorMock;
    (svc as any).isInitialized = true;
    (svc as any).isAvailable = true;

    await svc.getEmbedding("test search", "query");
    expect(extractorMock).toHaveBeenLastCalledWith(
      "query: test search",
      expect.objectContaining({ pooling: "mean", normalize: true }),
    );

    await svc.getEmbedding("test document text", "passage");
    expect(extractorMock).toHaveBeenLastCalledWith(
      "passage: test document text",
      expect.objectContaining({ pooling: "mean", normalize: true }),
    );

    // If prefix already exists, do not double-prefix
    await svc.getEmbedding("query: already prefixed", "query");
    expect(extractorMock).toHaveBeenLastCalledWith(
      "query: already prefixed",
      expect.objectContaining({ pooling: "mean", normalize: true }),
    );
  });
});
