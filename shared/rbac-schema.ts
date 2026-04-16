/**
 * @file rbac-schema.ts
 * @description RBAC and Audit Logging database schema
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 */

import { pgTable, text, serial, integer, timestamp, jsonb, boolean, varchar, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

// ============================================================================
// RBAC Tables
// ============================================================================

/**
 * Roles define a named collection of permissions.
 * Built-in roles: super_admin, admin, editor, viewer
 */
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),

  // Role hierarchy - inherits permissions from parent
  parentRoleId: integer("parent_role_id").references((): any => roles.id),

  // System roles cannot be deleted or renamed
  isSystem: boolean("is_system").default(false).notNull(),

  // Priority for conflict resolution (higher = more priority)
  priority: integer("priority").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex("roles_name_idx").on(table.name),
}));

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

/**
 * Permissions define granular access to resources.
 * Format: resource:action (e.g., "feature_flags:update", "users:delete")
 */
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),

  // Permission key format: resource:action
  key: varchar("key", { length: 128 }).notNull().unique(),

  // Human-readable info
  displayName: text("display_name").notNull(),
  description: text("description"),

  // Resource categorization
  resource: varchar("resource", { length: 64 }).notNull(), // e.g., "feature_flags", "users", "configs"
  action: varchar("action", { length: 32 }).notNull(), // e.g., "create", "read", "update", "delete"

  // System permissions cannot be deleted
  isSystem: boolean("is_system").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  keyIdx: uniqueIndex("permissions_key_idx").on(table.key),
  resourceIdx: index("permissions_resource_idx").on(table.resource),
}));

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

/**
 * Maps roles to their permissions.
 */
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),

  // Optional scope restrictions
  scope: jsonb("scope").$type<{
    siteIds?: string[];      // Limit to specific sites
    ownOnly?: boolean;       // Only own resources
    conditions?: Record<string, unknown>; // Additional conditions
  }>(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  rolePermIdx: uniqueIndex("role_perm_idx").on(table.roleId, table.permissionId),
}));

export type RolePermission = typeof rolePermissions.$inferSelect;

/**
 * Assigns roles to users, optionally scoped to sites.
 */
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),

  // Site scope - null means global
  siteId: varchar("site_id", { length: 64 }),

  // Time-limited role assignment
  expiresAt: timestamp("expires_at"),

  // Who granted this role
  grantedBy: integer("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),

  // Reason for assignment (audit trail)
  reason: text("reason"),
}, (table) => ({
  userRoleIdx: index("user_role_idx").on(table.userId),
  userRoleSiteIdx: uniqueIndex("user_role_site_idx").on(table.userId, table.roleId, table.siteId),
}));

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;

/**
 * Direct permission grants to users (bypass roles).
 * Use sparingly - prefer role-based assignments.
 */
export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),

  // Site scope - null means global
  siteId: varchar("site_id", { length: 64 }),

  // Grant or deny (explicit deny overrides grants)
  grant: boolean("grant").default(true).notNull(),

  // Time-limited
  expiresAt: timestamp("expires_at"),

  grantedBy: integer("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),
  reason: text("reason"),
}, (table) => ({
  userPermIdx: index("user_perm_idx").on(table.userId),
  userPermSiteIdx: uniqueIndex("user_perm_site_idx").on(table.userId, table.permissionId, table.siteId),
}));

export type UserPermission = typeof userPermissions.$inferSelect;

// ============================================================================
// Audit Log Tables
// ============================================================================

