/**
 * @file index.ts
 * @description Feature Flags Service - Main Entry Point
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * Provides a complete feature flag management system with:
 * - Global, site, and user-level flags
 * - Percentage rollouts and A/B testing
 * - Dependency management
 * - Usage statistics
 * - Rollout history
 */

import type {
  FeatureFlag,
  SiteFeatureOverride,
  UserFeatureOverride,
  EvaluationContext,
  EvaluationResult,
  BatchEvaluationResponse,
  FeatureUsageStats,
  RolloutEvent,
  RolloutEventType,
  PercentageRollout,
  TargetingRule,
  FeatureDependency,
} from "@shared/admin/types";
import type { DependencyResolution } from "@shared/admin/schema";
import type {
  IFeatureFlagStorage,
  ISiteOverrideStorage,
  IUserOverrideStorage,
  IUsageStatsStorage,
  IRolloutHistoryStorage,
  FeatureFlagServiceConfig,
  FeatureFlagEvent,
  FeatureFlagEventHandler,
} from "./types";
import { defaultServiceConfig } from "./types";
import {
  InMemoryFeatureFlagStorage,
  InMemorySiteOverrideStorage,
  InMemoryUserOverrideStorage,
  InMemoryUsageStatsStorage,
  InMemoryRolloutHistoryStorage,
} from "./storage";
import { createPgStorage } from "./pg-storage";
import { FeatureFlagEvaluator } from "./evaluator";
import { FeatureDependencyResolver } from "./dependency-resolver";
import { getEdgeCache, type FeatureFlagEdgeCache } from "./edge-cache";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-flags-service");

/**
 * Determine if PostgreSQL storage should be used.
 * Use PostgreSQL if DATABASE_URL is set and not explicitly disabled.
 */
function shouldUsePgStorage(): boolean {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  // Allow explicit override to use in-memory
  if (process.env.FEATURE_FLAGS_STORAGE === "memory") {
    return false;
  }
  return true;
}

// =============================================================================
// FEATURE FLAGS SERVICE
// =============================================================================

/**
 * Main Feature Flags Service
 *
 * Coordinates all feature flag operations including:
 * - Flag management (CRUD)
 * - Override management (site and user level)
 * - Evaluation
 * - Statistics
 * - Event handling
 */
export class FeatureFlagsService {
  private flagStorage: IFeatureFlagStorage;
  private siteOverrideStorage: ISiteOverrideStorage;
  private userOverrideStorage: IUserOverrideStorage;
  private usageStatsStorage: IUsageStatsStorage;
  private rolloutHistoryStorage: IRolloutHistoryStorage;

  private evaluator: FeatureFlagEvaluator;
  private dependencyResolver: FeatureDependencyResolver;
  private config: FeatureFlagServiceConfig;
  private edgeCache: FeatureFlagEdgeCache | null;

  private eventHandlers: Set<FeatureFlagEventHandler> = new Set();

  constructor(config: Partial<FeatureFlagServiceConfig> = {}) {
    this.config = { ...defaultServiceConfig, ...config };

    // Initialize storage - use PostgreSQL if available, otherwise in-memory
    if (shouldUsePgStorage()) {
      const pgStorage = createPgStorage();
      this.flagStorage = pgStorage.flags;
      this.siteOverrideStorage = pgStorage.siteOverrides;
      this.userOverrideStorage = pgStorage.userOverrides;
      this.usageStatsStorage = pgStorage.usageStats;
      this.rolloutHistoryStorage = pgStorage.rolloutHistory;
      log.info("Feature flags service using PostgreSQL storage");
    } else {
      this.flagStorage = new InMemoryFeatureFlagStorage();
      this.siteOverrideStorage = new InMemorySiteOverrideStorage();
      this.userOverrideStorage = new InMemoryUserOverrideStorage();
      this.usageStatsStorage = new InMemoryUsageStatsStorage();
      this.rolloutHistoryStorage = new InMemoryRolloutHistoryStorage();
      log.info("Feature flags service using in-memory storage");
    }

    // Initialize evaluator
    this.evaluator = new FeatureFlagEvaluator(
      this.flagStorage,
      this.siteOverrideStorage,
      this.userOverrideStorage,
      this.usageStatsStorage,
      this.config
    );

    // Initialize dependency resolver
    this.dependencyResolver = new FeatureDependencyResolver();

    // Initialize edge cache (returns null if Redis not configured)
    this.edgeCache = getEdgeCache();
    if (this.edgeCache) {
      // Wire up event handler for cache invalidation
      this.onEvent((event) => this.edgeCache?.handleEvent(event));
      log.info("Edge cache enabled for feature flags");
    }

    log.info("Feature flags service initialized");
  }

