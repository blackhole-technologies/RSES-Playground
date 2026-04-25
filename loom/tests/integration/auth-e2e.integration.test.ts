/**
 * Golden-path end-to-end test (completion criterion 6).
 *
 * Exercises the full first-boot → admin → /me → logout sequence
 * against a real running bootstrap. Each step is asserted in turn so
 * a regression at any layer (auth middleware, /setup, /api/auth, the
 * cookie flag matrix, the session-load → runInUserScope chain) shows
 * up here as a focused failure rather than a vague "401 somewhere".
 *
 * The test pre-generates the bootstrap token by calling
 * createBootstrapToken directly before bootstrap starts. Bootstrap's
 * own first-boot call then sees the existing hash and short-circuits,
 * which means we have the raw token in hand without having to
 * scrape pino output.
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../core/migrations/runner";
import { createBootstrapToken } from "../../modules/auth/service";
import type { DbHandle } from "../../core/db";
import type { BootstrapResult } from "../../core/bootstrap";

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

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

describe.skipIf(!DB_URL)("auth e2e: setup → /me → logout → 401 (criterion 6)", () => {
  let result: BootstrapResult;
  let baseUrl: string;
  let bootstrapToken: string;

  beforeAll(async () => {
    // Step 1: clean schema, run migrations.
    const setupPool = new pg.Pool({ connectionString: DB_URL, max: 1 });
    try {
      await setupPool.query("DROP SCHEMA IF EXISTS public CASCADE");
      await setupPool.query("CREATE SCHEMA public");
      await setupPool.query("GRANT ALL ON SCHEMA public TO public");
    } finally {
      await setupPool.end();
    }
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

    // Step 2: pre-generate the bootstrap token. The raw value is what
    // we'll POST to /setup; bootstrap.ts will see the existing hash
    // and not generate a second one.
    const seedPool = new pg.Pool({ connectionString: DB_URL, max: 1 });
    try {
      const seedHandle = makeTestHandle(seedPool);
      const token = await createBootstrapToken(seedHandle);
      expect(token).not.toBeNull();
      bootstrapToken = token!;
    } finally {
      await seedPool.end();
    }

    // Step 3: real bootstrap on a different port than smoke uses.
    process.env.NODE_ENV = "test";
    process.env.PORT = "3098";
    process.env.DATABASE_URL = DB_URL;
    process.env.SESSION_SECRET = "x".repeat(64);

    const { bootstrap } = await import("../../core/bootstrap");
    result = await bootstrap();
    baseUrl = `http://localhost:${result.app.config.port}`;
  });

  afterAll(async () => {
    if (result?.stop) await result.stop();
  });

  /**
   * Single sequential test rather than separate `it()` blocks because
   * each step depends on the prior step's effect (cookie issued by
   * /setup, used by /me, cleared by /logout). Splitting would require
   * either shared mutable state or repeating earlier steps in each
   * block — both worse than one long-form test that reads as a flow.
   */
  it("walks the full golden path", async () => {
    // ── /setup: POST with the token, expect 302 + cookie ────────────
    const setupRes = await fetch(`${baseUrl}/setup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        token: bootstrapToken,
        username: "admin",
        password: "passw0rd",
        email: "admin@example.com",
        displayName: "Admin",
      }),
      redirect: "manual",
    });
    expect(setupRes.status).toBe(302);
    expect(setupRes.headers.get("location")).toBe("/app");

    const setCookieAtSetup = setupRes.headers.getSetCookie?.()[0] ?? "";
    expect(setCookieAtSetup).toMatch(/^session=[A-Za-z0-9_-]{43};/);
    expect(setCookieAtSetup).toContain("HttpOnly");
    expect(setCookieAtSetup).toContain("SameSite=Strict");
    const sessionCookie = setCookieAtSetup.split(";")[0]; // "session=<value>"

    // ── /api/auth/me: GET with the cookie, expect 200 + user ────────
    const meAuthedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    expect(meAuthedRes.status).toBe(200);
    const meAuthedBody = await meAuthedRes.json();
    expect(meAuthedBody.user.username).toBe("admin");
    expect(meAuthedBody.user.isAdmin).toBe(true);
    expect(meAuthedBody.user.email).toBe("admin@example.com");
    expect(meAuthedBody.user.passwordHash).toBeUndefined();

    // ── /api/auth/logout: 204 + cookie cleared ───────────────────────
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: sessionCookie },
    });
    expect(logoutRes.status).toBe(204);
    const setCookieAtLogout = logoutRes.headers.getSetCookie?.()[0] ?? "";
    expect(setCookieAtLogout).toContain("Max-Age=0");

    // ── /api/auth/me again: now 401 (session row deleted) ───────────
    // We deliberately re-send the OLD cookie. The browser would have
    // dropped it (Max-Age=0) but a buggy client might keep sending it;
    // the server must still answer 401 because the session row is gone.
    const meAfterLogoutRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    expect(meAfterLogoutRes.status).toBe(401);
    const meAfterLogoutBody = await meAfterLogoutRes.json();
    expect(meAfterLogoutBody).toEqual({ error: "unauthenticated" });

    // ── /api/auth/me with no cookie: also 401 ────────────────────────
    const meNoCookieRes = await fetch(`${baseUrl}/api/auth/me`);
    expect(meNoCookieRes.status).toBe(401);

    // ── /setup with the same token: 404 (already consumed) ──────────
    const setupAgainRes = await fetch(
      `${baseUrl}/setup?token=${bootstrapToken}`,
    );
    expect(setupAgainRes.status).toBe(404);
  });
});
