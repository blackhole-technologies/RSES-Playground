/**
 * @file pg-storage.ts
 * @description PostgreSQL Feature Flags Storage Implementation
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @created 2026-02-01
 *
 * Persistent storage for feature flags using PostgreSQL via Drizzle ORM.
 * Replaces in-memory storage for production use.
 */

import { eq, and, or, ilike, inArray, sql, desc, asc, lte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, withCircuitBreaker } from "../../db";
import { safeLikePattern } from "../../lib/sql-utils";
import {
  featureFlags,
  siteFeatureOverrides,
  userFeatureOverrides,
  featureUsageStats,
  featureRolloutHistory,
  type FeatureFlagRow,
  type SiteFeatureOverrideRow,
  type UserFeatureOverrideRow,
  type FeatureUsageStatsRow,
  type FeatureRolloutHistoryRow,
} from "@shared/schema";
import type {
  FeatureFlag,
  SiteFeatureOverride,
  UserFeatureOverride,
  FeatureUsageStats,
  RolloutEvent,
} from "@shared/admin/types";
import type {
  IFeatureFlagStorage,
  ISiteOverrideStorage,
  IUserOverrideStorage,
  IUsageStatsStorage,
  IRolloutHistoryStorage,
} from "./types";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-flags-pg-storage");

// =============================================================================
// TYPE CONVERTERS
// =============================================================================

/**
 * Convert database row to FeatureFlag type
 */
function rowToFlag(row: FeatureFlagRow): FeatureFlag {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    globallyEnabled: row.globallyEnabled,
    toggleable: row.toggleable,
    defaultState: row.defaultState,
    percentageRollout: row.percentageRollout ?? undefined,
    dependencies: row.dependencies ?? [],
    dependents: [], // Computed at runtime
    tags: row.tags ?? [],
    owner: row.owner ?? undefined,
    sunsetDate: row.sunsetDate ?? undefined,
    targetingRules: row.targetingRules ?? [],
    changeHistory: row.changeHistory ?? [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  };
}

/**
 * Convert database row to SiteFeatureOverride type
 */
function rowToSiteOverride(row: SiteFeatureOverrideRow): SiteFeatureOverride {
  return {
    siteId: row.siteId,
    featureKey: row.featureKey,
    enabled: row.enabled,
    reason: row.reason ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    createdBy: row.createdBy ?? undefined,
  };
}

/**
 * Convert database row to UserFeatureOverride type
 */
function rowToUserOverride(row: UserFeatureOverrideRow): UserFeatureOverride {
  return {
    userId: row.userId,
    featureKey: row.featureKey,
    enabled: row.enabled,
    reason: row.reason ?? undefined,
    expiresAt: row.expiresAt?.toISOString(),
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    createdBy: row.createdBy ?? undefined,
  };
}

/**
 * Convert database row to FeatureUsageStats type
 */
function rowToUsageStats(row: FeatureUsageStatsRow): FeatureUsageStats {
  return {
    featureKey: row.featureKey,
    period: row.period,
    evaluations: row.evaluations,
    enabledEvaluations: row.enabledEvaluations,
    disabledEvaluations: row.disabledEvaluations,
    uniqueUsers: row.uniqueUsers,
    uniqueUsersEnabled: 0, // Not tracked in simple stats
    sitesWithOverrides: 0,
    sitesEnabled: 0,
    sitesDisabled: 0,
    evaluationErrors: row.evaluationErrors,
    dependencyErrors: 0,
    avgEvaluationTimeMs: row.avgEvaluationTimeMs,
    p95EvaluationTimeMs: 0, // Not tracked in simple stats
    p99EvaluationTimeMs: 0,
    enabledTrend: [],
    timestamp: row.periodStart.toISOString(),
  };
}

/**
 * Convert database row to RolloutEvent type
 */
