/**
 * Integration tests for /api/admin/settings.
 *
 * Verifies:
 *   - 401 / 403 / 200 gating: anonymous → 401, non-admin → 403, admin → 200
 *   - PATCH applies only the provided fields and bumps updated_at
 *   - PATCH with bad shape → 400 (Zod)
 *   - PATCH with bad enum → 400
 *   - PATCH with empty body → 400 (refine: at least one field)
 *   - Admin tooling cannot read bootstrap_token_hash via this endpoint
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

describe.skipIf(!DB_URL)("/api/admin/settings", () => {
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
    // Reset settings to seeded defaults so update tests start from a
    // known state.
    await pool.query(
      `UPDATE system_settings
       SET registration_mode = 'disabled',
           default_rate_limit_per_min = 60,
           retention_classification_log_days = 30,
           retention_soft_deleted_days = 30,
           bootstrap_token_hash = NULL,
           bootstrap_token_consumed_at = NULL
       WHERE key = 'default'`,
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("auth gating", () => {
    it("401s anonymous requests", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`);
        expect(res.status).toBe(401);
      } finally {
        await srv.close();
      }
    });

    it("403s non-admin users", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "regular", false);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).toEqual({ error: "forbidden" });
      } finally {
        await srv.close();
      }
    });

    it("200s admin users", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        expect(res.status).toBe(200);
      } finally {
        await srv.close();
      }
    });
  });

  describe("GET /api/admin/settings", () => {
    it("returns the canonical settings projection (no secrets)", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        const body = await res.json();
        expect(body).toMatchObject({
          registrationMode: "disabled",
          defaultRateLimitPerMin: 60,
          retentionClassificationLogDays: 30,
          retentionSoftDeletedDays: 30,
        });
        expect(typeof body.updatedAt).toBe("string");
        // Sensitive fields must NOT escape into the response.
        expect(body.bootstrapTokenHash).toBeUndefined();
        expect(body.bootstrap_token_hash).toBeUndefined();
        expect(body.bootstrapTokenConsumedAt).toBeUndefined();
      } finally {
        await srv.close();
      }
    });
  });

  describe("PATCH /api/admin/settings", () => {
    it("updates registrationMode and bumps updated_at", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const before = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        const beforeUpdated = (await before.json()).updatedAt;

        await new Promise((r) => setTimeout(r, 10));

        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ registrationMode: "open" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.registrationMode).toBe("open");
        expect(body.updatedAt).not.toBe(beforeUpdated);

        // Persisted: read again from a fresh request.
        const verify = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        const fresh = await verify.json();
        expect(fresh.registrationMode).toBe("open");
      } finally {
        await srv.close();
      }
    });

    it("updates only the provided fields (others untouched)", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ defaultRateLimitPerMin: 120 }),
        });
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          headers: { cookie },
        });
        const body = await res.json();
        expect(body.defaultRateLimitPerMin).toBe(120);
        // registrationMode stays at its default — was not in the patch body.
        expect(body.registrationMode).toBe("disabled");
      } finally {
        await srv.close();
      }
    });

    it("400s on an invalid registrationMode value", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ registrationMode: "banana" }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
      } finally {
        await srv.close();
      }
    });

    it("400s on an empty body (refine: at least one field)", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });

    it("400s on negative retention days", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ retentionClassificationLogDays: -1 }),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });

    it("403s non-admin PATCH attempts (no settings change)", async () => {
      const srv = await startServer(handle);
      try {
        const cookie = await loginAs(pool, handle, "regular", false);
        const res = await fetch(`${srv.baseUrl}/api/admin/settings`, {
          method: "PATCH",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ registrationMode: "open" }),
        });
        expect(res.status).toBe(403);
        // DB unchanged.
        const settings = await pool.query<{ registration_mode: string }>(
          "SELECT registration_mode FROM system_settings WHERE key = 'default'",
        );
        expect(settings.rows[0].registration_mode).toBe("disabled");
      } finally {
        await srv.close();
      }
    });
  });
});
