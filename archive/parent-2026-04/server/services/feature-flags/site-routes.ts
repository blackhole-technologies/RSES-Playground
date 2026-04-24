/**
 * @file site-routes.ts
 * @description Site-scoped feature flag routes with tenant isolation
 * @phase Phase 3 - Multi-tenancy
 * @version 0.8.0
 * @created 2026-02-02
 *
 * Provides site-isolated feature flag API endpoints.
 * All routes automatically scope to the current site from request context.
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Router-level `router.use(...)` middleware is preserved (tenant isolation
 * + enforceSiteIsolation + requireSiteContext) — the lint test explicitly
 * allows `router.use` calls. Only the per-route handlers gain the marker.
 *
 * Previously: reads had no auth, writes had `requireAuth` only.
 * Now: every handler is wrapped in `protect("feature_flags:...", ...)`
 * which adds both auth and per-action RBAC, with admin bypass.
 */

import { Router } from "express";
import { z } from "zod";
import { getSiteScopedFeatureFlagsService } from "./site-scoped";
import { tryGetSiteContext, SiteContextError } from "../../multisite/site/site-context";
import { createTenantIsolationMiddleware, enforceSiteIsolation } from "../../middleware/tenant-isolation";
import { protect } from "../../middleware/rbac-protect";
import { createModuleLogger } from "../../logger";
import {
  featureFlagSchema,
  evaluationContextSchema,
  percentageRolloutSchema,
  targetingRuleSchema,
  featureDependencySchema,
  FeatureCategory,
} from "@shared/admin/types";

const log = createModuleLogger("feature-flags-site-routes");
const router = Router();

// Apply tenant isolation to all routes
router.use(createTenantIsolationMiddleware());
router.use(enforceSiteIsolation());

/**
 * Middleware to require site context.
 */
function requireSiteContext(req: any, res: any, next: any) {
  const context = tryGetSiteContext();
  if (!context) {
    return res.status(400).json({
      error: "Site context required",
      message: "This endpoint requires a valid site context. Ensure X-Site-ID header is set.",
      code: "SITE_CONTEXT_REQUIRED",
    });
  }
  next();
}

// Apply site context requirement to all routes
router.use(requireSiteContext);

// =============================================================================
// SITE-SCOPED FLAG CRUD
// =============================================================================

/**
 * GET /api/site/feature-flags - List flags for current site
 */
router.get(
  "/",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const flags = await service.getAllFlags();

      let filtered = flags;

      if (req.query.search) {
        const search = (req.query.search as string).toLowerCase();
        filtered = filtered.filter(
          (f) =>
            f.key.toLowerCase().includes(search) ||
            f.name.toLowerCase().includes(search)
        );
      }

      if (req.query.category) {
        filtered = filtered.filter((f) => f.category === req.query.category);
      }

      if (req.query.enabled !== undefined) {
        const enabled = req.query.enabled === "true";
        filtered = filtered.filter((f) => f.globallyEnabled === enabled);
      }

      if (req.query.inherited !== undefined) {
        const inherited = req.query.inherited === "true";
        filtered = filtered.filter((f) => f.inherited === inherited);
      }

      res.json({
        data: filtered,
        total: filtered.length,
        siteId: tryGetSiteContext()?.siteId,
      });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to list site flags");
      res.status(500).json({ message: "Failed to list flags" });
    }
  })
);

/**
 * GET /api/site/feature-flags/:key - Get a flag for current site
 */
router.get(
  "/:key",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const flag = await service.getFlag(String(req.params.key));

      if (!flag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.json(flag);
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to get site flag");
      res.status(500).json({ message: "Failed to get flag" });
    }
  })
);

/**
 * POST /api/site/feature-flags - Create a flag for current site
 */
router.post(
  "/",
  protect("feature_flags:create", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();

      const createSchema = z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]*$/),
        name: z.string().min(1),
        description: z.string(),
        category: z.nativeEnum(FeatureCategory),
        globallyEnabled: z.boolean().default(false),
        toggleable: z.boolean().default(true),
        defaultState: z.boolean().default(false),
        percentageRollout: percentageRolloutSchema.optional(),
        targetingRules: z.array(targetingRuleSchema).default([]),
        dependencies: z.array(featureDependencySchema).default([]),
        tags: z.array(z.string()).default([]),
        owner: z.string().optional(),
        scope: z.enum(["site", "network", "global"]).default("site"),
      });

      const input = createSchema.parse(req.body);
      const { scope, ...flagData } = input;

      const flag = await service.createFlag(flagData as any, { scope });

      log.info(
        { key: flag.key, siteId: flag.siteId },
        "Site-scoped flag created"
      );

      res.status(201).json(flag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to create site flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create flag" });
    }
  })
);

/**
 * PUT /api/site/feature-flags/:key - Update a flag for current site
 */
router.put(
  "/:key",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        globallyEnabled: z.boolean().optional(),
        toggleable: z.boolean().optional(),
        defaultState: z.boolean().optional(),
        percentageRollout: percentageRolloutSchema.optional(),
        targetingRules: z.array(targetingRuleSchema).optional(),
        tags: z.array(z.string()).optional(),
        owner: z.string().optional(),
      });

      const updates = updateSchema.parse(req.body);
      const flag = await service.updateFlag(String(req.params.key), updates);

      if (!flag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      log.info({ key: flag.key, siteId: flag.siteId }, "Site-scoped flag updated");

      res.json(flag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to update site flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update flag" });
    }
  })
);

