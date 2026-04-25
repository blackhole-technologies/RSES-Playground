/**
 * Drizzle schemas for core (non-module) tables. Currently just
 * system_settings — the singleton row that holds bootstrap state and
 * deployment-wide policy knobs.
 *
 * `_migrations` is omitted: the migration runner manages it directly
 * via raw SQL, never through Drizzle, so a schema declaration would
 * just be dead-weight.
 *
 * Same convention as modules/auth/schema.ts: column shapes only.
 * Indexes / CHECK constraints / DEFAULTs live in
 * core/migrations/0001_core_init.sql, which is the source of truth
 * for DDL.
 */

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemSettings = pgTable("system_settings", {
  // SPEC §4.1 says id INT pk default 1; the actual core migration
  // uses key TEXT pk default 'default' (the previous handoff's
  // deviation, kept for forward compat).
  key: text("key").primaryKey(),
  registrationMode: text("registration_mode").notNull().default("disabled"),
  bootstrapTokenHash: text("bootstrap_token_hash"),
  bootstrapTokenConsumedAt: timestamp("bootstrap_token_consumed_at", {
    withTimezone: true,
  }),
  defaultRateLimitPerMin: integer("default_rate_limit_per_min")
    .notNull()
    .default(60),
  retentionClassificationLogDays: integer("retention_classification_log_days")
    .notNull()
    .default(30),
  retentionSoftDeletedDays: integer("retention_soft_deleted_days")
    .notNull()
    .default(30),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SystemSettingsRow = typeof systemSettings.$inferSelect;
