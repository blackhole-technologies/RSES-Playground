/**
 * Auth module service layer — pure functions over a DbHandle.
 *
 * This file grows commit-by-commit through Phase 1: bootstrap token first
 * (this commit), then user registration/login, then session lifecycle. All
 * functions take a DbHandle so callers can choose connection strategy
 * (pooled, transactional, etc.) without service.ts caring.
 *
 * Design choices worth flagging:
 *
 *   - `bootstrap_token_hash` (SHA-256) is stored, not the raw token. The
 *     raw token is returned exactly once by `createBootstrapToken` and
 *     logged by the caller; it never lives in the DB. A leaked DB reveals
 *     nothing actionable.
 *
 *   - Bootstrap operations use explicit transactions with `SELECT ... FOR
 *     UPDATE` on the singleton system_settings row. Two concurrent
 *     `consumeBootstrapToken` calls serialize cleanly: one wins (creates
 *     the admin and marks consumed), the other observes `consumed_at IS
 *     NOT NULL` and returns null.
 *
 *   - Input validation lives in Zod schemas exported alongside the
 *     functions. Invalid input throws `ZodError` synchronously, before
 *     any DB work — callers turn that into a 400.
 */

import crypto from "node:crypto";
import { z } from "zod";
import {
  hashPassword,
  verifyPassword,
} from "../../vendor/13-password-hash/src/password-hash";
import type { DbHandle } from "../../core/db";
import type { Session, User } from "./schema";

/**
 * Builds the SELECT/RETURNING clause for users with optional table-alias
 * prefixing. Keeps column-name aliasing in one place so query shapes
 * stay consistent across functions. Pass `alias` ("u", "users") for
 * queries that JOIN — bare columns are ambiguous in JOIN contexts since
 * `sessions.id` and `users.id` collide. Use `userColumns()` (no alias)
 * for INSERT…RETURNING and single-table SELECTs.
 *
 * password_hash is included; callers that send Users back to the
 * client (`/api/me`, login responses) must strip it via `toSafeUser`.
 */
function userColumns(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `
    ${p}id, ${p}username, ${p}email,
    ${p}password_hash AS "passwordHash",
    ${p}display_name AS "displayName",
    ${p}is_admin AS "isAdmin",
    ${p}profile_public AS "profilePublic",
    ${p}invite_code_used AS "inviteCodeUsed",
    ${p}created_at AS "createdAt",
    ${p}last_login_at AS "lastLoginAt",
    ${p}disabled
  `;
}

// ── Bootstrap token ───────────────────────────────────────────────────────

/** Username regex from SPEC §5.2: 3–32 chars of letters, digits, `_`, `-`. */
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

/**
 * Input for the first-boot admin creation form. SPEC §5.1 lists username
 * and password as required, email and display_name as optional.
 */
export const BootstrapUserInputSchema = z.object({
  username: z
    .string()
    .regex(USERNAME_REGEX, "username must be 3–32 chars of [a-zA-Z0-9_-]"),
  password: z.string().min(8, "password must be at least 8 characters"),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(64).optional(),
});
export type BootstrapUserInput = z.infer<typeof BootstrapUserInputSchema>;

/**
 * Number of random bytes for the bootstrap token. 18 bytes encoded as
 * base64url yields 24 characters with no padding — matches SPEC §5.1's
 * "24-char URL-safe" requirement and gives 144 bits of entropy.
 */
const TOKEN_RANDOM_BYTES = 18;

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Constant-time comparison of two equal-length hex strings. Returns
 * false if lengths differ rather than throwing (timingSafeEqual throws
 * on length mismatch, which would leak length information via the
 * exception path).
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Generate and persist a bootstrap token if and only if:
 *   - the system_settings row has no token hash yet, AND
 *   - bootstrap has not already been consumed, AND
 *   - no users exist.
 *
 * Returns the raw token (caller logs it once per SPEC §5.1) or `null` if
 * any precondition fails. Idempotent under concurrency: two simultaneous
 * calls serialize on the FOR UPDATE row lock, and only the first
 * generates a token — the second observes the now-set hash and returns
 * `null`.
 *
 * Throws if the system_settings row is missing entirely, which would
 * indicate the core init migration was never applied.
 */
