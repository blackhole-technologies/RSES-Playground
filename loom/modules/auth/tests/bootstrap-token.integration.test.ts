/**
 * Integration tests for createBootstrapToken / consumeBootstrapToken.
 *
 * Verifies SPEC §5.1 first-boot semantics directly against Postgres:
 *
 *   - token generated on empty DB, stored as a hash (raw never persisted)
 *   - generation skipped when a token already exists, when bootstrap was
 *     already consumed, or when any users exist
 *   - consume with the right token creates the admin and marks consumed
 *   - consume with the wrong token, after consumption, or with no token
 *     at all returns null (caller renders 404 — anti-enumeration)
 *   - concurrent consume calls serialize via SELECT ... FOR UPDATE: one
 *     wins with a User, the other returns null cleanly (no 500)
 *   - concurrent create calls produce exactly one token
 *
 * Skipped without TEST_DATABASE_URL. Drops/recreates `public` schema on
 * every run for determinism — destructive against `loom_test`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../../core/migrations/runner";
import type { DbHandle } from "../../../core/db";
import {
  createBootstrapToken,
  consumeBootstrapToken,
} from "../service";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..", "..");

/**
 * Build a test DbHandle directly from a pool. We do not call
 * createDbHandle() because that requires a fully-validated Config — too
 * much ceremony for a focused service test. The breaker is configured
 * with a high failure threshold so it never trips during tests.
 */
function makeTestHandle(pool: pg.Pool): DbHandle {
  const breaker = new CircuitBreaker({
    name: "test",
    failureThreshold: 1000,
    resetTimeout: 1000,
    successThreshold: 1,
  });
  return {
    pool,
    db: drizzle(pool),
    breaker,
    query: (op) => op(),
  };
}