/**
 * Comprehensive audit log for all system operations.
 * Immutable - entries are never updated or deleted.
 */
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),

  // Event identification
  eventId: varchar("event_id", { length: 36 }).notNull(), // UUID
  eventType: varchar("event_type", { length: 64 }).notNull(), // e.g., "auth.login", "feature_flag.update"
  eventCategory: varchar("event_category", { length: 32 }).notNull(), // auth, data, admin, security

  // Actor (who performed the action)
  actorId: integer("actor_id").references(() => users.id),
  actorType: varchar("actor_type", { length: 32 }).notNull(), // user, system, api_key, webhook
  actorIp: varchar("actor_ip", { length: 45 }), // IPv6 compatible
  actorUserAgent: text("actor_user_agent"),

  // Target resource
  resourceType: varchar("resource_type", { length: 64 }), // feature_flag, user, config, site
  resourceId: text("resource_id"),
  resourceName: text("resource_name"),

  // Site context (multi-tenancy)
  siteId: varchar("site_id", { length: 64 }),

  // Action details
  action: varchar("action", { length: 32 }).notNull(), // create, read, update, delete, login, etc.
  outcome: varchar("outcome", { length: 16 }).notNull(), // success, failure, denied

  // Change tracking
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  changes: jsonb("changes").$type<Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>>(),

  // Additional context
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  // Security context
  sessionId: varchar("session_id", { length: 128 }),
  requestId: varchar("request_id", { length: 36 }),

  // Error information (for failures)
  errorCode: varchar("error_code", { length: 32 }),
  errorMessage: text("error_message"),

  // Compliance fields
  retentionDays: integer("retention_days").default(365),
  sensitiveDataMasked: boolean("sensitive_data_masked").default(false),

  // Timestamps (use timestamptz for proper timezone handling)
  timestamp: timestamp("timestamp").defaultNow().notNull(),

}, (table) => ({
  eventIdIdx: uniqueIndex("audit_event_id_idx").on(table.eventId),
  timestampIdx: index("audit_timestamp_idx").on(table.timestamp),
  actorIdx: index("audit_actor_idx").on(table.actorId),
  resourceIdx: index("audit_resource_idx").on(table.resourceType, table.resourceId),
  siteIdx: index("audit_site_idx").on(table.siteId),
  eventTypeIdx: index("audit_event_type_idx").on(table.eventType),
  outcomeIdx: index("audit_outcome_idx").on(table.outcome),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Audit log retention policies per event category.
 */
export const auditRetentionPolicies = pgTable("audit_retention_policies", {
  id: serial("id").primaryKey(),
  eventCategory: varchar("event_category", { length: 32 }).notNull().unique(),
  retentionDays: integer("retention_days").notNull(),
  archiveEnabled: boolean("archive_enabled").default(false),
  archiveLocation: text("archive_location"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  grantedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
});

// ============================================================================
// Type Definitions for Service Layer
// ============================================================================

/** All available resources in the system */
export type ResourceType =
  | "feature_flags"
  | "users"
  | "roles"
  | "permissions"
  | "configs"
  | "projects"
  | "sites"
  | "audit_logs"
  | "settings"
  // M1.7-seed: resources for forward-referenced permission keys
  // used by the M1.7 route migration (see HANDOFF_2026-04-15_v1.md).
  | "incidents"
  | "watcher"
  | "automation";

/** Standard CRUD actions */
export type ActionType = "create" | "read" | "update" | "delete" | "list" | "manage";

/** Event categories for audit logging */
export type EventCategory = "auth" | "data" | "admin" | "security" | "system";

/** Audit event outcome */
export type AuditOutcome = "success" | "failure" | "denied";

/** Actor type for audit logs */
export type ActorType = "user" | "system" | "api_key" | "webhook" | "scheduler";

/** Permission check result with context */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  effectivePermissions: string[];
  deniedBy?: string;
  grantedBy?: string;
  scope?: {
    siteIds?: string[];
    ownOnly?: boolean;
  };
}

/** User's effective permissions (computed from roles + direct grants) */
export interface EffectivePermissions {
  userId: number;
  permissions: Map<string, {
    granted: boolean;
    source: "role" | "direct";
    roleId?: number;
    siteId?: string | null;
    expiresAt?: Date | null;
  }>;
  roles: Array<{
    roleId: number;
    roleName: string;
    siteId?: string | null;
    expiresAt?: Date | null;
  }>;
}
