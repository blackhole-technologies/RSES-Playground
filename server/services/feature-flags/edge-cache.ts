/**
 * @file edge-cache.ts
 * @description Redis-based edge caching for feature flag evaluations
 * @phase Phase 2 - Edge Caching
 * @version 0.6.6
 * @created 2026-02-02
 *
 * Provides a high-performance caching layer for feature flag evaluations:
 * - Redis-based distributed cache
 * - WebSocket-triggered invalidation
 * - Configurable TTL per flag/context
 * - Batch operations for efficiency
 * - Graceful degradation when Redis unavailable
 */

import { Redis } from "ioredis";
import crypto from "crypto";
import type { EvaluationContext, EvaluationResult } from "@shared/admin/types";
import type { FeatureFlagEvent } from "./types";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-edge-cache");

// =============================================================================
// TYPES
// =============================================================================

export interface EdgeCacheConfig {
  /** Redis URL (required) */
  redisUrl: string;
  /** Default TTL in seconds (default: 60) */
  defaultTtlSeconds?: number;
  /** TTL for user-specific evaluations (default: 30) */
  userTtlSeconds?: number;
  /** TTL for site-specific evaluations (default: 120) */
  siteTtlSeconds?: number;
  /** Key prefix for namespacing (default: "rses:ff:cache:") */
  keyPrefix?: string;
  /** Enable compression for large values (default: true) */
  enableCompression?: boolean;
  /** Max cache size per key in bytes (default: 10KB) */
  maxValueSize?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  errors: number;
  avgLatencyMs: number;
  lastResetAt: string;
}

interface CachedEvaluation {
  result: EvaluationResult;
  cachedAt: number;
  expiresAt: number;
}

// =============================================================================
// EDGE CACHE SERVICE
// =============================================================================

/**
 * Redis-based edge cache for feature flag evaluations.
 *
 * Provides fast lookups for repeated evaluations with the same context.
 * Automatically invalidates on flag changes via WebSocket events.
 */
export class FeatureFlagEdgeCache {
  private redis: Redis | null = null;
  private config: Required<EdgeCacheConfig>;
  private stats: CacheStats;
  private isConnected = false;
  private latencyBuffer: number[] = [];

  constructor(config: EdgeCacheConfig) {
    this.config = {
      redisUrl: config.redisUrl,
      defaultTtlSeconds: config.defaultTtlSeconds ?? 60,
      userTtlSeconds: config.userTtlSeconds ?? 30,
      siteTtlSeconds: config.siteTtlSeconds ?? 120,
      keyPrefix: config.keyPrefix ?? "rses:ff:cache:",
      enableCompression: config.enableCompression ?? true,
      maxValueSize: config.maxValueSize ?? 10 * 1024, // 10KB
    };

    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      errors: 0,
      avgLatencyMs: 0,
      lastResetAt: new Date().toISOString(),
    };

