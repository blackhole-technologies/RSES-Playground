/**
 * @file rbac-service.ts
 * @description Role-Based Access Control service with site-scoped permissions
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Provides granular permission management:
 * - Role hierarchy with inheritance
 * - Site-scoped permissions
 * - Direct permission grants/denies
 * - Permission caching
 */

import { db } from "../../db";
import {
  roles,
  permissions,
  rolePermissions,
  userRoles,
  userPermissions,
  type Role,
  type Permission,
  type UserRole,
  type PermissionCheckResult,
  type EffectivePermissions,
  type ResourceType,
  type ActionType,
} from "../../../shared/rbac-schema";
import { users } from "../../../shared/schema";
import { eq, and, or, isNull, gte, sql, inArray } from "drizzle-orm";
import { auditService, logAdminEvent } from "../audit/audit-service";
import type { AuditContext } from "../audit/audit-service";

// ============================================================================
// Types
// ============================================================================

export interface CreateRoleOptions {
  name: string;
  displayName: string;
  description?: string;
  parentRoleId?: number;
  isSystem?: boolean;
  priority?: number;
}

export interface AssignRoleOptions {
  userId: number;
  roleId: number;
  siteId?: string;
  expiresAt?: Date;
  reason?: string;
}

export interface GrantPermissionOptions {
  userId: number;
  permissionKey: string;
  siteId?: string;
  grant?: boolean;
  expiresAt?: Date;
  reason?: string;
}

// ============================================================================
// Permission Cache
// ============================================================================

interface CachedPermissions {
  permissions: EffectivePermissions;
  expiresAt: number;
}

const permissionCache = new Map<string, CachedPermissions>();
const CACHE_TTL = 60 * 1000; // 1 minute

function getCacheKey(userId: number, siteId?: string): string {
  return `${userId}:${siteId || "global"}`;
}

function invalidateCache(userId: number, siteId?: string): void {
  if (siteId) {
    permissionCache.delete(getCacheKey(userId, siteId));
  }
  permissionCache.delete(getCacheKey(userId, undefined));
  // Also invalidate global cache for this user
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      permissionCache.delete(key);
    }
  }
}

// ============================================================================
// RBAC Service
// ============================================================================

class RBACService {
  // ==========================================================================
  // Role Management
  // ==========================================================================

  /**
   * Create a new role.
   */
  async createRole(options: CreateRoleOptions, context?: AuditContext): Promise<Role> {
    const [role] = await db
      .insert(roles)
      .values({
        name: options.name,
        displayName: options.displayName,
        description: options.description,
        parentRoleId: options.parentRoleId,
        isSystem: options.isSystem || false,
        priority: options.priority || 0,
      })
      .returning();

    if (context) {
      await logAdminEvent(context, "create_role", "role", role.id.toString(), "success", {
        roleName: role.name,
      });
    }

    return role;
  }

