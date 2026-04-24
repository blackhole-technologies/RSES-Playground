/**
 * Tests for the password-hash primitives.
 *
 * Extracted from the parent repo's tests/security/auth.test.ts. The
 * original test file inlined its own copies of hashPassword/verifyPassword/
 * toSafeUser that were byte-for-byte identical to the production functions
 * in server/auth/passport.ts. This file uses the salvaged source instead.
 *
 * Dropped from the original: "Input Validation Security / Username
 * Validation" tests, which inline a regex and test it — unrelated to the
 * password-hash primitives.
 */

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, toSafeUser } from "../src/password-hash";

// User shape matching the parent repo's schema; used only in toSafeUser tests.
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

describe("Password Hashing", () => {
  it("hashes password with unique salt", async () => {
    const password = "securePassword123";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    // Same password should produce different hashes (different salts).
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

  it("handles hash with mismatched length parts", async () => {
    // Added beyond the original — hits the explicit derivedKey.length !==
    // storedKey.length guard in verifyPassword. The original relied on
    // timingSafeEqual throwing; the salvaged source guards explicitly.
    const isValid = await verifyPassword("test", "abcd:ef");
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
    expect((safeUser as unknown as { passwordHash?: unknown }).passwordHash).toBeUndefined();
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

  it("works with arbitrary user shapes (generic)", () => {
    // The salvaged toSafeUser is generic: any object with a passwordHash
    // field can be passed, regardless of other fields.
    const custom = { id: "abc", passwordHash: "h", tenant: "acme" };
    const safe = toSafeUser(custom);
    expect(safe.id).toBe("abc");
    expect(safe.tenant).toBe("acme");
    expect((safe as unknown as { passwordHash?: unknown }).passwordHash).toBeUndefined();
  });
});

describe("Timing Attack Prevention", () => {
  it("uses constant-time comparison for password verification", async () => {
    // Hash a password once.
    const hash = await hashPassword("testPassword");

    // Time multiple verifications. They should take similar time regardless
    // of how early the mismatch occurs — timingSafeEqual is constant-time
    // in the common-length case, and the explicit length guard short-circuits
    // only on malformed input, not on user-provided wrong passwords.
    const timings: number[] = [];

    for (const testPassword of [
      "testPassword", // correct
      "wrongPassword", // completely wrong
      "testPasswor", // one char short
      "XestPassword", // different first char
    ]) {
      const start = process.hrtime.bigint();
      await verifyPassword(testPassword, hash);
      const end = process.hrtime.bigint();
      timings.push(Number(end - start));
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    const variance =
      timings.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / timings.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / avg;

    // Weak test — scrypt dominates the runtime and drowns out any real
    // timing leak — but catches obvious regressions (e.g. if someone
    // replaced timingSafeEqual with === and started early-exiting).
    expect(coeffOfVariation).toBeLessThan(2);
  });
});
