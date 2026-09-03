import * as fs from "fs/promises";
import * as path from "path";
import { MigrationService } from "./migrations-service";
import type { SqliteHandle } from "./migrations-service";

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

async function openSqlite(filePath: string): Promise<SqliteHandle> {
  const wrap = (db: any): SqliteHandle => ({
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
      };
    },
    close: () => db.close(),
  });

  try {
    const bunSqliteSpecifier = "bun:sqlite";
    const mod: any = await import(/* @vite-ignore */ bunSqliteSpecifier);
    const Database = mod.Database || mod.default?.Database;
    if (Database) return wrap(new Database(filePath));
  } catch {}

  const { DatabaseSync } = await import("node:sqlite");
  return wrap(new DatabaseSync(filePath));
}

/** Path of the legacy JSON snapshot that preceded the SQLite index. */
export function legacyEmbeddingJsonPath(dbPath: string): string {
  const ext = path.extname(dbPath);
  const base = ext ? dbPath.slice(0, dbPath.length - ext.length) : dbPath;
  return `${base}.json`;
}

const DEFAULT_DIMENSION = 384;
const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
const RRF_K = 60;
// Search results are deduplicated per file after ranking; fetching a generous
// pool of chunk candidates keeps the `limit` unique-file promise robust even
// when a file owns many chunks.
const CANDIDATE_MULTIPLIER = 6;

interface VectorCacheRow {
  id: number;
  relativeFilePath: string;
  folder: string;
  vec: Float32Array;
  norm: number;
}

interface CandidateRow {
  id: number;
  relativeFilePath: string;
  folder: string;
  title?: string;
  text?: string;
  updatedAt?: number;
  score: number;
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
 * FTS5 MATCH is strict about its query syntax; quoting each token keeps user
 * input (quotes, parentheses, AND/OR...) from raising parser errors.
 */
function toFtsMatchQuery(term: string): string {
  const tokens = term.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return "";
  return tokens.map((token) => `"${token}"`).join(" ");
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let i = 0;
  for (; i + 4 <= n; i += 4) {
    dot +=
      a[i] * b[i] +
      a[i + 1] * b[i + 1] +
      a[i + 2] * b[i + 2] +
      a[i + 3] * b[i + 3];
  }
  for (; i < n; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function decodeVector(blob: unknown): Float32Array | null {
  if (!(blob instanceof Uint8Array)) return null;
  if (blob.byteLength === 0 || blob.byteLength % 4 !== 0) return null;
  const vec = new Float32Array(blob.byteLength / 4);
  new Uint8Array(vec.buffer).set(blob);
  return vec;
}

function toNumberArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((n) => typeof n === "number" && Number.isFinite(n))
      ? value
      : null;
  }
  if (value && typeof value === "object") {
    const length = (value as ArrayLike<unknown>).length;
    if (typeof length === "number" && Number.isFinite(length)) {
      try {
        return toNumberArray(Array.from(value as ArrayLike<unknown>));
      } catch {}
    }
  }
  return null;
}

/**
 * Owns the SQLite embedding index (fulltext via FTS5, vectors as float32
 * BLOBs). Instantiated inside the worker thread so that queries and the
 * brute-force vector scan never run on the main thread; also usable
 * in-thread as a fallback when the worker cannot be spawned.
 *
 * Every mutation is committed transactionally (WAL), so persistence is
 * incremental: there is no bulk snapshot to serialize anymore. A float32
 * vector cache is built lazily on the first vector search and then kept in
 * sync incrementally, trading memory (~dimension * 4 bytes per chunk) for
 * fast cosine scoring.
 */
export class EmbeddingDb {
  private dbPath: string;
  private db: SqliteHandle | null = null;
  private loaded = false;
  private dimension = DEFAULT_DIMENSION;

  private deleteByPathStmt: any = null;
  private insertChunkStmt: any = null;
  private chunkDetailStmt: any = null;
  private countByPathStmt: any = null;

