/**
 * @file sdk-api.ts
 * @description Public API endpoints for Feature Flag SDK
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.9.1
 *
 * These endpoints are designed for external service consumption via the SDK.
 * They use **API key authentication** instead of session auth.
 *
 * Security: API keys are stored in PostgreSQL with SHA-256 hashing.
 * See HIGH-002 fix: in-memory storage replaced with persistent database storage.
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * This file is unusual because the session-based RBAC markers
 * (`protect`, `authRoute`) don't fit an API-key auth model — they check
 * `req.user` populated by Passport, and SDK requests set `req.apiKey`
 * instead. Using `authRoute()` here would 401 every real SDK request.
 *
 * The migration therefore wraps each handler in `publicRoute(...)` to
 * satisfy the lint, and folds the API-key permission check into a local
 * `withApiPermission(permission, handler)` composer. The outermost call
 * at every route site is the marker, so the lint accepts it; the inner
 * composer preserves the original auth behavior exactly.
 *
 * **Auth chain for every route in this file:**
 *   1. `router.use(apiKeyAuth)`   — validates Authorization: Bearer <key>
 *   2. `router.use(featureFlagRateLimit)` — per-key rate limiting
 *   3. `router.use(auditMiddleware(...))` — audit trail
 *   4. `publicRoute(withApiPermission("x", handler))` — per-route permission
 *
 * `publicRoute()` is a pure metadata stamp (see rbac-protect.ts:282) — it
 * does not relax any of the four upstream layers. Reviewers: treat the
 * marker here as "session-protection N/A by design", not "no auth".
 */

import { Router } from "express";
import { z } from "zod";
import { getFeatureFlagsService } from "../services/feature-flags";
import { getApiKeyService } from "../services/api-keys/api-key-service";
import { createModuleLogger } from "../logger";
import { featureFlagRateLimit } from "../middleware/rate-limit";
import { auditMiddleware } from "../middleware/audit";
import { publicRoute } from "../middleware/rbac-protect";
import type { Request, Response, NextFunction, RequestHandler } from "express";
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
 * Compose a per-route API key permission check with the inner handler.
 *
 * This is the API-key equivalent of `protect()` in rbac-protect.ts, but
 * it operates on `req.apiKey.permissions` (set by apiKeyAuth above)
 * instead of `req.user` + rbacService. The outer route registration
 * still wraps this in `publicRoute(...)` so the marker lint accepts it.
 *
 * Returns the same 401 / 403 response shapes as the previous
 * `requireApiPermission` middleware — this refactor is behavior-preserving.
 */
function withApiPermission(
  permission: string,
  handler: RequestHandler
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
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

    return handler(req, res, next);
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
  publicRoute(
    withApiPermission("evaluate", async (req, res) => {
      try {
        const service = getFeatureFlagsService();

        const schema = z.object({
          key: z.string(),
          context: evaluationContextSchema.optional(),
        });

        const { key, context } = schema.parse(req.body);
        const siteId = req.get("X-Site-ID");

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
          // metadata is not on the EvaluationResult type; expose evaluation
          // details that the SDK may want for debugging.
          evaluationTimeMs: result.evaluationTimeMs,
          source: result.source,
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
    })
  )
);

/**
 * POST /api/sdk/feature-flags/evaluate-batch
 * Evaluate multiple feature flags at once.
 */
router.post(
  "/feature-flags/evaluate-batch",
  publicRoute(
    withApiPermission("evaluate", async (req, res) => {
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

        // evaluateBatch returns BatchEvaluationResponse with a record of
        // EvaluationResult under `results`. Iterate entries to produce the
        // SDK response shape.
        const response = await service.evaluateBatch(keys, evalContext);

        res.json({
          results: Object.entries(response.results).map(([key, r]) => ({
            key,
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
    })
  )
);

/**
 * POST /api/sdk/feature-flags/all
 * Get all feature flags for the current site.
 */
router.post(
  "/feature-flags/all",
  publicRoute(
    withApiPermission("read", async (req, res) => {
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
    })
  )
);

/**
 * GET /api/sdk/feature-flags/:key
 * Get a single feature flag's current state.
 */
router.get(
  "/feature-flags/:key",
  publicRoute(
    withApiPermission("read", async (req, res) => {
      try {
        const service = getFeatureFlagsService();
        const siteId = req.get("X-Site-ID");

        const flag = await service.getFlag(String(req.params.key));

        if (!flag) {
          return res.status(404).json({
            error: "Not found",
            message: "Feature flag not found",
          });
        }

        // Evaluate with minimal context
        const result = await service.evaluate(String(req.params.key), { siteId });

        res.json({
          key: flag.key,
          name: flag.name,
          description: flag.description,
          enabled: result.enabled,
          category: flag.category,
        });
      } catch (err) {
        log.error({ err, key: String(req.params.key) }, "SDK get flag failed");
        res.status(500).json({ error: "Failed to get flag" });
      }
    })
  )
);

/**
 * GET /api/sdk/health
 * Health check endpoint. Note: because `router.use(apiKeyAuth)` runs
 * before this route was defined, callers still need a valid API key
 * even though no specific permission is required. The comment on the
 * original handler said "no auth required" but the middleware chain
 * already enforced API key auth — this migration preserves that
 * behavior exactly and does NOT relax the gate. `publicRoute()` here
 * means "no session-RBAC applies"; the upstream `apiKeyAuth` remains.
 */
router.get(
  "/health",
  publicRoute((_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  })
);

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
 * @deprecated Use getApiKeyService().revokeKey(siteId, keyId) directly
 *   instead. Signature updated 2026-04-15 (M1.8a) to require siteId
 *   for Layer-3 RLS enforcement under migration 0006. Callers must
 *   pass the owning site from the admin's request context.
 */
export async function revokeApiKey(siteId: string, keyId: number): Promise<boolean> {
  const apiKeyService = getApiKeyService();
  return apiKeyService.revokeKey(siteId, keyId);
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
