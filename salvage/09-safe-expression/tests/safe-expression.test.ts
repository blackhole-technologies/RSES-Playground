/**
 * @file safe-expression.test.ts
 * @description Security tests for the hardened expression evaluator.
 *
 * Verifies that the DoS guards added on 2026-04-14 reject pathological inputs
 * without consuming unbounded CPU. These tests are part of the security suite
 * because the workflow engine evaluates user-authored conditions, and an
 * unbounded evaluator is a remote DoS primitive.
 */

import { describe, it, expect } from "vitest";
import { safeEvaluate, safeEvaluateBoolean } from "../src/safe-expression";

describe("safe-expression — happy path", () => {
  it("evaluates simple boolean expressions", () => {
    expect(safeEvaluateBoolean("a == 1", { a: 1 })).toBe(true);
    expect(safeEvaluateBoolean("a == 1", { a: 2 })).toBe(false);
  });

  it("supports logical operators with short-circuit", () => {
    expect(safeEvaluateBoolean("a && b", { a: true, b: false })).toBe(false);
    expect(safeEvaluateBoolean("a || b", { a: false, b: true })).toBe(true);
    expect(safeEvaluateBoolean("not a", { a: false })).toBe(true);
  });

  it("supports dotted variable paths", () => {
    expect(safeEvaluate("user.role == 'admin'", { user: { role: "admin" } })).toBe(true);
    expect(safeEvaluate("a.b.c", { a: { b: { c: 42 } } })).toBe(42);
  });

  it("supports arithmetic", () => {
    expect(safeEvaluate("(a + b) * 2", { a: 1, b: 2 })).toBe(6);
  });
});

describe("safe-expression — DoS guards", () => {
  it("rejects expressions longer than MAX_EXPRESSION_LENGTH", () => {
    // 5000 chars > 4096 cap. Should return undefined and NOT spend CPU
    // tokenizing.
    const huge = "a + ".repeat(2000) + "1";
    expect(huge.length).toBeGreaterThan(4096);
    const start = Date.now();
    const result = safeEvaluate(huge, { a: 1 });
    const elapsedMs = Date.now() - start;
    expect(result).toBeUndefined();
    // Should reject in well under 50ms — we're not even tokenizing.
    expect(elapsedMs).toBeLessThan(50);
  });

  it("rejects expressions deeper than MAX_PARSE_DEPTH", () => {
    // 100 levels of nested parens > 64 depth cap.
    const deep = "(".repeat(100) + "1" + ")".repeat(100);
    const result = safeEvaluate(deep, {});
    expect(result).toBeUndefined();
  });

  it("rejects expressions exceeding MAX_OPERATIONS", () => {
    // Build a long chain of additions. Each `+` is one tickOp; with
    // MAX_OPERATIONS = 10_000, ~6000 additions should easily exceed it once
    // primary/parse ticks are also counted.
    const longChain = Array.from({ length: 6000 }, () => "1").join(" + ");
    const result = safeEvaluate(longChain, {});
    expect(result).toBeUndefined();
  });

  it("does not produce Infinity from divide-by-zero", () => {
    const result = safeEvaluate("a / b", { a: 1, b: 0 });
    expect(result).toBeUndefined();
  });

  it("does not produce NaN from modulo-by-zero", () => {
    const result = safeEvaluate("a % b", { a: 5, b: 0 });
    expect(result).toBeUndefined();
  });

  it("bounds total CPU even on adversarial input near the limit", () => {
    // Just under the operation cap — should still complete fast.
    const nearLimit = Array.from({ length: 1000 }, () => "1").join(" + ");
    const start = Date.now();
    safeEvaluate(nearLimit, {});
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(100);
  });
});

describe("safe-expression — does not eval arbitrary code", () => {
  it("rejects function-call syntax cleanly", () => {
    // No parser error escape, just a clean undefined.
    expect(safeEvaluate("require('fs')", {})).toBeUndefined();
  });

  it("does not expose constructor chains", () => {
    expect(
      safeEvaluate("a.constructor.constructor", { a: {} })
    ).toBeUndefined();
  });

  it("does not let identifiers reach global objects", () => {
    expect(safeEvaluate("process.env.SECRET", {})).toBeUndefined();
    expect(safeEvaluate("globalThis.x", {})).toBeUndefined();
  });
});
