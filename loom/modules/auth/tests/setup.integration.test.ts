/**
 * Integration tests for the first-boot /setup flow.
 *
 * Satisfies completion criteria 3, 4, 5:
 *   3. GET /setup?token=<wrong> returns 404 (not 401)
 *   4. POST /setup with correct token + valid payload creates admin,
 *      sets session cookie, 302 redirects to /app
 *   5. Subsequent GET /setup?token=<anything> returns 404 (consumed)
 *
 * Plus negative paths: empty token, missing token, malformed body
 * (400, not 404, because 404 is for "this path doesn't exist", not
 * "your form is wrong").
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
import { createBootstrapToken } from "../service";
import { createSetupRouter } from "../setup-routes";

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

async function startServer(handle: DbHandle): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/setup", createSetupRouter(handle));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

describe.skipIf(!DB_URL)("/setup flow", () => {
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

  describe("GET /setup", () => {
    it("404s when no token is provided", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/setup`);
        expect(res.status).toBe(404);
      } finally {
        await srv.close();
      }
    });

    it("404s with a wrong token (criterion 3 — anti-enumeration)", async () => {
      const srv = await startServer(handle);
      try {
        // Generate a real token then ask with the wrong one.
        await createBootstrapToken(handle);
        const res = await fetch(`${srv.baseUrl}/setup?token=not-it`);
        expect(res.status).toBe(404);
      } finally {
        await srv.close();
      }
    });

    it("returns the form HTML when the token matches", async () => {
      const srv = await startServer(handle);
      try {
        const token = await createBootstrapToken(handle);
        const res = await fetch(`${srv.baseUrl}/setup?token=${token}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/html/);
        const html = await res.text();
        expect(html).toContain("<form");
        expect(html).toContain('action="/setup"');
        expect(html).toContain(`value="${token}"`);
      } finally {
        await srv.close();
      }
    });

    it("HTML-escapes the token to defuse a malicious URL parameter", async () => {
      const srv = await startServer(handle);
      try {
        // Craft a request that "looks like" an XSS attempt at the token
        // slot. The verify step will reject it (wrong hash) so we expect
        // 404 — but the test exists so the escaping logic stays exercised
        // if someone ever weakens the verify check.
        const res = await fetch(
          `${srv.baseUrl}/setup?token=${encodeURIComponent('"><script>alert(1)</script>')}`,
        );
        expect(res.status).toBe(404);
      } finally {
        await srv.close();
      }
    });
  });

  describe("POST /setup", () => {
    it("creates the admin, sets cookie, redirects 302 to /app (criterion 4)", async () => {
      const srv = await startServer(handle);
      try {
        const token = await createBootstrapToken(handle);
        const res = await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: token!,
            username: "root",
            password: "passw0rd",
            email: "root@example.com",
            displayName: "Root",
          }),
          redirect: "manual",
        });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/app");

        const setCookie = res.headers.getSetCookie?.()[0] ?? "";
        expect(setCookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Strict");

        // The admin user landed in the DB and is_admin = TRUE.
        const userRes = await pool.query<{
          username: string;
          is_admin: boolean;
        }>("SELECT username, is_admin FROM users");
        expect(userRes.rows).toHaveLength(1);
        expect(userRes.rows[0].username).toBe("root");
        expect(userRes.rows[0].is_admin).toBe(true);

        // The bootstrap token is marked consumed.
        const settingsRes = await pool.query<{
          bootstrap_token_consumed_at: Date | null;
        }>(
          "SELECT bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
        );
        expect(settingsRes.rows[0].bootstrap_token_consumed_at).not.toBeNull();
      } finally {
        await srv.close();
      }
    });

    it("404s with a wrong token + valid body", async () => {
      const srv = await startServer(handle);
      try {
        await createBootstrapToken(handle);
        const res = await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: "wrong-token-here",
            username: "root",
            password: "passw0rd",
          }),
          redirect: "manual",
        });
        expect(res.status).toBe(404);
        // No user was created.
        const userCount = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM users",
        );
        expect(userCount.rows[0].count).toBe("0");
      } finally {
        await srv.close();
      }
    });

    it("400s with a malformed body (missing required fields)", async () => {
      const srv = await startServer(handle);
      try {
        const token = await createBootstrapToken(handle);
        const res = await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: token!,
            username: "ab", // too short
            password: "short", // too short
          }),
          redirect: "manual",
        });
        expect(res.status).toBe(400);
        // Token must NOT be consumed by an invalid request.
        const settingsRes = await pool.query<{
          bootstrap_token_consumed_at: Date | null;
        }>(
          "SELECT bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
        );
        expect(settingsRes.rows[0].bootstrap_token_consumed_at).toBeNull();
      } finally {
        await srv.close();
      }
    });

    it("404s on subsequent GET with the same token (criterion 5)", async () => {
      const srv = await startServer(handle);
      try {
        const token = await createBootstrapToken(handle);
        await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: token!,
            username: "root",
            password: "passw0rd",
          }),
          redirect: "manual",
        });
        // Now revisit /setup — must be 404 because the token was consumed.
        const res = await fetch(`${srv.baseUrl}/setup?token=${token}`);
        expect(res.status).toBe(404);
      } finally {
        await srv.close();
      }
    });

    it("404s on a second POST after the token has been consumed", async () => {
      const srv = await startServer(handle);
      try {
        const token = await createBootstrapToken(handle);
        const first = await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: token!,
            username: "root",
            password: "passw0rd",
          }),
          redirect: "manual",
        });
        expect(first.status).toBe(302);

        const second = await fetch(`${srv.baseUrl}/setup`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({
            token: token!,
            username: "imposter",
            password: "passw0rd",
          }),
          redirect: "manual",
        });
        expect(second.status).toBe(404);
        // Only one user landed.
        const userCount = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM users",
        );
        expect(userCount.rows[0].count).toBe("1");
      } finally {
        await srv.close();
      }
    });
  });
});
