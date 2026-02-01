/**
 * @file cache-service.ts
 * @description Cache service adapter for site-scoped caching
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

import type { ScopedCache } from "../../multisite/types";
import type { CacheService } from "../../multisite/site/site-context";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("cache-service-adapter");

/**
 * In-memory cache store.
 * In production, this would be backed by Redis.
 */
const memoryCache = new Map<string, { value: unknown; expiresAt: number | null }>();

/**
 * Cleanup interval for expired cache entries.
 */
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Starts the cache cleanup interval.
 */
function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, "Cleaned expired cache entries");
    }
  }, 60000); // Clean every minute
}

/**
 * Creates a CacheService adapter that provides site-scoped caching.
 */
export function createCacheServiceAdapter(): CacheService {
  // Start cleanup on first use
  startCleanup();

  return {
    createScopedCache(siteId: string): ScopedCache {
      const prefix = `site:${siteId}:`;

      return {
        async get<T = unknown>(key: string): Promise<T | null> {
          const fullKey = prefix + key;
          const entry = memoryCache.get(fullKey);

          if (!entry) {
            return null;
          }

          // Check expiration
          if (entry.expiresAt && entry.expiresAt < Date.now()) {
            memoryCache.delete(fullKey);
            return null;
          }

          return entry.value as T;
        },

        async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
          const fullKey = prefix + key;
          const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;

          memoryCache.set(fullKey, { value, expiresAt });
          log.debug({ key: fullKey, ttl: ttlSeconds }, "Cache set");
        },

        async delete(key: string): Promise<void> {
          const fullKey = prefix + key;
          memoryCache.delete(fullKey);
          log.debug({ key: fullKey }, "Cache delete");
        },

        async deletePattern(pattern: string): Promise<number> {
          const fullPattern = prefix + pattern;
          const regex = new RegExp(
            "^" + fullPattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
          );

          let deleted = 0;
          for (const key of memoryCache.keys()) {
            if (regex.test(key)) {
              memoryCache.delete(key);
              deleted++;
            }
          }

          log.debug({ pattern: fullPattern, deleted }, "Cache delete pattern");
          return deleted;
        },

        async invalidateAll(): Promise<void> {
          let deleted = 0;
          for (const key of memoryCache.keys()) {
            if (key.startsWith(prefix)) {
              memoryCache.delete(key);
              deleted++;
            }
          }

          log.debug({ siteId, deleted }, "Cache invalidate all");
        },
      };
    },
  };
}

/**
 * Gets cache statistics.
 */
export function getCacheStats(): {
  size: number;
  sites: number;
  memoryUsage: number;
} {
  const sites = new Set<string>();

  for (const key of memoryCache.keys()) {
    const match = key.match(/^site:([^:]+):/);
    if (match) {
      sites.add(match[1]);
    }
  }

  // Rough memory estimate
  let memoryUsage = 0;
  for (const [key, entry] of memoryCache.entries()) {
    memoryUsage += key.length * 2; // String chars are ~2 bytes
    memoryUsage += JSON.stringify(entry.value).length * 2;
  }

  return {
    size: memoryCache.size,
    sites: sites.size,
    memoryUsage,
  };
}

/**
 * Clears all cache entries.
 */
export function clearAllCache(): void {
  memoryCache.clear();
  log.info("All cache cleared");
}

/**
 * Stops the cleanup interval.
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