describe.skipIf(!DB_URL)("auth.service: bootstrap token", () => {
  let pool: pg.Pool;
  let handle: DbHandle;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    handle = makeTestHandle(pool);

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

  // Reset just the data each test, not the schema. Faster than full
  // schema drop and isolates each scenario from sibling state.
  beforeEach(async () => {
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM invite_codes");
    await pool.query("DELETE FROM users");
    await pool.query(
      `UPDATE system_settings
       SET bootstrap_token_hash = NULL,
           bootstrap_token_consumed_at = NULL
       WHERE key = 'default'`,
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("createBootstrapToken", () => {
    it("returns a 24-char URL-safe token on an empty DB", async () => {
      const token = await createBootstrapToken(handle);
      expect(token).not.toBeNull();
      expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    });

    it("stores a SHA-256 hash, never the raw token", async () => {
      const token = await createBootstrapToken(handle);
      const res = await pool.query<{ bootstrap_token_hash: string | null }>(
        "SELECT bootstrap_token_hash FROM system_settings WHERE key = 'default'",
      );
      const stored = res.rows[0].bootstrap_token_hash;
      expect(stored).not.toBeNull();
      expect(stored).toMatch(/^[a-f0-9]{64}$/);
      expect(stored).not.toBe(token);
      // The stored hash matches sha256(token).
      const expected = crypto
        .createHash("sha256")
        .update(token!)
        .digest("hex");
      expect(stored).toBe(expected);
    });

    it("returns null when a token already exists (idempotent)", async () => {
      const first = await createBootstrapToken(handle);
      const second = await createBootstrapToken(handle);
      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it("returns null when users already exist", async () => {
      await pool.query(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
        ["existing", "hash"],
      );
      const token = await createBootstrapToken(handle);
      expect(token).toBeNull();
    });

    it("returns null after the token has been consumed", async () => {
      const token = await createBootstrapToken(handle);
      await consumeBootstrapToken(handle, token!, {
        username: "admin",
        password: "passw0rd",
      });
      // Bootstrap is permanently complete now. Even if all users are
      // deleted (which beforeEach does), `consumed_at` stays set as the
      // permanent record.
      await pool.query("DELETE FROM users");
      const second = await createBootstrapToken(handle);
      expect(second).toBeNull();
    });

    it("serializes concurrent calls — only one token is generated", async () => {
      // Fire several creates simultaneously. Exactly one should return a
      // token; the others should return null. This proves the FOR UPDATE
      // lock prevents two parallel writers from both generating.
      const results = await Promise.all(
        Array.from({ length: 5 }, () => createBootstrapToken(handle)),
      );
      const successes = results.filter((r) => r !== null);
      const nulls = results.filter((r) => r === null);
      expect(successes).toHaveLength(1);
      expect(nulls).toHaveLength(4);
    });
  });

  describe("consumeBootstrapToken", () => {
    it("creates an admin user and marks consumed when token matches", async () => {
      const token = await createBootstrapToken(handle);
      const user = await consumeBootstrapToken(handle, token!, {
        username: "admin",
        password: "passw0rd",
        email: "admin@example.com",
        displayName: "Admin",
      });

      expect(user).not.toBeNull();
      expect(user!.username).toBe("admin");
      expect(user!.isAdmin).toBe(true);
      expect(user!.email).toBe("admin@example.com");
      expect(user!.displayName).toBe("Admin");

      const settings = await pool.query<{
        bootstrap_token_consumed_at: Date | null;
      }>(
        "SELECT bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
      );
      expect(settings.rows[0].bootstrap_token_consumed_at).not.toBeNull();
    });

    it("returns null when token is wrong", async () => {
      await createBootstrapToken(handle);
      const user = await consumeBootstrapToken(handle, "not-the-token-x", {
        username: "admin",
        password: "passw0rd",
      });
      expect(user).toBeNull();

      // No user inserted, token still active.
      const userCount = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM users",
      );
      expect(userCount.rows[0].count).toBe("0");
      const settings = await pool.query<{
        bootstrap_token_hash: string | null;
        bootstrap_token_consumed_at: Date | null;
      }>(
        "SELECT bootstrap_token_hash, bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
      );
      expect(settings.rows[0].bootstrap_token_hash).not.toBeNull();
      expect(settings.rows[0].bootstrap_token_consumed_at).toBeNull();
    });

    it("returns null when no token is set", async () => {
      // No createBootstrapToken called — system_settings has NULL hash.
      const user = await consumeBootstrapToken(handle, "any-token-string", {
        username: "admin",
        password: "passw0rd",
      });
      expect(user).toBeNull();
    });

    it("returns null on second consume with the same token", async () => {
      const token = await createBootstrapToken(handle);
      const first = await consumeBootstrapToken(handle, token!, {
        username: "admin",
        password: "passw0rd",
      });
      expect(first).not.toBeNull();

      const second = await consumeBootstrapToken(handle, token!, {
        username: "admin2",
        password: "passw0rd",
      });
      expect(second).toBeNull();

      const userCount = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM users",
      );
      expect(userCount.rows[0].count).toBe("1");
    });

    it("rejects invalid input synchronously (Zod)", async () => {
      const token = await createBootstrapToken(handle);

      await expect(
        consumeBootstrapToken(handle, token!, {
          username: "ab", // too short (< 3 chars)
          password: "passw0rd",
        }),
      ).rejects.toThrow(/username/i);

      await expect(
        consumeBootstrapToken(handle, token!, {
          username: "valid_user",
          password: "short", // too short (< 8 chars)
        }),
      ).rejects.toThrow(/password/i);

      // Token still active — invalid input must not consume it.
      const settings = await pool.query<{
        bootstrap_token_consumed_at: Date | null;
      }>(
        "SELECT bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
      );
      expect(settings.rows[0].bootstrap_token_consumed_at).toBeNull();
    });

    it("serializes concurrent consume calls — exactly one wins", async () => {
      const token = await createBootstrapToken(handle);

      // Five parallel consumes with the same valid token. One should
      // win (return a user, the row's username will be unique to that
      // call). The other four should return null. Critically, none of
      // them should throw — the lock + consumed_at check turns the
      // race into a clean miss for the losers.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          consumeBootstrapToken(handle, token!, {
            username: `admin${i}`,
            password: "passw0rd",
          }),
        ),
      );

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof consumeBootstrapToken>>> =>
          r.status === "fulfilled",
      );
      // No throws — the FOR UPDATE serialization must NOT raise.
      expect(fulfilled).toHaveLength(5);

      const wins = fulfilled.filter((r) => r.value !== null);
      const losses = fulfilled.filter((r) => r.value === null);
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(4);

      // Exactly one user in the DB, and it's an admin.
      const userRows = await pool.query<{ count: string; admins: string }>(
        `SELECT COUNT(*)::text AS count,
                SUM(CASE WHEN is_admin THEN 1 ELSE 0 END)::text AS admins
         FROM users`,
      );
      expect(userRows.rows[0].count).toBe("1");
      expect(userRows.rows[0].admins).toBe("1");
    });
  });
});
