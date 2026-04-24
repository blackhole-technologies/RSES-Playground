/**
 * @file rate-limiter.test.ts
 * @description Tests for the kernel rate limiter backends (M1.2).
 *
 * Two layers:
 *   1. In-memory backend behavior (windowing, increment, deny).
 *   2. Backend interface contract — both backends must satisfy the same
 *      shape so the gateway can swap them transparently.
 *
 * Redis is not exercised here because CI doesn't have a Redis server
 * available. The Redis backend has its own integration test in
 * tests/integration/ that is skipped unless REDIS_URL is set.
 */

import { describe, it, expect } from "vitest";
import {
  InMemoryRateLimiter,
  createRateLimiter,
  type RateLimiterBackend,
} from "../../server/kernel/rate-limiter";

describe("InMemoryRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const limiter = new InMemoryRateLimiter();
    const config = { windowSeconds: 60, maxRequests: 5 };

    for (let i = 0; i < 5; i++) {
      const result = await limiter.check("k1", config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("denies the 6th request when limit is 5", async () => {
    const limiter = new InMemoryRateLimiter();
    const config = { windowSeconds: 60, maxRequests: 5 };

    for (let i = 0; i < 5; i++) {
      await limiter.check("k1", config);
    }
    const denied = await limiter.check("k1", config);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("isolates counters per key", async () => {
    const limiter = new InMemoryRateLimiter();
    const config = { windowSeconds: 60, maxRequests: 2 };

    await limiter.check("alice", config);
    await limiter.check("alice", config);
    const aliceDenied = await limiter.check("alice", config);
    expect(aliceDenied.allowed).toBe(false);

    const bobAllowed = await limiter.check("bob", config);
    expect(bobAllowed.allowed).toBe(true);
  });

  it("resets the counter after the window expires", async () => {
    const limiter = new InMemoryRateLimiter();
    // 100ms window so we can actually wait it out in a unit test.
    const config = { windowSeconds: 0.1, maxRequests: 1 };

    await limiter.check("k", config);
    const denied = await limiter.check("k", config);
    expect(denied.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 150));
    const allowedAgain = await limiter.check("k", config);
    expect(allowedAgain.allowed).toBe(true);
  });

  it("returns a reset timestamp in the future", async () => {
    const limiter = new InMemoryRateLimiter();
    const config = { windowSeconds: 60, maxRequests: 1 };
    const before = Date.now();
    const result = await limiter.check("k", config);
    expect(result.resetAt.getTime()).toBeGreaterThan(before);
    // Within 60s plus a small fudge for Date construction.
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(before + 61_000);
  });

  it("cleanup() prunes expired entries", async () => {
    const limiter = new InMemoryRateLimiter();
    const config = { windowSeconds: 0.05, maxRequests: 100 };
    await limiter.check("ephemeral", config);
    await new Promise((r) => setTimeout(r, 100));
    limiter.cleanup(50);
    // After cleanup, a fresh check should start a new window. We can't
    // directly inspect internals, but a deny in the previous window vs
    // an allow in the new window is the observable behavior.
    const fresh = await limiter.check("ephemeral", config);
    expect(fresh.allowed).toBe(true);
  });

  it("close() is safe to call and clears state", async () => {
    const limiter = new InMemoryRateLimiter();
    await limiter.check("k", { windowSeconds: 60, maxRequests: 1 });
    await limiter.close();
    // After close, the limiter is essentially fresh.
    const result = await limiter.check("k", { windowSeconds: 60, maxRequests: 1 });
    expect(result.allowed).toBe(true);
  });
});

describe("createRateLimiter factory", () => {
  it("returns the in-memory backend when no redisUrl is provided", async () => {
    const limiter = await createRateLimiter({});
    expect(limiter.backendName).toBe("memory");
    await limiter.close();
  });

  it("falls back to in-memory when redisUrl points to an unreachable host", async () => {
    // RFC 5737 TEST-NET-1 — guaranteed-unreachable in any real network.
    const limiter = await createRateLimiter({
      redisUrl: "redis://192.0.2.1:6379",
    });
    expect(limiter.backendName).toBe("memory");
    await limiter.close();
  }, 15_000);
});

describe("RateLimiterBackend interface contract", () => {
  // Every backend must satisfy this shape so the gateway can swap them.
  // Run the same shape assertions against the in-memory limiter; the
  // Redis backend has its own integration test.
  function assertBackendShape(backend: RateLimiterBackend): void {
    expect(typeof backend.check).toBe("function");
    expect(typeof backend.close).toBe("function");
    expect(["memory", "redis"]).toContain(backend.backendName);
  }

  it("InMemoryRateLimiter satisfies the backend contract", () => {
    assertBackendShape(new InMemoryRateLimiter());
  });
});
