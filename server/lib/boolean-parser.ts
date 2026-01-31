/**
 * @file boolean-parser.ts
 * @description Safe Boolean expression evaluator for RSES set expressions.
 *              Replaces unsafe `new Function()` with recursive descent parser.
 * @phase Phase 1 - Security Hardening
 * @author SGT (Set-Graph Theorist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * @security This parser was specifically designed to prevent code injection.
 *           It only recognizes: true, false, &, |, !, (, ), $identifier
 *           Any other tokens cause immediate rejection.
 *
 * @complexity O(n) where n is expression length
 * @termination Guaranteed - no recursion beyond expression depth
 *
 * Grammar:
 *   expr     → or_expr
 *   or_expr  → and_expr ('|' and_expr)*
 *   and_expr → unary ('&' unary)*
 *   unary    → '!' unary | primary
 *   primary  → 'true' | 'false' | '$' identifier | '(' or_expr ')'
 */

export type TokenType =
  | "TRUE"
  | "FALSE"
  | "AND"
  | "OR"
  | "NOT"
  | "LPAREN"
  | "RPAREN"
  | "SETREF"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export class ExpressionError extends Error {
  constructor(
    message: string,
    public position: number,
    public code: string
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

/**
 * Tokenizes a Boolean expression string.
 * Converts input into a stream of tokens for the parser.
 *
 * @param expr - The expression string, e.g., "$tools & $claude"
 * @returns Array of tokens
 * @throws {ExpressionError} If invalid characters are found
 */
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Single-character tokens
    if (char === "&") {
      tokens.push({ type: "AND", value: "&", position: i });
      i++;
      continue;
    }

    if (char === "|") {
      tokens.push({ type: "OR", value: "|", position: i });
      i++;
      continue;
    }

    if (char === "!") {
      tokens.push({ type: "NOT", value: "!", position: i });
      i++;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(", position: i });
      i++;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")", position: i });
      i++;
      continue;
    }

    // Set reference: $identifier
    if (char === "$") {
      const start = i;
      i++; // skip $
      let name = "";
      while (i < expr.length && /[a-zA-Z0-9_-]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      if (name.length === 0) {
        throw new ExpressionError(
          `Expected identifier after '$' at position ${start}`,
          start,
          "E_INVALID_SETREF"
        );
      }
      tokens.push({ type: "SETREF", value: name, position: start });
      continue;
    }

    // Keywords: true, false
    if (/[a-zA-Z]/.test(char)) {
      const start = i;
      let word = "";
      while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
        word += expr[i];
        i++;
      }
      if (word === "true") {
        tokens.push({ type: "TRUE", value: "true", position: start });
      } else if (word === "false") {
        tokens.push({ type: "FALSE", value: "false", position: start });
      } else {
        throw new ExpressionError(
          `Unknown keyword '${word}' at position ${start}. Did you mean '$${word}'?`,
          start,
          "E_UNKNOWN_KEYWORD"
        );
      }
      continue;
    }

    // Invalid character
    throw new ExpressionError(
      `Unexpected character '${char}' at position ${i}`,
      i,
      "E_UNEXPECTED_CHAR"
    );
  }

  tokens.push({ type: "EOF", value: "", position: i });
  return tokens;
}

/**
 * Parser state for recursive descent parsing.
 */
class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private activeSets: Set<string>;

  constructor(tokens: Token[], activeSets: Set<string>) {
    this.tokens = tokens;
    this.activeSets = activeSets;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.current();
    if (token.type !== "EOF") {
      this.pos++;
    }
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new ExpressionError(
        `Expected ${type} but found ${token.type} at position ${token.position}`,
        token.position,
        "E_UNEXPECTED_TOKEN"
      );
    }
    return this.advance();
  }

  /**
   * Parse the top-level expression.
   * expr → or_expr
   */
  parse(): boolean {
    const result = this.parseOrExpr();
    if (this.current().type !== "EOF") {
      const token = this.current();
      throw new ExpressionError(
        `Unexpected token '${token.value}' at position ${token.position}`,
        token.position,
        "E_TRAILING_TOKENS"
      );
    }
    return result;
  }

  /**
   * Parse OR expressions.
   * or_expr → and_expr ('|' and_expr)*
   */
  private parseOrExpr(): boolean {
    let left = this.parseAndExpr();
    while (this.current().type === "OR") {
      this.advance(); // consume '|'
      const right = this.parseAndExpr();
      left = left || right;
    }
    return left;
  }

  /**
   * Parse AND expressions.
   * and_expr → unary ('&' unary)*
   */
  private parseAndExpr(): boolean {
    let left = this.parseUnary();
    while (this.current().type === "AND") {
      this.advance(); // consume '&'
      const right = this.parseUnary();
      left = left && right;
    }
    return left;
  }

  /**
   * Parse unary expressions (NOT).
   * unary → '!' unary | primary
   */
  private parseUnary(): boolean {
    if (this.current().type === "NOT") {
      this.advance(); // consume '!'
      return !this.parseUnary();
    }
    return this.parsePrimary();
  }

  /**
   * Parse primary expressions.
   * primary → 'true' | 'false' | '$' identifier | '(' or_expr ')'
   */
  private parsePrimary(): boolean {
    const token = this.current();

    switch (token.type) {
      case "TRUE":
        this.advance();
        return true;

      case "FALSE":
        this.advance();
        return false;

      case "SETREF":
        this.advance();
        return this.activeSets.has(token.value);

      case "LPAREN": {
        this.advance(); // consume '('
        const result = this.parseOrExpr();
        this.expect("RPAREN"); // consume ')'
        return result;
      }

      case "EOF":
        throw new ExpressionError(
          "Unexpected end of expression",
          token.position,
          "E_UNEXPECTED_EOF"
        );

      default:
        throw new ExpressionError(
          `Unexpected token '${token.value}' at position ${token.position}`,
          token.position,
          "E_UNEXPECTED_TOKEN"
        );
    }
  }
}

