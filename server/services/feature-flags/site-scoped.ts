/**
 * @file site-scoped.ts
 * @description Site-scoped feature flags with tenant isolation
 * @phase Phase 3 - Multi-tenancy
 * @version 0.7.0
 * @created 2026-02-02
 *
 * Provides site-isolated feature flag operations using AsyncLocalStorage context.
 * All operations automatically scope to the current site from request context.
 */

import type {
  FeatureFlag,
  EvaluationContext,
  EvaluationResult,
  SiteFeatureOverride,
  UserFeatureOverride,
  PercentageRollout,
  TargetingRule,
  FeatureDependency,
  FeatureUsageStats,
  RolloutEvent,
  BatchEvaluationResponse,
} from "@shared/admin/types";
import type { DependencyResolution } from "@shared/admin/schema";
import { tryGetSiteContext, getCurrentSiteId, SiteContextError } from "../../multisite/site/site-context";
import { getFeatureFlagsService, type FeatureFlagsService } from "./index";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-flags-site-scoped");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Site-scoped feature flag with site ownership info.
 */
export interface SiteScopedFeatureFlag extends FeatureFlag {
  /** Site that owns this flag (null for global flags) */
  siteId: string | null;
  /** Whether this flag is inherited from network level */
  inherited: boolean;
}

/**
 * Scope for feature flag operations.
 */
export type FeatureFlagScope = "site" | "network" | "global";

/**
 * Options for creating site-scoped flags.
 */
export interface CreateSiteScopedFlagOptions {
  /** Scope of the flag (default: "site") */
  scope?: FeatureFlagScope;
  /** Inherit from network-level flag if exists */
  inheritFromNetwork?: boolean;
}

// =============================================================================
// SITE-SCOPED SERVICE
// =============================================================================

/**
 * Site-scoped wrapper for feature flags service.
 *
 * Provides automatic site isolation for all feature flag operations.
 * Uses AsyncLocalStorage to get current site context.
 */
export class SiteScopedFeatureFlagsService {
  private baseService: FeatureFlagsService;

  constructor(baseService?: FeatureFlagsService) {
    this.baseService = baseService || getFeatureFlagsService();
  }

  // ---------------------------------------------------------------------------
  // CONTEXT HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Get current site ID from context or throw.
   */
  private requireSiteId(): string {
    const context = tryGetSiteContext();
    if (!context) {
      throw new SiteContextError(
        "Site context required for this operation",
        "SITE_CONTEXT_REQUIRED"
      );
    }
    return context.siteId;
  }

  /**
   * Get current site ID or undefined.
   */
  private getSiteIdOrUndefined(): string | undefined {
    return tryGetSiteContext()?.siteId;
  }

  /**
   * Build site-scoped flag key.
   */
  private scopedKey(key: string, siteId?: string): string {
    const site = siteId || this.getSiteIdOrUndefined();
    if (site) {
      return `site:${site}:${key}`;
    }
    return key;
  }

  /**
   * Check if a key is site-scoped.
   */
  private isSiteScoped(key: string): boolean {
    return key.startsWith("site:");
  }

  /**
   * Extract site ID from scoped key.
   */
  private extractSiteFromKey(key: string): string | null {
    if (!this.isSiteScoped(key)) return null;
    const parts = key.split(":");
    return parts[1] || null;
  }

  /**
   * Extract base key from scoped key.
   */
  private extractBaseKey(key: string): string {
    if (!this.isSiteScoped(key)) return key;
    const parts = key.split(":");
    return parts.slice(2).join(":");
  }

