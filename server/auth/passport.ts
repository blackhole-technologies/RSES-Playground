/**
 * @file passport.ts
 * @description Passport.js authentication configuration using local strategy.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * @security Implements secure password hashing with bcrypt and session-based auth.
 */

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "../db";
import { users, type User, type SafeUser } from "@shared/schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

/**
 * Hashes a password using scrypt with a random salt.
 *
 * @param password - Plain text password
 * @returns Hashed password in format "salt:hash"
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
 * @param storedHash - Hash from database in format "salt:hash"
 * @returns True if password matches
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * Removes sensitive fields from user object for safe serialization.
 *
 * @param user - Full user object
 * @returns User without sensitive fields
 */
export function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Finds a user by username.
 *
 * @param username - Username to search for
 * @returns User or null if not found
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0] || null;
}

/**
 * Finds a user by ID.
 *
 * @param id - User ID to search for
 * @returns User or null if not found
 */
export async function findUserById(id: number): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Creates a new user with hashed password.
 *
 * @param username - Unique username
 * @param password - Plain text password (will be hashed)
 * @param email - Optional email address
 * @param displayName - Optional display name
 * @returns Created user (without password hash)
 */
export async function createUser(
  username: string,
  password: string,
  email?: string,
  displayName?: string
): Promise<SafeUser> {
  const passwordHash = await hashPassword(password);

  const result = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      email,
      displayName,
    })
    .returning();

  return toSafeUser(result[0]);
}

/**
 * Updates user's last login timestamp.
 *
 * @param userId - ID of the user to update
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Configures Passport with local strategy.
 * Call this once during server initialization.
 */
export function configurePassport(): void {
  // Configure local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await findUserByUsername(username);

        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }

        // Update last login timestamp
        await updateLastLogin(user.id);

        return done(null, toSafeUser(user));
      } catch (error) {
        return done(error);
      }
    })
  );

  // Serialize user to session (store only user ID)
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as SafeUser).id);
  });

  // Deserialize user from session (load user from ID)
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await findUserById(id);
      if (!user) {
        return done(null, false);
      }
      done(null, toSafeUser(user));
    } catch (error) {
      done(error);
    }
  });
}

// Extend Express types for TypeScript
declare global {
  namespace Express {
    interface User extends SafeUser {}
  }
}
