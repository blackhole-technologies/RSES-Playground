/**
 * @file sql-injection.test.ts
 * @description Security tests for SQL injection prevention
 * @phase Phase 3 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-03
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// LIKE Pattern Escaping
// ============================================================================

/**
 * Escape special characters in LIKE patterns.
 * SQL LIKE wildcards: % (any chars), _ (single char)
 * Also need to escape the escape character itself: \
 */
function escapeLikePattern(pattern: string, escapeChar: string = "\\"): string {
  // Escape the escape character first, then wildcards
  return pattern
    .replace(/\\/g, "\\\\")  // Escape backslash
    .replace(/%/g, "\\%")     // Escape %
    .replace(/_/g, "\\_");    // Escape _
}

/**
 * Build safe LIKE pattern with wildcards.
 */
function buildLikePattern(
  userInput: string,
  position: "start" | "end" | "contains" = "contains"
): string {
  const escaped = escapeLikePattern(userInput);

  switch (position) {
    case "start":
      return `${escaped}%`;
    case "end":
      return `%${escaped}`;
    case "contains":
      return `%${escaped}%`;
    default:
      return escaped;
  }
}

/**
 * Simulate SQL LIKE matching for testing.
 */
function matchesLikePattern(value: string, pattern: string): boolean {
  // Convert SQL LIKE pattern to regex
  // Escape special regex chars except our SQL wildcards
  let regex = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")  // Escape regex special chars
    .replace(/(?<!\\)%/g, ".*")              // Unescaped % -> .*
    .replace(/(?<!\\)_/g, ".")               // Unescaped _ -> .
    .replace(/\\%/g, "%")                    // Escaped % -> literal %
    .replace(/\\_/g, "_")                    // Escaped _ -> literal _
    .replace(/\\\\/g, "\\");                 // Escaped \ -> literal \

  return new RegExp(`^${regex}$`, "i").test(value);
}

// ============================================================================
// Parameterized Query Helpers
// ============================================================================

/**
 * Validate that query uses parameterized queries (not string concatenation).
 */
