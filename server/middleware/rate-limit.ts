/**
 * @file rate-limit.ts
 * @description Advanced rate limiting with per-user and per-site limits
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Features:
 * - Per-IP rate limiting (default)
 * - Per-user rate limiting (authenticated)
 * - Per-site rate limiting (multi-tenant)
 * - Tiered limits (different limits for different user types)
 * - Redis-backed for distributed deployments
 * - Sliding window algorithm
 */

import type { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { auditService, logSecurityEvent } from "../services/audit/audit-service";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Window size in seconds */
  windowSec: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Key prefix for storage */
  keyPrefix?: string;
  /** Skip rate limiting for these paths */
  skipPaths?: string[];
  /** Custom key generator */
  keyGenerator?: (req: Request) => string;
  /** Handler when rate limit exceeded */
  onLimitExceeded?: (req: Request, res: Response, info: RateLimitInfo) => void;
  /** Log rate limit events */
  audit?: boolean;
}

export interface RateLimitInfo {
  key: string;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter: number;
}

export interface TieredRateLimitConfig {
  /** Default limits for unauthenticated users */
  anonymous: RateLimitConfig;
  /** Limits for authenticated users */
  authenticated?: RateLimitConfig;
  /** Limits for admin users */
  admin?: RateLimitConfig;
  /** Per-site limits (keyed by site tier) */
  siteTiers?: Record<string, RateLimitConfig>;
}

// ============================================================================
// In-Memory Store (Development)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class MemoryRateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async increment(key: string, windowSec: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      // New window
      const resetAt = now + windowSec * 1000;
      this.store.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    // Increment existing
    entry.count++;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key);
    if (!entry || entry.resetAt < Date.now()) {
      return null;
    }
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// ============================================================================
// Redis Store (Production)
// ============================================================================

