/**
 * @file health.ts
 * @description Health check endpoints for container orchestration (liveness/readiness probes).
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * @security No sensitive information is disclosed in health responses.
 *           Database connectivity is checked without exposing connection details.
 */

import type { Express, Request, Response } from "express";
import { pool, getCircuitState, getPoolStats } from "./db";
import { CircuitState } from "./lib/circuit-breaker";

interface HealthCheck {
  status: "ok" | "error";
  responseTime?: number;
  error?: string;
}

interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthCheck>;
}

const startTime = Date.now();

/**
 * Checks database connectivity by executing a simple query.
 * Times out after 5 seconds to prevent blocking.
 *
 * @returns Health check result for database
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Simple query to verify database connectivity
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database check timeout")), 5000)
      ),
    ]);
    return {
      status: "ok",
      responseTime: Date.now() - start,
    };
  } catch (err) {
    return {
      status: "error",
      responseTime: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

/**
 * Registers health check endpoints on the Express app.
 *
 * @param app - Express application instance
 *
 * Endpoints:
 *   GET /health - Liveness probe, always returns 200 if process is alive
 *   GET /ready  - Readiness probe, checks database connectivity
 */
export function registerHealthRoutes(app: Express): void {
  /**
   * Liveness probe endpoint.
   * Returns 200 if the process is alive. No external dependency checks.
   * Used by orchestrators to detect if the container needs to be restarted.
   */
  app.get("/health", (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: {
        process: { status: "ok" },
      },
    };
    res.status(200).json(response);
  });

  /**
   * Readiness probe endpoint.
   * Returns 200 if the service is ready to accept traffic.
   * Returns 503 if any critical dependencies are unavailable.
   * Used by orchestrators to decide whether to route traffic to this instance.
   */
  app.get("/ready", async (_req: Request, res: Response) => {
    const dbCheck = await checkDatabase();
    const circuitState = getCircuitState();
    const poolStats = getPoolStats();

    // Add circuit breaker check
    const circuitCheck: HealthCheck = {
      status: circuitState === CircuitState.CLOSED ? "ok" : "error",
      error:
        circuitState === CircuitState.OPEN
          ? "Circuit breaker is open"
          : undefined,
    };

    const allChecks: Record<string, HealthCheck> = {
      database: dbCheck,
      circuitBreaker: circuitCheck,
    };

    const allHealthy = Object.values(allChecks).every(
      (check) => check.status === "ok"
    );

    const response: HealthResponse & { pool?: typeof poolStats } = {
      status: allHealthy ? "ok" : "error",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: allChecks,
      pool: poolStats,
    };

    res.status(allHealthy ? 200 : 503).json(response);
  });
}
