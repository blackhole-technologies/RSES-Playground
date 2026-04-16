/**
 * @file safe-expression.ts
 * @description Safe expression evaluator without code injection risks
 * @module lib
 * @phase Phase 1 - Security Fix (hardened 2026-04-14)
 *
 * Replaces dangerous dynamic-code-construction calls with a safe parser.
 * Only allows simple comparisons and logical operations.
 *
 * Hardening (2026-04-14):
 * - MAX_EXPRESSION_LENGTH caps input size (DoS via huge inputs).
 * - MAX_PARSE_DEPTH caps recursion depth (DoS via deeply nested parens).
 * - MAX_OPERATIONS caps total evaluation steps (DoS via expression bombs).
 * - Division and modulo by zero are coerced to undefined instead of producing
 *   Infinity/NaN that could leak into business logic.
 *
 * These limits exist because the workflow engine accepts user-authored
 * conditions in feature-flag rules and automation triggers. Without limits,
 * a single malformed condition can pin a CPU core indefinitely.
 */

import { createModuleLogger } from "../logger";

const log = createModuleLogger("safe-expression");

// Maximum length of the raw expression string. 4 KiB is generous for any
// human-authored boolean rule (the longest real-world feature-flag conditions
// observed during audit are <500 chars).
const MAX_EXPRESSION_LENGTH = 4096;

// Maximum recursive descent depth. The grammar has 5 levels (or → and →
// comparison → additive → multiplicative → unary → primary), so a depth of 64
// allows ~12 fully-nested parenthesized expressions, which is more than any
// human will write but blocks pathological inputs.
const MAX_PARSE_DEPTH = 64;

// Maximum number of evaluation operations (token consumptions, comparisons,
// arithmetic ops, variable lookups). Bounds total evaluation cost regardless
// of input shape.
const MAX_OPERATIONS = 10_000;

// Custom error so callers can distinguish a hostile input from a benign one
// that simply doesn't evaluate. The safeEvaluate wrapper still returns
// undefined either way, but logs at warn level for ExpressionLimitError.
export class ExpressionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionLimitError";
  }
}

/**
 * Token types for expression parsing.
 */
type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "IDENTIFIER"
  | "OPERATOR"
  | "COMPARATOR"
  | "LOGICAL"
  | "LPAREN"
  | "RPAREN"
  | "DOT"
  | "EOF";

interface Token {
  type: TokenType;
  value: string | number | boolean;
}

/**
 * Lexer for safe expression evaluation.
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expression.length) {
    const char = expression[pos];

    // Skip whitespace
    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // Numbers
    if (/\d/.test(char)) {
      let num = "";
      while (pos < expression.length && /[\d.]/.test(expression[pos])) {
        num += expression[pos++];
      }
      tokens.push({ type: "NUMBER", value: parseFloat(num) });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      pos++;
      let str = "";
      while (pos < expression.length && expression[pos] !== quote) {
        if (expression[pos] === "\\") {
          pos++;
        }
        str += expression[pos++];
      }
      pos++; // Skip closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let ident = "";
      while (pos < expression.length && /[a-zA-Z0-9_]/.test(expression[pos])) {
        ident += expression[pos++];
      }

      if (ident === "true") {
        tokens.push({ type: "BOOLEAN", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "BOOLEAN", value: false });
      } else if (ident === "null" || ident === "undefined") {
        tokens.push({ type: "IDENTIFIER", value: ident });
      } else if (ident === "and" || ident === "AND") {
        tokens.push({ type: "LOGICAL", value: "&&" });
      } else if (ident === "or" || ident === "OR") {
        tokens.push({ type: "LOGICAL", value: "||" });
      } else if (ident === "not" || ident === "NOT") {
        tokens.push({ type: "LOGICAL", value: "!" });
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident });
      }
      continue;
    }

    // Two-character operators
    const twoChar = expression.slice(pos, pos + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(twoChar)) {
      if (twoChar === "&&" || twoChar === "||") {
        tokens.push({ type: "LOGICAL", value: twoChar });
      } else {
        tokens.push({ type: "COMPARATOR", value: twoChar });
      }
      pos += 2;
      continue;
    }

    // Single-character operators
    if (["<", ">"].includes(char)) {
      tokens.push({ type: "COMPARATOR", value: char });
      pos++;
      continue;
    }

    if (["+", "-", "*", "/", "%"].includes(char)) {
      tokens.push({ type: "OPERATOR", value: char });
      pos++;
      continue;
    }

    if (char === "!") {
      tokens.push({ type: "LOGICAL", value: "!" });
      pos++;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      pos++;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      pos++;
      continue;
    }

    if (char === ".") {
      tokens.push({ type: "DOT", value: "." });
      pos++;
      continue;
    }

    // Unknown character
    throw new Error(`Unexpected character: ${char} at position ${pos}`);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

/**
 * Resolves a variable path from the context.
 */
