/**
 * @file security-middleware.test.ts
 * @description Test suite for security middleware functions.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import {
  isPathSafe,
  validateRequestSecurity,
  configContentSchema,
  securityDefaults,
} from "../src/security";

describe("Security Middleware - Path Safety", () => {
  describe("isPathSafe", () => {
    it("allows safe relative paths", () => {
      expect(isPathSafe("ai/claude")).toBe(true);
      expect(isPathSafe("projects/web")).toBe(true);
      expect(isPathSafe("topic/type")).toBe(true);
    });

    it("allows paths with underscores and dashes", () => {
      expect(isPathSafe("my-project/sub_dir")).toBe(true);
      expect(isPathSafe("ai_tools/claude-3")).toBe(true);
    });

    it("blocks path traversal with ..", () => {
      expect(isPathSafe("../etc/passwd")).toBe(false);
      expect(isPathSafe("foo/../bar")).toBe(false);
      expect(isPathSafe("foo/..")).toBe(false);
    });

    it("blocks URL-encoded path traversal", () => {
      expect(isPathSafe("%2e%2e/etc/passwd")).toBe(false);
      expect(isPathSafe("foo%2f..%2fbar")).toBe(false);
    });

    it("blocks absolute paths", () => {
      expect(isPathSafe("/etc/passwd")).toBe(false);
      expect(isPathSafe("/var/log")).toBe(false);
      expect(isPathSafe("/home/user")).toBe(false);
    });

    it("blocks Windows-style paths", () => {
      expect(isPathSafe("C:\\Windows")).toBe(false);
      expect(isPathSafe("c:\\users")).toBe(false);
    });

    it("blocks proc and sys filesystem access", () => {
      expect(isPathSafe("/proc/self/environ")).toBe(false);
      expect(isPathSafe("/sys/kernel")).toBe(false);
    });

    it("blocks home directory expansion", () => {
      expect(isPathSafe("~/secret")).toBe(false);
    });

    it("handles empty and invalid input", () => {
      expect(isPathSafe("")).toBe(false);
      expect(isPathSafe(null as any)).toBe(false);
      expect(isPathSafe(undefined as any)).toBe(false);
    });
  });
});

describe("Security Middleware - Request Validation", () => {
  describe("validateRequestSecurity", () => {
    it("passes valid request body", () => {
      const result = validateRequestSecurity({
        name: "my-config",
        content: "[sets]\nweb = web-*",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects path traversal in path field", () => {
      const result = validateRequestSecurity({
        path: "../../../etc/passwd",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("E_PATH_TRAVERSAL");
    });

    it("detects path traversal in filename field", () => {
      const result = validateRequestSecurity({
        filename: "foo/../../../etc/shadow",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("E_PATH_TRAVERSAL");
    });

    it("detects path traversal in result field", () => {
      const result = validateRequestSecurity({
        result: "/etc/passwd",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("E_PATH_TRAVERSAL");
    });

    it("detects oversized content", () => {
      const largeContent = "x".repeat(600 * 1024); // 600KB
      const result = validateRequestSecurity({
        content: largeContent,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("E_PAYLOAD_TOO_LARGE");
    });

    it("accepts content within size limit", () => {
      const validContent = "x".repeat(100 * 1024); // 100KB
      const result = validateRequestSecurity({
        content: validContent,
      });
      expect(result.valid).toBe(true);
    });

    it("handles null and undefined body", () => {
      expect(validateRequestSecurity(null).valid).toBe(true);
      expect(validateRequestSecurity(undefined).valid).toBe(true);
    });
  });
});

describe("Security Middleware - Config Content Schema", () => {
  it("accepts valid content", () => {
    const result = configContentSchema.safeParse("[sets]\nweb = web-*");
    expect(result.success).toBe(true);
  });

  it("rejects oversized content", () => {
    const largeContent = "x".repeat(600 * 1024); // 600KB
    const result = configContentSchema.safeParse(largeContent);
    expect(result.success).toBe(false);
  });
});

describe("Security Middleware - Default Configuration", () => {
  it("has reasonable default values", () => {
    expect(securityDefaults.maxBodySize).toBe(1024 * 1024); // 1MB
    expect(securityDefaults.maxConfigSize).toBe(512 * 1024); // 512KB
    expect(securityDefaults.rateLimitWindowMs).toBe(15 * 60 * 1000); // 15 min
    expect(securityDefaults.rateLimitMax).toBe(100);
  });

  it("has exempt paths for health checks", () => {
    expect(securityDefaults.rateLimitExemptPaths).toContain("/health");
    expect(securityDefaults.rateLimitExemptPaths).toContain("/ready");
  });
});

describe("Security Middleware - Path Traversal Patterns", () => {
  // These patterns are checked after URL decoding, so we test decoded forms
  const traversalPatterns = [
    "../",
    "..\\",
    "foo/../bar",
    "foo/..\\bar",
    "/etc/passwd",
    "/var/log/syslog",
    "C:\\Windows\\System32",
    "~/.",
    "/proc/self/environ",
    "/sys/kernel/config",
  ];

  traversalPatterns.forEach((pattern) => {
    it(`blocks path traversal pattern: ${pattern}`, () => {
      expect(isPathSafe(pattern)).toBe(false);
    });
  });

  const safePatterns = [
    "ai/claude",
    "projects/web-app",
    "topic/sub-topic",
    "level1/level2/level3",
    "foo-bar/baz_qux",
    "123/456",
  ];

  safePatterns.forEach((pattern) => {
    it(`allows safe pattern: ${pattern}`, () => {
      expect(isPathSafe(pattern)).toBe(true);
    });
  });
});
