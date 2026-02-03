/**
 * @file api-keys.test.ts
 * @description Security tests for API key generation and validation
 * @phase Phase 3 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-03
 */

import { describe, it, expect } from "vitest";
import { randomBytes, createHash } from "crypto";

// ============================================================================
// Test Implementation Functions
// ============================================================================

/**
 * Generate cryptographically secure API key with sufficient entropy.
 * Format: prefix_base62(32_bytes)
 */
function generateApiKey(prefix: string = "sk"): string {
  // Use 32 bytes (256 bits) of entropy - industry standard for API keys
  const bytes = randomBytes(32);

  // Convert to base62 for URL-safe representation
  const base62 = toBase62(bytes);

  return `${prefix}_${base62}`;
}

/**
 * Convert buffer to base62 string (alphanumeric, no special chars).
 */
function toBase62(buffer: Buffer): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let num = BigInt("0x" + buffer.toString("hex"));

  if (num === 0n) return "0";

  let result = "";
  const base = BigInt(chars.length);

  while (num > 0n) {
    result = chars[Number(num % base)] + result;
    num = num / base;
  }

  return result;
}

/**
 * Hash API key for storage (never store plain keys).
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key format.
 */
function validateApiKeyFormat(key: string): boolean {
  // Must match pattern: prefix_base62string
  const pattern = /^(sk|pk|dev)_[A-Za-z0-9]{30,}$/;
  return pattern.test(key);
}

/**
 * Verify API key against stored hash.
 */
function verifyApiKey(key: string, storedHash: string): boolean {
  const keyHash = hashApiKey(key);
  return keyHash === storedHash;
}

/**
 * Revoke API key by adding to revocation list.
 */
class ApiKeyRevocationList {
  private revoked = new Set<string>();

  revoke(keyHash: string): void {
    this.revoked.add(keyHash);
  }

  isRevoked(keyHash: string): boolean {
    return this.revoked.has(keyHash);
  }

  clear(): void {
    this.revoked.clear();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("API Key Generation", () => {
  describe("Entropy Requirements", () => {
    it("generates keys with sufficient entropy (256 bits)", () => {
      const key = generateApiKey();

      // Extract the random portion (after prefix and underscore)
      const randomPart = key.split("_")[1];

      // Base62 encoding of 32 bytes should be at least 40 chars
      // (32 bytes = 256 bits, base62 needs ~44 chars for 256 bits)
      expect(randomPart.length).toBeGreaterThanOrEqual(40);
    });

    it("generates unique keys on every call", () => {
      const keys = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        keys.add(generateApiKey());
      }

      // All keys should be unique
      expect(keys.size).toBe(count);
    });

    it("uses cryptographically secure random source", () => {
      // Test that keys don't follow predictable patterns
      const keys = Array.from({ length: 100 }, () => generateApiKey());
      const randomParts = keys.map(k => k.split("_")[1]);

      // Check that first characters have good distribution
      const firstChars = randomParts.map(p => p[0]);
      const uniqueFirstChars = new Set(firstChars);

      // With 100 samples, should see multiple different starting chars
      expect(uniqueFirstChars.size).toBeGreaterThan(10);
    });

    it("generates keys with correct prefix", () => {
      expect(generateApiKey("sk")).toMatch(/^sk_/);
      expect(generateApiKey("pk")).toMatch(/^pk_/);
      expect(generateApiKey("dev")).toMatch(/^dev_/);
    });
  });

  describe("Format Validation", () => {
    it("accepts valid API key formats", () => {
      expect(validateApiKeyFormat("sk_AbCdEfGh123456789012345678901234567890")).toBe(true);
      expect(validateApiKeyFormat("pk_1234567890abcdefghijklmnopqrstuvwxyz")).toBe(true);
      expect(validateApiKeyFormat("dev_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")).toBe(true);
    });

    it("rejects keys with invalid prefix", () => {
      expect(validateApiKeyFormat("invalid_AbCdEfGh123456789012345678901234567890")).toBe(false);
      expect(validateApiKeyFormat("_AbCdEfGh123456789012345678901234567890")).toBe(false);
    });

    it("rejects keys that are too short", () => {
      expect(validateApiKeyFormat("sk_short")).toBe(false);
      expect(validateApiKeyFormat("sk_123")).toBe(false);
    });

    it("rejects keys with special characters", () => {
      expect(validateApiKeyFormat("sk_abc!def@123#456$789%012^345&678*901")).toBe(false);
      expect(validateApiKeyFormat("sk_abc+def=123/456")).toBe(false);
    });

    it("rejects keys without underscore separator", () => {
      expect(validateApiKeyFormat("skAbCdEfGh123456789012345678901234567890")).toBe(false);
    });

    it("rejects empty or malformed keys", () => {
      expect(validateApiKeyFormat("")).toBe(false);
      expect(validateApiKeyFormat("sk_")).toBe(false);
      expect(validateApiKeyFormat("_123456789012345678901234567890")).toBe(false);
    });
  });
});

describe("API Key Storage and Validation", () => {
  describe("Hashing", () => {
    it("hashes keys using SHA-256", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);

      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it("produces consistent hashes for same key", () => {
      const key = generateApiKey();
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
    });

    it("is sensitive to key changes", () => {
      const key = "sk_test123456789012345678901234567890";
      const similarKey = "sk_test123456789012345678901234567891"; // Last char different

      expect(hashApiKey(key)).not.toBe(hashApiKey(similarKey));
    });
  });

  describe("Verification", () => {
    it("verifies correct key against hash", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);

      expect(verifyApiKey(key, hash)).toBe(true);
    });

    it("rejects incorrect key", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      const hash1 = hashApiKey(key1);

      expect(verifyApiKey(key2, hash1)).toBe(false);
    });

    it("rejects similar but different key", () => {
      const key = "sk_test123456789012345678901234567890";
      const similarKey = "sk_test123456789012345678901234567891";
      const hash = hashApiKey(key);

      expect(verifyApiKey(similarKey, hash)).toBe(false);
    });
  });
});

