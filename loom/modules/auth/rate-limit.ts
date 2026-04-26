/**
 * Per-username login rate limiter.
 *
 * SPEC §5.3: 5 failed login attempts per username within 15 minutes
 * trigger a 15-minute lockout. The limiter is keyed by username (case-
 * insensitive, matching the registration uniqueness contract), not by
 * IP — this is to defend the user from credential-stuffing across many
 * source IPs while leaving legitimate users on shared NATs unaffected.
 *
 * Implementation choice: in-memory only.
 *
 *   - Failure counters reset on server restart. An attacker who can
 *     trigger restarts at will can bypass lockout, but the deploy
 *     contract for Phase 1 is single-process and restarts are rare.
 *   - Counters do not propagate across multiple server instances. When
 *     loom scales horizontally, swap this for a Redis-backed or DB-
 *     backed limiter; the LoginRateLimiter interface stays the same.
 *
 * The limiter takes an injectable clock so tests can simulate time
 * passing without sleeping.
 */

export interface LoginRateLimiter {
  /** True iff the username is currently within an active lockout. */
  isLocked(username: string): boolean;
  /** Milliseconds until the lockout ends; 0 if not locked. */
  retryAfterMs(username: string): number;
  /**
   * Record a failed login attempt. Returns true if this attempt
   * triggered a fresh lockout (caller may want to log this separately).
   * Returns false if the attempt was just an increment, or if the user
   * was already locked.
   */
  recordFailure(username: string): boolean;
  /** Record a successful login — clears all tracking for the username. */
  recordSuccess(username: string): void;
  /** Drop all tracking. Test helper; do not call from production code. */
  reset(): void;
}

interface AttemptRecord {
  /** Failures observed in the current rolling window. */
  failures: number;
  /** ms timestamp of the first failure in the current window. */
  windowStart: number;
  /** ms timestamp when the lockout ends, or null if not locked. */
  lockedUntil: number | null;
}

export interface LoginRateLimiterConfig {
  /** Max failures allowed before lockout. SPEC §5.3 default: 5. */
  maxFailures: number;
  /**
   * Window length AND lockout length in ms. SPEC §5.3 uses 15 minutes
   * for both — they are intentionally the same value (failures slide
   * out of relevance after the same time the lockout would have
   * expired).
   */
  windowMs: number;
  /** Clock injection point. Defaults to Date.now. */
  now?: () => number;
}

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// IP-based register rate limiting (SPEC §5.2): 3 register attempts per
// IP per hour for the "open" registration_mode. The defaults below are
// passed through `createLoginRateLimiter` since the underlying
// data-structure is identical — only the keying intent differs. For
// IP usage, callers `recordFailure(ip)` on every register attempt
// regardless of outcome (the method is misnamed for this use; the
// alternative was a wider rename that touched every call site).
const DEFAULT_IP_MAX_ATTEMPTS = 3;
const DEFAULT_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function createLoginRateLimiter(
  config: Partial<LoginRateLimiterConfig> = {},
): LoginRateLimiter {
  const maxFailures = config.maxFailures ?? DEFAULT_MAX_FAILURES;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const now = config.now ?? (() => Date.now());

  const records = new Map<string, AttemptRecord>();

  // Case-insensitive key — usernames are unique case-insensitively, so
  // an attacker cannot bypass lockout by varying case.
  const keyOf = (username: string): string => username.toLowerCase();

  function isLocked(username: string): boolean {
    const r = records.get(keyOf(username));
    if (!r || r.lockedUntil === null) return false;
    if (now() >= r.lockedUntil) {
      // Lockout has elapsed — clear so subsequent failures start a
      // fresh window. This is safe to do on a read because we only
      // remove records that have certainly expired.
      records.delete(keyOf(username));
      return false;
    }
    return true;
  }

  function retryAfterMs(username: string): number {
    const r = records.get(keyOf(username));
    if (!r || r.lockedUntil === null) return 0;
    return Math.max(0, r.lockedUntil - now());
  }

  function recordFailure(username: string): boolean {
    const k = keyOf(username);
    const t = now();
    const existing = records.get(k);

    // No record, or the prior window has elapsed — start a fresh window.
    if (!existing || t - existing.windowStart > windowMs) {
      records.set(k, { failures: 1, windowStart: t, lockedUntil: null });
      return false;
    }

    existing.failures += 1;

    // Reaching the threshold for the first time triggers a lockout.
    // Failures during an already-active lockout increment the counter
    // but do not extend it — that would let an attacker keep the lock
    // alive forever by hammering. SPEC says "after the 5th failure",
    // not "after every failure".
    if (existing.failures >= maxFailures && existing.lockedUntil === null) {
      existing.lockedUntil = t + windowMs;
      return true;
    }
    return false;
  }

  function recordSuccess(username: string): void {
    records.delete(keyOf(username));
  }

  function reset(): void {
    records.clear();
  }

  return { isLocked, retryAfterMs, recordFailure, recordSuccess, reset };
}

/**
 * Convenience factory for the per-IP register limiter. Same shape as
 * the login limiter but with SPEC §5.2's defaults (3 attempts / 1
 * hour). Bootstrap creates one of these and feeds it to
 * createAuthRouter; the /register handler keys by `req.ip` and treats
 * every attempt (success or failure) as a slot consumption.
 */
export function createIpRateLimiter(
  config: Partial<LoginRateLimiterConfig> = {},
): LoginRateLimiter {
  return createLoginRateLimiter({
    maxFailures: DEFAULT_IP_MAX_ATTEMPTS,
    windowMs: DEFAULT_IP_WINDOW_MS,
    ...config,
  });
}