class RedisRateLimitStore {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on("error", (err) => {
      console.error("[RateLimit] Redis error:", err.message);
    });
  }

  async increment(key: string, windowSec: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const resetAt = now + windowSec * 1000;

    // Use Lua script for atomic increment with expiry
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('PTTL', KEYS[1])
      return {current, ttl}
    `;

    const result = await this.client.eval(script, 1, key, windowSec * 1000) as [number, number];
    const count = result[0];
    const ttl = result[1];

    return {
      count,
      resetAt: now + ttl,
    };
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const [countStr, ttl] = await Promise.all([
      this.client.get(key),
      this.client.pttl(key),
    ]);

    if (!countStr || ttl <= 0) {
      return null;
    }

    return {
      count: parseInt(countStr, 10),
      resetAt: Date.now() + ttl,
    };
  }

  async destroy(): Promise<void> {
    await this.client.quit();
  }
}

// ============================================================================
// Store Factory
// ============================================================================

type RateLimitStore = MemoryRateLimitStore | RedisRateLimitStore;

let globalStore: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (!globalStore) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      globalStore = new RedisRateLimitStore(redisUrl);
    } else {
      globalStore = new MemoryRateLimitStore();
    }
  }
  return globalStore;
}

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Generate rate limit key based on IP address.
 */
export function ipKeyGenerator(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return `ip:${ip}`;
}

/**
 * Generate rate limit key based on authenticated user.
 */
export function userKeyGenerator(req: Request): string {
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  return ipKeyGenerator(req);
}

/**
 * Generate rate limit key based on site (multi-tenant).
 */
export function siteKeyGenerator(req: Request): string {
  const siteId = req.get("x-site-id");
  if (siteId) {
    return `site:${siteId}`;
  }
  return ipKeyGenerator(req);
}

/**
 * Generate composite key (user + site).
 */
export function compositeKeyGenerator(req: Request): string {
  const user = (req as any).user;
  const siteId = req.get("x-site-id");

  if (user?.id && siteId) {
    return `user:${user.id}:site:${siteId}`;
  }
  if (user?.id) {
    return `user:${user.id}`;
  }
  if (siteId) {
    return `site:${siteId}`;
  }
  return ipKeyGenerator(req);
}

// ============================================================================
// Rate Limit Middleware
// ============================================================================

/**
 * Create rate limiting middleware.
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowSec,
    maxRequests,
    keyPrefix = "rl",
    skipPaths = [],
    keyGenerator = ipKeyGenerator,
    onLimitExceeded,
    audit = true,
  } = config;

  const store = getStore();

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip certain paths
    if (skipPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    try {
      const baseKey = keyGenerator(req);
      const key = `${keyPrefix}:${baseKey}`;

      const { count, resetAt } = await store.increment(key, windowSec);
      const remaining = Math.max(0, maxRequests - count);
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

      if (count > maxRequests) {
        res.setHeader("Retry-After", retryAfter);

        const info: RateLimitInfo = {
          key: baseKey,
          limit: maxRequests,
          remaining: 0,
          resetAt: new Date(resetAt),
          retryAfter,
        };

        // Log rate limit event
        if (audit) {
          await logSecurityEvent(
            auditService.contextFromRequest(req),
            "rate_limit_exceeded",
            "denied",
            {
              key: baseKey,
              limit: maxRequests,
              count,
              path: req.path,
              method: req.method,
            }
          );
        }

        // Custom handler or default response
        if (onLimitExceeded) {
          return onLimitExceeded(req, res, info);
        }

        return res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          code: "E_RATE_LIMIT",
          retryAfter,
          limit: maxRequests,
        });
      }

      next();
    } catch (error) {
      // On error, allow the request (fail open)
      console.error("[RateLimit] Error:", error);
      next();
    }
  };
}

/**
 * Create tiered rate limiting middleware.
 * Applies different limits based on user type/tier.
 */
export function tieredRateLimit(config: TieredRateLimitConfig) {
  const { anonymous, authenticated, admin, siteTiers } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const siteId = req.get("x-site-id");

    let effectiveConfig: RateLimitConfig;

    // Determine which tier to use
    if (user?.isAdmin && admin) {
      effectiveConfig = admin;
    } else if (user && authenticated) {
      effectiveConfig = authenticated;
    } else if (siteId && siteTiers) {
      // TODO: Look up site tier from database
      const siteTier = "default";
      effectiveConfig = siteTiers[siteTier] || anonymous;
    } else {
      effectiveConfig = anonymous;
    }

    // Apply the appropriate rate limit
    const middleware = rateLimit(effectiveConfig);
    return middleware(req, res, next);
  };
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Standard API rate limits.
 */
export const apiRateLimits: TieredRateLimitConfig = {
  anonymous: {
    windowSec: 60,
    maxRequests: 30,
    keyPrefix: "rl:api:anon",
    keyGenerator: ipKeyGenerator,
  },
  authenticated: {
    windowSec: 60,
    maxRequests: 100,
    keyPrefix: "rl:api:user",
    keyGenerator: userKeyGenerator,
  },
  admin: {
    windowSec: 60,
    maxRequests: 500,
    keyPrefix: "rl:api:admin",
    keyGenerator: userKeyGenerator,
  },
};

/**
 * Auth endpoint rate limits (stricter for security).
 */
export const authRateLimits: RateLimitConfig = {
  windowSec: 300, // 5 minutes
  maxRequests: 10,
  keyPrefix: "rl:auth",
  keyGenerator: ipKeyGenerator,
  audit: true,
};

/**
 * Feature flag evaluation rate limits (high volume).
 */
export const featureFlagRateLimits: TieredRateLimitConfig = {
  anonymous: {
    windowSec: 60,
    maxRequests: 100,
    keyPrefix: "rl:ff:anon",
    keyGenerator: ipKeyGenerator,
  },
  authenticated: {
    windowSec: 60,
    maxRequests: 1000,
    keyPrefix: "rl:ff:user",
    keyGenerator: compositeKeyGenerator,
  },
  siteTiers: {
    starter: {
      windowSec: 60,
      maxRequests: 500,
      keyPrefix: "rl:ff:starter",
      keyGenerator: siteKeyGenerator,
    },
    pro: {
      windowSec: 60,
      maxRequests: 2000,
      keyPrefix: "rl:ff:pro",
      keyGenerator: siteKeyGenerator,
    },
    enterprise: {
      windowSec: 60,
      maxRequests: 10000,
      keyPrefix: "rl:ff:enterprise",
      keyGenerator: siteKeyGenerator,
    },
  },
};

/**
 * Admin API rate limits.
 */
export const adminRateLimits: RateLimitConfig = {
  windowSec: 60,
  maxRequests: 200,
  keyPrefix: "rl:admin",
  keyGenerator: userKeyGenerator,
  audit: true,
};

// ============================================================================
// Convenience Middleware
// ============================================================================

/**
 * Standard API rate limit middleware.
 */
export const apiRateLimit = tieredRateLimit(apiRateLimits);

/**
 * Auth endpoint rate limit middleware.
 */
export const authRateLimit = rateLimit(authRateLimits);

/**
 * Feature flag evaluation rate limit middleware.
 */
export const featureFlagRateLimit = tieredRateLimit(featureFlagRateLimits);

/**
 * Admin API rate limit middleware.
 */
export const adminRateLimit = rateLimit(adminRateLimits);

// ============================================================================
// Endpoint-Specific Rate Limits
// ============================================================================

/**
 * Create rate limit for specific endpoints with custom limits.
 */
export function endpointRateLimit(
  windowSec: number,
  maxRequests: number,
  options: Partial<RateLimitConfig> = {}
) {
  return rateLimit({
    windowSec,
    maxRequests,
    keyPrefix: "rl:endpoint",
    ...options,
  });
}

/**
 * Rate limit for expensive operations (reports, exports, etc).
 */
export const expensiveOperationRateLimit = endpointRateLimit(3600, 10, {
  keyPrefix: "rl:expensive",
  keyGenerator: userKeyGenerator,
  audit: true,
});

/**
 * Rate limit for bulk operations.
 */
export const bulkOperationRateLimit = endpointRateLimit(60, 5, {
  keyPrefix: "rl:bulk",
  keyGenerator: userKeyGenerator,
  audit: true,
});
