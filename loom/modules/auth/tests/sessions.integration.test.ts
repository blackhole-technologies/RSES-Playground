/**
 * Integration tests for session lifecycle: createSession, loadSessionUser,
 * deleteSession, expireSessions. Verifies SPEC §5.3:
 *
 *   - 90-day absolute cap from created_at
 *   - 30-day sliding inactivity window
 *   - last_login_at updates on createSession
 *   - last_active_at bumps on each loadSessionUser
 *   - disabled users cannot resolve a cookie even with a valid session
 *   - logout deletes the session row exactly once
 *   - expireSessions sweeps both expiry conditions
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../../core/migrations/runner";
import type { DbHandle } from "../../../core/db";
import {
  registerUser,
  createSession,
  loadSessionUser,
  deleteSession,
  expireSessions,
} from "../service";
import type { User } from "../schema";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..", "..");

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

async function makeUser(handle: DbHandle, username: string): Promise<User> {
  return registerUser(handle, { username, password: "passw0rd" });
}

describe.skipIf(!DB_URL)("auth.service: sessions", () => {
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

  beforeEach(async () => {
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("createSession", () => {
    it("returns a Session with a 43-char base64url cookie", async () => {
      const user = await makeUser(handle, "alice");
      const session = await createSession(handle, user.id);

      expect(session.userId).toBe(user.id);
      expect(session.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("sets expires_at to ~90 days from created_at", async () => {
      const user = await makeUser(handle, "bob");
      const session = await createSession(handle, user.id);

      const created = new Date(session.createdAt).getTime();
      const expires = new Date(session.expiresAt).getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      // Allow 1 second tolerance for SQL clock vs Node clock skew.
      expect(Math.abs(expires - created - ninetyDaysMs)).toBeLessThan(1000);
    });

    it("updates the user's last_login_at", async () => {
      const user = await makeUser(handle, "carol");
      expect(user.lastLoginAt).toBeNull();

      await createSession(handle, user.id);

      const res = await pool.query<{ last_login_at: Date | null }>(
        "SELECT last_login_at FROM users WHERE id = $1",
        [user.id],
      );
      expect(res.rows[0].last_login_at).not.toBeNull();
    });

    it("stores ip and userAgent when provided", async () => {
      const user = await makeUser(handle, "dave");
      const session = await createSession(handle, user.id, {
        ip: "10.0.0.1",
        userAgent: "Loom-Test/1.0",
      });
      expect(session.ip).toBe("10.0.0.1");
      expect(session.userAgent).toBe("Loom-Test/1.0");
    });

    it("leaves ip/userAgent NULL when not provided", async () => {
      const user = await makeUser(handle, "eve");
      const session = await createSession(handle, user.id);
      expect(session.ip).toBeNull();
      expect(session.userAgent).toBeNull();
    });
  });

  describe("loadSessionUser", () => {
    it("returns the User for a valid cookie", async () => {
      const user = await makeUser(handle, "frank");
      const session = await createSession(handle, user.id);

      const result = await loadSessionUser(handle, session.cookie);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
      expect(result!.username).toBe("frank");
    });

    it("bumps last_active_at on a valid lookup (sliding window)", async () => {
      const user = await makeUser(handle, "grace");
      const session = await createSession(handle, user.id);

      // Backdate last_active_at so the next loadSessionUser is a real bump.
      await pool.query(
        "UPDATE sessions SET last_active_at = NOW() - INTERVAL '5 days' WHERE id = $1",
        [session.id],
      );

      await loadSessionUser(handle, session.cookie);

      const res = await pool.query<{ last_active_at: Date }>(
        "SELECT last_active_at FROM sessions WHERE id = $1",
        [session.id],
      );
      const ageSeconds =
        (Date.now() - new Date(res.rows[0].last_active_at).getTime()) / 1000;
      expect(ageSeconds).toBeLessThan(10);
    });

    it("returns null for an unknown cookie", async () => {
      const result = await loadSessionUser(handle, "no-such-cookie");
      expect(result).toBeNull();
    });

    it("returns null after the absolute 90-day cap", async () => {
      const user = await makeUser(handle, "henry");
      const session = await createSession(handle, user.id);

      // Force expires_at into the past.
      await pool.query(
        "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
        [session.id],
      );

      const result = await loadSessionUser(handle, session.cookie);
      expect(result).toBeNull();
    });

    it("returns null after exceeding the 30-day inactivity window", async () => {
      const user = await makeUser(handle, "ivy");
      const session = await createSession(handle, user.id);

      // Backdate last_active_at past the 30-day cutoff while keeping
      // expires_at fresh — proves the sliding cutoff fires independently.
      await pool.query(
        "UPDATE sessions SET last_active_at = NOW() - INTERVAL '31 days' WHERE id = $1",
        [session.id],
      );

      const result = await loadSessionUser(handle, session.cookie);
      expect(result).toBeNull();
    });

    it("returns null when the user is disabled", async () => {
      const user = await makeUser(handle, "jack");
      const session = await createSession(handle, user.id);

      await pool.query("UPDATE users SET disabled = TRUE WHERE id = $1", [
        user.id,
      ]);

      const result = await loadSessionUser(handle, session.cookie);
      expect(result).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("returns true when a session is deleted", async () => {
      const user = await makeUser(handle, "karen");
      const session = await createSession(handle, user.id);
      const ok = await deleteSession(handle, session.cookie);
      expect(ok).toBe(true);

      const result = await loadSessionUser(handle, session.cookie);
      expect(result).toBeNull();
    });

    it("returns false when no session matches the cookie", async () => {
      const ok = await deleteSession(handle, "not-a-real-cookie");
      expect(ok).toBe(false);
    });

    it("is idempotent — second delete returns false, no error", async () => {
      const user = await makeUser(handle, "leo");
      const session = await createSession(handle, user.id);
      expect(await deleteSession(handle, session.cookie)).toBe(true);
      expect(await deleteSession(handle, session.cookie)).toBe(false);
    });
  });

  describe("expireSessions", () => {
    it("deletes sessions past their absolute expiry", async () => {
      const user = await makeUser(handle, "mia");
      const session = await createSession(handle, user.id);

      await pool.query(
        "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [session.id],
      );

      const removed = await expireSessions(handle);
      expect(removed).toBe(1);

      const remaining = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM sessions",
      );
      expect(remaining.rows[0].count).toBe("0");
    });

    it("deletes sessions past the inactivity window", async () => {
      const user = await makeUser(handle, "nick");
      const session = await createSession(handle, user.id);

      await pool.query(
        "UPDATE sessions SET last_active_at = NOW() - INTERVAL '31 days' WHERE id = $1",
        [session.id],
      );

      const removed = await expireSessions(handle);
      expect(removed).toBe(1);
    });

    it("leaves fresh sessions alone", async () => {
      const user = await makeUser(handle, "olive");
      await createSession(handle, user.id);
      const removed = await expireSessions(handle);
      expect(removed).toBe(0);
    });

    it("returns the count of rows removed across multiple users", async () => {
      const a = await makeUser(handle, "pete");
      const b = await makeUser(handle, "quinn");
      const sa = await createSession(handle, a.id);
      const sb = await createSession(handle, b.id);
      await createSession(handle, a.id); // fresh, should survive

      // Make the first two stale via different paths.
      await pool.query(
        "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [sa.id],
      );
      await pool.query(
        "UPDATE sessions SET last_active_at = NOW() - INTERVAL '31 days' WHERE id = $1",
        [sb.id],
      );

      const removed = await expireSessions(handle);
      expect(removed).toBe(2);

      const remaining = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM sessions",
      );
      expect(remaining.rows[0].count).toBe("1");
    });
  });
});
