/**
 * Integration tests for /api/admin/invite-codes — GET (list), POST
 * (create), DELETE (revoke).
 *
 *   - 401 / 403 / 200 gating consistent with other admin endpoints
 *   - POST generates a 22-char base64url code and persists with
 *     createdBy = caller's user id
 *   - POST with expiresAt body sets the column; ISO datetime required
 *   - GET returns codes newest-first
 *   - DELETE returns 204 on hit, 404 on miss; can delete consumed codes
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
): Promise<{ cookie: string; userId: string }> {
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
  return { cookie: `session=${session.cookie}`, userId: user.id };
}

describe.skipIf(!DB_URL)("/api/admin/invite-codes", () => {
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
    await pool.query("DELETE FROM invite_codes");
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("auth gating", () => {
    it("401s anonymous", async () => {
      const srv = await startServer(handle);
      try {
        const list = await fetch(`${srv.baseUrl}/api/admin/invite-codes`);
        expect(list.status).toBe(401);
        const create = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        expect(create.status).toBe(401);
      } finally {
        await srv.close();
      }
    });

    it("403s non-admin", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "nope", false);
        const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: "{}",
        });
        expect(res.status).toBe(403);
      } finally {
        await srv.close();
      }
    });
  });

  describe("POST /api/admin/invite-codes", () => {
    it("creates a 22-char base64url code with createdBy = caller", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie, userId } = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: "{}",
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(body.createdBy).toBe(userId);
        expect(body.expiresAt).toBeNull();
        expect(body.consumedBy).toBeNull();
        expect(body.consumedAt).toBeNull();
      } finally {
        await srv.close();
      }
    });

    it("accepts an ISO expiresAt and persists it", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString();
        const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ expiresAt: future }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.expiresAt).toBe(future);
      } finally {
        await srv.close();
      }
    });

    it("400s when expiresAt is not a valid ISO datetime", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ expiresAt: "not-a-date" }),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });
  });

  describe("GET /api/admin/invite-codes", () => {
    it("returns an empty list when none exist", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          headers: { cookie },
        });
        const body = await res.json();
        expect(body).toEqual({ inviteCodes: [] });
      } finally {
        await srv.close();
      }
    });

    it("returns codes newest-first", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        // Create three codes via the API and capture the order.
        const codes: string[] = [];
        for (let i = 0; i < 3; i++) {
          const res = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: "{}",
          });
          const body = await res.json();
          codes.push(body.code);
          // Slight gap so created_at ordering is deterministic.
          await new Promise((r) => setTimeout(r, 5));
        }
        const list = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          headers: { cookie },
        });
        const body = await list.json();
        expect(body.inviteCodes).toHaveLength(3);
        // Reverse-chronological: most recent first.
        expect(body.inviteCodes[0].code).toBe(codes[2]);
        expect(body.inviteCodes[2].code).toBe(codes[0]);
      } finally {
        await srv.close();
      }
    });
  });

  describe("DELETE /api/admin/invite-codes/:code", () => {
    it("204s on success and removes the row", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        const created = await fetch(`${srv.baseUrl}/api/admin/invite-codes`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: "{}",
        });
        const { code } = await created.json();

        const del = await fetch(
          `${srv.baseUrl}/api/admin/invite-codes/${encodeURIComponent(code)}`,
          { method: "DELETE", headers: { cookie } },
        );
        expect(del.status).toBe(204);

        const remain = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM invite_codes WHERE code = $1",
          [code],
        );
        expect(remain.rows[0].count).toBe("0");
      } finally {
        await srv.close();
      }
    });

    it("404s on a code that doesn't exist", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie } = await loginAs(pool, handle, "admin", true);
        const res = await fetch(
          `${srv.baseUrl}/api/admin/invite-codes/not-a-code`,
          { method: "DELETE", headers: { cookie } },
        );
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body).toEqual({ error: "invite_code_not_found" });
      } finally {
        await srv.close();
      }
    });

    it("can delete a consumed code without affecting the consumer user", async () => {
      const srv = await startServer(handle);
      try {
        const { cookie, userId: adminId } = await loginAs(
          pool,
          handle,
          "admin",
          true,
        );
        // Seed a consumed invite code directly so the test doesn't
        // depend on /register existing yet.
        const consumer = await registerUser(handle, {
          username: "consumer",
          password: "passw0rd",
        });
        await pool.query(
          `INSERT INTO invite_codes (code, created_by, consumed_by, consumed_at)
           VALUES ('used-code', $1, $2, NOW())`,
          [adminId, consumer.id],
        );

        const del = await fetch(
          `${srv.baseUrl}/api/admin/invite-codes/used-code`,
          { method: "DELETE", headers: { cookie } },
        );
        expect(del.status).toBe(204);

        // Consumer user remains.
        const userRes = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM users WHERE id = $1",
          [consumer.id],
        );
        expect(userRes.rows[0].count).toBe("1");
      } finally {
        await srv.close();
      }
    });
  });
});