  private vectorCache: VectorCacheRow[] = [];
  private vectorCacheIndex = new Map<number, number>();
  private vectorCacheReady = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async load(dimension = DEFAULT_DIMENSION): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = await openSqlite(this.dbPath);
    // Wait on transient locks (e.g. a terminating worker thread still
    // holding the file) instead of failing fast with SQLITE_BUSY.
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = NORMAL");
    // Schema lives in the migrations registry (src/migrations): the baseline
    // migration creates the chunks store and FTS5 mirror, the service stamps
    // the schema version into `meta` it owns.
    new MigrationService(this.database).migrate();

    const storedDimension = this.getMeta("dimension");
    const legacyPath = legacyEmbeddingJsonPath(this.dbPath);
    const legacyExists = await pathExists(legacyPath);
    const isEmpty = this.countChunks() === 0;

    if (!storedDimension && isEmpty && legacyExists) {
      try {
        const migratedDimension = await this.importLegacyJson(legacyPath);
        this.dimension = migratedDimension ?? dimension;
        this.setMeta("dimension", String(this.dimension));
      } catch (err) {
        // Failed import: leave the legacy snapshot in place and the
        // dimension unstamped, so the next load retries the migration
        // instead of parking an unimported snapshot as .bak.
        this.dimension = dimension;
        console.error("Error migrating legacy JSON embedding index:", err);
      }
    } else {
      this.dimension = Number(storedDimension) || dimension;
      if (!storedDimension) {
        // Fresh database: persist the detected dimension so subsequent
        // loads (with a different or default probe) keep accepting the
        // stored vectors instead of silently discarding them.
        this.setMeta("dimension", String(this.dimension));
      }
      if (legacyExists && storedDimension) {
        // SQLite is the source of truth; park any orphaned legacy snapshot.
        try {
          await fs.rm(`${legacyPath}.bak`, { force: true });
          await fs.rename(legacyPath, `${legacyPath}.bak`);
          console.log(
            "Legacy embeddings.json parked as embeddings.json.bak (SQLite index is the source of truth)",
          );
        } catch {}
      }
    }

    this.deleteByPathStmt = this.database.prepare(
      "DELETE FROM chunks WHERE relative_path = ?",
    );
    this.insertChunkStmt = this.database.prepare(
      "INSERT INTO chunks (relative_path, title, folder, text, updated_at, embedding) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.chunkDetailStmt = this.database.prepare(
      "SELECT title, text, updated_at FROM chunks WHERE id = ?",
    );
    // Prepared COUNT instead of the DELETE's `changes`: bun:sqlite counts
    // FTS5 trigger rows too, which would inflate removedCount.
    this.countByPathStmt = this.database.prepare(
      "SELECT COUNT(*) AS count FROM chunks WHERE relative_path = ?",
    );
    this.loaded = true;
  }

  private getMeta(key: string): string | null {
    const row = this.database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as any;
    return row ? String(row.value) : null;
  }

