/**
 * Integration test for 0001_feature_flags_init.sql. Verifies that the
 * migration applies cleanly AND that the FK / index invariants the
 * migration claims hold up:
 *
 *   - feature_flags + feature_rollout_history tables exist
 *   - feature_rollout_history.flag_key → feature_flags(key) cascades
 *     on flag delete
 *   - feature_rollout_history.user_id → users(id) goes to NULL on user
 *     delete (NOT cascade — preserves audit)
 *   - the (flag_key, timestamp DESC) index is present
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { createMigrationRunner } from "../../../core/migrations/runner";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..", "..");

describe.skipIf(!DB_URL)("feature-flags migration: 0001_feature_flags_init", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");

    const runner = createMigrationRunner({
      databaseUrl: DB_URL!,
      directories: [
        "core/migrations",
        "engines/*/migrations",
        "modules/*/migrations",
      ],
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

  it("creates feature_flags and feature_rollout_history tables", async () => {
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('feature_flags', 'feature_rollout_history')
       ORDER BY table_name`,
    );
    expect(res.rows.map((r) => r.table_name)).toEqual([
      "feature_flags",
      "feature_rollout_history",
    ]);
  });

  it("declares the (flag_key, timestamp DESC) index per SPEC §4.7", async () => {
    const res = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'feature_rollout_history'
         AND indexname = 'feature_rollout_history_flag_key_timestamp_idx'`,
    );
    expect(res.rows).toHaveLength(1);
    // pg_indexes returns a normalized CREATE INDEX. Postgres quotes
    // `timestamp` because it's a reserved word, so the actual text is
    // `"timestamp" DESC`. The regex tolerates the optional quotes.
    expect(res.rows[0].indexdef).toMatch(/"?timestamp"?\s+DESC/);
  });

  it("cascades feature_rollout_history rows when their flag is deleted", async () => {
    await pool.query(
      `INSERT INTO feature_flags (key, name, globally_enabled)
       VALUES ($1, $2, TRUE)`,
      ["temp_flag", "Temp Flag"],
    );
    await pool.query(
      `INSERT INTO feature_rollout_history (flag_key, event_type, new_value)
       VALUES ($1, 'enabled', '{"globallyEnabled": true}'::jsonb)`,
      ["temp_flag"],
    );

    await pool.query("DELETE FROM feature_flags WHERE key = $1", [
      "temp_flag",
    ]);

    const remaining = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM feature_rollout_history WHERE flag_key = $1",
      ["temp_flag"],
    );
    expect(remaining.rows[0].count).toBe("0");
  });

  it("nulls feature_rollout_history.user_id when the actor user is deleted", async () => {
    // Create flag, user, and a history row tying them together.
    await pool.query(
      `INSERT INTO feature_flags (key, name, globally_enabled)
       VALUES ($1, $2, TRUE)`,
      ["audit_flag", "Audit Flag"],
    );
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, is_admin)
       VALUES ($1, $2, TRUE) RETURNING id`,
      ["audit_admin", "hash"],
    );
    const userId = userRes.rows[0].id;
    await pool.query(
      `INSERT INTO feature_rollout_history (flag_key, event_type, user_id, reason)
       VALUES ($1, 'rollout_changed', $2, 'manual')`,
      ["audit_flag", userId],
    );

    // Deleting the user must NOT remove the history row — only NULL
    // out user_id.
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    const check = await pool.query<{
      reason: string | null;
      user_id: string | null;
    }>(
      "SELECT reason, user_id FROM feature_rollout_history WHERE flag_key = $1",
      ["audit_flag"],
    );
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0].user_id).toBeNull();
    expect(check.rows[0].reason).toBe("manual");
  });

  it("default values fire on minimal insert (category, globally_enabled, toggleable, default_state, tags)", async () => {
    await pool.query(
      "INSERT INTO feature_flags (key, name) VALUES ($1, $2)",
      ["minimal_flag", "Minimal"],
    );
    const res = await pool.query<{
      category: string;
      globally_enabled: boolean;
      toggleable: boolean;
      default_state: boolean;
      tags: unknown;
    }>(
      `SELECT category, globally_enabled, toggleable, default_state, tags
       FROM feature_flags WHERE key = $1`,
      ["minimal_flag"],
    );
    expect(res.rows[0].category).toBe("general");
    expect(res.rows[0].globally_enabled).toBe(false);
    expect(res.rows[0].toggleable).toBe(true);
    expect(res.rows[0].default_state).toBe(false);
    expect(res.rows[0].tags).toEqual([]);
  });
});
