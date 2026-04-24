/**
 * @file types.ts
 * @description Shared types for Admin Interface with Feature Toggles
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * Inspired by LaunchDarkly, Unleash, and modern feature flag management systems.
 * Supports global, per-site, and per-user feature flags with percentage rollouts.
 */

import { z } from "zod";

// =============================================================================
// FEATURE FLAG CATEGORIES
// =============================================================================

/**
 * Feature categories define the lifecycle stage of a feature
 */
export const FeatureCategory = {
  /** Core features that are always on and cannot be toggled */
  CORE: "core",
  /** Optional features that can be enabled/disabled per site or user */
  OPTIONAL: "optional",
  /** Beta features with limited rollout for testing */
  BETA: "beta",
  /** Experimental features that require explicit opt-in */
  EXPERIMENTAL: "experimental",
  /** Deprecated features scheduled for removal */
  DEPRECATED: "deprecated",
} as const;

export type FeatureCategory = (typeof FeatureCategory)[keyof typeof FeatureCategory];

// =============================================================================
// FEATURE FLAG SCHEMAS
// =============================================================================

/**
 * Percentage rollout configuration
 */
export const percentageRolloutSchema = z.object({
  enabled: z.boolean().default(false),
  percentage: z.number().min(0).max(100).default(0),
  /** Seed for consistent hashing (user-based rollout) */
  seed: z.string().optional(),
  /** Optional list of attributes to use for bucketing */
  bucketBy: z.array(z.string()).default(["userId"]),
});

export type PercentageRollout = z.infer<typeof percentageRolloutSchema>;

/**
 * A/B testing variant configuration
 */
export const abTestVariantSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100),
  payload: z.record(z.unknown()).optional(),
});

export type ABTestVariant = z.infer<typeof abTestVariantSchema>;

/**
 * A/B testing configuration
 */