  private setMeta(key: string, value: string): void {
    this.database
      .prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  private countChunks(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM chunks")
      .get() as any;
    return Number(row?.count ?? 0);
  }

  /**
   * One-time import of the pre-SQLite JSON snapshot produced by
   * @orama/plugin-data-persistence ("json" format): documents live in
   * docs.docs keyed by id, with vectors as plain number arrays (unlike
   * search-after-restore, which drops vectors). Runs in a single transaction
   * so an interrupted migration rolls back and retries on the next load.
   * Throws on failure so load() can avoid stamping the dimension (which
   * would suppress future retry attempts); resolves null when the snapshot
   * is empty, which is a successful no-op.
   */
  private async importLegacyJson(legacyPath: string): Promise<number | null> {
    const content = await fs.readFile(legacyPath, "utf-8");
    const parsed: any = JSON.parse(content);
    const rawDocs: any[] = this.extractLegacyDocs(parsed);
    if (rawDocs.length === 0) {
      console.log(
        "Legacy JSON index is empty; nothing to migrate from",
        path.basename(legacyPath),
      );
      return null;
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const insertStmt = this.database.prepare(
        "INSERT INTO chunks (relative_path, title, folder, text, updated_at, embedding) VALUES (?, ?, ?, ?, ?, ?)",
      );
      let imported = 0;
      let dimension: number | null = null;

      for (const doc of rawDocs) {
        const embedding = toNumberArray(doc.embedding);
        if (embedding && dimension === null) {
          dimension = embedding.length;
        }
        insertStmt.run(
          String(doc.relativeFilePath ?? ""),
          String(doc.title ?? ""),
          String(doc.folder ?? ""),
          String(doc.text ?? ""),
          Number(doc.updatedAt) || 0,
          embedding
            ? new Uint8Array(Float32Array.from(embedding).buffer)
            : null,
        );
        imported++;
      }

      this.database.exec("COMMIT");
      console.log(
        `Migrated legacy JSON index into SQLite: ${imported} chunks from ${path.basename(legacyPath)}`,
      );
      try {
        await fs.rm(`${legacyPath}.bak`, { force: true });
        await fs.rename(legacyPath, `${legacyPath}.bak`);
      } catch {}
      return dimension;
    } catch (err) {
      this.database.exec("ROLLBACK");
      throw err;
    }
  }

  private extractLegacyDocs(parsed: any): any[] {
    const docs = parsed?.docs?.docs;
    if (Array.isArray(docs)) {
      return docs.filter((doc) => doc && typeof doc === "object");
    }
    if (docs && typeof docs === "object") {
      return Object.values(docs).filter(
        (doc: any) => doc && typeof doc === "object",
      );
    }
    return [];
  }

  /** Narrowed handle: throws if the database has not been loaded yet. */
  private get database(): SqliteHandle {
    if (!this.db) throw new Error("Embedding database is not loaded");
    return this.db;
  }

  async replaceNote(
    relativeFilePath: string,
    docs: EmbeddingDoc[],
    force = false,
  ): Promise<{ removedCount: number; skipped: boolean }> {
    const existing = this.database
      .prepare("SELECT updated_at FROM chunks WHERE relative_path = ? LIMIT 1")
      .get(relativeFilePath) as any;
    if (
      !force &&
      existing &&
      docs.length > 0 &&
      Number(existing.updated_at) === docs[0].updatedAt
    ) {
      return { removedCount: 0, skipped: true };
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      // COUNT instead of the DELETE's `changes`: bun:sqlite counts FTS5
      // trigger rows too, which would inflate removedCount.
      const removedCount = Number(
        (this.countByPathStmt.get(relativeFilePath) as any)?.count ?? 0,
      );
      this.deleteByPathStmt.run(relativeFilePath);
      const appended: Array<{ id: number; folder: string; vec: Float32Array }> =
        [];
      for (const doc of docs) {
        const vec =
          doc.embedding && doc.embedding.length === this.dimension
            ? Float32Array.from(doc.embedding)
            : null;
        const blob = vec
          ? new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength)
          : null;
        const result = this.insertChunkStmt.run(
          relativeFilePath,
          doc.title ?? "",
          doc.folder ?? "",
          doc.text ?? "",
          Number(doc.updatedAt) || 0,
          blob,
        );
        if (vec) {
          appended.push({
            id: Number(result.lastInsertRowid),
            folder: doc.folder ?? "",
            vec,
          });
        }
      }
      this.database.exec("COMMIT");

      if (this.vectorCacheReady) {
        this.dropFromVectorCache(relativeFilePath);
        for (const item of appended) {
          this.appendToVectorCache(
            item.id,
            relativeFilePath,
            item.folder,
            item.vec,
          );
        }
      }

      return { removedCount, skipped: false };
    } catch (err) {
      this.database.exec("ROLLBACK");
      throw err;
    }
  }

  async removeNote(relativeFilePath: string): Promise<number> {
    const removedCount = Number(
      (this.countByPathStmt.get(relativeFilePath) as any)?.count ?? 0,
    );
    if (removedCount > 0) {
      this.deleteByPathStmt.run(relativeFilePath);
    }
    if (this.vectorCacheReady) {
      this.dropFromVectorCache(relativeFilePath);
    }
    return removedCount;
  }

  async getIndexedFiles(): Promise<Array<[string, number]>> {
    const rows = this.database
      .prepare(
        "SELECT relative_path AS p, MAX(updated_at) AS u FROM chunks GROUP BY relative_path",
      )
      .all() as any[];
    return rows.map((row) => [String(row.p), Number(row.u)]);
  }

