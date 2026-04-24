/**
 * @file types.ts
 * @description Feature Flags Service Types
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 */

import type {
  FeatureFlag,
  SiteFeatureOverride,
  UserFeatureOverride,
  EvaluationContext,
  EvaluationResult,
  FeatureUsageStats,
  RolloutEvent,
  PercentageRollout,
  TargetingRule,
  FeatureDependency,
} from "./shared-types";
import type { FeatureDependencyNode, DependencyResolution } from "./dependency-types";

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/**
 * Feature flag storage interface
 */
export interface IFeatureFlagStorage {
  // === CRUD ===
  getAll(): Promise<FeatureFlag[]>;
  getByKey(key: string): Promise<FeatureFlag | null>;
  getByKeys(keys: string[]): Promise<FeatureFlag[]>;
  getByCategory(category: string): Promise<FeatureFlag[]>;
  create(flag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory">): Promise<FeatureFlag>;
  update(key: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag | null>;
  delete(key: string): Promise<boolean>;

  // === Bulk Operations ===
  bulkEnable(keys: string[]): Promise<number>;
  bulkDisable(keys: string[]): Promise<number>;
  bulkDelete(keys: string[]): Promise<number>;

  // === Search ===
  search(query: {
    search?: string;
    categories?: string[];
    tags?: string[];
    enabled?: boolean;
    owner?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ flags: FeatureFlag[]; total: number }>;
}

/**
 * Site override storage interface
 */
export interface ISiteOverrideStorage {
  getForSite(siteId: string): Promise<SiteFeatureOverride[]>;
  getForFeature(featureKey: string): Promise<SiteFeatureOverride[]>;
  get(siteId: string, featureKey: string): Promise<SiteFeatureOverride | null>;
  set(override: Omit<SiteFeatureOverride, "createdAt" | "updatedAt">): Promise<SiteFeatureOverride>;
  delete(siteId: string, featureKey: string): Promise<boolean>;
  deleteAllForSite(siteId: string): Promise<number>;
  deleteAllForFeature(featureKey: string): Promise<number>;
}

/**
 * User override storage interface
 */
export interface IUserOverrideStorage {
  getForUser(userId: string): Promise<UserFeatureOverride[]>;
  getForFeature(featureKey: string): Promise<UserFeatureOverride[]>;
  get(userId: string, featureKey: string): Promise<UserFeatureOverride | null>;
  set(override: Omit<UserFeatureOverride, "createdAt">): Promise<UserFeatureOverride>;
  delete(userId: string, featureKey: string): Promise<boolean>;
  deleteExpired(): Promise<number>;
  deleteAllForUser(userId: string): Promise<number>;
  deleteAllForFeature(featureKey: string): Promise<number>;
}

/**
 * Feature usage statistics storage interface
 */
export interface IUsageStatsStorage {
  record(evaluation: {
    featureKey: string;
    enabled: boolean;
    userId?: string;
    siteId?: string;
    evaluationTimeMs: number;
    error?: boolean;
  }): Promise<void>;

  getStats(featureKey: string, period: "hour" | "day" | "week" | "month"): Promise<FeatureUsageStats | null>;
  getStatsHistory(featureKey: string, period: "hour" | "day" | "week" | "month", limit?: number): Promise<FeatureUsageStats[]>;
  getTopFeatures(period: "hour" | "day" | "week" | "month", limit?: number): Promise<Array<{ featureKey: string; evaluations: number }>>;
  aggregateStats(): Promise<void>;
  cleanup(retentionDays: number): Promise<number>;
}

/**
 * Rollout history storage interface
 */
export interface IRolloutHistoryStorage {
  record(event: Omit<RolloutEvent, "id" | "timestamp">): Promise<RolloutEvent>;
  getForFeature(featureKey: string, limit?: number): Promise<RolloutEvent[]>;
  getForSite(siteId: string, limit?: number): Promise<RolloutEvent[]>;
  getRecent(limit?: number): Promise<RolloutEvent[]>;
  search(query: {
    featureKey?: string;
    siteId?: string;
    userId?: string;
    eventType?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: RolloutEvent[]; total: number }>;
}

// =============================================================================
// EVALUATOR INTERFACES
// =============================================================================

/**
 * Feature flag evaluator interface
 */
export interface IFeatureFlagEvaluator {
  /**
   * Evaluate a single feature flag
   */
  evaluate(featureKey: string, context: EvaluationContext): Promise<EvaluationResult>;

  /**
   * Evaluate multiple feature flags
   */
  evaluateBatch(featureKeys: string[], context: EvaluationContext): Promise<Map<string, EvaluationResult>>;

  /**
   * Get all enabled features for a context
   */
  getEnabledFeatures(context: EvaluationContext): Promise<string[]>;

  /**
   * Check if a specific feature is enabled
   */
  isEnabled(featureKey: string, context: EvaluationContext): Promise<boolean>;

  /**
   * Get the variant for a feature (A/B testing)
   */
  getVariant(featureKey: string, context: EvaluationContext): Promise<string | null>;
}

/**
 * Targeting rule evaluator
 */
export interface ITargetingEvaluator {
  evaluate(rule: TargetingRule, context: EvaluationContext): boolean;
  evaluateAll(rules: TargetingRule[], context: EvaluationContext): { matched: boolean; matchedRule?: TargetingRule };
}

/**
 * Percentage rollout evaluator
 */
export interface IPercentageEvaluator {
  isInRollout(config: PercentageRollout, context: EvaluationContext, featureKey: string): boolean;
  getBucket(bucketKey: string, seed: string, buckets: number): number;
}

// =============================================================================
// DEPENDENCY RESOLVER INTERFACE
// =============================================================================

/**
 * Feature dependency resolver interface
 */
export interface IDependencyResolver {
  /**
   * Build the dependency graph for all features
   */
  buildGraph(flags: FeatureFlag[]): Map<string, FeatureDependencyNode>;

  /**
   * Check if a feature can be enabled given its dependencies
   */
  canEnable(featureKey: string, flags: FeatureFlag[]): DependencyResolution;

  /**
   * Check if a feature can be disabled given its dependents
   */
  canDisable(featureKey: string, flags: FeatureFlag[]): DependencyResolution;

  /**
   * Get all features that depend on a given feature (transitive)
   */
  getDependents(featureKey: string, flags: FeatureFlag[]): string[];

  /**
   * Get all dependencies of a feature (transitive)
   */
  getDependencies(featureKey: string, flags: FeatureFlag[]): string[];

  /**
   * Detect cycles in the dependency graph
   */
  detectCycles(flags: FeatureFlag[]): string[][];

  /**
   * Get a topological sort of features (for safe enable/disable order)
   */
  getTopologicalOrder(flags: FeatureFlag[]): string[];
}

// =============================================================================
// CACHE INTERFACE
// =============================================================================

/**
 * Feature flag cache interface
 */
export interface IFeatureFlagCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePattern(pattern: string): Promise<number>;
  clear(): Promise<void>;

  // Specialized methods
  getFlag(key: string): Promise<FeatureFlag | null>;
  setFlag(flag: FeatureFlag, ttlSeconds?: number): Promise<void>;
  invalidateFlag(key: string): Promise<void>;

  getEvaluation(key: string, contextHash: string): Promise<EvaluationResult | null>;
  setEvaluation(key: string, contextHash: string, result: EvaluationResult, ttlSeconds?: number): Promise<void>;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Feature flag events for real-time updates
 */
export type FeatureFlagEvent =
  | { type: "flag_created"; flag: FeatureFlag }
  | { type: "flag_updated"; flag: FeatureFlag; previousState: Partial<FeatureFlag> }
  | { type: "flag_deleted"; key: string }
  | { type: "flag_enabled"; key: string }
  | { type: "flag_disabled"; key: string }
  | { type: "override_set"; override: SiteFeatureOverride | UserFeatureOverride; scope: "site" | "user" }
  | { type: "override_deleted"; key: string; targetId: string; scope: "site" | "user" }
  | { type: "rollout_changed"; key: string; percentage: number }
  | { type: "targeting_updated"; key: string; rules: TargetingRule[] }
  | { type: "cache_invalidated"; keys: string[] };

/**
 * Event handler type
 */
export type FeatureFlagEventHandler = (event: FeatureFlagEvent) => void | Promise<void>;

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/**
 * Feature flag service configuration
 */
export interface FeatureFlagServiceConfig {
  /** Enable caching */
  cacheEnabled: boolean;
  /** Cache TTL in seconds */
  cacheTtlSeconds: number;
  /** Enable usage statistics recording */
  statsEnabled: boolean;
  /** Stats aggregation interval in minutes */
  statsAggregationIntervalMinutes: number;
  /** Enable real-time updates via WebSocket */
  realtimeEnabled: boolean;
  /** Default evaluation timeout in milliseconds */
  evaluationTimeoutMs: number;
  /** Maximum batch size for evaluation */
  maxBatchSize: number;
}

/**
 * Default service configuration
 */
export const defaultServiceConfig: FeatureFlagServiceConfig = {
  cacheEnabled: true,
  cacheTtlSeconds: 60,
  statsEnabled: true,
  statsAggregationIntervalMinutes: 5,
  realtimeEnabled: true,
  evaluationTimeoutMs: 100,
  maxBatchSize: 100,
};