function rowToRolloutEvent(row: FeatureRolloutHistoryRow): RolloutEvent {
  return {
    id: row.id.toString(),
    featureKey: row.featureKey,
    eventType: row.eventType as RolloutEvent["eventType"],
    previousValue: row.previousValue,
    newValue: row.newValue,
    siteId: row.siteId ?? undefined,
    userId: row.userId ?? undefined,
    performedBy: row.performedBy ?? undefined,
    reason: row.reason ?? undefined,
    timestamp: row.timestamp?.toISOString() ?? new Date().toISOString(),
  };
}

// =============================================================================
// POSTGRESQL FEATURE FLAG STORAGE
// =============================================================================

/**
 * PostgreSQL feature flag storage implementation
 */
export class PgFeatureFlagStorage implements IFeatureFlagStorage {
  async getAll(): Promise<FeatureFlag[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(featureFlags);
      return rows.map(rowToFlag);
    });
  }

  async getByKey(key: string): Promise<FeatureFlag | null> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
      return rows.length > 0 ? rowToFlag(rows[0]) : null;
    });
  }

  async getByKeys(keys: string[]): Promise<FeatureFlag[]> {
    if (keys.length === 0) return [];
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(featureFlags).where(inArray(featureFlags.key, keys));
      return rows.map(rowToFlag);
    });
  }

  async getByCategory(category: string): Promise<FeatureFlag[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(featureFlags).where(eq(featureFlags.category, category as any));
      return rows.map(rowToFlag);
    });
  }

  async create(flag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory">): Promise<FeatureFlag> {
    return withCircuitBreaker(async () => {
      const now = new Date();
      const [row] = await db
        .insert(featureFlags)
        .values({
          key: flag.key,
          name: flag.name,
          description: flag.description,
          category: flag.category,
          globallyEnabled: flag.globallyEnabled,
          toggleable: flag.toggleable,
          defaultState: flag.defaultState,
          percentageRollout: flag.percentageRollout,
          dependencies: flag.dependencies,
          tags: flag.tags,
          owner: flag.owner,
          sunsetDate: flag.sunsetDate,
          targetingRules: flag.targetingRules,
          changeHistory: [],
          createdAt: now,
          updatedAt: now,
          lastModifiedBy: flag.lastModifiedBy,
        })
        .returning();

      log.info({ key: flag.key }, "Created feature flag");
      return rowToFlag(row);
    });
  }

  async update(key: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag | null> {
    return withCircuitBreaker(async () => {
      // First get existing to build change history
      const existing = await this.getByKey(key);
      if (!existing) return null;

      const now = new Date();
      const changeEntry = {
        timestamp: now.toISOString(),
        userId: updates.lastModifiedBy || "system",
        action: "update",
        previousValue: existing,
        newValue: updates,
      };

      const [row] = await db
        .update(featureFlags)
        .set({
          ...updates,
          key: undefined, // Can't change key
          updatedAt: now,
          changeHistory: [changeEntry, ...(existing.changeHistory || []).slice(0, 49)],
        })
        .where(eq(featureFlags.key, key))
        .returning();

      if (!row) return null;

      log.info({ key }, "Updated feature flag");
      return rowToFlag(row);
    });
  }

  async delete(key: string): Promise<boolean> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(featureFlags).where(eq(featureFlags.key, key));
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {
        log.info({ key }, "Deleted feature flag");
      }
      return deleted;
    });
  }

  async bulkEnable(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return withCircuitBreaker(async () => {
      const result = await db
        .update(featureFlags)
        .set({ globallyEnabled: true, updatedAt: new Date() })
        .where(and(inArray(featureFlags.key, keys), eq(featureFlags.toggleable, true)));
      return result.rowCount ?? 0;
    });
  }

  async bulkDisable(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return withCircuitBreaker(async () => {
      const result = await db
        .update(featureFlags)
        .set({ globallyEnabled: false, updatedAt: new Date() })
        .where(and(inArray(featureFlags.key, keys), eq(featureFlags.toggleable, true)));
      return result.rowCount ?? 0;
    });
  }

  async bulkDelete(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return withCircuitBreaker(async () => {
      const result = await db.delete(featureFlags).where(inArray(featureFlags.key, keys));
      return result.rowCount ?? 0;
    });
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
    return withCircuitBreaker(async () => {
      const conditions = [];

      if (query.search) {
        const searchPattern = safeLikePattern(query.search);
        conditions.push(
          or(
            ilike(featureFlags.key, searchPattern),
            ilike(featureFlags.name, searchPattern),
            ilike(featureFlags.description, searchPattern)
          )
        );
      }

      if (query.categories && query.categories.length > 0) {
        conditions.push(inArray(featureFlags.category, query.categories as any));
      }

      if (query.enabled !== undefined) {
        conditions.push(eq(featureFlags.globallyEnabled, query.enabled));
      }

      if (query.owner) {
        conditions.push(eq(featureFlags.owner, query.owner));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(featureFlags)
        .where(whereClause);
      const total = Number(countResult[0]?.count ?? 0);

      // Get paginated results
      let queryBuilder = db.select().from(featureFlags).where(whereClause).orderBy(asc(featureFlags.key));

      if (query.offset) {
        queryBuilder = queryBuilder.offset(query.offset) as typeof queryBuilder;
      }
      if (query.limit) {
        queryBuilder = queryBuilder.limit(query.limit) as typeof queryBuilder;
      }

      const rows = await queryBuilder;

      // Filter by tags in memory (jsonb array search is complex)
      let flags = rows.map(rowToFlag);
      if (query.tags && query.tags.length > 0) {
        flags = flags.filter((f) => f.tags.some((t) => query.tags!.includes(t)));
      }

      return { flags, total };
    });
  }
}

