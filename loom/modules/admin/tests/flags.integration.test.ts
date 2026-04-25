/**
 * Integration tests for /api/admin/flags. Verifies:
 *
 *   - GET returns the full flag list (admin only)
 *   - PATCH /:key updates the flag and returns the new shape
 *   - PATCH /:key for unknown key → 404 with stable error
 *   - PATCH /:key with malformed body → 400
 *   - PATCH /:key with empty body → 400 (refine: at least one field)
 *   - GET / PATCH gated by auth + admin
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../../core/migrations/runner";
import type { DbHandle } from "../../../core/db";
import { registerUser, createSession } from "../../auth/service";
import { createAuthMiddleware } from "../../auth/middleware";
import { createAdminRouter } from "../routes";

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

interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

async function startServer(handle: DbHandle): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware(handle));
  app.use("/api/admin", createAdminRouter(handle));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function loginAs(
  pool: pg.Pool,
  handle: DbHandle,
  username: string,
  isAdmin: boolean,
): Promise<string> {
  const user = await registerUser(handle, {
    username,
    password: "passw0rd",
  });
  if (isAdmin) {
    await pool.query("UPDATE users SET is_admin = TRUE WHERE id = $1", [
      user.id,
    ]);
  }
  const session = await createSession(handle, user.id);
  return `session=${session.cookie}`;
}

/**
 * Insert a flag straight into the DB so tests can populate state
 * without going through the storage adapter (which is exercised by
 * its own test file). Keeps these tests focused on the route layer.
 */
async function seedFlag(
  pool: pg.Pool,
  flag: {
    key: string;
    name?: string;
    category?: string;
    globallyEnabled?: boolean;
    toggleable?: boolean;
    description?: string;
    tags?: string[];
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO feature_flags
       (key, name, description, category, globally_enabled, toggleable, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      flag.key,
      flag.name ?? flag.key,
      flag.description ?? "",
      flag.category ?? "optional",
      flag.globallyEnabled ?? false,
      flag.toggleable ?? true,
      JSON.stringify(flag.tags ?? []),
    ],
  );
}

describe.skipIf(!DB_URL)("/api/admin/flags", () => {
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

  beforeEach(async () => {
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM feature_rollout_history");
    await pool.query("DELETE FROM feature_flags");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("auth gating", () => {
    it("401s anonymous", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/admin/flags`);
        expect(res.status).toBe(401);
      } finally {
        await srv.close();
      }
    });

    it("403s non-admin", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "regular", false);
        const res = await fetch(`${srv.baseUrl}/api/admin/flags`, {
          headers: { cookie },
        });
        expect(res.status).toBe(403);
      } finally {
        await srv.close();
      }
    });
  });

  describe("GET /api/admin/flags", () => {
    it("returns an empty list when there are no flags", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/flags`, {
          headers: { cookie },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ flags: [] });
      } finally {
        await srv.close();
      }
    });

    it("returns every seeded flag with the vendor projection (changeHistory=[])", async () => {
      await seedFlag(pool, {
        key: "alpha",
        name: "Alpha",
        category: "core",
        globallyEnabled: true,
        toggleable: false,
      });
      await seedFlag(pool, {
        key: "beta",
        name: "Beta",
        category: "beta",
        globallyEnabled: false,
        tags: ["preview"],
      });

      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/flags`, {
          headers: { cookie },
        });
        const body = await res.json();
        expect(body.flags).toHaveLength(2);
        const byKey = Object.fromEntries(
          body.flags.map((f: { key: string }) => [f.key, f]),
        );
        expect(byKey.alpha.toggleable).toBe(false);
        expect(byKey.alpha.globallyEnabled).toBe(true);
        expect(byKey.beta.tags).toEqual(["preview"]);
        // Vendor projection invariants enforced by the storage adapter.
        expect(byKey.alpha.changeHistory).toEqual([]);
        expect(byKey.beta.dependents).toEqual([]);
      } finally {
        await srv.close();
      }
    });
  });

  describe("PATCH /api/admin/flags/:key", () => {
    it("updates fields and returns the new flag", async () => {
      await seedFlag(pool, { key: "feature_x", globallyEnabled: false });
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(
          `${srv.baseUrl}/api/admin/flags/feature_x`,
          {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              globallyEnabled: true,
              description: "Newly enabled",
            }),
          },
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.globallyEnabled).toBe(true);
        expect(body.description).toBe("Newly enabled");

        // Verify persisted.
        const verify = await fetch(`${srv.baseUrl}/api/admin/flags`, {
          headers: { cookie },
        });
        const flags = (await verify.json()).flags;
        const x = flags.find((f: { key: string }) => f.key === "feature_x");
        expect(x.globallyEnabled).toBe(true);
        expect(x.description).toBe("Newly enabled");
      } finally {
        await srv.close();
      }
    });

    it("404s on an unknown flag key", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(
          `${srv.baseUrl}/api/admin/flags/nope`,
          {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ globallyEnabled: true }),
          },
        );
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body).toEqual({ error: "flag_not_found" });
      } finally {
        await srv.close();
      }
    });

    it("400s on an empty body (refine: at least one field)", async () => {
      await seedFlag(pool, { key: "y" });
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/flags/y`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });

    it("400s on wrong field types (e.g. globallyEnabled as a string)", async () => {
      await seedFlag(pool, { key: "z" });
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/flags/z`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ globallyEnabled: "true" }),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });

    it("403s non-admin PATCH attempts", async () => {
      await seedFlag(pool, { key: "secured", globallyEnabled: false });
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "regular", false);
        const res = await fetch(
          `${srv.baseUrl}/api/admin/flags/secured`,
          {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ globallyEnabled: true }),
          },
        );
        expect(res.status).toBe(403);
        // DB row unchanged.
        const row = await pool.query<{ globally_enabled: boolean }>(
          "SELECT globally_enabled FROM feature_flags WHERE key = $1",
          ["secured"],
        );
        expect(row.rows[0].globally_enabled).toBe(false);
      } finally {
        await srv.close();
      }
    });
  });
});
