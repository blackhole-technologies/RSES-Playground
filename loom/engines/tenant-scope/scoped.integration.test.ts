/**
 * Integration tests for the tenant-scope engine's scoped() and
 * withDbUserScope() helpers — the core isolation primitives.
 *
 * Most importantly, satisfies completion criterion 7: "Property test —
 * 20 random (userA, userB) tuples — userA's scoped query cannot see
 * userB's sessions." This is implemented as 20 deterministic
 * outer-iterations × 19 inner cross-checks, so each registered user is
 * verified to see only their own sessions while none of the other 19
 * users' rows leak through.
 *
 * Also covers withDbUserScope's set_config behavior (the session var
 * `app.current_user_id` is bound inside the transaction) — the
 * mechanism behind future Postgres RLS policies.
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../core/migrations/runner";
import type { DbHandle } from "../../core/db";
import {
  registerUser,
  createSession,
} from "../../modules/auth/service";
import { sessions } from "../../modules/auth/schema";
import { createTenantScope, type TenantScope } from "./index";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..");

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

describe.skipIf(!DB_URL)("tenant-scope: scoped() & withDbUserScope", () => {
  let pool: pg.Pool;
  let handle: DbHandle;
  let tenantScope: TenantScope;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    handle = makeTestHandle(pool);
    tenantScope = createTenantScope(handle);
    // Register `sessions` as user-scoped on its userId column — the
    // shape that production bootstrap will replicate.
    tenantScope.register(sessions, sessions.userId);

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

  describe("scoped().select", () => {
    it("returns only the bound user's session rows", async () => {
      const a = await registerUser(handle, {
        username: "alice",
        password: "passw0rd",
      });
      const b = await registerUser(handle, {
        username: "bob",
        password: "passw0rd",
      });
      await createSession(handle, a.id);
      await createSession(handle, b.id);
      await createSession(handle, a.id); // alice has 2 sessions

      const aSeen = await tenantScope.scoped(a.id).select(sessions);
      const bSeen = await tenantScope.scoped(b.id).select(sessions);

      expect(aSeen).toHaveLength(2);
      expect(aSeen.every((s) => s.userId === a.id)).toBe(true);
      expect(bSeen).toHaveLength(1);
      expect(bSeen[0].userId).toBe(b.id);
    });

    it("returns an empty array for a user with no rows", async () => {
      const a = await registerUser(handle, {
        username: "carol",
        password: "passw0rd",
      });
      const result = await tenantScope.scoped(a.id).select(sessions);
      expect(result).toEqual([]);
    });

    it("rejects an empty userId", async () => {
      expect(() => tenantScope.scoped("")).toThrow(/non-empty userId/);
    });
  });

  describe("isolation property: 20 users × 19 cross-checks", () => {
    it("each user's scoped(sessions) sees only their own session", async () => {
      const N = 20;
      const ids: string[] = [];
      for (let i = 0; i < N; i++) {
        const u = await registerUser(handle, {
          username: `user${i.toString().padStart(2, "0")}`,
          password: "passw0rd",
        });
        ids.push(u.id);
        await createSession(handle, u.id);
      }

      // 20 outer iterations: for each user, verify the scoped query
      // returns exactly their session AND none of the other 19.
      for (let i = 0; i < N; i++) {
        const own = ids[i];
        const seen = await tenantScope.scoped(own).select(sessions);

        expect(seen).toHaveLength(1);
        expect(seen[0].userId).toBe(own);

        // 19 inner cross-checks: none of the other users' ids appear
        // in the result. This is what criterion 7 demands — a leak
        // would surface here as "user X seen in user Y's result".
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const other = ids[j];
          expect(seen.find((s) => s.userId === other)).toBeUndefined();
        }
      }
    });
  });

  describe("withDbUserScope", () => {
    it("sets app.current_user_id inside the transaction", async () => {
      const a = await registerUser(handle, {
        username: "dave",
        password: "passw0rd",
      });
      const seen = await tenantScope.withDbUserScope(a.id, async (tx) => {
        const res = await tx.execute<{ current: string }>(
          sql`SELECT current_setting('app.current_user_id', true) AS current`,
        );
        return res.rows[0].current;
      });
      expect(seen).toBe(a.id);
    });

    it("the session var is local to the transaction (clears on commit)", async () => {
      const a = await registerUser(handle, {
        username: "eve",
        password: "passw0rd",
      });
      // Bind once, then rebind a different user — values must not bleed.
      await tenantScope.withDbUserScope(a.id, async (tx) => {
        await tx.execute(
          sql`SELECT current_setting('app.current_user_id', true)`,
        );
      });

      // After the prior tx commits, opening a fresh tx without binding
      // should observe an empty/null app.current_user_id (set_config
      // with is_local=true clears on tx end).
      const post = await handle.db.transaction(async (tx) => {
        const res = await tx.execute<{ current: string | null }>(
          sql`SELECT current_setting('app.current_user_id', true) AS current`,
        );
        return res.rows[0].current;
      });
      // Postgres returns "" for an unset GUC accessed with is_missing_ok.
      expect(post === "" || post === null).toBe(true);
    });
  });
});
