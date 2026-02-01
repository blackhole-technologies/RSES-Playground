/**
 * @file tenant-isolation.ts
 * @description Tenant isolation middleware for multi-site security
 * @module middleware
 * @phase Phase 1 - Foundation Realignment
 */

import type { Request, Response, NextFunction } from "express";
import { TenantIsolationService } from "../security/multisite/tenant-isolation";
import { tryGetSiteContext } from "../multisite/site/site-context";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("tenant-isolation-middleware");

// Singleton instance
let isolationService: TenantIsolationService | null = null;

/**
 * Gets or creates the tenant isolation service.
 */
export function getTenantIsolationService(): TenantIsolationService {
  if (!isolationService) {
    isolationService = new TenantIsolationService({
      strictIsolation: process.env.NODE_ENV === "production",
      auditAllAccess: true,
      realtimeChecks: true,
    });
  }
  return isolationService;
}

/**
 * Creates tenant isolation middleware.
 * Validates that requests are properly scoped to a single tenant/site.
 */
export function createTenantIsolationMiddleware() {
  const service = getTenantIsolationService();

  return async (req: Request, res: Response, next: NextFunction) => {
    const siteContext = tryGetSiteContext();

    if (!siteContext) {
      // No site context - skip isolation check (might be a public route)
      return next();
    }

    const { siteId, user, request: reqMeta } = siteContext;

    try {
      // Create isolation context for this request
      const isolationContext = {
        requestId: reqMeta.id,
        siteId,
        tenantId: siteContext.config.networkId,
        userId: user?.id,
        userRole: user?.role,
        isolationLevel: "dedicated" as const,
        permissions: user?.permissions || [],
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000), // 1 minute timeout
      };

      // Attach isolation context to request
      (req as any).isolationContext = isolationContext;

      // Log access for audit
      if (process.env.NODE_ENV === "production" || process.env.AUDIT_ALL === "true") {
        log.debug(
          {
            siteId,
            userId: user?.id,
            path: req.path,
            method: req.method,
          },
          "Request isolation context established"
        );
      }

      next();
    } catch (error) {
      log.error({ error, siteId }, "Failed to establish isolation context");
      return res.status(500).json({
        error: "Isolation context error",
        code: "ISOLATION_ERROR",
      });
    }
  };
}

/**
 * Middleware to enforce cross-site access restrictions.
 * Prevents requests from accessing data belonging to other sites.
 */
export function enforceSiteIsolation() {
  return (req: Request, res: Response, next: NextFunction) => {
    const siteContext = tryGetSiteContext();
    const isolationContext = (req as any).isolationContext;

    if (!siteContext || !isolationContext) {
      return next();
    }

    // Check if request is trying to access another site's data
    const targetSiteId = req.params.siteId || req.query.siteId;

    if (targetSiteId && targetSiteId !== siteContext.siteId) {
      log.warn(
        {
          requestedSiteId: targetSiteId,
          actualSiteId: siteContext.siteId,
          path: req.path,
        },
        "Cross-site access attempt blocked"
      );

      return res.status(403).json({
        error: "Cross-site access denied",
        code: "CROSS_SITE_ACCESS_DENIED",
      });
    }

    next();
  };
}

/**
 * Gets the current isolation context from request.
 */
export function getIsolationContext(req: Request): any | undefined {
  return (req as any).isolationContext;
}
