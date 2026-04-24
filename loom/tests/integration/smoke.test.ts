/**
 * Boot-to-health smoke test.
 *
 * Exercises the full bootstrap path: loadConfig -> createDbHandle ->
 * DB sanity ping -> Express listen -> /health -> stop. If anything in
 * that chain regresses, this test catches it before any module-level
 * work runs.
 *
 * Skipped unless TEST_DATABASE_URL is set. CI provides one; local runs
 * without a Postgres get a clean skip, not a noisy failure.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { BootstrapResult } from "../../core/bootstrap";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("smoke: bootstrap -> /health", () => {
  let result: BootstrapResult;
  let baseUrl: string;

  beforeAll(async () => {
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
});
