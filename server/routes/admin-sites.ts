/**
 * @file admin-sites.ts
 * @description Admin API routes for site management
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @created 2026-02-02
 *
 * Provides REST API endpoints for multi-site administration.
 * Uses PostgreSQL storage via Drizzle ORM.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type {
  SiteConfig,
  SiteAction,
  SiteHealthStatus,
  ResourceUsage,
} from "@shared/admin/types";
import { requireAuth, requireAdmin } from "../auth/session";
import { createModuleLogger } from "../logger";
import { getFeatureFlagsService } from "../services/feature-flags";
import { getSitesStorage } from "../services/sites/pg-storage";

const log = createModuleLogger("admin-sites-api");
const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const listSitesQuerySchema = z.object({
  search: z.string().optional(),
  environments: z.string().optional(), // comma-separated
  healthStatus: z.string().optional(), // comma-separated
  regions: z.string().optional(), // comma-separated
  tags: z.string().optional(), // comma-separated
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const siteActionSchema = z.enum([
  "restart",
  "clear_cache",
  "sync_config",
  "deploy",
  "rollback",
  "enable_maintenance",
  "disable_maintenance",
]);

const bulkActionSchema = z.object({
  siteIds: z.array(z.string()).min(1),
  action: siteActionSchema,
});

const updateSiteSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  featureOverrides: z.record(z.boolean()).optional(),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Apply auth to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/admin/sites
 * List all sites with filtering and pagination
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listSitesQuerySchema.parse(req.query);
    const storage = getSitesStorage();

    const result = await storage.search({
      search: query.search,
      environments: query.environments?.split(","),
      healthStatus: query.healthStatus?.split(","),
      regions: query.regions?.split(","),
      tags: query.tags?.split(","),
      limit: query.limit,
      offset: query.offset,
    });

    res.json({ data: result.sites, total: result.total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/sites/health
 * Get health status for all or specified sites
 */
router.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storage = getSitesStorage();
    const siteIds = req.query.siteIds
      ? (req.query.siteIds as string).split(",")
      : undefined;

    let sites: SiteConfig[];
    if (siteIds) {
      sites = await storage.getByIds(siteIds);
    } else {
      sites = await storage.getAll();
    }

    const healthData = sites.map((s) => ({
      siteId: s.id,
      siteName: s.name,
      status: s.healthStatus as SiteHealthStatus,
      uptime: s.uptime,
      lastCheck: s.lastHealthCheck,
    }));

    res.json({ data: healthData });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/sites/compare
 * Compare multiple sites
 */
router.post("/compare", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteIds } = z.object({ siteIds: z.array(z.string()).min(2) }).parse(req.body);
    const storage = getSitesStorage();

    const sites = await storage.getByIds(siteIds);

    if (sites.length < 2) {
      return res.status(400).json({ error: "Need at least 2 valid sites to compare" });
    }

    // Find feature differences
    const allFeatures = new Set<string>();
    for (const site of sites) {
      site.enabledFeatures.forEach((f) => allFeatures.add(f));
      Object.keys(site.featureOverrides).forEach((f) => allFeatures.add(f));
    }

    const featureDifferences: Array<{
      featureKey: string;
      siteStates: Record<string, boolean>;
    }> = [];

    for (const feature of allFeatures) {
      const siteStates: Record<string, boolean> = {};
      for (const site of sites) {
        if (site.featureOverrides[feature] !== undefined) {
          siteStates[site.id] = site.featureOverrides[feature];
        } else {
          siteStates[site.id] = site.enabledFeatures.includes(feature);
        }
      }

      // Check if there's a difference
      const values = Object.values(siteStates);
      if (values.some((v) => v !== values[0])) {
        featureDifferences.push({ featureKey: feature, siteStates });
      }
    }

    // Find config differences (version, region, etc.)
    const configDifferences: Array<{
      key: string;
      siteValues: Record<string, unknown>;
    }> = [];

    const configKeys = ["version", "region", "environment"] as const;
    for (const key of configKeys) {
      const siteValues: Record<string, unknown> = {};
      for (const site of sites) {
        siteValues[site.id] = site[key];
      }
      const values = Object.values(siteValues);
      if (values.some((v) => v !== values[0])) {
        configDifferences.push({ key, siteValues });
      }
    }

    res.json({ featureDifferences, configDifferences });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/sites/bulk-action
 * Perform action on multiple sites
 */
