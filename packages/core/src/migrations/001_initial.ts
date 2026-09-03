import type { SqliteHandle } from "../services/migrations-service";

/**
 * Baseline schema of the embedding index: chunk store, FTS5 external-content
 * mirror kept in sync by triggers, and lookup indexes. Idempotent (`IF NOT
 * EXISTS`) so databases created before version stamping upgrade cleanly.
 * The `meta` table is created by the MigrationService itself.
 */
export default {
  id: 1,
  up(db: SqliteHandle): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        relative_path TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        folder TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        updated_at REAL NOT NULL DEFAULT 0,
        embedding BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_relative_path ON chunks(relative_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_folder ON chunks(folder);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text, title, content='chunks', content_rowid='id', tokenize='porter unicode61'
      );
      CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, text, title) VALUES (new.id, new.text, new.title);
      END;
      CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text, title) VALUES ('delete', old.id, old.text, old.title);
      END;
      CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text, title) VALUES ('delete', old.id, old.text, old.title);
        INSERT INTO chunks_fts(rowid, text, title) VALUES (new.id, new.text, new.title);
      END;
    `);
  },
};
