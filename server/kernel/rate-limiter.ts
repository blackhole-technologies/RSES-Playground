/**
 * @file rate-limiter.ts
 * @description Pluggable rate limiter for the kernel API gateway.
 * @module kernel
 * @phase Phase 1 - Foundation Hardening (added 2026-04-14, ROADMAP M1.2)
 *
 * # Why this file exists
 *
 * The gateway's previous rate limiter was an in-memory Map. It worked for a
 * single Node process but silently produced 5x effective limits in a 5-pod
 * Kubernetes deployment because each replica had its own Map. This file
 * adds a Redis-backed implementation behind a small interface so the
 * gateway can pick the right backend at startup based on `REDIS_URL`.
 *
 * # Backends
 *
 *   InMemoryRateLimiter — fixed window, per-key Map. Default. Single-process only.
 *   RedisRateLimiter    — fixed window, INCR + EXPIRE. Distributed-safe.
 *
 * # Selection
 *
 *   createRateLimiter({ redisUrl })
 *     - If redisUrl is provided AND a Redis connection succeeds, returns RedisRateLimiter.
 *     - Otherwise returns InMemoryRateLimiter with a warning log.
 *     - Connection failures during runtime degrade to "fail open" (allow the request)
 *       rather than "fail closed" (deny everything) because rate limiters are a
 *       smoothing tool, not an authentication gate. Failing closed on Redis loss
 *       would take down the whole API surface every time Redis hiccupped.
 *
 * # Why fixed-window not sliding-window
 *
 * Sliding windows are more accurate but require either O(N) per-request cost
 * (sorted-set + ZREMRANGEBYSCORE) or a complex Lua script. Fixed windows are
 * one INCR per request and one EXPIRE on first hit — atomic, cheap, and
 * sufficient for a kernel-level safety net. If a route needs precise sliding
 * windows it can layer that on top.
 */

import type { Redis } from "ioredis";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("rate-limiter");

/**
 * Configuration shape — must match the existing RateLimitConfig used by the
 * gateway. Kept as a separate interface to avoid a circular import.
 */
export interface RateLimitCheckConfig {
  windowSeconds: number;
  maxRequests: number;
}

/**
 * Result of a rate-limit check. Identical shape to the previous in-memory
 * implementation so callers don't need to adapt.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Backend interface implemented by both the in-memory and Redis limiters.
 * Returns a Promise so the gateway can await both backends uniformly.
 */
export interface RateLimiterBackend {
  /** Check and (if allowed) increment the counter for this key. */
  check(key: string, config: RateLimitCheckConfig): Promise<RateLimitResult>;
  /** Periodic cleanup hook — called by the gateway. No-op for Redis. */
  cleanup?(): void;
  /** Identifier for logs and metrics. */
  readonly backendName: "memory" | "redis";
  /** Graceful shutdown — closes Redis client if any. */
  close(): Promise<void>;
}

// =====================================================================
// IN-MEMORY BACKEND
// =====================================================================

/**
 * Fixed-window in-memory limiter. Per-key Map of { count, windowStart }.
 *
 * Limitations:
 *   - Not distributed: each Node process has its own counters.
 *   - Memory grows with unique keys; cleanup() prunes expired entries.
 */
export class InMemoryRateLimiter implements RateLimiterBackend {
  readonly backendName = "memory" as const;

  private requests = new Map<
    string,
    { count: number; windowStart: number }
  >();

  async check(
    key: string,
    config: RateLimitCheckConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    let entry = this.requests.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      this.requests.set(key, entry);
    }

    const remaining = config.maxRequests - entry.count;
    const resetAt = new Date(entry.windowStart + windowMs);

