/**
 * Drizzle schemas for the feature-flags engine. Mirrors the SQL in
 * ./migrations/0001_feature_flags_init.sql column-for-column. Indexes
 * and FK actions live in the SQL — schema.ts is for query-builder
 * ergonomics and inferred types only, not DDL truth.
 *
 * Same convention as modules/auth/schema.ts: we do not use
 * drizzle-kit's migration generator, so this file does not need to
 * declare every constraint.
 */

import {
  bigserial,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../modules/auth/schema";

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  globallyEnabled: boolean("globally_enabled").notNull().default(false),
  toggleable: boolean("toggleable").notNull().default(true),
  defaultState: boolean("default_state").notNull().default(false),
  // JSONB blobs are unknown-shaped at the DB layer; the storage adapter
  // narrows them to vendor/02's typed shapes on read.
  percentageRollout: jsonb("percentage_rollout"),
  targetingRules: jsonb("targeting_rules"),
  dependencies: jsonb("dependencies"),
  tags: jsonb("tags").notNull().default([]),
  owner: text("owner"),
  sunsetDate: timestamp("sunset_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const featureRolloutHistory = pgTable("feature_rollout_history", {
  // mode: "number" — bigserial fits in a JS Number until 2^53 rows,
  // which we will not approach in MVP. Switch to "bigint" if that ever
  // changes.
  id: bigserial("id", { mode: "number" }).primaryKey(),
  flagKey: text("flag_key")
    .notNull()
    .references(() => featureFlags.key, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  // SET NULL preserves the audit row even when the actor user is
  // deleted; mirrors invite_codes.consumed_by from Phase 1.
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reason: text("reason"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type NewFeatureFlagRow = typeof featureFlags.$inferInsert;
export type RolloutHistoryRow = typeof featureRolloutHistory.$inferSelect;
export type NewRolloutHistoryRow = typeof featureRolloutHistory.$inferInsert;
