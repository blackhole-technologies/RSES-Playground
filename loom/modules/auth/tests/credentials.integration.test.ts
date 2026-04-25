/**
 * Integration tests for registerUser + verifyCredentials.
 *
 * Verifies SPEC §5.2 (registration validation, case-insensitive
 * uniqueness) and §5.3 (login verification, anti-enumeration via
 * uniform null return for unknown user / wrong password / disabled
 * account).
 *
 * Skipped without TEST_DATABASE_URL. Drops/recreates `public` schema
 * each run for determinism.
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
  verifyCredentials,
  UsernameTakenError,
  EmailTakenError,
} from "../service";

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

describe.skipIf(!DB_URL)("auth.service: credentials", () => {
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
    // Wipe user-scoped data between tests; system_settings is left alone
    // (these tests don't touch bootstrap state).
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM invite_codes");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("registerUser", () => {
    it("creates a non-admin user with hashed password", async () => {
      const user = await registerUser(handle, {
        username: "alice",
        password: "passw0rd",
        email: "alice@example.com",
        displayName: "Alice",
      });

      expect(user.username).toBe("alice");
      expect(user.email).toBe("alice@example.com");
      expect(user.displayName).toBe("Alice");
      expect(user.isAdmin).toBe(false);
      expect(user.disabled).toBe(false);
      // The stored hash is salt:hash hex format (from vendor/13). It
      // should not be the literal plaintext.
      expect(user.passwordHash).not.toBe("passw0rd");
      expect(user.passwordHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    });

    it("works with only the required fields (no email, no displayName)", async () => {
      const user = await registerUser(handle, {
        username: "bob",
        password: "passw0rd",
      });
      expect(user.username).toBe("bob");
      expect(user.email).toBeNull();
      expect(user.displayName).toBeNull();
    });

    it("allows multiple users with no email (partial unique index)", async () => {
      await registerUser(handle, { username: "noemail1", password: "passw0rd" });
      await registerUser(handle, { username: "noemail2", password: "passw0rd" });
      // No throw means the partial index correctly skips NULL emails.
    });

    it("throws UsernameTakenError on case-insensitive collision", async () => {
      await registerUser(handle, { username: "Charlie", password: "passw0rd" });
      await expect(
        registerUser(handle, { username: "charlie", password: "passw0rd" }),
      ).rejects.toBeInstanceOf(UsernameTakenError);
    });

    it("throws EmailTakenError on case-insensitive collision", async () => {
      await registerUser(handle, {
        username: "dave",
        password: "passw0rd",
        email: "Dave@Example.com",
      });
      await expect(
        registerUser(handle, {
          username: "eve",
          password: "passw0rd",
          email: "DAVE@example.COM",
        }),
      ).rejects.toBeInstanceOf(EmailTakenError);
    });

    it("rejects too-short usernames (Zod)", async () => {
      await expect(
        registerUser(handle, { username: "ab", password: "passw0rd" }),
      ).rejects.toThrow(/username/i);
    });

    it("rejects too-long usernames (Zod)", async () => {
      await expect(
        registerUser(handle, {
          username: "a".repeat(33),
          password: "passw0rd",
        }),
      ).rejects.toThrow(/username/i);
    });

    it("rejects usernames with disallowed characters (Zod)", async () => {
      await expect(
        registerUser(handle, {
          username: "has space",
          password: "passw0rd",
        }),
      ).rejects.toThrow(/username/i);
      await expect(
        registerUser(handle, {
          username: "has@symbol",
          password: "passw0rd",
        }),
      ).rejects.toThrow(/username/i);
    });

    it("rejects too-short passwords (Zod)", async () => {
      await expect(
        registerUser(handle, { username: "frank", password: "1234567" }),
      ).rejects.toThrow(/password/i);
    });

    it("rejects malformed emails (Zod)", async () => {
      await expect(
        registerUser(handle, {
          username: "grace",
          password: "passw0rd",
          email: "not-an-email",
        }),
      ).rejects.toThrow(/email/i);
    });

    it("stores invite_code_used when provided", async () => {
      const user = await registerUser(handle, {
        username: "henry",
        password: "passw0rd",
        inviteCodeUsed: "INVITE-XYZ",
      });
      expect(user.inviteCodeUsed).toBe("INVITE-XYZ");
    });
  });

  describe("verifyCredentials", () => {
    it("returns the User on correct credentials", async () => {
      const created = await registerUser(handle, {
        username: "ivy",
        password: "passw0rd",
      });
      const result = await verifyCredentials(handle, "ivy", "passw0rd");
      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.username).toBe("ivy");
    });

    it("returns null on wrong password", async () => {
      await registerUser(handle, { username: "jack", password: "passw0rd" });
      const result = await verifyCredentials(handle, "jack", "wrong-password");
      expect(result).toBeNull();
    });

    it("returns null on unknown username", async () => {
      const result = await verifyCredentials(
        handle,
        "no-such-user",
        "passw0rd",
      );
      expect(result).toBeNull();
    });

    it("is case-insensitive on username (matches functional index)", async () => {
      await registerUser(handle, { username: "Karen", password: "passw0rd" });
      // Look up with different cases — all should succeed.
      const lower = await verifyCredentials(handle, "karen", "passw0rd");
      const upper = await verifyCredentials(handle, "KAREN", "passw0rd");
      const mixed = await verifyCredentials(handle, "kArEn", "passw0rd");
      expect(lower).not.toBeNull();
      expect(upper).not.toBeNull();
      expect(mixed).not.toBeNull();
      // Returned username preserves the original casing.
      expect(lower!.username).toBe("Karen");
    });

    it("returns null for disabled users (anti-enumeration)", async () => {
      const created = await registerUser(handle, {
        username: "leo",
        password: "passw0rd",
      });
      await pool.query("UPDATE users SET disabled = TRUE WHERE id = $1", [
        created.id,
      ]);
      const result = await verifyCredentials(handle, "leo", "passw0rd");
      expect(result).toBeNull();
    });
  });
});
