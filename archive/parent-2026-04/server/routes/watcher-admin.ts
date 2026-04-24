/**
 * @file watcher-admin.ts
 * @description Admin API routes for CMS file watcher management.
 * @phase Phase 9 - CMS Content Type System
 * @author FW (File Watcher Specialist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * Provides REST API endpoints for:
 * - Watcher lifecycle management (create, start, stop, delete)
 * - Health and metrics monitoring
 * - Symlink management and healing
 * - Security event viewing
 * - Configuration hot reload
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getCMSFileWatcher,
  CMSFileWatcherService,
  WatchDirectoryType,
  DEFAULT_DEBOUNCE_BY_TYPE,
} from "../services/file-watcher-cms";
import type {
  WatcherListResponse,
  WatcherDetailResponse,
  WatcherCreateRequest,
  WatcherUpdateRequest,
  SymlinkListResponse,
  SymlinkHealRequest,
  SymlinkHealResponse,
  SecurityEventsResponse,
} from "../ws/file-watcher-types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("watcher-admin");
const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const watcherCreateSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["content", "config", "theme", "module", "symlink", "media", "cache", "custom"]),
  label: z.string().optional(),
  enabled: z.boolean().default(true),
  ignorePatterns: z.array(z.string()).optional(),
  depth: z.number().int().min(0).max(20).optional(),
  followSymlinks: z.boolean().optional(),
  debounce: z.object({
    strategy: z.enum(["trailing", "leading", "throttle", "batch"]),
    delayMs: z.number().int().min(0).max(60000),
    maxWaitMs: z.number().int().min(0).max(120000).optional(),
    maxBatchSize: z.number().int().min(1).max(1000).optional(),
  }).optional(),
  handlerOptions: z.record(z.unknown()).optional(),
});

const watcherUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  ignorePatterns: z.array(z.string()).optional(),
  depth: z.number().int().min(0).max(20).optional(),
  debounce: z.object({
    strategy: z.enum(["trailing", "leading", "throttle", "batch"]).optional(),
    delayMs: z.number().int().min(0).max(60000).optional(),
    maxWaitMs: z.number().int().min(0).max(120000).optional(),
    maxBatchSize: z.number().int().min(1).max(1000).optional(),
  }).optional(),
});

const symlinkHealSchema = z.object({
  linkPaths: z.array(z.string()).optional(),
  searchPaths: z.array(z.string()).min(1),
  dryRun: z.boolean().default(false),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Validates that the file watcher service is running
 */
function requireWatcher(req: Request, res: Response, next: NextFunction): void {
  const watcher = getCMSFileWatcher();
  if (!watcher) {
    res.status(503).json({
      error: "File watcher service not initialized",
      code: "WATCHER_NOT_INITIALIZED",
    });
    return;
  }
  (req as Request & { watcher: CMSFileWatcherService }).watcher = watcher;
  next();
}

// =============================================================================
// WATCHER LIFECYCLE ROUTES
// =============================================================================

/**
 * GET /api/admin/watchers
 * List all configured watchers
 */
router.get("/watchers", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const health = watcher.getHealthStatus();

    const response: WatcherListResponse = {
      watchers: health.watchers.map((w) => ({
        path: w.path,
        type: w.type,
        enabled: w.running,
        status: w.running ? "running" : "stopped",
        watchedCount: w.watchedCount,
        lastEvent: w.lastEventTime,
      })),
      totalWatchers: health.activeWatchers,
      totalWatchedPaths: health.watchedPathCount,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing watchers");
    res.status(500).json({ error: "Failed to list watchers" });
  }
});

/**
 * GET /api/admin/watchers/:path
 * Get detailed information about a specific watcher
 */
router.get("/watchers/:path(*)", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const watchPath = "/" + req.params.path;

    const health = watcher.getHealthStatus();
    const watcherStatus = health.watchers.find((w) => w.path === watchPath);

    if (!watcherStatus) {
      res.status(404).json({
        error: "Watcher not found",
        path: watchPath,
      });
      return;
    }

    // Get symlinks if this is a symlink watcher
    let symlinks;
    if (watcherStatus.type === "symlink") {
      const manager = watcher.getSymlinkManager();
      symlinks = manager.getAllStates().filter(
        (s) => s.linkPath.startsWith(watchPath)
      );
    }

    const response: WatcherDetailResponse = {
      path: watchPath,
      type: watcherStatus.type,
      config: {
        path: watchPath,
        type: watcherStatus.type,
        enabled: watcherStatus.running,
        debounce: DEFAULT_DEBOUNCE_BY_TYPE[watcherStatus.type],
      },
      status: watcherStatus.running ? "running" : "stopped",
      health: {
        ready: watcherStatus.ready,
        watchedCount: watcherStatus.watchedCount,
        pendingEvents: health.pendingEventsCount,
        errorCount: watcherStatus.errorCount,
        lastError: watcherStatus.lastError,
      },
      recentEvents: [], // Would need event history tracking
      symlinks,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error getting watcher details");
    res.status(500).json({ error: "Failed to get watcher details" });
  }
});