    this.initializeRedis();
  }

  /**
   * Initialize Redis connection with error handling.
   */
  private initializeRedis(): void {
    try {
      this.redis = new Redis(this.config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 3) return null; // Stop retrying
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
        enableReadyCheck: true,
      });

      this.redis.on("connect", () => {
        this.isConnected = true;
        log.info("Edge cache connected to Redis");
      });

      this.redis.on("error", (err) => {
        this.stats.errors++;
        log.error({ err }, "Edge cache Redis error");
      });

      this.redis.on("close", () => {
        this.isConnected = false;
        log.warn("Edge cache Redis connection closed");
      });

      this.redis.on("reconnecting", () => {
        log.info("Edge cache reconnecting to Redis");
      });

      // Connect
      this.redis.connect().catch((err) => {
        log.error({ err }, "Failed to connect edge cache to Redis");
      });
    } catch (err) {
      log.error({ err }, "Failed to initialize edge cache Redis client");
    }
  }

  /**
   * Generate a cache key from feature key and context.
   */
  private generateCacheKey(featureKey: string, context: EvaluationContext): string {
    // Create a deterministic hash of the context
    const contextHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({
        userId: context.userId,
        siteId: context.siteId,
        userAttributes: context.userAttributes,
        siteAttributes: context.siteAttributes,
      }))
      .digest("hex")
      .substring(0, 16);

    return `${this.config.keyPrefix}${featureKey}:${contextHash}`;
  }

  /**
   * Determine TTL based on context.
   */
  private getTtl(context: EvaluationContext): number {
    if (context.userId) {
      return this.config.userTtlSeconds;
    }
    if (context.siteId) {
      return this.config.siteTtlSeconds;
    }
    return this.config.defaultTtlSeconds;
  }

  /**
   * Get cached evaluation result.
   */
  async get(
    featureKey: string,
    context: EvaluationContext
  ): Promise<EvaluationResult | null> {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    const startTime = Date.now();
    const key = this.generateCacheKey(featureKey, context);

    try {
      const cached = await this.redis.get(key);

      if (!cached) {
        this.stats.misses++;
        return null;
      }

      const parsed: CachedEvaluation = JSON.parse(cached);

      // Check if expired (belt and suspenders with Redis TTL)
      if (parsed.expiresAt < Date.now()) {
        this.stats.misses++;
        await this.redis.del(key);
        return null;
      }

      this.stats.hits++;
      this.recordLatency(Date.now() - startTime);

      return parsed.result;
    } catch (err) {
      this.stats.errors++;
      log.error({ err, key }, "Edge cache get error");
      return null;
    }
  }

  /**
   * Cache an evaluation result.
   */
  async set(
    featureKey: string,
    context: EvaluationContext,
    result: EvaluationResult
  ): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    const key = this.generateCacheKey(featureKey, context);
    const ttl = this.getTtl(context);
    const now = Date.now();

    const cached: CachedEvaluation = {
      result,
      cachedAt: now,
      expiresAt: now + ttl * 1000,
    };

    try {
      const value = JSON.stringify(cached);

      // Check size limit
      if (value.length > this.config.maxValueSize) {
        log.warn({ key, size: value.length }, "Cache value exceeds size limit");
        return false;
      }

      await this.redis.setex(key, ttl, value);
      return true;
    } catch (err) {
      this.stats.errors++;
      log.error({ err, key }, "Edge cache set error");
      return false;
    }
  }

  /**
   * Get multiple cached results in batch.
   */
  async getBatch(
    featureKeys: string[],
    context: EvaluationContext
  ): Promise<Map<string, EvaluationResult>> {
    const results = new Map<string, EvaluationResult>();

    if (!this.isConnected || !this.redis || featureKeys.length === 0) {
      return results;
    }

    const keys = featureKeys.map((fk) => this.generateCacheKey(fk, context));
    const startTime = Date.now();

    try {
      const cached = await this.redis.mget(...keys);

      for (let i = 0; i < cached.length; i++) {
        const value = cached[i];
        if (value) {
          try {
            const parsed: CachedEvaluation = JSON.parse(value);
            if (parsed.expiresAt >= Date.now()) {
              results.set(featureKeys[i], parsed.result);
              this.stats.hits++;
            } else {
              this.stats.misses++;
            }
          } catch {
            this.stats.errors++;
          }
        } else {
          this.stats.misses++;
        }
      }

      this.recordLatency(Date.now() - startTime);
    } catch (err) {
      this.stats.errors++;
      log.error({ err }, "Edge cache batch get error");
    }

    return results;
  }

  /**
   * Cache multiple results in batch.
   */
  async setBatch(
    evaluations: Array<{
      featureKey: string;
      context: EvaluationContext;
      result: EvaluationResult;
    }>
  ): Promise<void> {
    if (!this.isConnected || !this.redis || evaluations.length === 0) {
      return;
    }

    try {
      const pipeline = this.redis.pipeline();
      const now = Date.now();

      for (const { featureKey, context, result } of evaluations) {
        const key = this.generateCacheKey(featureKey, context);
        const ttl = this.getTtl(context);

        const cached: CachedEvaluation = {
          result,
          cachedAt: now,
          expiresAt: now + ttl * 1000,
        };

        const value = JSON.stringify(cached);
        if (value.length <= this.config.maxValueSize) {
          pipeline.setex(key, ttl, value);
        }
      }

      await pipeline.exec();
    } catch (err) {
      this.stats.errors++;
      log.error({ err }, "Edge cache batch set error");
    }
  }

  /**
   * Invalidate cache for a specific feature.
   */
  async invalidate(featureKey: string): Promise<number> {
    if (!this.isConnected || !this.redis) {
      return 0;
    }

    try {
      const pattern = `${this.config.keyPrefix}${featureKey}:*`;
      const keys = await this.scanKeys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      this.stats.invalidations += deleted;
      log.debug({ featureKey, deleted }, "Cache invalidated for feature");
      return deleted;
    } catch (err) {
      this.stats.errors++;
      log.error({ err, featureKey }, "Edge cache invalidation error");
      return 0;
    }
  }

  /**
   * Invalidate all cache entries.
   */
  async invalidateAll(): Promise<number> {
    if (!this.isConnected || !this.redis) {
      return 0;
    }

    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.scanKeys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      this.stats.invalidations += deleted;
      log.info({ deleted }, "All cache entries invalidated");
      return deleted;
    } catch (err) {
      this.stats.errors++;
      log.error({ err }, "Edge cache full invalidation error");
      return 0;
    }
  }

  /**
   * Handle feature flag events for cache invalidation.
   */
  handleEvent(event: FeatureFlagEvent): void {
    switch (event.type) {
      case "flag_created":
        // No cache to invalidate for new flags
        break;

      case "flag_updated":
      case "flag_enabled":
      case "flag_disabled":
        this.invalidate(event.type === "flag_updated" ? event.flag.key : event.key)
          .catch((err) => log.error({ err }, "Failed to invalidate on flag update"));
        break;

      case "flag_deleted":
        this.invalidate(event.key)
          .catch((err) => log.error({ err }, "Failed to invalidate on flag delete"));
        break;

      case "override_set":
      case "override_deleted":
        const key = event.type === "override_set" ? event.override.featureKey : event.key;
        this.invalidate(key)
          .catch((err) => log.error({ err }, "Failed to invalidate on override change"));
        break;

      case "rollout_changed":
      case "targeting_updated":
        this.invalidate(event.key)
          .catch((err) => log.error({ err }, "Failed to invalidate on rollout/targeting change"));
        break;

      case "cache_invalidated":
        if (event.keys.includes("*")) {
          this.invalidateAll()
            .catch((err) => log.error({ err }, "Failed to invalidate all"));
        } else {
          Promise.all(event.keys.map((k) => this.invalidate(k)))
            .catch((err) => log.error({ err }, "Failed to invalidate multiple keys"));
        }
        break;
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      errors: 0,
      avgLatencyMs: 0,
      lastResetAt: new Date().toISOString(),
    };
    this.latencyBuffer = [];
  }

  /**
   * Check if cache is available.
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Close the cache connection.
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
      log.info("Edge cache connection closed");
    }
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Scan keys matching a pattern (handles large keyspaces).
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    if (!this.redis) return [];

    const keys: string[] = [];
    let cursor = "0";

    do {
      const [nextCursor, scannedKeys] = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;
      keys.push(...scannedKeys);
    } while (cursor !== "0");

    return keys;
  }

  /**
   * Record latency for average calculation.
   */
  private recordLatency(ms: number): void {
    this.latencyBuffer.push(ms);

    // Keep last 100 measurements
    if (this.latencyBuffer.length > 100) {
      this.latencyBuffer.shift();
    }

    // Update average
    this.stats.avgLatencyMs =
      this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length;
  }
}

// =============================================================================
// FACTORY & SINGLETON
// =============================================================================

let edgeCacheInstance: FeatureFlagEdgeCache | null = null;

/**
 * Get the edge cache singleton instance.
 * Returns null if REDIS_URL is not configured.
 */
export function getEdgeCache(config?: Partial<EdgeCacheConfig>): FeatureFlagEdgeCache | null {
  const redisUrl = config?.redisUrl || process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  if (!edgeCacheInstance) {
    edgeCacheInstance = new FeatureFlagEdgeCache({
      ...config,
      redisUrl,
    });
    log.info("Edge cache instance created");
  }

  return edgeCacheInstance;
}

/**
 * Reset the edge cache singleton (for testing).
 */
export async function resetEdgeCache(): Promise<void> {
  if (edgeCacheInstance) {
    await edgeCacheInstance.close();
    edgeCacheInstance = null;
  }
}
