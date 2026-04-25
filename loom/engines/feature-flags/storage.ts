/**
 * Drizzle-backed implementation of vendor/02-feature-flags's
 * IFeatureFlagStorage.
 *
 * Round-trip caveats — vendor's `FeatureFlag` type has more fields
 * than our SPEC §4.7-derived schema stores. We persist the SPEC core
 * (key, name, description, category, globallyEnabled, defaultState,
 * percentageRollout, targetingRules, dependencies, timestamps) plus
 * the four pragmatic additions baked into the migration (toggleable,
 * tags, owner, sunsetDate). The vendor extras NOT persisted are:
 *
 *   - abTestConfig, documentationUrl, issueKey, introducedInVersion,
 *     lastModifiedBy, dependents, changeHistory
 *
 * `dependents` is derivable from other flags' `dependencies`. The
 * adapter returns `[]` and leaves derivation to a caller that cares
 * (typically the dependency-resolver in vendor/02).
 *
 * `changeHistory` always returns `[]`; the audit trail lives in the
 * separate feature_rollout_history table managed by
 * IRolloutHistoryStorage. Admin UIs that want history must query that
 * storage directly rather than reading flag.changeHistory.
 *
 * `description`: vendor's Zod requires a non-null string. Our DB
 * column allows NULL. NULL is mapped to "" on read so vendor's
 * validators don't trip.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbHandle } from "../../core/db";
import type { FeatureFlag } from "../../vendor/02-feature-flags/src/shared-types";
import type { IFeatureFlagStorage } from "../../vendor/02-feature-flags/src/types";
import {
  featureFlags,
  type FeatureFlagRow,
  type NewFeatureFlagRow,
} from "./schema";

function rowToFlag(row: FeatureFlagRow): FeatureFlag {
  return {
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    // Vendor's category is a string enum; we cast at the boundary
    // because the DB stores it as plain TEXT for forward-compat.
    category: row.category as FeatureFlag["category"],
    globallyEnabled: row.globallyEnabled,
    toggleable: row.toggleable,
    defaultState: row.defaultState,
    percentageRollout:
      (row.percentageRollout as FeatureFlag["percentageRollout"]) ?? undefined,
    targetingRules:
      (row.targetingRules as FeatureFlag["targetingRules"]) ?? [],
    dependencies:
      (row.dependencies as FeatureFlag["dependencies"]) ?? [],
    dependents: [],
    tags: (row.tags as string[]) ?? [],
    owner: row.owner ?? undefined,
    sunsetDate: row.sunsetDate?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    changeHistory: [],
  };
}

/**
 * Project a partial FeatureFlag onto the columnar shape. Drops the
 * fields we don't persist silently — caller hands us vendor's full
 * type and we keep only what feature_flags has.
 */
function flagToRow(
  flag: Partial<FeatureFlag>,
): Partial<NewFeatureFlagRow> {
  const out: Partial<NewFeatureFlagRow> = {};
  if (flag.key !== undefined) out.key = flag.key;
  if (flag.name !== undefined) out.name = flag.name;
  if (flag.description !== undefined) out.description = flag.description;
  if (flag.category !== undefined) out.category = flag.category;
  if (flag.globallyEnabled !== undefined)
    out.globallyEnabled = flag.globallyEnabled;
  if (flag.toggleable !== undefined) out.toggleable = flag.toggleable;
  if (flag.defaultState !== undefined) out.defaultState = flag.defaultState;
  if (flag.percentageRollout !== undefined)
    out.percentageRollout = flag.percentageRollout;
  if (flag.targetingRules !== undefined)
    out.targetingRules = flag.targetingRules;
  if (flag.dependencies !== undefined) out.dependencies = flag.dependencies;
  if (flag.tags !== undefined) out.tags = flag.tags;
  if (flag.owner !== undefined) out.owner = flag.owner;
  if (flag.sunsetDate !== undefined) {
    out.sunsetDate = flag.sunsetDate ? new Date(flag.sunsetDate) : null;
  }
  return out;
}

