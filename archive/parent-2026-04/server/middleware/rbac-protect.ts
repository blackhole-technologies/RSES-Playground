/**
 * @file rbac-protect.ts
 * @description Fail-closed RBAC handler wrappers.
 * @module middleware
 * @phase Phase 1 - Foundation Hardening (added 2026-04-14, ROADMAP M1.5)
 *
 * # Why this exists
 *
 * Pre-2026-04-14 the only RBAC middleware was `requirePermission()` in
 * `rbac.ts` — opt-in per route. A developer who forgot to add it shipped
 * an unprotected endpoint, and the failure mode was "everything works in
 * staging" (because tests rarely cover the negative case).
 *
 * This file flips the discipline: every route handler must be wrapped in
 * exactly one of four markers. The markers are:
 *
 *   protect(permission, handler)   — auth + specific RBAC permission
 *   protectAll(perms[], handler)   — auth + ALL listed permissions
 *   protectAny(perms[], handler)   — auth + ANY listed permission
 *   authRoute(handler)             — auth only, no specific permission
 *   publicRoute(handler)           — no auth, must be intentional
 *
 * Because every wrapped handler carries a marker symbol on a non-enumerable
 * property, a security test (see tests/security/rbac-fail-closed.test.ts)
 * can statically assert that every handler in `server/routes/` is wrapped.
 * The check runs in CI and fails the build on any unmarked handler.
 *
 * This gives us **fail-closed by lint**: unmarked code can't ship.
 *
 * # Migration pattern
 *
 *   // BEFORE
 *   router.get("/users", async (req, res) => { ... });
 *
 *   // AFTER (one of these)
 *   router.get("/users", protect("users:read", async (req, res) => { ... }));
 *   router.get("/users", authRoute(async (req, res) => { ... }));
 *   router.get("/health", publicRoute(async (req, res) => { ... }));
 *
 * The shape is intentionally identical to the unwrapped form so the diff
 * is minimal and IDE jump-to-definition still works.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { rbacService } from "../services/rbac/rbac-service";
import { auditService, logSecurityEvent } from "../services/audit/audit-service";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("rbac-protect");

/**
 * Symbol used to mark a handler as wrapped by one of the protect() helpers.
 * Set as a non-enumerable property so it survives function copies and
 * Object.keys never accidentally exposes it.
 */
export const RBAC_MARKER = Symbol.for("rses.rbac.marker");

/**
 * The kind of protection applied to a handler. Used by the lint test to
 * assert every route declares its protection level explicitly.
 */
export type RBACMarkerKind =
  | { kind: "permission"; permission: string }
  | { kind: "permissions-all"; permissions: string[] }
  | { kind: "permissions-any"; permissions: string[] }
  | { kind: "auth-only" }
  | { kind: "public" };

/**
 * Stamp a marker on a handler. Non-enumerable, writable false — once set
 * a handler cannot be silently re-marked, which would defeat the lint test.
 */
function markHandler<T extends RequestHandler>(
  handler: T,
  marker: RBACMarkerKind
): T {
  Object.defineProperty(handler, RBAC_MARKER, {
    value: marker,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return handler;
}

/**
 * Read the RBAC marker off a handler. Returns undefined if not marked.
 * Used by the security test to enumerate route handlers and assert
 * coverage.
 */
export function getRBACMarker(handler: RequestHandler): RBACMarkerKind | undefined {
  return (handler as unknown as Record<symbol, RBACMarkerKind | undefined>)[
    RBAC_MARKER
  ];
}

/**
 * Internal: enforces auth + an optional permission check, then calls the
 * inner handler. All four protect/auth wrappers funnel through this so the
 * deny path is identical across markers — same audit log, same response
 * shape, same status codes.
 *
 * userId is typed as `number` to match the rbacService.hasPermission API
 * (the project's users.id column is a serial/integer in shared/schema.ts).
 * The Passport user object exposes `id` as `number` after deserialization.
 */
function enforce(
  inner: RequestHandler,
  options: {
    requireAuth: boolean;
    permissionCheck?: (
      userId: number,
      siteId: string | undefined
    ) => Promise<{ allowed: boolean; deniedFor?: string }>;
    deniedFor?: string;
  }
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as { user?: { id: number; isAdmin?: boolean } }).user;

    // Auth gate. Public routes skip this entirely.
    if (options.requireAuth && !user) {
      return res.status(401).json({
        error: "Authentication required",
        code: "E_AUTH_REQUIRED",
      });
    }

    // Permission check. Admin always passes (matches existing behavior in
    // requirePermission for backwards compatibility).
    if (options.permissionCheck && user) {
      if (!user.isAdmin) {
        const siteId = req.get("x-site-id") || undefined;
        try {
          const result = await options.permissionCheck(user.id, siteId);
          if (!result.allowed) {
            // Audit-log every deny so security can build a denied-attempts
            // dashboard. This is the highest-signal monitoring data we have.
            await logSecurityEvent(
              auditService.contextFromRequest(req),
              "access_denied",
              "denied",
              {
                requiredPermission: result.deniedFor ?? options.deniedFor,
                path: req.path,
                method: req.method,
              }
            ).catch((err) => {
              // Audit failures must not block the response. Log loudly.
              log.error(
                { err },
                "Failed to write security audit event for access_denied"
              );
            });

            return res.status(403).json({
              error: "Access denied",
              message: `Missing required permission: ${result.deniedFor ?? options.deniedFor}`,
              code: "E_PERMISSION_DENIED",
            });
          }
        } catch (err) {
          // RBAC service errors fail closed — if we can't check the
          // permission, we don't grant it. The alternative (failing open)
          // is exactly the bug class we're trying to eliminate.
          log.error(
            { err, path: req.path },
            "RBAC permission check threw; failing closed"
          );
          return res.status(500).json({
            error: "Permission check failed",
            code: "E_RBAC_ERROR",
          });
        }
      }
    }

    // Forward to the wrapped handler. We don't try to catch errors here —
    // express's normal error pipeline (the app-level error handler) is the
    // right place for that.
    return inner(req, res, next);
  };
}

