/**
 * @file metrics.ts
 * @description Prometheus metrics for observability and monitoring.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated CMS (CMS Developer Agent)
 * @created 2026-01-31
 *
 * Provides metrics for:
 * - HTTP request rate and latency
 * - RSES engine operations (parse, test)
 * - WebSocket connections
 * - Project scanning and symlink operations
 */

import type { Express, Request, Response, NextFunction } from "express";
import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

// Create a custom registry
const register = new Registry();

// Add default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register, prefix: "rses_" });

// ==================== HTTP Metrics ====================

/**
 * Total HTTP requests by method, path, and status code.
 */
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

/**
 * HTTP request duration in seconds.
 */
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ==================== RSES Engine Metrics ====================

/**
 * RSES config parse duration in seconds.
 */
export const rsesParseTime = new Histogram({
  name: "rses_parse_duration_seconds",
  help: "Time to parse RSES configuration",
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  registers: [register],
});

/**
 * RSES pattern match test duration in seconds.
 */
export const rsesTestTime = new Histogram({
  name: "rses_test_duration_seconds",
  help: "Time to test a path against RSES config",
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register],
});

/**
 * RSES operations counter.
 */
export const rsesOperationsTotal = new Counter({
  name: "rses_operations_total",
  help: "Total RSES operations",
  labelNames: ["operation", "status"],
  registers: [register],
});

// ==================== WebSocket Metrics ====================

/**
 * Currently active WebSocket connections.
 */
export const wsConnectionsActive = new Gauge({
  name: "websocket_connections_active",
  help: "Number of active WebSocket connections",
  registers: [register],
});

/**
 * Total WebSocket messages by type.
 */
export const wsMessagesTotal = new Counter({
  name: "websocket_messages_total",
  help: "Total WebSocket messages",
  labelNames: ["type", "direction"],
  registers: [register],
});

// ==================== Project/Symlink Metrics ====================

/**
 * Total projects scanned.
 */
export const projectsScannedTotal = new Counter({
  name: "projects_scanned_total",
  help: "Total projects scanned",
  registers: [register],
});

/**
 * Project scan duration in seconds.
 */
export const projectScanDuration = new Histogram({
  name: "project_scan_duration_seconds",
  help: "Time to scan a directory for projects",
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
});

/**
 * Total symlinks created.
 */
export const symlinksCreatedTotal = new Counter({
  name: "symlinks_created_total",
  help: "Total symlinks created",
  labelNames: ["status"],
  registers: [register],
});

/**
 * Total symlinks removed.
 */
export const symlinksRemovedTotal = new Counter({
  name: "symlinks_removed_total",
  help: "Total symlinks removed",
  registers: [register],
});

// ==================== Database Metrics ====================

/**
 * Database query duration in seconds.
 */
export const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/**
 * Database connection pool size.
 */
export const dbPoolSize = new Gauge({
  name: "db_pool_size",
  help: "Database connection pool size",
  labelNames: ["state"],
  registers: [register],
});

// ==================== Middleware ====================

/**
 * Express middleware to collect HTTP metrics.
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = (Date.now() - startTime) / 1000;
      const path = normalizePath(req.path);
      const status = String(res.statusCode);
      const method = req.method;

      httpRequestsTotal.inc({ method, path, status });
      httpRequestDuration.observe({ method, path, status }, duration);
    });

    next();
  };
}

/**
 * Normalizes URL paths to reduce cardinality.
 * Replaces dynamic segments like IDs with placeholders.
 */
function normalizePath(path: string): string {
  // Skip metrics and health endpoints from being normalized
  if (path === "/metrics" || path === "/health" || path === "/ready") {
    return path;
  }

  // Replace numeric IDs with :id
  let normalized = path.replace(/\/\d+/g, "/:id");

  // Replace UUIDs with :uuid
  normalized = normalized.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/:uuid"
  );

  // Limit path depth to avoid cardinality explosion
  const segments = normalized.split("/").slice(0, 5);
  return segments.join("/") || "/";
}

/**
 * Registers the /metrics endpoint on the Express app.
 */
export function registerMetricsRoute(app: Express): void {
  app.get("/metrics", async (_req: Request, res: Response) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end("Failed to collect metrics");
    }
  });
}

/**
 * Helper to time async operations.
 */
export function timeAsync<T>(
  histogram: Histogram,
  labels: Record<string, string> = {}
): (fn: () => Promise<T>) => Promise<T> {
  return async (fn) => {
    const end = histogram.startTimer(labels);
    try {
      const result = await fn();
      end();
      return result;
    } catch (err) {
      end();
      throw err;
    }
  };
}

/**
 * Helper to time sync operations.
 */
export function timeSync<T>(
  histogram: Histogram,
  labels: Record<string, string> = {}
): (fn: () => T) => T {
  return (fn) => {
    const end = histogram.startTimer(labels);
    try {
      const result = fn();
      end();
      return result;
    } catch (err) {
      end();
      throw err;
    }
  };
}

// Export the registry for testing
export { register };