  /**
   * Get all roles.
   */
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(roles.priority);
  }

  /**
   * Get a role by ID.
   */
  async getRoleById(id: number): Promise<Role | null> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return role || null;
  }

  /**
   * Get a role by name.
   */
  async getRoleByName(name: string): Promise<Role | null> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
    return role || null;
  }

  /**
   * Update a role.
   */
  async updateRole(
    id: number,
    updates: Partial<Omit<CreateRoleOptions, "isSystem">>,
    context?: AuditContext
  ): Promise<Role | null> {
    const [role] = await db
      .update(roles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(roles.id, id), eq(roles.isSystem, false)))
      .returning();

    if (role && context) {
      await logAdminEvent(context, "update_role", "role", id.toString(), "success", updates);
    }

    return role || null;
  }

  /**
   * Delete a role (non-system only).
   */
  async deleteRole(id: number, context?: AuditContext): Promise<boolean> {
    const result = await db
      .delete(roles)
      .where(and(eq(roles.id, id), eq(roles.isSystem, false)))
      .returning();

    if (result.length > 0 && context) {
      await logAdminEvent(context, "delete_role", "role", id.toString(), "success");
    }

    return result.length > 0;
  }

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  /**
   * Create a new permission.
   */
  async createPermission(
    resource: ResourceType,
    action: ActionType,
    displayName: string,
    description?: string
  ): Promise<Permission> {
    const key = `${resource}:${action}`;

    const [permission] = await db
      .insert(permissions)
      .values({
        key,
        displayName,
        description,
        resource,
        action,
        isSystem: false,
      })
      .returning();

    return permission;
  }

  /**
   * Get all permissions.
   */
  async getPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(permissions.resource, permissions.action);
  }

  /**
   * Get permissions for a role (including inherited).
   */
  async getRolePermissions(roleId: number): Promise<Permission[]> {
    // Get role hierarchy
    const roleIds = await this.getRoleHierarchy(roleId);

    const results = await db
      .select({
        permission: permissions,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));

    return results.map((r) => r.permission);
  }

  /**
   * Assign permission to a role.
   */
  async assignPermissionToRole(
    roleId: number,
    permissionId: number,
    scope?: { siteIds?: string[]; ownOnly?: boolean },
    context?: AuditContext
  ): Promise<void> {
    await db
      .insert(rolePermissions)
      .values({
        roleId,
        permissionId,
        scope,
      })
      .onConflictDoUpdate({
        target: [rolePermissions.roleId, rolePermissions.permissionId],
        set: { scope },
      });

    if (context) {
      await logAdminEvent(
        context,
        "assign_permission",
        "role",
        roleId.toString(),
        "success",
        { permissionId, scope }
      );
    }
  }

  /**
   * Remove permission from a role.
   */
  async removePermissionFromRole(
    roleId: number,
    permissionId: number,
    context?: AuditContext
  ): Promise<void> {
    await db
      .delete(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId))
      );

    if (context) {
      await logAdminEvent(context, "remove_permission", "role", roleId.toString(), "success", {
        permissionId,
      });
    }
  }

  // ==========================================================================
  // User Role Assignment
  // ==========================================================================

  /**
   * Assign a role to a user.
   */
  async assignRole(options: AssignRoleOptions, context?: AuditContext): Promise<UserRole> {
    const [assignment] = await db
      .insert(userRoles)
      .values({
        userId: options.userId,
        roleId: options.roleId,
        siteId: options.siteId,
        expiresAt: options.expiresAt,
        grantedBy: context?.actorId,
        reason: options.reason,
      })
      .onConflictDoUpdate({
        target: [userRoles.userId, userRoles.roleId, userRoles.siteId],
        set: {
          expiresAt: options.expiresAt,
          grantedBy: context?.actorId,
          reason: options.reason,
          grantedAt: new Date(),
        },
      })
      .returning();

    invalidateCache(options.userId, options.siteId);

    if (context) {
      await logAdminEvent(context, "assign_role", "user", options.userId.toString(), "success", {
        roleId: options.roleId,
        siteId: options.siteId,
      });
    }

    return assignment;
  }

  /**
   * Remove a role from a user.
   */
  async removeRole(
    userId: number,
    roleId: number,
    siteId?: string,
    context?: AuditContext
  ): Promise<boolean> {
    const conditions = [eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)];

    if (siteId) {
      conditions.push(eq(userRoles.siteId, siteId));
    } else {
      conditions.push(isNull(userRoles.siteId));
    }

    const result = await db.delete(userRoles).where(and(...conditions)).returning();

    invalidateCache(userId, siteId);

    if (result.length > 0 && context) {
      await logAdminEvent(context, "remove_role", "user", userId.toString(), "success", {
        roleId,
        siteId,
      });
    }

    return result.length > 0;
  }

  /**
   * Get all roles for a user.
   */
  async getUserRoles(userId: number, siteId?: string): Promise<Array<Role & { siteId?: string }>> {
    const now = new Date();

    let conditions = and(
      eq(userRoles.userId, userId),
      or(isNull(userRoles.expiresAt), gte(userRoles.expiresAt, now))
    );

    if (siteId) {
      conditions = and(
        conditions,
        or(eq(userRoles.siteId, siteId), isNull(userRoles.siteId))
      );
    }

    const results = await db
      .select({
        role: roles,
        siteId: userRoles.siteId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(conditions);

    return results.map((r) => ({
      ...r.role,
      siteId: r.siteId || undefined,
    }));
  }

  // ==========================================================================
  // Direct Permission Grants
  // ==========================================================================

  /**
   * Grant or deny a permission directly to a user.
   */
  async grantPermission(options: GrantPermissionOptions, context?: AuditContext): Promise<void> {
    const [permission] = await db
      .select()
      .from(permissions)
      .where(eq(permissions.key, options.permissionKey))
      .limit(1);

    if (!permission) {
      throw new Error(`Permission not found: ${options.permissionKey}`);
    }

    await db
      .insert(userPermissions)
      .values({
        userId: options.userId,
        permissionId: permission.id,
        siteId: options.siteId,
        grant: options.grant !== false,
        expiresAt: options.expiresAt,
        grantedBy: context?.actorId,
        reason: options.reason,
      })
      .onConflictDoUpdate({
        target: [userPermissions.userId, userPermissions.permissionId, userPermissions.siteId],
        set: {
          grant: options.grant !== false,
          expiresAt: options.expiresAt,
          grantedBy: context?.actorId,
          reason: options.reason,
          grantedAt: new Date(),
        },
      });

    invalidateCache(options.userId, options.siteId);

    if (context) {
      await logAdminEvent(context, "grant_permission", "user", options.userId.toString(), "success", {
        permissionKey: options.permissionKey,
        grant: options.grant !== false,
        siteId: options.siteId,
      });
    }
  }

  /**
   * Remove a direct permission grant from a user.
   */
  async revokePermission(
    userId: number,
    permissionKey: string,
    siteId?: string,
    context?: AuditContext
  ): Promise<boolean> {
    const [permission] = await db
      .select()
      .from(permissions)
      .where(eq(permissions.key, permissionKey))
      .limit(1);

    if (!permission) return false;

    const conditions = [
      eq(userPermissions.userId, userId),
      eq(userPermissions.permissionId, permission.id),
    ];

    if (siteId) {
      conditions.push(eq(userPermissions.siteId, siteId));
    } else {
      conditions.push(isNull(userPermissions.siteId));
    }

    const result = await db.delete(userPermissions).where(and(...conditions)).returning();

    invalidateCache(userId, siteId);

    if (result.length > 0 && context) {
      await logAdminEvent(context, "revoke_permission", "user", userId.toString(), "success", {
        permissionKey,
        siteId,
      });
    }

    return result.length > 0;
  }

  // ==========================================================================
  // Permission Checking
  // ==========================================================================

  /**
   * Check if a user has a specific permission.
   */
  async hasPermission(
    userId: number,
    permissionKey: string,
    siteId?: string
  ): Promise<PermissionCheckResult> {
    const effective = await this.getEffectivePermissions(userId, siteId);
    const permInfo = effective.permissions.get(permissionKey);

    if (!permInfo) {
      return {
        allowed: false,
        reason: "Permission not found in user's effective permissions",
        effectivePermissions: Array.from(effective.permissions.keys()),
      };
    }

    if (!permInfo.granted) {
      return {
        allowed: false,
        reason: "Permission explicitly denied",
        effectivePermissions: Array.from(effective.permissions.keys()),
        deniedBy: permInfo.source === "direct" ? "direct_deny" : `role:${permInfo.roleId}`,
      };
    }

    return {
      allowed: true,
      effectivePermissions: Array.from(effective.permissions.keys()),
      grantedBy: permInfo.source === "direct" ? "direct_grant" : `role:${permInfo.roleId}`,
    };
  }

  /**
   * Check multiple permissions at once.
   */
  async hasAllPermissions(
    userId: number,
    permissionKeys: string[],
    siteId?: string
  ): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId, siteId);

    for (const key of permissionKeys) {
      const perm = effective.permissions.get(key);
      if (!perm || !perm.granted) return false;
    }

    return true;
  }

  /**
   * Check if user has any of the specified permissions.
   */
  async hasAnyPermission(
    userId: number,
    permissionKeys: string[],
    siteId?: string
  ): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId, siteId);

    for (const key of permissionKeys) {
      const perm = effective.permissions.get(key);
      if (perm?.granted) return true;
    }

    return false;
  }

  /**
   * Get all effective permissions for a user.
   */
  async getEffectivePermissions(userId: number, siteId?: string): Promise<EffectivePermissions> {
    const cacheKey = getCacheKey(userId, siteId);
    const cached = permissionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const now = new Date();
    const permissionMap = new Map<
      string,
      {
        granted: boolean;
        source: "role" | "direct";
        roleId?: number;
        siteId?: string | null;
        expiresAt?: Date | null;
      }
    >();

    // Get user's roles (global + site-scoped)
    const userRolesList = await this.getUserRoles(userId, siteId);

    const rolesList: Array<{
      roleId: number;
      roleName: string;
      siteId?: string | null;
      expiresAt?: Date | null;
    }> = userRolesList.map((r) => ({
      roleId: r.id,
      roleName: r.name,
      siteId: r.siteId,
    }));

    // Collect all role IDs including inherited
    const allRoleIds = new Set<number>();
    for (const role of userRolesList) {
      const hierarchy = await this.getRoleHierarchy(role.id);
      hierarchy.forEach((id) => allRoleIds.add(id));
    }

    // Get permissions from roles
    if (allRoleIds.size > 0) {
      const rolePerms = await db
        .select({
          permissionKey: permissions.key,
          roleId: rolePermissions.roleId,
          scope: rolePermissions.scope,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(inArray(rolePermissions.roleId, Array.from(allRoleIds)));

      for (const rp of rolePerms) {
        // Check scope
        const scope = rp.scope as { siteIds?: string[]; ownOnly?: boolean } | null;
        if (scope?.siteIds && siteId && !scope.siteIds.includes(siteId)) {
          continue; // Skip if site not in allowed list
        }

        const existing = permissionMap.get(rp.permissionKey);
        if (!existing) {
          permissionMap.set(rp.permissionKey, {
            granted: true,
            source: "role",
            roleId: rp.roleId,
          });
        }
      }
    }

    // Get direct permission grants (override role permissions)
    const directPermsConditions = [
      eq(userPermissions.userId, userId),
      or(isNull(userPermissions.expiresAt), gte(userPermissions.expiresAt, now)),
    ];

    if (siteId) {
      directPermsConditions.push(
        or(eq(userPermissions.siteId, siteId), isNull(userPermissions.siteId))
      );
    }

    const directPerms = await db
      .select({
        permissionKey: permissions.key,
        grant: userPermissions.grant,
        siteId: userPermissions.siteId,
        expiresAt: userPermissions.expiresAt,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(...directPermsConditions));

    for (const dp of directPerms) {
      // Direct grants/denies always override role permissions
      permissionMap.set(dp.permissionKey, {
        granted: dp.grant,
        source: "direct",
        siteId: dp.siteId,
        expiresAt: dp.expiresAt,
      });
    }

    const result: EffectivePermissions = {
      userId,
      permissions: permissionMap,
      roles: rolesList,
    };

    // Cache result
    permissionCache.set(cacheKey, {
      permissions: result,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return result;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Get role hierarchy (self + all parent roles).
   */
  private async getRoleHierarchy(roleId: number): Promise<number[]> {
    const hierarchy: number[] = [roleId];
    const visited = new Set<number>([roleId]);

    let currentId: number | null = roleId;

    while (currentId) {
      const [role] = await db
        .select({ parentRoleId: roles.parentRoleId })
        .from(roles)
        .where(eq(roles.id, currentId))
        .limit(1);

      if (role?.parentRoleId && !visited.has(role.parentRoleId)) {
        hierarchy.push(role.parentRoleId);
        visited.add(role.parentRoleId);
        currentId = role.parentRoleId;
      } else {
        currentId = null;
      }
    }

    return hierarchy;
  }

  /**
   * Initialize default roles and permissions.
   */
  async initializeDefaults(): Promise<void> {
    // Default permissions
    const defaultPermissions: Array<{
      key: string;
      displayName: string;
      resource: string;
      action: string;
    }> = [
      // Feature flags
      { key: "feature_flags:read", displayName: "View Feature Flags", resource: "feature_flags", action: "read" },
      { key: "feature_flags:create", displayName: "Create Feature Flags", resource: "feature_flags", action: "create" },
      { key: "feature_flags:update", displayName: "Update Feature Flags", resource: "feature_flags", action: "update" },
      { key: "feature_flags:delete", displayName: "Delete Feature Flags", resource: "feature_flags", action: "delete" },
      { key: "feature_flags:manage", displayName: "Manage Feature Flags", resource: "feature_flags", action: "manage" },

      // Users
      { key: "users:read", displayName: "View Users", resource: "users", action: "read" },
      { key: "users:create", displayName: "Create Users", resource: "users", action: "create" },
      { key: "users:update", displayName: "Update Users", resource: "users", action: "update" },
      { key: "users:delete", displayName: "Delete Users", resource: "users", action: "delete" },
      { key: "users:manage", displayName: "Manage Users", resource: "users", action: "manage" },

      // Configs
      { key: "configs:read", displayName: "View Configs", resource: "configs", action: "read" },
      { key: "configs:create", displayName: "Create Configs", resource: "configs", action: "create" },
      { key: "configs:update", displayName: "Update Configs", resource: "configs", action: "update" },
      { key: "configs:delete", displayName: "Delete Configs", resource: "configs", action: "delete" },

      // Sites
      { key: "sites:read", displayName: "View Sites", resource: "sites", action: "read" },
      { key: "sites:create", displayName: "Create Sites", resource: "sites", action: "create" },
      { key: "sites:update", displayName: "Update Sites", resource: "sites", action: "update" },
      { key: "sites:delete", displayName: "Delete Sites", resource: "sites", action: "delete" },
      { key: "sites:manage", displayName: "Manage Sites", resource: "sites", action: "manage" },

      // Audit logs
      { key: "audit_logs:read", displayName: "View Audit Logs", resource: "audit_logs", action: "read" },

      // Roles & Permissions
      { key: "roles:read", displayName: "View Roles", resource: "roles", action: "read" },
      { key: "roles:create", displayName: "Create Roles", resource: "roles", action: "create" },
      { key: "roles:update", displayName: "Update Roles", resource: "roles", action: "update" },
      { key: "roles:delete", displayName: "Delete Roles", resource: "roles", action: "delete" },
      { key: "permissions:manage", displayName: "Manage Permissions", resource: "permissions", action: "manage" },
    ];

    for (const perm of defaultPermissions) {
      await db
        .insert(permissions)
        .values({
          key: perm.key,
          displayName: perm.displayName,
          resource: perm.resource,
          action: perm.action,
          isSystem: true,
        })
        .onConflictDoNothing();
    }

    // Default roles
    const defaultRoles = [
      { name: "super_admin", displayName: "Super Admin", description: "Full system access", priority: 100 },
      { name: "admin", displayName: "Administrator", description: "Administrative access", priority: 80 },
      { name: "editor", displayName: "Editor", description: "Can create and edit content", priority: 50 },
      { name: "viewer", displayName: "Viewer", description: "Read-only access", priority: 10 },
    ];

    for (const role of defaultRoles) {
      await db
        .insert(roles)
        .values({
          name: role.name,
          displayName: role.displayName,
          description: role.description,
          priority: role.priority,
          isSystem: true,
        })
        .onConflictDoNothing();
    }

    // Assign all permissions to super_admin
    const [superAdmin] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const allPerms = await db.select().from(permissions);

    if (superAdmin) {
      for (const perm of allPerms) {
        await db
          .insert(rolePermissions)
          .values({ roleId: superAdmin.id, permissionId: perm.id })
          .onConflictDoNothing();
      }
    }

    // Admin gets most permissions except role management
    const [admin] = await db.select().from(roles).where(eq(roles.name, "admin")).limit(1);
    if (admin) {
      const adminPerms = allPerms.filter(
        (p) => !p.key.startsWith("roles:") && p.key !== "permissions:manage"
      );
      for (const perm of adminPerms) {
        await db
          .insert(rolePermissions)
          .values({ roleId: admin.id, permissionId: perm.id })
          .onConflictDoNothing();
      }
    }

    // Editor gets content-related permissions
    const [editor] = await db.select().from(roles).where(eq(roles.name, "editor")).limit(1);
    if (editor) {
      const editorPerms = allPerms.filter((p) =>
        ["configs:read", "configs:create", "configs:update", "feature_flags:read", "sites:read"].includes(
          p.key
        )
      );
      for (const perm of editorPerms) {
        await db
          .insert(rolePermissions)
          .values({ roleId: editor.id, permissionId: perm.id })
          .onConflictDoNothing();
      }
    }

    // Viewer gets read-only permissions
    const [viewer] = await db.select().from(roles).where(eq(roles.name, "viewer")).limit(1);
    if (viewer) {
      const viewerPerms = allPerms.filter((p) => p.action === "read");
      for (const perm of viewerPerms) {
        await db
          .insert(rolePermissions)
          .values({ roleId: viewer.id, permissionId: perm.id })
          .onConflictDoNothing();
      }
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const rbacService = new RBACService();