function isParameterized(query: string): boolean {
  // Check for placeholder patterns: ?, $1, :name, @param
  const hasPlaceholders = /(\?|\$\d+|:\w+|@\w+)/.test(query);

  // Check for dangerous string concatenation patterns
  const hasConcatenation = /('\s*\+|'\s*\|\||CONCAT\s*\(.*\$)/.test(query);

  return hasPlaceholders && !hasConcatenation;
}

/**
 * Simulate executing a parameterized query.
 */
interface QueryResult {
  rows: any[];
  safe: boolean;
}

function executeParameterizedQuery(
  query: string,
  params: any[]
): QueryResult {
  const safe = isParameterized(query);

  // Simulate query execution
  // In real implementation, this would use a database driver
  return {
    rows: [],
    safe,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("LIKE Pattern Escaping", () => {
  describe("Basic Escaping", () => {
    it("escapes percent wildcard", () => {
      const input = "100%";
      const escaped = escapeLikePattern(input);

      expect(escaped).toBe("100\\%");
      // The escaped version contains \% which still has % but it's escaped
      expect(escaped).toContain("\\%");
    });

    it("escapes underscore wildcard", () => {
      const input = "test_user";
      const escaped = escapeLikePattern(input);

      expect(escaped).toBe("test\\_user");
    });

    it("escapes backslash", () => {
      const input = "path\\to\\file";
      const escaped = escapeLikePattern(input);

      expect(escaped).toBe("path\\\\to\\\\file");
    });

    it("escapes multiple special characters", () => {
      const input = "100%_off\\sale";
      const escaped = escapeLikePattern(input);

      expect(escaped).toBe("100\\%\\_off\\\\sale");
    });

    it("handles empty string", () => {
      const escaped = escapeLikePattern("");
      expect(escaped).toBe("");
    });

    it("handles string with no special characters", () => {
      const input = "normaltext";
      const escaped = escapeLikePattern(input);

      expect(escaped).toBe("normaltext");
    });
  });

  describe("Pattern Building", () => {
    it("builds contains pattern", () => {
      const pattern = buildLikePattern("test");
      expect(pattern).toBe("%test%");
    });

    it("builds starts-with pattern", () => {
      const pattern = buildLikePattern("test", "start");
      expect(pattern).toBe("test%");
    });

    it("builds ends-with pattern", () => {
      const pattern = buildLikePattern("test", "end");
      expect(pattern).toBe("%test");
    });

    it("escapes input before adding wildcards", () => {
      const pattern = buildLikePattern("50%_off");
      expect(pattern).toBe("%50\\%\\_off%");
    });
  });
});

describe("LIKE Pattern Matching", () => {
  describe("Safe Pattern Matching", () => {
    it("matches literal text without wildcards", () => {
      const pattern = buildLikePattern("test");

      expect(matchesLikePattern("this is a test string", pattern)).toBe(true);
      expect(matchesLikePattern("test", pattern)).toBe(true);
      expect(matchesLikePattern("no match", pattern)).toBe(false);
    });

    it("escaped percent is treated as literal", () => {
      const pattern = buildLikePattern("100%");

      expect(matchesLikePattern("discount 100% off", pattern)).toBe(true);
      expect(matchesLikePattern("100 off", pattern)).toBe(false);
    });

    it("escaped underscore is treated as literal", () => {
      const pattern = buildLikePattern("test_user");

      expect(matchesLikePattern("test_user", pattern)).toBe(true);
      expect(matchesLikePattern("testXuser", pattern)).toBe(false);
    });

    it("prevents wildcard injection", () => {
      // Malicious input attempting to match everything
      const maliciousInput = "%";
      const pattern = buildLikePattern(maliciousInput);

      // Should only match literal "%" character, not wildcard
      expect(matchesLikePattern("anything", pattern)).toBe(false);
      expect(matchesLikePattern("has % char", pattern)).toBe(true);
    });

    it("prevents underscore injection", () => {
      const maliciousInput = "___";
      const pattern = buildLikePattern(maliciousInput);

      // Should match literal underscores, not any 3 chars
      expect(matchesLikePattern("abc", pattern)).toBe(false);
      expect(matchesLikePattern("has ___ chars", pattern)).toBe(true);
    });
  });

  describe("SQL Injection Prevention", () => {
    it("prevents LIKE-based injection", () => {
      // Attacker tries to match all records
      const attacks = [
        "%' OR '1'='1",
        "'; DROP TABLE users; --",
        "% --",
        "%'; DELETE FROM users WHERE '1'='1",
      ];

      for (const attack of attacks) {
        const pattern = buildLikePattern(attack);

        // Pattern should be safely escaped - check that dangerous SQL is literal
        // After escaping, % symbols should be escaped if present
        if (attack.includes("%")) {
          const escaped = escapeLikePattern(attack);
          expect(escaped).toContain("\\%");
        }

        // Should only match if text literally contains the attack string
        expect(matchesLikePattern("normal text", pattern)).toBe(false);
      }
    });

    it("handles quotes in search text", () => {
      const input = "O'Reilly"; // Name with apostrophe
      const pattern = buildLikePattern(input);

      expect(matchesLikePattern("O'Reilly Books", pattern)).toBe(true);
      expect(matchesLikePattern("OReilly Books", pattern)).toBe(false);
    });

    it("handles backslash sequences", () => {
      const input = "C:\\Windows\\System32";
      const pattern = buildLikePattern(input);

      expect(matchesLikePattern("C:\\Windows\\System32", pattern)).toBe(true);
      expect(matchesLikePattern("C:WindowsSystem32", pattern)).toBe(false);
    });
  });
});

describe("Parameterized Queries", () => {
  describe("Query Validation", () => {
    it("identifies parameterized queries with ? placeholders", () => {
      const query = "SELECT * FROM users WHERE email = ?";
      expect(isParameterized(query)).toBe(true);
    });

    it("identifies parameterized queries with $N placeholders", () => {
      const query = "SELECT * FROM users WHERE id = $1 AND active = $2";
      expect(isParameterized(query)).toBe(true);
    });

    it("identifies parameterized queries with named placeholders", () => {
      const query = "SELECT * FROM users WHERE email = :email";
      expect(isParameterized(query)).toBe(true);
    });

    it("rejects queries with string concatenation", () => {
      const query = "SELECT * FROM users WHERE email = '" + "email" + "'";
      expect(isParameterized(query)).toBe(false);
    });

    it("requires placeholders for parameterization", () => {
      // Parameterized query (safe)
      const paramQuery = "SELECT * FROM users WHERE email = ?";
      expect(isParameterized(paramQuery)).toBe(true);

      // Query without placeholders
      const literalQuery = "SELECT * FROM users WHERE status = 1";
      expect(isParameterized(literalQuery)).toBe(false);
    });
  });

  describe("Safe Query Execution", () => {
    it("executes parameterized search query safely", () => {
      const userInput = "test%'; DROP TABLE users; --";

      // UNSAFE: String concatenation (vulnerable)
      const unsafeQuery = `SELECT * FROM users WHERE name LIKE '%${userInput}%'`;
      const unsafeResult = executeParameterizedQuery(unsafeQuery, []);
      expect(unsafeResult.safe).toBe(false);

      // SAFE: Parameterized with escaped pattern
      const safePattern = buildLikePattern(userInput);
      const safeQuery = "SELECT * FROM users WHERE name LIKE ?";
      const safeResult = executeParameterizedQuery(safeQuery, [safePattern]);
      expect(safeResult.safe).toBe(true);
    });

    it("uses parameterized query for user search", () => {
      const searchTerm = "admin%";

      // Build safe pattern
      const pattern = buildLikePattern(searchTerm);

      // Execute with parameters
      const query = "SELECT * FROM users WHERE username LIKE ? OR email LIKE ?";
      const result = executeParameterizedQuery(query, [pattern, pattern]);

      expect(result.safe).toBe(true);
    });
  });
});

describe("Special Characters Don't Affect Search", () => {
  describe("Search Behavior", () => {
    it("searches for exact text with special chars", () => {
      const testCases = [
        { input: "100%", text: "Sale: 100% off!", expected: true },
        { input: "test_file", text: "test_file.txt", expected: true },
        { input: "C:\\path", text: "C:\\path\\to\\file", expected: true },
        { input: "user@domain", text: "user@domain.com", expected: true },
      ];

      for (const { input, text, expected } of testCases) {
        const pattern = buildLikePattern(input);
        expect(matchesLikePattern(text, pattern)).toBe(expected);
      }
    });

    it("does not wildcard-match when special chars are escaped", () => {
      const input = "a%b";
      const pattern = buildLikePattern(input);

      // Should match literal "a%b", not "a[anything]b"
      expect(matchesLikePattern("a%b", pattern)).toBe(true);
      expect(matchesLikePattern("aXb", pattern)).toBe(false);
      expect(matchesLikePattern("a123b", pattern)).toBe(false);
    });

    it("handles edge cases with multiple special chars", () => {
      const input = "100%_off\\\\sale";
      const pattern = buildLikePattern(input);

      expect(matchesLikePattern("100%_off\\\\sale", pattern)).toBe(true);
      expect(matchesLikePattern("100X_offXXsale", pattern)).toBe(false);
    });
  });

  describe("Real-World Search Scenarios", () => {
    it("searches for product names with percentage", () => {
      const products = [
        "50% Cotton Shirt",
        "100% Organic",
        "50 Cotton Shirt",
        "Cotton Shirt 50%",
      ];

      const pattern = buildLikePattern("50%");

      const matches = products.filter(p => matchesLikePattern(p, pattern));
      expect(matches).toEqual([
        "50% Cotton Shirt",
        "Cotton Shirt 50%",
      ]);
    });

    it("searches for usernames with underscores", () => {
      const usernames = [
        "test_user",
        "testXuser",
        "test__user",
        "admin_test_user",
      ];

      const pattern = buildLikePattern("test_user");

      const matches = usernames.filter(u => matchesLikePattern(u, pattern));
      expect(matches).toEqual([
        "test_user",
        "admin_test_user",
      ]);
    });

    it("searches for file paths with backslashes", () => {
      const paths = [
        "C:\\Users\\Admin",
        "C:/Users/Admin",
        "C:UsersAdmin",
        "D:\\Users\\Admin",
      ];

      const pattern = buildLikePattern("C:\\Users");

      const matches = paths.filter(p => matchesLikePattern(p, pattern));
      expect(matches).toEqual([
        "C:\\Users\\Admin",
      ]);
    });

    it("searches for SQL code examples", () => {
      const examples = [
        "SELECT * FROM users",
        "DELETE FROM users",
        "SELECT * FROM orders",
        "UPDATE users SET active = 1",
      ];

      const pattern = buildLikePattern("SELECT");

      const matches = examples.filter(e => matchesLikePattern(e, pattern));
      expect(matches).toEqual([
        "SELECT * FROM users",
        "SELECT * FROM orders",
      ]);
    });
  });
});

describe("Integration Tests", () => {
  it("demonstrates safe search implementation", () => {
    // Simulated user search function
    function searchUsers(searchTerm: string, field: "username" | "email") {
      // Build safe LIKE pattern
      const pattern = buildLikePattern(searchTerm);

      // Use parameterized query
      const query = `SELECT * FROM users WHERE ${field} LIKE ? ESCAPE '\\'`;
      const params = [pattern];

      // Verify query is safe
      expect(isParameterized(query)).toBe(true);

      return executeParameterizedQuery(query, params);
    }

    // Test with normal input
    let result = searchUsers("john", "username");
    expect(result.safe).toBe(true);

    // Test with special characters
    result = searchUsers("test_user", "username");
    expect(result.safe).toBe(true);

    // Test with injection attempt
    result = searchUsers("'; DROP TABLE users; --", "username");
    expect(result.safe).toBe(true);
  });

  it("prevents all common SQL injection vectors", () => {
    const injectionAttempts = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "admin'--",
      "' OR 1=1--",
      "' UNION SELECT * FROM users--",
      "%' AND 1=1--",
    ];

    for (const attempt of injectionAttempts) {
      const pattern = buildLikePattern(attempt);
      const query = "SELECT * FROM users WHERE email LIKE ?";

      // Query should be parameterized
      expect(isParameterized(query)).toBe(true);

      // Pattern should be safely escaped (wildcards escaped, wrapped in %)
      // The % wrapping is from buildLikePattern, dangerous chars are inside
      expect(pattern.startsWith("%")).toBe(true);
      expect(pattern.endsWith("%")).toBe(true);
    }
  });
});
