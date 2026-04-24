/**
 * @file redos-checker.test.ts
 * @description Tests for ReDoS pattern detection.
 * @phase Phase 2 - Core Engine Improvements
 * @author SEC (Security Specialist Agent)
 * @validated SGT (Set-Graph Theorist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import {
  checkReDoS,
  checkGlobSafety,
  validateSetPattern,
} from "../src/redos-checker";
import { RsesParser } from "../src/rses";

describe("ReDoS Checker - checkReDoS", () => {
  describe("safe patterns", () => {
    const safePatterns = [
      ".*",
      "[a-z]+",
      "\\d{4}-\\d{2}-\\d{2}",
      "foo|bar|baz",
      "^start",
      "end$",
      "simple",
    ];

    safePatterns.forEach((pattern) => {
      it(`considers "${pattern}" safe`, () => {
        const result = checkReDoS(pattern);
        expect(result.safe).toBe(true);
        expect(result.risk).toBe("none");
      });
    });
  });

  describe("dangerous patterns - nested quantifiers", () => {
    const dangerousPatterns = [
      { pattern: "(a+)+", desc: "nested plus" },
      { pattern: "(a*)*", desc: "nested star" },
      { pattern: "(a+)*", desc: "plus inside star" },
      { pattern: "((a+))+", desc: "deeply nested" },
    ];

    dangerousPatterns.forEach(({ pattern, desc }) => {
      it(`detects ${desc}: "${pattern}"`, () => {
        const result = checkReDoS(pattern);
        expect(result.safe).toBe(false);
        expect(result.risk).toBe("high");
      });
    });
  });

  describe("dangerous patterns - alternation with quantifiers", () => {
    it("detects (a|b)+", () => {
      const result = checkReDoS("(a|b)+");
      expect(result.safe).toBe(false);
    });

    it("detects (foo|bar)*", () => {
      const result = checkReDoS("(foo|bar)*");
      expect(result.safe).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty pattern", () => {
      const result = checkReDoS("");
      expect(result.safe).toBe(true);
    });

    it("handles short pattern", () => {
      const result = checkReDoS("ab");
      expect(result.safe).toBe(true);
    });

    it("handles pattern with just quantifier", () => {
      const result = checkReDoS("a+");
      expect(result.safe).toBe(true);
    });
  });
});

describe("ReDoS Checker - checkGlobSafety", () => {
  describe("safe glob patterns", () => {
    const safePatterns = [
      "*.txt",
      "web-*",
      "*-app",
      "test-*-file",
      "prefix*suffix",
    ];

    safePatterns.forEach((pattern) => {
      it(`considers "${pattern}" safe`, () => {
        const result = checkGlobSafety(pattern);
        expect(result.safe).toBe(true);
      });
    });
  });

  describe("unsafe glob patterns", () => {
    it("rejects consecutive wildcards", () => {
      const result = checkGlobSafety("**");
      expect(result.safe).toBe(false);
    });

    it("rejects patterns with regex characters", () => {
      const patterns = ["(a)+", "[a-z]+", "a{2,}", "a|b", "^start", "end$"];
      for (const pattern of patterns) {
        const result = checkGlobSafety(pattern);
        expect(result.safe).toBe(false);
      }
    });

    it("rejects too many wildcards", () => {
      const result = checkGlobSafety("*a*b*c*d*");
      expect(result.safe).toBe(false);
    });
  });
});

describe("ReDoS Checker - validateSetPattern", () => {
  it("validates simple glob patterns", () => {
    const result = validateSetPattern("web-*");
    expect(result.valid).toBe(true);
  });

  it("validates OR patterns", () => {
    const result = validateSetPattern("web-* | mobile-*");
    expect(result.valid).toBe(true);
  });

  it("rejects unsafe patterns", () => {
    const result = validateSetPattern("(a+)+");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("validates each sub-pattern in OR expression", () => {
    const result = validateSetPattern("safe-* | (a+)+");
    expect(result.valid).toBe(false);
  });
});

describe("ReDoS Integration with RSES Parser", () => {
  it("rejects config with consecutive wildcards", () => {
    const config = `
[sets]
dangerous = **pattern
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "E004")).toBe(true);
  });

  it("rejects config with regex characters in glob", () => {
    const config = `
[sets]
dangerous = (a)+
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "E004")).toBe(true);
  });

  it("accepts config with safe patterns", () => {
    const config = `
[sets]
web = web-*
mobile = mobile-*
combined = web-* | mobile-*
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(true);
  });
});