/**
 * Wrap a handler with auth + a single RBAC permission check.
 *
 * @example
 *   router.post("/feature-flags", protect("feature_flags:create", async (req, res) => {
 *     ...
 *   }));
 */
export function protect(permission: string, handler: RequestHandler): RequestHandler {
  const wrapped = enforce(handler, {
    requireAuth: true,
    deniedFor: permission,
    permissionCheck: async (userId, siteId) => {
      const result = await rbacService.hasPermission(userId, permission, siteId);
      return { allowed: result.allowed, deniedFor: permission };
    },
  });
  return markHandler(wrapped, { kind: "permission", permission });
}

/**
 * Wrap a handler with auth + ALL of the listed permissions.
 */
export function protectAll(
  permissions: string[],
  handler: RequestHandler
): RequestHandler {
  if (permissions.length === 0) {
    throw new Error("protectAll requires at least one permission");
  }
  const wrapped = enforce(handler, {
    requireAuth: true,
    deniedFor: permissions.join(", "),
    permissionCheck: async (userId, siteId) => {
      const allowed = await rbacService.hasAllPermissions(
        userId,
        permissions,
        siteId
      );
      return { allowed, deniedFor: permissions.join(", ") };
    },
  });
  return markHandler(wrapped, { kind: "permissions-all", permissions });
}

/**
 * Wrap a handler with auth + ANY one of the listed permissions.
 */
export function protectAny(
  permissions: string[],
  handler: RequestHandler
): RequestHandler {
  if (permissions.length === 0) {
    throw new Error("protectAny requires at least one permission");
  }
  const wrapped = enforce(handler, {
    requireAuth: true,
    deniedFor: permissions.join(" | "),
    permissionCheck: async (userId, siteId) => {
      const allowed = await rbacService.hasAnyPermission(
        userId,
        permissions,
        siteId
      );
      return { allowed, deniedFor: permissions.join(" | ") };
    },
  });
  return markHandler(wrapped, { kind: "permissions-any", permissions });
}

/**
 * Wrap a handler that requires authentication but no specific permission.
 * Use sparingly — most routes should use protect() with a real permission.
 *
 * @example
 *   router.get("/me", authRoute(async (req, res) => {
 *     res.json({ user: req.user });
 *   }));
 */
export function authRoute(handler: RequestHandler): RequestHandler {
  const wrapped = enforce(handler, { requireAuth: true });
  return markHandler(wrapped, { kind: "auth-only" });
}

/**
 * Wrap a handler that intentionally requires no authentication. Use for
 * health checks, login, public landing pages, OAuth callbacks, etc.
 *
 * **The presence of publicRoute() in a diff is a security review signal.**
 * Reviewers should ask: is this route truly public? Does it leak data?
 * Does it have rate limiting?
 *
 * @example
 *   router.get("/health", publicRoute((_req, res) => {
 *     res.json({ status: "ok" });
 *   }));
 */
export function publicRoute(handler: RequestHandler): RequestHandler {
  // No enforce wrapper — public routes pass straight through.
  return markHandler(handler, { kind: "public" });
}

/**
 * Read the marker for a handler in a friendly form. Used by the lint test
 * to produce actionable error messages.
 */
export function describeMarker(marker: RBACMarkerKind | undefined): string {
  if (!marker) return "<unmarked>";
  switch (marker.kind) {
    case "permission":
      return `protect("${marker.permission}")`;
    case "permissions-all":
      return `protectAll([${marker.permissions.map((p) => `"${p}"`).join(", ")}])`;
    case "permissions-any":
      return `protectAny([${marker.permissions.map((p) => `"${p}"`).join(", ")}])`;
    case "auth-only":
      return "authRoute()";
    case "public":
      return "publicRoute()";
  }
}
