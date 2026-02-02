/**
 * @file admin-rbac.ts
 * @description Admin routes for RBAC management
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 */

import { Router } from "express";
import { z } from "zod";
import { rbacService } from "../services/rbac/rbac-service";
import { auditService } from "../services/audit/audit-service";
import { requireAuth, requireAdmin } from "../auth/session";
import { requirePermission, RolePermissions, AuditPermissions } from "../middleware/rbac";
import { auditMiddleware } from "../middleware/audit";

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
router.use(auditMiddleware({ category: "admin", includeBody: true }));

// ============================================================================
// Role Routes
// ============================================================================

/**
 * GET /api/admin/rbac/roles
 * List all roles.
 */
router.get("/roles", RolePermissions.read, async (req, res) => {
  try {
    const roles = await rbacService.getRoles();
    res.json({ roles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/rbac/roles/:id
 * Get a specific role with its permissions.
 */
router.get("/roles/:id", RolePermissions.read, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const role = await rbacService.getRoleById(id);

    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const permissions = await rbacService.getRolePermissions(id);

    res.json({ role, permissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/rbac/roles
 * Create a new role.
 */
const createRoleSchema = z.object({
  name: z.string().min(2).max(64).regex(/^[a-z_]+$/),
  displayName: z.string().min(2).max(128),
  description: z.string().optional(),
  parentRoleId: z.number().optional(),
  priority: z.number().min(0).max(100).optional(),
});

router.post("/roles", RolePermissions.create, async (req, res) => {
  try {
    const data = createRoleSchema.parse(req.body);
    const context = auditService.contextFromRequest(req);

    const role = await rbacService.createRole(data, context);
    res.status(201).json({ role });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/admin/rbac/roles/:id
 * Update a role.
 */
router.patch("/roles/:id", RolePermissions.update, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = createRoleSchema.partial().parse(req.body);
    const context = auditService.contextFromRequest(req);

    const role = await rbacService.updateRole(id, data, context);

    if (!role) {
      return res.status(404).json({ error: "Role not found or is a system role" });
    }

    res.json({ role });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/rbac/roles/:id
 * Delete a role.
 */
router.delete("/roles/:id", RolePermissions.delete, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const context = auditService.contextFromRequest(req);

    const success = await rbacService.deleteRole(id, context);

    if (!success) {
      return res.status(404).json({ error: "Role not found or is a system role" });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Permission Routes
// ============================================================================

/**
 * GET /api/admin/rbac/permissions
 * List all permissions.
 */
router.get("/permissions", RolePermissions.read, async (req, res) => {
  try {
    const permissions = await rbacService.getPermissions();
    res.json({ permissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/rbac/roles/:id/permissions
 * Assign a permission to a role.
 */
const assignPermissionSchema = z.object({
  permissionId: z.number(),
  scope: z
    .object({
      siteIds: z.array(z.string()).optional(),
      ownOnly: z.boolean().optional(),
    })
    .optional(),
});

router.post("/roles/:id/permissions", RolePermissions.manage, async (req, res) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    const { permissionId, scope } = assignPermissionSchema.parse(req.body);
    const context = auditService.contextFromRequest(req);

    await rbacService.assignPermissionToRole(roleId, permissionId, scope, context);
    res.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/rbac/roles/:roleId/permissions/:permissionId
 * Remove a permission from a role.
 */
router.delete(
  "/roles/:roleId/permissions/:permissionId",
  RolePermissions.manage,
  async (req, res) => {
    try {
      const roleId = parseInt(req.params.roleId, 10);
      const permissionId = parseInt(req.params.permissionId, 10);
      const context = auditService.contextFromRequest(req);

      await rbacService.removePermissionFromRole(roleId, permissionId, context);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// User Role Assignment Routes
// ============================================================================

/**
 * GET /api/admin/rbac/users/:id/roles
 * Get roles for a user.
 */
router.get("/users/:id/roles", RolePermissions.read, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const siteId = getQueryString(req.query.siteId);

    const roles = await rbacService.getUserRoles(userId, siteId);
    res.json({ roles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/rbac/users/:id/roles
 * Assign a role to a user.
 */
const assignRoleSchema = z.object({
  roleId: z.number(),
  siteId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().optional(),
});

router.post("/users/:id/roles", RolePermissions.manage, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const data = assignRoleSchema.parse(req.body);
    const context = auditService.contextFromRequest(req);

    const assignment = await rbacService.assignRole(
      {
        userId,
        roleId: data.roleId,
        siteId: data.siteId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        reason: data.reason,
      },
      context
    );

    res.status(201).json({ assignment });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/rbac/users/:userId/roles/:roleId
 * Remove a role from a user.
 */
router.delete("/users/:userId/roles/:roleId", RolePermissions.manage, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const roleId = parseInt(req.params.roleId, 10);
    const siteId = getQueryString(req.query.siteId);
    const context = auditService.contextFromRequest(req);

    const success = await rbacService.removeRole(userId, roleId, siteId, context);

    if (!success) {
      return res.status(404).json({ error: "Role assignment not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/rbac/users/:id/permissions
 * Get effective permissions for a user.
 */
router.get("/users/:id/permissions", RolePermissions.read, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const siteId = getQueryString(req.query.siteId);

    const effective = await rbacService.getEffectivePermissions(userId, siteId);

    const permissions = Array.from(effective.permissions.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));

    res.json({
      userId,
      siteId,
      roles: effective.roles,
      permissions,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/rbac/users/:id/permissions
 * Grant or deny a direct permission to a user.
 */
const grantPermissionSchema = z.object({
  permissionKey: z.string(),
  siteId: z.string().optional(),
  grant: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().optional(),
});

router.post("/users/:id/permissions", RolePermissions.manage, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const data = grantPermissionSchema.parse(req.body);
    const context = auditService.contextFromRequest(req);

    await rbacService.grantPermission(
      {
        userId,
        permissionKey: data.permissionKey,
        siteId: data.siteId,
        grant: data.grant,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        reason: data.reason,
      },
      context
    );

    res.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/rbac/users/:id/permissions/:key
 * Revoke a direct permission from a user.
 */
router.delete("/users/:id/permissions/:key", RolePermissions.manage, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const permissionKey = decodeURIComponent(req.params.key);
    const siteId = getQueryString(req.query.siteId);
    const context = auditService.contextFromRequest(req);

    const success = await rbacService.revokePermission(userId, permissionKey, siteId, context);

    if (!success) {
      return res.status(404).json({ error: "Permission grant not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Permission Check Route
// ============================================================================

/**
 * POST /api/admin/rbac/check
 * Check if a user has a specific permission.
 */
const checkPermissionSchema = z.object({
  userId: z.number(),
  permission: z.string(),
  siteId: z.string().optional(),
});

router.post("/check", RolePermissions.read, async (req, res) => {
  try {
    const { userId, permission, siteId } = checkPermissionSchema.parse(req.body);
    const result = await rbacService.hasPermission(userId, permission, siteId);
    res.json(result);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Initialize Defaults Route
// ============================================================================

/**
 * POST /api/admin/rbac/initialize
 * Initialize default roles and permissions.
 */
router.post("/initialize", requirePermission("permissions:manage"), async (req, res) => {
  try {
    await rbacService.initializeDefaults();
    res.json({ success: true, message: "Default roles and permissions initialized" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
