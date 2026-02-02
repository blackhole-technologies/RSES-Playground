/**
 * @file admin-sites.ts
 * @description Admin API routes for site management
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @created 2026-02-02
 *
 * Provides REST API endpoints for multi-site administration.
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

const log = createModuleLogger("admin-sites-api");
const router = Router();

// =============================================================================
// IN-MEMORY SITE STORE (Replace with database in production)
// =============================================================================

// Demo sites for development - mirrors what was in AdminDashboard.tsx
const siteStore = new Map<string, SiteConfig>([
  [
    "site-1",
    {
      id: "site-1",
      name: "Production US",
      domain: "us.example.com",
      environment: "production",
      region: "us-east-1",
      version: "2.4.1",
      healthStatus: "healthy",
      lastHealthCheck: new Date().toISOString(),
      uptime: 99.99,
      resourceUsage: {
        cpuPercent: 45,
        memoryPercent: 62,
        diskPercent: 38,
        networkInMbps: 125,
        networkOutMbps: 89,
        timestamp: new Date().toISOString(),
      },
      resourceHistory: [],
      enabledFeatures: [
        "core_authentication",
        "core_rses_engine",
        "feature_ai_suggestions",
        "feature_advanced_taxonomy",
      ],
      featureOverrides: {},
      createdAt: "2024-01-15T00:00:00Z",
      updatedAt: new Date().toISOString(),
      tags: ["production", "primary"],
    },
  ],
  [
    "site-2",
    {
      id: "site-2",
      name: "Production EU",
      domain: "eu.example.com",
      environment: "production",
      region: "eu-west-1",
      version: "2.4.1",
      healthStatus: "healthy",
      lastHealthCheck: new Date().toISOString(),
      uptime: 99.95,
      resourceUsage: {
        cpuPercent: 38,
        memoryPercent: 55,
        diskPercent: 42,
        networkInMbps: 98,
        networkOutMbps: 67,
        timestamp: new Date().toISOString(),
      },
      resourceHistory: [],
      enabledFeatures: [
        "core_authentication",
        "core_rses_engine",
        "feature_advanced_taxonomy",
      ],
      featureOverrides: { feature_ai_suggestions: false },
      createdAt: "2024-02-01T00:00:00Z",
      updatedAt: new Date().toISOString(),
      tags: ["production", "gdpr"],
    },
  ],
  [
    "site-3",
    {
      id: "site-3",
      name: "Staging",
      domain: "staging.example.com",
      environment: "staging",
      region: "us-east-1",
      version: "2.5.0-beta",
      healthStatus: "degraded",
      lastHealthCheck: new Date().toISOString(),
      uptime: 98.5,
      resourceUsage: {
        cpuPercent: 72,
        memoryPercent: 81,
        diskPercent: 55,
        networkInMbps: 45,
        networkOutMbps: 32,
        timestamp: new Date().toISOString(),
      },
      resourceHistory: [],
      enabledFeatures: [
        "core_authentication",
        "core_rses_engine",
        "feature_ai_suggestions",
        "feature_advanced_taxonomy",
        "beta_collaborative_editing",
        "beta_version_intelligence",
      ],
      featureOverrides: {},
      createdAt: "2024-03-01T00:00:00Z",
      updatedAt: new Date().toISOString(),
      tags: ["staging", "beta"],
    },
  ],
  [
    "site-4",
    {
      id: "site-4",
      name: "Development",
      domain: "dev.example.com",
      environment: "development",
      region: "us-east-1",
      version: "2.6.0-dev",
      healthStatus: "healthy",
      lastHealthCheck: new Date().toISOString(),
      uptime: 95.0,
      resourceUsage: {
        cpuPercent: 25,
        memoryPercent: 35,
        diskPercent: 22,
        networkInMbps: 12,
        networkOutMbps: 8,
        timestamp: new Date().toISOString(),
      },
      resourceHistory: [],
      enabledFeatures: [
        "core_authentication",
        "core_rses_engine",
        "feature_ai_suggestions",
        "feature_advanced_taxonomy",
        "beta_collaborative_editing",
        "beta_version_intelligence",
        "experimental_quantum_taxonomy",
      ],
      featureOverrides: {},
      createdAt: "2024-04-01T00:00:00Z",
      updatedAt: new Date().toISOString(),
      tags: ["development", "experimental"],
    },
  ],
]);

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

    let sites = Array.from(siteStore.values());

    // Apply filters
    if (query.search) {
      const search = query.search.toLowerCase();
      sites = sites.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.domain.toLowerCase().includes(search)
      );
    }

    if (query.environments) {
      const envs = query.environments.split(",");
      sites = sites.filter((s) => envs.includes(s.environment));
    }

    if (query.healthStatus) {
      const statuses = query.healthStatus.split(",");
      sites = sites.filter((s) => statuses.includes(s.healthStatus));
    }

    if (query.regions) {
      const regions = query.regions.split(",");
      sites = sites.filter((s) => regions.includes(s.region));
    }

    if (query.tags) {
      const tags = query.tags.split(",");
      sites = sites.filter((s) => s.tags.some((t) => tags.includes(t)));
    }

    const total = sites.length;

    // Apply pagination
    sites = sites.slice(query.offset, query.offset + query.limit);

    res.json({ data: sites, total });
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
    const siteIds = req.query.siteIds
      ? (req.query.siteIds as string).split(",")
      : undefined;

    let sites = Array.from(siteStore.values());
    if (siteIds) {
      sites = sites.filter((s) => siteIds.includes(s.id));
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

    const sites = siteIds
      .map((id) => siteStore.get(id))
      .filter((s): s is SiteConfig => s !== undefined);

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

    const results: Array<{ siteId: string; success: boolean; error?: string }> = [];

    for (const siteId of siteIds) {
      const site = siteStore.get(siteId);
      if (!site) {
        results.push({ siteId, success: false, error: "Site not found" });
        continue;
      }

      // Simulate action
      log.info({ siteId, action }, "Performing bulk action on site");
      results.push({ siteId, success: true });
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
    const site = siteStore.get(siteId);

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

    const site = siteStore.get(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    const updated: SiteConfig = {
      ...site,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    siteStore.set(siteId, updated);
    log.info({ siteId }, "Updated site");

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

    const site = siteStore.get(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    // Generate mock historical metrics
    const now = Date.now();
    const intervals = period === "hour" ? 60 : period === "day" ? 24 : 7;
    const intervalMs = period === "hour" ? 60000 : period === "day" ? 3600000 : 86400000;

    const metrics: ResourceUsage[] = [];
    for (let i = intervals - 1; i >= 0; i--) {
      metrics.push({
        cpuPercent: Math.max(10, Math.min(90, (site.resourceUsage?.cpuPercent || 50) + (Math.random() - 0.5) * 20)),
        memoryPercent: Math.max(20, Math.min(95, (site.resourceUsage?.memoryPercent || 60) + (Math.random() - 0.5) * 15)),
        diskPercent: site.resourceUsage?.diskPercent || 40,
        networkInMbps: Math.max(1, (site.resourceUsage?.networkInMbps || 50) + (Math.random() - 0.5) * 30),
        networkOutMbps: Math.max(1, (site.resourceUsage?.networkOutMbps || 30) + (Math.random() - 0.5) * 20),
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

    const site = siteStore.get(siteId);
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

    const site = siteStore.get(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    log.info({ siteId, action: validatedAction }, "Performing site action");

    // Simulate action effects
    switch (validatedAction) {
      case "restart":
        // Simulate restart
        siteStore.set(siteId, {
          ...site,
          lastHealthCheck: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;

      case "clear_cache":
        // Cache would be cleared
        break;

      case "enable_maintenance":
        siteStore.set(siteId, {
          ...site,
          healthStatus: "degraded",
          updatedAt: new Date().toISOString(),
        });
        break;

      case "disable_maintenance":
        siteStore.set(siteId, {
          ...site,
          healthStatus: "healthy",
          updatedAt: new Date().toISOString(),
        });
        break;

      default:
        // Other actions are simulated
        break;
    }

    res.json({ success: true, action: validatedAction, siteId });
  } catch (err) {
    next(err);
  }
});

export default router;
