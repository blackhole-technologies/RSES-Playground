/**
 * HTTP routes for the auth module: /login, /logout, /me.
 *
 * Phase 1 scope per IMPLEMENTATION.md: login + logout + /me. Public
 * /register is deferred — SPEC §5.2's `registration_mode` defaults to
 * "disabled" and the mode toggle UI lands in Phase 2. The bootstrap
 * flow creates the first admin via /setup (commit 8), and that's the
 * only registration path Phase 1 needs.
 *
 * Cookie flag matrix is set explicitly here, not via a third-party
 * cookie library, because the rules (`__Host-` prefix, Secure,
 * HttpOnly, SameSite=Strict) are part of the security contract — they
 * deserve to be visible at the call site, not buried in defaults.
 */

import { Router, type Response } from "express";
import { z } from "zod";
import {
  verifyCredentials,
  createSession,
  deleteSession,
  registerWithMode,
  getRegistrationMode,
  RegistrationDisabledError,
  InvalidInviteCodeError,
  UsernameTakenError,
  EmailTakenError,
} from "./service";
import { requireAuth } from "./middleware";
import type { LoginRateLimiter } from "./rate-limit";
import { toSafeUser } from "../../vendor/13-password-hash/src/password-hash";
import type { DbHandle } from "../../core/db";

/**
 * Cookie max-age matches SPEC §5.3's absolute 90-day session cap. The
 * server-side row in `sessions` is the source of truth — even if the
 * cookie outlives the row (browser clock drift, server-side delete
 * via /logout), `loadSessionUser` will reject it.
 */
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export interface AuthRoutesConfig {
  /** Cookie name to read AND set. Default `"session"`. Use `"__Host-session"` in production. */
  cookieName?: string;
  /**
   * Append the `Secure` flag to Set-Cookie. Default: NODE_ENV=production.
   * `__Host-` cookies require Secure to be respected by the browser, so
   * keep this aligned with the cookieName choice.
   */
  cookieSecure?: boolean;
  /**
   * Optional per-IP rate limiter applied to /register in "open"
   * registration_mode (SPEC §5.2: 3 per IP per hour). When omitted,
   * the per-IP gate is disabled — the per-username login limiter is
   * still wired separately through the second positional argument.
   */
  ipRateLimiter?: LoginRateLimiter;
}

const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Loose at the route layer — service-level Zod (in registerWithMode →
 * registerUser) does the real regex / min-length checks and throws
 * ZodError, which the route maps to 400. Two layers; the inner wins.
 */
