#!/usr/bin/env node
/**
 * @file file-watcher-daemon.ts
 * @description Standalone daemon for file watching service.
 * @phase Phase 9 - CMS Content Type System
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * This daemon can be run standalone or managed by launchd/systemd.
 * It provides:
 * - Signal handling (SIGTERM, SIGINT, SIGHUP)
 * - Health endpoint on HTTP
 * - Metrics endpoint
 * - Graceful shutdown
 * - Crash recovery with exponential backoff
 *
 * Usage:
 *   node file-watcher-daemon.js [config-path]
 *
 * Environment variables:
 *   WATCHER_CONFIG_PATH - Path to configuration file
 *   WATCHER_HTTP_PORT   - HTTP port for health/metrics (default: 9090)
 *   NODE_ENV            - Environment (production, development)
 *   LOG_LEVEL           - Logging level (debug, info, warn, error)
 */

import http from "http";
import fs from "fs/promises";
import path from "path";
import {
  CMSFileWatcherService,
  getCMSFileWatcher,
  resetCMSFileWatcher,
  type CMSFileWatcherConfig,
  type WatchDirectoryConfig,
  DEFAULT_SKIP_PATTERNS,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_DEBOUNCE_BY_TYPE,
} from "./file-watcher-cms";
import { getMetrics, updateHealthMetrics } from "./file-watcher-metrics";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("watcher-daemon");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface DaemonConfig {
  httpPort: number;
  watcherConfig: Partial<CMSFileWatcherConfig>;
}

const DEFAULT_HTTP_PORT = 9090;

/**
 * Loads configuration from file or environment
 */
async function loadConfig(): Promise<DaemonConfig> {
  const configPath = process.argv[2] || process.env.WATCHER_CONFIG_PATH;
  const httpPort = parseInt(process.env.WATCHER_HTTP_PORT || "", 10) || DEFAULT_HTTP_PORT;

  let watcherConfig: Partial<CMSFileWatcherConfig> = {};

  if (configPath) {
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(configContent);

      // Validate and transform configuration
      watcherConfig = {
        directories: parsed.directories?.map((dir: Partial<WatchDirectoryConfig>) => ({
          path: dir.path || "",
          type: dir.type || "custom",
          label: dir.label,
          enabled: dir.enabled ?? true,
          ignorePatterns: dir.ignorePatterns,
          depth: dir.depth,
          followSymlinks: dir.followSymlinks ?? false,
          debounce: dir.debounce || DEFAULT_DEBOUNCE_BY_TYPE[dir.type as keyof typeof DEFAULT_DEBOUNCE_BY_TYPE] || DEFAULT_DEBOUNCE_BY_TYPE.custom,
          handlerOptions: dir.handlerOptions,
          priority: dir.priority,
        })) || [],
        defaultSkipPatterns: parsed.defaultSkipPatterns || DEFAULT_SKIP_PATTERNS,
        resourceLimits: {
          ...DEFAULT_RESOURCE_LIMITS,
          ...parsed.resourceLimits,
        },
        security: {
          ...DEFAULT_SECURITY_CONFIG,
          ...parsed.security,
        },
        persistence: {
          enabled: parsed.persistence?.enabled ?? false,
          statePath: parsed.persistence?.statePath || "./watcher-state.json",
          saveIntervalMs: parsed.persistence?.saveIntervalMs || 60000,
          restoreOnStartup: parsed.persistence?.restoreOnStartup ?? true,
        },
        healthCheckIntervalMs: parsed.healthCheckIntervalMs || 30000,
        emitMetrics: parsed.emitMetrics ?? true,
      };

      log.info({ configPath }, "Configuration loaded");
    } catch (err) {
      log.warn({ err, configPath }, "Failed to load config file, using defaults");
    }
  }

  return {
    httpPort,
    watcherConfig,
  };
}

// =============================================================================
// HTTP SERVER
// =============================================================================

let httpServer: http.Server | null = null;
let watcher: CMSFileWatcherService | null = null;

/**
 * Starts the HTTP server for health and metrics endpoints
 */
function startHttpServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      try {
        switch (url.pathname) {
          case "/health":
            handleHealth(res);
            break;

          case "/ready":
            handleReady(res);
            break;

          case "/metrics":
            await handleMetrics(res);
            break;

          case "/status":
            handleStatus(res);
            break;

          default:
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
        }
      } catch (err) {
        log.error({ err, path: url.pathname }, "HTTP handler error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });

    httpServer.on("error", (err) => {
      log.error({ err }, "HTTP server error");
      reject(err);
    });

    httpServer.listen(port, () => {
      log.info({ port }, "HTTP server started");
      resolve();
    });
  });
}

