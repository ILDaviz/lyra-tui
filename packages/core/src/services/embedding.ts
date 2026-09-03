import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { getRepoPath, getMyDayPath, exists } from "../helpers";
import {
  EmbeddingDb,
  EmbeddingDoc,
  SearchResultItem,
  legacyEmbeddingJsonPath,
} from "./embedding-db-core";

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Texts per inference call. The ONNX runtime parallelizes a batched forward
 * pass across cores, so sizing the batch on the CPU keeps every core busy
 * during the initial indexing of large vaults. Override with
 * LYRA_EMBEDDING_BATCH.
 */
export function embeddingBatchSize(): number {
  const override = Number.parseInt(process.env.LYRA_EMBEDDING_BATCH ?? "", 10);
  if (Number.isFinite(override) && override > 0) return override;
  const cpus = os.availableParallelism();
  return Math.min(32, Math.max(8, cpus * 2));
}

type WorkerRequestType =
  | "load"
  | "replaceNote"
  | "removeNote"
  | "search"
  | "getIndexedFiles"
  | "getFilesMissingVectors"
  | "save"
  | "close";

const WORKER_CLOSE_TIMEOUT_MS = 1000;

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

type Backend =
  { kind: "worker"; worker: Worker } | { kind: "thread"; db: EmbeddingDb };

export class EmbeddingService {
  private static readonly VECTOR_SIMILARITY_THRESHOLD = 0.3;

  /**
   * Injected by the host (packages/tui/src/embedding-worker-entry.ts) so the
   * compiled binary can extract a bundled worker instead of spawning from
   * the $bunfs virtual filesystem. The provider receives the worker asset
   * name. Null in tests/dev: the direct URLs work there, or the fallbacks
   * take over.
   */
  private static workerEntryProvider:
    ((assetName: string) => Promise<string | null>) | null = null;

  public static setWorkerEntryProvider(
    provider: (assetName: string) => Promise<string | null>,
  ): void {
    EmbeddingService.workerEntryProvider = provider;
  }

  private indexPath: string;
  private isInitialized = false;
  private initialization: Promise<boolean> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  private backend: Backend | null = null;
  private backendLoading: Promise<void> | null = null;
  private workerBroken = false;
  private disposed = false;
  private rpcId = 0;
  private pendingRpcs = new Map<number, PendingRpc>();

  // AI worker: model inference never runs on the main thread. There is no
  // in-thread fallback on purpose: if the worker cannot spawn, the service
  // degrades to fulltext-only instead of blocking the TUI with inference.
  private aiWorker: Worker | null = null;
  private aiWorkerBroken = false;
  private aiRpcId = 0;
  private aiPendingRpcs = new Map<number, PendingRpc>();

  private isAvailable = true;
  private initError: any = null;

  constructor() {
    this.indexPath = path.join(getRepoPath(), ".lyra", "embeddings.db");
  }