const RegisterBodySchema = z.object({
  username: z.string(),
  password: z.string(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  inviteCode: z.string().optional(),
});

export function createAuthRouter(
  handle: DbHandle,
  rateLimiter: LoginRateLimiter,
  config: AuthRoutesConfig = {},
): Router {
  const cookieName = config.cookieName ?? "session";
  const cookieSecure =
    config.cookieSecure ?? process.env.NODE_ENV === "production";
  const ipRateLimiter = config.ipRateLimiter;

  const router = Router();

  router.post("/login", async (req, res) => {
    const parsed = LoginInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { username, password } = parsed.data;

    // Rate-limit check fires BEFORE verification: locked-out attempts
    // must not burn scrypt cycles or leak timing info about whether
    // the account exists.
    if (rateLimiter.isLocked(username)) {
      const retryAfterMs = rateLimiter.retryAfterMs(username);
      res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      res
        .status(429)
        .json({ error: "rate_limited", retryAfterMs });
      return;
    }

    const user = await verifyCredentials(handle, username, password);
    if (!user) {
      rateLimiter.recordFailure(username);
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    rateLimiter.recordSuccess(username);
    const userAgentHeader = req.headers["user-agent"];
    const session = await createSession(handle, user.id, {
      ip: req.ip,
      userAgent: Array.isArray(userAgentHeader)
        ? userAgentHeader.join(", ")
        : userAgentHeader,
    });
    setSessionCookie(res, cookieName, session.cookie, cookieSecure);
    res.status(200).json({ user: toSafeUser(user) });
  });

  router.post("/logout", async (req, res) => {
    // Best-effort: read the cookie value, delete the row. A request
    // without our cookie still gets a 204 — logout is idempotent.
    const sessionCookie = readCookie(req.headers.cookie, cookieName);
    if (sessionCookie) {
      await deleteSession(handle, sessionCookie);
    }
    clearSessionCookie(res, cookieName, cookieSecure);
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    // requireAuth guarantees req.user is set.
    res.status(200).json({ user: toSafeUser(req.user!) });
  });

  router.post("/register", async (req, res, next) => {
    try {
      const parsed = RegisterBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          issues: parsed.error.issues,
        });
        return;
      }

      // Per-SPEC §5.2 the per-IP limit only applies to open-mode
      // register. Read the mode now so the limiter check fires BEFORE
      // any registration work. The double-read (registerWithMode reads
      // it again) is a couple of cheap cached-page lookups; not worth
      // the service-layer coupling to avoid.
      if (ipRateLimiter) {
        const mode = await getRegistrationMode(handle);
        if (mode === "open") {
          const ip = req.ip ?? "unknown";
          if (ipRateLimiter.isLocked(ip)) {
            const retryAfterMs = ipRateLimiter.retryAfterMs(ip);
            res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
            res.status(429).json({
              error: "rate_limited",
              retryAfterMs,
            });
            return;
          }
          // Consume a slot up-front: every attempt (success or
          // failure) counts toward the 3/hour limit. Doing this
          // before the actual register work means a failing
          // registration still costs the IP one slot, which is the
          // intended anti-spam behavior.
          ipRateLimiter.recordFailure(ip);
        }
      }

      const user = await registerWithMode(handle, parsed.data);

      // Auto-login on successful register: create a session, set
      // cookie. Same flow as /setup. Caller gets a usable session
      // immediately rather than having to follow up with /login.
      const userAgentHeader = req.headers["user-agent"];
      const session = await createSession(handle, user.id, {
        ip: req.ip,
        userAgent: Array.isArray(userAgentHeader)
          ? userAgentHeader.join(", ")
          : userAgentHeader,
      });
      setSessionCookie(res, cookieName, session.cookie, cookieSecure);
      res.status(201).json({ user: toSafeUser(user) });
    } catch (err) {
      if (err instanceof RegistrationDisabledError) {
        res.status(403).json({ error: "registration_disabled" });
        return;
      }
      if (err instanceof InvalidInviteCodeError) {
        res.status(400).json({ error: "invalid_invite_code" });
        return;
      }
      if (err instanceof UsernameTakenError) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      if (err instanceof EmailTakenError) {
        res.status(409).json({ error: "email_taken" });
        return;
      }
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: "invalid_request",
          issues: err.issues,
        });
        return;
      }
      next(err);
    }
  });

  return router;
}

/**
 * Parse a single cookie value out of a Cookie: header. Tiny ad-hoc
 * regex — sufficient because we only ever read one cookie name here,
 * and middleware.ts has its own parser for the full scan path.
 */
function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
  );
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Set the session cookie with the full security flag matrix:
 *   - Path=/ (required for `__Host-` prefix)
 *   - Max-Age = 90 days (matches the DB-side absolute cap)
 *   - HttpOnly (no JS access)
 *   - SameSite=Strict (no cross-site sends, even on top-level navs)
 *   - Secure (production only — `__Host-` cookies require it)
 *
 * Exported so the /setup flow can set the cookie identically without
 * duplicating the security-critical flag list.
 */
export function setSessionCookie(
  res: Response,
  cookieName: string,
  cookieValue: string,
  secure: boolean,
): void {
  const flags = [
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) flags.push("Secure");
  res.append(
    "Set-Cookie",
    `${cookieName}=${cookieValue}; ${flags.join("; ")}`,
  );
}

/**
 * Clear the session cookie. Same flag matrix as set, with Max-Age=0
 * and an empty value — the browser deletes any matching cookie.
 */
export function clearSessionCookie(
  res: Response,
  cookieName: string,
  secure: boolean,
): void {
  const flags = ["Path=/", "Max-Age=0", "HttpOnly", "SameSite=Strict"];
  if (secure) flags.push("Secure");
  res.append("Set-Cookie", `${cookieName}=; ${flags.join("; ")}`);
}
