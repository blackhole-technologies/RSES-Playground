/**
 * Integration test for 0001_auth_init.sql — verifies the migration
 * applies cleanly AND that the hand-rolled DDL actually enforces the
 * invariants the SQL comments claim: case-insensitive uniqueness on
 * username and email, partial unique index for optional email, FK
 * cascade on sessions.user_id, FK SET NULL on invite_codes.consumed_by.
 *
 * Gated on TEST_DATABASE_URL — skips cleanly on the `pnpm test` fast
 * path, runs on `pnpm test:integration` (which points at loom_test).
 *
 * DESTRUCTIVE: drops the `public` schema on every run. Safe against
 * `loom_test` (the whole point of that DB); never set TEST_DATABASE_URL
 * to anything you want to keep.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { createMigrationRunner } from "../../../core/migrations/runner";

const DB_URL = process.env.TEST_DATABASE_URL;

// Resolve the loom/ project root from this test file's location so the
// migration runner's relative `directories` paths resolve correctly
// regardless of which working directory vitest was launched from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..", "..");

describe.skipIf(!DB_URL)("auth migration: 0001_auth_init", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

    // Reset schema so every run starts from a known-empty state. The
    // migration runner then re-applies core + auth migrations on top.
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");

    const runner = createMigrationRunner({
      databaseUrl: DB_URL!,
      directories: ["core/migrations", "modules/*/migrations"],
      baseDir: LOOM_ROOT,
    });
    try {
      await runner.up();
    } finally {
      await runner.close();
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates users, sessions, invite_codes tables", async () => {
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users', 'sessions', 'invite_codes')
       ORDER BY table_name`,
    );
    expect(res.rows.map((r) => r.table_name)).toEqual([
      "invite_codes",
      "sessions",
      "users",
    ]);
  });

  it("rejects case-collision usernames via the functional unique index", async () => {
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      ["Alice", "hash1"],
    );
    await expect(
      pool.query(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
        ["alice", "hash2"],
      ),
    ).rejects.toThrow(/users_username_lower_idx|duplicate key/i);
  });

  it("allows multiple users with NULL email (partial index)", async () => {
    // Two distinct users with NULL email — the partial unique index
    // skips rows with NULL email entirely, so no uniqueness collision
    // fires.
    await pool.query(
      "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, NULL)",
      ["bob", "hash"],
    );
    await pool.query(
      "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, NULL)",
      ["charlie", "hash"],
    );
    // Reaching here without throw = pass.
  });

  it("rejects case-collision emails when both non-null", async () => {
    await pool.query(
      "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3)",
      ["dave", "hash", "dave@example.com"],
    );
    await expect(
      pool.query(
        "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3)",
        ["eve", "hash", "DAVE@EXAMPLE.COM"],
      ),
    ).rejects.toThrow(/users_email_lower_idx|duplicate key/i);
  });

  it("cascades session deletion when the owning user is deleted", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2) RETURNING id`,
      ["frank", "hash"],
    );
    const userId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO sessions (user_id, cookie, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [userId, "frank-cookie"],
    );

    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    const check = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(check.rows[0].count).toBe("0");
  });

  it("sets consumed_by to NULL (not cascade) when consumer user is deleted", async () => {
    const adminRes = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, is_admin)
       VALUES ($1, $2, TRUE) RETURNING id`,
      ["admin", "hash"],
    );
    const adminId = adminRes.rows[0].id;

    const consumerRes = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2) RETURNING id`,
      ["consumer", "hash"],
    );
    const consumerId = consumerRes.rows[0].id;

    await pool.query(
      `INSERT INTO invite_codes (code, created_by, consumed_by, consumed_at)
       VALUES ($1, $2, $3, NOW())`,
      ["CODE123", adminId, consumerId],
    );

    // Deleting the consumer user must NOT remove the invite_codes row;
    // instead, consumed_by should become NULL. The row stays as an audit
    // record that this code was used (so it cannot be reissued).
    await pool.query("DELETE FROM users WHERE id = $1", [consumerId]);

    const check = await pool.query<{
      code: string;
      consumed_by: string | null;
    }>(
      "SELECT code, consumed_by FROM invite_codes WHERE code = $1",
      ["CODE123"],
    );
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0].consumed_by).toBeNull();
  });
});
