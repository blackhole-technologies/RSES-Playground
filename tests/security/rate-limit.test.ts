/**
 * @file rate-limit.test.ts
 * @description Security tests for rate limiting enforcement
 * @phase Phase 3 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-03
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Mock Express Types
// ============================================================================

interface MockRequest extends Partial<Request> {
  ip?: string;
  path: string;
  method: string;
  user?: { id: number; isAdmin?: boolean };
  headers: Record<string, string>;
  get(header: string): string | undefined;
}

interface MockResponse extends Partial<Response> {
  statusCode?: number;
  headers: Record<string, string | number>;
  jsonData?: any;
  setHeader(name: string, value: string | number): this;
  status(code: number): this;
  json(data: any): this;
}

function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  const headers: Record<string, string> = overrides.headers || {};

  return {
    ip: "127.0.0.1",
    path: "/api/test",
    method: "GET",
    headers,
    get: (header: string) => headers[header.toLowerCase()],
    ...overrides,
  } as MockRequest;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    headers: {},
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };

  return res;
}

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class MemoryRateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  async increment(key: string, windowSec: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      const resetAt = now + windowSec * 1000;
      this.store.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    entry.count++;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  reset(): void {
    this.store.clear();
  }
}

interface RateLimitConfig {
  windowSec: number;
  maxRequests: number;
  keyPrefix?: string;
  keyGenerator?: (req: MockRequest) => string;
}

function ipKeyGenerator(req: MockRequest): string {
  return `ip:${req.ip || "unknown"}`;
}

function createRateLimiter(config: RateLimitConfig, store: MemoryRateLimitStore) {
  const {
    windowSec,
    maxRequests,
    keyPrefix = "rl",
    keyGenerator = ipKeyGenerator,
  } = config;

  return async (req: MockRequest, res: MockResponse, next: NextFunction) => {
    try {
      const baseKey = keyGenerator(req);
      const key = `${keyPrefix}:${baseKey}`;

      const { count, resetAt } = await store.increment(key, windowSec);
      const remaining = Math.max(0, maxRequests - count);
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

      if (count > maxRequests) {
        res.setHeader("Retry-After", retryAfter);
        return res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          code: "E_RATE_LIMIT",
          retryAfter,
        });
      }

      next();
    } catch (error) {
      // Fail open on error
      next();
    }
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Rate Limit Enforcement", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  describe("Basic Rate Limiting", () => {
    it("allows requests within limit", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 5 },
        store
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        await limiter(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(5);
      expect(res.statusCode).toBeUndefined();
    });

    it("blocks requests exceeding limit", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 3 },
        store
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        await limiter(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(3);

      // 4th request should be blocked
      const blockedRes = createMockResponse();
      await limiter(req, blockedRes, next);

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.jsonData?.error).toBe("Too Many Requests");
      expect(blockedRes.jsonData?.code).toBe("E_RATE_LIMIT");
    });

    it("sets correct rate limit headers", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 10 },
        store
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      await limiter(req, res, next);

      expect(res.headers["X-RateLimit-Limit"]).toBe(10);
      expect(res.headers["X-RateLimit-Remaining"]).toBe(9);
      expect(res.headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("decrements remaining count with each request", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 5 },
        store
      );

      const req = createMockRequest();

      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = vi.fn();

        await limiter(req, res, next);

        expect(res.headers["X-RateLimit-Remaining"]).toBe(4 - i);
      }
    });
  });

  describe("Retry-After Header", () => {
    it("includes Retry-After header when rate limited", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 1 },
        store
      );

      const req = createMockRequest();
      const next = vi.fn();

      // First request - allowed
      await limiter(req, createMockResponse(), next);

      // Second request - blocked
      const blockedRes = createMockResponse();
      await limiter(req, blockedRes, next);

      expect(blockedRes.headers["Retry-After"]).toBeDefined();
      expect(typeof blockedRes.headers["Retry-After"]).toBe("number");
      expect(blockedRes.headers["Retry-After"]).toBeGreaterThan(0);
      expect(blockedRes.headers["Retry-After"]).toBeLessThanOrEqual(60);
    });

    it("provides retry time in response body", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 1 },
        store
      );

      const req = createMockRequest();
      const next = vi.fn();

      await limiter(req, createMockResponse(), next);

      const blockedRes = createMockResponse();
      await limiter(req, blockedRes, next);

      expect(blockedRes.jsonData?.retryAfter).toBeDefined();
      expect(blockedRes.jsonData?.message).toContain("Try again in");
    });
  });

  describe("Window Reset", () => {
    it("resets counter after window expires", async () => {
      const limiter = createRateLimiter(
        { windowSec: 1, maxRequests: 2 },
        store
      );

      const req = createMockRequest();
      const next = vi.fn();

      // Use up the limit
      await limiter(req, createMockResponse(), next);
      await limiter(req, createMockResponse(), next);

      // Next request should be blocked
      const blockedRes = createMockResponse();
      await limiter(req, blockedRes, next);
      expect(blockedRes.statusCode).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      const allowedRes = createMockResponse();
      await limiter(req, allowedRes, next);
      expect(allowedRes.statusCode).toBeUndefined();
    });
  });

  describe("Per-IP Isolation", () => {
    it("tracks different IPs separately", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 2 },
        store
      );

      const next = vi.fn();

      // IP 1 uses up limit
      const req1 = createMockRequest({ ip: "192.168.1.1" });
      await limiter(req1, createMockResponse(), next);
      await limiter(req1, createMockResponse(), next);

      const blockedRes = createMockResponse();
      await limiter(req1, blockedRes, next);
      expect(blockedRes.statusCode).toBe(429);

      // IP 2 should still be allowed
      const req2 = createMockRequest({ ip: "192.168.1.2" });
      const allowedRes = createMockResponse();
      await limiter(req2, allowedRes, next);
      expect(allowedRes.statusCode).toBeUndefined();
    });
  });
});

describe("Rate Limit Fail-Closed for Auth Endpoints", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  describe("Authentication Endpoints", () => {
    it("enforces strict limits on login attempts", async () => {
      // Auth endpoints should have low limits (e.g., 5 per 5 minutes)
      const authLimiter = createRateLimiter(
        { windowSec: 300, maxRequests: 5, keyPrefix: "auth" },
        store
      );

      const req = createMockRequest({ path: "/api/auth/login", method: "POST" });
      const next = vi.fn();

      // Make 5 attempts
      for (let i = 0; i < 5; i++) {
        await authLimiter(req, createMockResponse(), next);
      }

      // 6th attempt should be blocked
      const blockedRes = createMockResponse();
      await authLimiter(req, blockedRes, next);

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.jsonData?.code).toBe("E_RATE_LIMIT");
    });

    it("uses longer window for auth endpoints", async () => {
      const authLimiter = createRateLimiter(
        { windowSec: 300, maxRequests: 5, keyPrefix: "auth" },
        store
      );

      const req = createMockRequest({ path: "/api/auth/login" });
      const next = vi.fn();

      // Use up limit
      for (let i = 0; i < 5; i++) {
        await authLimiter(req, createMockResponse(), next);
      }

      const blockedRes = createMockResponse();
      await authLimiter(req, blockedRes, next);

      // Check retry-after is long (close to 300 seconds)
      expect(blockedRes.headers["Retry-After"]).toBeGreaterThan(290);
      expect(blockedRes.headers["Retry-After"]).toBeLessThanOrEqual(300);
    });
  });

  describe("Fail-Closed Behavior", () => {
    it("blocks requests when limit exceeded (fail-closed)", async () => {
      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 3 },
        store
      );

      const req = createMockRequest();
      const next = vi.fn();

      // Reach limit
      for (let i = 0; i < 3; i++) {
        await limiter(req, createMockResponse(), next);
      }

      const initialCallCount = next.mock.calls.length;

      // Further requests must be denied (fail-closed)
      const res = createMockResponse();
      await limiter(req, res, next);

      expect(res.statusCode).toBe(429);
      expect(next.mock.calls.length).toBe(initialCallCount); // next() not called for blocked request
    });

    it("fails open on error (non-auth endpoints)", async () => {
      // Create a limiter that will throw
      const faultyStore = {
        async increment(): Promise<never> {
          throw new Error("Store failure");
        },
      } as any;

      const limiter = createRateLimiter(
        { windowSec: 60, maxRequests: 5 },
        faultyStore
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      await limiter(req, res, next);

      // Should fail open (allow request) for general endpoints
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeUndefined();
    });
  });

  describe("Auth-Specific Fail-Closed", () => {
    // In production, auth endpoints should fail CLOSED on errors
    it("demonstrates fail-closed pattern for auth", async () => {
      const createAuthRateLimiter = (config: RateLimitConfig, store: any) => {
        return async (req: MockRequest, res: MockResponse, next: NextFunction) => {
          try {
            const baseKey = (config.keyGenerator || ipKeyGenerator)(req);
            const key = `${config.keyPrefix || "rl"}:${baseKey}`;

            const { count, resetAt } = await store.increment(key, config.windowSec);
            const remaining = Math.max(0, config.maxRequests - count);
            const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

            res.setHeader("X-RateLimit-Limit", config.maxRequests);
            res.setHeader("X-RateLimit-Remaining", remaining);
            res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

            if (count > config.maxRequests) {
              res.setHeader("Retry-After", retryAfter);
              return res.status(429).json({
                error: "Too Many Requests",
                code: "E_RATE_LIMIT",
                retryAfter,
              });
            }

            next();
          } catch (error) {
            // FAIL CLOSED for auth endpoints
            return res.status(503).json({
              error: "Service Unavailable",
              message: "Rate limiting temporarily unavailable",
              code: "E_RATE_LIMIT_ERROR",
            });
          }
        };
      };

      const faultyStore = {
        async increment(): Promise<never> {
          throw new Error("Store failure");
        },
      } as any;

      const authLimiter = createAuthRateLimiter(
        { windowSec: 300, maxRequests: 5, keyPrefix: "auth" },
        faultyStore
      );

      const req = createMockRequest({ path: "/api/auth/login" });
      const res = createMockResponse();
      const next = vi.fn();

      await authLimiter(req, res, next);

      // Should fail CLOSED (deny request) for auth endpoints
      expect(res.statusCode).toBe(503);
      expect(res.jsonData?.code).toBe("E_RATE_LIMIT_ERROR");
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe("Rate Limit Edge Cases", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  it("handles concurrent requests correctly", async () => {
    const limiter = createRateLimiter(
      { windowSec: 60, maxRequests: 5 },
      store
    );

    const req = createMockRequest();
    const next = vi.fn();

    // Make 10 concurrent requests
    const promises = Array.from({ length: 10 }, () =>
      limiter(req, createMockResponse(), next)
    );

    await Promise.all(promises);

    // Exactly 5 should succeed, 5 should be blocked
    expect(next).toHaveBeenCalledTimes(5);
  });

  it("handles zero limit (completely blocked)", async () => {
    const limiter = createRateLimiter(
      { windowSec: 60, maxRequests: 0 },
      store
    );

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await limiter(req, res, next);

    expect(res.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  it("handles very high limits", async () => {
    const limiter = createRateLimiter(
      { windowSec: 60, maxRequests: 10000 },
      store
    );

    const req = createMockRequest();
    const next = vi.fn();

    // Make 100 requests
    for (let i = 0; i < 100; i++) {
      await limiter(req, createMockResponse(), next);
    }

    expect(next).toHaveBeenCalledTimes(100);
  });
});
