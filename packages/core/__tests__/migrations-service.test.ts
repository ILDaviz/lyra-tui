import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MigrationService } from "../src/services/migrations-service";
import type {
  Migration,
  SqliteHandle,
} from "../src/services/migrations-service";
import { MIGRATIONS } from "../src/migrations";

let dir: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseSync: any;

beforeAll(async () => {
  ({ DatabaseSync } = await import("node:sqlite"));
});

function dbPath(): string {
  return path.join(dir, "test.db");
}

function openSync(): SqliteHandle {
  return new DatabaseSync(dbPath()) as unknown as SqliteHandle;
}

function versionOf(db: SqliteHandle): string | null {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as any;
  return row ? String(row.value) : null;
}

function migration(
  id: number,
  body: (db: SqliteHandle) => void = () => {},
): Migration {
  return { id, up: body };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lyra-migrations-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("MigrationService", () => {
  it("migrates a fresh database to the latest registry version", () => {
    const db = openSync();
    // The service creates the meta table itself; no manual setup needed.
    const service = new MigrationService(db);
    expect(service.latestVersion).toBe(MIGRATIONS.length);
    expect(service.migrate()).toBe(service.latestVersion);
    expect(versionOf(db)).toBe(String(service.latestVersion));
  });

  it("runs each pending migration in its own transaction with the version stamp", () => {
    const db = openSync();
    const calls: number[] = [];
    const migrations = [
      migration(1, () => {
        calls.push(1);
      }),
      migration(2, (handle) => {
        calls.push(2);
        handle.exec("CREATE TABLE things (id INTEGER PRIMARY KEY)");
      }),
      migration(3, () => {
        calls.push(3);
      }),
    ];
    const service = new MigrationService(db, { migrations });
    expect(service.migrate()).toBe(3);
    expect(calls).toEqual([1, 2, 3]);
    expect(versionOf(db)).toBe("3");
  });

  it("applies only migrations above the stored version", () => {
    const db = openSync();
    // Stamp version 1 through a first migration run.
    expect(
      new MigrationService(db, { migrations: [migration(1)] }).migrate(),
    ).toBe(1);
    const calls: number[] = [];
    const service = new MigrationService(db, {
      migrations: [
        migration(1, () => calls.push(1)),
        migration(2, () => calls.push(2)),
      ],
    });
    expect(service.migrate()).toBe(2);
    expect(calls).toEqual([2]);
    expect(versionOf(db)).toBe("2");
  });

  it("rolls back a failed migration and leaves the version unstamped", () => {
    const db = openSync();
    db.exec("CREATE TABLE existing (id INTEGER PRIMARY KEY);");
    const migrations: Migration[] = [
      migration(1),
      migration(2, (handle) => {
        handle.exec("INSERT INTO existing VALUES (1)");
        throw new Error("boom");
      }),
    ];
    const service = new MigrationService(db, { migrations });
    expect(() => service.migrate()).toThrow("boom");
    // The last committed step (migration 1) stays stamped.
    expect(versionOf(db)).toBe("1");
    // The failed migration's partial writes are rolled back too.
    const rows = db
      .prepare("SELECT COUNT(*) AS count FROM existing")
      .get() as any;
    expect(Number(rows.count)).toBe(0);
    // A retry re-runs only the failed step.
    const retry = new MigrationService(db, {
      migrations: [migration(1), migration(2)],
    });
    expect(retry.migrate()).toBe(2);
    expect(versionOf(db)).toBe("2");
  });

  it("refuses to skip a missing migration id", () => {
    const db = openSync();
    const service = new MigrationService(db, {
      migrations: [migration(1), migration(3)],
    });
    expect(() => service.migrate()).toThrow("Missing migration 2");
  });

  it("warns and keeps the schema when the stored version is newer", () => {
    const db = openSync();
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('schema_version', '9')",
    ).run();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const calls: number[] = [];
      const service = new MigrationService(db, {
        migrations: [migration(1, () => calls.push(1))],
      });
      expect(service.migrate()).toBe(9);
      expect(calls).toEqual([]);
      expect(versionOf(db)).toBe("9");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("newer than supported"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("reports an empty registry as version 0 without stamping meta", () => {
    const db = openSync();
    const service = new MigrationService(db, { migrations: [] });
    expect(service.latestVersion).toBe(0);
    expect(service.migrate()).toBe(0);
    expect(versionOf(db)).toBeNull();
  });
});