  /**
   * Files with at least one chunk lacking a stored vector. Used by the sync
   * backfill to re-embed notes that were indexed while the local model was
   * unavailable (or imported from the legacy JSON snapshot, which carried no
   * vectors); replaceNote rewrites every chunk, so one pass repairs a file.
   */
  async getFilesMissingVectors(): Promise<string[]> {
    const rows = this.database
      .prepare(
        "SELECT DISTINCT relative_path AS p FROM chunks WHERE embedding IS NULL",
      )
      .all() as any[];
    return rows.map((row) => String(row.p));
  }

  async search(searchParams: any, limit: number): Promise<SearchResultItem[]> {
    const params = searchParams ?? {};
    const mode: string = params.mode ?? "fulltext";
    const folder = params?.where?.folder?.eq ?? null;
    const term = typeof params.term === "string" ? params.term : "";
    const queryVector = params.vector?.value;
    const hasVector =
      Array.isArray(queryVector) && queryVector.length === this.dimension;
    const threshold =
      typeof params.similarity === "number"
        ? params.similarity
        : DEFAULT_SIMILARITY_THRESHOLD;
    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);

    if (hasVector && (mode === "vector" || mode === "hybrid")) {
      const query = Float32Array.from(queryVector);
      if (mode === "vector") {
        const candidates = this.searchVectors(
          query,
          folder,
          threshold,
          candidateLimit,
        );
        return this.toUniqueFileResults(candidates, limit);
      }
      if (term.trim()) {
        return this.searchHybrid(term, query, folder, threshold, limit);
      }
    }