/**
 * Health endpoint - liveness probe
 */
function handleHealth(res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "file-watcher-daemon",
    pid: process.pid,
  }));
}

/**
 * Ready endpoint - readiness probe
 */
function handleReady(res: http.ServerResponse): void {
  if (!watcher) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "error",
      message: "Watcher not initialized",
    }));
    return;
  }

  const health = watcher.getHealthStatus();

  if (health.status === "unhealthy") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "error",
      health: health.status,
      errors: health.errors,
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    health: health.status,
    activeWatchers: health.activeWatchers,
    watchedPaths: health.watchedPathCount,
  }));
}

/**
 * Metrics endpoint - Prometheus format
 */
async function handleMetrics(res: http.ServerResponse): Promise<void> {
  if (watcher) {
    const health = watcher.getHealthStatus();
    updateHealthMetrics(health);
  }

  const metrics = await getMetrics();
  res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
  res.end(metrics);
}

/**
 * Status endpoint - detailed status
 */
function handleStatus(res: http.ServerResponse): void {
  if (!watcher) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "not_initialized",
    }));
    return;
  }

  const health = watcher.getHealthStatus();
  const metrics = watcher.getMetrics();

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: health.status,
    uptime: metrics.uptimeMs,
    health,
    metrics,
  }, null, 2));
}

// =============================================================================
// SIGNAL HANDLING
// =============================================================================

let isShuttingDown = false;

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log.warn("Shutdown already in progress");
    return;
  }

  isShuttingDown = true;
  log.info({ signal }, "Received shutdown signal");

  // Stop accepting new connections
  if (httpServer) {
    httpServer.close();
  }

  // Stop the watcher
  if (watcher) {
    await watcher.stop();
  }

  // Reset singleton
  await resetCMSFileWatcher();

  log.info("Shutdown complete");
  process.exit(0);
}

/**
 * Reload configuration (SIGHUP)
 */
async function reload(): Promise<void> {
  log.info("Reloading configuration");

  try {
    const config = await loadConfig();

    if (watcher) {
      await watcher.stop();
    }

    await resetCMSFileWatcher();

    watcher = getCMSFileWatcher(config.watcherConfig);
    await watcher.start();

    log.info("Configuration reloaded");
  } catch (err) {
    log.error({ err }, "Failed to reload configuration");
  }
}

// Register signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGHUP", () => reload());

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  log.error({ err }, "Uncaught exception");
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "Unhandled rejection");
});

// =============================================================================
// CRASH RECOVERY
// =============================================================================

let crashCount = 0;
const MAX_CRASHES = 5;
const CRASH_RESET_INTERVAL = 300000; // 5 minutes

/**
 * Handles watcher crashes with exponential backoff
 */
async function handleCrash(err: Error): Promise<void> {
  crashCount++;

  if (crashCount > MAX_CRASHES) {
    log.error({ crashCount, err }, "Too many crashes, giving up");
    await shutdown("too_many_crashes");
    return;
  }

  const backoff = Math.min(30000, 1000 * Math.pow(2, crashCount - 1));
  log.warn({ crashCount, backoff, err }, "Watcher crashed, restarting");

  await new Promise((resolve) => setTimeout(resolve, backoff));

  try {
    if (watcher) {
      await watcher.stop();
    }
    await watcher?.start();
    log.info("Watcher recovered");
  } catch (restartErr) {
    log.error({ err: restartErr }, "Failed to restart watcher");
    handleCrash(restartErr as Error);
  }
}

// Reset crash count periodically
setInterval(() => {
  if (crashCount > 0) {
    crashCount = Math.max(0, crashCount - 1);
  }
}, CRASH_RESET_INTERVAL);

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  log.info({
    pid: process.pid,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || "development",
  }, "Starting file watcher daemon");

  try {
    // Load configuration
    const config = await loadConfig();

    // Start HTTP server
    await startHttpServer(config.httpPort);

    // Initialize and start watcher
    watcher = getCMSFileWatcher(config.watcherConfig);

    // Set up error handler for crash recovery
    watcher.getEventBus().on("error", (err) => {
      handleCrash(err as Error);
    });

    await watcher.start();

    log.info("File watcher daemon started successfully");
  } catch (err) {
    log.error({ err }, "Failed to start daemon");
    process.exit(1);
  }
}

// Run main
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
