/**
 * @file storage.ts
 * @description Feature Flags Storage Implementation
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * In-memory storage with persistence hooks.
 * Can be extended to use PostgreSQL via Drizzle.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  FeatureFlag,
  SiteFeatureOverride,
  UserFeatureOverride,
  FeatureUsageStats,
  RolloutEvent,
  FeatureCategory,
} from "./shared-types";
import type {
  IFeatureFlagStorage,
  ISiteOverrideStorage,
  IUserOverrideStorage,
  IUsageStatsStorage,
  IRolloutHistoryStorage,
} from "./types";
import { createModuleLogger } from "./logger-stub";

const log = createModuleLogger("feature-flags-storage");

// =============================================================================
// IN-MEMORY FEATURE FLAG STORAGE
// =============================================================================

/**
 * In-memory feature flag storage with optional persistence
 */
export class InMemoryFeatureFlagStorage implements IFeatureFlagStorage {
  private flags: Map<string, FeatureFlag> = new Map();
  private onPersist?: (flags: FeatureFlag[]) => Promise<void>;

  constructor(onPersist?: (flags: FeatureFlag[]) => Promise<void>) {
    this.onPersist = onPersist;
    this.initializeDefaultFlags();
  }

  /**
   * Initialize with default system flags
   */
  private initializeDefaultFlags(): void {
    const now = new Date().toISOString();

    const defaultFlags: FeatureFlag[] = [
      {
        key: "core_authentication",
        name: "Authentication",
        description: "Core authentication system",
        category: "core",
        globallyEnabled: true,
        toggleable: false,
        defaultState: true,
        dependencies: [],
        dependents: [],
        tags: ["security", "core"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "core_rses_engine",
        name: "RSES Engine",
        description: "Core RSES configuration parsing and evaluation",
        category: "core",
        globallyEnabled: true,
        toggleable: false,
        defaultState: true,
        dependencies: [],
        dependents: [],
        tags: ["rses", "core"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "feature_ai_suggestions",
        name: "AI Suggestions",
        description: "AI-powered suggestions for RSES configurations",
        category: "optional",
        globallyEnabled: true,
        toggleable: true,
        defaultState: false,
        dependencies: [{ featureKey: "core_rses_engine", requiredState: true }],
        dependents: [],
        tags: ["ai", "suggestions"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "feature_advanced_taxonomy",
        name: "Advanced Taxonomy",
        description: "Advanced taxonomy features with ML categorization",
        category: "optional",
        globallyEnabled: true,
        toggleable: true,
        defaultState: true,
        dependencies: [],
        dependents: [],
        tags: ["taxonomy", "ml"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "beta_collaborative_editing",
        name: "Collaborative Editing",
        description: "Real-time collaborative configuration editing",
        category: "beta",
        globallyEnabled: false,
        toggleable: true,
        defaultState: false,
        percentageRollout: {
          enabled: true,
          percentage: 25,
          bucketBy: ["userId"],
        },
        dependencies: [],
        dependents: [],
        tags: ["collaboration", "realtime"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "beta_version_intelligence",
        name: "Version Intelligence",
        description: "AI-powered version comparison and merge suggestions",
        category: "beta",
        globallyEnabled: false,
        toggleable: true,
        defaultState: false,
        percentageRollout: {
          enabled: true,
          percentage: 10,
          bucketBy: ["siteId"],
        },
        dependencies: [{ featureKey: "feature_ai_suggestions", requiredState: true }],
        dependents: [],
        tags: ["ai", "versioning"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "experimental_quantum_taxonomy",
        name: "Quantum Taxonomy",
        description: "Experimental quantum-inspired taxonomy classification",
        category: "experimental",
        globallyEnabled: false,
        toggleable: true,
        defaultState: false,
        dependencies: [{ featureKey: "feature_advanced_taxonomy", requiredState: true }],
        dependents: [],
        tags: ["experimental", "quantum", "taxonomy"],
        owner: "research-team",
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
      {
        key: "deprecated_legacy_api",
        name: "Legacy API",
        description: "Legacy v1 API endpoints (scheduled for removal)",
        category: "deprecated",
        globallyEnabled: true,
        toggleable: true,
        defaultState: true,
        sunsetDate: "2026-06-01T00:00:00Z",
        dependencies: [],
        dependents: [],
        tags: ["legacy", "api"],
        createdAt: now,
        updatedAt: now,
        changeHistory: [],
        targetingRules: [],
      },
    ];

    for (const flag of defaultFlags) {
      this.flags.set(flag.key, flag);
    }
  }

  async getAll(): Promise<FeatureFlag[]> {
    return Array.from(this.flags.values());
  }

  async getByKey(key: string): Promise<FeatureFlag | null> {
    return this.flags.get(key) || null;
  }

  async getByKeys(keys: string[]): Promise<FeatureFlag[]> {
    return keys.map((key) => this.flags.get(key)).filter((f): f is FeatureFlag => f !== undefined);
  }

  async getByCategory(category: string): Promise<FeatureFlag[]> {
    return Array.from(this.flags.values()).filter((f) => f.category === category);
  }

  async create(flag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory">): Promise<FeatureFlag> {
    const now = new Date().toISOString();
    const fullFlag: FeatureFlag = {
      ...flag,
      createdAt: now,
      updatedAt: now,
      changeHistory: [],
    };

    this.flags.set(flag.key, fullFlag);
    await this.persist();

    log.info({ key: flag.key }, "Created feature flag");
    return fullFlag;
  }

  async update(key: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag | null> {
    const existing = this.flags.get(key);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: FeatureFlag = {
      ...existing,
      ...updates,
      key: existing.key, // Key cannot be changed
      updatedAt: now,
      changeHistory: [
        {
          timestamp: now,
          userId: updates.lastModifiedBy || "system",
          action: "update",
          previousValue: existing,
          newValue: updates,
        },
        ...existing.changeHistory.slice(0, 49), // Keep last 50 changes
      ],
    };

    this.flags.set(key, updated);
    await this.persist();

    log.info({ key }, "Updated feature flag");
    return updated;
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.flags.delete(key);
    if (deleted) {
      await this.persist();
      log.info({ key }, "Deleted feature flag");
    }
    return deleted;
  }

  async bulkEnable(keys: string[]): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();

    for (const key of keys) {
      const flag = this.flags.get(key);
      if (flag && flag.toggleable) {
        flag.globallyEnabled = true;
        flag.updatedAt = now;
        count++;
      }
    }

    await this.persist();
    return count;
  }

  async bulkDisable(keys: string[]): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();

    for (const key of keys) {
      const flag = this.flags.get(key);
      if (flag && flag.toggleable) {
        flag.globallyEnabled = false;
        flag.updatedAt = now;
        count++;
      }
    }

    await this.persist();
    return count;
  }

  async bulkDelete(keys: string[]): Promise<number> {
    let count = 0;

    for (const key of keys) {
      if (this.flags.delete(key)) {
        count++;
      }
    }

    await this.persist();
    return count;
  }

  async search(query: {
    search?: string;
    categories?: string[];
    tags?: string[];
    enabled?: boolean;
    owner?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ flags: FeatureFlag[]; total: number }> {
    let results = Array.from(this.flags.values());

    if (query.search) {
      const search = query.search.toLowerCase();
      results = results.filter(
        (f) =>
          f.key.toLowerCase().includes(search) ||
          f.name.toLowerCase().includes(search) ||
          f.description.toLowerCase().includes(search)
      );
    }

    if (query.categories && query.categories.length > 0) {
      results = results.filter((f) => query.categories!.includes(f.category));
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((f) => f.tags.some((t) => query.tags!.includes(t)));
    }

    if (query.enabled !== undefined) {
      results = results.filter((f) => f.globallyEnabled === query.enabled);
    }

    if (query.owner) {
      results = results.filter((f) => f.owner === query.owner);
    }

    const total = results.length;

    if (query.offset) {
      results = results.slice(query.offset);
    }

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return { flags: results, total };
  }

  private async persist(): Promise<void> {
    if (this.onPersist) {
      try {
        await this.onPersist(Array.from(this.flags.values()));
      } catch (error) {
        log.error({ error }, "Failed to persist feature flags");
      }
    }
  }
}

// =============================================================================
// IN-MEMORY SITE OVERRIDE STORAGE
// =============================================================================

/**
 * In-memory site override storage
 */
export class InMemorySiteOverrideStorage implements ISiteOverrideStorage {
  private overrides: Map<string, SiteFeatureOverride> = new Map();

  private getKey(siteId: string, featureKey: string): string {
    return `${siteId}:${featureKey}`;
  }

  async getForSite(siteId: string): Promise<SiteFeatureOverride[]> {
    return Array.from(this.overrides.values()).filter((o) => o.siteId === siteId);
  }

  async getForFeature(featureKey: string): Promise<SiteFeatureOverride[]> {
    return Array.from(this.overrides.values()).filter((o) => o.featureKey === featureKey);
  }

  async get(siteId: string, featureKey: string): Promise<SiteFeatureOverride | null> {
    return this.overrides.get(this.getKey(siteId, featureKey)) || null;
  }

  async set(override: Omit<SiteFeatureOverride, "createdAt" | "updatedAt">): Promise<SiteFeatureOverride> {
    const now = new Date().toISOString();
    const key = this.getKey(override.siteId, override.featureKey);
    const existing = this.overrides.get(key);

    const full: SiteFeatureOverride = {
      ...override,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.overrides.set(key, full);
    return full;
  }

  async delete(siteId: string, featureKey: string): Promise<boolean> {
    return this.overrides.delete(this.getKey(siteId, featureKey));
  }

  async deleteAllForSite(siteId: string): Promise<number> {
    let count = 0;
    for (const [key, override] of this.overrides) {
      if (override.siteId === siteId) {
        this.overrides.delete(key);
        count++;
      }
    }
    return count;
  }

  async deleteAllForFeature(featureKey: string): Promise<number> {
    let count = 0;
    for (const [key, override] of this.overrides) {
      if (override.featureKey === featureKey) {
        this.overrides.delete(key);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// IN-MEMORY USER OVERRIDE STORAGE
// =============================================================================

/**
 * In-memory user override storage
 */
export class InMemoryUserOverrideStorage implements IUserOverrideStorage {
  private overrides: Map<string, UserFeatureOverride> = new Map();

  private getKey(userId: string, featureKey: string): string {
    return `${userId}:${featureKey}`;
  }

  async getForUser(userId: string): Promise<UserFeatureOverride[]> {
    return Array.from(this.overrides.values()).filter((o) => o.userId === userId);
  }

  async getForFeature(featureKey: string): Promise<UserFeatureOverride[]> {
    return Array.from(this.overrides.values()).filter((o) => o.featureKey === featureKey);
  }

  async get(userId: string, featureKey: string): Promise<UserFeatureOverride | null> {
    return this.overrides.get(this.getKey(userId, featureKey)) || null;
  }

  async set(override: Omit<UserFeatureOverride, "createdAt">): Promise<UserFeatureOverride> {
    const now = new Date().toISOString();
    const key = this.getKey(override.userId, override.featureKey);

    const full: UserFeatureOverride = {
      ...override,
      createdAt: now,
    };

    this.overrides.set(key, full);
    return full;
  }

  async delete(userId: string, featureKey: string): Promise<boolean> {
    return this.overrides.delete(this.getKey(userId, featureKey));
  }

  async deleteExpired(): Promise<number> {
    let count = 0;
    const now = new Date();

    for (const [key, override] of this.overrides) {
      if (override.expiresAt && new Date(override.expiresAt) < now) {
        this.overrides.delete(key);
        count++;
      }
    }

    return count;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [key, override] of this.overrides) {
      if (override.userId === userId) {
        this.overrides.delete(key);
        count++;
      }
    }
    return count;
  }

  async deleteAllForFeature(featureKey: string): Promise<number> {
    let count = 0;
    for (const [key, override] of this.overrides) {
      if (override.featureKey === featureKey) {
        this.overrides.delete(key);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// IN-MEMORY USAGE STATS STORAGE
// =============================================================================

/**
 * In-memory usage statistics storage
 */
export class InMemoryUsageStatsStorage implements IUsageStatsStorage {
  private stats: Map<string, FeatureUsageStats> = new Map();
  private pendingEvaluations: Array<{
    featureKey: string;
    enabled: boolean;
    userId?: string;
    siteId?: string;
    evaluationTimeMs: number;
    error?: boolean;
    timestamp: Date;
  }> = [];

  private getKey(featureKey: string, period: string, periodStart: string): string {
    return `${featureKey}:${period}:${periodStart}`;
  }

  async record(evaluation: {
    featureKey: string;
    enabled: boolean;
    userId?: string;
    siteId?: string;
    evaluationTimeMs: number;
    error?: boolean;
  }): Promise<void> {
    this.pendingEvaluations.push({
      ...evaluation,
      timestamp: new Date(),
    });

    // Auto-aggregate every 100 evaluations
    if (this.pendingEvaluations.length >= 100) {
      await this.aggregateStats();
    }
  }

  async getStats(featureKey: string, period: "hour" | "day" | "week" | "month"): Promise<FeatureUsageStats | null> {
    const periodStart = this.getPeriodStart(new Date(), period);
    const key = this.getKey(featureKey, period, periodStart);
    return this.stats.get(key) || null;
  }

  async getStatsHistory(
    featureKey: string,
    period: "hour" | "day" | "week" | "month",
    limit: number = 24
  ): Promise<FeatureUsageStats[]> {
    const results: FeatureUsageStats[] = [];
    const now = new Date();

    for (let i = 0; i < limit; i++) {
      const date = new Date(now.getTime() - i * this.getPeriodMs(period));
      const periodStart = this.getPeriodStart(date, period);
      const key = this.getKey(featureKey, period, periodStart);
      const stat = this.stats.get(key);
      if (stat) {
        results.push(stat);
      }
    }

    return results;
  }

  async getTopFeatures(
    period: "hour" | "day" | "week" | "month",
    limit: number = 10
  ): Promise<Array<{ featureKey: string; evaluations: number }>> {
    const periodStart = this.getPeriodStart(new Date(), period);
    const results: Array<{ featureKey: string; evaluations: number }> = [];

    for (const [key, stat] of this.stats) {
      if (key.includes(`:${period}:${periodStart}`)) {
        results.push({ featureKey: stat.featureKey, evaluations: stat.evaluations });
      }
    }

    return results.sort((a, b) => b.evaluations - a.evaluations).slice(0, limit);
  }

  async aggregateStats(): Promise<void> {
    if (this.pendingEvaluations.length === 0) {
      return;
    }

    const periods: Array<"hour" | "day" | "week" | "month"> = ["hour", "day", "week", "month"];

    // Group by feature and period
    for (const period of periods) {
      const grouped = new Map<string, typeof this.pendingEvaluations>();

      for (const eval_ of this.pendingEvaluations) {
        const periodStart = this.getPeriodStart(eval_.timestamp, period);
        const key = this.getKey(eval_.featureKey, period, periodStart);

        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(eval_);
      }

      // Aggregate each group
      for (const [key, evals] of grouped) {
        const [featureKey, _, periodStart] = key.split(":");

        const existing = this.stats.get(key) || {
          featureKey,
          period,
          evaluations: 0,
          enabledEvaluations: 0,
          disabledEvaluations: 0,
          uniqueUsers: 0,
          uniqueUsersEnabled: 0,
          sitesWithOverrides: 0,
          sitesEnabled: 0,
          sitesDisabled: 0,
          evaluationErrors: 0,
          dependencyErrors: 0,
          avgEvaluationTimeMs: 0,
          p95EvaluationTimeMs: 0,
          p99EvaluationTimeMs: 0,
          enabledTrend: [],
          timestamp: periodStart,
        };

        const userIds = new Set<string>();
        const enabledUserIds = new Set<string>();
        const times: number[] = [];

        for (const e of evals) {
          existing.evaluations++;
          if (e.enabled) {
            existing.enabledEvaluations++;
          } else {
            existing.disabledEvaluations++;
          }
          if (e.error) {
            existing.evaluationErrors++;
          }
          if (e.userId) {
            userIds.add(e.userId);
            if (e.enabled) {
              enabledUserIds.add(e.userId);
            }
          }
          times.push(e.evaluationTimeMs);
        }

        existing.uniqueUsers = userIds.size;
        existing.uniqueUsersEnabled = enabledUserIds.size;

        if (times.length > 0) {
          times.sort((a, b) => a - b);
          existing.avgEvaluationTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
          existing.p95EvaluationTimeMs = times[Math.floor(times.length * 0.95)] || 0;
          existing.p99EvaluationTimeMs = times[Math.floor(times.length * 0.99)] || 0;
        }

        this.stats.set(key, existing);
      }
    }

    // Clear pending
    this.pendingEvaluations = [];
  }

  async cleanup(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    let count = 0;

    for (const [key, stat] of this.stats) {
      if (stat.timestamp < cutoff) {
        this.stats.delete(key);
        count++;
      }
    }

    return count;
  }

  private getPeriodStart(date: Date, period: "hour" | "day" | "week" | "month"): string {
    const d = new Date(date);

    switch (period) {
      case "hour":
        d.setMinutes(0, 0, 0);
        break;
      case "day":
        d.setHours(0, 0, 0, 0);
        break;
      case "week":
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        break;
      case "month":
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        break;
    }

    return d.toISOString();
  }

  private getPeriodMs(period: "hour" | "day" | "week" | "month"): number {
    switch (period) {
      case "hour":
        return 60 * 60 * 1000;
      case "day":
        return 24 * 60 * 60 * 1000;
      case "week":
        return 7 * 24 * 60 * 60 * 1000;
      case "month":
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}

// =============================================================================
// IN-MEMORY ROLLOUT HISTORY STORAGE
// =============================================================================

/**
 * In-memory rollout history storage
 */
export class InMemoryRolloutHistoryStorage implements IRolloutHistoryStorage {
  private events: RolloutEvent[] = [];
  private maxEvents: number = 10000;

  async record(event: Omit<RolloutEvent, "id" | "timestamp">): Promise<RolloutEvent> {
    const full: RolloutEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(full);

    // Trim if exceeded max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    return full;
  }

  async getForFeature(featureKey: string, limit: number = 100): Promise<RolloutEvent[]> {
    return this.events.filter((e) => e.featureKey === featureKey).slice(0, limit);
  }

  async getForSite(siteId: string, limit: number = 100): Promise<RolloutEvent[]> {
    return this.events.filter((e) => e.siteId === siteId).slice(0, limit);
  }

  async getRecent(limit: number = 100): Promise<RolloutEvent[]> {
    return this.events.slice(0, limit);
  }

  async search(query: {
    featureKey?: string;
    siteId?: string;
    userId?: string;
    eventType?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: RolloutEvent[]; total: number }> {
    let results = this.events;

    if (query.featureKey) {
      results = results.filter((e) => e.featureKey === query.featureKey);
    }

    if (query.siteId) {
      results = results.filter((e) => e.siteId === query.siteId);
    }

    if (query.userId) {
      results = results.filter((e) => e.userId === query.userId);
    }

    if (query.eventType) {
      results = results.filter((e) => e.eventType === query.eventType);
    }

    if (query.from) {
      results = results.filter((e) => e.timestamp >= query.from!);
    }

    if (query.to) {
      results = results.filter((e) => e.timestamp <= query.to!);
    }

    const total = results.length;

    if (query.offset) {
      results = results.slice(query.offset);
    }

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return { events: results, total };
  }
}