// =============================================================================
// POSTGRESQL SITE OVERRIDE STORAGE
// =============================================================================

/**
 * PostgreSQL site override storage implementation
 */
export class PgSiteOverrideStorage implements ISiteOverrideStorage {
  async getForSite(siteId: string): Promise<SiteFeatureOverride[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(siteFeatureOverrides).where(eq(siteFeatureOverrides.siteId, siteId));
      return rows.map(rowToSiteOverride);
    });
  }

  async getForFeature(featureKey: string): Promise<SiteFeatureOverride[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(siteFeatureOverrides).where(eq(siteFeatureOverrides.featureKey, featureKey));
      return rows.map(rowToSiteOverride);
    });
  }

  async get(siteId: string, featureKey: string): Promise<SiteFeatureOverride | null> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(siteFeatureOverrides)
        .where(and(eq(siteFeatureOverrides.siteId, siteId), eq(siteFeatureOverrides.featureKey, featureKey)))
        .limit(1);
      return rows.length > 0 ? rowToSiteOverride(rows[0]) : null;
    });
  }

  async set(override: Omit<SiteFeatureOverride, "createdAt" | "updatedAt">): Promise<SiteFeatureOverride> {
    return withCircuitBreaker(async () => {
      const now = new Date();

      // Upsert
      const [row] = await db
        .insert(siteFeatureOverrides)
        .values({
          siteId: override.siteId,
          featureKey: override.featureKey,
          enabled: override.enabled,
          reason: override.reason,
          createdBy: override.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [siteFeatureOverrides.siteId, siteFeatureOverrides.featureKey],
          set: {
            enabled: override.enabled,
            reason: override.reason,
            updatedAt: now,
          },
        } as any)
        .returning();

      return rowToSiteOverride(row);
    });
  }

  async delete(siteId: string, featureKey: string): Promise<boolean> {
    return withCircuitBreaker(async () => {
      const result = await db
        .delete(siteFeatureOverrides)
        .where(and(eq(siteFeatureOverrides.siteId, siteId), eq(siteFeatureOverrides.featureKey, featureKey)));
      return (result.rowCount ?? 0) > 0;
    });
  }

  async deleteAllForSite(siteId: string): Promise<number> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(siteFeatureOverrides).where(eq(siteFeatureOverrides.siteId, siteId));
      return result.rowCount ?? 0;
    });
  }

  async deleteAllForFeature(featureKey: string): Promise<number> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(siteFeatureOverrides).where(eq(siteFeatureOverrides.featureKey, featureKey));
      return result.rowCount ?? 0;
    });
  }
}

