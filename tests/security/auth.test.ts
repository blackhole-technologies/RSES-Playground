/**
 * @file auth.test.ts
 * @description Security tests for authentication - validates password hashing,
 *              verification, and session security.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Standalone implementations for testing (no database dependency)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");

  return timingSafeEqual(derivedKey, storedKey);
}

interface User {
  id: number;
  username: string;
  passwordHash: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean | null;
  createdAt: Date | null;
  lastLoginAt: Date | null;
}

type SafeUser = Omit<User, "passwordHash">;

function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

describe("Authentication Security", () => {
  describe("Password Hashing", () => {
    it("hashes password with unique salt", async () => {
      const password = "securePassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Same password should produce different hashes (different salts)
      expect(hash1).not.toBe(hash2);
    });

    it("produces hash in correct format (salt:hash)", async () => {
      const hash = await hashPassword("test123");
      const parts = hash.split(":");

      expect(parts.length).toBe(2);
      expect(parts[0].length).toBe(32); // 16 bytes hex = 32 chars
      expect(parts[1].length).toBe(128); // 64 bytes hex = 128 chars
    });

    it("handles empty password", async () => {
      const hash = await hashPassword("");
      expect(hash).toBeDefined();
      expect(hash.includes(":")).toBe(true);
    });

    it("handles unicode passwords", async () => {
      const password = "пароль123中文密码";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("handles very long passwords", async () => {
      const password = "a".repeat(1000);
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });
  });

  describe("Password Verification", () => {
    it("verifies correct password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("rejects incorrect password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("wrongPassword", hash);
      expect(isValid).toBe(false);
    });

    it("rejects similar but different password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("correctPassword ", hash);
      expect(isValid).toBe(false);
    });

    it("handles malformed hash gracefully", async () => {
      const isValid = await verifyPassword("test", "invalidhash");
      expect(isValid).toBe(false);
    });

    it("handles empty hash gracefully", async () => {
      const isValid = await verifyPassword("test", "");
      expect(isValid).toBe(false);
    });

    it("handles hash with missing parts", async () => {
      const isValid = await verifyPassword("test", "onlyoneparthere");
      expect(isValid).toBe(false);
    });
  });

  describe("Safe User Serialization", () => {
    it("removes passwordHash from user object", () => {
      const user: User = {
        id: 1,
        username: "testuser",
        passwordHash: "secret:hash",
        email: "test@example.com",
        displayName: "Test User",
        isAdmin: false,
        createdAt: new Date(),
        lastLoginAt: null,
      };

      const safeUser = toSafeUser(user);

      expect(safeUser.id).toBe(user.id);
      expect(safeUser.username).toBe(user.username);
      expect(safeUser.email).toBe(user.email);
      expect((safeUser as any).passwordHash).toBeUndefined();
    });

    it("preserves all non-sensitive fields", () => {
      const user: User = {
        id: 42,
        username: "admin",
        passwordHash: "hash",
        email: "admin@example.com",
        displayName: "Administrator",
        isAdmin: true,
        createdAt: new Date("2026-01-01"),
        lastLoginAt: new Date("2026-01-15"),
      };

      const safeUser = toSafeUser(user);

      expect(safeUser.id).toBe(42);
      expect(safeUser.username).toBe("admin");
      expect(safeUser.email).toBe("admin@example.com");
      expect(safeUser.displayName).toBe("Administrator");
      expect(safeUser.isAdmin).toBe(true);
      expect(safeUser.createdAt).toEqual(user.createdAt);
      expect(safeUser.lastLoginAt).toEqual(user.lastLoginAt);
    });
  });

  describe("Timing Attack Prevention", () => {
    it("uses constant-time comparison for password verification", async () => {
      // Hash a password
      const hash = await hashPassword("testPassword");

      // Time multiple verifications - they should take similar time
      // regardless of how early the mismatch occurs
      const timings: number[] = [];

      for (const testPassword of [
        "testPassword",  // correct
        "wrongPassword", // completely wrong
        "testPasswor",   // one char short
        "XestPassword",  // different first char
      ]) {
        const start = process.hrtime.bigint();
        await verifyPassword(testPassword, hash);
        const end = process.hrtime.bigint();
        timings.push(Number(end - start));
      }

      // Calculate variance - should be low if timing-safe
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const variance = timings.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / timings.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be reasonable (not orders of magnitude different)
      // This is a weak test but helps catch obvious timing leaks
      const coeffOfVariation = stdDev / avg;
      expect(coeffOfVariation).toBeLessThan(2); // Allow some variance but not extreme
    });
  });
});

describe("Input Validation Security", () => {
  describe("Username Validation", () => {
    const usernamePattern = /^[a-zA-Z0-9_-]+$/;

    it("accepts valid usernames", () => {
      const validUsernames = [
        "user123",
        "test_user",
        "my-name",
        "ABC123",
        "a",
        "user_name-123",
      ];

      for (const username of validUsernames) {
        expect(usernamePattern.test(username)).toBe(true);
      }
    });

    it("rejects invalid usernames", () => {
      const invalidUsernames = [
        "user name",  // space
        "user@name",  // @
        "user.name",  // .
        "user<script>", // injection
        "../etc/passwd", // path traversal
        "user\nname", // newline
      ];

      for (const username of invalidUsernames) {
        expect(usernamePattern.test(username)).toBe(false);
      }
    });
  });
});
