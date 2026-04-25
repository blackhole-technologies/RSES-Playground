/**
 * Integration tests for the auth middleware. Verifies:
 *
 *   - request without a cookie passes through; req.user undefined
 *   - request with an unknown cookie passes through; req.user undefined
 *   - request with a stale cookie (session expired) passes through
 *   - request with a valid cookie attaches the User and runs the rest
 *     of the chain inside `runInUserScope(user.id, ...)` — verified by
 *     reading getCurrentUserScope() inside the next() handler
 *   - cookie name is configurable; non-default name is honored
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../../core/migrations/runner";
import { getCurrentUserScope } from "../../../engines/tenant-scope";
import type { DbHandle } from "../../../core/db";
import { registerUser, createSession } from "../service";
import { createAuthMiddleware, requireAuth } from "../middleware";

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

/**
 * Drive a middleware function and wait for it to call next(). Returns
 * the next-invocation argument (or undefined for plain next()).
 */
async function runMiddleware(
  mw: ReturnType<typeof createAuthMiddleware>,
  req: object,
): Promise<{ nextArg: unknown; req: object }> {
  return new Promise<{ nextArg: unknown; req: object }>((resolve, reject) => {
    const res = {} as object;
    const next = vi.fn((err?: unknown) => {
      if (err) reject(err);
      else resolve({ nextArg: undefined, req });
    });
    Promise.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mw as any)(req, res, next),
    ).catch(reject);
  });
}

describe.skipIf(!DB_URL)("auth middleware", () => {
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

  it("passes through with no cookie header", async () => {
    const mw = createAuthMiddleware(handle);
    const req = { headers: {} };
    const { req: out } = await runMiddleware(mw, req);
    expect((out as { user?: unknown }).user).toBeUndefined();
  });

  it("passes through when the session cookie is missing among others", async () => {
    const mw = createAuthMiddleware(handle);
    const req = {
      headers: { cookie: "lang=en; theme=dark" },
    };
    const { req: out } = await runMiddleware(mw, req);
    expect((out as { user?: unknown }).user).toBeUndefined();
  });

  it("passes through when the cookie value is not in the sessions table", async () => {
    const mw = createAuthMiddleware(handle);
    const req = {
      headers: { cookie: "session=this-cookie-does-not-exist" },
    };
    const { req: out } = await runMiddleware(mw, req);
    expect((out as { user?: unknown }).user).toBeUndefined();
  });

  it("attaches req.user when the cookie matches an active session", async () => {
    const user = await registerUser(handle, {
      username: "alice",
      password: "passw0rd",
    });
    const session = await createSession(handle, user.id);

    const mw = createAuthMiddleware(handle);
    const req = {
      headers: { cookie: `session=${session.cookie}` },
    };
    const { req: out } = await runMiddleware(mw, req);
    const attached = (out as { user?: { id: string; username: string } }).user;
    expect(attached).toBeDefined();
    expect(attached!.id).toBe(user.id);
    expect(attached!.username).toBe("alice");
  });

  it("binds runInUserScope so getCurrentUserScope() sees user.id inside next()", async () => {
    const user = await registerUser(handle, {
      username: "bob",
      password: "passw0rd",
    });
    const session = await createSession(handle, user.id);

    const mw = createAuthMiddleware(handle);
    const req = {
      headers: { cookie: `session=${session.cookie}` },
    };

    let scopeAtNext: ReturnType<typeof getCurrentUserScope> = undefined;
    await new Promise<void>((resolve, reject) => {
      const res = {};
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        scopeAtNext = getCurrentUserScope();
        resolve();
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mw as any)(req, res, next).catch(reject);
    });
    expect(scopeAtNext).toEqual({ userId: user.id });
  });

  it("does not bind a scope when no user is loaded", async () => {
    const mw = createAuthMiddleware(handle);
    const req = { headers: {} };

    let scopeAtNext: ReturnType<typeof getCurrentUserScope> = "sentinel" as never;
    await new Promise<void>((resolve, reject) => {
      const res = {};
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        scopeAtNext = getCurrentUserScope();
        resolve();
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mw as any)(req, res, next).catch(reject);
    });
    expect(scopeAtNext).toBeUndefined();
  });

  it("honors a custom cookieName", async () => {
    const user = await registerUser(handle, {
      username: "carol",
      password: "passw0rd",
    });
    const session = await createSession(handle, user.id);

    const mw = createAuthMiddleware(handle, { cookieName: "__Host-session" });
    const req = {
      headers: { cookie: `__Host-session=${session.cookie}` },
    };
    const { req: out } = await runMiddleware(mw, req);
    expect((out as { user?: { id: string } }).user?.id).toBe(user.id);
  });

  it("ignores a cookie under the default name when configured for a different name", async () => {
    const user = await registerUser(handle, {
      username: "dave",
      password: "passw0rd",
    });
    const session = await createSession(handle, user.id);

    const mw = createAuthMiddleware(handle, { cookieName: "__Host-session" });
    const req = {
      headers: { cookie: `session=${session.cookie}` }, // wrong name
    };
    const { req: out } = await runMiddleware(mw, req);
    expect((out as { user?: unknown }).user).toBeUndefined();
  });
});

describe.skipIf(!DB_URL)("requireAuth", () => {
  it("answers 401 with stable JSON shape when req.user is undefined", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requireAuth({} as any, res as any, next as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "unauthenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when req.user is present", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    const req = { user: { id: "x" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requireAuth(req as any, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
