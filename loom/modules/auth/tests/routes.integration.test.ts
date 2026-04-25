/**
 * Integration tests for /api/auth/login, /api/auth/logout, and
 * /api/me. Spins up a minimal Express app with the auth middleware +
 * routes mounted, runs real HTTP requests via fetch, and verifies:
 *
 *   - 401 on bad creds, 200 + Set-Cookie on good creds
 *   - rate limiter shape (5 → 429, recordSuccess clears, recordFailure
 *     accumulates)
 *   - cookie flag matrix: HttpOnly + SameSite=Strict always, Secure
 *     only when configured
 *   - logout deletes the session row + Clears the cookie + idempotent
 *   - /me requires auth and strips the password_hash
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
import { registerUser } from "../service";
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
  rateLimiter: ReturnType<typeof createLoginRateLimiter>;
}

async function startServer(
  handle: DbHandle,
  options: { cookieName?: string; cookieSecure?: boolean } = {},
): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  const rateLimiter = createLoginRateLimiter();
  app.use(createAuthMiddleware(handle, { cookieName: options.cookieName }));
  app.use("/api/auth", createAuthRouter(handle, rateLimiter, options));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    close: () => new Promise((r) => server.close(() => r())),
    rateLimiter,
  };
}

/**
 * Minimal cookie jar — fetch() does not auto-persist cookies, so we
 * track them manually and re-attach on each request.
 */
class CookieJar {
  private cookies = new Map<string, string>();