/**
 * DELETE /api/site/feature-flags/:key - Delete a site-specific flag
 */
router.delete(
  "/:key",
  protect("feature_flags:delete", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const deleted = await service.deleteFlag(String(req.params.key));

      if (!deleted) {
        return res.status(404).json({
          message: "Site-specific flag not found. Cannot delete global flags from site context.",
        });
      }

      log.info(
        { key: String(req.params.key), siteId: tryGetSiteContext()?.siteId },
        "Site-scoped flag deleted"
      );

      res.json({ message: "Flag deleted" });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to delete site flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to delete flag" });
    }
  })
);

// =============================================================================
// ENABLE / DISABLE
// =============================================================================

/**
 * POST /api/site/feature-flags/:key/enable - Enable a flag for current site
 */
router.post(
  "/:key/enable",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const success = await service.enableFlag(String(req.params.key));

      if (!success) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.json({ message: "Flag enabled", key: String(req.params.key) });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to enable site flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to enable flag" });
    }
  })
);

/**
 * POST /api/site/feature-flags/:key/disable - Disable a flag for current site
 */
router.post(
  "/:key/disable",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const success = await service.disableFlag(String(req.params.key));

      if (!success) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.json({ message: "Flag disabled", key: String(req.params.key) });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to disable site flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to disable flag" });
    }
  })
);

// =============================================================================
// EVALUATION
// =============================================================================

/**
 * POST /api/site/feature-flags/evaluate - Evaluate a flag for current site
 */
router.post(
  "/evaluate",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();

      const schema = z.object({
        featureKey: z.string(),
        context: evaluationContextSchema.optional(),
      });

      const { featureKey, context } = schema.parse(req.body);
      const result = await service.evaluate(featureKey, context);

      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to evaluate site flag");
      res.status(500).json({ message: "Failed to evaluate flag" });
    }
  })
);

/**
 * POST /api/site/feature-flags/evaluate-batch - Evaluate multiple flags for current site
 */
router.post(
  "/evaluate-batch",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();

      const schema = z.object({
        featureKeys: z.array(z.string()),
        context: evaluationContextSchema.optional(),
      });

      const { featureKeys, context } = schema.parse(req.body);
      const response = await service.evaluateBatch(featureKeys, context);

      res.json(response);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to evaluate site flags batch");
      res.status(500).json({ message: "Failed to evaluate flags" });
    }
  })
);

/**
 * GET /api/site/feature-flags/enabled - Get enabled flags for current site
 */
router.get(
  "/enabled/list",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const enabled = await service.getEnabledFeatures();

      res.json({
        enabled,
        siteId: tryGetSiteContext()?.siteId,
      });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to get enabled site flags");
      res.status(500).json({ message: "Failed to get enabled flags" });
    }
  })
);

// =============================================================================
// USER OVERRIDES
// =============================================================================

/**
 * GET /api/site/feature-flags/:key/user-overrides - Get user overrides for current site
 */
router.get(
  "/:key/user-overrides",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const overrides = await service.getUserOverrides(String(req.params.key));

      res.json({ data: overrides });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to get user overrides");
      res.status(500).json({ message: "Failed to get user overrides" });
    }
  })
);

/**
 * PUT /api/site/feature-flags/:key/user-overrides/:userId - Set user override
 */
router.put(
  "/:key/user-overrides/:userId",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();

      const schema = z.object({
        enabled: z.boolean(),
        reason: z.string().optional(),
        expiresAt: z.string().optional(),
      });

      const { enabled, reason, expiresAt } = schema.parse(req.body);

      const override = await service.setUserOverride(
        String(req.params.userId),
        String(req.params.key),
        enabled,
        { reason, expiresAt }
      );

      res.json(override);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to set user override");
      res.status(500).json({ message: "Failed to set user override" });
    }
  })
);

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * GET /api/site/feature-flags/:key/stats - Get usage stats for current site
 */
router.get(
  "/:key/stats",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const period = (req.query.period as "hour" | "day" | "week" | "month") || "day";

      const stats = await service.getUsageStats(String(req.params.key), period);

      res.json(stats || { message: "No statistics available" });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to get site stats");
      res.status(500).json({ message: "Failed to get statistics" });
    }
  })
);

/**
 * GET /api/site/feature-flags/:key/history - Get rollout history for current site
 */
router.get(
  "/:key/history",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const history = await service.getRolloutHistory(String(req.params.key), limit);

      res.json({ data: history, total: history.length });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to get site history");
      res.status(500).json({ message: "Failed to get history" });
    }
  })
);

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * POST /api/site/feature-flags/cache/clear - Clear cache for current site
 */
router.post(
  "/cache/clear",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getSiteScopedFeatureFlagsService();
      service.clearCache();

      res.json({
        message: "Site cache cleared",
        siteId: tryGetSiteContext()?.siteId,
      });
    } catch (err) {
      if (err instanceof SiteContextError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error({ err }, "Failed to clear site cache");
      res.status(500).json({ message: "Failed to clear cache" });
    }
  })
);

export default router;
