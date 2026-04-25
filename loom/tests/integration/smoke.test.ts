/**
 * Boot-to-health smoke test.
 *
 * Exercises the full bootstrap path: loadConfig -> createDbHandle ->
 * DB sanity ping -> migrations applied -> tenant scope wired -> auth
 * middleware/routes mounted -> first-boot token check -> Express
 * listen -> /health -> stop. If anything in that chain regresses,
 * this test catches it before any module-level work runs.
 *
 * Skipped unless TEST_DATABASE_URL is set. CI provides one; local runs
 * without a Postgres get a clean skip, not a noisy failure.
 *
 * Schema is reset + migrated in beforeAll because bootstrap now reads
 * system_settings on startup (first-boot token logic). Without the
 * migration, bootstrap throws.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { createMigrationRunner } from "../../core/migrations/runner";
import type { BootstrapResult } from "../../core/bootstrap";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..");

describe.skipIf(!DB_URL)("smoke: bootstrap -> /health", () => {
  let result: BootstrapResult;
  let baseUrl: string;

  beforeAll(async () => {
    // Reset schema + run migrations. Bootstrap reads system_settings to
    // decide whether to generate a first-boot token, so the table must
    // exist.
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

    // Pin a test-specific port to avoid colliding with a dev server.
    // Env must be set before bootstrap.ts reads config.
    process.env.NODE_ENV = "test";
    process.env.PORT = "3099";
    process.env.DATABASE_URL = DB_URL;
    process.env.SESSION_SECRET = "x".repeat(64);

    const { bootstrap } = await import("../../core/bootstrap");
    result = await bootstrap();
    baseUrl = `http://localhost:${result.app.config.port}`;
  });

  afterAll(async () => {
    if (result?.stop) await result.stop();
  });

  it("responds 200 JSON at /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "loom" });
  });

  it("exposes /metrics in Prometheus format", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("# HELP");
  });

  it("/api/auth/me without a cookie returns 401 (auth middleware mounted)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it("attaches tenantScope to the App", () => {
    expect(result.app.tenantScope).toBeDefined();
    expect(typeof result.app.tenantScope.scoped).toBe("function");
  });

  it("generated a bootstrap token on first boot (criterion 2 proxy)", async () => {
    // Before-each migration left the DB empty. Bootstrap should have
    // generated a token via createBootstrapToken and stored only the
    // hash. The raw token went to the log line and never to the DB.
    const checkPool = new pg.Pool({ connectionString: DB_URL, max: 1 });
    try {
      const res = await checkPool.query<{
        bootstrap_token_hash: string | null;
        bootstrap_token_consumed_at: Date | null;
      }>(
        "SELECT bootstrap_token_hash, bootstrap_token_consumed_at FROM system_settings WHERE key = 'default'",
      );
      expect(res.rows[0].bootstrap_token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.rows[0].bootstrap_token_consumed_at).toBeNull();
    } finally {
      await checkPool.end();
    }
  });
});
