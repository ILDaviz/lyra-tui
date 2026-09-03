import { MIGRATIONS } from "../migrations";

/**
 * Minimal common surface of `bun:sqlite` (production runtime) and
 * `node:sqlite` (tests run under Node via vitest). Bun 1.3 does not ship
 * `node:sqlite`, and `bun:sqlite` is not resolvable under Node, hence the
 * dual driver in the embedding database loader.
 */
export interface SqliteStatement {
  run(...params: unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
}

export interface SqliteHandle {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export interface Migration {
  id: number;
  up(db: SqliteHandle): void;
}

export interface MigrationServiceOptions {
  /** `meta` key the applied version is stamped into. */
  versionKey?: string;
  /** Migrations to apply; defaults to the shared registry in src/migrations. */
  migrations?: Migration[];
}

/**
 * Generic schema migration runner for SQLite databases that stamp their
 * schema version into a `meta(key, value)` table. Each pending migration
 * commits atomically together with its version stamp, so an interrupted
 * migration rolls back and retries from the last durable version.
 */
export class MigrationService {
  private db: SqliteHandle;
  private migrations: Migration[];
  private versionKey: string;

  constructor(db: SqliteHandle, options: MigrationServiceOptions = {}) {
    this.db = db;
    this.migrations = options.migrations ?? MIGRATIONS;
    this.versionKey = options.versionKey ?? "schema_version";
  }

  /** Highest migration id known to the registry. */
  get latestVersion(): number {
    return this.migrations.length > 0
      ? Math.max(...this.migrations.map((m) => m.id))
      : 0;
  }

  /** Version currently stamped in `meta`, or 0 when unstamped. */
  appliedVersion(): number {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(this.versionKey) as any;
    if (!row) return 0;
    const version = Number.parseInt(String(row.value), 10);
    return Number.isFinite(version) && version > 0 ? version : 0;
  }

  /**
   * Ensures the version-tracking `meta` table exists, then applies every
   * pending migration. A stored version newer than the registry means the
   * database was written by a newer build: warn and leave the schema
   * untouched rather than corrupting it.
   */
  migrate(): number {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    const stored = this.appliedVersion();
    if (stored > this.latestVersion) {
      console.warn(
        `Database schema version ${stored} is newer than supported (${this.latestVersion}); continuing with the existing schema`,
      );
      return stored;
    }

    let version = stored;
    for (const migration of [...this.migrations].sort((a, b) => a.id - b.id)) {
      if (migration.id <= version) continue;
      if (migration.id > version + 1) {
        throw new Error(
          `Missing migration ${version + 1}: cannot jump from version ${version} to ${migration.id}`,
        );
      }
      this.db.exec("BEGIN IMMEDIATE");
      try {
        migration.up(this.db);
        this.db
          .prepare(
            "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run(this.versionKey, String(migration.id));
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
      version = migration.id;
    }
    return version;
  }
}