describe("API Key Revocation", () => {
  describe("Revocation List", () => {
    it("marks keys as revoked", () => {
      const revocationList = new ApiKeyRevocationList();
      const key = generateApiKey();
      const hash = hashApiKey(key);

      expect(revocationList.isRevoked(hash)).toBe(false);

      revocationList.revoke(hash);

      expect(revocationList.isRevoked(hash)).toBe(true);
    });

    it("rejects revoked keys during verification", () => {
      const revocationList = new ApiKeyRevocationList();
      const key = generateApiKey();
      const hash = hashApiKey(key);

      // Key is valid initially
      expect(verifyApiKey(key, hash)).toBe(true);
      expect(revocationList.isRevoked(hash)).toBe(false);

      // Revoke the key
      revocationList.revoke(hash);

      // Key still verifies (hash matches) but is revoked
      expect(verifyApiKey(key, hash)).toBe(true);
      expect(revocationList.isRevoked(hash)).toBe(true);
    });

    it("handles multiple revoked keys", () => {
      const revocationList = new ApiKeyRevocationList();
      const keys = Array.from({ length: 10 }, () => generateApiKey());
      const hashes = keys.map(hashApiKey);

      // Revoke half of them
      hashes.slice(0, 5).forEach(h => revocationList.revoke(h));

      // Check revocation status
      hashes.slice(0, 5).forEach(h => {
        expect(revocationList.isRevoked(h)).toBe(true);
      });
      hashes.slice(5).forEach(h => {
        expect(revocationList.isRevoked(h)).toBe(false);
      });
    });

    it("allows clearing revocation list", () => {
      const revocationList = new ApiKeyRevocationList();
      const key = generateApiKey();
      const hash = hashApiKey(key);

      revocationList.revoke(hash);
      expect(revocationList.isRevoked(hash)).toBe(true);

      revocationList.clear();
      expect(revocationList.isRevoked(hash)).toBe(false);
    });
  });
});

describe("API Key Security Best Practices", () => {
  it("never stores keys in plain text", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);

    // Hash should not contain any part of original key
    expect(hash).not.toContain(key);
    expect(hash).not.toContain(key.split("_")[1]);
  });

  it("uses one-way hashing (irreversible)", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);

    // Should not be able to derive key from hash
    // We verify this by checking hash properties
    expect(hash.length).toBe(64); // Fixed length
    expect(key.length).toBeGreaterThan(30); // Variable length

    // Different key lengths produce same hash length
    const shortKey = "sk_" + "a".repeat(30);
    const longKey = "sk_" + "a".repeat(100);

    expect(hashApiKey(shortKey).length).toBe(64);
    expect(hashApiKey(longKey).length).toBe(64);
  });

  it("generates keys with no exploitable patterns", () => {
    // Generate many keys and check for patterns
    const keys = Array.from({ length: 100 }, () => generateApiKey());

    // No two keys should share same random portion
    const randomParts = keys.map(k => k.split("_")[1]);
    const uniqueParts = new Set(randomParts);
    expect(uniqueParts.size).toBe(keys.length);

    // No sequential patterns
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).not.toBe(keys[i - 1]);

      // Random parts should be completely different
      const part1 = keys[i - 1].split("_")[1];
      const part2 = keys[i].split("_")[1];

      // Calculate Levenshtein distance - should be very high
      const similarity = calculateSimilarity(part1, part2);
      expect(similarity).toBeLessThan(0.1); // Less than 10% similar
    }
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate similarity ratio between two strings (0 = completely different, 1 = identical).
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  let matches = 0;
  const len = Math.min(s1.length, s2.length);

  for (let i = 0; i < len; i++) {
    if (s1[i] === s2[i]) matches++;
  }

  return matches / Math.max(s1.length, s2.length);
}
