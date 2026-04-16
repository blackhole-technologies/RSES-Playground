/**
 * @file admin-audit.ts
 * @description Admin routes for audit log viewing
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.9.0
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.5.4)
 *
 * Every handler in this file is wrapped in exactly one of:
 *   - protect(permission, handler) — auth + RBAC check
 *   - authRoute(handler) — auth only
 *   - publicRoute(handler) — no auth (none in this file; admin-only)
 *
 * The marker is a non-enumerable Symbol on the handler function. The CI
 * lint test in tests/security/rbac-marker-coverage.test.ts scans this file
 * (and other migrated route files) for unmarked handlers and fails the
 * build if any are found. Adding a new route here requires picking a
 * marker explicitly.
 *
 * The previous pattern used `router.use(requireAuth); router.use(requireAdmin)`
 * for all routes plus per-route `AuditPermissions.read`. The marker pattern
 * subsumes both because `protect("audit_logs:read", ...)` enforces
 * authentication AND the specific permission, with admin bypass.
 */

import { Router } from "express";
import { z } from "zod";
import { auditService } from "../services/audit/audit-service";
import { protect } from "../middleware/rbac-protect";

const router = Router();

// Helper to safely extract string query parameter
function getQueryString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

// ============================================================================
// Audit Log Query Routes
// ============================================================================

/**
 * GET /api/admin/audit
 * Query audit logs with filters.
 */
const querySchema = z.object({
  eventType: z.string().optional(),
  eventCategory: z.enum(["auth", "data", "admin", "security", "system"]).optional(),
  actorId: z.coerce.number().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  siteId: z.string().optional(),
  outcome: z.enum(["success", "failure", "denied"]).optional(),
  action: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  searchTerm: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
  offset: z.coerce.number().min(0).optional(),
});

router.get(
  "/",
  protect("audit_logs:read", async (req, res) => {
    try {
      const params = querySchema.parse(req.query);

      const result = await auditService.query({
        ...params,
        startDate: params.startDate ? new Date(params.startDate) : undefined,
        endDate: params.endDate ? new Date(params.endDate) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/admin/audit/:eventId
 * Get a specific audit log entry.
 */
router.get(
  "/:eventId",
  protect("audit_logs:read", async (req, res) => {
    try {
      const entry = await auditService.getByEventId(String(req.params.eventId));

      if (!entry) {
        return res.status(404).json({ error: "Audit log entry not found" });
      }

      res.json({ entry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/admin/audit/stats
 * Get audit statistics.
 */
router.get(
  "/stats/summary",
  protect("audit_logs:read", async (req, res) => {
    try {
      const startDate = getQueryString(req.query.startDate);
      const endDate = getQueryString(req.query.endDate);

      const stats = await auditService.getStats(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );

      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/admin/audit/resource/:type/:id
 * Get audit trail for a specific resource.
 */
router.get(
  "/resource/:type/:id",
  protect("audit_logs:read", async (req, res) => {
    try {
      const type = String(req.params.type);
      const id = String(req.params.id);
      const limit = parseInt(getQueryString(req.query.limit) || "100", 10);

      const entries = await auditService.getResourceHistory(type, id, limit);

      res.json({ entries });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/admin/audit/user/:userId
 * Get all activity for a specific user.
 */
router.get(
  "/user/:userId",
  protect("audit_logs:read", async (req, res) => {
    try {
      const userId = parseInt(String(req.params.userId), 10);
      const limit = parseInt(getQueryString(req.query.limit) || "100", 10);

      const entries = await auditService.getUserActivity(userId, limit);

      res.json({ entries });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/admin/audit/flush
 * Force flush pending audit logs (for testing/debugging).
 */
router.post(
  "/flush",
  protect("audit_logs:read", async (req, res) => {
    try {
      await auditService.flush();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

export default router;