  // ---------------------------------------------------------------------------
  // FLAG MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Get all flags for the current site.
   * Includes site-specific, network, and global flags.
   */
  async getAllFlags(): Promise<SiteScopedFeatureFlag[]> {
    const siteId = this.requireSiteId();
    const allFlags = await this.baseService.getAllFlags();

    const result: SiteScopedFeatureFlag[] = [];

    for (const flag of allFlags) {
      const flagSite = this.extractSiteFromKey(flag.key);

      // Include if:
      // 1. Global flag (no site prefix)
      // 2. This site's flag
      if (!flagSite || flagSite === siteId) {
        result.push({
          ...flag,
          key: this.extractBaseKey(flag.key),
          siteId: flagSite,
          inherited: !flagSite, // Global flags are considered inherited
        });
      }
    }

    return result;
  }

  /**
   * Get a specific flag for the current site.
   * Falls back to global flag if site-specific doesn't exist.
   */
  async getFlag(key: string): Promise<SiteScopedFeatureFlag | null> {
    const siteId = this.requireSiteId();

    // Try site-specific first
    const siteFlag = await this.baseService.getFlag(this.scopedKey(key, siteId));
    if (siteFlag) {
      return {
        ...siteFlag,
        key: this.extractBaseKey(siteFlag.key),
        siteId,
        inherited: false,
      };
    }

    // Fall back to global
    const globalFlag = await this.baseService.getFlag(key);
    if (globalFlag && !this.isSiteScoped(globalFlag.key)) {
      return {
        ...globalFlag,
        siteId: null,
        inherited: true,
      };
    }

    return null;
  }

  /**
   * Create a flag for the current site.
   */
  async createFlag(
    flag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory" | "dependents">,
    options: CreateSiteScopedFlagOptions = {}
  ): Promise<SiteScopedFeatureFlag> {
    const siteId = this.requireSiteId();
    const userId = tryGetSiteContext()?.user?.id;

    const scope = options.scope || "site";
    const scopedKey = scope === "site" ? this.scopedKey(flag.key, siteId) : flag.key;

    const created = await this.baseService.createFlag(
      { ...flag, key: scopedKey },
      userId
    );

    return {
      ...created,
      key: this.extractBaseKey(created.key),
      siteId: scope === "site" ? siteId : null,
      inherited: false,
    };
  }

  /**
   * Update a flag for the current site.
   */
  async updateFlag(
    key: string,
    updates: Partial<FeatureFlag>
  ): Promise<SiteScopedFeatureFlag | null> {
    const siteId = this.requireSiteId();
    const userId = tryGetSiteContext()?.user?.id;

    // Check if site-specific exists
    const siteKey = this.scopedKey(key, siteId);
    const siteFlag = await this.baseService.getFlag(siteKey);

    if (siteFlag) {
      const updated = await this.baseService.updateFlag(siteKey, updates, userId);
      if (!updated) return null;
      return {
        ...updated,
        key: this.extractBaseKey(updated.key),
        siteId,
        inherited: false,
      };
    }

    // If updating a global flag, create a site-specific override
    const globalFlag = await this.baseService.getFlag(key);
    if (globalFlag && !this.isSiteScoped(globalFlag.key)) {
      log.info({ key, siteId }, "Creating site override for global flag");

      // Create site-specific copy
      const created = await this.baseService.createFlag(
        {
          ...globalFlag,
          ...updates,
          key: siteKey,
        },
        userId
      );

      return {
        ...created,
        key: this.extractBaseKey(created.key),
        siteId,
        inherited: false,
      };
    }

    return null;
  }

  /**
   * Enable a flag for the current site.
   */
  async enableFlag(key: string): Promise<boolean> {
    const siteId = this.requireSiteId();
    const userId = tryGetSiteContext()?.user?.id;

    // Try site-specific first
    const siteKey = this.scopedKey(key, siteId);
    if (await this.baseService.getFlag(siteKey)) {
      return this.baseService.enableFlag(siteKey, userId);
    }

    // Create site override for global flag
    const globalFlag = await this.baseService.getFlag(key);
    if (globalFlag) {
      await this.createFlag(
        { ...globalFlag, globallyEnabled: true },
        { scope: "site" }
      );
      return true;
    }

    return false;
  }

