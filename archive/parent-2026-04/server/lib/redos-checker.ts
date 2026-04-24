/**
 * @file redos-checker.ts
 * @description Detects potential ReDoS (Regular Expression Denial of Service) patterns.
 * @phase Phase 2 - Core Engine Improvements
 * @author SEC (Security Specialist Agent)
 * @validated SGT (Set-Graph Theorist Agent)
 * @created 2026-01-31
 *
 * @security ReDoS attacks exploit catastrophic backtracking in regex engines.
 *           This checker identifies patterns that could cause exponential time complexity.
 *
 * Common ReDoS patterns:
 * - (a+)+        Nested quantifiers
 * - (a|a)+       Overlapping alternations with quantifiers
 * - (a|aa)+      Overlapping with different lengths
 * - (.*a){x}     Greedy quantifiers followed by specific chars
 */

/**
 * Result of ReDoS check.
 */
export interface ReDoSCheckResult {
  /** Whether the pattern is safe */
  safe: boolean;
  /** Risk level: none, low, medium, high */
  risk: "none" | "low" | "medium" | "high";
  /** Description of the vulnerability if found */
  reason?: string;
  /** Specific pattern that triggered the warning */
  trigger?: string;
}

/**
 * Patterns that indicate potential ReDoS vulnerabilities.
 * Each pattern is checked against the input regex.
 */
const REDOS_PATTERNS: Array<{
  pattern: RegExp;
  risk: "low" | "medium" | "high";
  description: string;
}> = [
  // Nested quantifiers - most dangerous
  {
    pattern: /\([^)]*[+*][^)]*\)[+*]/,
    risk: "high",
    description: "Nested quantifiers detected (e.g., (a+)+)",
  },
  {
    pattern: /\([^)]*[+*][^)]*\)\{/,
    risk: "high",
    description: "Nested quantifiers with {n} detected",
  },

  // Overlapping alternations with quantifiers
  {
    pattern: /\([^)]*\|[^)]*\)[+*]/,
    risk: "medium",
    description: "Alternation with quantifier detected (potential overlap)",
  },

  // Greedy quantifiers followed by overlapping patterns
  {
    pattern: /\.\*[^)]*[+*]/,
    risk: "medium",
    description: "Greedy .* followed by quantifier",
  },
  {
    pattern: /\.+[^)]*[+*]/,
    risk: "medium",
    description: "Greedy .+ followed by quantifier",
  },

  // Character classes with quantifiers followed by overlapping
  {
    pattern: /\[[^\]]+\][+*][^)]*\[[^\]]+\][+*]/,
    risk: "medium",
    description: "Multiple character classes with quantifiers",
  },

  // Backreferences in quantified groups
  {
    pattern: /\([^)]+\)[+*][^)]*\\1/,
    risk: "high",
    description: "Backreference to quantified group",
  },

  // Exponential patterns
  {
    pattern: /\([^)]*\([^)]*\)[+*][^)]*\)[+*]/,
    risk: "high",
    description: "Deeply nested groups with quantifiers",
  },

  // Quantifier immediately before closing parens followed by more closing parens and quantifier
  // Catches patterns like ((a+))+ where inner quantified group is inside outer quantified group
  {
    pattern: /[+*]\)+[+*]/,
    risk: "high",
    description: "Nested quantified groups (e.g., ((a+))+)",
  },
];

/**
 * Known safe patterns that might trigger false positives.
 * These are explicitly allowed.
 */
const SAFE_PATTERNS: RegExp[] = [
  /^\.\*$/, // Just ".*" is fine
  /^\[[\w-]+\]\*$/, // Simple character class with *
  /^\w+\*$/, // Simple word with * (like glob)
  /^\*$/, // Just "*"
];

/**
 * Checks if a pattern is potentially vulnerable to ReDoS attacks.
 *
 * @param pattern - The regex pattern string to check
 * @returns ReDoSCheckResult with safety assessment
 *
 * @example
 * checkReDoS("(a+)+")  // { safe: false, risk: "high", ... }
 * checkReDoS("web-*") // { safe: true, risk: "none" }
 */
