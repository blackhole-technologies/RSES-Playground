/**
 * Drizzle schemas for the auth module's three tables: users, sessions,
 * invite_codes. Columns match SPEC §4.1 and the raw SQL in
 * ./migrations/0001_auth_init.sql line-for-line.
 *
 * Deliberately minimal — this file declares column shapes only. Unique
 * constraints, partial indexes, and functional (lower()) indexes live in
 * the raw SQL migration, not here. Reasons:
 *
 *   1. Drizzle 0.36's DSL for functional indexes (`lower(col)`) is
 *      awkward and under-documented; writing them in SQL keeps the
 *      migration legible and the behavior unambiguous.
 *   2. We apply migrations from hand-written SQL files (not via
 *      `drizzle-kit generate`), so schema.ts is not the source of truth
 *      for DDL — the SQL is. Putting indexes here would suggest
 *      otherwise and invite drift.
 *
 * What Drizzle does give us: query-builder ergonomics, `$inferSelect` /
 * `$inferInsert` types for application code, and compile-time column-name
 * checks.
 */

import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Reserved per SPEC §4.1 — not exposed in MVP. Default false so it's
  // safe to ignore at read-time.
  profilePublic: boolean("profile_public").notNull().default(false),
  inviteCodeUsed: text("invite_code_used"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  disabled: boolean("disabled").notNull().default(false),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cookie: text("cookie").notNull().unique(),
  // Absolute expiry: `created_at + 90 days`, enforced by the caller.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // SET NULL (not CASCADE) preserves the invite_codes row for audit even
  // after the consumer user is deleted — the code stays uniquely-consumed
  // so admins cannot accidentally reissue it.
  consumedBy: uuid("consumed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