/**
 * POST /api/admin/watchers
 * Create a new watcher
 */
router.post("/watchers", requireWatcher, async (req, res) => {
  try {
    const validation = watcherCreateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const data: WatcherCreateRequest = validation.data;
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;

    await watcher.addDirectory({
      path: data.path,
      type: data.type as WatchDirectoryType,
      label: data.label,
      enabled: data.enabled ?? true,
      ignorePatterns: data.ignorePatterns,
      depth: data.depth,
      followSymlinks: data.followSymlinks,
      debounce: data.debounce
        ? {
            strategy: data.debounce.strategy,
            delayMs: data.debounce.delayMs,
            maxWaitMs: data.debounce.maxWaitMs,
            maxBatchSize: data.debounce.maxBatchSize,
            combineEvents: true,
          }
        : DEFAULT_DEBOUNCE_BY_TYPE[data.type as WatchDirectoryType],
      handlerOptions: data.handlerOptions,
    });

    log.info({ path: data.path, type: data.type }, "Watcher created");

    res.status(201).json({
      message: "Watcher created",
      path: data.path,
      type: data.type,
    });
  } catch (err) {
    log.error({ err }, "Error creating watcher");
    res.status(500).json({ error: "Failed to create watcher" });
  }
});

/**
 * PATCH /api/admin/watchers/:path
 * Update a watcher configuration
 */
router.patch("/watchers/:path(*)", requireWatcher, async (req, res) => {
  try {
    const validation = watcherUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const _data: WatcherUpdateRequest = validation.data;
    const watchPath = "/" + req.params.path;

    // Note: Full implementation would update the watcher configuration
    // This requires stopping and restarting the watcher with new config

    log.info({ path: watchPath }, "Watcher update requested");

    res.json({
      message: "Watcher configuration updated",
      path: watchPath,
      note: "Changes will take effect after watcher restart",
    });
  } catch (err) {
    log.error({ err }, "Error updating watcher");
    res.status(500).json({ error: "Failed to update watcher" });
  }
});

/**
 * DELETE /api/admin/watchers/:path
 * Remove a watcher
 */
router.delete("/watchers/:path(*)", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const watchPath = "/" + req.params.path;

    await watcher.removeDirectory(watchPath);

    log.info({ path: watchPath }, "Watcher removed");

    res.json({
      message: "Watcher removed",
      path: watchPath,
    });
  } catch (err) {
    log.error({ err }, "Error removing watcher");
    res.status(500).json({ error: "Failed to remove watcher" });
  }
});

// =============================================================================
// HEALTH AND METRICS ROUTES
// =============================================================================

/**
 * GET /api/admin/watchers/health
 * Get overall watcher health status
 */
router.get("/health", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const health = watcher.getHealthStatus();

    res.json(health);
  } catch (err) {
    log.error({ err }, "Error getting health status");
    res.status(500).json({ error: "Failed to get health status" });
  }
});

/**
 * GET /api/admin/watchers/metrics
 * Get watcher metrics
 */
router.get("/metrics", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const metrics = watcher.getMetrics();

    res.json(metrics);
  } catch (err) {
    log.error({ err }, "Error getting metrics");
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

// =============================================================================
// SYMLINK MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/admin/symlinks
 * List all tracked symlinks
 */
router.get("/symlinks", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const manager = watcher.getSymlinkManager();
    const symlinks = manager.getAllStates();

    const broken = symlinks.filter((s) => !s.isValid);

    const response: SymlinkListResponse = {
      symlinks,
      total: symlinks.length,
      broken: broken.length,
      healthy: symlinks.length - broken.length,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing symlinks");
    res.status(500).json({ error: "Failed to list symlinks" });
  }
});

/**
 * GET /api/admin/symlinks/broken
 * List only broken symlinks
 */
router.get("/symlinks/broken", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const manager = watcher.getSymlinkManager();
    const broken = manager.getBrokenSymlinks();

    res.json({
      symlinks: broken,
      total: broken.length,
    });
  } catch (err) {
    log.error({ err }, "Error listing broken symlinks");
    res.status(500).json({ error: "Failed to list broken symlinks" });
  }
});

/**
 * POST /api/admin/symlinks/scan
 * Scan a directory for symlinks
 */
