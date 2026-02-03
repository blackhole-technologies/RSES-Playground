/**
 * @file api-key-service.ts
 * @description API Key Management Service
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Provides secure API key generation, validation, and management.
 * Keys are hashed using SHA-256 before storage.
 */

import { eq, and, isNull, or, gt, lte } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db, withCircuitBreaker } from "../../db";
import {
  apiKeys,
  type ApiKeyRow,
  type ApiKeyInfo,
  type ApiKeySummary,
  type CreateApiKeyResult,
} from "@shared/api-keys-schema";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("api-key-service");

// ============================================================================
// CONSTANTS
// ============================================================================

/** Length of random portion of key */
const KEY_RANDOM_LENGTH = 32;

/** Length of prefix stored for lookup */
const KEY_PREFIX_LENGTH = 8;

/** Default permissions for each tier */
const TIER_PERMISSIONS: Record<string, string[]> = {
  starter: ["read", "evaluate"],
  pro: ["read", "evaluate", "write"],
  enterprise: ["read", "evaluate", "write", "admin"],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a cryptographically secure random string.
 */
function generateRandomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Hash a key using SHA-256.
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extract prefix from key for database lookup.
 */
function getKeyPrefix(key: string): string {
  // Key format: ff_{tier}_{random}
  // Prefix includes the tier identifier for uniqueness
  return key.substring(0, KEY_PREFIX_LENGTH + 7); // "ff_pro_" + 8 chars
}

/**
 * Convert database row to ApiKeySummary.
 */
function rowToSummary(row: ApiKeyRow): ApiKeySummary {
  const now = new Date();
  const isExpired = row.expiresAt ? row.expiresAt <= now : false;
  const isRevoked = row.revokedAt !== null;

  return {
    id: row.id,
    keyPrefix: row.keyPrefix,
    siteId: row.siteId,
    tier: row.tier,
    permissions: row.permissions ?? ["read", "evaluate"],
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    isActive: !isExpired && !isRevoked,
  };
}

/**
 * Convert database row to ApiKeyInfo for authenticated requests.
 */
function rowToInfo(row: ApiKeyRow): ApiKeyInfo {
  return {
    id: row.id,
    siteId: row.siteId,
    tier: row.tier,
    permissions: row.permissions ?? ["read", "evaluate"],
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  };
}

// ============================================================================
// API KEY SERVICE
// ============================================================================

export class ApiKeyService {
  /**
   * Create a new API key.
   *
   * @param siteId - Site the key is scoped to
   * @param tier - Access tier (starter, pro, enterprise)
   * @param name - Human-readable name for the key
   * @param createdBy - User ID who created the key
   * @param options - Additional options (permissions, expiresAt)
   * @returns The plaintext key (shown only once) and key info
   */
  async createKey(
    siteId: string,
    tier: "starter" | "pro" | "enterprise",
    name: string,
    createdBy: number,
    options?: {
      permissions?: string[];
      expiresAt?: Date;
    }
  ): Promise<CreateApiKeyResult> {
    // Generate the key
    const random = generateRandomString(KEY_RANDOM_LENGTH);
    const key = `ff_${tier}_${random}`;
    const keyPrefix = getKeyPrefix(key);
    const keyHash = hashKey(key);

    // Determine permissions
    const permissions = options?.permissions ?? TIER_PERMISSIONS[tier] ?? ["read", "evaluate"];

    log.info({ siteId, tier, name }, "Creating new API key");

    const [row] = await withCircuitBreaker(async () =>
      db
        .insert(apiKeys)
        .values({
          keyPrefix,
          keyHash,
          siteId,
          tier,
          permissions,
          name,
          createdBy,
          expiresAt: options?.expiresAt ?? null,
        })
        .returning()
    );

    log.info({ keyId: row.id, siteId, tier }, "API key created successfully");

    return {
      key, // Plaintext - shown only once
      info: rowToSummary(row),
    };
  }

  /**
   * Validate an API key and return its info.
   *
   * @param key - The plaintext API key
   * @returns ApiKeyInfo if valid, null if invalid/expired/revoked
   */
  async validateKey(key: string): Promise<ApiKeyInfo | null> {
    if (!key || !key.startsWith("ff_")) {
      return null;
    }

    const keyPrefix = getKeyPrefix(key);
    const keyHash = hashKey(key);
    const now = new Date();

    // Find key by prefix first (quick lookup), then verify hash
    const rows = await withCircuitBreaker(async () =>
      db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.keyPrefix, keyPrefix),
            eq(apiKeys.keyHash, keyHash),
            isNull(apiKeys.revokedAt),
            or(
              isNull(apiKeys.expiresAt),
              gt(apiKeys.expiresAt, now)
            )
          )
        )
        .limit(1)
    );

    if (rows.length === 0) {
      log.debug({ keyPrefix }, "API key validation failed");
      return null;
    }

    const row = rows[0];

    // Update lastUsedAt asynchronously (don't block response)
    this.updateLastUsed(row.id).catch((err) => {
      log.error({ err, keyId: row.id }, "Failed to update lastUsedAt");
    });

    return rowToInfo(row);
  }

  /**
   * Revoke an API key.
   *
   * @param keyId - The key ID to revoke
   * @returns true if revoked, false if not found
   */
  async revokeKey(keyId: number): Promise<boolean> {
    log.info({ keyId }, "Revoking API key");

    const result = await withCircuitBreaker(async () =>
      db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, keyId),
            isNull(apiKeys.revokedAt)
          )
        )
        .returning({ id: apiKeys.id })
    );

    const revoked = result.length > 0;
    if (revoked) {
      log.info({ keyId }, "API key revoked successfully");
    } else {
      log.warn({ keyId }, "API key not found or already revoked");
    }

    return revoked;
  }

  /**
   * List all API keys for a site (without exposing hashes).
   *
   * @param siteId - Site to list keys for
   * @param includeRevoked - Whether to include revoked keys
   * @returns Array of ApiKeySummary
   */
  async listKeys(siteId: string, includeRevoked = false): Promise<ApiKeySummary[]> {
    const conditions = [eq(apiKeys.siteId, siteId)];

    if (!includeRevoked) {
      conditions.push(isNull(apiKeys.revokedAt));
    }

    const rows = await withCircuitBreaker(async () =>
      db
        .select()
        .from(apiKeys)
        .where(and(...conditions))
        .orderBy(apiKeys.createdAt)
    );

    return rows.map(rowToSummary);
  }

  /**
   * Get a single API key by ID.
   *
   * @param keyId - The key ID
   * @returns ApiKeySummary or null
   */
  async getKey(keyId: number): Promise<ApiKeySummary | null> {
    const rows = await withCircuitBreaker(async () =>
      db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, keyId))
        .limit(1)
    );

    return rows.length > 0 ? rowToSummary(rows[0]) : null;
  }

  /**
   * Update lastUsedAt timestamp.
   * Called asynchronously after validation.
   */
  private async updateLastUsed(keyId: number): Promise<void> {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyId));
  }

  /**
   * Clean up expired keys older than retention period.
   *
   * @param retentionDays - Days to retain expired keys
   * @returns Number of keys deleted
   */
  async cleanupExpiredKeys(retentionDays: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await withCircuitBreaker(async () =>
      db
        .delete(apiKeys)
        .where(
          and(
            lte(apiKeys.expiresAt, cutoff),
            isNull(apiKeys.revokedAt) // Don't delete revoked keys, keep for audit
          )
        )
        .returning({ id: apiKeys.id })
    );

    log.info({ count: result.length, retentionDays }, "Cleaned up expired API keys");
    return result.length;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ApiKeyService | null = null;

export function getApiKeyService(): ApiKeyService {
  if (!instance) {
    instance = new ApiKeyService();
  }
  return instance;
}

export default ApiKeyService;