// =============================================================================
// POSTGRESQL USER OVERRIDE STORAGE
// =============================================================================

/**
 * PostgreSQL user override storage implementation
 */
export class PgUserOverrideStorage implements IUserOverrideStorage {
  async getForUser(userId: string): Promise<UserFeatureOverride[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(userFeatureOverrides).where(eq(userFeatureOverrides.userId, userId));
      return rows.map(rowToUserOverride);
    });
  }

  async getForFeature(featureKey: string): Promise<UserFeatureOverride[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(userFeatureOverrides).where(eq(userFeatureOverrides.featureKey, featureKey));
      return rows.map(rowToUserOverride);
    });
  }

  async get(userId: string, featureKey: string): Promise<UserFeatureOverride | null> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(userFeatureOverrides)
        .where(and(eq(userFeatureOverrides.userId, userId), eq(userFeatureOverrides.featureKey, featureKey)))
        .limit(1);
      return rows.length > 0 ? rowToUserOverride(rows[0]) : null;
    });
  }

  async set(override: Omit<UserFeatureOverride, "createdAt">): Promise<UserFeatureOverride> {
    return withCircuitBreaker(async () => {
      const now = new Date();

      const [row] = await db
        .insert(userFeatureOverrides)
        .values({
          userId: override.userId,
          featureKey: override.featureKey,
          enabled: override.enabled,
          reason: override.reason,
          expiresAt: override.expiresAt ? new Date(override.expiresAt) : undefined,
          createdBy: override.createdBy,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [userFeatureOverrides.userId, userFeatureOverrides.featureKey],
          set: {
            enabled: override.enabled,
            reason: override.reason,
            expiresAt: override.expiresAt ? new Date(override.expiresAt) : null,
          },
        } as any)
        .returning();

      return rowToUserOverride(row);
    });
  }

  async delete(userId: string, featureKey: string): Promise<boolean> {
    return withCircuitBreaker(async () => {
      const result = await db
        .delete(userFeatureOverrides)
        .where(and(eq(userFeatureOverrides.userId, userId), eq(userFeatureOverrides.featureKey, featureKey)));
      return (result.rowCount ?? 0) > 0;
    });
  }

  async deleteExpired(): Promise<number> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(userFeatureOverrides).where(lte(userFeatureOverrides.expiresAt, new Date()));
      return result.rowCount ?? 0;
    });
  }

  async deleteAllForUser(userId: string): Promise<number> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(userFeatureOverrides).where(eq(userFeatureOverrides.userId, userId));
      return result.rowCount ?? 0;
    });
  }

  async deleteAllForFeature(featureKey: string): Promise<number> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(userFeatureOverrides).where(eq(userFeatureOverrides.featureKey, featureKey));
      return result.rowCount ?? 0;
    });
  }
}

// =============================================================================
// POSTGRESQL USAGE STATS STORAGE
// =============================================================================

/**
 * PostgreSQL usage statistics storage implementation
 */
