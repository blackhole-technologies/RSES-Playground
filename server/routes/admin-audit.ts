/**
 * @file admin-audit.ts
 * @description Admin routes for audit log viewing
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 */

import { Router } from "express";
import { z } from "zod";
import { auditService } from "../services/audit/audit-service";
import { requireAuth, requireAdmin } from "../auth/session";
import { AuditPermissions } from "../middleware/rbac";

const router = Router();

// Helper to safely extract string query parameter
function getQueryString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

// All routes require authentication and admin status
router.use(requireAuth);
router.use(requireAdmin);

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

router.get("/", AuditPermissions.read, async (req, res) => {
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
});

/**
 * GET /api/admin/audit/:eventId
 * Get a specific audit log entry.
 */
router.get("/:eventId", AuditPermissions.read, async (req, res) => {
  try {
    const entry = await auditService.getByEventId(req.params.eventId);

    if (!entry) {
      return res.status(404).json({ error: "Audit log entry not found" });
    }

    res.json({ entry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/audit/stats
 * Get audit statistics.
 */
router.get("/stats/summary", AuditPermissions.read, async (req, res) => {
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
});

/**
 * GET /api/admin/audit/resource/:type/:id
 * Get audit trail for a specific resource.
 */
router.get("/resource/:type/:id", AuditPermissions.read, async (req, res) => {
  try {
    const { type, id } = req.params;
    const limit = parseInt(getQueryString(req.query.limit) || "100", 10);

    const entries = await auditService.getResourceHistory(type, id, limit);

    res.json({ entries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/audit/user/:userId
 * Get all activity for a specific user.
 */
router.get("/user/:userId", AuditPermissions.read, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(getQueryString(req.query.limit) || "100", 10);

    const entries = await auditService.getUserActivity(userId, limit);

    res.json({ entries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/audit/flush
 * Force flush pending audit logs (for testing/debugging).
 */
router.post("/flush", AuditPermissions.read, async (req, res) => {
  try {
    await auditService.flush();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
