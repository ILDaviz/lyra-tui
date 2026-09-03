import type { Migration } from "../services/migrations-service";
import initial from "./001_initial";

/**
 * Explicit registry of schema migrations, in ascending id order. To add a
 * new one: create `NNN_name.ts` exporting `Migration` and register it here
 * (never edit or renumber existing entries).
 */
export const MIGRATIONS: Migration[] = [initial].sort((a, b) => a.id - b.id);
