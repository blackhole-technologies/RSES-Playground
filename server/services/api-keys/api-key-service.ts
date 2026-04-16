/**
 * @file api-key-service.ts
 * @description API Key Management Service
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Provides secure API key generation, validation, and management.
 * Keys are hashed using SHA-256 before storage.
 */

import { eq, and, isNull, or, gt, lte, sql } from "drizzle-orm";
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
// Tenant-scoping helpers — required for M1.8a. `scoped(siteId)` covers
// simple updates by business key; `withDbSiteScope(siteId, fn)` is the
// escape hatch for Drizzle query shapes that scoped() does not cover
// (insert-returning, orderBy/limit). See
// `migrations/0006_add_api_keys_rls_policies.sql` for the policies that
// depend on this discipline and the note on validateKey's intentional
// cross-tenant posture.
import { scoped, withDbSiteScope } from "../../lib/tenant-scoped";

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
// PRIVATE: API key auth-lookup bypass scope
// ============================================================================

/**
 * Run a Drizzle query inside a transaction that has `app.api_key_lookup`
 * set to 'true', so the bypass SELECT policy added by migration 0007
 * grants cross-tenant SELECT access on `api_keys`. Used exclusively by
 * `validateKey` to resolve the "I have a hash but no site context"
 * problem documented in `migrations/0006_add_api_keys_rls_policies.sql`.
 *
 * # Scope of the bypass
 *
 * The `app.api_key_lookup` flag is set via `set_config(..., true)` with
 * the third-arg `is_local = true`, so it is transaction-scoped and
 * auto-clears on COMMIT/ROLLBACK. The flag ONLY affects the SELECT
 * policy added in 0007. The existing INSERT/UPDATE/DELETE policies
 * from 0006 still require strict `site_id = current_setting(
 * 'app.current_site_id', true)` — which is intentionally NOT set here,
 * so any accidental write inside this scope is blocked by RLS.
 *
 * # Why a private helper in this file, not a public export from
 * # `server/lib/tenant-scoped.ts`
 *
 * The bypass flag is a security-relevant side channel. Keeping the
 * helper colocated with its ONE legitimate caller (validateKey below)
 * means a future reviewer can grep for `app.api_key_lookup` and find
 * exactly one write site plus one SELECT policy — the bypass has
 * nowhere else to hide. Exporting it from `tenant-scoped.ts` would
 * advertise the bypass surface to the whole codebase and make audit
 * harder.
 *
 * # Why the callback receives a Drizzle-shaped `tx`
 *
 * The caller wants to write a normal Drizzle `select().from(apiKeys)`
 * chain inside the scope. Passing the tx through as `typeof db`
 * preserves the full static typing and the dev-query guard (M1.3,
 * STATUS v8) remains transparent because the guard only wraps the
 * top-level `db` export — a tx yielded by `db.transaction()` is
 * never wrapped, so direct `tx.select().from(apiKeys)` works without
 * the guard throwing in development.
 */
