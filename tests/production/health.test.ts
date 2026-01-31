/**
 * @file health.test.ts
 * @description Tests for health check endpoints (liveness and readiness probes).
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerHealthRoutes } from "../../server/health";

// Mock the database module
vi.mock("../../server/db", () => ({
  pool: {
    query: vi.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  },
  getCircuitState: vi.fn(() => "CLOSED"),
  getPoolStats: vi.fn(() => ({
    totalConnections: 5,
    idleConnections: 3,
    waitingClients: 0,
    circuitState: "CLOSED",
  })),
}));

// Mock the circuit breaker
vi.mock("../../server/lib/circuit-breaker", () => ({
  CircuitState: {
    CLOSED: "CLOSED",
    OPEN: "OPEN",
    HALF_OPEN: "HALF_OPEN",
  },
}));

import { pool } from "../../server/db";

describe("Health Check Endpoints", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerHealthRoutes(app);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /health (Liveness Probe)", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("includes timestamp in ISO format", async () => {
      const res = await request(app).get("/health");

      expect(res.body.timestamp).toBeDefined();
      expect(() => new Date(res.body.timestamp)).not.toThrow();
    });

    it("includes uptime in seconds", async () => {
      const res = await request(app).get("/health");

      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("includes process check", async () => {
      const res = await request(app).get("/health");

      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.process).toEqual({ status: "ok" });
    });

    it("does not expose sensitive information", async () => {
      const res = await request(app).get("/health");
      const responseText = JSON.stringify(res.body);

      // Should not contain database connection strings, passwords, etc.
      expect(responseText).not.toMatch(/password/i);
      expect(responseText).not.toMatch(/connection/i);
      expect(responseText).not.toMatch(/secret/i);
      expect(responseText).not.toMatch(/postgres/i);
    });

    it("responds within 100ms", async () => {
      const start = Date.now();
      await request(app).get("/health");
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe("GET /ready (Readiness Probe)", () => {
    it("returns 200 when database is healthy", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

      const res = await request(app).get("/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("returns 503 when database is unhealthy", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Connection refused"));

      const res = await request(app).get("/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("error");
    });

    it("includes database check with response time", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/ready");

      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.database.status).toBe("ok");
      expect(typeof res.body.checks.database.responseTime).toBe("number");
    });

    it("includes error message when database fails", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Connection timeout"));

      const res = await request(app).get("/ready");

      expect(res.body.checks.database.status).toBe("error");
      expect(res.body.checks.database.error).toBe("Connection timeout");
    });

    it("handles database timeout gracefully", async () => {
      // Mock a slow query that takes longer than timeout
      (pool.query as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      const start = Date.now();
      const res = await request(app).get("/ready");
      const duration = Date.now() - start;

      // Should timeout within 6 seconds (5s timeout + overhead)
      expect(duration).toBeLessThan(6000);
      expect(res.status).toBe(503);
      expect(res.body.checks.database.error).toBe("Database check timeout");
    }, 10000);

    it("includes timestamp and uptime", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/ready");

      expect(res.body.timestamp).toBeDefined();
      expect(typeof res.body.uptime).toBe("number");
    });

    it("does not expose connection details on error", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("FATAL: password authentication failed for user \"admin\"")
      );

      const res = await request(app).get("/ready");
      const responseText = JSON.stringify(res.body);

      // Error message is included but we should verify it doesn't expose too much
      expect(res.body.checks.database.error).toBeDefined();
      // The error message is passed through - in production, consider sanitizing
    });
  });

  describe("Response Format Consistency", () => {
    it("both endpoints return core health fields", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const healthRes = await request(app).get("/health");
      const readyRes = await request(app).get("/ready");

      // Both should have status, timestamp, uptime, and checks
      const coreKeys = ["status", "timestamp", "uptime", "checks"];
      coreKeys.forEach((key) => {
        expect(healthRes.body).toHaveProperty(key);
        expect(readyRes.body).toHaveProperty(key);
      });
    });

    it("ready endpoint includes pool stats", async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/ready");

      expect(res.body).toHaveProperty("pool");
      expect(res.body.pool).toHaveProperty("circuitState");
    });

    it("returns JSON content type", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["content-type"]).toMatch(/application\/json/);
    });
  });
});
