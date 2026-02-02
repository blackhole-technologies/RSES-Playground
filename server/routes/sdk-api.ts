/**
 * @file sdk-api.ts
 * @description Public API endpoints for Feature Flag SDK
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * These endpoints are designed for external service consumption via the SDK.
 * They use API key authentication instead of session auth.
 */

import { Router } from "express";
import { z } from "zod";
import { getFeatureFlagsService } from "../services/feature-flags";
import { createModuleLogger } from "../logger";
import { featureFlagRateLimit, endpointRateLimit } from "../middleware/rate-limit";
import { auditMiddleware } from "../middleware/audit";
import type { Request, Response, NextFunction } from "express";

const log = createModuleLogger("sdk-api");
const router = Router();

// ============================================================================
// API Key Authentication
// ============================================================================

interface ApiKeyInfo {
  id: string;
  siteId: string;
  tier: "starter" | "pro" | "enterprise";
  permissions: string[];
  createdAt: Date;
}

// In production, this would be stored in database
const apiKeys = new Map<string, ApiKeyInfo>();

/**
 * Validate API key and attach info to request.
 */
function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header",
      code: "E_AUTH_REQUIRED",
    });
  }

  const apiKey = authHeader.slice(7);

  // Check for development key
  if (process.env.NODE_ENV !== "production" && apiKey.startsWith("dev_")) {
    (req as any).apiKey = {
      id: "dev",
      siteId: req.get("X-Site-ID") || "default",
      tier: "enterprise",
      permissions: ["read", "evaluate"],
      createdAt: new Date(),
    };
    return next();
  }

  const keyInfo = apiKeys.get(apiKey);

  if (!keyInfo) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API key",
      code: "E_INVALID_API_KEY",
    });
  }

  // Attach key info to request
  (req as any).apiKey = keyInfo;

  // Override site ID from key if not provided
  if (!req.get("X-Site-ID") && keyInfo.siteId) {
    req.headers["x-site-id"] = keyInfo.siteId;
  }

  next();
}

/**
 * Check if API key has required permission.
 */
function requireApiPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const keyInfo = (req as any).apiKey as ApiKeyInfo | undefined;

    if (!keyInfo) {
      return res.status(401).json({
        error: "Unauthorized",
        code: "E_AUTH_REQUIRED",
      });
    }

    if (!keyInfo.permissions.includes(permission)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `API key lacks required permission: ${permission}`,
        code: "E_PERMISSION_DENIED",
      });
    }

    next();
  };
}

// Apply auth and rate limiting to all SDK routes
router.use(apiKeyAuth);
router.use(featureFlagRateLimit);
router.use(
  auditMiddleware({
    category: "data",
    skipMethods: ["OPTIONS", "HEAD"],
  })
);

// ============================================================================
// Evaluation Context Schema
// ============================================================================

const evaluationContextSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
  region: z.string().optional(),
  custom: z.record(z.unknown()).optional(),
});

// ============================================================================
// SDK API Endpoints
// ============================================================================

/**
 * POST /api/sdk/feature-flags/evaluate
 * Evaluate a single feature flag.
 */
router.post(
  "/feature-flags/evaluate",
  requireApiPermission("evaluate"),
  async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        key: z.string(),
        context: evaluationContextSchema.optional(),
      });

      const { key, context } = schema.parse(req.body);
      const siteId = req.get("X-Site-ID");

      // Build evaluation context
      const evalContext = {
        ...context,
        siteId,
      };

      const result = await service.evaluate(key, evalContext);

      res.json({
        key,
        enabled: result.enabled,
        reason: result.reason,
        variant: result.variant,
        metadata: result.metadata,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      }
      log.error({ err }, "SDK evaluate failed");
      res.status(500).json({ error: "Evaluation failed" });
    }
  }
);

/**
 * POST /api/sdk/feature-flags/evaluate-batch
 * Evaluate multiple feature flags at once.
 */
router.post(
  "/feature-flags/evaluate-batch",
  requireApiPermission("evaluate"),
  async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        keys: z.array(z.string()).min(1).max(100),
        context: evaluationContextSchema.optional(),
      });

      const { keys, context } = schema.parse(req.body);
      const siteId = req.get("X-Site-ID");

      const evalContext = {
        ...context,
        siteId,
      };

      const response = await service.evaluateBatch(keys, evalContext);

      res.json({
        results: response.results.map((r: any) => ({
          key: r.featureKey || r.key,
          enabled: r.enabled,
          reason: r.reason,
          variant: r.variant,
        })),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      }
      log.error({ err }, "SDK evaluate-batch failed");
      res.status(500).json({ error: "Batch evaluation failed" });
    }
  }
);

/**
 * POST /api/sdk/feature-flags/all
 * Get all feature flags for the current site.
 */
router.post(
  "/feature-flags/all",
  requireApiPermission("read"),
  async (req, res) => {
    try {
      const service = getFeatureFlagsService();

      const schema = z.object({
        context: evaluationContextSchema.optional(),
      });

      const { context } = schema.parse(req.body);
      const siteId = req.get("X-Site-ID");

      const evalContext = {
        ...context,
        siteId,
      };

      // Get all flags and evaluate each
      const { flags } = await service.searchFlags({});
      const results = await Promise.all(
        flags.map(async (flag: any) => {
          const result = await service.evaluate(flag.key, evalContext);
          return {
            key: flag.key,
            name: flag.name,
            description: flag.description,
            enabled: result.enabled,
            category: flag.category,
            metadata: flag.metadata,
          };
        })
      );

      res.json({ flags: results });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      }
      log.error({ err }, "SDK get-all failed");
      res.status(500).json({ error: "Failed to get flags" });
    }
  }
);

/**
 * GET /api/sdk/feature-flags/:key
 * Get a single feature flag's current state.
 */
router.get(
  "/feature-flags/:key",
  requireApiPermission("read"),
  async (req, res) => {
    try {
      const service = getFeatureFlagsService();
      const siteId = req.get("X-Site-ID");

      const flag = await service.getFlag(req.params.key);

      if (!flag) {
        return res.status(404).json({
          error: "Not found",
          message: "Feature flag not found",
        });
      }

      // Evaluate with minimal context
      const result = await service.evaluate(req.params.key, { siteId });

      res.json({
        key: flag.key,
        name: flag.name,
        description: flag.description,
        enabled: result.enabled,
        category: flag.category,
      });
    } catch (err) {
      log.error({ err, key: req.params.key }, "SDK get flag failed");
      res.status(500).json({ error: "Failed to get flag" });
    }
  }
);

/**
 * GET /api/sdk/health
 * Health check endpoint (no auth required).
 */
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================================================
// API Key Management (Admin Only)
// ============================================================================

/**
 * Generate a new API key.
 * In production, this would be protected by admin auth.
 */
export function generateApiKey(siteId: string, tier: ApiKeyInfo["tier"] = "starter"): string {
  const key = `ff_${tier}_${randomString(32)}`;

  apiKeys.set(key, {
    id: randomString(8),
    siteId,
    tier,
    permissions: ["read", "evaluate"],
    createdAt: new Date(),
  });

  return key;
}

/**
 * Revoke an API key.
 */
export function revokeApiKey(key: string): boolean {
  return apiKeys.delete(key);
}

/**
 * List all API keys for a site.
 */
export function listApiKeys(siteId: string): ApiKeyInfo[] {
  const keys: ApiKeyInfo[] = [];
  for (const info of apiKeys.values()) {
    if (info.siteId === siteId) {
      keys.push(info);
    }
  }
  return keys;
}

function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default router;