  /**
   * Disable a flag for the current site.
   */
  async disableFlag(key: string): Promise<boolean> {
    const siteId = this.requireSiteId();
    const userId = tryGetSiteContext()?.user?.id;

    // Try site-specific first
    const siteKey = this.scopedKey(key, siteId);
    if (await this.baseService.getFlag(siteKey)) {
      return this.baseService.disableFlag(siteKey, userId);
    }

    // Create site override for global flag
    const globalFlag = await this.baseService.getFlag(key);
    if (globalFlag) {
      await this.createFlag(
        { ...globalFlag, globallyEnabled: false },
        { scope: "site" }
      );
      return true;
    }

    return false;
  }

  /**
   * Delete a site-specific flag.
   * Cannot delete global flags from site context.
   */
  async deleteFlag(key: string): Promise<boolean> {
    const siteId = this.requireSiteId();
    const siteKey = this.scopedKey(key, siteId);

    // Only allow deleting site-specific flags
    const flag = await this.baseService.getFlag(siteKey);
    if (!flag) {
      return false;
    }

    return this.baseService.deleteFlag(siteKey);
  }

  // ---------------------------------------------------------------------------
  // EVALUATION
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a flag for the current site.
   */
  async evaluate(
    key: string,
    context?: Partial<EvaluationContext>
  ): Promise<EvaluationResult> {
    const siteId = this.requireSiteId();
    const fullContext: EvaluationContext = {
      siteId,
      userId: tryGetSiteContext()?.user?.id,
      ...context,
    };

    // Try site-specific first
    const siteKey = this.scopedKey(key, siteId);
    const siteFlag = await this.baseService.getFlag(siteKey);

    if (siteFlag) {
      return this.baseService.evaluate(siteKey, fullContext);
    }

    // Fall back to global
    return this.baseService.evaluate(key, fullContext);
  }

  /**
   * Evaluate multiple flags for the current site.
   */
  async evaluateBatch(
    keys: string[],
    context?: Partial<EvaluationContext>
  ): Promise<BatchEvaluationResponse> {
    const siteId = this.requireSiteId();
    const fullContext: EvaluationContext = {
      siteId,
      userId: tryGetSiteContext()?.user?.id,
      ...context,
    };

    // Resolve each key to site-specific or global
    const resolvedKeys = await Promise.all(
      keys.map(async (key) => {
        const siteKey = this.scopedKey(key, siteId);
        const siteFlag = await this.baseService.getFlag(siteKey);
        return siteFlag ? siteKey : key;
      })
    );

    const response = await this.baseService.evaluateBatch(resolvedKeys, fullContext);

    // Normalize keys back to original
    const normalizedResults: Record<string, EvaluationResult> = {};
    for (let i = 0; i < keys.length; i++) {
      const originalKey = keys[i];
      const resolvedKey = resolvedKeys[i];
      if (response.results[resolvedKey]) {
        normalizedResults[originalKey] = {
          ...response.results[resolvedKey],
          featureKey: originalKey,
        };
      }
    }

    return {
      ...response,
      results: normalizedResults,
    };
  }

  /**
   * Check if a flag is enabled for the current site.
   */
  async isEnabled(key: string, context?: Partial<EvaluationContext>): Promise<boolean> {
    const result = await this.evaluate(key, context);
    return result.enabled;
  }

  /**
   * Get all enabled flags for the current site.
   */
  async getEnabledFeatures(context?: Partial<EvaluationContext>): Promise<string[]> {
    const siteId = this.requireSiteId();
    const fullContext: EvaluationContext = {
      siteId,
      userId: tryGetSiteContext()?.user?.id,
      ...context,
    };

    const enabled = await this.baseService.getEnabledFeatures(fullContext);

    // Normalize keys
    return enabled.map((key) => this.extractBaseKey(key));
  }

