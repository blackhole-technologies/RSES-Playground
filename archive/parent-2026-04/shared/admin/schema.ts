/**
 * @file schema.ts
 * @description Drizzle ORM schema for Feature Flags and Admin Dashboard
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 */

import { pgTable, text, serial, integer, timestamp, jsonb, boolean, index, uniqueIndex, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../schema";

// =============================================================================
// FEATURE FLAGS TABLE
// =============================================================================

/**
 * Feature flags - stores all feature flag definitions
 */
export const featureFlags = pgTable("admin_feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").$type<"core" | "optional" | "beta" | "experimental" | "deprecated">().notNull(),

  // === State ===
  globallyEnabled: boolean("globally_enabled").default(false),
  toggleable: boolean("toggleable").default(true),
  defaultState: boolean("default_state").default(false),

  // === Rollout ===
  percentageRollout: jsonb("percentage_rollout").$type<{
    enabled: boolean;
    percentage: number;
    seed?: string;
    bucketBy: string[];
  } | null>().default(null),

  // === A/B Testing ===
  abTestConfig: jsonb("ab_test_config").$type<{
    enabled: boolean;
    experimentKey: string;
    variants: Array<{
      key: string;
      name: string;
      description?: string;
      weight: number;
      payload?: Record<string, unknown>;
    }>;
    controlVariant: string;
    targetAudience?: Record<string, string | string[]>;
    startDate?: string;
    endDate?: string;
  } | null>().default(null),

  // === Targeting ===
  targetingRules: jsonb("targeting_rules").$type<Array<{
    id: string;
    attribute: string;
    operator: string;
    value: string | number | boolean | string[];
    variation: boolean;
  }>>().default([]),

  // === Dependencies ===
  dependencies: jsonb("dependencies").$type<Array<{
    featureKey: string;
    requiredState: boolean;
    requiredVariation?: string;
  }>>().default([]),

  // === Metadata ===
  tags: jsonb("tags").$type<string[]>().default([]),
  owner: text("owner"),
  documentationUrl: text("documentation_url"),
  issueKey: text("issue_key"),

  // === Lifecycle ===
  sunsetDate: timestamp("sunset_date"),
  introducedInVersion: text("introduced_in_version"),

  // === Audit ===
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  lastModifiedBy: integer("last_modified_by").references(() => users.id),
}, (table) => [
  index("idx_feature_flag_category").on(table.category),
  index("idx_feature_flag_enabled").on(table.globallyEnabled),
  index("idx_feature_flag_owner").on(table.owner),
]);

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbFeatureFlag = typeof featureFlags.$inferSelect;
export type DbInsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;

// =============================================================================
// SITE FEATURE OVERRIDES TABLE
// =============================================================================

/**
 * Site-level feature flag overrides
 */