  public async init(): Promise<boolean> {
    if (this.isInitialized) return this.isAvailable;
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          console.log(
            "Initializing local embedding model (multilingual-e5-small)...",
          );
          const worker = await this.startAiWorker();
          const result = await this.aiRpc<{ backend: string }>(
            worker,
            "load",
            {},
          );
          this.isInitialized = true;
          this.isAvailable = true;
          console.log(
            `Local embedding model loaded successfully (backend: ${result.backend}).`,
          );
        } catch (err: any) {
          console.warn(
            "Local embedding model could not be loaded; fulltext search will be used as fallback:",
            err?.message || err,
          );
          this.isInitialized = true;
          this.isAvailable = false;
          this.initError = err;
        }
        return this.isAvailable;
      })();
    }

    return this.initialization;
  }

  private async startAiWorker(): Promise<Worker> {
    if (this.aiWorker) return this.aiWorker;
    if (this.aiWorkerBroken) {
      throw new Error("AI worker is unavailable");
    }
    try {
      const provider = EmbeddingService.workerEntryProvider;
      const entry = provider
        ? await provider("embedding-ai-worker.js.txt")
        : null;
      const worker = new Worker(
        entry ?? new URL("./embedding-ai-worker.ts", import.meta.url),
        {
          workerData: {
            cacheDir: path.join(getRepoPath(), ".lyra", "models"),
          },
        },
      );
      worker.unref();
      worker.on("message", (msg: any) => {
        const pending = this.aiPendingRpcs.get(msg?.id);
        if (!pending) return;
        this.aiPendingRpcs.delete(msg.id);
        if (msg.ok) {
          pending.resolve(msg.result);
        } else {
          pending.reject(new Error(msg.error || "AI worker error"));
        }
      });
      worker.on("error", (err: Error) => this.handleAiWorkerFailure(err));
      worker.on("exit", () => {
        if (this.aiWorker === worker) {
          this.handleAiWorkerFailure(new Error("AI worker exited"));
        }
      });
      this.aiWorker = worker;
      return worker;
    } catch (err: any) {
      this.aiWorkerBroken = true;
      throw new Error(`AI worker unavailable: ${err?.message || err}`, {
        cause: err,
      });
    }
  }

  private handleAiWorkerFailure(err: Error): void {
    if (!this.aiWorker) return;
    console.warn(
      "AI worker failed; fulltext search will be used as fallback:",
      err?.message || err,
    );
    this.aiWorkerBroken = true;
    this.aiWorker = null;
    const pending = this.aiPendingRpcs;
    this.aiPendingRpcs = new Map();
    for (const { reject } of pending.values()) {
      reject(new Error("AI worker failed"));
    }
  }

  private async aiDispatch<T = any>(
    type: "load" | "embed" | "close",
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.disposed) {
      throw new Error("embedding service has been disposed");
    }
    const worker = await this.startAiWorker();
    return this.aiRpc<T>(worker, type, payload);
  }

  private aiRpc<T = any>(
    worker: Worker,
    type: "load" | "embed" | "close",
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.aiRpcId;
    return new Promise<T>((resolve, reject) => {
      this.aiPendingRpcs.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }

  /**
   * Embeds a batch of texts in a single inference call on the AI worker.
   * The ONNX runtime parallelizes the batched pass across cores, so callers
   * should batch as many texts as possible (see embeddingBatchSize).
   * Returns one vector per input; empty vectors mean the model is
   * unavailable (fulltext-only fallback) or the call failed.
   */
  public async embedTexts(
    texts: string[],
    prefix: "query" | "passage" = "passage",
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const available = await this.init();
    if (!available) return texts.map(() => []);
    try {
      const vectors = await this.aiDispatch<number[][]>("embed", {
        texts,
        prefix,
      });
      // Defensive: keep positional alignment even on partial results.
      return texts.map((_, i) => vectors[i] ?? []);
    } catch (err) {
      console.warn("Error generating embeddings, skipping vectors:", err);
      return texts.map(() => []);
    }
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    const backend = this.backend;
    this.backend = null;
    this.backendLoading = null;
    this.initialization = null;
    this.isInitialized = false;

    const aiWorker = this.aiWorker;
    this.aiWorker = null;
    const aiPending = this.aiPendingRpcs;
    this.aiPendingRpcs = new Map();
    for (const { reject } of aiPending.values()) {
      reject(new Error("embedding service disposed"));
    }
    if (aiWorker) {
      // Best-effort close; do NOT terminate the AI worker. Terminating a
      // worker with the onnxruntime native module loaded trips a NAPI panic
      // in Bun ("Error::New napi_create_error", exit signal SIGTRAP). The
      // worker is unref'd, so it never holds the event loop: the process
      // exit reclaims it safely.
      const closeRpc = this.aiRpc(aiWorker, "close", {});
      closeRpc.catch(() => {});
      await Promise.race([
        closeRpc,
        new Promise((resolve) => setTimeout(resolve, WORKER_CLOSE_TIMEOUT_MS)),
      ]).catch(() => {});
    }

    const pending = this.pendingRpcs;
    this.pendingRpcs = new Map();
    for (const { reject } of pending.values()) {
      reject(new Error("embedding service disposed"));
    }

    if (!backend) return;

    if (backend.kind === "thread") {
      try {
        backend.db.close();
      } catch {}
      return;
    }

    const closeRpc = this.rpc(backend.worker, "close", {});
    // Rejections after the timeout won the race would otherwise be unhandled.
    closeRpc.catch(() => {});
    try {
      await Promise.race([
        closeRpc,
        new Promise((resolve) => setTimeout(resolve, WORKER_CLOSE_TIMEOUT_MS)),
      ]);
    } catch {}
    try {
      backend.worker.terminate();
    } catch {}
  }

  private handleWorkerFailure(err: Error): void {
    if (!this.backend || this.backend.kind !== "worker") return;
    console.warn(
      "Embedding worker failed, switching to in-thread database:",
      err?.message || err,
    );
    this.workerBroken = true;
    this.backend = null;
    this.backendLoading = null;
    const pending = this.pendingRpcs;
    this.pendingRpcs = new Map();
    for (const { reject } of pending.values()) {
      reject(new Error("embedding worker failed"));
    }
  }

  private async ensureBackend(): Promise<void> {
    if (this.backend) return;
    if (!this.backendLoading) {
      this.backendLoading = this.startBackend().finally(() => {
        this.backendLoading = null;
      });
    }
    await this.backendLoading;
  }

  private async startBackend(): Promise<void> {
    if (this.disposed) {
      throw new Error("embedding service has been disposed");
    }
    // Detect the embedding dimension up-front only when no index exists yet
    // (neither the SQLite database nor a legacy JSON snapshot to migrate, as
    // the migration derives the dimension from the stored vectors).
    let dimension = 384;
    let missingIndex = true;
    try {
      missingIndex = !(await exists(this.indexPath));
    } catch {}
    if (missingIndex) {
      try {
        if (await exists(legacyEmbeddingJsonPath(this.indexPath))) {
          missingIndex = false;
        }
      } catch {}
    }
    if (missingIndex) {
      try {
        const dummyEmbedding = await this.getEmbedding("test");
        if (dummyEmbedding && dummyEmbedding.length > 0) {
          dimension = dummyEmbedding.length;
        }
      } catch (err) {
        console.warn(
          "Failed to detect embedding dimension dynamically, using default 384:",
          err,
        );
      }
    }

    if (!this.workerBroken && process.env.LYRA_EMBEDDING_THREAD !== "1") {
      try {
        // In the compiled binary the worker cannot be spawned from the
        // $bunfs virtual filesystem; the injected provider extracts an
        // embedded bundle to a real temp file instead. Null keeps the
        // direct URL (development) or triggers the in-thread fallback.
        const provider = EmbeddingService.workerEntryProvider;
        const workerEntry = provider
          ? await provider("embedding-worker.js.txt")
          : null;
        const worker = new Worker(
          workerEntry ?? new URL("./embedding-worker.ts", import.meta.url),
          { workerData: { indexPath: this.indexPath } },
        );
        worker.unref();
        worker.on("message", (msg: any) => {
          const pending = this.pendingRpcs.get(msg?.id);
          if (!pending) return;
          this.pendingRpcs.delete(msg.id);
          if (msg.ok) {
            pending.resolve(msg.result);
          } else {
            pending.reject(new Error(msg.error || "embedding worker error"));
          }
        });
        worker.on("error", (err: Error) => this.handleWorkerFailure(err));
        worker.on("exit", () => {
          if (this.backend?.kind === "worker") {
            this.handleWorkerFailure(new Error("embedding worker exited"));
          }
        });
        this.backend = { kind: "worker", worker };
        await this.dispatch("load", { dimension });
        return;
      } catch (err: any) {
        console.warn(
          "Embedding worker unavailable, using in-thread database:",
          err?.message || err,
        );
        this.workerBroken = true;
        this.backend = null;
      }
    }

    const db = new EmbeddingDb(this.indexPath);
    this.backend = { kind: "thread", db };
    await db.load(dimension);
  }

  private async dispatch<T = any>(
    type: WorkerRequestType,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    await this.ensureBackend();
    const backend = this.backend;
    if (!backend) {
      throw new Error("embedding backend is not available");
    }

    if (backend.kind === "thread") {
      const db = backend.db;
      switch (type) {
        case "load":
          await db.load((payload.dimension as number) ?? 384);
          return undefined as T;
        case "replaceNote":
          return (await db.replaceNote(
            payload.relativeFilePath as string,
            (payload.docs as EmbeddingDoc[]) ?? [],
            payload.force === true,
          )) as T;
        case "removeNote":
          return (await db.removeNote(payload.relativeFilePath as string)) as T;
        case "search":
          return (await db.search(
            payload.searchParams,
            (payload.limit as number) ?? 10,
          )) as T;
        case "getIndexedFiles":
          return (await db.getIndexedFiles()) as T;
        case "getFilesMissingVectors":
          return (await db.getFilesMissingVectors()) as T;
        case "save":
          await db.save();
          return undefined as T;
        case "close":
          await db.save();
          db.close();
          return undefined as T;
      }
    }

    if (backend.kind !== "worker") {
      throw new Error("embedding backend is not available");
    }
    return this.rpc<T>(backend.worker, type, payload);
  }

  private rpc<T = any>(
    worker: Worker,
    type: WorkerRequestType,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.rpcId;
    return new Promise<T>((resolve, reject) => {
      this.pendingRpcs.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Single-text convenience wrapper over embedTexts. Inference happens on
   * the AI worker; prefer embedTexts for bulk work.
   */
  public async getEmbedding(
    text: string,
    type: "query" | "passage" = "query",
  ): Promise<number[]> {
    const [vector] = await this.embedTexts([text], type);
    return vector ?? [];
  }

  public async indexNote(
    relativeFilePath: string,
    title: string,
    folder: string,
    content: string,
    updatedAt: number,
    _persist = true,
  ): Promise<void> {
    return this.enqueueMutation(() =>
      this.indexNoteInternal(
        relativeFilePath,
        title,
        folder,
        content,
        updatedAt,
        _persist,
      ),
    );
  }

  /**
   * Chunks a note and returns its embedding docs without vectors. Shared by
   * the single-note and the bulk (sync) paths; callers attach vectors in
   * batched inference calls.
   */
  private buildNoteDocs(
    relativeFilePath: string,
    title: string,
    folder: string,
    content: string,
    updatedAt: number,
  ): {
    chunks: Array<{ rawText: string; embeddedText: string }>;
    docs: EmbeddingDoc[];
  } {
    const chunks = this.chunkTextWithContext(content, title, 600, 150);
    if (chunks.length === 0) {
      chunks.push({
        rawText: title,
        embeddedText: `Document: ${title}\n\n${title}`,
      });
    }
    const docs: EmbeddingDoc[] = chunks.map((chunk) => ({
      relativeFilePath,
      title,
      folder,
      text: chunk.rawText,
      updatedAt,
    }));
    return { chunks, docs };
  }

  private async indexNoteInternal(
    relativeFilePath: string,
    title: string,
    folder: string,
    content: string,
    updatedAt: number,
    // Persisted eagerly since the SQLite backend commits every mutation.
    _persist = true,
    // Bypasses replaceNote's mtime skip (used by the vector backfill, which
    // rewrites unchanged notes whose chunks lack stored vectors).
    force = false,
  ): Promise<void> {
    const { chunks, docs } = this.buildNoteDocs(
      relativeFilePath,
      title,
      folder,
      content,
      updatedAt,
    );

    // One batched inference call for the whole note.
    const vectors = await this.embedTexts(
      chunks.map((chunk) => chunk.embeddedText),
      "passage",
    );
    docs.forEach((doc, i) => {
      const vector = vectors[i];
      if (vector && vector.length > 0) {
        doc.embedding = vector;
      }
    });

    const result = await this.dispatch<{
      removedCount: number;
      skipped: boolean;
    }>("replaceNote", { relativeFilePath, docs, force });

    if (result.skipped) {
      return;
    }

    console.log(`Indexed note: ${relativeFilePath} (${chunks.length} chunks)`);
  }

  public async removeNote(relativeFilePath: string): Promise<void> {
    return this.enqueueMutation(() =>
      this.removeNoteInternal(relativeFilePath),
    );
  }

  private async removeNoteInternal(
    relativeFilePath: string,
    _persist = true,
  ): Promise<void> {
    const result = await this.dispatch<{ removedCount: number }>("removeNote", {
      relativeFilePath,
    });

    if (result.removedCount > 0) {
      console.log(
        `Removed note from index: ${relativeFilePath} (${result.removedCount} chunks)`,
      );
    }
  }

  public async search(
    query: string,
    limit = 10,
    folderFilter?: string,
    mode: "text" | "semantic" | "hybrid" = "hybrid",
  ): Promise<any[]> {
    if (!query.trim()) return [];
    await this.mutationQueue;

    const searchParams: any = {
      term: query,
    };

    if (mode === "semantic" || mode === "hybrid") {
      try {
        const embedding = await this.getEmbedding(query);
        if (embedding && embedding.length > 0) {
          searchParams.vector = {
            value: embedding,
            property: "embedding",
          };
          searchParams.similarity =
            EmbeddingService.VECTOR_SIMILARITY_THRESHOLD;
          searchParams.mode = mode === "semantic" ? "vector" : "hybrid";
        } else {
          searchParams.mode = "fulltext";
        }
      } catch {
        searchParams.mode = "fulltext";
      }
    } else {
      searchParams.mode = "fulltext";
    }

    if (folderFilter && folderFilter !== "/") {
      searchParams.where = {
        folder: { eq: folderFilter },
      };
    }

    return this.dispatch<SearchResultItem[]>("search", {
      searchParams,
      limit,
    });
  }

  public async syncIndex(): Promise<{
    success: boolean;
    indexedCount: number;
  }> {
    return this.enqueueMutation(() => this.syncIndexInternal());
  }

  private async syncIndexInternal(): Promise<{
    success: boolean;
    indexedCount: number;
  }> {
    console.log("Starting index synchronization...");
    const rootPath = getRepoPath();
    let indexedCount = 0;

    // The SQLite backend persists every mutation transactionally, so sync
    // needs no snapshot throttling or explicit save passes.
    const filesOnDisk = new Set<string>();

    const getTitleFromContent = (content: string, filename: string): string => {
      let title = filename.replace(/\.md$/, "");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1].trim()) {
        title = titleMatch[1].trim();
      }
      return title;
    };

    try {
      const indexedEntries =
        await this.dispatch<Array<[string, number]>>("getIndexedFiles");
      const indexedFiles = new Map<string, number>(indexedEntries);

      // Bulk batching: notes are chunked as they are scanned and buffered;
      // when enough texts are pending, a single inference call embeds them
      // together (the ONNX runtime parallelizes the batch across cores).
      const batchSize = embeddingBatchSize();
      let buffer: Array<{
        relativePath: string;
        title: string;
        folder: string;
        updatedAt: number;
        chunks: Array<{ rawText: string; embeddedText: string }>;
      }> = [];
      let pendingTexts = 0;

      const flushBuffer = async () => {
        if (buffer.length === 0) return;
        try {
          const allTexts: string[] = [];
          for (const entry of buffer) {
            for (const chunk of entry.chunks) {
              allTexts.push(chunk.embeddedText);
            }
          }
          const vectors = await this.embedTexts(allTexts, "passage");
          let offset = 0;
          for (const entry of buffer) {
            const docs: EmbeddingDoc[] = entry.chunks.map((chunk, i) => {
              const vector = vectors[offset + i] ?? [];
              offset++;
              return {
                relativeFilePath: entry.relativePath,
                title: entry.title,
                folder: entry.folder,
                text: chunk.rawText,
                updatedAt: entry.updatedAt,
                ...(vector.length > 0 ? { embedding: vector } : {}),
              };
            });
            await this.dispatch("replaceNote", {
              relativeFilePath: entry.relativePath,
              docs,
            });
            indexedCount++;
            console.log(
              `Indexed note: ${entry.relativePath} (${entry.chunks.length} chunks)`,
            );
          }
        } catch (err) {
          console.error("Error indexing buffered notes:", err);
        }
        buffer = [];
        pendingTexts = 0;
        // Keep keystrokes and rendering serviced during bulk indexing.
        await yieldToEventLoop();
      };

      const scanDir = async (dirPath: string, folderName: string) => {
        if (!(await exists(dirPath))) return;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile() && entry.name.endsWith(".md")) {
            const stats = await fs.stat(fullPath);
            const relativePath =
              folderName === "/"
                ? entry.name
                : path.join(folderName, entry.name);
            filesOnDisk.add(relativePath);

            const indexedMtime = indexedFiles.get(relativePath);
            if (indexedMtime === undefined || indexedMtime !== stats.mtimeMs) {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const title = getTitleFromContent(content, entry.name);
                const { chunks } = this.buildNoteDocs(
                  relativePath,
                  title,
                  folderName,
                  content,
                  stats.mtimeMs,
                );
                buffer.push({
                  relativePath,
                  title,
                  folder: folderName,
                  updatedAt: stats.mtimeMs,
                  chunks,
                });
                pendingTexts += chunks.length;
                if (pendingTexts >= batchSize) {
                  await flushBuffer();
                }
              } catch (err) {
                console.error(`Error indexing file ${relativePath}:`, err);
              }
            }
          } else if (entry.isDirectory() && folderName === "/") {
            if (
              !entry.name.startsWith(".") &&
              entry.name !== "attachments" &&
              entry.name !== "myday"
            ) {
              await scanDir(fullPath, entry.name);
            }
          }
        }
      };

      await scanDir(rootPath, "/");

      const myDayPath = getMyDayPath();
      await scanDir(myDayPath, "myday");

      await flushBuffer();

      filesOnDisk.add("links.json");
      if (await this.indexLinksFile(indexedFiles)) {
        indexedCount++;
      }

      // Backfill pass: notes indexed while the local model was unavailable
      // (or migrated from the legacy JSON snapshot) have chunks without
      // vectors; regenerate them once the model is reachable. After this
      // single pass the mtime skip governs as usual.
      indexedCount += await this.backfillMissingVectors();

      let removedCount = 0;
      for (const relativePath of indexedFiles.keys()) {
        if (!filesOnDisk.has(relativePath)) {
          await this.removeNoteInternal(relativePath, false);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} stale entries from index.`);
      }

      console.log(
        `Index synchronization complete. ${indexedCount} notes updated/indexed.`,
      );
      return { success: true, indexedCount };
    } catch (err) {
      console.error("Index synchronization failed:", err);
      return { success: false, indexedCount };
    }
  }

  /**
   * Indexes links.json. Pass the sync's indexedFiles map to honor the
   * mtime skip, or null to force a full re-index (backfill).
   */
  private async indexLinksFile(
    indexedFiles: Map<string, number> | null,
  ): Promise<boolean> {
    const linksJsonPath = path.join(getRepoPath(), "links.json");
    if (!(await exists(linksJsonPath))) return false;
    try {
      const stats = await fs.stat(linksJsonPath);
      if (indexedFiles) {
        const indexedMtime = indexedFiles.get("links.json");
        if (indexedMtime !== undefined && indexedMtime === stats.mtimeMs) {
          return false;
        }
      }

      const linksContent = await fs.readFile(linksJsonPath, "utf-8");
      const parsedLinks = JSON.parse(linksContent);
      if (!Array.isArray(parsedLinks)) return false;

      const texts: string[] = [];
      const docs: EmbeddingDoc[] = [];
      for (const link of parsedLinks) {
        const linkTitle = link.title || link.url;
        const linkText = `Link URL: ${link.url}\nDescription: ${
          link.description || ""
        }\nTags: ${(link.tags || []).join(", ")}`;
        texts.push(`Link: ${linkTitle}\n${linkText}`);
        docs.push({
          relativeFilePath: "links.json",
          title: `Link: ${linkTitle}`,
          folder: "links",
          text: linkText,
          updatedAt: stats.mtimeMs,
        });
      }

      // One batched inference call for all links.
      const vectors = await this.embedTexts(texts, "passage");
      docs.forEach((doc, i) => {
        const vector = vectors[i];
        if (vector && vector.length > 0) {
          doc.embedding = vector;
        }
      });

      await this.dispatch("replaceNote", {
        relativeFilePath: "links.json",
        docs,
      });
      console.log(
        `Indexed manual links from links.json (${parsedLinks.length} links)`,
      );
      return true;
    } catch (err) {
      console.error("Error indexing links.json:", err);
      return false;
    }
  }

  /**
   * Re-embeds every indexed file that still has chunks without vectors
   * (model was unavailable when it was indexed, or it came from the legacy
   * JSON migration which carried no vectors). No-op when the model is not
   * available. Returns the number of files repaired.
   */
  private async backfillMissingVectors(): Promise<number> {
    const available = await this.init();
    if (!available) return 0;

    let missing: string[];
    try {
      missing = await this.dispatch<string[]>("getFilesMissingVectors", {});
    } catch (err) {
      console.warn("Unable to query chunks missing vectors:", err);
      return 0;
    }
    if (missing.length === 0) return 0;

    const rootPath = getRepoPath();
    const getTitleFromContent = (content: string, filename: string): string => {
      let title = filename.replace(/\.md$/, "");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1].trim()) {
        title = titleMatch[1].trim();
      }
      return title;
    };

    let backfilled = 0;
    for (const relativePath of missing) {
      try {
        if (relativePath === "links.json") {
          await this.indexLinksFile(null);
        } else {
          const fullPath = path.join(rootPath, relativePath);
          if (!(await exists(fullPath))) continue;
          // Use the file's current mtime, not the (possibly stale) sync-time
          // map: files indexed during this very sync are absent from it and
          // would otherwise be stored with updatedAt 0, forcing a full
          // re-index on the next synchronization.
          const stats = await fs.stat(fullPath);
          const content = await fs.readFile(fullPath, "utf-8");
          const dirName = path.dirname(relativePath);
          await this.indexNoteInternal(
            relativePath,
            getTitleFromContent(content, path.basename(relativePath)),
            dirName === "." ? "/" : dirName,
            content,
            stats.mtimeMs,
            false,
            true,
          );
        }
        backfilled++;
      } catch (err) {
        console.error(`Error backfilling vectors for ${relativePath}:`, err);
      }
    }
    if (backfilled > 0) {
      console.log(
        `Backfilled embeddings for ${backfilled} notes previously indexed without vectors.`,
      );
    }
    return backfilled;
  }

  private chunkTextWithContext(
    text: string,
    title: string,
    maxLength = 600,
    overlapSize = 150,
  ): Array<{ rawText: string; embeddedText: string }> {
    const cleanText = text.replace(/^#\s+.+$/m, "").trim();
    if (!cleanText) return [];

    const lines = cleanText.split("\n");
    let currentHeading = "";
    let currentParagraph = "";
    const items: Array<{ text: string; heading: string }> = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      const headingMatch = trimmedLine.match(/^(#{2,6})\s+(.+)$/);
      if (headingMatch) {
        if (currentParagraph) {
          items.push({
            text: currentParagraph.trim(),
            heading: currentHeading,
          });
          currentParagraph = "";
        }
        currentHeading = headingMatch[2].trim();
        items.push({ text: trimmedLine, heading: currentHeading });
      } else if (trimmedLine === "") {
        if (currentParagraph) {
          items.push({
            text: currentParagraph.trim(),
            heading: currentHeading,
          });
          currentParagraph = "";
        }
      } else {
        currentParagraph = currentParagraph
          ? currentParagraph + "\n" + line
          : line;
      }
    }
    if (currentParagraph) {
      items.push({ text: currentParagraph.trim(), heading: currentHeading });
    }

    const chunks: Array<{ rawText: string; embeddedText: string }> = [];
    let i = 0;

    while (i < items.length) {
      let charCount = 0;
      const chunkItems: typeof items = [];
      let j = i;

      while (j < items.length) {
        const item = items[j];
        const itemLen = item.text.length;

        if (chunkItems.length > 0 && charCount + itemLen + 2 > maxLength) {
          break;
        }

        chunkItems.push(item);
        charCount += itemLen + (chunkItems.length > 1 ? 2 : 0);
        j++;
      }

      const rawText = chunkItems.map((item) => item.text).join("\n\n");
      const heading = chunkItems[0]?.heading || "";

      const contextPrefix = `Document: ${title}${heading ? ` > ${heading}` : ""}\n\n`;
      const embeddedText = contextPrefix + rawText;

      chunks.push({ rawText, embeddedText });

      if (j >= items.length) {
        break;
      }

      let overlapCount = 0;
      let overlapItemsLength = 0;
      let k = j - 1;

      while (k >= i) {
        const itemLen = items[k].text.length;
        if (
          overlapItemsLength + itemLen + (overlapCount > 0 ? 2 : 0) >
          overlapSize
        ) {
          break;
        }
        overlapItemsLength += itemLen + (overlapCount > 0 ? 2 : 0);
        overlapCount++;
        k--;
      }

      const nextStart = j - Math.min(overlapCount, chunkItems.length - 1);
      i = Math.max(nextStart, i + 1);
    }

    return chunks;
  }
}