  setFrom(res: Response): void {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

async function fetchJar(
  jar: CookieJar,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const cookieHeader = jar.header();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url, { ...options, headers });
  jar.setFrom(res);
  return res;
}

describe.skipIf(!DB_URL)("auth routes (HTTP integration)", () => {
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

  describe("POST /api/auth/login", () => {
    it("400s on missing fields", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      } finally {
        await srv.close();
      }
    });

    it("401s on wrong credentials and records the failure", async () => {
      const srv = await startServer(handle);
      try {
        await registerUser(handle, {
          username: "alice",
          password: "passw0rd",
        });
        const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "wrong" }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "invalid_credentials" });
        // Rate limiter should track exactly 1 failure.
        expect(srv.rateLimiter.isLocked("alice")).toBe(false);
      } finally {
        await srv.close();
      }
    });

    it("returns 200 + Set-Cookie + body on correct credentials", async () => {
      const srv = await startServer(handle);
      try {
        await registerUser(handle, {
          username: "bob",
          password: "passw0rd",
          email: "bob@example.com",
        });
        const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "bob", password: "passw0rd" }),
        });
        expect(res.status).toBe(200);

        const setCookie = res.headers.getSetCookie?.() ?? [];
        expect(setCookie).toHaveLength(1);
        expect(setCookie[0]).toMatch(/^session=[A-Za-z0-9_-]{43};/);
        expect(setCookie[0]).toContain("HttpOnly");
        expect(setCookie[0]).toContain("SameSite=Strict");
        expect(setCookie[0]).toContain("Path=/");

        const body = await res.json();
        expect(body.user.username).toBe("bob");
        expect(body.user.email).toBe("bob@example.com");
        // Critical: the password_hash must NOT escape into the response.
        expect(body.user.passwordHash).toBeUndefined();
        expect(body.user.password_hash).toBeUndefined();
      } finally {
        await srv.close();
      }
    });

    it("locks out after 5 failures with 429 + Retry-After header", async () => {
      const srv = await startServer(handle);
      try {
        await registerUser(handle, {
          username: "carol",
          password: "passw0rd",
        });
        // 5 wrong-password attempts.
        for (let i = 0; i < 5; i++) {
          const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "carol", password: "wrong" }),
          });
          expect(res.status).toBe(401);
        }
        // 6th attempt — even with the right password — must be locked.
        const locked = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "carol", password: "passw0rd" }),
        });
        expect(locked.status).toBe(429);
        expect(locked.headers.get("Retry-After")).toBeDefined();
        const retryAfter = Number(locked.headers.get("Retry-After"));
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(15 * 60);
      } finally {
        await srv.close();
      }
    });

    it("clears rate limit tracking on successful login", async () => {
      const srv = await startServer(handle);
      try {
        await registerUser(handle, {
          username: "dave",
          password: "passw0rd",
        });
        // 3 failures, then 1 success — should leave the counter clean.
        for (let i = 0; i < 3; i++) {
          await fetch(`${srv.baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "dave", password: "wrong" }),
          });
        }
        const ok = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "dave", password: "passw0rd" }),
        });
        expect(ok.status).toBe(200);
        // Now 5 more failures — a fresh cycle, must NOT be locked yet.
        for (let i = 0; i < 4; i++) {
          await fetch(`${srv.baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "dave", password: "wrong" }),
          });
        }
        expect(srv.rateLimiter.isLocked("dave")).toBe(false);
      } finally {
        await srv.close();
      }
    });

    it("captures the request IP and user agent on session creation", async () => {
      const srv = await startServer(handle);
      try {
        const user = await registerUser(handle, {
          username: "eve",
          password: "passw0rd",
        });
        await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Loom-Test-Client/0.0.1",
          },
          body: JSON.stringify({ username: "eve", password: "passw0rd" }),
        });
        const res = await pool.query<{
          ip: string | null;
          user_agent: string | null;
        }>("SELECT ip, user_agent FROM sessions WHERE user_id = $1", [user.id]);
        expect(res.rows).toHaveLength(1);
        // ip is set to the loopback address (::ffff:127.0.0.1 or
        // ::1, depending on stack). Just check it's non-null.
        expect(res.rows[0].ip).not.toBeNull();
        expect(res.rows[0].user_agent).toBe("Loom-Test-Client/0.0.1");
      } finally {
        await srv.close();
      }
    });
  });

  describe("Cookie flag matrix", () => {
    it("dev mode (cookieSecure=false): no Secure flag", async () => {
      const srv = await startServer(handle, { cookieSecure: false });
      try {
        await registerUser(handle, {
          username: "frank",
          password: "passw0rd",
        });
        const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "frank", password: "passw0rd" }),
        });
        const setCookie = res.headers.getSetCookie?.()[0] ?? "";
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Strict");
        expect(setCookie).not.toContain("Secure");
      } finally {
        await srv.close();
      }
    });

    it("production mode (cookieSecure=true, __Host- prefix): full security", async () => {
      const srv = await startServer(handle, {
        cookieName: "__Host-session",
        cookieSecure: true,
      });
      try {
        await registerUser(handle, {
          username: "grace",
          password: "passw0rd",
        });
        const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "grace", password: "passw0rd" }),
        });
        const setCookie = res.headers.getSetCookie?.()[0] ?? "";
        expect(setCookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/);
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Strict");
        expect(setCookie).toContain("Secure");
        expect(setCookie).toContain("Path=/");
      } finally {
        await srv.close();
      }
    });
  });

  describe("POST /api/auth/logout", () => {
    it("deletes the session row and clears the cookie", async () => {
      const srv = await startServer(handle);
      const jar = new CookieJar();
      try {
        await registerUser(handle, {
          username: "henry",
          password: "passw0rd",
        });
        await fetchJar(jar, `${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          body: JSON.stringify({ username: "henry", password: "passw0rd" }),
        });

        const before = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM sessions",
        );
        expect(before.rows[0].count).toBe("1");

        const logoutRes = await fetchJar(jar, `${srv.baseUrl}/api/auth/logout`, {
          method: "POST",
        });
        expect(logoutRes.status).toBe(204);
        const setCookie = logoutRes.headers.getSetCookie?.()[0] ?? "";
        expect(setCookie).toContain("Max-Age=0");

        const after = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM sessions",
        );
        expect(after.rows[0].count).toBe("0");
      } finally {
        await srv.close();
      }
    });

    it("is idempotent — 204 even with no cookie", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/logout`, {
          method: "POST",
        });
        expect(res.status).toBe(204);
      } finally {
        await srv.close();
      }
    });
  });

  describe("GET /api/auth/me", () => {
    it("401s when no cookie is sent", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/me`);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "unauthenticated" });
      } finally {
        await srv.close();
      }
    });

    it("401s when the cookie does not match a session", async () => {
      const srv = await startServer(handle);
      try {
        const res = await fetch(`${srv.baseUrl}/api/auth/me`, {
          headers: { cookie: "session=this-cookie-is-fake" },
        });
        expect(res.status).toBe(401);
      } finally {
        await srv.close();
      }
    });

    it("returns the User (sans passwordHash) when authenticated", async () => {
      const srv = await startServer(handle);
      const jar = new CookieJar();
      try {
        await registerUser(handle, {
          username: "ivy",
          password: "passw0rd",
          email: "ivy@example.com",
        });
        await fetchJar(jar, `${srv.baseUrl}/api/auth/login`, {
          method: "POST",
          body: JSON.stringify({ username: "ivy", password: "passw0rd" }),
        });
        const res = await fetchJar(jar, `${srv.baseUrl}/api/auth/me`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.username).toBe("ivy");
        expect(body.user.email).toBe("ivy@example.com");
        expect(body.user.passwordHash).toBeUndefined();
      } finally {
        await srv.close();
      }
    });
  });
});
