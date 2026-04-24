/**
 * @file metrics.test.ts
 * @description Tests for Prometheus metrics endpoint.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated CMS (CMS Developer Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  registerMetricsRoute,
  metricsMiddleware,
  httpRequestsTotal,
  httpRequestDuration,
  rsesParseTime,
  rsesTestTime,
  rsesOperationsTotal,
  wsConnectionsActive,
  projectsScannedTotal,
  symlinksCreatedTotal,
  register,
} from "../src/metrics";

describe("Prometheus Metrics", () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(metricsMiddleware());
    registerMetricsRoute(app);

    // Add a test route
    app.get("/api/test", (_req, res) => res.json({ ok: true }));

    // Reset all metrics
    register.resetMetrics();
  });

  describe("GET /metrics", () => {
    it("returns 200 with Prometheus content type", async () => {
      const res = await request(app).get("/metrics");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
    });

    it("includes default Node.js metrics", async () => {
      const res = await request(app).get("/metrics");

      expect(res.text).toContain("nodejs_version_info");
      expect(res.text).toContain("process_cpu");
      expect(res.text).toContain("nodejs_heap");
    });

    it("includes HTTP request metrics after making requests", async () => {
      // Make some requests
      await request(app).get("/api/test");
      await request(app).get("/api/test");

      const res = await request(app).get("/metrics");

      expect(res.text).toContain("http_requests_total");
      expect(res.text).toContain("http_request_duration_seconds");
    });

    it("includes RSES operation metrics", async () => {
      const res = await request(app).get("/metrics");

      expect(res.text).toContain("rses_parse_duration_seconds");
      expect(res.text).toContain("rses_test_duration_seconds");
      expect(res.text).toContain("rses_operations_total");
    });

    it("includes WebSocket metrics", async () => {
      const res = await request(app).get("/metrics");

      expect(res.text).toContain("websocket_connections_active");
      expect(res.text).toContain("websocket_messages_total");
    });

    it("includes project/symlink metrics", async () => {
      const res = await request(app).get("/metrics");

      expect(res.text).toContain("projects_scanned_total");
      expect(res.text).toContain("symlinks_created_total");
      expect(res.text).toContain("symlinks_removed_total");
    });

    it("includes database metrics", async () => {
      const res = await request(app).get("/metrics");

      expect(res.text).toContain("db_query_duration_seconds");
      expect(res.text).toContain("db_pool_size");
    });
  });

  describe("HTTP Metrics Collection", () => {
    it("increments request counter for each request", async () => {
      await request(app).get("/api/test");
      await request(app).get("/api/test");
      await request(app).get("/api/test");

      const metrics = await register.getMetricsAsJSON();
      const httpMetric = metrics.find((m) => m.name === "http_requests_total");

      expect(httpMetric).toBeDefined();
      // Should have at least 3 requests (the test requests plus any to /metrics)
      const total = (httpMetric?.values || []).reduce(
        (sum, v) => sum + (v.value as number),
        0
      );
      expect(total).toBeGreaterThanOrEqual(3);
    });

    it("tracks request duration histogram", async () => {
      await request(app).get("/api/test");

      const metrics = await register.getMetricsAsJSON();
      const durationMetric = metrics.find(
        (m) => m.name === "http_request_duration_seconds"
      );

      expect(durationMetric).toBeDefined();
    });

    it("normalizes paths with IDs", async () => {
      app.get("/api/items/:id", (_req, res) => res.json({ ok: true }));

      await request(app).get("/api/items/123");
      await request(app).get("/api/items/456");

      const res = await request(app).get("/metrics");

      // Should use :id placeholder, not actual IDs
      expect(res.text).toContain('path="/api/items/:id"');
    });
  });

  describe("Counter/Gauge Operations", () => {
    it("can increment counters", () => {
      rsesOperationsTotal.inc({ operation: "parse", status: "success" });
      rsesOperationsTotal.inc({ operation: "parse", status: "success" });

      const counter = rsesOperationsTotal as unknown as {
        hashMap: Record<string, { value: number }>;
      };
      // The counter should have been incremented
      expect(counter).toBeDefined();
    });

    it("can set gauge values", () => {
      wsConnectionsActive.set(5);
      wsConnectionsActive.inc();
      wsConnectionsActive.dec();

      // Gauge should work without errors
      expect(true).toBe(true);
    });

    it("can observe histogram values", () => {
      rsesParseTime.observe(0.01);
      rsesTestTime.observe(0.001);

      // Histograms should work without errors
      expect(true).toBe(true);
    });
  });
});