export const siteFeatureOverrides = pgTable("admin_site_feature_overrides", {
  id: serial("id").primaryKey(),
  siteId: text("site_id").notNull(),
  featureKey: text("feature_key").notNull().references(() => featureFlags.key, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),

  percentageRollout: jsonb("percentage_rollout").$type<{
    enabled: boolean;
    percentage: number;
    seed?: string;
    bucketBy: string[];
  } | null>().default(null),

  targetingRules: jsonb("targeting_rules").$type<Array<{
    id: string;
    attribute: string;
    operator: string;
    value: string | number | boolean | string[];
    variation: boolean;
  }> | null>().default(null),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => [
  uniqueIndex("idx_site_feature_override_unique").on(table.siteId, table.featureKey),
  index("idx_site_feature_override_site").on(table.siteId),
  index("idx_site_feature_override_feature").on(table.featureKey),
]);

export const insertSiteFeatureOverrideSchema = createInsertSchema(siteFeatureOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbSiteFeatureOverride = typeof siteFeatureOverrides.$inferSelect;
export type DbInsertSiteFeatureOverride = z.infer<typeof insertSiteFeatureOverrideSchema>;

// =============================================================================
// USER FEATURE OVERRIDES TABLE
// =============================================================================

/**
 * User-level feature flag overrides
 */
export const userFeatureOverrides = pgTable("admin_user_feature_overrides", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  featureKey: text("feature_key").notNull().references(() => featureFlags.key, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),

  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => [
  uniqueIndex("idx_user_feature_override_unique").on(table.userId, table.featureKey),
  index("idx_user_feature_override_user").on(table.userId),
  index("idx_user_feature_override_feature").on(table.featureKey),
  index("idx_user_feature_override_expires").on(table.expiresAt),
]);

export const insertUserFeatureOverrideSchema = createInsertSchema(userFeatureOverrides).omit({
  id: true,
  createdAt: true,
});

export type DbUserFeatureOverride = typeof userFeatureOverrides.$inferSelect;
export type DbInsertUserFeatureOverride = z.infer<typeof insertUserFeatureOverrideSchema>;

// =============================================================================
// SITES TABLE
// =============================================================================

/**
 * Site configurations for multi-site management
 */
export const sites = pgTable("admin_sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  environment: text("environment").$type<"development" | "staging" | "production">().notNull(),
  region: text("region").notNull(),
  version: text("version").notNull(),

  // === Status ===
  healthStatus: text("health_status").$type<"healthy" | "degraded" | "unhealthy" | "unknown">().default("unknown"),
  lastHealthCheck: timestamp("last_health_check"),
  uptime: real("uptime").default(0),

  // === RSES Configuration ===
  rsesConfigId: integer("rses_config_id"),
  rsesConfigVersion: integer("rses_config_version"),

  // === Metadata ===
  owner: text("owner"),
  tags: jsonb("tags").$type<string[]>().default([]),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastDeployedAt: timestamp("last_deployed_at"),
}, (table) => [
  index("idx_site_environment").on(table.environment),
  index("idx_site_health").on(table.healthStatus),
  index("idx_site_region").on(table.region),
]);

export const insertSiteSchema = createInsertSchema(sites).omit({
  createdAt: true,
  updatedAt: true,
  lastHealthCheck: true,
});

export type DbSite = typeof sites.$inferSelect;
export type DbInsertSite = z.infer<typeof insertSiteSchema>;

// =============================================================================
// SITE METRICS TABLE
// =============================================================================

/**
 * Site resource usage metrics (time-series data)
 */
export const siteMetrics = pgTable("admin_site_metrics", {
  id: serial("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),

  cpuPercent: real("cpu_percent").notNull(),
  memoryPercent: real("memory_percent").notNull(),
  diskPercent: real("disk_percent").notNull(),
  networkInMbps: real("network_in_mbps").notNull(),
  networkOutMbps: real("network_out_mbps").notNull(),

  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("idx_site_metrics_site_time").on(table.siteId, table.timestamp),
]);

export type DbSiteMetrics = typeof siteMetrics.$inferSelect;

// =============================================================================
// FEATURE USAGE STATS TABLE
// =============================================================================

/**
 * Feature flag usage statistics
 */
export const featureUsageStats = pgTable("admin_feature_usage_stats", {
  id: serial("id").primaryKey(),
  featureKey: text("feature_key").notNull().references(() => featureFlags.key, { onDelete: "cascade" }),
  period: text("period").$type<"hour" | "day" | "week" | "month">().notNull(),
  periodStart: timestamp("period_start").notNull(),

  // === Counts ===
  evaluations: integer("evaluations").default(0),
  enabledEvaluations: integer("enabled_evaluations").default(0),
  disabledEvaluations: integer("disabled_evaluations").default(0),

  // === Users ===
  uniqueUsers: integer("unique_users").default(0),
  uniqueUsersEnabled: integer("unique_users_enabled").default(0),

  // === Sites ===
  sitesWithOverrides: integer("sites_with_overrides").default(0),
  sitesEnabled: integer("sites_enabled").default(0),
  sitesDisabled: integer("sites_disabled").default(0),

  // === Errors ===
  evaluationErrors: integer("evaluation_errors").default(0),
  dependencyErrors: integer("dependency_errors").default(0),

  // === Performance ===
  avgEvaluationTimeMs: real("avg_evaluation_time_ms").default(0),
  p95EvaluationTimeMs: real("p95_evaluation_time_ms").default(0),
  p99EvaluationTimeMs: real("p99_evaluation_time_ms").default(0),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_feature_usage_unique").on(table.featureKey, table.period, table.periodStart),
  index("idx_feature_usage_period").on(table.period, table.periodStart),
]);

export type DbFeatureUsageStats = typeof featureUsageStats.$inferSelect;

// =============================================================================
// ROLLOUT HISTORY TABLE
// =============================================================================

/**
 * Feature flag change history for audit trail
 */
export const rolloutHistory = pgTable("admin_rollout_history", {
  id: serial("id").primaryKey(),
  featureKey: text("feature_key").notNull().references(() => featureFlags.key, { onDelete: "cascade" }),
  eventType: text("event_type").$type<
    "created" | "enabled" | "disabled" | "percentage_changed" |
    "targeting_updated" | "dependency_added" | "dependency_removed" |
    "override_added" | "override_removed" | "deprecated" | "archived"
  >().notNull(),

  // === Context ===
  siteId: text("site_id"),
  targetUserId: text("target_user_id"),

  // === Change Details ===
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),

  // === Metadata ===
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  // === Audit ===
  userId: integer("user_id").references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("idx_rollout_history_feature").on(table.featureKey),
  index("idx_rollout_history_timestamp").on(table.timestamp),
  index("idx_rollout_history_event").on(table.eventType),
  index("idx_rollout_history_site").on(table.siteId),
]);

export const insertRolloutHistorySchema = createInsertSchema(rolloutHistory).omit({
  id: true,
  timestamp: true,
});

export type DbRolloutHistory = typeof rolloutHistory.$inferSelect;
export type DbInsertRolloutHistory = z.infer<typeof insertRolloutHistorySchema>;

// =============================================================================
// DASHBOARD LAYOUTS TABLE
// =============================================================================

/**
 * Custom dashboard layouts per user
 */
export const dashboardLayouts = pgTable("admin_dashboard_layouts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  userId: integer("user_id").references(() => users.id),
  isDefault: boolean("is_default").default(false),
  isGlobal: boolean("is_global").default(false),

  widgets: jsonb("widgets").$type<Array<{
    id: string;
    type: string;
    title: string;
    position: { x: number; y: number; width: number; height: number };
    settings: Record<string, unknown>;
    refreshInterval?: number;
  }>>().default([]),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_dashboard_layout_user").on(table.userId),
]);

export const insertDashboardLayoutSchema = createInsertSchema(dashboardLayouts).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbDashboardLayout = typeof dashboardLayouts.$inferSelect;
export type DbInsertDashboardLayout = z.infer<typeof insertDashboardLayoutSchema>;

// =============================================================================
// FEATURE DEPENDENCIES VIEW (Computed)
// =============================================================================

/**
 * Helper type for dependency resolution
 */
export interface FeatureDependencyNode {
  key: string;
  name: string;
  enabled: boolean;
  dependencies: string[];
  dependents: string[];
  depth: number;
  hasCycle: boolean;
}

/**
 * Dependency resolution result
 */
export interface DependencyResolution {
  canEnable: boolean;
  blockedBy: string[];
  wouldBreak: string[];
  dependencyChain: FeatureDependencyNode[];
}