export class PgUsageStatsStorage implements IUsageStatsStorage {
  private pendingEvaluations: Array<{
    featureKey: string;
    enabled: boolean;
    userId?: string;
    siteId?: string;
    evaluationTimeMs: number;
    error?: boolean;
    timestamp: Date;
  }> = [];

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
    return withCircuitBreaker(async () => {
      const periodStart = this.getPeriodStart(new Date(), period);

      const rows = await db
        .select()
        .from(featureUsageStats)
        .where(
          and(
            eq(featureUsageStats.featureKey, featureKey),
            eq(featureUsageStats.period, period),
            eq(featureUsageStats.periodStart, periodStart)
          )
        )
        .limit(1);

      return rows.length > 0 ? rowToUsageStats(rows[0]) : null;
    });
  }

  async getStatsHistory(
    featureKey: string,
    period: "hour" | "day" | "week" | "month",
    limit: number = 24
  ): Promise<FeatureUsageStats[]> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(featureUsageStats)
        .where(and(eq(featureUsageStats.featureKey, featureKey), eq(featureUsageStats.period, period)))
        .orderBy(desc(featureUsageStats.periodStart))
        .limit(limit);

      return rows.map(rowToUsageStats);
    });
  }

  async getTopFeatures(
    period: "hour" | "day" | "week" | "month",
    limit: number = 10
  ): Promise<Array<{ featureKey: string; evaluations: number }>> {
    return withCircuitBreaker(async () => {
      const periodStart = this.getPeriodStart(new Date(), period);

      const rows = await db
        .select({
          featureKey: featureUsageStats.featureKey,
          evaluations: featureUsageStats.evaluations,
        })
        .from(featureUsageStats)
        .where(and(eq(featureUsageStats.period, period), eq(featureUsageStats.periodStart, periodStart)))
        .orderBy(desc(featureUsageStats.evaluations))
        .limit(limit);

      return rows;
    });
  }

  async aggregateStats(): Promise<void> {
    if (this.pendingEvaluations.length === 0) return;

    const evals = [...this.pendingEvaluations];
    this.pendingEvaluations = [];

    await withCircuitBreaker(async () => {
      const periods: Array<"hour" | "day" | "week" | "month"> = ["hour", "day"];

      for (const period of periods) {
        // Group by feature and period
        const grouped = new Map<string, typeof evals>();

        for (const eval_ of evals) {
          const periodStart = this.getPeriodStart(eval_.timestamp, period);
          const key = `${eval_.featureKey}:${periodStart.toISOString()}`;

          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key)!.push(eval_);
        }

        // Upsert aggregated stats
        for (const [key, groupEvals] of grouped) {
          const [featureKey] = key.split(":");
          const periodStart = this.getPeriodStart(groupEvals[0].timestamp, period);

          let evaluations = 0;
          let enabledEvaluations = 0;
          let disabledEvaluations = 0;
          let errors = 0;
          let totalTime = 0;
          const userIds = new Set<string>();

          for (const e of groupEvals) {
            evaluations++;
            if (e.enabled) enabledEvaluations++;
            else disabledEvaluations++;
            if (e.error) errors++;
            totalTime += e.evaluationTimeMs;
            if (e.userId) userIds.add(e.userId);
          }

          const avgTime = Math.round(totalTime / evaluations);

          await db
            .insert(featureUsageStats)
            .values({
              featureKey,
              period,
              periodStart,
              evaluations,
              enabledEvaluations,
              disabledEvaluations,
              uniqueUsers: userIds.size,
              evaluationErrors: errors,
              avgEvaluationTimeMs: avgTime,
            })
            .onConflictDoUpdate({
              target: [featureUsageStats.featureKey, featureUsageStats.period, featureUsageStats.periodStart],
              set: {
                evaluations: sql`${featureUsageStats.evaluations} + ${evaluations}`,
                enabledEvaluations: sql`${featureUsageStats.enabledEvaluations} + ${enabledEvaluations}`,
                disabledEvaluations: sql`${featureUsageStats.disabledEvaluations} + ${disabledEvaluations}`,
                evaluationErrors: sql`${featureUsageStats.evaluationErrors} + ${errors}`,
              },
            } as any);
        }
      }
    });

    log.debug({ count: evals.length }, "Aggregated feature flag stats");
  }

  async cleanup(retentionDays: number): Promise<number> {
    return withCircuitBreaker(async () => {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const result = await db.delete(featureUsageStats).where(lte(featureUsageStats.periodStart, cutoff));
      return result.rowCount ?? 0;
    });
  }

  private getPeriodStart(date: Date, period: "hour" | "day" | "week" | "month"): Date {
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

    return d;
  }
}

