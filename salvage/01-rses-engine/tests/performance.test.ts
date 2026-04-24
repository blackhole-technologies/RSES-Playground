/**
 * @file performance.test.ts
 * @description Performance tests for RSES engine components.
 * @phase Phase 2 - Core Engine Improvements
 * @author SYS (Systems Analyst Agent)
 * @validated SGT (Set-Graph Theorist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RegexCache, getGlobalCache, resetGlobalCache } from "../src/regex-cache";
import {
  evaluate,
  safeEvaluate,
  clearExpressionCache,
  getExpressionCacheStats,
} from "../src/boolean-parser";
import { RsesParser } from "../src/rses";
import { checkReDoS, checkGlobSafety } from "../src/redos-checker";

describe("Engine Performance - Regex Cache", () => {
  let cache: RegexCache;

  beforeEach(() => {
    cache = new RegexCache(100);
  });

  it("caches compiled regex patterns", () => {
    const pattern = "^test.*$";
    const regex1 = cache.get(pattern);
    const regex2 = cache.get(pattern);

    expect(regex1).toBeInstanceOf(RegExp);
    expect(regex2).toBeInstanceOf(RegExp);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("achieves high cache hit rate with repeated patterns", () => {
    const patterns = ["^web-.*$", "^tool-.*$", "^app-.*$"];

    // First pass - all misses
    for (const p of patterns) {
      cache.get(p);
    }

    // Second pass - all hits
    for (let i = 0; i < 10; i++) {
      for (const p of patterns) {
        cache.get(p);
      }
    }

    const stats = cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0.9);
  });

  it("evicts LRU entries when full", () => {
    const smallCache = new RegexCache(3);

    smallCache.get("pattern1");
    smallCache.get("pattern2");
    smallCache.get("pattern3");
    expect(smallCache.size).toBe(3);

    // Add fourth pattern - should evict oldest
    smallCache.get("pattern4");
    expect(smallCache.size).toBe(3);
  });

  it("caches glob patterns efficiently", () => {
    const globs = ["web-*", "tool-*", "*.py", "test-*-app"];

    for (const g of globs) {
      cache.getGlobRegex(g);
    }

    // Reuse
    for (let i = 0; i < 100; i++) {
      for (const g of globs) {
        cache.getGlobRegex(g);
      }
    }

    const stats = cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0.95);
  });
});

describe("Engine Performance - Expression Cache", () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  it("caches tokenized expressions", () => {
    const expr = "$tools & $claude";
    const sets = new Set(["tools", "claude"]);

    // First evaluation - miss
    evaluate(expr, sets);
    let stats = getExpressionCacheStats();
    expect(stats.misses).toBe(1);

    // Second evaluation - hit
    evaluate(expr, sets);
    stats = getExpressionCacheStats();
    expect(stats.hits).toBe(1);
  });

  it("achieves high hit rate with repeated expressions", () => {
    const expressions = [
      "$a & $b",
      "$c | $d",
      "!$e",
      "$a & ($b | $c)",
    ];
    const sets = new Set(["a", "b", "c"]);

    // First pass - all misses
    for (const expr of expressions) {
      safeEvaluate(expr, sets);
    }

    // Many more passes - all hits
    for (let i = 0; i < 50; i++) {
      for (const expr of expressions) {
        safeEvaluate(expr, sets);
      }
    }

    const stats = getExpressionCacheStats();
    expect(stats.hitRate).toBeGreaterThan(0.9);
  });
});

describe("Engine Performance - Global Regex Cache", () => {
  beforeEach(() => {
    resetGlobalCache();
  });

  afterEach(() => {
    resetGlobalCache();
  });

  it("global cache is shared across calls", () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();
    expect(cache1).toBe(cache2);
  });

  it("RSES parser uses global cache for matchGlob", () => {
    const config = `
[sets]
web = web-*
tools = tool-*
apps = *-app
`;
    const parseResult = RsesParser.parse(config);
    expect(parseResult.valid).toBe(true);

    // Run multiple tests to populate cache
    const filenames = ["web-test", "tool-helper", "my-app", "web-app", "tool-lib"];
    for (let i = 0; i < 10; i++) {
      for (const filename of filenames) {
        RsesParser.test(parseResult.parsed!, filename, {});
      }
    }

    const cache = getGlobalCache();
    const stats = cache.getStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.hitRate).toBeGreaterThan(0.5);
  });
});

describe("Engine Performance - ReDoS Checker", () => {
  it("quickly validates safe patterns", () => {
    // Note: glob patterns should not contain regex characters
    const safePatterns = [
      "web-*",
      "*.txt",
      "test-*-app",
      "prefix*",
      "*suffix",
    ];

    const start = performance.now();
    for (const p of safePatterns) {
      const result = checkGlobSafety(p);
      expect(result.safe).toBe(true);
    }
    const duration = performance.now() - start;

    // Should be fast (< 10ms for all patterns)
    expect(duration).toBeLessThan(10);
  });

  it("detects dangerous patterns efficiently", () => {
    const dangerousPatterns = [
      "(a+)+",
      "(a|a)+",
      "(.*)\\1",
    ];

    const start = performance.now();
    for (const p of dangerousPatterns) {
      const result = checkReDoS(p);
      expect(result.safe).toBe(false);
    }
    const duration = performance.now() - start;

    // Should still be fast
    expect(duration).toBeLessThan(10);
  });
});

describe("Engine Performance - RSES Parser", () => {
  const largeConfig = generateLargeConfig(100);

  it("parses large configs quickly", () => {
    const start = performance.now();
    const result = RsesParser.parse(largeConfig);
    const duration = performance.now() - start;

    expect(result.valid).toBe(true);
    // Should parse in under 100ms
    expect(duration).toBeLessThan(100);
  });

  it("tests many patterns quickly", () => {
    const parseResult = RsesParser.parse(largeConfig);
    expect(parseResult.valid).toBe(true);

    const filenames = generateFilenames(100);
    const start = performance.now();

    for (const filename of filenames) {
      RsesParser.test(parseResult.parsed!, filename, {});
    }

    const duration = performance.now() - start;
    // Should test 100 filenames in under 100ms
    expect(duration).toBeLessThan(100);
  });
});

// Helper functions

function generateLargeConfig(numSets: number): string {
  const lines: string[] = [
    "# Large test config",
    "[sets]",
  ];

  for (let i = 0; i < numSets; i++) {
    lines.push(`set${i} = pattern${i}-*`);
  }

  lines.push("", "[sets.compound]");
  for (let i = 0; i < Math.min(20, numSets - 1); i++) {
    lines.push(`compound${i} = $set${i} & $set${i + 1}`);
  }

  lines.push("", "[rules.topic]");
  for (let i = 0; i < Math.min(20, numSets); i++) {
    lines.push(`$set${i} -> topic${i}`);
  }

  return lines.join("\n");
}

function generateFilenames(count: number): string[] {
  const filenames: string[] = [];
  for (let i = 0; i < count; i++) {
    filenames.push(`pattern${i % 100}-test-${i}`);
  }
  return filenames;
}
