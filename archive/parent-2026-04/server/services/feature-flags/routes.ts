/**
 * @file routes.ts
 * @description Feature Flags API Routes
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Original state of this file was inconsistent:
 *   - Read routes had NO authentication (fail-open).
 *   - Write routes used `requireAuth` but no RBAC permission check.
 *
 * The marker migration tightens both. Every route is now wrapped in
 * `protect("<permission>", handler)` which enforces both authentication
 * AND the specific permission. Admins continue to bypass via
 * `user.isAdmin` (see rbac-protect.ts enforce() flow), so the admin UI
 * keeps working without changes.
 *
 * Permission mapping rationale:
 *   - `feature_flags:read`   → list, get, overrides-get, stats, history,
 *                              evaluation, dependency queries, cache status
 *   - `feature_flags:create` → create a flag
 *   - `feature_flags:update` → update flag, enable/disable, set/delete
 *                              overrides, add/remove dependencies
 *   - `feature_flags:delete` → delete a flag
 *   - `feature_flags:manage` → maintenance (cleanup, aggregate, clear-cache)
 *                              and edge cache management
 */

import { Router } from "express";
import { z } from "zod";
import { getFeatureFlagsService } from "./index";
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

const log = createModuleLogger("feature-flags-routes");
const router = Router();

// =============================================================================
// FEATURE FLAG CRUD ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags - List all feature flags
 */
router.get(
  "/feature-flags",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const query = {
        search: req.query.search as string | undefined,
        categories: req.query.categories
          ? (req.query.categories as string).split(",")
          : undefined,
        tags: req.query.tags
          ? (req.query.tags as string).split(",")
          : undefined,
        enabled: req.query.enabled === "true"
          ? true
          : req.query.enabled === "false"
          ? false
          : undefined,
        owner: req.query.owner as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };

      const { flags, total } = await service.searchFlags(query);

      res.json({ data: flags, total });
    } catch (err) {
      log.error({ err }, "Failed to list feature flags");
      res.status(500).json({ message: "Failed to list feature flags" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/:key - Get a feature flag
 */
router.get(
  "/feature-flags/:key",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const flag = await service.getFlag(String(req.params.key));

      if (!flag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.json(flag);
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get feature flag");
      res.status(500).json({ message: "Failed to get feature flag" });
    }
  })
);

/**
 * POST /api/admin/feature-flags - Create a feature flag
 */
router.post(
  "/feature-flags",
  protect("feature_flags:create", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

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
        documentationUrl: z.string().url().optional(),
        issueKey: z.string().optional(),
      });

      const data = createSchema.parse(req.body);
      const userId = (req as any).user?.id?.toString();

      const flag = await service.createFlag(data, userId);

      res.status(201).json(flag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
          errors: err.errors,
        });
      }
      log.error({ err }, "Failed to create feature flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create feature flag" });
    }
  })
);

/**
 * PUT /api/admin/feature-flags/:key - Update a feature flag
 */
router.put(
  "/feature-flags/:key",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.nativeEnum(FeatureCategory).optional(),
        globallyEnabled: z.boolean().optional(),
        toggleable: z.boolean().optional(),
        defaultState: z.boolean().optional(),
        percentageRollout: percentageRolloutSchema.optional(),
        targetingRules: z.array(targetingRuleSchema).optional(),
        dependencies: z.array(featureDependencySchema).optional(),
        tags: z.array(z.string()).optional(),
        owner: z.string().optional(),
        documentationUrl: z.string().url().optional(),
        issueKey: z.string().optional(),
        sunsetDate: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);
      const flag = await service.updateFlag(String(req.params.key), data, userId);

      if (!flag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.json(flag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to update feature flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update feature flag" });
    }
  })
);

/**
 * DELETE /api/admin/feature-flags/:key - Delete a feature flag
 */
