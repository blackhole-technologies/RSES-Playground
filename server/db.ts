/**
 * @file db.ts
 * @description Database connection with resilience features.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Connection pool with optimized settings
 * - Automatic reconnection on disconnect
 * - Circuit breaker for graceful degradation
 * - Connection health monitoring
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { dbLogger as log } from "./logger";
import { dbPoolSize, dbQueryDuration } from "./metrics";
import {
  CircuitBreaker,
  createDatabaseCircuitBreaker,
  CircuitOpenError,
  CircuitState,
} from "./lib/circuit-breaker";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

/**
 * Database connection pool configuration.
 * Optimized for production use.
 */
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,

  // Pool size configuration
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),
  max: parseInt(process.env.DB_POOL_MAX || "10", 10),

  // Connection timeout settings
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000", 10), // 30s
  connectionTimeoutMillis: parseInt(
    process.env.DB_CONNECTION_TIMEOUT || "5000",
    10
  ), // 5s

  // Statement timeout to prevent long-running queries
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || "30000", 10), // 30s

  // Keep-alive to detect connection issues
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10s
};

/**
 * Create the connection pool.
 */
export const pool = new Pool(poolConfig);

/**
 * Circuit breaker for database operations.
 */
export const dbCircuitBreaker: CircuitBreaker = createDatabaseCircuitBreaker();

/**
 * Track pool events for monitoring and reconnection.
 */
pool.on("connect", (client) => {
  log.debug("New database connection established");

  // Update pool metrics
  updatePoolMetrics();

  // Set session parameters for the connection
  client.query("SET timezone = 'UTC'").catch((err) => {
    log.warn({ err }, "Failed to set session timezone");
  });
});

pool.on("acquire", () => {
  log.debug("Database connection acquired from pool");
  updatePoolMetrics();
});

pool.on("release", () => {
  log.debug("Database connection released to pool");
  updatePoolMetrics();
});

pool.on("remove", () => {
  log.debug("Database connection removed from pool");
  updatePoolMetrics();
});

pool.on("error", (err: Error) => {
  log.error({ err }, "Database pool error");

  // The pool will automatically handle reconnection
  // but we log the error for monitoring
});

/**
 * Updates pool size metrics.
 */
function updatePoolMetrics(): void {
  try {
    dbPoolSize.set({ state: "total" }, pool.totalCount);
    dbPoolSize.set({ state: "idle" }, pool.idleCount);
    dbPoolSize.set({ state: "waiting" }, pool.waitingCount);
  } catch {
    // Ignore errors during metrics collection
  }
}

/**
 * Creates the drizzle ORM instance.
 */
export const db = drizzle(pool, { schema });

/**
 * Executes a database query with circuit breaker protection.
 *
 * @param queryFn - Function that performs the database query
 * @param fallbackValue - Optional value to return if circuit is open
 * @returns Query result or fallback value
 */
export async function withCircuitBreaker<T>(
  queryFn: () => Promise<T>,
  fallbackValue?: T
): Promise<T> {
  const endTimer = dbQueryDuration.startTimer({ operation: "query" });

  try {
    const result = await dbCircuitBreaker.execute(queryFn, fallbackValue);
    endTimer();
    return result;
  } catch (err) {
    endTimer();
    throw err;
  }
}

/**
 * Checks if the database is healthy.
 *
 * @returns true if database is responding, false otherwise
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the current circuit breaker state.
 */
export function getCircuitState(): CircuitState {
  return dbCircuitBreaker.getState();
}

/**
 * Gets database connection statistics.
 */
export function getPoolStats(): {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  circuitState: CircuitState;
} {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    circuitState: dbCircuitBreaker.getState(),
  };
}

/**
 * Gracefully closes all database connections.
 * Should be called during application shutdown.
 */
export async function closePool(): Promise<void> {
  log.info("Closing database connection pool");
  await pool.end();
  log.info("Database connection pool closed");
}

/**
 * Resets the circuit breaker (for testing/recovery).
 */
export function resetCircuitBreaker(): void {
  dbCircuitBreaker.reset();
}

// Export error types for consumers
export { CircuitOpenError };