export function createDrizzleFeatureFlagStorage(
  handle: DbHandle,
): IFeatureFlagStorage {
  const db = handle.db;

  const storage: IFeatureFlagStorage = {
    async getAll() {
      const rows = await db.select().from(featureFlags);
      return rows.map(rowToFlag);
    },

    async getByKey(key) {
      const rows = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, key))
        .limit(1);
      return rows[0] ? rowToFlag(rows[0]) : null;
    },

    async getByKeys(keys) {
      if (keys.length === 0) return [];
      const rows = await db
        .select()
        .from(featureFlags)
        .where(inArray(featureFlags.key, keys));
      return rows.map(rowToFlag);
    },

    async getByCategory(category) {
      const rows = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.category, category));
      return rows.map(rowToFlag);
    },

    async create(flag) {
      const row = flagToRow(flag as Partial<FeatureFlag>);
      if (!row.key) throw new Error("create: key required");
      if (!row.name) throw new Error("create: name required");
      const inserted = await db
        .insert(featureFlags)
        .values(row as NewFeatureFlagRow)
        .returning();
      return rowToFlag(inserted[0]);
    },

    async update(key, updates) {
      const row = flagToRow(updates);
      // No-op update — Drizzle rejects empty SET clauses. Just return
      // current state so the contract ("returns updated flag or null
      // if not found") holds regardless.
      if (Object.keys(row).length === 0) {
        return storage.getByKey(key);
      }
      // Always bump updated_at; callers should not be in charge of it.
      row.updatedAt = new Date();
      const updated = await db
        .update(featureFlags)
        .set(row)
        .where(eq(featureFlags.key, key))
        .returning();
      return updated[0] ? rowToFlag(updated[0]) : null;
    },

    async delete(key) {
      const result = await db
        .delete(featureFlags)
        .where(eq(featureFlags.key, key))
        .returning({ key: featureFlags.key });
      return result.length > 0;
    },

    async bulkEnable(keys) {
      if (keys.length === 0) return 0;
      // Only flip flags that allow toggling. Core flags
      // (toggleable=false) are silently skipped, matching vendor/02's
      // in-memory behavior.
      const result = await db
        .update(featureFlags)
        .set({ globallyEnabled: true, updatedAt: new Date() })
        .where(
          and(
            inArray(featureFlags.key, keys),
            eq(featureFlags.toggleable, true),
          ),
        )
        .returning({ key: featureFlags.key });
      return result.length;
    },

    async bulkDisable(keys) {
      if (keys.length === 0) return 0;
      const result = await db
        .update(featureFlags)
        .set({ globallyEnabled: false, updatedAt: new Date() })
        .where(
          and(
            inArray(featureFlags.key, keys),
            eq(featureFlags.toggleable, true),
          ),
        )
        .returning({ key: featureFlags.key });
      return result.length;
    },

    async bulkDelete(keys) {
      if (keys.length === 0) return 0;
      const result = await db
        .delete(featureFlags)
        .where(inArray(featureFlags.key, keys))
        .returning({ key: featureFlags.key });
      return result.length;
    },

    async search(query) {
      // Naive: load all, filter in JS. Acceptable while loom has 10s
      // of flags; rewrite with parameterized SQL once the count grows.
      // Postgres's JSONB-array containment makes the tags filter
      // expressible at the SQL layer when needed.
      let all = await db.select().from(featureFlags);

      if (query.search) {
        const s = query.search.toLowerCase();
        all = all.filter(
          (r) =>
            r.key.toLowerCase().includes(s) ||
            r.name.toLowerCase().includes(s) ||
            (r.description?.toLowerCase().includes(s) ?? false),
        );
      }
      if (query.categories && query.categories.length > 0) {
        all = all.filter((r) => query.categories!.includes(r.category));
      }
      if (query.tags && query.tags.length > 0) {
        all = all.filter((r) => {
          const tags = (r.tags as string[]) ?? [];
          return tags.some((t) => query.tags!.includes(t));
        });
      }
      if (query.enabled !== undefined) {
        all = all.filter((r) => r.globallyEnabled === query.enabled);
      }
      if (query.owner) {
        all = all.filter((r) => r.owner === query.owner);
      }

      const total = all.length;
      const offset = query.offset ?? 0;
      const limit = query.limit ?? total;
      const slice = all.slice(offset, offset + limit);
      return { flags: slice.map(rowToFlag), total };
    },
  };

  return storage;
}

// Suppress unused-import warning when sql helper isn't used in a
// trimmed build. Keeping it here so future filter optimizations can
// pivot to parameterized SQL without re-adding the import.
void sql;
