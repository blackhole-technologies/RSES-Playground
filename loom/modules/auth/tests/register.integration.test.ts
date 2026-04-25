/**
 * Integration tests for POST /api/auth/register, exercising all three
 * registration_mode branches plus error mapping.
 *
 *   - disabled: 403 registration_disabled
 *   - open: 201 + cookie + user (auto-login); 409 on uniqueness
 *   - invite: 400 invalid_invite_code on missing/unknown/expired/used
 *     code; 201 on valid code; FOR UPDATE serializes concurrent
 *     consumers
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
import { createAuthMiddleware } from "../middleware";
import { createAuthRouter } from "../routes";
import { createLoginRateLimiter } from "../rate-limit";

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
  const rateLimiter = createLoginRateLimiter();
  app.use(createAuthMiddleware(handle));
  app.use("/api/auth", createAuthRouter(handle, rateLimiter));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function setMode(
  pool: pg.Pool,
  mode: "disabled" | "invite" | "open",
): Promise<void> {
  await pool.query(
    "UPDATE system_settings SET registration_mode = $1 WHERE key = 'default'",
    [mode],
  );
}

async function makeAdminUser(
  pool: pg.Pool,
  handle: DbHandle,
): Promise<string> {
  // Need a user to own invite codes (FK created_by). Reuse the auth
  // service rather than raw INSERT to keep the password hashing
  // consistent.
  const { registerUser } = await import("../service");
  const u = await registerUser(handle, {
    username: "admin",
    password: "passw0rd",
  });
  await pool.query("UPDATE users SET is_admin = TRUE WHERE id = $1", [u.id]);
  return u.id;
}

async function seedInviteCode(
  pool: pg.Pool,
  code: string,
  options: {
    createdBy: string;
    expiresAt?: Date | null;
    consumedBy?: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO invite_codes (code, created_by, expires_at, consumed_by, consumed_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      code,
      options.createdBy,
      options.expiresAt ?? null,
      options.consumedBy ?? null,
      options.consumedBy ? new Date() : null,
    ],
  );
}

describe.skipIf(!DB_URL)("POST /api/auth/register", () => {
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
    await pool.query("DELETE FROM invite_codes");
    await pool.query("DELETE FROM users");
    await pool.query(
      "UPDATE system_settings SET registration_mode = 'disabled' WHERE key = 'default'",
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("mode = disabled", () => {
    it("returns 403 with registration_disabled", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "alice",
            password: "passw0rd",
          }),
        });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "registration_disabled" });

        // No user created.
        const count = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM users",
        );
        expect(count.rows[0].count).toBe("0");
      } finally {
        await srv.close();
      }
    });
  });

  describe("mode = open", () => {
    beforeEach(async () => {
      await setMode(pool, "open");
    });

    it("creates the user, sets cookie, returns 201 with user (no passwordHash)", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "bob",
            password: "passw0rd",
            email: "bob@example.com",
          }),
        });
        expect(res.status).toBe(201);
        const setCookie = res.headers.getSetCookie?.()[0] ?? "";
        expect(setCookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
        const body = await res.json();
        expect(body.user.username).toBe("bob");
        expect(body.user.email).toBe("bob@example.com");
        expect(body.user.isAdmin).toBe(false);
        expect(body.user.passwordHash).toBeUndefined();
      } finally {
        await srv.close();
      }
    });

    it("409 username_taken on case-insensitive collision", async () => {
      const srv = await startServer(handle);
      try {
        await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "Carol",
            password: "passw0rd",
          }),
        });
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "carol",
            password: "passw0rd",
          }),
        });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: "username_taken" });
      } finally {
        await srv.close();
      }
    });

    it("400 invalid_request on bad input (e.g., short password)", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "dave",
            password: "short",
          }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
      } finally {
        await srv.close();
      }
    });
  });

  describe("mode = invite", () => {
    let adminId: string;

    beforeEach(async () => {
      adminId = await makeAdminUser(pool, handle);
      await setMode(pool, "invite");
    });

    it("400 invalid_invite_code when no code is provided", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "eve",
            password: "passw0rd",
          }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_invite_code" });
      } finally {
        await srv.close();
      }
    });

    it("400 invalid_invite_code on unknown code", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "frank",
            password: "passw0rd",
            inviteCode: "no-such-code",
          }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_invite_code" });
      } finally {
        await srv.close();
      }
    });

    it("creates the user and consumes the code on a valid invite", async () => {
      await seedInviteCode(pool, "GOOD-CODE", { createdBy: adminId });
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "grace",
            password: "passw0rd",
            inviteCode: "GOOD-CODE",
          }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.user.username).toBe("grace");
        expect(body.user.inviteCodeUsed).toBe("GOOD-CODE");

        const codeRow = await pool.query<{
          consumed_by: string;
          consumed_at: Date | null;
        }>("SELECT consumed_by, consumed_at FROM invite_codes WHERE code = $1", [
          "GOOD-CODE",
        ]);
        expect(codeRow.rows[0].consumed_by).toBe(body.user.id);
        expect(codeRow.rows[0].consumed_at).not.toBeNull();
      } finally {
        await srv.close();
      }
    });

    it("400 invalid_invite_code when the code has already been consumed", async () => {
      // Pre-consume the code by creating + linking a user manually.
      const prior = await handle.pool.query<{ id: string }>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
        ["prior", "hash"],
      );
      await seedInviteCode(pool, "USED-CODE", {
        createdBy: adminId,
        consumedBy: prior.rows[0].id,
      });

      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "henry",
            password: "passw0rd",
            inviteCode: "USED-CODE",
          }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_invite_code" });
      } finally {
        await srv.close();
      }
    });

    it("400 invalid_invite_code on an expired code", async () => {
      await seedInviteCode(pool, "EXPIRED-CODE", {
        createdBy: adminId,
        expiresAt: new Date(Date.now() - 1000),
      });

      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "ivy",
            password: "passw0rd",
            inviteCode: "EXPIRED-CODE",
          }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_invite_code" });
      } finally {
        await srv.close();
      }
    });

    it("FOR UPDATE serializes concurrent registrations: exactly one wins", async () => {
      await seedInviteCode(pool, "RACE-CODE", { createdBy: adminId });

      const srv = await startServer(handle);
      try {
        // Five parallel POSTs with the same code, distinct usernames.
        const responses = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            fetch(`${srv.baseUrl}/api/auth/register`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                username: `racer${i}`,
                password: "passw0rd",
                inviteCode: "RACE-CODE",
              }),
            }),
          ),
        );

        const created = responses.filter((r) => r.status === 201);
        const rejected = responses.filter((r) => r.status === 400);
        expect(created).toHaveLength(1);
        expect(rejected).toHaveLength(4);

        // Exactly one user landed.
        const userCount = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM users WHERE username LIKE 'racer%'",
        );
        expect(userCount.rows[0].count).toBe("1");
      } finally {
        await srv.close();
      }
    });
  });
});