async function withApiKeyLookupScope<T>(
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.api_key_lookup', 'true', true)`
    );
    // Cast is structural — tx and db share the Drizzle query-builder
    // shape. The cast exists purely so `fn`'s parameter type stays
    // `typeof db` for call-site ergonomics.
    return fn(tx as unknown as typeof db);
  });
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

    // Per-site insert with returning() — scoped() does not surface the
    // returned row, so we drop to withDbSiteScope. The session variable
    // is set on the transaction and the Phase B-style policies in
    // migration 0006 accept the insert because the payload site_id
    // matches the bound session var.
    const row = await withCircuitBreaker(async () =>
      withDbSiteScope(siteId, async (tx) => {
        const txDb = tx as unknown as typeof db;
        const [inserted] = await txDb
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
          .returning();
        return inserted;
      })
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
   *
   * # Cross-tenant lookup model (resolved in migration 0007)
   *
   * The SDK auth flow arrives at the server with an opaque API key
   * and no site context. The owning site is learned only AFTER the
   * hash lookup, so this SELECT fundamentally cannot be bound to a
   * specific `app.current_site_id`. Migration 0006 added strict
   * equality policies that would cause this lookup to return zero
   * rows under a non-superuser DB role. Migration 0007 resolves the
   * problem by adding a 5th SELECT policy on `api_keys` that grants
   * access when a dedicated `app.api_key_lookup` session variable is
   * set to 'true'. This helper wraps the query in a transaction that
   * sets that flag, and `validateKey` is the ONLY caller.
   *
   * Security properties:
   *
   *   - The bypass flag is set via `set_config('app.api_key_lookup',
   *     'true', true)` which is transaction-local and auto-clears on
   *     COMMIT/ROLLBACK. No cross-transaction leakage.
   *   - The value 'true' is hardcoded in `withApiKeyLookupScope`. No
   *     path lets a request parameter influence the flag.
   *   - The bypass ONLY affects SELECT. INSERT/UPDATE/DELETE on
   *     `api_keys` still require `site_id = current_setting('app.
   *     current_site_id', true)` — accidental writes inside this
   *     scope (which does NOT set `app.current_site_id`) are blocked
   *     by RLS.
   *   - The helper is private to this file; grep for `app.api_key_lookup`
   *     returns exactly one write site (inside `withApiKeyLookupScope`)
   *     and one SELECT policy (in migration 0007).
   */
  async validateKey(key: string): Promise<ApiKeyInfo | null> {
    if (!key || !key.startsWith("ff_")) {
      return null;
    }

    const keyPrefix = getKeyPrefix(key);
    const keyHash = hashKey(key);
    const now = new Date();

    // Find key by prefix first (quick lookup), then verify hash. Runs
    // inside withApiKeyLookupScope so the Phase B-style strict SELECT
    // policy is supplemented by the 0007 bypass policy for this one
    // call path. Uses `tx` (not `db`) so the dev-query guard stays
    // transparent — tx objects are not Proxy-wrapped.
    const rows = await withCircuitBreaker(async () =>
      withApiKeyLookupScope(async (tx) =>
        tx
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
      )
    );

    if (rows.length === 0) {
      log.debug({ keyPrefix }, "API key validation failed");
      return null;
    }

    const row = rows[0];

    // Update lastUsedAt asynchronously (don't block response). We
    // know the row's siteId now, so the downstream update runs
    // through the scoped path with strict site binding — only the
    // lookup needed the bypass, not the write.
    this.updateLastUsed(row.id, row.siteId).catch((err) => {
      log.error({ err, keyId: row.id }, "Failed to update lastUsedAt");
    });

    return rowToInfo(row);
  }

  /**
   * Revoke an API key by id, scoped to the site that owns it.
   *
   * The siteId is required for Layer-3 defense: an admin UI user can
   * only revoke keys belonging to their own site. Under migration 0006
   * this is enforced at the policy level — an UPDATE against a
   * mismatched site_id affects zero rows. Layer-1 route auth still
   * gates who can reach this method at all.
   *
   * @param siteId - Owning site (from the admin's request context)
   * @param keyId  - The key id to revoke
   * @returns true if revoked, false if not found or not owned by siteId
   */
  async revokeKey(siteId: string, keyId: number): Promise<boolean> {
    log.info({ siteId, keyId }, "Revoking API key");

    // Per-site update with rowCount — drop to withDbSiteScope because
    // scoped().update does not surface a rowCount/returning() result.
    // The explicit `and(eq(id), isNull(revokedAt))` predicate is
    // preserved; withDbSiteScope layers the session variable under it.
    const result = await withCircuitBreaker(async () =>
      withDbSiteScope(siteId, async (tx) => {
        const txDb = tx as unknown as typeof db;
        return txDb
          .update(apiKeys)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(apiKeys.siteId, siteId),
              eq(apiKeys.id, keyId),
              isNull(apiKeys.revokedAt)
            )
          )
          .returning({ id: apiKeys.id });
      })
    );

    const revoked = result.length > 0;
    if (revoked) {
      log.info({ siteId, keyId }, "API key revoked successfully");
    } else {
      log.warn({ siteId, keyId }, "API key not found, not owned, or already revoked");
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
    // Per-site read with orderBy — scoped().select does not support
    // orderBy, so we drop to withDbSiteScope. The site_id equality
    // in the WHERE clause is preserved so the emitted SQL is explicit
    // about its tenant binding even though RLS would enforce it anyway.
    return withCircuitBreaker(async () =>
      withDbSiteScope(siteId, async (tx) => {
        const txDb = tx as unknown as typeof db;

        const conditions = [eq(apiKeys.siteId, siteId)];
        if (!includeRevoked) {
          conditions.push(isNull(apiKeys.revokedAt));
        }

        const rows = await txDb
          .select()
          .from(apiKeys)
          .where(and(...conditions))
          .orderBy(apiKeys.createdAt);

        return rows.map(rowToSummary);
      })
    );
  }

  /**
   * Get a single API key by id, scoped to its owning site.
   *
   * @param siteId - Owning site (from the admin's request context)
   * @param keyId  - The key id
   * @returns ApiKeySummary or null
   */
  async getKey(siteId: string, keyId: number): Promise<ApiKeySummary | null> {
    const row = await withCircuitBreaker(async () =>
      scoped(siteId).selectOne(apiKeys, { id: keyId })
    );
    return row ? rowToSummary(row as ApiKeyRow) : null;
  }

  /**
   * Update lastUsedAt timestamp. Called asynchronously from validateKey
   * after the cross-tenant hash lookup has resolved the siteId, so the
   * update itself can run through the scoped path (Layer 3 enforcement
   * on the write side, even though the preceding read is intentionally
   * cross-tenant).
   */
  private async updateLastUsed(keyId: number, siteId: string): Promise<void> {
    await scoped(siteId).update(
      apiKeys,
      { id: keyId },
      { lastUsedAt: new Date() }
    );
  }

  /**
   * Clean up expired keys older than retention period.
   *
   * INTENTIONAL CROSS-TENANT — background-job garbage collection of
   * expired keys across every site. Under migration 0006 this must
   * run as a Postgres superuser role, or with a dedicated service
   * role that has NO FORCE RLS on api_keys. The app's per-request DB
   * role must not reach this method, and there is no legitimate
   * request-handler call path that would.
   *
   * Currently not wired to any scheduler in `server/` — grep for
   * `cleanupExpiredKeys` returns only this definition. If a future
   * PR wires it to a cron job, the job configuration must use the
   * admin connection pool, not the request-handler one.
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
