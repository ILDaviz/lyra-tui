import * as fs from "fs/promises";
import * as path from "path";

export interface EmbeddingDoc {
  relativeFilePath: string;
  title: string;
  folder: string;
  text: string;
  updatedAt: number;
  embedding?: number[];
}

export interface SearchResultItem {
  filename: string;
  folderName: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: number;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Owns the Orama instance for the embedding index. Instantiated inside the
 * worker thread so that restore/persist (multi-hundred-ms blocking passes on
 * large vaults) never run on the main thread; also usable in-thread as a
 * fallback when the worker cannot be spawned.
 */
export class EmbeddingDb {
  private indexPath: string;
  private db: any = null;
  private loaded = false;

  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  async load(dimension = 384): Promise<void> {
    if (this.loaded) return;
    const dir = path.dirname(this.indexPath);
    if (!(await pathExists(dir))) {
      await fs.mkdir(dir, { recursive: true });
    }

    if (await pathExists(this.indexPath)) {
      try {
        const content = (await fs.readFile(this.indexPath, "utf-8")) as string;
        const persistenceModule: any = await import(
          "@orama/plugin-data-persistence"
        );
        const restore =
          persistenceModule.restore || persistenceModule.default?.restore;
        this.db = await restore("json", content);
        this.loaded = true;
        return;
      } catch (err) {
        console.error("Error restoring Orama database, starting fresh:", err);
      }
    }

    await this.createDb(dimension);
  }

  private async createDb(dimension: number): Promise<void> {
    const { create } = await import("@orama/orama");
    this.db = await create({
      schema: {
        relativeFilePath: "enum",
        title: "string",
        folder: "enum",
        text: "string",
        updatedAt: "number",
        embedding: `vector[${dimension}]`,
      },
    });
    this.loaded = true;
    await this.save();
  }

  async replaceNote(
    relativeFilePath: string,
    docs: EmbeddingDoc[],
  ): Promise<{ removedCount: number; skipped: boolean }> {
    if (!this.db) throw new Error("Embedding database is not loaded");
    const { insert, removeMultiple, search } = await import("@orama/orama");

    const existing = await search(this.db, {
      where: {
        relativeFilePath: { eq: relativeFilePath },
      },
      limit: 1,
    });
    if (
      existing.hits.length > 0 &&
      docs.length > 0 &&
      (existing.hits[0] as any).document.updatedAt === docs[0].updatedAt
    ) {
      return { removedCount: 0, skipped: true };
    }

    let removedCount = 0;
    while (true) {
      const searchRes = await search(this.db, {
        where: {
          relativeFilePath: { eq: relativeFilePath },
        },
        limit: 1000,
      });
      if (searchRes.hits.length === 0) break;
      const ids = searchRes.hits.map((hit: any) => hit.id);
      await removeMultiple(this.db, ids);
      removedCount += ids.length;
    }

    for (const doc of docs) {
      await insert(this.db, doc);
    }

    return { removedCount, skipped: false };
  }

  async removeNote(relativeFilePath: string): Promise<number> {
    if (!this.db) throw new Error("Embedding database is not loaded");
    const { removeMultiple, search } = await import("@orama/orama");

    let removedCount = 0;
    while (true) {
      const searchRes = await search(this.db, {
        where: {
          relativeFilePath: { eq: relativeFilePath },
        },
        limit: 1000,
      });
      if (searchRes.hits.length === 0) break;
      const ids = searchRes.hits.map((hit: any) => hit.id);
      await removeMultiple(this.db, ids);
      removedCount += ids.length;
    }

    return removedCount;
  }

  async getIndexedFiles(): Promise<Array<[string, number]>> {
    if (!this.db) throw new Error("Embedding database is not loaded");
    const { search } = await import("@orama/orama");

    const fileToMtime = new Map<string, number>();
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const allDocsRes = await search(this.db, { limit: pageSize, offset });
      for (const hit of allDocsRes.hits) {
        const doc: any = hit.document;
        fileToMtime.set(doc.relativeFilePath, doc.updatedAt);
      }
      if (allDocsRes.hits.length < pageSize) break;
      offset += allDocsRes.hits.length;
    }

    return Array.from(fileToMtime.entries());
  }

  async search(
    searchParams: any,
    limit: number,
  ): Promise<SearchResultItem[]> {
    if (!this.db) throw new Error("Embedding database is not loaded");
    const { search } = await import("@orama/orama");

    const seen = new Set<string>();
    const uniqueResults: SearchResultItem[] = [];
    const pageSize = Math.max(limit * 4, 25);
    let offset = 0;

    while (uniqueResults.length < limit) {
      const searchRes = await search(this.db, {
        ...searchParams,
        limit: pageSize,
        offset,
      });

      for (const hit of searchRes.hits) {
        const doc: any = hit.document;
        if (!seen.has(doc.relativeFilePath)) {
          seen.add(doc.relativeFilePath);
          uniqueResults.push({
            filename: path.basename(doc.relativeFilePath),
            folderName: doc.folder,
            title: doc.title,
            snippet: doc.text,
            score: hit.score,
            updatedAt: doc.updatedAt,
          });
        }
        if (uniqueResults.length >= limit) break;
      }
      if (searchRes.hits.length < pageSize) break;
      offset += searchRes.hits.length;
    }

    return uniqueResults;
  }

  async save(): Promise<void> {
    if (!this.db) return;
    try {
      const persistenceModule: any = await import(
        "@orama/plugin-data-persistence"
      );
      const persist =
        persistenceModule.persist || persistenceModule.default?.persist;
      const content = (await persist(this.db, "json")) as string;
      const dir = path.dirname(this.indexPath);
      if (!(await pathExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }
      const tmpPath = `${this.indexPath}.tmp`;
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, this.indexPath);
    } catch (err) {
      console.error("Error saving Orama database:", err);
    }
  }
}