  // ---------------------------------------------------------------------------
  // OVERRIDES
  // ---------------------------------------------------------------------------

  /**
   * Set a user override for the current site.
   */
  async setUserOverride(
    targetUserId: string,
    featureKey: string,
    enabled: boolean,
    options?: { reason?: string; expiresAt?: string }
  ): Promise<UserFeatureOverride> {
    const siteId = this.requireSiteId();
    const adminUserId = tryGetSiteContext()?.user?.id;

    // Use site-scoped key
    const siteKey = this.scopedKey(featureKey, siteId);

    return this.baseService.setUserOverride(
      targetUserId,
      siteKey,
      enabled,
      options,
      adminUserId
    );
  }

  /**
   * Get user overrides for a flag in the current site.
   */
  async getUserOverrides(featureKey: string): Promise<UserFeatureOverride[]> {
    const siteId = this.requireSiteId();
    const siteKey = this.scopedKey(featureKey, siteId);

    // Get both site-specific and global overrides
    const [siteOverrides, globalOverrides] = await Promise.all([
      this.baseService.getUserOverrides(siteKey),
      this.baseService.getUserOverrides(featureKey),
    ]);

    // Normalize and dedupe
    const all = [
      ...siteOverrides.map((o) => ({ ...o, featureKey })),
      ...globalOverrides.map((o) => ({ ...o, featureKey })),
    ];

    // Dedupe by userId (site-specific takes precedence)
    const seen = new Set<string>();
    return all.filter((o) => {
      if (seen.has(o.userId)) return false;
      seen.add(o.userId);
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get usage statistics for a flag in the current site.
   */
  async getUsageStats(
    featureKey: string,
    period: "hour" | "day" | "week" | "month"
  ): Promise<FeatureUsageStats | null> {
    const siteId = this.requireSiteId();

    // Try site-specific first
    const siteKey = this.scopedKey(featureKey, siteId);
    const siteStats = await this.baseService.getUsageStats(siteKey, period);
    if (siteStats) {
      return { ...siteStats, featureKey };
    }

    // Fall back to global
    return this.baseService.getUsageStats(featureKey, period);
  }

  /**
   * Get rollout history for a flag in the current site.
   */
  async getRolloutHistory(
    featureKey: string,
    limit?: number
  ): Promise<RolloutEvent[]> {
    const siteId = this.requireSiteId();
    const siteKey = this.scopedKey(featureKey, siteId);

    // Get both site-specific and global history
    const [siteHistory, globalHistory] = await Promise.all([
      this.baseService.getRolloutHistory(siteKey, limit),
      this.baseService.getRolloutHistory(featureKey, limit),
    ]);

    // Merge and sort by timestamp
    const all = [
      ...siteHistory.map((e) => ({ ...e, featureKey })),
      ...globalHistory.map((e) => ({ ...e, featureKey })),
    ];

    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit || 100);
  }

  // ---------------------------------------------------------------------------
  // CACHE
  // ---------------------------------------------------------------------------

  /**
   * Clear cache for the current site.
   */
  clearCache(): void {
    const siteId = this.getSiteIdOrUndefined();
    if (siteId) {
      // Invalidate site-specific cache entries
      this.baseService.invalidateEdgeCache(`site:${siteId}:`).catch((err) => {
        log.error({ err, siteId }, "Failed to invalidate site cache");
      });
    }
    this.baseService.clearCache();
  }
}

// =============================================================================
// SINGLETON & FACTORY
// =============================================================================

let siteScopedInstance: SiteScopedFeatureFlagsService | null = null;

/**
 * Get the site-scoped feature flags service singleton.
 */
export function getSiteScopedFeatureFlagsService(): SiteScopedFeatureFlagsService {
  if (!siteScopedInstance) {
    siteScopedInstance = new SiteScopedFeatureFlagsService();
  }
  return siteScopedInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSiteScopedFeatureFlagsService(): void {
  siteScopedInstance = null;
}