export const abTestConfigSchema = z.object({
  enabled: z.boolean().default(false),
  experimentKey: z.string(),
  variants: z.array(abTestVariantSchema),
  /** Control variant key */
  controlVariant: z.string(),
  /** Target audience filter */
  targetAudience: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ABTestConfig = z.infer<typeof abTestConfigSchema>;

/**
 * Feature targeting rule
 */
export const targetingRuleSchema = z.object({
  id: z.string(),
  attribute: z.string(),
  operator: z.enum(["equals", "notEquals", "contains", "notContains", "in", "notIn", "greaterThan", "lessThan", "regex", "semver"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  /** Whether to enable or disable for matches */
  variation: z.boolean(),
});

export type TargetingRule = z.infer<typeof targetingRuleSchema>;

/**
 * Feature dependency specification
 */
export const featureDependencySchema = z.object({
  featureKey: z.string(),
  /** Require feature to be on or off */
  requiredState: z.boolean().default(true),
  /** Optional: specific variation required */
  requiredVariation: z.string().optional(),
});

export type FeatureDependency = z.infer<typeof featureDependencySchema>;

/**
 * Complete feature flag definition
 */
export const featureFlagSchema = z.object({
  /** Unique feature key (snake_case recommended) */
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Display name */
  name: z.string(),
  /** Detailed description */
  description: z.string(),
  /** Feature category */
  category: z.nativeEnum(FeatureCategory),

  // === Global State ===
  /** Global enable/disable switch */
  globallyEnabled: z.boolean().default(false),
  /** Whether the feature can be toggled (false for core features) */
  toggleable: z.boolean().default(true),
  /** Default state when not explicitly set */
  defaultState: z.boolean().default(false),

  // === Rollout Configuration ===
  percentageRollout: percentageRolloutSchema.optional(),
  abTestConfig: abTestConfigSchema.optional(),

  // === Targeting ===
  targetingRules: z.array(targetingRuleSchema).default([]),

  // === Dependencies ===
  dependencies: z.array(featureDependencySchema).default([]),
  /** Features that depend on this one (computed) */
  dependents: z.array(z.string()).default([]),

  // === Metadata ===
  /** Tags for organization */
  tags: z.array(z.string()).default([]),
  /** Owner (user or team) */
  owner: z.string().optional(),
  /** Documentation URL */
  documentationUrl: z.string().url().optional(),
  /** JIRA/Issue tracker reference */
  issueKey: z.string().optional(),

  // === Lifecycle ===
  /** When the feature was created */
  createdAt: z.string(),
  /** Last update timestamp */
  updatedAt: z.string(),
  /** When the feature is scheduled for removal (deprecated features) */
  sunsetDate: z.string().optional(),
  /** Version when feature was introduced */
  introducedInVersion: z.string().optional(),

  // === Audit ===
  /** Last modified by */
  lastModifiedBy: z.string().optional(),
  /** Change history (last N changes) */
  changeHistory: z.array(z.object({
    timestamp: z.string(),
    userId: z.string(),
    action: z.string(),
    previousValue: z.unknown(),
    newValue: z.unknown(),
  })).default([]),
});

export type FeatureFlag = z.infer<typeof featureFlagSchema>;

/**
 * Site-specific feature override
 *
 * `reason` was added 2026-04-14 to match the database column on
 * `siteFeatureOverrides` (shared/schema.ts). The DB has stored a reason
 * since the feature flag tables were introduced; the schema type was
 * out of sync.
 */
export const siteFeatureOverrideSchema = z.object({
  siteId: z.string(),
  featureKey: z.string(),
  enabled: z.boolean(),
  reason: z.string().optional(),
  percentageRollout: percentageRolloutSchema.optional(),
  targetingRules: z.array(targetingRuleSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});

export type SiteFeatureOverride = z.infer<typeof siteFeatureOverrideSchema>;

/**
 * User-specific feature override
 */
export const userFeatureOverrideSchema = z.object({
  userId: z.string(),
  featureKey: z.string(),
  enabled: z.boolean(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});

export type UserFeatureOverride = z.infer<typeof userFeatureOverrideSchema>;

// =============================================================================
// SITE MANAGEMENT TYPES
// =============================================================================

/**
 * Site health status
 */
export const SiteHealthStatus = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
  UNKNOWN: "unknown",
} as const;

export type SiteHealthStatus = (typeof SiteHealthStatus)[keyof typeof SiteHealthStatus];

/**
 * Resource usage metrics
 */
export const resourceUsageSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  networkInMbps: z.number().min(0),
  networkOutMbps: z.number().min(0),
  timestamp: z.string(),
});

export type ResourceUsage = z.infer<typeof resourceUsageSchema>;

/**
 * Site configuration
 */
export const siteConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  environment: z.enum(["development", "staging", "production"]),
  region: z.string(),
  version: z.string(),

  // === Status ===
  healthStatus: z.nativeEnum(SiteHealthStatus),
  lastHealthCheck: z.string(),
  uptime: z.number(),

  // === Resources ===
  resourceUsage: resourceUsageSchema.optional(),
  resourceHistory: z.array(resourceUsageSchema).default([]),

  // === RSES Configuration ===
  rsesConfigId: z.number().optional(),
  rsesConfigVersion: z.number().optional(),

  // === Feature Flags ===
  enabledFeatures: z.array(z.string()).default([]),
  featureOverrides: z.record(z.boolean()).default({}),

  // === Metadata ===
  createdAt: z.string(),
  updatedAt: z.string(),
  lastDeployedAt: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

/**
 * Site quick action
 */
export const SiteAction = {
  RESTART: "restart",
  CLEAR_CACHE: "clear_cache",
  SYNC_CONFIG: "sync_config",
  DEPLOY: "deploy",
  ROLLBACK: "rollback",
  ENABLE_MAINTENANCE: "enable_maintenance",
  DISABLE_MAINTENANCE: "disable_maintenance",
} as const;

export type SiteAction = (typeof SiteAction)[keyof typeof SiteAction];

/**
 * Bulk operation request
 */
export const bulkOperationSchema = z.object({
  siteIds: z.array(z.string()),
  action: z.nativeEnum(SiteAction),
  options: z.record(z.unknown()).optional(),
});

export type BulkOperation = z.infer<typeof bulkOperationSchema>;

// =============================================================================
// DASHBOARD WIDGET TYPES
// =============================================================================

/**
 * Dashboard widget types
 */
export const WidgetType = {
  FEATURE_STATS: "feature_stats",
  SITE_HEALTH: "site_health",
  RESOURCE_USAGE: "resource_usage",
  ROLLOUT_PROGRESS: "rollout_progress",
  RECENT_CHANGES: "recent_changes",
  FEATURE_ADOPTION: "feature_adoption",
  DEPENDENCY_GRAPH: "dependency_graph",
  AB_TEST_RESULTS: "ab_test_results",
} as const;

export type WidgetType = (typeof WidgetType)[keyof typeof WidgetType];

/**
 * Widget configuration
 */
export const widgetConfigSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(WidgetType),
  title: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  settings: z.record(z.unknown()).default({}),
  refreshInterval: z.number().optional(),
});

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

/**
 * Dashboard layout
 */
export const dashboardLayoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  widgets: z.array(widgetConfigSchema),
  isDefault: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});

export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

// =============================================================================
// FEATURE USAGE STATISTICS
// =============================================================================

/**
 * Feature usage statistics
 */