/**
 * LRU cache for tokenized expressions.
 * Avoids re-tokenizing the same expressions.
 */
class ExpressionCache {
  private cache: Map<string, Token[]> = new Map();
  private maxSize: number;
  private accessOrder: string[] = [];
  private _hits: number = 0;
  private _misses: number = 0;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(expr: string): Token[] | undefined {
    const cached = this.cache.get(expr);
    if (cached) {
      this._hits++;
      // Move to end of access order (most recently used)
      const idx = this.accessOrder.indexOf(expr);
      if (idx !== -1) {
        this.accessOrder.splice(idx, 1);
        this.accessOrder.push(expr);
      }
      // Return a copy to avoid mutation issues
      return [...cached];
    }
    this._misses++;
    return undefined;
  }

  set(expr: string, tokens: Token[]): void {
    if (this.cache.size >= this.maxSize) {
      // Evict least recently used
      const lru = this.accessOrder.shift();
      if (lru) {
        this.cache.delete(lru);
      }
    }
    this.cache.set(expr, tokens);
    this.accessOrder.push(expr);
  }

  get hits(): number { return this._hits; }
  get misses(): number { return this._misses; }
  get size(): number { return this.cache.size; }
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this._hits = 0;
    this._misses = 0;
  }
}

// Global expression cache
const expressionCache = new ExpressionCache(500);

/**
 * Gets the expression cache statistics (for monitoring/testing).
 */
export function getExpressionCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
  return {
    hits: expressionCache.hits,
    misses: expressionCache.misses,
    size: expressionCache.size,
    hitRate: expressionCache.hitRate,
  };
}

/**
 * Clears the expression cache (mainly for testing).
 */
export function clearExpressionCache(): void {
  expressionCache.clear();
}

/**
 * Evaluates a Boolean expression string against a set of active set names.
 * Uses caching to avoid re-tokenizing repeated expressions.
 *
 * @param expr - The expression string, e.g., "$tools & $claude"
 * @param activeSets - Set of set names that are currently true
 * @returns boolean - The result of evaluating the expression
 *
 * @example
 * evaluate("$tools & $claude", new Set(["tools", "claude"])) // true
 * evaluate("$tools & $web", new Set(["tools"]))              // false
 * evaluate("!$web", new Set(["tools"]))                      // true
 * evaluate("$a & ($b | $c)", new Set(["a", "b"]))            // true
 *
 * @throws {ExpressionError} If expression contains invalid tokens
 */
export function evaluate(expr: string, activeSets: Set<string>): boolean {
  if (!expr || expr.trim().length === 0) {
    return false;
  }

  // Try to get cached tokens
  let tokens = expressionCache.get(expr);
  if (!tokens) {
    tokens = tokenize(expr);
    expressionCache.set(expr, tokens);
  }

  const parser = new Parser(tokens, activeSets);
  return parser.parse();
}

/**
 * Safely evaluates a Boolean expression, returning false on any error.
 * This is a drop-in replacement for the old evaluateExpression function.
 *
 * @param expr - The expression string
 * @param activeSets - Set of active set names
 * @returns boolean - Result, or false if expression is invalid
 */
export function safeEvaluate(expr: string, activeSets: Set<string>): boolean {
  try {
    return evaluate(expr, activeSets);
  } catch {
    return false;
  }
}

/**
 * Validates an expression without evaluating it.
 * Returns validation result with error details if invalid.
 *
 * @param expr - The expression string to validate
 * @returns Object with valid flag and optional error details
 */
export function validateExpression(expr: string): {
  valid: boolean;
  error?: { message: string; position: number; code: string };
} {
  if (!expr || expr.trim().length === 0) {
    return { valid: false, error: { message: "Empty expression", position: 0, code: "E_EMPTY" } };
  }

  try {
    // Tokenize to check syntax
    const tokens = tokenize(expr);

    // Parse with a dummy set to check structure
    const parser = new Parser(tokens, new Set());
    parser.parse();

    return { valid: true };
  } catch (e) {
    if (e instanceof ExpressionError) {
      return {
        valid: false,
        error: { message: e.message, position: e.position, code: e.code },
      };
    }
    return {
      valid: false,
      error: { message: String(e), position: 0, code: "E_UNKNOWN" },
    };
  }
}