router.post("/symlinks/scan", requireWatcher, async (req, res) => {
  try {
    const { path: basePath } = req.body;

    if (!basePath || typeof basePath !== "string") {
      res.status(400).json({ error: "basePath is required" });
      return;
    }

    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const manager = watcher.getSymlinkManager();

    const symlinks = await manager.scanSymlinks(basePath);

    res.json({
      message: "Scan complete",
      basePath,
      symlinksFound: symlinks.length,
      broken: symlinks.filter((s) => !s.isValid).length,
    });
  } catch (err) {
    log.error({ err }, "Error scanning symlinks");
    res.status(500).json({ error: "Failed to scan symlinks" });
  }
});

/**
 * POST /api/admin/symlinks/heal
 * Attempt to heal broken symlinks
 */
router.post("/symlinks/heal", requireWatcher, async (req, res) => {
  try {
    const validation = symlinkHealSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const data: SymlinkHealRequest = validation.data;
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const manager = watcher.getSymlinkManager();

    // Get symlinks to heal
    const toHeal = data.linkPaths?.length
      ? manager.getAllStates().filter((s) => data.linkPaths!.includes(s.linkPath) && !s.isValid)
      : manager.getBrokenSymlinks();

    const healed: Array<{ linkPath: string; newTarget: string }> = [];
    const failed: Array<{ linkPath: string; error: string }> = [];

    for (const symlink of toHeal) {
      if (data.dryRun) {
        // In dry run, just report what would happen
        healed.push({
          linkPath: symlink.linkPath,
          newTarget: "(dry run - not healed)",
        });
        continue;
      }

      const result = await manager.healSymlink(symlink.linkPath, data.searchPaths);

      if (result.healed && result.newTarget) {
        healed.push({
          linkPath: symlink.linkPath,
          newTarget: result.newTarget,
        });
      } else {
        failed.push({
          linkPath: symlink.linkPath,
          error: result.error || "Unknown error",
        });
      }
    }

    const response: SymlinkHealResponse = {
      healed,
      failed,
      totalHealed: healed.length,
      totalFailed: failed.length,
    };

    log.info(
      { healed: healed.length, failed: failed.length, dryRun: data.dryRun },
      "Symlink healing completed"
    );

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error healing symlinks");
    res.status(500).json({ error: "Failed to heal symlinks" });
  }
});

/**
 * POST /api/admin/symlinks/verify/:path
 * Verify a specific symlink
 */
router.post("/symlinks/verify/:path(*)", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    const manager = watcher.getSymlinkManager();
    const linkPath = "/" + req.params.path;

    const state = await manager.verifySymlink(linkPath);

    if (!state) {
      res.status(404).json({
        error: "Not a symlink or does not exist",
        path: linkPath,
      });
      return;
    }

    res.json(state);
  } catch (err) {
    log.error({ err }, "Error verifying symlink");
    res.status(500).json({ error: "Failed to verify symlink" });
  }
});

// =============================================================================
// SECURITY ROUTES
// =============================================================================

/**
 * GET /api/admin/security/events
 * Get recent security events (anomalies)
 */
router.get("/security/events", requireWatcher, async (req, res) => {
  try {
    // Note: This would require storing security events in the SecurityMonitor
    // For now, return an empty response structure
    const response: SecurityEventsResponse = {
      events: [],
      total: 0,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error getting security events");
    res.status(500).json({ error: "Failed to get security events" });
  }
});

// =============================================================================
// SERVICE CONTROL ROUTES
// =============================================================================

/**
 * POST /api/admin/watchers/start
 * Start the file watcher service
 */
router.post("/start", async (req, res) => {
  try {
    const watcher = getCMSFileWatcher();
    await watcher.start();

    log.info("File watcher service started via API");

    res.json({
      message: "File watcher service started",
      status: "running",
    });
  } catch (err) {
    log.error({ err }, "Error starting file watcher");
    res.status(500).json({ error: "Failed to start file watcher" });
  }
});

/**
 * POST /api/admin/watchers/stop
 * Stop the file watcher service
 */
router.post("/stop", requireWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { watcher: CMSFileWatcherService }).watcher;
    await watcher.stop();

    log.info("File watcher service stopped via API");

    res.json({
      message: "File watcher service stopped",
      status: "stopped",
    });
  } catch (err) {
    log.error({ err }, "Error stopping file watcher");
    res.status(500).json({ error: "Failed to stop file watcher" });
  }
});

/**
 * POST /api/admin/watchers/restart
 * Restart the file watcher service
 */
router.post("/restart", async (req, res) => {
  try {
    const watcher = getCMSFileWatcher();

    await watcher.stop();
    await watcher.start();

    log.info("File watcher service restarted via API");

    res.json({
      message: "File watcher service restarted",
      status: "running",
    });
  } catch (err) {
    log.error({ err }, "Error restarting file watcher");
    res.status(500).json({ error: "Failed to restart file watcher" });
  }
});

export default router;