export function checkReDoS(pattern: string): ReDoSCheckResult {
  // Check for empty or very short patterns
  if (!pattern || pattern.length < 3) {
    return { safe: true, risk: "none" };
  }

  // Check if it's a known safe pattern
  for (const safePattern of SAFE_PATTERNS) {
    if (safePattern.test(pattern)) {
      return { safe: true, risk: "none" };
    }
  }

  // Check against ReDoS patterns
  for (const { pattern: redosPattern, risk, description } of REDOS_PATTERNS) {
    if (redosPattern.test(pattern)) {
      return {
        safe: false,
        risk,
        reason: description,
        trigger: pattern,
      };
    }
  }

  // Additional check: count quantifiers and nesting depth
  const quantifierCount = (pattern.match(/[+*?]/g) || []).length;
  const groupDepth = calculateGroupDepth(pattern);

  if (quantifierCount > 3 && groupDepth > 1) {
    return {
      safe: false,
      risk: "low",
      reason: "Complex pattern with multiple quantifiers and nested groups",
      trigger: pattern,
    };
  }

  return { safe: true, risk: "none" };
}

/**
 * Calculates the maximum nesting depth of groups in a pattern.
 *
 * @param pattern - Regex pattern string
 * @returns Maximum nesting depth
 */
function calculateGroupDepth(pattern: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of pattern) {
    if (char === "(") {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === ")") {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }

  return maxDepth;
}

/**
 * Checks if a glob pattern (used in RSES sets) is safe.
 * Glob patterns are simpler than full regex and have different concerns.
 *
 * @param globPattern - Glob pattern (e.g., "*.txt", "web-*")
 * @returns ReDoSCheckResult
 */
export function checkGlobSafety(globPattern: string): ReDoSCheckResult {
  // Simple glob patterns are generally safe
  // They only use * for wildcards, not full regex

  // Count wildcards
  const wildcardCount = (globPattern.match(/\*/g) || []).length;

  // Multiple consecutive wildcards could be problematic when converted to regex
  if (/\*\*/.test(globPattern)) {
    return {
      safe: false,
      risk: "low",
      reason: "Consecutive wildcards may cause performance issues",
      trigger: globPattern,
    };
  }

  // Many wildcards in a short pattern
  if (wildcardCount > 3 && globPattern.length < 20) {
    return {
      safe: false,
      risk: "low",
      reason: "Too many wildcards in pattern",
      trigger: globPattern,
    };
  }

  // Check for regex-like patterns that shouldn't be in globs
  if (/[+?{}()\[\]|^$]/.test(globPattern)) {
    return {
      safe: false,
      risk: "medium",
      reason: "Pattern contains regex characters that may cause issues",
      trigger: globPattern,
    };
  }

  return { safe: true, risk: "none" };
}

/**
 * Validates multiple patterns and returns all issues found.
 *
 * @param patterns - Array of patterns to check
 * @returns Array of results for unsafe patterns only
 */
export function checkMultiplePatterns(patterns: string[]): ReDoSCheckResult[] {
  return patterns
    .map((p) => checkReDoS(p))
    .filter((r) => !r.safe);
}

/**
 * Validates a glob pattern used in RSES set definitions.
 * Returns a validation result suitable for the parser.
 *
 * @param pattern - The set pattern from RSES config
 * @returns Object with valid flag and optional error message
 */
export function validateSetPattern(pattern: string): {
  valid: boolean;
  error?: string;
} {
  // Check each sub-pattern (separated by |)
  const subPatterns = pattern.split("|").map((s) => s.trim());

  for (const subPattern of subPatterns) {
    const result = checkGlobSafety(subPattern);
    if (!result.safe) {
      return {
        valid: false,
        error: result.reason,
      };
    }
  }

  return { valid: true };
}