// =============================================================================
// POSTGRESQL ROLLOUT HISTORY STORAGE
// =============================================================================

/**
 * PostgreSQL rollout history storage implementation
 */
export class PgRolloutHistoryStorage implements IRolloutHistoryStorage {
  async record(event: Omit<RolloutEvent, "id" | "timestamp">): Promise<RolloutEvent> {
    return withCircuitBreaker(async () => {
      const [row] = await db
        .insert(featureRolloutHistory)
        .values({
          featureKey: event.featureKey,
          eventType: event.eventType,
          previousValue: event.previousValue,
          newValue: event.newValue,
          siteId: event.siteId,
          userId: event.userId,
          performedBy: event.performedBy,
          reason: event.reason,
          timestamp: new Date(),
        })
        .returning();

      return rowToRolloutEvent(row);
    });
  }

  async getForFeature(featureKey: string, limit: number = 100): Promise<RolloutEvent[]> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(featureRolloutHistory)
        .where(eq(featureRolloutHistory.featureKey, featureKey))
        .orderBy(desc(featureRolloutHistory.timestamp))
        .limit(limit);

      return rows.map(rowToRolloutEvent);
    });
  }

  async getForSite(siteId: string, limit: number = 100): Promise<RolloutEvent[]> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(featureRolloutHistory)
        .where(eq(featureRolloutHistory.siteId, siteId))
        .orderBy(desc(featureRolloutHistory.timestamp))
        .limit(limit);

      return rows.map(rowToRolloutEvent);
    });
  }

  async getRecent(limit: number = 100): Promise<RolloutEvent[]> {
    return withCircuitBreaker(async () => {
      const rows = await db
        .select()
        .from(featureRolloutHistory)
        .orderBy(desc(featureRolloutHistory.timestamp))
        .limit(limit);

      return rows.map(rowToRolloutEvent);
    });
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
    return withCircuitBreaker(async () => {
      const conditions = [];

      if (query.featureKey) {
        conditions.push(eq(featureRolloutHistory.featureKey, query.featureKey));
      }
      if (query.siteId) {
        conditions.push(eq(featureRolloutHistory.siteId, query.siteId));
      }
      if (query.userId) {
        conditions.push(eq(featureRolloutHistory.userId, query.userId));
      }
      if (query.eventType) {
        conditions.push(eq(featureRolloutHistory.eventType, query.eventType));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(featureRolloutHistory)
        .where(whereClause);
      const total = Number(countResult[0]?.count ?? 0);

      // Get paginated results
      let queryBuilder = db
        .select()
        .from(featureRolloutHistory)
        .where(whereClause)
        .orderBy(desc(featureRolloutHistory.timestamp));

      if (query.offset) {
        queryBuilder = queryBuilder.offset(query.offset) as typeof queryBuilder;
      }
      if (query.limit) {
        queryBuilder = queryBuilder.limit(query.limit) as typeof queryBuilder;
      }

      const rows = await queryBuilder;

      return { events: rows.map(rowToRolloutEvent), total };
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create PostgreSQL storage instances
 */
export function createPgStorage(): {
  flags: IFeatureFlagStorage;
  siteOverrides: ISiteOverrideStorage;
  userOverrides: IUserOverrideStorage;
  usageStats: IUsageStatsStorage;
  rolloutHistory: IRolloutHistoryStorage;
} {
  return {
    flags: new PgFeatureFlagStorage(),
    siteOverrides: new PgSiteOverrideStorage(),
    userOverrides: new PgUserOverrideStorage(),
    usageStats: new PgUsageStatsStorage(),
    rolloutHistory: new PgRolloutHistoryStorage(),
  };
}