function resolveVariable(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Simple recursive descent parser for safe expression evaluation.
 *
 * Tracks parse depth and operation count to bound worst-case CPU cost.
 * Both limits raise ExpressionLimitError, which the safeEvaluate wrapper
 * catches and logs distinctly from ordinary parse errors.
 */
class ExpressionParser {
  private tokens: Token[];
  private pos: number = 0;
  private context: Record<string, unknown>;
  private depth: number = 0;
  private ops: number = 0;

  constructor(tokens: Token[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.context = context;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type}`);
    }
    return this.advance();
  }

  // Each call is one "operation" for the global cap. Cheap to call,
  // cheap to bound, and bounds the dominant-cost ops uniformly.
  private tickOp(): void {
    if (++this.ops > MAX_OPERATIONS) {
      throw new ExpressionLimitError(
        `Expression exceeded MAX_OPERATIONS (${MAX_OPERATIONS})`
      );
    }
  }

  // Wraps a recursive descent step with depth tracking. Pre-incrementing
  // before the inner call and decrementing on the way out gives an accurate
  // peak-depth count regardless of the call shape.
  private withDepth<T>(fn: () => T): T {
    if (++this.depth > MAX_PARSE_DEPTH) {
      throw new ExpressionLimitError(
        `Expression exceeded MAX_PARSE_DEPTH (${MAX_PARSE_DEPTH})`
      );
    }
    try {
      return fn();
    } finally {
      this.depth--;
    }
  }

  parse(): unknown {
    return this.withDepth(() => this.parseOr());
  }

  private parseOr(): unknown {
    let left = this.parseAnd();

    while (this.current().type === "LOGICAL" && this.current().value === "||") {
      this.tickOp();
      this.advance();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }

    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseComparison();

    while (this.current().type === "LOGICAL" && this.current().value === "&&") {
      this.tickOp();
      this.advance();
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }

    return left;
  }

  private parseComparison(): unknown {
    let left = this.parseAdditive();

    if (this.current().type === "COMPARATOR") {
      this.tickOp();
      const op = this.advance().value as string;
      const right = this.parseAdditive();

      switch (op) {
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case "<":
          return (left as number) < (right as number);
        case ">":
          return (left as number) > (right as number);
        case "<=":
          return (left as number) <= (right as number);
        case ">=":
          return (left as number) >= (right as number);
      }
    }

    return left;
  }

  private parseAdditive(): unknown {
    let left = this.parseMultiplicative();

    while (
      this.current().type === "OPERATOR" &&
      ["+", "-"].includes(this.current().value as string)
    ) {
      this.tickOp();
      const op = this.advance().value as string;
      const right = this.parseMultiplicative();

      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          left = String(left) + String(right);
        } else {
          left = (left as number) + (right as number);
        }
      } else {
        left = (left as number) - (right as number);
      }
    }

    return left;
  }

  private parseMultiplicative(): unknown {
    let left = this.parseUnary();

    while (
      this.current().type === "OPERATOR" &&
      ["*", "/", "%"].includes(this.current().value as string)
    ) {
      this.tickOp();
      const op = this.advance().value as string;
      const right = this.parseUnary();

      switch (op) {
        case "*":
          left = (left as number) * (right as number);
          break;
        case "/": {
          // Coerce divide-by-zero to undefined rather than producing Infinity
          // or NaN that would silently propagate into business logic.
          const r = right as number;
          left = r === 0 ? undefined : (left as number) / r;
          break;
        }
        case "%": {
          const r = right as number;
          left = r === 0 ? undefined : (left as number) % r;
          break;
        }
      }
    }

    return left;
  }

  private parseUnary(): unknown {
    if (this.current().type === "LOGICAL" && this.current().value === "!") {
      this.tickOp();
      this.advance();
      return !this.withDepth(() => this.parseUnary());
    }

    if (this.current().type === "OPERATOR" && this.current().value === "-") {
      this.tickOp();
      this.advance();
      return -(this.withDepth(() => this.parseUnary()) as number);
    }

    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    this.tickOp();
    const token = this.current();

    switch (token.type) {
      case "NUMBER":
      case "STRING":
      case "BOOLEAN":
        this.advance();
        return token.value;

      case "IDENTIFIER": {
        let path = this.advance().value as string;

        // Handle dot notation
        while (this.current().type === "DOT") {
          this.tickOp();
          this.advance();
          const next = this.expect("IDENTIFIER");
          path += "." + next.value;
        }

        if (path === "null") return null;
        if (path === "undefined") return undefined;

        return resolveVariable(path, this.context);
      }

      case "LPAREN": {
        this.advance();
        const result = this.withDepth(() => this.parse());
        this.expect("RPAREN");
        return result;
      }

      default:
        throw new Error(`Unexpected token: ${token.type}`);
    }
  }
}

/**
 * Safely evaluates an expression with the given variables.
 * Does NOT use eval or new Function.
 *
 * @param expression - The expression to evaluate
 * @param variables - Variables available in the expression
 * @returns The result of the evaluation
 */
export function safeEvaluate(
  expression: string,
  variables: Record<string, unknown>
): unknown {
  // Hard cap input length BEFORE tokenizing. Tokenization itself is O(n) but
  // a 10MB expression will allocate a 10MB token array regardless of validity,
  // and we don't want callers to be able to OOM the process by sending one
  // gigantic feature-flag rule.
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    log.warn(
      { length: expression.length, max: MAX_EXPRESSION_LENGTH },
      "Expression exceeded MAX_EXPRESSION_LENGTH; rejected"
    );
    return undefined;
  }

  try {
    const tokens = tokenize(expression);
    const parser = new ExpressionParser(tokens, variables);
    return parser.parse();
  } catch (error) {
    if (error instanceof ExpressionLimitError) {
      // Distinct log level for security-relevant rejections so they show up
      // in audit trails without being lost in benign parse errors.
      log.warn(
        { expression: expression.slice(0, 200), error: error.message },
        "Expression rejected by limit guard"
      );
    } else {
      log.warn(
        { expression: expression.slice(0, 200), error: (error as Error).message },
        "Expression evaluation failed"
      );
    }
    return undefined;
  }
}

/**
 * Safely evaluates a boolean expression.
 * Returns false if evaluation fails.
 */
export function safeEvaluateBoolean(
  expression: string,
  variables: Record<string, unknown>
): boolean {
  const result = safeEvaluate(expression, variables);
  return Boolean(result);
}