    const candidates = this.searchFulltext(term, folder, candidateLimit);
    return this.toUniqueFileResults(candidates, limit);
  }

  /**
   * Kept for API compatibility. Every mutation is already committed to the
   * WAL-backed SQLite database inside its transaction, so there is no bulk
   * snapshot to flush; this merely nudges a passive WAL checkpoint.
   */
  async save(): Promise<void> {
    if (!this.db) return;
    try {
      this.database.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } catch {}
  }

  close(): void {
    if (!this.db) return;
    try {
      this.database.close();
    } catch {}
    this.db = null;
    this.loaded = false;
    this.deleteByPathStmt = null;
    this.insertChunkStmt = null;
    this.chunkDetailStmt = null;
    this.countByPathStmt = null;
    this.vectorCache = [];
    this.vectorCacheIndex.clear();
    this.vectorCacheReady = false;
  }

  private searchFulltext(
    term: string,
    folder: string | null,
    candidateLimit: number,
  ): CandidateRow[] {
    const matchQuery = toFtsMatchQuery(term);
    if (!matchQuery) return [];

    const rows =
      folder !== null
        ? (this.database
            .prepare(
              `SELECT c.id, c.relative_path, c.folder, c.title, c.text, c.updated_at, bm25(chunks_fts) AS fts_rank
               FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
               WHERE chunks_fts MATCH ? AND c.folder = ?
               ORDER BY fts_rank LIMIT ?`,
            )
            .all(matchQuery, folder, candidateLimit) as any[])
        : (this.database
            .prepare(
              `SELECT c.id, c.relative_path, c.folder, c.title, c.text, c.updated_at, bm25(chunks_fts) AS fts_rank
               FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
               WHERE chunks_fts MATCH ?
               ORDER BY fts_rank LIMIT ?`,
            )
            .all(matchQuery, candidateLimit) as any[]);

    return rows.map((row) => ({
      id: Number(row.id),
      relativeFilePath: String(row.relative_path),
      folder: String(row.folder),
      title: String(row.title ?? ""),
      text: String(row.text ?? ""),
      updatedAt: Number(row.updated_at) || 0,
      score: -Number(row.fts_rank),
    }));
  }

  private searchVectors(
    query: Float32Array,
    folder: string | null,
    threshold: number,
    candidateLimit: number,
  ): CandidateRow[] {
    this.ensureVectorCache();
    let queryNorm = 0;
    for (let i = 0; i < query.length; i++) {
      queryNorm += query[i] * query[i];
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    const scored: CandidateRow[] = [];
    for (const row of this.vectorCache) {
      if (folder !== null && row.folder !== folder) continue;
      const denom = row.norm * queryNorm;
      if (denom <= 0) continue;
      const score = dotProduct(row.vec, query) / denom;
      if (score >= threshold) {
        scored.push({
          id: row.id,
          relativeFilePath: row.relativeFilePath,
          folder: row.folder,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length > candidateLimit) scored.length = candidateLimit;
    return scored;
  }

  /**
   * Reciprocal Rank Fusion of the fulltext and vector candidate lists: a
   * chunk found by both strategies gets a boosted score, without needing the
   * two scoring scales to be comparable.
   */
  private searchHybrid(
    term: string,
    query: Float32Array,
    folder: string | null,
    threshold: number,
    limit: number,
  ): SearchResultItem[] {
    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);
    const ftsCandidates = this.searchFulltext(term, folder, candidateLimit);
    const vectorCandidates = this.searchVectors(
      query,
      folder,
      threshold,
      candidateLimit,
    );

    const fused = new Map<number, { row: CandidateRow; score: number }>();
    ftsCandidates.forEach((row, index) => {
      fused.set(row.id, { row, score: 1 / (RRF_K + index + 1) });
    });
    vectorCandidates.forEach((row, index) => {
      const contribution = 1 / (RRF_K + index + 1);
      const existing = fused.get(row.id);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(row.id, { row, score: contribution });
      }
    });

    const merged = [...fused.values()]
      .sort((a, b) => b.score - a.score)
      .map((entry) => ({ ...entry.row, score: entry.score }));
    return this.toUniqueFileResults(merged, limit);
  }

  private toUniqueFileResults(
    candidates: CandidateRow[],
    limit: number,
  ): SearchResultItem[] {
    const seen = new Set<string>();
    const results: SearchResultItem[] = [];

    for (const candidate of candidates) {
      if (seen.has(candidate.relativeFilePath)) continue;
      seen.add(candidate.relativeFilePath);

      let { title, text, updatedAt } = candidate;
      if (
        title === undefined ||
        text === undefined ||
        updatedAt === undefined
      ) {
        const row = this.chunkDetailStmt.get(candidate.id) as any;
        if (!row) continue;
        title = String(row.title ?? "");
        text = String(row.text ?? "");
        updatedAt = Number(row.updated_at) || 0;
      }

      results.push({
        filename: path.basename(candidate.relativeFilePath),
        folderName: candidate.folder,
        title,
        snippet: text,
        score: candidate.score,
        updatedAt,
      });
      if (results.length >= limit) break;
    }

    return results;
  }

  private ensureVectorCache(): void {
    if (this.vectorCacheReady) return;
    this.vectorCache = [];
    this.vectorCacheIndex.clear();
    const rows = this.database
      .prepare(
        "SELECT id, relative_path, folder, embedding FROM chunks WHERE embedding IS NOT NULL",
      )
      .all() as any[];
    for (const row of rows) {
      const vec = decodeVector(row.embedding);
      if (!vec || vec.length !== this.dimension) continue;
      this.appendToVectorCache(
        Number(row.id),
        String(row.relative_path),
        String(row.folder),
        vec,
      );
    }
    this.vectorCacheReady = true;
  }

  private appendToVectorCache(
    id: number,
    relativeFilePath: string,
    folder: string,
    vec: Float32Array,
  ): void {
    if (this.vectorCacheIndex.has(id)) return;
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    this.vectorCacheIndex.set(id, this.vectorCache.length);
    this.vectorCache.push({
      id,
      relativeFilePath,
      folder,
      vec,
      norm: Math.sqrt(norm),
    });
  }

  private dropFromVectorCache(relativeFilePath: string): void {
    for (let i = this.vectorCache.length - 1; i >= 0; i--) {
      if (this.vectorCache[i].relativeFilePath !== relativeFilePath) continue;
      const lastIdx = this.vectorCache.length - 1;
      this.vectorCacheIndex.delete(this.vectorCache[i].id);
      if (i !== lastIdx) {
        const moved = this.vectorCache[lastIdx];
        this.vectorCache[i] = moved;
        this.vectorCacheIndex.set(moved.id, i);
      }
      this.vectorCache.pop();
    }
  }
}
