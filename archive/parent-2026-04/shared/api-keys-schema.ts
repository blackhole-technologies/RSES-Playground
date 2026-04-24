/**
 * @file api-keys-schema.ts
 * @description API Keys database schema for secure key storage
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Stores hashed API keys with metadata. Keys are never stored in plaintext.
 * Uses SHA-256 hashing with a prefix for quick lookup.
 */

import { pgTable, text, serial, timestamp, varchar, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

// ============================================================================
// API Keys Table
// ============================================================================

/**
 * API keys for SDK authentication.
 *
 * Security model:
 * - Keys are generated as: ff_{tier}_{32 random chars}
 * - Only the hash is stored, never the plaintext
 * - A short prefix (first 8 chars) is stored for quick lookup
 * - Supports expiration and revocation
 */
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),

  // Key identification (prefix for lookup, hash for verification)
  // Prefix: first 8 chars of key for quick DB lookup
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  // SHA-256 hash of the full key
  keyHash: varchar("key_hash", { length: 64 }).notNull(),

  // Scope
  siteId: varchar("site_id", { length: 64 }).notNull(),

  // Access level
  tier: varchar("tier", { length: 16 }).$type<"starter" | "pro" | "enterprise">().notNull().default("starter"),

  // Granular permissions (e.g., ["read", "evaluate", "write"])
  permissions: text("permissions").array().notNull().default(["read", "evaluate"]),

  // Human-readable name for the key
  name: varchar("name", { length: 128 }).notNull(),

  // Lifecycle
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),

  // Audit
  createdBy: serial("created_by").references(() => users.id),

}, (table) => ({
  // Index on prefix for quick key lookup
  prefixIdx: index("api_keys_prefix_idx").on(table.keyPrefix),
  // Index on siteId for listing keys per site
  siteIdx: index("api_keys_site_idx").on(table.siteId),
  // Unique hash to prevent duplicates
  hashIdx: uniqueIndex("api_keys_hash_idx").on(table.keyHash),
  // Index for finding non-revoked, non-expired keys
  activeIdx: index("api_keys_active_idx").on(table.revokedAt, table.expiresAt),
}));

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type InsertApiKeyRow = typeof apiKeys.$inferInsert;

// ============================================================================
// Zod Schemas
// ============================================================================

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
});

export const apiKeyTierSchema = z.enum(["starter", "pro", "enterprise"]);
export const apiKeyPermissionSchema = z.enum(["read", "evaluate", "write", "admin"]);

// ============================================================================
// Type Definitions
// ============================================================================

/** API key info returned to authenticated requests */
export interface ApiKeyInfo {
  id: number;
  siteId: string;
  tier: "starter" | "pro" | "enterprise";
  permissions: string[];
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

/** API key info for listing (excludes sensitive data) */
export interface ApiKeySummary {
  id: number;
  keyPrefix: string;
  siteId: string;
  tier: "starter" | "pro" | "enterprise";
  permissions: string[];
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  isActive: boolean;
}

/** Result of creating a new API key */
export interface CreateApiKeyResult {
  /** The plaintext key - shown only once */
  key: string;
  /** The key info */
  info: ApiKeySummary;
}