export async function createBootstrapToken(
  handle: DbHandle,
): Promise<string | null> {
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");

    const settingsRes = await client.query<{
      bootstrap_token_hash: string | null;
      bootstrap_token_consumed_at: Date | null;
    }>(
      `SELECT bootstrap_token_hash, bootstrap_token_consumed_at
       FROM system_settings WHERE key = 'default' FOR UPDATE`,
    );
    if (settingsRes.rows.length === 0) {
      throw new Error(
        "system_settings row missing — has 0001_core_init.sql been applied?",
      );
    }
    const { bootstrap_token_hash: existingHash, bootstrap_token_consumed_at: consumedAt } =
      settingsRes.rows[0];

    // Already consumed: bootstrap is permanently complete; recovery is CLI-only per SPEC §5.3.
    if (consumedAt !== null) {
      await client.query("ROLLBACK");
      return null;
    }
    // A token already exists and is unconsumed — leave it alone (do not regenerate).
    if (existingHash !== null) {
      await client.query("ROLLBACK");
      return null;
    }
    // Users already exist: bootstrap is not applicable. SPEC §5.1 says
    // tokens only generate on first boot with an empty users table.
    const usersRes = await client.query<{ has_users: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users) AS has_users",
    );
    if (usersRes.rows[0].has_users) {
      await client.query("ROLLBACK");
      return null;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await client.query(
      `UPDATE system_settings
       SET bootstrap_token_hash = $1, updated_at = NOW()
       WHERE key = 'default'`,
      [tokenHash],
    );
    await client.query("COMMIT");
    return rawToken;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify whether `rawToken` matches the unconsumed bootstrap token.
 * Read-only — never advances `bootstrap_token_consumed_at`. Used by
 * `GET /setup` to decide whether to render the admin-creation form
 * (true) or 404 (false). Returns false uniformly for any miss
 * (system_settings missing, no hash set, already consumed, or hash
 * mismatch) so the caller can keep its anti-enumeration story.
 *
 * Concurrency: between this call and a subsequent POST the consumer
 * may race. The POST goes through `consumeBootstrapToken`, which
 * holds a FOR UPDATE lock and checks consumed_at again — a winning
 * concurrent consume just makes our caller's POST 404 cleanly.
 */
export async function verifyBootstrapToken(
  handle: DbHandle,
  rawToken: string,
): Promise<boolean> {
  const incomingHash = hashToken(rawToken);
  const res = await handle.pool.query<{
    bootstrap_token_hash: string | null;
    bootstrap_token_consumed_at: Date | null;
  }>(
    `SELECT bootstrap_token_hash, bootstrap_token_consumed_at
     FROM system_settings WHERE key = 'default'`,
  );
  if (res.rows.length === 0) return false;
  const { bootstrap_token_hash: storedHash, bootstrap_token_consumed_at: consumedAt } =
    res.rows[0];
  if (storedHash === null || consumedAt !== null) return false;
  return timingSafeEqualHex(incomingHash, storedHash);
}

/**
 * Consume a raw bootstrap token: validate input, look up the stored
 * hash, compare, create the admin user, and mark consumed — atomically.
 *
 * Returns the new admin User on success, or `null` if:
 *   - no token is set,
 *   - the token does not match,
 *   - the token has already been consumed.
 *
 * Throws `ZodError` if `userInput` fails validation. Does not throw on
 * a wrong/used token — those are normal authentication misses, not
 * exceptional conditions, and the caller maps them to a 404 (SPEC §5.1's
 * anti-enumeration choice).
 *
 * Concurrency: two simultaneous calls with the same valid token will
 * both block on the FOR UPDATE; whichever commits first wins, and the
 * second observes `consumed_at IS NOT NULL` and returns `null`.
 */
export async function consumeBootstrapToken(
  handle: DbHandle,
  rawToken: string,
  userInput: BootstrapUserInput,
): Promise<User | null> {
  // Validate first — fail fast before opening a DB transaction.
  const validated = BootstrapUserInputSchema.parse(userInput);

  const incomingHash = hashToken(rawToken);
  const passwordHash = await hashPassword(validated.password);

  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");

    const settingsRes = await client.query<{
      bootstrap_token_hash: string | null;
      bootstrap_token_consumed_at: Date | null;
    }>(
      `SELECT bootstrap_token_hash, bootstrap_token_consumed_at
       FROM system_settings WHERE key = 'default' FOR UPDATE`,
    );
    if (settingsRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const { bootstrap_token_hash: storedHash, bootstrap_token_consumed_at: consumedAt } =
      settingsRes.rows[0];

    // No active bootstrap, or already consumed.
    if (storedHash === null || consumedAt !== null) {
      await client.query("ROLLBACK");
      return null;
    }
    // Token mismatch.
    if (!timingSafeEqualHex(incomingHash, storedHash)) {
      await client.query("ROLLBACK");
      return null;
    }

    // Create the admin user. is_admin = TRUE per SPEC §5.1.
    const userRes = await client.query<User>(
      `INSERT INTO users (username, email, password_hash, display_name, is_admin)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING ${userColumns()}`,
      [
        validated.username,
        validated.email ?? null,
        passwordHash,
        validated.displayName ?? null,
      ],
    );
    const user = userRes.rows[0];

    // Mark the token consumed. We deliberately keep the hash; clearing it
    // would erase the audit trail of what was used at first-boot.
    await client.query(
      `UPDATE system_settings
       SET bootstrap_token_consumed_at = NOW(), updated_at = NOW()
       WHERE key = 'default'`,
    );

    await client.query("COMMIT");
    return user;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── User registration & credential verification ───────────────────────────

/**
 * Thrown when registerUser detects a username that case-folds to an
 * existing one. Mapped to HTTP 409 by the registration route.
 */
export class UsernameTakenError extends Error {
  constructor(public readonly username: string) {
    super(`username already taken: ${username}`);
    this.name = "UsernameTakenError";
  }
}

/**
 * Thrown when registerUser detects an email that case-folds to an
 * existing one (only fires when the input email is non-null).
 */
export class EmailTakenError extends Error {
  constructor(public readonly email: string) {
    super(`email already taken: ${email}`);
    this.name = "EmailTakenError";
  }
}

/**
 * Input shape for `registerUser`. `inviteCodeUsed` is filled in by the
 * route after it has separately validated and consumed the invite_codes
 * row — registerUser itself does not touch invite_codes (that's the
 * route's orchestration concern).
 */
export const RegisterUserInputSchema = z.object({
  username: z
    .string()
    .regex(USERNAME_REGEX, "username must be 3–32 chars of [a-zA-Z0-9_-]"),
  password: z.string().min(8, "password must be at least 8 characters"),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(64).optional(),
  inviteCodeUsed: z.string().optional(),
});
export type RegisterUserInput = z.infer<typeof RegisterUserInputSchema>;

/**
 * Create a non-admin user. Always inserts with `is_admin = FALSE` —
 * admin elevation is a separate concern (bootstrap flow, future admin
 * action). Caller is responsible for enforcing `system_settings
 * .registration_mode` (`disabled` / `invite` / `open`) before calling.
 *
 * Throws `ZodError` on invalid input, `UsernameTakenError` /
 * `EmailTakenError` on case-insensitive uniqueness collision, or
 * propagates other DB errors. Returns the new User on success.
 */
export async function registerUser(
  handle: DbHandle,
  input: RegisterUserInput,
): Promise<User> {
  const validated = RegisterUserInputSchema.parse(input);
  const passwordHash = await hashPassword(validated.password);

  try {
    const res = await handle.pool.query<User>(
      `INSERT INTO users (username, email, password_hash, display_name, invite_code_used)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${userColumns()}`,
      [
        validated.username,
        validated.email ?? null,
        passwordHash,
        validated.displayName ?? null,
        validated.inviteCodeUsed ?? null,
      ],
    );
    return res.rows[0];
  } catch (err) {
    // Map Postgres unique-violation errors to typed exceptions so the
    // route can return 409 without parsing error strings itself. The
    // index names come from 0001_auth_init.sql.
    if (err instanceof Error) {
      if (/users_username_lower_idx/.test(err.message)) {
        throw new UsernameTakenError(validated.username);
      }
      if (/users_email_lower_idx/.test(err.message)) {
        // email is guaranteed non-null at this point because the unique
        // index is partial (WHERE email IS NOT NULL).
        throw new EmailTakenError(validated.email!);
      }
    }
    throw err;
  }
}

/**
 * Verify a `(username, password)` pair against the users table.
 *
 * Returns the matching User on success, `null` on any failure mode:
 * unknown username, wrong password, or disabled account. A single null
 * return type collapses these into one anti-enumeration response so
 * callers can answer 401 without leaking which condition failed (SPEC
 * §5.3).
 *
 * Username lookup is case-insensitive via the functional unique index
 * (`WHERE lower(username) = lower($1)`) — matches the case-fold
 * uniqueness contract from registration.
 *
 * Note on timing: when the username does not exist this function
 * returns without invoking scrypt, which is faster than the
 * password-verifying path. An attacker measuring response time could
 * distinguish "user exists but wrong password" from "user does not
 * exist". This is mitigated in practice by the per-username login rate
 * limit (5 failures / 15 minutes per SPEC §5.3) which lands in a later
 * commit; until then the timing leak is documented but not closed.
 */
export async function verifyCredentials(
  handle: DbHandle,
  username: string,
  password: string,
): Promise<User | null> {
  const res = await handle.pool.query<User>(
    `SELECT ${userColumns()} FROM users
     WHERE lower(username) = lower($1)`,
    [username],
  );
  if (res.rows.length === 0) return null;
  const user = res.rows[0];

  // Disabled accounts cannot log in. Returning null (instead of a typed
  // "disabled" error) preserves anti-enumeration: an attacker with a
  // stolen-but-disabled username sees identical behavior to a wrong
  // password.
  if (user.disabled) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

// ── Session lifecycle ─────────────────────────────────────────────────────

/**
 * Number of random bytes for session cookie tokens. 32 bytes = 256 bits
 * of entropy, base64url-encoded into a 43-char URL-safe string. Long
 * enough that brute-force is intractable; short enough that the cookie
 * fits comfortably under any header-size limit.
 */
const SESSION_COOKIE_BYTES = 32;

/**
 * Absolute session lifetime. Per SPEC §5.3: "absolute 90-day cap from
 * `created_at`". After this, the session is dead regardless of activity.
 */
const SESSION_ABSOLUTE_TTL_DAYS = 90;

/**
 * Sliding inactivity window. Per SPEC §5.3: "sessions expire after 30
 * days of inactivity". Each request through `loadSessionUser` resets
 * the clock by bumping `last_active_at`.
 */
const SESSION_INACTIVITY_TTL_DAYS = 30;

export interface CreateSessionOptions {
  /** Caller-captured client IP. Stored verbatim; nullable. */
  ip?: string;
  /** Caller-captured User-Agent. Stored verbatim; nullable. */
  userAgent?: string;
}

/**
 * Create a session row for `userId`, generate a random opaque cookie
 * token, set absolute expiry to `NOW() + 90 days`, and update the
 * user's `last_login_at` — all in one transaction. Returns the full
 * Session row including the raw cookie value (caller sets this on the
 * response cookie).
 *
 * Caller is responsible for confirming the user is allowed to log in
 * (use `verifyCredentials` first); this function does not re-check
 * `disabled` or password.
 */
export async function createSession(
  handle: DbHandle,
  userId: string,
  options: CreateSessionOptions = {},
): Promise<Session> {
  const cookie = crypto
    .randomBytes(SESSION_COOKIE_BYTES)
    .toString("base64url");

  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    const sessionRes = await client.query<Session>(
      `INSERT INTO sessions (user_id, cookie, expires_at, ip, user_agent)
       VALUES (
         $1, $2,
         NOW() + ($3::int || ' days')::interval,
         $4, $5
       )
       RETURNING id, user_id AS "userId", cookie,
                 expires_at AS "expiresAt",
                 last_active_at AS "lastActiveAt",
                 created_at AS "createdAt",
                 ip, user_agent AS "userAgent"`,
      [
        userId,
        cookie,
        SESSION_ABSOLUTE_TTL_DAYS,
        options.ip ?? null,
        options.userAgent ?? null,
      ],
    );
    await client.query(
      "UPDATE users SET last_login_at = NOW() WHERE id = $1",
      [userId],
    );
    await client.query("COMMIT");
    return sessionRes.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve a cookie token to the owning User, applying the full
 * expiration matrix. Returns the User on success, null on any miss:
 * unknown cookie, absolute expiry passed, inactivity window exceeded,
 * or disabled user. The four miss modes collapse to a single null
 * return so the caller (middleware) can answer 401 uniformly.
 *
 * Side effect: bumps `last_active_at` to NOW() on a successful lookup.
 * That's the sliding-expiry mechanism — a request that resolves to a
 * valid session resets its inactivity clock. A concurrent DELETE
 * between the SELECT and UPDATE is benign (the UPDATE just touches
 * zero rows; the User has already been resolved).
 */
export async function loadSessionUser(
  handle: DbHandle,
  cookie: string,
): Promise<User | null> {
  const res = await handle.pool.query<User>(
    `SELECT ${userColumns("u")}
     FROM sessions s
       JOIN users u ON u.id = s.user_id
     WHERE s.cookie = $1
       AND s.expires_at > NOW()
       AND s.last_active_at > NOW() - ($2::int || ' days')::interval
       AND NOT u.disabled`,
    [cookie, SESSION_INACTIVITY_TTL_DAYS],
  );
  if (res.rows.length === 0) return null;

  await handle.pool.query(
    "UPDATE sessions SET last_active_at = NOW() WHERE cookie = $1",
    [cookie],
  );
  return res.rows[0];
}

/**
 * Delete the session row identified by `cookie`. Returns true if a row
 * was deleted, false otherwise. Idempotent — calling twice with the
 * same cookie returns true once and false once.
 *
 * Used by `POST /api/auth/logout`. Distinct from `expireSessions`,
 * which is the bulk cleanup path.
 */
export async function deleteSession(
  handle: DbHandle,
  cookie: string,
): Promise<boolean> {
  const res = await handle.pool.query(
    "DELETE FROM sessions WHERE cookie = $1",
    [cookie],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Bulk-delete sessions that have hit their absolute expiry OR exceeded
 * the inactivity window. Returns the number of rows removed. Designed
 * to be called periodically by a scheduled job — running it on every
 * request would be wasteful.
 */
export async function expireSessions(handle: DbHandle): Promise<number> {
  const res = await handle.pool.query(
    `DELETE FROM sessions
     WHERE expires_at <= NOW()
        OR last_active_at <= NOW() - ($1::int || ' days')::interval`,
    [SESSION_INACTIVITY_TTL_DAYS],
  );
  return res.rowCount ?? 0;
}