  // ===========================================================================
  // FLAG MANAGEMENT
  // ===========================================================================

  /**
   * Get all feature flags
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    return this.flagStorage.getAll();
  }

  /**
   * Get a feature flag by key
   */
  async getFlag(key: string): Promise<FeatureFlag | null> {
    return this.flagStorage.getByKey(key);
  }

  /**
   * Get flags by category
   */
  async getFlagsByCategory(category: string): Promise<FeatureFlag[]> {
    return this.flagStorage.getByCategory(category);
  }

  /**
   * Search flags
   */
  async searchFlags(query: {
    search?: string;
    categories?: string[];
    tags?: string[];
    enabled?: boolean;
    owner?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ flags: FeatureFlag[]; total: number }> {
    return this.flagStorage.search(query);
  }

  /**
   * Create a new feature flag
   */
  async createFlag(
    flag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory" | "dependents">,
    userId?: string
  ): Promise<FeatureFlag> {
    // Validate dependencies
    if (flag.dependencies.length > 0) {
      const allFlags = await this.flagStorage.getAll();
      for (const dep of flag.dependencies) {
        const validation = this.dependencyResolver.validateDependency(
          flag.key,
          dep,
          [...allFlags, flag as FeatureFlag]
        );
        if (!validation.valid) {
          throw new Error(`Invalid dependency: ${validation.error}`);
        }
      }
    }

    const created = await this.flagStorage.create({
      ...flag,
      dependents: [],
    });

    // Record history
    await this.rolloutHistoryStorage.record({
      featureKey: flag.key,
      eventType: "created",
      userId: userId || "system",
      newValue: created,
    });

    // Emit event
    this.emitEvent({ type: "flag_created", flag: created });

    return created;
  }

  /**
   * Update a feature flag
   */
  async updateFlag(
    key: string,
    updates: Partial<FeatureFlag>,
    userId?: string
  ): Promise<FeatureFlag | null> {
    const existing = await this.flagStorage.getByKey(key);
    if (!existing) {
      return null;
    }

    // Validate new dependencies if provided
    if (updates.dependencies) {
      const allFlags = await this.flagStorage.getAll();
      for (const dep of updates.dependencies) {
        const validation = this.dependencyResolver.validateDependency(
          key,
          dep,
          allFlags
        );
        if (!validation.valid) {
          throw new Error(`Invalid dependency: ${validation.error}`);
        }
      }
    }

    const updated = await this.flagStorage.update(key, {
      ...updates,
      lastModifiedBy: userId,
    });

    if (updated) {
      // Record history based on what changed
      if (updates.globallyEnabled !== undefined && updates.globallyEnabled !== existing.globallyEnabled) {
        await this.rolloutHistoryStorage.record({
          featureKey: key,
          eventType: updates.globallyEnabled ? "enabled" : "disabled",
          userId: userId || "system",
          previousValue: existing.globallyEnabled,
          newValue: updates.globallyEnabled,
        });
      }

      if (updates.percentageRollout) {
        await this.rolloutHistoryStorage.record({
          featureKey: key,
          eventType: "percentage_changed",
          userId: userId || "system",
          previousValue: existing.percentageRollout,
          newValue: updates.percentageRollout,
        });
      }

      if (updates.targetingRules) {
        await this.rolloutHistoryStorage.record({
          featureKey: key,
          eventType: "targeting_updated",
          userId: userId || "system",
          previousValue: existing.targetingRules,
          newValue: updates.targetingRules,
        });
      }

      // Invalidate cache
      this.evaluator.invalidateCache(key);

      // Emit event
      this.emitEvent({
        type: "flag_updated",
        flag: updated,
        previousState: existing,
      });
    }

    return updated;
  }

  /**
   * Enable a feature flag
   */
  async enableFlag(key: string, userId?: string): Promise<boolean> {
    const result = await this.updateFlag(key, { globallyEnabled: true }, userId);
    if (result) {
      this.emitEvent({ type: "flag_enabled", key });
    }
    return result !== null;
  }

  /**
   * Disable a feature flag
   */
  async disableFlag(key: string, userId?: string): Promise<boolean> {
    // Check if can disable (dependents)
    const allFlags = await this.flagStorage.getAll();
    const resolution = this.dependencyResolver.canDisable(key, allFlags);

    if (!resolution.canEnable) {
      throw new Error(
        `Cannot disable: would break features: ${resolution.wouldBreak.join(", ")}`
      );
    }

    const result = await this.updateFlag(key, { globallyEnabled: false }, userId);
    if (result) {
      this.emitEvent({ type: "flag_disabled", key });
    }
    return result !== null;
  }

  /**
   * Delete a feature flag
   */
  async deleteFlag(key: string): Promise<boolean> {
    // Check for dependents
    const allFlags = await this.flagStorage.getAll();
    const dependents = this.dependencyResolver.getDependents(key, allFlags);

    if (dependents.length > 0) {
      throw new Error(`Cannot delete: ${dependents.length} features depend on this flag`);
    }

    // Delete overrides
    await this.siteOverrideStorage.deleteAllForFeature(key);
    await this.userOverrideStorage.deleteAllForFeature(key);

    const deleted = await this.flagStorage.delete(key);
    if (deleted) {
      this.evaluator.invalidateCache(key);
      this.emitEvent({ type: "flag_deleted", key });
    }

    return deleted;
  }

  // ===========================================================================
  // SITE OVERRIDES
  // ===========================================================================

  /**
   * Get site overrides for a feature
   */
  async getSiteOverrides(featureKey: string): Promise<SiteFeatureOverride[]> {
    return this.siteOverrideStorage.getForFeature(featureKey);
  }

  /**
   * Get overrides for a site
   */
  async getOverridesForSite(siteId: string): Promise<SiteFeatureOverride[]> {
    return this.siteOverrideStorage.getForSite(siteId);
  }

  /**
   * Set a site override
   */
  async setSiteOverride(
    siteId: string,
    featureKey: string,
    enabled: boolean,
    options?: {
      percentageRollout?: PercentageRollout;
      targetingRules?: TargetingRule[];
    },
    userId?: string
  ): Promise<SiteFeatureOverride> {
    const override = await this.siteOverrideStorage.set({
      siteId,
      featureKey,
      enabled,
      percentageRollout: options?.percentageRollout,
      targetingRules: options?.targetingRules,
      createdBy: userId,
    });

    // Record history
    await this.rolloutHistoryStorage.record({
      featureKey,
      eventType: "override_added",
      siteId,
      userId: userId || "system",
      newValue: override,
    });

    // Emit event
    this.emitEvent({ type: "override_set", override, scope: "site" });

    return override;
  }

  /**
   * Delete a site override
   */
  async deleteSiteOverride(
    siteId: string,
    featureKey: string,
    userId?: string
  ): Promise<boolean> {
    const deleted = await this.siteOverrideStorage.delete(siteId, featureKey);

    if (deleted) {
      await this.rolloutHistoryStorage.record({
        featureKey,
        eventType: "override_removed",
        siteId,
        userId: userId || "system",
      });

      this.emitEvent({
        type: "override_deleted",
        key: featureKey,
        targetId: siteId,
        scope: "site",
      });
    }

    return deleted;
  }

  // ===========================================================================
  // USER OVERRIDES
  // ===========================================================================

  /**
   * Get user overrides for a feature
   */
  async getUserOverrides(featureKey: string): Promise<UserFeatureOverride[]> {
    return this.userOverrideStorage.getForFeature(featureKey);
  }

  /**
   * Get overrides for a user
   */
  async getOverridesForUser(userId: string): Promise<UserFeatureOverride[]> {
    return this.userOverrideStorage.getForUser(userId);
  }

  /**
   * Set a user override
   */
  async setUserOverride(
    targetUserId: string,
    featureKey: string,
    enabled: boolean,
    options?: {
      reason?: string;
      expiresAt?: string;
    },
    adminUserId?: string
  ): Promise<UserFeatureOverride> {
    const override = await this.userOverrideStorage.set({
      userId: targetUserId,
      featureKey,
      enabled,
      reason: options?.reason,
      expiresAt: options?.expiresAt,
      createdBy: adminUserId,
    });

    // Record history
    await this.rolloutHistoryStorage.record({
      featureKey,
      eventType: "override_added",
      targetUserId,
      userId: adminUserId || "system",
      newValue: override,
    });

    // Emit event
    this.emitEvent({ type: "override_set", override, scope: "user" });

    return override;
  }

  /**
   * Delete a user override
   */
  async deleteUserOverride(
    targetUserId: string,
    featureKey: string,
    adminUserId?: string
  ): Promise<boolean> {
    const deleted = await this.userOverrideStorage.delete(targetUserId, featureKey);

    if (deleted) {
      await this.rolloutHistoryStorage.record({
        featureKey,
        eventType: "override_removed",
        targetUserId,
        userId: adminUserId || "system",
      });

      this.emitEvent({
        type: "override_deleted",
        key: featureKey,
        targetId: targetUserId,
        scope: "user",
      });
    }

    return deleted;
  }

  // ===========================================================================
  // EVALUATION
  // ===========================================================================

  /**
   * Evaluate a feature flag with edge caching
   */
  async evaluate(
    featureKey: string,
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    // Try edge cache first
    if (this.edgeCache) {
      const cached = await this.edgeCache.get(featureKey, context);
      if (cached) {
        return { ...cached, source: cached.source as EvaluationResult["source"] };
      }
    }

    // Evaluate and cache
    const result = await this.evaluator.evaluate(featureKey, context);

    if (this.edgeCache) {
      await this.edgeCache.set(featureKey, context, result);
    }

    return result;
  }

  /**
   * Evaluate multiple features with edge caching
   */
  async evaluateBatch(
    featureKeys: string[],
    context: EvaluationContext
  ): Promise<BatchEvaluationResponse> {
    const startTime = Date.now();
    const finalResults = new Map<string, EvaluationResult>();
    let keysToEvaluate = featureKeys;

    // Try edge cache first for batch
    if (this.edgeCache) {
      const cached = await this.edgeCache.getBatch(featureKeys, context);
      for (const [key, result] of cached) {
        finalResults.set(key, result);
      }
      // Filter out cached keys
      keysToEvaluate = featureKeys.filter((k) => !cached.has(k));
    }

    // Evaluate remaining keys
    if (keysToEvaluate.length > 0) {
      const evaluated = await this.evaluator.evaluateBatch(keysToEvaluate, context);
      for (const [key, result] of evaluated) {
        finalResults.set(key, result);
      }

      // Cache new evaluations
      if (this.edgeCache) {
        const toCache = Array.from(evaluated.entries()).map(([featureKey, result]) => ({
          featureKey,
          context,
          result,
        }));
        await this.edgeCache.setBatch(toCache);
      }
    }

    return {
      results: Object.fromEntries(finalResults),
      evaluatedAt: new Date().toISOString(),
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a feature is enabled
   */
  async isEnabled(
    featureKey: string,
    context: EvaluationContext
  ): Promise<boolean> {
    return this.evaluator.isEnabled(featureKey, context);
  }

  /**
   * Get all enabled features for a context
   */
  async getEnabledFeatures(context: EvaluationContext): Promise<string[]> {
    return this.evaluator.getEnabledFeatures(context);
  }

  /**
   * Get A/B test variant
   */
  async getVariant(
    featureKey: string,
    context: EvaluationContext
  ): Promise<string | null> {
    return this.evaluator.getVariant(featureKey, context);
  }

  // ===========================================================================
  // DEPENDENCIES
  // ===========================================================================

  /**
   * Check if a feature can be enabled
   */
  async canEnable(featureKey: string): Promise<DependencyResolution> {
    const flags = await this.flagStorage.getAll();
    return this.dependencyResolver.canEnable(featureKey, flags);
  }

  /**
   * Check if a feature can be disabled
   */
  async canDisable(featureKey: string): Promise<DependencyResolution> {
    const flags = await this.flagStorage.getAll();
    return this.dependencyResolver.canDisable(featureKey, flags);
  }

  /**
   * Get dependency graph as DOT format
   */
  async getDependencyGraph(): Promise<string> {
    const flags = await this.flagStorage.getAll();
    return this.dependencyResolver.toDotFormat(flags);
  }

  /**
   * Add a dependency to a feature
   */
  async addDependency(
    featureKey: string,
    dependency: FeatureDependency,
    userId?: string
  ): Promise<boolean> {
    const flag = await this.flagStorage.getByKey(featureKey);
    if (!flag) {
      return false;
    }

    // Validate
    const allFlags = await this.flagStorage.getAll();
    const validation = this.dependencyResolver.validateDependency(
      featureKey,
      dependency,
      allFlags
    );

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Add dependency
    const newDeps = [...flag.dependencies, dependency];
    await this.updateFlag(
      featureKey,
      { dependencies: newDeps },
      userId
    );

    await this.rolloutHistoryStorage.record({
      featureKey,
      eventType: "dependency_added",
      userId: userId || "system",
      newValue: dependency,
    });

    return true;
  }

  /**
   * Remove a dependency from a feature
   */
  async removeDependency(
    featureKey: string,
    dependencyKey: string,
    userId?: string
  ): Promise<boolean> {
    const flag = await this.flagStorage.getByKey(featureKey);
    if (!flag) {
      return false;
    }

    const newDeps = flag.dependencies.filter(
      (d) => d.featureKey !== dependencyKey
    );

    if (newDeps.length === flag.dependencies.length) {
      return false; // Dependency not found
    }

    await this.updateFlag(
      featureKey,
      { dependencies: newDeps },
      userId
    );

    await this.rolloutHistoryStorage.record({
      featureKey,
      eventType: "dependency_removed",
      userId: userId || "system",
      previousValue: dependencyKey,
    });

    return true;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get usage statistics for a feature
   */
  async getUsageStats(
    featureKey: string,
    period: "hour" | "day" | "week" | "month"
  ): Promise<FeatureUsageStats | null> {
    return this.usageStatsStorage.getStats(featureKey, period);
  }

  /**
   * Get usage statistics history
   */
  async getUsageStatsHistory(
    featureKey: string,
    period: "hour" | "day" | "week" | "month",
    limit?: number
  ): Promise<FeatureUsageStats[]> {
    return this.usageStatsStorage.getStatsHistory(featureKey, period, limit);
  }

  /**
   * Get top features by usage
   */
  async getTopFeatures(
    period: "hour" | "day" | "week" | "month",
    limit?: number
  ): Promise<Array<{ featureKey: string; evaluations: number }>> {
    return this.usageStatsStorage.getTopFeatures(period, limit);
  }

  // ===========================================================================
  // HISTORY
  // ===========================================================================

  /**
   * Get rollout history for a feature
   */
  async getRolloutHistory(
    featureKey: string,
    limit?: number
  ): Promise<RolloutEvent[]> {
    return this.rolloutHistoryStorage.getForFeature(featureKey, limit);
  }

  /**
   * Get recent rollout events
   */
  async getRecentRolloutEvents(limit?: number): Promise<RolloutEvent[]> {
    return this.rolloutHistoryStorage.getRecent(limit);
  }

  /**
   * Search rollout history
   */
  async searchRolloutHistory(query: {
    featureKey?: string;
    siteId?: string;
    userId?: string;
    eventType?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: RolloutEvent[]; total: number }> {
    return this.rolloutHistoryStorage.search(query);
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Subscribe to feature flag events
   */
  onEvent(handler: FeatureFlagEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Unsubscribe from feature flag events
   */
  offEvent(handler: FeatureFlagEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all handlers
   */
  private emitEvent(event: FeatureFlagEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        log.error({ error, event }, "Error in event handler");
      }
    }
  }

  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================

  /**
   * Clean up expired user overrides
   */
  async cleanupExpiredOverrides(): Promise<number> {
    return this.userOverrideStorage.deleteExpired();
  }

  /**
   * Clean up old statistics
   */
  async cleanupOldStats(retentionDays: number): Promise<number> {
    return this.usageStatsStorage.cleanup(retentionDays);
  }

  /**
   * Aggregate pending statistics
   */
  async aggregateStats(): Promise<void> {
    return this.usageStatsStorage.aggregateStats();
  }

  /**
   * Clear evaluation cache (in-memory and edge)
   */
  clearCache(): void {
    this.evaluator.clearCache();
    if (this.edgeCache) {
      this.edgeCache.invalidateAll().catch((err) => {
        log.error({ err }, "Failed to clear edge cache");
      });
    }
    this.emitEvent({ type: "cache_invalidated", keys: ["*"] });
  }

  // ===========================================================================
  // EDGE CACHE
  // ===========================================================================

  /**
   * Check if edge cache is available
   */
  hasEdgeCache(): boolean {
    return this.edgeCache !== null && this.edgeCache.isAvailable();
  }

  /**
   * Get edge cache statistics
   */
  getEdgeCacheStats(): { hits: number; misses: number; invalidations: number; errors: number; avgLatencyMs: number; lastResetAt: string } | null {
    return this.edgeCache?.getStats() ?? null;
  }

  /**
   * Reset edge cache statistics
   */
  resetEdgeCacheStats(): void {
    this.edgeCache?.resetStats();
  }

  /**
   * Invalidate edge cache for specific feature
   */
  async invalidateEdgeCache(featureKey?: string): Promise<number> {
    if (!this.edgeCache) return 0;
    if (featureKey) {
      return this.edgeCache.invalidate(featureKey);
    }
    return this.edgeCache.invalidateAll();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: FeatureFlagsService | null = null;

/**
 * Get the feature flags service singleton
 */
export function getFeatureFlagsService(
  config?: Partial<FeatureFlagServiceConfig>
): FeatureFlagsService {
  if (!instance) {
    instance = new FeatureFlagsService(config);
  }
  return instance;
}

/**
 * Reset the service (for testing)
 */
export function resetFeatureFlagsService(): void {
  instance = null;
}

// Export types
export * from "./types";
export { FeatureDependencyResolver } from "./dependency-resolver";
export { FeatureFlagEvaluator, TargetingRuleEvaluator, PercentageRolloutEvaluator } from "./evaluator";
export { FeatureFlagEdgeCache, getEdgeCache, resetEdgeCache } from "./edge-cache";
