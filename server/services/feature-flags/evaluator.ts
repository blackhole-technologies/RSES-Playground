/**
 * @file evaluator.ts
 * @description Feature Flag Evaluator - Core evaluation logic
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * Implements feature flag evaluation with:
 * - Targeting rules
 * - Percentage rollouts
 * - A/B testing variants
 * - Dependency checking
 * - Caching for performance
 */

import crypto from "crypto";
import type {
  FeatureFlag,
  EvaluationContext,
  EvaluationResult,
  PercentageRollout,
  TargetingRule,
  ABTestConfig,
} from "@shared/admin/types";
import type {
  IFeatureFlagEvaluator,
  ITargetingEvaluator,
  IPercentageEvaluator,
  IFeatureFlagStorage,
  ISiteOverrideStorage,
  IUserOverrideStorage,
  IUsageStatsStorage,
  FeatureFlagServiceConfig,
} from "./types";
import { FeatureDependencyResolver } from "./dependency-resolver";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-evaluator");

// =============================================================================
// TARGETING RULE EVALUATOR
// =============================================================================

/**
 * Evaluates targeting rules against context
 */
export class TargetingRuleEvaluator implements ITargetingEvaluator {
  /**
   * Evaluate a single targeting rule
   */
  evaluate(rule: TargetingRule, context: EvaluationContext): boolean {
    const value = this.getContextValue(rule.attribute, context);
    if (value === undefined) return false;

    switch (rule.operator) {
      case "equals":
        return value === rule.value;

      case "notEquals":
        return value !== rule.value;

      case "contains":
        if (typeof value === "string" && typeof rule.value === "string") {
          return value.includes(rule.value);
        }
        if (Array.isArray(value) && typeof rule.value === "string") {
          return value.includes(rule.value);
        }
        return false;

      case "notContains":
        if (typeof value === "string" && typeof rule.value === "string") {
          return !value.includes(rule.value);
        }
        if (Array.isArray(value) && typeof rule.value === "string") {
          return !value.includes(rule.value);
        }
        return false;

      case "in":
        if (Array.isArray(rule.value)) {
          return rule.value.includes(String(value));
        }
        return false;

      case "notIn":
        if (Array.isArray(rule.value)) {
          return !rule.value.includes(String(value));
        }
        return true;

      case "greaterThan":
        if (typeof value === "number" && typeof rule.value === "number") {
          return value > rule.value;
        }
        return false;

      case "lessThan":
        if (typeof value === "number" && typeof rule.value === "number") {
          return value < rule.value;
        }
        return false;

      case "regex":
        if (typeof value === "string" && typeof rule.value === "string") {
          try {
            const regex = new RegExp(rule.value);
            return regex.test(value);
          } catch {
            return false;
          }
        }
        return false;

      case "semver":
        // Simple semver comparison
        if (typeof value === "string" && typeof rule.value === "string") {
          return this.compareSemver(value, rule.value);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Evaluate all rules and return the first match
   */
  evaluateAll(
    rules: TargetingRule[],
    context: EvaluationContext
  ): { matched: boolean; matchedRule?: TargetingRule } {
    for (const rule of rules) {
      if (this.evaluate(rule, context)) {
        return { matched: true, matchedRule: rule };
      }
    }
    return { matched: false };
  }

  /**
   * Get value from context by attribute path
   */
  private getContextValue(
    attribute: string,
    context: EvaluationContext
  ): string | number | boolean | string[] | undefined {
    // Direct context properties
    if (attribute === "userId") return context.userId;
    if (attribute === "siteId") return context.siteId;

    // User attributes
    if (attribute.startsWith("user.")) {
      const key = attribute.slice(5);
      return context.userAttributes?.[key];
    }

    // Site attributes
    if (attribute.startsWith("site.")) {
      const key = attribute.slice(5);
      return context.siteAttributes?.[key];
    }

    // Check userAttributes directly
    if (context.userAttributes?.[attribute] !== undefined) {
      return context.userAttributes[attribute];
    }

    return undefined;
  }

  /**
   * Simple semver comparison (value >= target)
   */
  private compareSemver(value: string, target: string): boolean {
    const v = value.split(".").map(Number);
    const t = target.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      const vn = v[i] || 0;
      const tn = t[i] || 0;
      if (vn > tn) return true;
      if (vn < tn) return false;
    }

    return true; // Equal
  }
}

// =============================================================================
// PERCENTAGE ROLLOUT EVALUATOR
// =============================================================================

/**
 * Evaluates percentage-based rollouts using consistent hashing
 */
export class PercentageRolloutEvaluator implements IPercentageEvaluator {
  private readonly BUCKET_COUNT = 10000; // 0.01% granularity

  /**
   * Check if context is within the rollout percentage
   */
  isInRollout(
    config: PercentageRollout,
    context: EvaluationContext,
    featureKey: string
  ): boolean {
    if (!config.enabled || config.percentage <= 0) {
      return false;
    }

    if (config.percentage >= 100) {
      return true;
    }

    // Build bucket key from context
    const bucketKey = this.buildBucketKey(config, context);
    if (!bucketKey) {
      return false;
    }

    // Get deterministic bucket using hash
    const seed = config.seed || featureKey;
    const bucket = this.getBucket(bucketKey, seed, this.BUCKET_COUNT);

    // Check if bucket is within percentage
    const threshold = Math.floor((config.percentage / 100) * this.BUCKET_COUNT);
    return bucket < threshold;
  }

  /**
   * Get bucket number using consistent hashing
   */
  getBucket(bucketKey: string, seed: string, buckets: number): number {
    const hash = crypto
      .createHash("sha256")
      .update(`${seed}:${bucketKey}`)
      .digest("hex");

    // Use first 8 chars of hash for bucket calculation
    const hashValue = parseInt(hash.substring(0, 8), 16);
    return hashValue % buckets;
  }

  /**
   * Build bucket key from context using configured attributes
   */
  private buildBucketKey(
    config: PercentageRollout,
    context: EvaluationContext
  ): string | null {
    const parts: string[] = [];

    for (const attr of config.bucketBy) {
      let value: string | undefined;

      if (attr === "userId") {
        value = context.userId;
      } else if (attr === "siteId") {
        value = context.siteId;
      } else if (context.userAttributes?.[attr] !== undefined) {
        value = String(context.userAttributes[attr]);
      } else if (context.siteAttributes?.[attr] !== undefined) {
        value = String(context.siteAttributes[attr]);
      }

      if (value) {
        parts.push(value);
      }
    }

    return parts.length > 0 ? parts.join(":") : null;
  }
}

// =============================================================================
// A/B TEST EVALUATOR
// =============================================================================

/**
 * Evaluates A/B test variants
 */
export class ABTestEvaluator {
  private percentageEvaluator: PercentageRolloutEvaluator;

  constructor() {
    this.percentageEvaluator = new PercentageRolloutEvaluator();
  }

  /**
   * Get the variant for a user in an A/B test
   */
  getVariant(
    config: ABTestConfig,
    context: EvaluationContext,
    featureKey: string
  ): string | null {
    if (!config.enabled) {
      return null;
    }

    // Check date range
    const now = new Date().toISOString();
    if (config.startDate && now < config.startDate) {
      return null;
    }
    if (config.endDate && now > config.endDate) {
      return null;
    }

    // Check target audience
    if (config.targetAudience) {
      const targetingEvaluator = new TargetingRuleEvaluator();
      for (const [attr, value] of Object.entries(config.targetAudience)) {
        const rule: TargetingRule = {
          id: "audience",
          attribute: attr,
          operator: Array.isArray(value) ? "in" : "equals",
          value,
          variation: true,
        };

        if (!targetingEvaluator.evaluate(rule, context)) {
          return null; // Not in target audience
        }
      }
    }

    // Calculate variant based on weights
    const bucketKey = context.userId || context.siteId;
    if (!bucketKey) {
      return config.controlVariant;
    }

    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    const bucket = this.percentageEvaluator.getBucket(
      bucketKey,
      config.experimentKey,
      10000
    );

    const normalizedBucket = (bucket / 10000) * totalWeight;
    let cumulative = 0;

    for (const variant of config.variants) {
      cumulative += variant.weight;
      if (normalizedBucket < cumulative) {
        return variant.key;
      }
    }

    return config.controlVariant;
  }
}

// =============================================================================
// MAIN FEATURE FLAG EVALUATOR
// =============================================================================

/**
 * Main feature flag evaluator
 */
export class FeatureFlagEvaluator implements IFeatureFlagEvaluator {
  private storage: IFeatureFlagStorage;
  private siteOverrides: ISiteOverrideStorage;
  private userOverrides: IUserOverrideStorage;
  private statsStorage?: IUsageStatsStorage;
  private config: FeatureFlagServiceConfig;

  private targetingEvaluator: TargetingRuleEvaluator;
  private percentageEvaluator: PercentageRolloutEvaluator;
  private abTestEvaluator: ABTestEvaluator;
  private dependencyResolver: FeatureDependencyResolver;

  // Simple in-memory cache
  private cache: Map<string, { flag: FeatureFlag; expiresAt: number }>;

  constructor(
    storage: IFeatureFlagStorage,
    siteOverrides: ISiteOverrideStorage,
    userOverrides: IUserOverrideStorage,
    statsStorage: IUsageStatsStorage | undefined,
    config: FeatureFlagServiceConfig
  ) {
    this.storage = storage;
    this.siteOverrides = siteOverrides;
    this.userOverrides = userOverrides;
    this.statsStorage = statsStorage;
    this.config = config;

    this.targetingEvaluator = new TargetingRuleEvaluator();
    this.percentageEvaluator = new PercentageRolloutEvaluator();
    this.abTestEvaluator = new ABTestEvaluator();
    this.dependencyResolver = new FeatureDependencyResolver();

    this.cache = new Map();
  }

  /**
   * Evaluate a single feature flag
   */
  async evaluate(
    featureKey: string,
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      // Get the flag (with caching)
      const flag = await this.getFlag(featureKey);
      if (!flag) {
        return {
          featureKey,
          enabled: false,
          source: "default",
          reason: "Feature flag not found",
          evaluationTimeMs: Date.now() - startTime,
        };
      }

      // Core features are always on
      if (flag.category === "core" && !flag.toggleable) {
        return {
          featureKey,
          enabled: true,
          source: "global",
          reason: "Core feature (always on)",
          evaluationTimeMs: Date.now() - startTime,
        };
      }

      // Check user override first (highest priority)
      if (context.userId) {
        const userOverride = await this.userOverrides.get(context.userId, featureKey);
        if (userOverride) {
          // Check expiration
          if (!userOverride.expiresAt || new Date(userOverride.expiresAt) > new Date()) {
            const result = {
              featureKey,
              enabled: userOverride.enabled,
              source: "user_override" as const,
              reason: userOverride.reason || "User override",
              evaluationTimeMs: Date.now() - startTime,
            };
            await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
            return result;
          }
        }
      }

      // Check site override
      if (context.siteId) {
        const siteOverride = await this.siteOverrides.get(context.siteId, featureKey);
        if (siteOverride) {
          // Site override might have its own targeting rules
          if (siteOverride.targetingRules && siteOverride.targetingRules.length > 0) {
            const { matched, matchedRule } = this.targetingEvaluator.evaluateAll(
              siteOverride.targetingRules,
              context
            );
            if (matched && matchedRule) {
              const result = {
                featureKey,
                enabled: matchedRule.variation,
                source: "site_override" as const,
                reason: `Site targeting rule: ${matchedRule.id}`,
                evaluationTimeMs: Date.now() - startTime,
              };
              await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
              return result;
            }
          }

          // Check site-level percentage rollout
          if (siteOverride.percentageRollout?.enabled) {
            const inRollout = this.percentageEvaluator.isInRollout(
              siteOverride.percentageRollout,
              context,
              featureKey
            );
            const result = {
              featureKey,
              enabled: inRollout,
              source: "site_override" as const,
              reason: `Site rollout (${siteOverride.percentageRollout.percentage}%)`,
              evaluationTimeMs: Date.now() - startTime,
            };
            await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
            return result;
          }

          // Simple site override
          const result = {
            featureKey,
            enabled: siteOverride.enabled,
            source: "site_override" as const,
            reason: "Site override",
            evaluationTimeMs: Date.now() - startTime,
          };
          await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
          return result;
        }
      }

      // Check dependencies
      if (flag.dependencies.length > 0) {
        const allFlags = await this.storage.getAll();
        const resolution = this.dependencyResolver.canEnable(featureKey, allFlags);
        if (!resolution.canEnable) {
          const result = {
            featureKey,
            enabled: false,
            source: "default" as const,
            reason: `Blocked by dependencies: ${resolution.blockedBy.join(", ")}`,
            evaluationTimeMs: Date.now() - startTime,
          };
          await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
          return result;
        }
      }

      // Check global state
      if (!flag.globallyEnabled) {
        const result = {
          featureKey,
          enabled: flag.defaultState,
          source: "global" as const,
          reason: "Globally disabled",
          evaluationTimeMs: Date.now() - startTime,
        };
        await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
        return result;
      }

      // Check targeting rules
      if (flag.targetingRules.length > 0) {
        const { matched, matchedRule } = this.targetingEvaluator.evaluateAll(
          flag.targetingRules,
          context
        );
        if (matched && matchedRule) {
          const result = {
            featureKey,
            enabled: matchedRule.variation,
            source: "targeting_rule" as const,
            reason: `Matched rule: ${matchedRule.id}`,
            evaluationTimeMs: Date.now() - startTime,
          };
          await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
          return result;
        }
      }

      // Check percentage rollout
      if (flag.percentageRollout?.enabled) {
        const inRollout = this.percentageEvaluator.isInRollout(
          flag.percentageRollout,
          context,
          featureKey
        );
        const result = {
          featureKey,
          enabled: inRollout,
          source: "percentage_rollout" as const,
          reason: `Rollout (${flag.percentageRollout.percentage}%)`,
          evaluationTimeMs: Date.now() - startTime,
        };
        await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
        return result;
      }

      // A/B test variant (for enabled state)
      let variant: string | undefined;
      if (flag.abTestConfig?.enabled) {
        variant = this.abTestEvaluator.getVariant(flag.abTestConfig, context, featureKey) || undefined;
      }

      // Default: use global state
      const result = {
        featureKey,
        enabled: flag.globallyEnabled,
        source: "global" as const,
        variant,
        evaluationTimeMs: Date.now() - startTime,
      };
      await this.recordEvaluation(featureKey, result.enabled, context, Date.now() - startTime);
      return result;

    } catch (error) {
      log.error({ error, featureKey }, "Error evaluating feature flag");
      return {
        featureKey,
        enabled: false,
        source: "default",
        reason: `Evaluation error: ${error instanceof Error ? error.message : "Unknown"}`,
        evaluationTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Evaluate multiple feature flags
   */
  async evaluateBatch(
    featureKeys: string[],
    context: EvaluationContext
  ): Promise<Map<string, EvaluationResult>> {
    const results = new Map<string, EvaluationResult>();

    // Evaluate in parallel
    const evaluations = await Promise.all(
      featureKeys.slice(0, this.config.maxBatchSize).map((key) =>
        this.evaluate(key, context).then((result) => ({ key, result }))
      )
    );

    for (const { key, result } of evaluations) {
      results.set(key, result);
    }

    return results;
  }

  /**
   * Get all enabled features for a context
   */
  async getEnabledFeatures(context: EvaluationContext): Promise<string[]> {
    const allFlags = await this.storage.getAll();
    const enabled: string[] = [];

    for (const flag of allFlags) {
      const result = await this.evaluate(flag.key, context);
      if (result.enabled) {
        enabled.push(flag.key);
      }
    }

    return enabled;
  }

  /**
   * Quick check if a feature is enabled
   */
  async isEnabled(
    featureKey: string,
    context: EvaluationContext
  ): Promise<boolean> {
    const result = await this.evaluate(featureKey, context);
    return result.enabled;
  }

  /**
   * Get the A/B test variant for a feature
   */
  async getVariant(
    featureKey: string,
    context: EvaluationContext
  ): Promise<string | null> {
    const flag = await this.getFlag(featureKey);
    if (!flag || !flag.abTestConfig?.enabled) {
      return null;
    }

    return this.abTestEvaluator.getVariant(flag.abTestConfig, context, featureKey);
  }

  /**
   * Get a feature flag with caching
   */
  private async getFlag(key: string): Promise<FeatureFlag | null> {
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.flag;
      }
    }

    const flag = await this.storage.getByKey(key);
    if (flag && this.config.cacheEnabled) {
      this.cache.set(key, {
        flag,
        expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
      });
    }

    return flag;
  }

  /**
   * Record evaluation for statistics
   */
  private async recordEvaluation(
    featureKey: string,
    enabled: boolean,
    context: EvaluationContext,
    evaluationTimeMs: number
  ): Promise<void> {
    if (this.config.statsEnabled && this.statsStorage) {
      try {
        await this.statsStorage.record({
          featureKey,
          enabled,
          userId: context.userId,
          siteId: context.siteId,
          evaluationTimeMs,
        });
      } catch (error) {
        log.warn({ error, featureKey }, "Failed to record evaluation stats");
      }
    }
  }

  /**
   * Invalidate cache for a feature
   */
  invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