export const featureUsageStatsSchema = z.object({
  featureKey: z.string(),
  period: z.enum(["hour", "day", "week", "month"]),

  // === Counts ===
  evaluations: z.number(),
  enabledEvaluations: z.number(),
  disabledEvaluations: z.number(),

  // === Unique Users ===
  uniqueUsers: z.number(),
  uniqueUsersEnabled: z.number(),

  // === Sites ===
  sitesWithOverrides: z.number(),
  sitesEnabled: z.number(),
  sitesDisabled: z.number(),

  // === Errors ===
  evaluationErrors: z.number(),
  dependencyErrors: z.number(),

  // === Performance ===
  avgEvaluationTimeMs: z.number(),
  p95EvaluationTimeMs: z.number(),
  p99EvaluationTimeMs: z.number(),

  // === Trend ===
  enabledTrend: z.array(z.object({
    timestamp: z.string(),
    count: z.number(),
  })).default([]),

  timestamp: z.string(),
});

export type FeatureUsageStats = z.infer<typeof featureUsageStatsSchema>;

// =============================================================================
// ROLLOUT HISTORY
// =============================================================================

/**
 * Rollout event type
 */
export const RolloutEventType = {
  CREATED: "created",
  ENABLED: "enabled",
  DISABLED: "disabled",
  PERCENTAGE_CHANGED: "percentage_changed",
  TARGETING_UPDATED: "targeting_updated",
  DEPENDENCY_ADDED: "dependency_added",
  DEPENDENCY_REMOVED: "dependency_removed",
  OVERRIDE_ADDED: "override_added",
  OVERRIDE_REMOVED: "override_removed",
  DEPRECATED: "deprecated",
  ARCHIVED: "archived",
} as const;

export type RolloutEventType = (typeof RolloutEventType)[keyof typeof RolloutEventType];

/**
 * Rollout history event
 *
 * `performedBy` was added 2026-04-14 to match the database column on
 * `featureRolloutHistory` (shared/schema.ts). It is the legacy field name
 * for the actor who triggered the event; `userId` is the newer canonical
 * field but both are populated for backwards compatibility.
 *
 * `userId` is now optional because the DB column is nullable — events
 * triggered by the system (not by a specific user) leave it null.
 */
export const rolloutEventSchema = z.object({
  id: z.string(),
  featureKey: z.string(),
  eventType: z.nativeEnum(RolloutEventType),
  timestamp: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  performedBy: z.string().optional(),

  // === Context ===
  siteId: z.string().optional(),
  targetUserId: z.string().optional(),

  // === Change Details ===
  previousValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().optional(),

  // === Metadata ===
  metadata: z.record(z.unknown()).optional(),
});

export type RolloutEvent = z.infer<typeof rolloutEventSchema>;

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Feature flag evaluation context
 */
export const evaluationContextSchema = z.object({
  userId: z.string().optional(),
  siteId: z.string().optional(),
  userAttributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  siteAttributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  timestamp: z.string().optional(),
});

export type EvaluationContext = z.infer<typeof evaluationContextSchema>;

/**
 * Feature flag evaluation result
 */
export const evaluationResultSchema = z.object({
  featureKey: z.string(),
  enabled: z.boolean(),
  source: z.enum(["global", "site_override", "user_override", "targeting_rule", "percentage_rollout", "default"]),
  variant: z.string().optional(),
  reason: z.string().optional(),
  evaluationTimeMs: z.number(),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

/**
 * Batch evaluation request
 */
export const batchEvaluationRequestSchema = z.object({
  featureKeys: z.array(z.string()),
  context: evaluationContextSchema,
});

export type BatchEvaluationRequest = z.infer<typeof batchEvaluationRequestSchema>;

/**
 * Batch evaluation response
 */
export const batchEvaluationResponseSchema = z.object({
  results: z.record(evaluationResultSchema),
  evaluatedAt: z.string(),
  totalTimeMs: z.number(),
});

export type BatchEvaluationResponse = z.infer<typeof batchEvaluationResponseSchema>;

// =============================================================================
// ADMIN UI TYPES
// =============================================================================

/**
 * Feature filter options
 */
export const featureFilterSchema = z.object({
  search: z.string().optional(),
  categories: z.array(z.nativeEnum(FeatureCategory)).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  hasOverrides: z.boolean().optional(),
  owner: z.string().optional(),
  sort: z.enum(["name", "category", "createdAt", "updatedAt", "usage"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export type FeatureFilter = z.infer<typeof featureFilterSchema>;

/**
 * Site filter options
 */
export const siteFilterSchema = z.object({
  search: z.string().optional(),
  environments: z.array(z.enum(["development", "staging", "production"])).optional(),
  healthStatus: z.array(z.nativeEnum(SiteHealthStatus)).optional(),
  regions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  sort: z.enum(["name", "health", "uptime", "updatedAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export type SiteFilter = z.infer<typeof siteFilterSchema>;

/**
 * Confirmation dialog configuration
 */
export interface ConfirmationConfig {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "destructive" | "warning";
  requireConfirmation?: boolean;
  confirmationText?: string;
}
