import * as fs from "fs/promises";
import * as path from "path";
import { Worker } from "worker_threads";
import { getRepoPath, getMyDayPath, exists } from "../helpers";
import {
  EmbeddingDb,
  EmbeddingDoc,
  SearchResultItem,
} from "./embedding-db-core";

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

type WorkerRequestType =
  | "load"
  | "replaceNote"
  | "removeNote"
  | "search"
  | "getIndexedFiles"
  | "save";

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

type Backend =
  | { kind: "worker"; worker: Worker }
  | { kind: "thread"; db: EmbeddingDb };

export class EmbeddingService {
  private static readonly VECTOR_SIMILARITY_THRESHOLD = 0.3;

  private extractor: any = null;
  private indexPath: string;
  private isInitialized = false;
  private initialization: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  private backend: Backend | null = null;
  private backendLoading: Promise<void> | null = null;
  private workerBroken = false;
  private rpcId = 0;
  private pendingRpcs = new Map<number, PendingRpc>();

  private isAvailable = true;
  private initError: any = null;

  constructor() {
    this.indexPath = path.join(getRepoPath(), ".lyra", "embeddings.json");
  }

  public async init(): Promise<boolean> {
    if (this.isInitialized) return this.isAvailable;
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          console.log(
            "Initializing local embedding model (multilingual-e5-small)...",
          );
          const transformersModule: any = await import("@xenova/transformers");
          const transformers: any =
            transformersModule.default?.pipeline || transformersModule.default?.env
              ? transformersModule.default
              : transformersModule;
          const pipeline = transformers.pipeline || transformersModule.pipeline;
          const env = transformers.env || transformersModule.env;

          const repoPath = getRepoPath();
          if (env) {
            env.cacheDir = path.join(repoPath, ".lyra", "models");
          }

          if (typeof pipeline !== "function") {
            throw new Error(
              "Transformers pipeline is not available in the current environment.",
            );
          }

          this.extractor = await pipeline(
            "feature-extraction",
            "Xenova/multilingual-e5-small",
          );
          this.isInitialized = true;
          this.isAvailable = true;
          console.log("Local embedding model loaded successfully.");
        } catch (err: any) {
          console.warn(
            "Local embedding model could not be loaded; fulltext search will be used as fallback:",
            err?.message || err,
          );
          this.isInitialized = true;
          this.isAvailable = false;
          this.initError = err;
        }
      })();
    }

    await this.initialization;
    return this.isAvailable;
  }

  public dispose(): void {
    const backend = this.backend;
    this.backend = null;
    this.backendLoading = null;
    this.initialization = null;
    this.isInitialized = false;
    this.extractor = null;
    if (backend?.kind === "worker") {
      try {
        void backend.worker.terminate();
      } catch {}
    }
    const pending = this.pendingRpcs;
    this.pendingRpcs = new Map();
    for (const { reject } of pending.values()) {
      reject(new Error("embedding service disposed"));
    }
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
    // Detect the embedding dimension up-front only when the index file does
    // not exist yet (same behavior as the previous in-thread loader).
    let dimension = 384;
    let missingIndex = false;
    try {
      missingIndex = !(await exists(this.indexPath));
    } catch {}
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
        const worker = new Worker(
          new URL("./embedding-worker.ts", import.meta.url),
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
          )) as T;
        case "removeNote":
          return (await db.removeNote(
            payload.relativeFilePath as string,
          )) as T;
        case "search":
          return (await db.search(
            payload.searchParams,
            (payload.limit as number) ?? 10,
          )) as T;
        case "getIndexedFiles":
          return (await db.getIndexedFiles()) as T;
        case "save":
          await db.save();
          return undefined as T;
      }
    }

    const id = ++this.rpcId;
    return new Promise<T>((resolve, reject) => {
      this.pendingRpcs.set(id, { resolve, reject });
      backend.worker.postMessage({ id, type, ...payload });
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

  public async getEmbedding(
    text: string,
    type: "query" | "passage" = "query",
  ): Promise<number[]> {
    const available = await this.init();
    if (!available || !this.extractor) {
      return [];
    }
    try {
      const formattedText =
        text.startsWith("query: ") || text.startsWith("passage: ")
          ? text
          : `${type}: ${text}`;
      const output = await this.extractor(formattedText, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(output.data);
    } catch (err) {
      console.warn("Error generating embedding, skipping vector:", err);
      return [];
    }
  }

  public async indexNote(
    relativeFilePath: string,
    title: string,
    folder: string,
    content: string,
    updatedAt: number,
    persist = true,
  ): Promise<void> {
    return this.enqueueMutation(() =>
      this.indexNoteInternal(
        relativeFilePath,
        title,
        folder,
        content,
        updatedAt,
        persist,
      ),
    );
  }

  private async indexNoteInternal(
    relativeFilePath: string,
    title: string,
    folder: string,
    content: string,
    updatedAt: number,
    persist = true,
  ): Promise<void> {
    const chunksWithContext = this.chunkTextWithContext(
      content,
      title,
      600,
      150,
    );

    if (chunksWithContext.length === 0) {
      const contextPrefix = `Document: ${title}\n\n`;
      chunksWithContext.push({
        rawText: title,
        embeddedText: contextPrefix + title,
      });
    }

    const docs: EmbeddingDoc[] = [];
    for (const chunk of chunksWithContext) {
      const embedding = await this.getEmbedding(chunk.embeddedText, "passage");
      const doc: EmbeddingDoc = {
        relativeFilePath,
        title,
        folder,
        text: chunk.rawText,
        updatedAt,
      };
      if (embedding && embedding.length > 0) {
        doc.embedding = embedding;
      }
      docs.push(doc);
      // Inference blocks the main thread per chunk; yield between chunks so
      // keystrokes and rendering are serviced during multi-chunk notes.
      await yieldToEventLoop();
    }

    const result = await this.dispatch<{
      removedCount: number;
      skipped: boolean;
    }>("replaceNote", { relativeFilePath, docs });

    if (result.skipped) {
      return;
    }

    if (persist) {
      await this.dispatch("save");
    }
    console.log(
      `Indexed note in Orama: ${relativeFilePath} (${chunksWithContext.length} chunks)`,
    );
  }

  public async removeNote(relativeFilePath: string): Promise<void> {
    return this.enqueueMutation(() =>
      this.removeNoteInternal(relativeFilePath),
    );
  }

  private async removeNoteInternal(
    relativeFilePath: string,
    persist = true,
  ): Promise<void> {
    const result = await this.dispatch<{ removedCount: number }>("removeNote", {
      relativeFilePath,
    });

    if (result.removedCount > 0) {
      if (persist) {
        await this.dispatch("save");
      }
      console.log(
        `Removed note from Orama index: ${relativeFilePath} (${result.removedCount} chunks)`,
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
    let dirty = false;
    let unsavedChanges = 0;

    // Persist serializes the whole database; keep it throttled so the worker
    // is not flooded and disk writes stay rare.
    const SAVE_MAX_PENDING_CHANGES = 1000;
    const SAVE_MIN_INTERVAL_MS = 15_000;
    let lastSaveAt = performance.now();

    const checkpoint = async () => {
      const dueToVolume = unsavedChanges >= SAVE_MAX_PENDING_CHANGES;
      const dueToTime =
        unsavedChanges > 0 &&
        performance.now() - lastSaveAt >= SAVE_MIN_INTERVAL_MS;
      if (dueToVolume || dueToTime) {
        await this.dispatch("save");
        unsavedChanges = 0;
        lastSaveAt = performance.now();
      }
    };

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
      const indexedEntries = await this.dispatch<
        Array<[string, number]>
      >("getIndexedFiles");
      const indexedFiles = new Map<string, number>(indexedEntries);

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
                await this.indexNoteInternal(
                  relativePath,
                  title,
                  folderName,
                  content,
                  stats.mtimeMs,
                  false,
                );
                indexedCount++;
                dirty = true;
                unsavedChanges++;
                await checkpoint();
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

      const linksJsonPath = path.join(rootPath, "links.json");
      if (await exists(linksJsonPath)) {
        try {
          const stats = await fs.stat(linksJsonPath);
          filesOnDisk.add("links.json");

          const indexedMtime = indexedFiles.get("links.json");
          if (indexedMtime === undefined || indexedMtime !== stats.mtimeMs) {
            const linksContent = await fs.readFile(linksJsonPath, "utf-8");
            const parsedLinks = JSON.parse(linksContent);
            if (Array.isArray(parsedLinks)) {
              const docs: EmbeddingDoc[] = [];
              for (const link of parsedLinks) {
                const linkTitle = link.title || link.url;
                const linkText = `Link URL: ${link.url}\nDescription: ${
                  link.description || ""
                }\nTags: ${(link.tags || []).join(", ")}`;

                const embedding = await this.getEmbedding(
                  `Link: ${linkTitle}\n${linkText}`,
                  "passage",
                );
                const doc: EmbeddingDoc = {
                  relativeFilePath: "links.json",
                  title: `Link: ${linkTitle}`,
                  folder: "links",
                  text: linkText,
                  updatedAt: stats.mtimeMs,
                };
                if (embedding && embedding.length > 0) {
                  doc.embedding = embedding;
                }
                docs.push(doc);
              }

              await this.dispatch("replaceNote", {
                relativeFilePath: "links.json",
                docs,
              });
              indexedCount++;
              dirty = true;
              unsavedChanges++;
              console.log(
                `Indexed manual links from links.json in Orama (${parsedLinks.length} links)`,
              );
            }
          }
        } catch (err) {
          console.error("Error indexing links.json:", err);
        }
      }

      let removedCount = 0;
      for (const relativePath of indexedFiles.keys()) {
        if (!filesOnDisk.has(relativePath)) {
          await this.removeNoteInternal(relativePath, false);
          removedCount++;
          dirty = true;
          unsavedChanges++;
        }
      }

      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} stale entries from index.`);
      }

      if (dirty) {
        await this.dispatch("save");
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