router.delete(
  "/feature-flags/:key",
  protect("feature_flags:delete", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const deleted = await service.deleteFlag(String(req.params.key));

      if (!deleted) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      res.status(204).send();
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to delete feature flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to delete feature flag" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/:key/enable - Enable a feature flag
 */
router.post(
  "/feature-flags/:key/enable",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const success = await service.enableFlag(String(req.params.key), userId);

      if (!success) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      const flag = await service.getFlag(String(req.params.key));
      res.json(flag);
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to enable feature flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to enable feature flag" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/:key/disable - Disable a feature flag
 */
router.post(
  "/feature-flags/:key/disable",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const success = await service.disableFlag(String(req.params.key), userId);

      if (!success) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      const flag = await service.getFlag(String(req.params.key));
      res.json(flag);
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to disable feature flag");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to disable feature flag" });
    }
  })
);

// =============================================================================
// OVERRIDE ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags/:key/site-overrides - Get site overrides
 */
router.get(
  "/feature-flags/:key/site-overrides",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const overrides = await service.getSiteOverrides(String(req.params.key));
      res.json({ data: overrides, total: overrides.length });
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get site overrides");
      res.status(500).json({ message: "Failed to get site overrides" });
    }
  })
);

/**
 * PUT /api/admin/feature-flags/:key/site-overrides/:siteId - Set site override
 */
router.put(
  "/feature-flags/:key/site-overrides/:siteId",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const schema = z.object({
        enabled: z.boolean(),
        percentageRollout: percentageRolloutSchema.optional(),
        targetingRules: z.array(targetingRuleSchema).optional(),
      });

      const data = schema.parse(req.body);

      const override = await service.setSiteOverride(
        String(req.params.siteId),
        String(req.params.key),
        data.enabled,
        {
          percentageRollout: data.percentageRollout,
          targetingRules: data.targetingRules,
        },
        userId
      );

      res.json(override);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to set site override");
      res.status(500).json({ message: "Failed to set site override" });
    }
  })
);

/**
 * DELETE /api/admin/feature-flags/:key/site-overrides/:siteId - Delete site override
 */
router.delete(
  "/feature-flags/:key/site-overrides/:siteId",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const deleted = await service.deleteSiteOverride(
        String(req.params.siteId),
        String(req.params.key),
        userId
      );

      if (!deleted) {
        return res.status(404).json({ message: "Override not found" });
      }

      res.status(204).send();
    } catch (err) {
      log.error({ err }, "Failed to delete site override");
      res.status(500).json({ message: "Failed to delete site override" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/:key/user-overrides - Get user overrides
 */
router.get(
  "/feature-flags/:key/user-overrides",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const overrides = await service.getUserOverrides(String(req.params.key));
      res.json({ data: overrides, total: overrides.length });
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get user overrides");
      res.status(500).json({ message: "Failed to get user overrides" });
    }
  })
);

/**
 * PUT /api/admin/feature-flags/:key/user-overrides/:userId - Set user override
 */
router.put(
  "/feature-flags/:key/user-overrides/:userId",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const adminUserId = (req as any).user?.id?.toString();

      const schema = z.object({
        enabled: z.boolean(),
        reason: z.string().optional(),
        expiresAt: z.string().optional(),
      });

      const data = schema.parse(req.body);

      const override = await service.setUserOverride(
        String(req.params.userId),
        String(req.params.key),
        data.enabled,
        {
          reason: data.reason,
          expiresAt: data.expiresAt,
        },
        adminUserId
      );

      res.json(override);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to set user override");
      res.status(500).json({ message: "Failed to set user override" });
    }
  })
);

/**
 * DELETE /api/admin/feature-flags/:key/user-overrides/:userId - Delete user override
 */
router.delete(
  "/feature-flags/:key/user-overrides/:userId",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const adminUserId = (req as any).user?.id?.toString();

      const deleted = await service.deleteUserOverride(
        String(req.params.userId),
        String(req.params.key),
        adminUserId
      );

      if (!deleted) {
        return res.status(404).json({ message: "Override not found" });
      }

      res.status(204).send();
    } catch (err) {
      log.error({ err }, "Failed to delete user override");
      res.status(500).json({ message: "Failed to delete user override" });
    }
  })
);

// =============================================================================
// EVALUATION ROUTES
// =============================================================================

/**
 * POST /api/admin/feature-flags/evaluate - Evaluate a feature flag
 */