router.post("/bulk-action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteIds, action } = bulkActionSchema.parse(req.body);
    const storage = getSitesStorage();

    const results: Array<{ siteId: string; success: boolean; error?: string }> = [];

    for (const siteId of siteIds) {
      const site = await storage.getById(siteId);
      if (!site) {
        results.push({ siteId, success: false, error: "Site not found" });
        continue;
      }

      try {
        await performAction(storage, site, action);
        results.push({ siteId, success: true });
      } catch (error) {
        results.push({
          siteId,
          success: false,
          error: error instanceof Error ? error.message : "Action failed",
        });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/sites/:siteId
 * Get single site details
 */
router.get("/:siteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId } = req.params;
    const storage = getSitesStorage();
    const site = await storage.getById(siteId);

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    res.json(site);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/sites/:siteId
 * Update site configuration
 */
router.put("/:siteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId } = req.params;
    const updates = updateSiteSchema.parse(req.body);
    const storage = getSitesStorage();

    const updated = await storage.update(siteId, updates);
    if (!updated) {
      return res.status(404).json({ error: "Site not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/sites/:siteId/metrics
 * Get resource metrics history for a site
 */
router.get("/:siteId/metrics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId } = req.params;
    const period = (req.query.period as string) || "day";
    const storage = getSitesStorage();

    const site = await storage.getById(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    // Generate mock historical metrics (in production, this would come from a time-series DB)
    const now = Date.now();
    const intervals = period === "hour" ? 60 : period === "day" ? 24 : 7;
    const intervalMs = period === "hour" ? 60000 : period === "day" ? 3600000 : 86400000;

    const metrics: ResourceUsage[] = [];
    for (let i = intervals - 1; i >= 0; i--) {
      const baseUsage = site.resourceUsage;
      metrics.push({
        cpuPercent: Math.max(10, Math.min(90, (baseUsage?.cpuPercent || 50) + (Math.random() - 0.5) * 20)),
        memoryPercent: Math.max(20, Math.min(95, (baseUsage?.memoryPercent || 60) + (Math.random() - 0.5) * 15)),
        diskPercent: baseUsage?.diskPercent || 40,
        networkInMbps: Math.max(1, (baseUsage?.networkInMbps || 50) + (Math.random() - 0.5) * 30),
        networkOutMbps: Math.max(1, (baseUsage?.networkOutMbps || 30) + (Math.random() - 0.5) * 20),
        timestamp: new Date(now - i * intervalMs).toISOString(),
      });
    }

    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/sites/:siteId/feature-overrides
 * Get feature overrides for a site
 */
router.get("/:siteId/feature-overrides", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId } = req.params;
    const storage = getSitesStorage();

    const site = await storage.getById(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    // Get overrides from feature flags service
    const featureFlagsService = getFeatureFlagsService();
    const overrides = await featureFlagsService.getOverridesForSite(siteId);

    const data = overrides.map((o) => ({
      featureKey: o.featureKey,
      enabled: o.enabled,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/sites/:siteId/actions/:action
 * Perform an action on a site
 */
router.post("/:siteId/actions/:action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId, action } = req.params;
    const validatedAction = siteActionSchema.parse(action);
    const storage = getSitesStorage();

    const site = await storage.getById(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    await performAction(storage, site, validatedAction);

    res.json({ success: true, action: validatedAction, siteId });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Perform a site action
 */
async function performAction(
  storage: ReturnType<typeof getSitesStorage>,
  site: SiteConfig,
  action: z.infer<typeof siteActionSchema>
): Promise<void> {
  log.info({ siteId: site.id, action }, "Performing site action");

  switch (action) {
    case "restart":
      await storage.updateHealthStatus(site.id, "unknown");
      // In real implementation: trigger site restart
      setTimeout(async () => {
        await storage.updateHealthStatus(site.id, "healthy");
      }, 2000);
      break;

    case "clear_cache":
      // In real implementation: clear site cache
      break;

    case "enable_maintenance":
      await storage.update(site.id, { healthStatus: "degraded" });
      break;

    case "disable_maintenance":
      await storage.update(site.id, { healthStatus: "healthy" });
      break;

    case "deploy":
    case "rollback":
    case "sync_config":
      // In real implementation: trigger deployment/rollback/sync
      await storage.update(site.id, { lastDeployedAt: new Date().toISOString() });
      break;
  }
}

export default router;
