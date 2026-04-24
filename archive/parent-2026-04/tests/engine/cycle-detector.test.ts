/**
 * @file cycle-detector.test.ts
 * @description Tests for cycle detection in compound sets.
 * @phase Phase 2 - Core Engine Improvements
 * @author SGT (Set-Graph Theorist Agent)
 * @validated ARC (Project Architect Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import {
  extractSetReferences,
  buildDependencyGraph,
  detectCycles,
  validateCompoundSets,
  getEvaluationOrder,
} from "../../server/lib/cycle-detector";
import { RsesParser } from "../../server/lib/rses";

describe("Cycle Detector - extractSetReferences", () => {
  it("extracts single reference", () => {
    expect(extractSetReferences("$tools")).toEqual(["tools"]);
  });

  it("extracts multiple references", () => {
    expect(extractSetReferences("$tools & $claude")).toEqual(["tools", "claude"]);
  });

  it("extracts references with OR", () => {
    expect(extractSetReferences("$web | $mobile")).toEqual(["web", "mobile"]);
  });

  it("extracts references from complex expressions", () => {
    expect(extractSetReferences("$a & ($b | !$c)")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for no references", () => {
    expect(extractSetReferences("true & false")).toEqual([]);
  });

  it("deduplicates repeated references", () => {
    expect(extractSetReferences("$a & $a | $a")).toEqual(["a"]);
  });

  it("handles identifiers with dashes and underscores", () => {
    expect(extractSetReferences("$my-set & $other_set")).toEqual(["my-set", "other_set"]);
  });
});

describe("Cycle Detector - detectCycles", () => {
  it("detects no cycle in simple compound", () => {
    const result = detectCycles({ ab: "$a & $b" });
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toEqual([]);
  });

  it("detects direct self-cycle", () => {
    const result = detectCycles({ a: "$a & $b" });
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toContain("a");
  });

  it("detects indirect cycle (a -> b -> a)", () => {
    const result = detectCycles({
      a: "$b & $x",
      b: "$a & $y",
    });
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath.length).toBeGreaterThan(0);
  });

  it("detects longer cycle (a -> b -> c -> a)", () => {
    const result = detectCycles({
      a: "$b",
      b: "$c",
      c: "$a",
    });
    expect(result.hasCycle).toBe(true);
  });

  it("handles chain without cycle", () => {
    const result = detectCycles({
      c: "$a & $b",
      d: "$c & $x",
      e: "$d & $y",
    });
    expect(result.hasCycle).toBe(false);
  });

  it("handles diamond dependency (no cycle)", () => {
    // a depends on b and c, both depend on d
    const result = detectCycles({
      a: "$b & $c",
      b: "$d",
      c: "$d",
    });
    expect(result.hasCycle).toBe(false);
  });

  it("returns topological order when no cycle", () => {
    const result = detectCycles({
      c: "$a & $b", // c depends on a and b
      d: "$c",     // d depends on c
    });
    expect(result.hasCycle).toBe(false);
    // c should come before d in the order
    const cIdx = result.sortedOrder.indexOf("c");
    const dIdx = result.sortedOrder.indexOf("d");
    expect(cIdx).toBeLessThan(dIdx);
  });
});

describe("Cycle Detector - validateCompoundSets", () => {
  it("validates empty compound sets", () => {
    const result = validateCompoundSets({});
    expect(result.valid).toBe(true);
    expect(result.evaluationOrder).toEqual([]);
  });

  it("returns valid for acyclic sets", () => {
    const result = validateCompoundSets({
      ab: "$a & $b",
      abc: "$ab & $c",
    });
    expect(result.valid).toBe(true);
    expect(result.evaluationOrder).toBeDefined();
  });

  it("returns error for cyclic sets", () => {
    const result = validateCompoundSets({
      a: "$b",
      b: "$a",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("Cyclic dependency");
  });
});

describe("Cycle Detector - getEvaluationOrder", () => {
  it("returns correct order for chain", () => {
    const order = getEvaluationOrder({
      c: "$b",  // c depends on b
      b: "$a",  // b depends on a (not compound, so will be evaluated)
    });
    expect(order).not.toBeNull();
    // b should come before c
    const bIdx = order!.indexOf("b");
    const cIdx = order!.indexOf("c");
    expect(bIdx).toBeLessThan(cIdx);
  });

  it("returns null for cyclic sets", () => {
    const order = getEvaluationOrder({
      a: "$b",
      b: "$a",
    });
    expect(order).toBeNull();
  });
});

describe("Cycle Detector - Integration with RsesParser", () => {
  it("rejects config with cyclic compound sets", () => {
    const config = `
[sets.compound]
a = $b & $x
b = $a & $y
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "E008")).toBe(true);
    expect(result.errors.some((e) => e.message.includes("Cyclic"))).toBe(true);
  });

  it("rejects config with self-referencing compound set", () => {
    const config = `
[sets.compound]
recursive = $recursive & $other
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "E008")).toBe(true);
  });

  it("accepts config with valid compound set chain", () => {
    const config = `
[sets]
a = a-*
b = b-*

[sets.compound]
ab = $a & $b
abc = $ab & $c
`;
    const result = RsesParser.parse(config);
    expect(result.valid).toBe(true);
  });

  it("evaluates compound sets in correct order", () => {
    const config = `
[sets]
prefix-a = a-*
prefix-b = *-b

[sets.compound]
both = $prefix-a & $prefix-b
all-three = $both & $c
`;
    const parseResult = RsesParser.parse(config);
    expect(parseResult.valid).toBe(true);

    // Test that compound sets are evaluated correctly
    const testResult = RsesParser.test(parseResult.parsed!, "a-test-b", {});
    expect(testResult.sets).toContain("prefix-a");
    expect(testResult.sets).toContain("prefix-b");
    expect(testResult.sets).toContain("both");
  });
});