router.post(
  "/feature-flags/evaluate",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        featureKey: z.string(),
        context: evaluationContextSchema,
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
      log.error({ err }, "Failed to evaluate feature flag");
      res.status(500).json({ message: "Failed to evaluate feature flag" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/evaluate-batch - Evaluate multiple feature flags
 */
router.post(
  "/feature-flags/evaluate-batch",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        featureKeys: z.array(z.string()),
        context: evaluationContextSchema,
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
      log.error({ err }, "Failed to evaluate feature flags");
      res.status(500).json({ message: "Failed to evaluate feature flags" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/enabled - Get enabled features for context
 */
router.get(
  "/feature-flags/enabled",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const context = {
        userId: req.query.userId as string | undefined,
        siteId: req.query.siteId as string | undefined,
      };

      const enabled = await service.getEnabledFeatures(context);
      res.json({ enabled });
    } catch (err) {
      log.error({ err }, "Failed to get enabled features");
      res.status(500).json({ message: "Failed to get enabled features" });
    }
  })
);

// =============================================================================
// DEPENDENCY ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags/:key/can-enable - Check if flag can be enabled
 */
router.get(
  "/feature-flags/:key/can-enable",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const resolution = await service.canEnable(String(req.params.key));
      res.json(resolution);
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to check can-enable");
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/:key/can-disable - Check if flag can be disabled
 */
router.get(
  "/feature-flags/:key/can-disable",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const resolution = await service.canDisable(String(req.params.key));
      res.json(resolution);
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to check can-disable");
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/dependency-graph - Get dependency graph
 */
router.get(
  "/feature-flags/dependency-graph",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const dot = await service.getDependencyGraph();
      res.type("text/plain").send(dot);
    } catch (err) {
      log.error({ err }, "Failed to get dependency graph");
      res.status(500).json({ message: "Failed to get dependency graph" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/:key/dependencies - Add dependency
 */
router.post(
  "/feature-flags/:key/dependencies",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const dependency = featureDependencySchema.parse(req.body);
      const success = await service.addDependency(String(req.params.key), dependency, userId);

      if (!success) {
        return res.status(404).json({ message: "Feature flag not found" });
      }

      const flag = await service.getFlag(String(req.params.key));
      res.json(flag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err, key: String(req.params.key) }, "Failed to add dependency");
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to add dependency" });
    }
  })
);

/**
 * DELETE /api/admin/feature-flags/:key/dependencies/:depKey - Remove dependency
 */
router.delete(
  "/feature-flags/:key/dependencies/:depKey",
  protect("feature_flags:update", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const userId = (req as any).user?.id?.toString();

      const success = await service.removeDependency(
        String(req.params.key),
        String(req.params.depKey),
        userId
      );

      if (!success) {
        return res.status(404).json({ message: "Dependency not found" });
      }

      const flag = await service.getFlag(String(req.params.key));
      res.json(flag);
    } catch (err) {
      log.error({ err }, "Failed to remove dependency");
      res.status(500).json({ message: "Failed to remove dependency" });
    }
  })
);

// =============================================================================
// STATISTICS ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags/:key/stats - Get usage statistics
 */
router.get(
  "/feature-flags/:key/stats",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const period = (req.query.period as "hour" | "day" | "week" | "month") || "day";

      const stats = await service.getUsageStats(String(req.params.key), period);
      res.json(stats || { message: "No statistics available" });
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get statistics");
      res.status(500).json({ message: "Failed to get statistics" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/:key/stats/history - Get statistics history
 */
router.get(
  "/feature-flags/:key/stats/history",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const period = (req.query.period as "hour" | "day" | "week" | "month") || "day";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 24;

      const history = await service.getUsageStatsHistory(String(req.params.key), period, limit);
      res.json({ data: history, total: history.length });
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get statistics history");
      res.status(500).json({ message: "Failed to get statistics history" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/top - Get top features by usage
 */
router.get(
  "/feature-flags/top",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const period = (req.query.period as "hour" | "day" | "week" | "month") || "day";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const top = await service.getTopFeatures(period, limit);
      res.json({ data: top });
    } catch (err) {
      log.error({ err }, "Failed to get top features");
      res.status(500).json({ message: "Failed to get top features" });
    }
  })
);

// =============================================================================
// HISTORY ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags/:key/history - Get rollout history
 */
router.get(
  "/feature-flags/:key/history",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const history = await service.getRolloutHistory(String(req.params.key), limit);
      res.json({ data: history, total: history.length });
    } catch (err) {
      log.error({ err, key: String(req.params.key) }, "Failed to get rollout history");
      res.status(500).json({ message: "Failed to get rollout history" });
    }
  })
);

/**
 * GET /api/admin/feature-flags/history - Get recent rollout events
 */
router.get(
  "/feature-flags/history",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const events = await service.getRecentRolloutEvents(limit);
      res.json({ data: events, total: events.length });
    } catch (err) {
      log.error({ err }, "Failed to get rollout history");
      res.status(500).json({ message: "Failed to get rollout history" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/history/search - Search rollout history
 */
router.post(
  "/feature-flags/history/search",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        featureKey: z.string().optional(),
        siteId: z.string().optional(),
        userId: z.string().optional(),
        eventType: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      });

      const query = schema.parse(req.body);
      const result = await service.searchRolloutHistory(query);

      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to search rollout history");
      res.status(500).json({ message: "Failed to search rollout history" });
    }
  })
);

