/**
 * @file rbac.ts
 * @description RBAC middleware for route protection
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 */

import type { Request, Response, NextFunction } from "express";
import { rbacService } from "../services/rbac/rbac-service";
import { auditService, logSecurityEvent } from "../services/audit/audit-service";

// ============================================================================
// Types
// ============================================================================

export interface RBACOptions {
  /** Required permission key (e.g., "feature_flags:update") */
  permission?: string;

  /** Multiple permissions - user must have ALL */
  allPermissions?: string[];

  /** Multiple permissions - user must have ANY */
  anyPermissions?: string[];

  /** Allow if user is admin (bypasses permission check) */
  allowAdmin?: boolean;

  /** Get site ID from request (for site-scoped checks) */
  getSiteId?: (req: Request) => string | undefined;

  /** Custom access denied message */
  deniedMessage?: string;

  /** Log access attempts */
  audit?: boolean;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create RBAC middleware with specified options.
 *
 * @example
 * // Single permission
 * router.post("/", requirePermission("feature_flags:create"), handler);
 *
 * @example
 * // Multiple permissions (all required)
 * router.delete("/:id", requirePermission({
 *   allPermissions: ["feature_flags:delete", "feature_flags:manage"],
 *   audit: true
 * }), handler);
 *
 * @example
 * // Site-scoped permission
 * router.patch("/:id", requirePermission({
 *   permission: "configs:update",
 *   getSiteId: (req) => req.get("x-site-id")
 * }), handler);
 */
export function requirePermission(options: string | RBACOptions) {
  const opts: RBACOptions =
    typeof options === "string" ? { permission: options } : options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    // Must be authenticated
    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
        code: "E_AUTH_REQUIRED",
      });
    }

    // Admin bypass (if enabled)
    if (opts.allowAdmin !== false && user.isAdmin) {
      return next();
    }

    // Get site context
    const siteId = opts.getSiteId?.(req) || req.get("x-site-id");

    try {
      let allowed = false;
      let deniedPermission: string | undefined;

      if (opts.permission) {
        // Single permission check
        const result = await rbacService.hasPermission(user.id, opts.permission, siteId);
        allowed = result.allowed;
        if (!allowed) deniedPermission = opts.permission;
      } else if (opts.allPermissions) {
        // All permissions required
        allowed = await rbacService.hasAllPermissions(user.id, opts.allPermissions, siteId);
        if (!allowed) deniedPermission = opts.allPermissions.join(", ");
      } else if (opts.anyPermissions) {
        // Any permission sufficient
        allowed = await rbacService.hasAnyPermission(user.id, opts.anyPermissions, siteId);
        if (!allowed) deniedPermission = opts.anyPermissions.join(" | ");
      } else {
        // No permission specified - allow authenticated users
        allowed = true;
      }

      if (!allowed) {
        // Log denied access
        if (opts.audit !== false) {
          await logSecurityEvent(
            auditService.contextFromRequest(req),
            "access_denied",
            "denied",
            {
              requiredPermission: deniedPermission,
              path: req.path,
              method: req.method,
            }
          );
        }

        return res.status(403).json({
          error: "Access denied",
          message: opts.deniedMessage || `Missing required permission: ${deniedPermission}`,
          code: "E_PERMISSION_DENIED",
        });
      }

      next();
    } catch (error) {
      console.error("[RBAC] Permission check failed:", error);
      res.status(500).json({
        error: "Permission check failed",
        code: "E_RBAC_ERROR",
      });
    }
  };
}

/**
 * Shorthand for requiring admin role via RBAC.
 */
export function requireRBACAdmin() {
  return requirePermission({
    anyPermissions: ["users:manage", "roles:manage"],
    allowAdmin: true,
    audit: true,
  });
}

/**
 * Middleware to attach effective permissions to request.
 * Useful for frontend to know what actions are available.
 */
export function attachPermissions(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return next();

  const siteId = req.get("x-site-id");

  rbacService
    .getEffectivePermissions(user.id, siteId)
    .then((effective) => {
      (req as any).permissions = Array.from(effective.permissions.keys()).filter(
        (key) => effective.permissions.get(key)?.granted
      );
      (req as any).roles = effective.roles.map((r) => r.roleName);
      next();
    })
    .catch((err) => {
      console.error("[RBAC] Failed to get permissions:", err);
      next();
    });
}

// ============================================================================
// Resource-Specific Permission Helpers
// ============================================================================

export const FeatureFlagPermissions = {
  read: requirePermission("feature_flags:read"),
  create: requirePermission("feature_flags:create"),
  update: requirePermission("feature_flags:update"),
  delete: requirePermission("feature_flags:delete"),
  manage: requirePermission("feature_flags:manage"),
};

export const UserPermissions = {
  read: requirePermission("users:read"),
  create: requirePermission("users:create"),
  update: requirePermission("users:update"),
  delete: requirePermission("users:delete"),
  manage: requirePermission("users:manage"),
};

export const ConfigPermissions = {
  read: requirePermission("configs:read"),
  create: requirePermission("configs:create"),
  update: requirePermission("configs:update"),
  delete: requirePermission("configs:delete"),
};

export const SitePermissions = {
  read: requirePermission("sites:read"),
  create: requirePermission("sites:create"),
  update: requirePermission("sites:update"),
  delete: requirePermission("sites:delete"),
  manage: requirePermission("sites:manage"),
};

export const AuditPermissions = {
  read: requirePermission("audit_logs:read"),
};

export const RolePermissions = {
  read: requirePermission("roles:read"),
  create: requirePermission("roles:create"),
  update: requirePermission("roles:update"),
  delete: requirePermission("roles:delete"),
  manage: requirePermission("permissions:manage"),
};
