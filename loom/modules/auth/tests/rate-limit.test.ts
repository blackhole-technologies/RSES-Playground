/**
 * Unit tests for the in-memory login rate limiter. Pure logic — runs on
 * the no-DB `pnpm test` path. Time is injected so we can simulate
 * passage of minutes without sleeping.
 */

import { describe, it, expect } from "vitest";
import { createLoginRateLimiter } from "../rate-limit";

interface Clock {
  now: number;
  advance(ms: number): void;
  fn: () => number;
}

function makeClock(start = 1_700_000_000_000): Clock {
  const c: Clock = {
    now: start,
    advance(ms: number) {
      this.now += ms;
    },
    fn: () => 0,
  };
  c.fn = () => c.now;
  return c;
}

const MIN = 60 * 1000;

describe("createLoginRateLimiter", () => {
  it("starts unlocked for any username", () => {
    const rl = createLoginRateLimiter();
    expect(rl.isLocked("alice")).toBe(false);
    expect(rl.retryAfterMs("alice")).toBe(0);
  });

  it("does not lock after fewer than maxFailures", () => {
    const rl = createLoginRateLimiter();
    expect(rl.recordFailure("alice")).toBe(false); // 1
    expect(rl.recordFailure("alice")).toBe(false); // 2
    expect(rl.recordFailure("alice")).toBe(false); // 3
    expect(rl.recordFailure("alice")).toBe(false); // 4
    expect(rl.isLocked("alice")).toBe(false);
  });

  it("locks on the Nth failure (default 5)", () => {
    const rl = createLoginRateLimiter();
    for (let i = 0; i < 4; i++) rl.recordFailure("alice");
    const triggered = rl.recordFailure("alice"); // 5th
    expect(triggered).toBe(true);
    expect(rl.isLocked("alice")).toBe(true);
    expect(rl.retryAfterMs("alice")).toBeGreaterThan(0);
  });

  it("releases the lock after windowMs has elapsed", () => {
    const clock = makeClock();
    const rl = createLoginRateLimiter({ now: clock.fn });
    for (let i = 0; i < 5; i++) rl.recordFailure("alice");
    expect(rl.isLocked("alice")).toBe(true);

    clock.advance(15 * MIN + 1);
    expect(rl.isLocked("alice")).toBe(false);
    expect(rl.retryAfterMs("alice")).toBe(0);
  });

  it("does not extend lockout when failures arrive during the lock", () => {
    const clock = makeClock();
    const rl = createLoginRateLimiter({ now: clock.fn });
    for (let i = 0; i < 5; i++) rl.recordFailure("alice");
    const lockEnd = clock.now + 15 * MIN;

    clock.advance(5 * MIN);
    // More failures during the lockout: must NOT push lockEnd forward.
    expect(rl.recordFailure("alice")).toBe(false);
    expect(rl.recordFailure("alice")).toBe(false);
    // We're 5min into a 15min lock, so retryAfter should be ~10min.
    expect(rl.retryAfterMs("alice")).toBeLessThanOrEqual(10 * MIN);
    expect(rl.retryAfterMs("alice")).toBeGreaterThan(9 * MIN);
    // And the absolute deadline matches the original.
    clock.advance(10 * MIN + 1);
    expect(clock.now).toBeGreaterThan(lockEnd);
    expect(rl.isLocked("alice")).toBe(false);
  });

  it("starts a fresh window when failures arrive after the previous window", () => {
    const clock = makeClock();
    const rl = createLoginRateLimiter({ now: clock.fn });
    rl.recordFailure("alice");
    rl.recordFailure("alice");

    clock.advance(15 * MIN + 1); // window slides past the prior failures
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    // 4 failures in the new window — still under threshold.
    expect(rl.isLocked("alice")).toBe(false);
  });

  it("clears tracking on success", () => {
    const rl = createLoginRateLimiter();
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    rl.recordSuccess("alice");
    // Only one failure should be recorded after that — not 3.
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    rl.recordFailure("alice");
    expect(rl.isLocked("alice")).toBe(false); // total 3, threshold 5
  });

  it("is case-insensitive on username", () => {
    const rl = createLoginRateLimiter();
    for (let i = 0; i < 5; i++) rl.recordFailure("Alice");
    // Lowercase, uppercase, mixed — all see the same lockout.
    expect(rl.isLocked("alice")).toBe(true);
    expect(rl.isLocked("ALICE")).toBe(true);
    expect(rl.isLocked("aLiCe")).toBe(true);
  });

  it("tracks usernames independently", () => {
    const rl = createLoginRateLimiter();
    for (let i = 0; i < 5; i++) rl.recordFailure("alice");
    expect(rl.isLocked("alice")).toBe(true);
    expect(rl.isLocked("bob")).toBe(false);
    expect(rl.recordFailure("bob")).toBe(false);
    expect(rl.isLocked("bob")).toBe(false);
  });

  it("respects custom maxFailures and windowMs", () => {
    const clock = makeClock();
    const rl = createLoginRateLimiter({
      maxFailures: 2,
      windowMs: 1000,
      now: clock.fn,
    });
    expect(rl.recordFailure("alice")).toBe(false);
    expect(rl.recordFailure("alice")).toBe(true); // locked on the 2nd
    expect(rl.isLocked("alice")).toBe(true);

    clock.advance(1001);
    expect(rl.isLocked("alice")).toBe(false);
  });

  it("reset() clears all state", () => {
    const rl = createLoginRateLimiter();
    for (let i = 0; i < 5; i++) rl.recordFailure("alice");
    expect(rl.isLocked("alice")).toBe(true);
    rl.reset();
    expect(rl.isLocked("alice")).toBe(false);
  });
});
