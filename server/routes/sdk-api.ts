/**
 * @file sdk-api.ts
 * @description Public API endpoints for Feature Flag SDK
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.9.0
 *
 * These endpoints are designed for external service consumption via the SDK.
 * They use API key authentication instead of session auth.
 *
 * Security: API keys are now stored in PostgreSQL with SHA-256 hashing.
 * See HIGH-002 fix: in-memory storage replaced with persistent database storage.
 */

import { Router } from "express";
import { z } from "zod";
import { getFeatureFlagsService } from "../services/feature-flags";
import { getApiKeyService } from "../services/api-keys/api-key-service";
import { createModuleLogger } from "../logger";
import { featureFlagRateLimit } from "../middleware/rate-limit";
import { auditMiddleware } from "../middleware/audit";
import type { Request, Response, NextFunction } from "express";
import type { ApiKeyInfo } from "@shared/api-keys-schema";

const log = createModuleLogger("sdk-api");
const router = Router();

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * Validate API key and attach info to request.
 * Uses database-backed validation with SHA-256 hashing.
 */
async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header",
      code: "E_AUTH_REQUIRED",
    });
  }

  const apiKey = authHeader.slice(7);

  // Check for development key (development mode only)
  if (process.env.NODE_ENV === "development" && apiKey.startsWith("dev_")) {
    (req as any).apiKey = {
      id: 0,
      siteId: req.get("X-Site-ID") || "default",
      tier: "enterprise",
      permissions: ["read", "evaluate", "write", "admin"],
      name: "Development Key",
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
    } as ApiKeyInfo;
    // SECURITY WARNING: Development API key used - for local dev only
    log.warn({
      event: "dev_api_key_used",
      siteId: (req as any).apiKey.siteId,
      ip: req.ip,
      path: req.path,
    }, "Development API key used - ensure NODE_ENV=development is intentional");
    return next();
  }

  try {
    const apiKeyService = getApiKeyService();
    const keyInfo = await apiKeyService.validateKey(apiKey);

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
  } catch (err) {
    log.error({ err }, "API key validation error");
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to validate API key",
      code: "E_AUTH_ERROR",
    });
  }
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
 * Uses database-backed storage with SHA-256 hashing.
 *
 * @deprecated Use getApiKeyService().createKey() directly instead.
 * This function is kept for backward compatibility during migration.
 */
export async function generateApiKey(
  siteId: string,
  tier: "starter" | "pro" | "enterprise" = "starter",
  name: string = "API Key",
  createdBy: number = 1
): Promise<string> {
  const apiKeyService = getApiKeyService();
  const result = await apiKeyService.createKey(siteId, tier, name, createdBy);
  return result.key;
}

/**
 * Revoke an API key by ID.
 *
 * @deprecated Use getApiKeyService().revokeKey() directly instead.
 */
export async function revokeApiKey(keyId: number): Promise<boolean> {
  const apiKeyService = getApiKeyService();
  return apiKeyService.revokeKey(keyId);
}

/**
 * List all API keys for a site (without exposing hashes).
 *
 * @deprecated Use getApiKeyService().listKeys() directly instead.
 */
export async function listApiKeys(siteId: string) {
  const apiKeyService = getApiKeyService();
  return apiKeyService.listKeys(siteId);
}

export default router;
