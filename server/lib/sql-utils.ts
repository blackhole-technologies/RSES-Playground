/**
 * @file sql-utils.ts
 * @description SQL utility functions for safe pattern handling
 * @version 1.0.0
 * @created 2026-02-03
 */

/**
 * Escapes special characters in SQL LIKE/ILIKE patterns.
 *
 * SQL LIKE patterns use % and _ as wildcards. User input containing
 * these characters could manipulate search patterns in unintended ways.
 * The backslash is also escaped as it's the escape character itself.
 *
 * @param input - Raw user input string
 * @returns Escaped string safe for use in LIKE patterns
 *
 * @example
 * // User searches for "50% off"
 * escapeLikePattern("50% off") // Returns "50\% off"
 *
 * // User searches for "user_name"
 * escapeLikePattern("user_name") // Returns "user\_name"
 */
export function escapeLikePattern(input: string): string {
  // Escape backslash first (since it's the escape character)
  // then escape the wildcard characters % and _
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Creates a safe LIKE pattern for substring matching.
 * Escapes the input and wraps with % wildcards.
 *
 * @param input - Raw user input string
 * @returns Pattern like "%escaped_input%"
 */
export function safeLikePattern(input: string): string {
  return `%${escapeLikePattern(input)}%`;
}
