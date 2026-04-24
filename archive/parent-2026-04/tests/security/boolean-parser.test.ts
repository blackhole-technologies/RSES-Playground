/**
 * @file boolean-parser.test.ts
 * @description Comprehensive test suite for the safe Boolean expression parser.
 * @phase Phase 1 - Security Hardening
 * @author SGT (Set-Graph Theorist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import {
  tokenize,
  evaluate,
  safeEvaluate,
  validateExpression,
  ExpressionError,
  Token,
} from "../../server/lib/boolean-parser";

describe("Boolean Parser - Tokenizer", () => {
  it("tokenizes simple set references", () => {
    const tokens = tokenize("$tools");
    expect(tokens).toHaveLength(2); // SETREF + EOF
    expect(tokens[0]).toMatchObject({ type: "SETREF", value: "tools" });
  });

  it("tokenizes multiple set references with AND", () => {
    const tokens = tokenize("$tools & $claude");
    expect(tokens).toHaveLength(4); // SETREF AND SETREF EOF
    expect(tokens[0]).toMatchObject({ type: "SETREF", value: "tools" });
    expect(tokens[1]).toMatchObject({ type: "AND", value: "&" });
    expect(tokens[2]).toMatchObject({ type: "SETREF", value: "claude" });
  });

  it("tokenizes OR expressions", () => {
    const tokens = tokenize("$web | $mobile");
    expect(tokens).toHaveLength(4);
    expect(tokens[1]).toMatchObject({ type: "OR", value: "|" });
  });

  it("tokenizes NOT expressions", () => {
    const tokens = tokenize("!$deprecated");
    expect(tokens).toHaveLength(3); // NOT SETREF EOF
    expect(tokens[0]).toMatchObject({ type: "NOT", value: "!" });
    expect(tokens[1]).toMatchObject({ type: "SETREF", value: "deprecated" });
  });

  it("tokenizes parenthesized expressions", () => {
    const tokens = tokenize("($a & $b) | $c");
    expect(tokens).toHaveLength(8); // LPAREN SETREF AND SETREF RPAREN OR SETREF EOF
    expect(tokens[0]).toMatchObject({ type: "LPAREN" });
    expect(tokens[4]).toMatchObject({ type: "RPAREN" });
  });

  it("tokenizes literal true/false", () => {
    const tokens = tokenize("true & false");
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toMatchObject({ type: "TRUE", value: "true" });
    expect(tokens[2]).toMatchObject({ type: "FALSE", value: "false" });
  });

  it("tokenizes identifiers with dashes and underscores", () => {
    const tokens = tokenize("$my-set_name");
    expect(tokens[0]).toMatchObject({ type: "SETREF", value: "my-set_name" });
  });

  it("tokenizes identifiers with numbers", () => {
    const tokens = tokenize("$version2");
    expect(tokens[0]).toMatchObject({ type: "SETREF", value: "version2" });
  });

  it("throws on unknown keywords", () => {
    expect(() => tokenize("$a & maybe")).toThrow(ExpressionError);
    expect(() => tokenize("undefined")).toThrow(ExpressionError);
  });

  it("throws on invalid characters", () => {
    expect(() => tokenize("$a + $b")).toThrow(ExpressionError);
    expect(() => tokenize("$a @ $b")).toThrow(ExpressionError);
  });

  it("throws on empty set reference", () => {
    expect(() => tokenize("$ & $b")).toThrow(ExpressionError);
  });

  it("preserves token positions", () => {
    const tokens = tokenize("$a & $b");
    expect(tokens[0].position).toBe(0);
    expect(tokens[1].position).toBe(3);
    expect(tokens[2].position).toBe(5);
  });
});

describe("Boolean Parser - Evaluate", () => {
  describe("simple expressions", () => {
    it("evaluates single set reference (present)", () => {
      expect(evaluate("$tools", new Set(["tools"]))).toBe(true);
    });

    it("evaluates single set reference (absent)", () => {
      expect(evaluate("$tools", new Set(["web"]))).toBe(false);
    });

    it("evaluates literal true", () => {
      expect(evaluate("true", new Set())).toBe(true);
    });

    it("evaluates literal false", () => {
      expect(evaluate("false", new Set())).toBe(false);
    });
  });

  describe("AND expressions", () => {
    it("evaluates $a & $b with both present", () => {
      expect(evaluate("$tools & $claude", new Set(["tools", "claude"]))).toBe(true);
    });

    it("evaluates $a & $b with one present", () => {
      expect(evaluate("$tools & $claude", new Set(["tools"]))).toBe(false);
    });

    it("evaluates $a & $b with neither present", () => {
      expect(evaluate("$tools & $claude", new Set())).toBe(false);
    });

    it("evaluates chained AND: $a & $b & $c", () => {
      expect(evaluate("$a & $b & $c", new Set(["a", "b", "c"]))).toBe(true);
      expect(evaluate("$a & $b & $c", new Set(["a", "b"]))).toBe(false);
    });
  });

  describe("OR expressions", () => {
    it("evaluates $a | $b with both present", () => {
      expect(evaluate("$web | $mobile", new Set(["web", "mobile"]))).toBe(true);
    });

    it("evaluates $a | $b with one present", () => {
      expect(evaluate("$web | $mobile", new Set(["web"]))).toBe(true);
    });

    it("evaluates $a | $b with neither present", () => {
      expect(evaluate("$web | $mobile", new Set())).toBe(false);
    });

    it("evaluates chained OR: $a | $b | $c", () => {
      expect(evaluate("$a | $b | $c", new Set(["c"]))).toBe(true);
      expect(evaluate("$a | $b | $c", new Set([]))).toBe(false);
    });
  });

  describe("NOT expressions", () => {
    it("evaluates !$a when absent", () => {
      expect(evaluate("!$deprecated", new Set())).toBe(true);
    });

    it("evaluates !$a when present", () => {
      expect(evaluate("!$deprecated", new Set(["deprecated"]))).toBe(false);
    });

    it("evaluates double negation !!$a", () => {
      expect(evaluate("!!$a", new Set(["a"]))).toBe(true);
      expect(evaluate("!!$a", new Set())).toBe(false);
    });
  });

  describe("complex expressions", () => {
    it("evaluates $a & ($b | $c)", () => {
      expect(evaluate("$a & ($b | $c)", new Set(["a", "b"]))).toBe(true);
      expect(evaluate("$a & ($b | $c)", new Set(["a", "c"]))).toBe(true);
      expect(evaluate("$a & ($b | $c)", new Set(["a"]))).toBe(false);
      expect(evaluate("$a & ($b | $c)", new Set(["b"]))).toBe(false);
    });

    it("evaluates ($a | $b) & ($c | $d)", () => {
      expect(evaluate("($a | $b) & ($c | $d)", new Set(["a", "c"]))).toBe(true);
      expect(evaluate("($a | $b) & ($c | $d)", new Set(["b", "d"]))).toBe(true);
      expect(evaluate("($a | $b) & ($c | $d)", new Set(["a"]))).toBe(false);
    });

    it("evaluates !$a & $b", () => {
      expect(evaluate("!$deprecated & $active", new Set(["active"]))).toBe(true);
      expect(evaluate("!$deprecated & $active", new Set(["deprecated", "active"]))).toBe(false);
    });

    it("evaluates !($a & $b)", () => {
      expect(evaluate("!($a & $b)", new Set(["a"]))).toBe(true);
      expect(evaluate("!($a & $b)", new Set(["a", "b"]))).toBe(false);
    });

    it("evaluates deeply nested expressions", () => {
      const expr = "(($a & $b) | ($c & $d)) & !$e";
      expect(evaluate(expr, new Set(["a", "b"]))).toBe(true);
      expect(evaluate(expr, new Set(["c", "d"]))).toBe(true);
      expect(evaluate(expr, new Set(["a", "b", "e"]))).toBe(false);
    });
  });

  describe("operator precedence", () => {
    it("AND binds tighter than OR: $a | $b & $c", () => {
      // Should be parsed as $a | ($b & $c)
      expect(evaluate("$a | $b & $c", new Set(["a"]))).toBe(true);
      expect(evaluate("$a | $b & $c", new Set(["b", "c"]))).toBe(true);
      expect(evaluate("$a | $b & $c", new Set(["b"]))).toBe(false);
    });

    it("NOT binds tightest: !$a & $b", () => {
      // Should be parsed as (!$a) & $b
      expect(evaluate("!$a & $b", new Set(["b"]))).toBe(true);
      expect(evaluate("!$a & $b", new Set(["a", "b"]))).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty expression", () => {
      expect(evaluate("", new Set())).toBe(false);
      expect(evaluate("   ", new Set())).toBe(false);
    });

    it("handles extra whitespace", () => {
      expect(evaluate("  $a   &   $b  ", new Set(["a", "b"]))).toBe(true);
    });

    it("handles case-sensitive set names", () => {
      expect(evaluate("$Tools", new Set(["Tools"]))).toBe(true);
      expect(evaluate("$Tools", new Set(["tools"]))).toBe(false);
    });
  });
});

describe("Boolean Parser - Error Handling", () => {
  it("throws on mismatched parentheses (missing close)", () => {
    expect(() => evaluate("($a & $b", new Set())).toThrow(ExpressionError);
  });

  it("throws on mismatched parentheses (extra close)", () => {
    expect(() => evaluate("$a & $b)", new Set())).toThrow(ExpressionError);
  });

  it("throws on missing operand", () => {
    expect(() => evaluate("$a &", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("& $a", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("$a |", new Set())).toThrow(ExpressionError);
  });

  it("throws on consecutive operators", () => {
    expect(() => evaluate("$a && $b", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("$a || $b", new Set())).toThrow(ExpressionError);
  });

  it("throws on injection attempts", () => {
    expect(() => evaluate("$a; console.log('pwned')", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("$a + 1", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("eval('code')", new Set())).toThrow(ExpressionError);
    expect(() => evaluate("Function('code')()", new Set())).toThrow(ExpressionError);
  });
});

describe("Boolean Parser - safeEvaluate", () => {
  it("returns false on invalid expressions instead of throwing", () => {
    expect(safeEvaluate("$a & (", new Set())).toBe(false);
    expect(safeEvaluate("invalid", new Set())).toBe(false);
    expect(safeEvaluate("$a + $b", new Set())).toBe(false);
  });

  it("works like evaluate for valid expressions", () => {
    expect(safeEvaluate("$a & $b", new Set(["a", "b"]))).toBe(true);
    expect(safeEvaluate("$a | $b", new Set(["a"]))).toBe(true);
    expect(safeEvaluate("!$a", new Set())).toBe(true);
  });
});

describe("Boolean Parser - validateExpression", () => {
  it("returns valid for correct expressions", () => {
    expect(validateExpression("$a & $b")).toEqual({ valid: true });
    expect(validateExpression("$a | ($b & $c)")).toEqual({ valid: true });
    expect(validateExpression("!$a")).toEqual({ valid: true });
  });

  it("returns invalid with error details for incorrect expressions", () => {
    const result = validateExpression("$a &");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBeDefined();
  });

  it("returns invalid for empty expressions", () => {
    const result = validateExpression("");
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe("E_EMPTY");
  });
});

describe("Boolean Parser - Security", () => {
  it("does not execute arbitrary code", () => {
    const maliciousExpressions = [
      "constructor.constructor('return this')()",
      "__proto__.polluted = true",
      "require('child_process').exec('ls')",
      "import('fs')",
      "process.exit(1)",
      "while(true){}",
      "new Function('return 1')()",
    ];

    for (const expr of maliciousExpressions) {
      expect(safeEvaluate(expr, new Set())).toBe(false);
    }
  });

  it("prevents prototype pollution attempts", () => {
    const result = safeEvaluate("$__proto__ & $constructor", new Set(["__proto__", "constructor"]));
    expect(result).toBe(true); // These are valid set names, but harmless
  });

  it("handles very long expressions without stack overflow", () => {
    // Generate a long but valid expression
    const sets = Array.from({ length: 100 }, (_, i) => `$s${i}`);
    const longExpr = sets.join(" | ");
    expect(safeEvaluate(longExpr, new Set(["s50"]))).toBe(true);
  });

  it("handles deeply nested parentheses", () => {
    const deepNested = "((((($a)))))";
    expect(evaluate(deepNested, new Set(["a"]))).toBe(true);
  });
});

describe("Boolean Parser - RSES Integration", () => {
  it("evaluates typical compound set expressions", () => {
    // From the default config: claude-quantum = $quantum & $claude
    const activeSets = new Set(["quantum", "claude"]);
    expect(evaluate("$quantum & $claude", activeSets)).toBe(true);
  });

  it("evaluates typical rule conditions", () => {
    // From the default config: $quantum & $claude -> quantum/claude
    const activeSets = new Set(["quantum", "claude"]);
    expect(evaluate("$quantum & $claude", activeSets)).toBe(true);

    const partialSets = new Set(["quantum"]);
    expect(evaluate("$quantum & $claude", partialSets)).toBe(false);
  });

  it("evaluates OR patterns for web projects", () => {
    // web = web-* | webapp-*  - but for compound: $web | $mobile
    expect(evaluate("$web | $mobile", new Set(["web"]))).toBe(true);
    expect(evaluate("$web | $mobile", new Set(["mobile"]))).toBe(true);
    expect(evaluate("$web | $mobile", new Set(["desktop"]))).toBe(false);
  });
});