// =============================================================================
// MAINTENANCE ROUTES
// =============================================================================

/**
 * POST /api/admin/feature-flags/maintenance/cleanup - Cleanup expired data
 */
router.post(
  "/feature-flags/maintenance/cleanup",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const expiredOverrides = await service.cleanupExpiredOverrides();
      const retentionDays = req.body.retentionDays || 30;
      const oldStats = await service.cleanupOldStats(retentionDays);

      res.json({
        expiredOverridesRemoved: expiredOverrides,
        oldStatsRemoved: oldStats,
      });
    } catch (err) {
      log.error({ err }, "Failed to run cleanup");
      res.status(500).json({ message: "Failed to run cleanup" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/maintenance/aggregate - Aggregate statistics
 */
router.post(
  "/feature-flags/maintenance/aggregate",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      await service.aggregateStats();
      res.json({ message: "Statistics aggregated" });
    } catch (err) {
      log.error({ err }, "Failed to aggregate statistics");
      res.status(500).json({ message: "Failed to aggregate statistics" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/maintenance/clear-cache - Clear evaluation cache
 */
router.post(
  "/feature-flags/maintenance/clear-cache",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      service.clearCache();
      res.json({ message: "Cache cleared" });
    } catch (err) {
      log.error({ err }, "Failed to clear cache");
      res.status(500).json({ message: "Failed to clear cache" });
    }
  })
);

// =============================================================================
// EDGE CACHE ROUTES
// =============================================================================

/**
 * GET /api/admin/feature-flags/cache/status - Get edge cache status
 */
router.get(
  "/feature-flags/cache/status",
  protect("feature_flags:read", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const hasCache = service.hasEdgeCache();
      const stats = service.getEdgeCacheStats();

      res.json({
        enabled: hasCache,
        stats,
      });
    } catch (err) {
      log.error({ err }, "Failed to get edge cache status");
      res.status(500).json({ message: "Failed to get edge cache status" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/cache/invalidate - Invalidate edge cache
 */
router.post(
  "/feature-flags/cache/invalidate",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const featureKey = req.body.featureKey as string | undefined;

      const deleted = await service.invalidateEdgeCache(featureKey);

      res.json({
        invalidated: deleted,
        scope: featureKey || "all",
      });
    } catch (err) {
      log.error({ err }, "Failed to invalidate edge cache");
      res.status(500).json({ message: "Failed to invalidate edge cache" });
    }
  })
);

/**
 * POST /api/admin/feature-flags/cache/reset-stats - Reset edge cache stats
 */
router.post(
  "/feature-flags/cache/reset-stats",
  protect("feature_flags:manage", async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      service.resetEdgeCacheStats();
      res.json({ message: "Edge cache stats reset" });
    } catch (err) {
      log.error({ err }, "Failed to reset edge cache stats");
      res.status(500).json({ message: "Failed to reset edge cache stats" });
    }
  })
);

export default router;
