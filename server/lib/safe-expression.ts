/**
 * @file safe-expression.ts
 * @description Safe expression evaluator without code injection risks
 * @module lib
 * @phase Phase 1 - Security Fix
 *
 * Replaces dangerous new Function() calls with a safe parser.
 * Only allows simple comparisons and logical operations.
 */

import { createModuleLogger } from "../logger";

const log = createModuleLogger("safe-expression");

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
 */
class ExpressionParser {
  private tokens: Token[];
  private pos: number = 0;
  private context: Record<string, unknown>;

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

  parse(): unknown {
    return this.parseOr();
  }

  private parseOr(): unknown {
    let left = this.parseAnd();

    while (this.current().type === "LOGICAL" && this.current().value === "||") {
      this.advance();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }

    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseComparison();

    while (this.current().type === "LOGICAL" && this.current().value === "&&") {
      this.advance();
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }

    return left;
  }

  private parseComparison(): unknown {
    let left = this.parseAdditive();

    if (this.current().type === "COMPARATOR") {
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
      const op = this.advance().value as string;
      const right = this.parseUnary();

      switch (op) {
        case "*":
          left = (left as number) * (right as number);
          break;
        case "/":
          left = (left as number) / (right as number);
          break;
        case "%":
          left = (left as number) % (right as number);
          break;
      }
    }

    return left;
  }

  private parseUnary(): unknown {
    if (this.current().type === "LOGICAL" && this.current().value === "!") {
      this.advance();
      return !this.parseUnary();
    }

    if (this.current().type === "OPERATOR" && this.current().value === "-") {
      this.advance();
      return -(this.parseUnary() as number);
    }

    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
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
          this.advance();
          const next = this.expect("IDENTIFIER");
          path += "." + next.value;
        }

        if (path === "null") return null;
        if (path === "undefined") return undefined;

        return resolveVariable(path, this.context);
      }

      case "LPAREN":
        this.advance();
        const result = this.parse();
        this.expect("RPAREN");
        return result;

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
  try {
    const tokens = tokenize(expression);
    const parser = new ExpressionParser(tokens, variables);
    return parser.parse();
  } catch (error) {
    log.warn({ expression, error: (error as Error).message }, "Expression evaluation failed");
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
