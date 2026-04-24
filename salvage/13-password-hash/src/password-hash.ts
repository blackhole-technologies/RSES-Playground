/**
 * @file password-hash.ts
 * @description Password hashing and verification using scrypt.
 *
 * Extracted from the parent repo's server/auth/passport.ts. Functions are
 * identical to the originals; the surrounding passport/session/route glue
 * is deliberately not included — see the README for rationale.
 */

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/**
 * Hashes a password using scrypt with a random salt.
 *
 * @param password - Plain text password
 * @returns Hashed password in format "salt:hash" (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a password against a stored hash using timing-safe comparison.
 *
 * @param password - Plain text password to verify
 * @param storedHash - Hash from storage in format "salt:hash"
 * @returns True if password matches, false otherwise. Returns false on
 *          malformed input rather than throwing.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");

  // Timing-safe comparison. timingSafeEqual throws if buffers are different
  // lengths, so we guard that first to preserve the "returns false on
  // malformed input" contract rather than leaking information via an error.
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * Removes the passwordHash field from a user-like object so the caller
 * cannot accidentally send it to an API response.
 *
 * Generic in the input type: works with any shape that has a passwordHash
 * field, regardless of what other fields it has.
 *
 * @param user - Object with a passwordHash field
 * @returns Same object minus the passwordHash field
 */
export function toSafeUser<T extends { passwordHash: unknown }>(
  user: T
): Omit<T, "passwordHash"> {
  const { passwordHash: _unused, ...safeUser } = user;
  return safeUser;
}
