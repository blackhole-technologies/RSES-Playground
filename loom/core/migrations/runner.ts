/**
 * Migration runner.
 *
 * Scans the configured migration directories, applies any not yet
 * recorded in the `_migrations` table, tracks them. Applies each
 * migration inside a transaction — a failed migration leaves the DB
 * in the pre-migration state, not a partial one.
 *
 * Migrations are plain SQL files. File name determines apply order
 * (lexicographic). Pattern: `NNNN_description.sql`.
 *
 * Up-only. Rollback is "write a later migration that undoes the bad
 * one" — fewer footguns than down-migrations in production.
 *
 * Usage:
 *   const runner = createMigrationRunner({
 *     databaseUrl: config.databaseUrl,
 *     directories: [
 *       "core/migrations",
 *       "modules/* /migrations",
 *     ],
 *   });
 *   await runner.up();
 *   await runner.close();
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface MigrationRunnerConfig {
  /** Postgres connection URL. */
  databaseUrl: string;

  /**
   * Directories to scan for `*.sql` files. May include glob-style
   * `modules/* /migrations` entries — the runner expands one layer of
   * `*` before scanning. Deeper globs are not supported.
   */
  directories: string[];

  /**
   * Base directory that relative entries in `directories` resolve
   * against. Defaults to process.cwd().
   */
  baseDir?: string;
}

export interface MigrationRecord {
  name: string;
  path: string;
  applied_at: Date;
}

export interface MigrationRunner {
  /** Apply all pending migrations. Returns the names applied in order. */
  up(): Promise<string[]>;

  /** List migrations already recorded in `_migrations`. */
  applied(): Promise<MigrationRecord[]>;

  /** Return pending files (discovered minus applied). */
  pending(): Promise<Array<{ name: string; path: string }>>;

  /** Close the connection pool. */
  close(): Promise<void>;
}

export function createMigrationRunner(
  config: MigrationRunnerConfig,
): MigrationRunner {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 1,
  });
  const base = config.baseDir ?? process.cwd();

  async function ensureTrackingTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async function expandDirs(): Promise<string[]> {
    const out: string[] = [];
    for (const entry of config.directories) {
      if (!entry.includes("*")) {
        out.push(path.resolve(base, entry));
        continue;
      }
      // Support a single `*` segment — e.g. "modules/*/migrations".
      const [prefix, suffix] = entry.split("*", 2);
      const parent = path.resolve(base, prefix.replace(/\/$/, ""));
      let children: string[];
      try {
        children = await readdir(parent);
      } catch {
        continue;
      }
      for (const child of children) {
        const candidate = path.join(parent, child, suffix.replace(/^\//, ""));
        try {
          const s = await stat(candidate);
          if (s.isDirectory()) out.push(candidate);
        } catch {
          // directory doesn't exist; skip
        }
      }
    }
    return out;
  }

  async function discover(): Promise<Array<{ name: string; path: string }>> {
    const dirs = await expandDirs();
    const files: Array<{ name: string; path: string }> = [];
    for (const dir of dirs) {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".sql")) continue;
        files.push({ name: entry, path: path.join(dir, entry) });
      }
    }
    // Lexicographic by filename — zero-pad your migrations.
    files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return files;
  }

  async function applied(): Promise<MigrationRecord[]> {
    await ensureTrackingTable();
    const result = await pool.query<MigrationRecord>(
      "SELECT name, applied_at FROM _migrations ORDER BY name",
    );
    return result.rows.map((r) => ({ ...r, path: "" }));
  }

  async function pending(): Promise<Array<{ name: string; path: string }>> {
    const [all, done] = await Promise.all([discover(), applied()]);
    const doneNames = new Set(done.map((r) => r.name));
    return all.filter((f) => !doneNames.has(f.name));
  }

  async function up(): Promise<string[]> {
    await ensureTrackingTable();
    const todo = await pending();
    const applied: string[] = [];

    for (const file of todo) {
      const sql = await readFile(file.path, "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          file.name,
        ]);
        await client.query("COMMIT");
        applied.push(file.name);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(
          `Migration failed: ${file.name}\n${(err as Error).message}`,
        );
      } finally {
        client.release();
      }
    }

    return applied;
  }

  async function close(): Promise<void> {
    await pool.end();
  }

  return { up, applied, pending, close };
}