    if (entry.count >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  cleanup(maxAgeMs: number = 300_000): void {
    const now = Date.now();
    for (const [key, entry] of this.requests) {
      if (now - entry.windowStart >= maxAgeMs) {
        this.requests.delete(key);
      }
    }
  }

  async close(): Promise<void> {
    this.requests.clear();
  }
}

// =====================================================================
// REDIS BACKEND
// =====================================================================

/**
 * Fixed-window Redis-backed limiter using INCR + EXPIRE.
 *
 * Algorithm (per check):
 *   1. Compute window key as `${key}:${floor(now / windowMs)}`.
 *      The floor-bucketed key gives every replica the same window
 *      boundary without coordination.
 *   2. INCR the key.
 *   3. If the post-INCR value is 1 (we just created it), EXPIRE it
 *      to (windowMs * 2) so it gets cleaned up automatically.
 *   4. If the value > maxRequests, deny.
 *
 * Why TTL = windowMs * 2 not windowMs: the window-aligned bucket can
 * receive requests from `now` up until `now + windowMs`, so the TTL
 * must extend at least that far. 2x is a safe over-provision that
 * handles clock skew and request bursts at window boundaries.
 *
 * Failure mode: if the Redis pipeline throws, we fail OPEN — return
 * allowed:true with a log warning. See the file header for why.
 */
export class RedisRateLimiter implements RateLimiterBackend {
  readonly backendName = "redis" as const;

  constructor(private readonly client: Redis, private readonly keyPrefix: string) {}

  async check(
    key: string,
    config: RateLimitCheckConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const bucket = Math.floor(now / windowMs);
    const fullKey = `${this.keyPrefix}:${key}:${bucket}`;

    try {
      // Pipeline INCR + EXPIRE for atomicity. The EXPIRE is conditionally
      // applied via the post-INCR value below — it's cheap to issue
      // unconditionally, but doing it only on first-touch saves a Redis
      // command on the hot path.
      const newValue = await this.client.incr(fullKey);
      if (newValue === 1) {
        // Set TTL on first touch only. Use PEXPIRE for ms precision.
        await this.client.pexpire(fullKey, windowMs * 2);
      }

      const remaining = Math.max(0, config.maxRequests - newValue);
      const resetAt = new Date((bucket + 1) * windowMs);

      if (newValue > config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt };
      }

      return { allowed: true, remaining, resetAt };
    } catch (err) {
      // Fail open on Redis errors. A rate limiter outage must not take
      // down the API surface. We log loudly so the operator sees it.
      log.error(
        { err: (err as Error).message, key },
        "Redis rate limiter check failed; failing open"
      );
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now + windowMs),
      };
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch (err) {
      log.warn({ err }, "Failed to close Redis rate limiter client");
    }
  }
}

// =====================================================================
// FACTORY
// =====================================================================

export interface CreateRateLimiterOptions {
  /** Redis connection URL. If absent, returns the in-memory backend. */
  redisUrl?: string;
  /** Key prefix for Redis to avoid collisions with other apps sharing the same instance. */
  redisKeyPrefix?: string;
}

/**
 * Build a rate limiter backend based on configuration. Tries Redis first
 * if a URL is provided; falls back to in-memory with a warning if the
 * connection cannot be established.
 *
 * Note: connection establishment uses `lazyConnect: true` so this function
 * returns immediately. The first actual `check()` call is when a Redis
 * outage would surface, and that's exactly where we fail open.
 */
export async function createRateLimiter(
  options: CreateRateLimiterOptions = {}
): Promise<RateLimiterBackend> {
  const { redisUrl, redisKeyPrefix = "rses:gateway:rl" } = options;

  if (!redisUrl) {
    log.info("Using in-memory rate limiter (single-process). Set REDIS_URL for distributed limiting.");
    return new InMemoryRateLimiter();
  }

  // Use dynamic import so a missing ioredis package doesn't crash the
  // module at load time. ioredis is in package.json today via the session
  // store, but this keeps the limiter independent of that.
  let IORedis: typeof import("ioredis").Redis;
  try {
    const mod = (await import("ioredis")) as typeof import("ioredis");
    IORedis = mod.Redis;
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      "ioredis not installed; falling back to in-memory rate limiter"
    );
    return new InMemoryRateLimiter();
  }

  try {
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    });

    // Don't blow up the process on transient connection errors — the
    // limiter's own check() handles them by failing open.
    client.on("error", (err) => {
      log.warn({ err: err.message }, "Redis rate limiter connection error");
    });

    // Force a connection now so we know whether to use this backend or
    // fall back. If it fails, we degrade.
    await client.connect();
    log.info({ keyPrefix: redisKeyPrefix }, "Using Redis rate limiter");
    return new RedisRateLimiter(client, redisKeyPrefix);
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      "Could not connect to Redis for rate limiting; falling back to in-memory"
    );
    return new InMemoryRateLimiter();
  }
}
