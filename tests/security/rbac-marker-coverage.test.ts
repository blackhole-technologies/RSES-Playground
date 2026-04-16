/**
 * @file rbac-marker-coverage.test.ts
 * @description Lint-style test enforcing that every route handler in
 * migrated route files is wrapped in an RBAC marker.
 *
 * # What this test guarantees
 *
 * For each file in `MIGRATED_FILES` below, every `router.METHOD(path, ...)`
 * call must use one of the marker wrappers (`protect`, `protectAll`,
 * `protectAny`, `authRoute`, `publicRoute`). Bare arrow functions and
 * unmarked named handlers are forbidden — they would silently bypass the
 * fail-closed RBAC enforcement.
 *
 * The check is lexical (regex on file content), not runtime, because:
 *   - It runs in CI in milliseconds with no app boot required.
 *   - Reviewers can run it locally without a database.
 *   - Failures point to specific line numbers.
 *
 * # Adding a migrated file
 *
 *   1. Convert every handler in the file to use protect/authRoute/publicRoute.
 *   2. Add the file path to `MIGRATED_FILES` below.
 *   3. The lint will then enforce coverage on every PR.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * Files that have been migrated to the marker pattern. The lint will
 * fail if any handler in these files is not wrapped in a marker.
 *
 * Add new files here as they are migrated.
 */
const MIGRATED_FILES = [
  "server/routes/admin-audit.ts",
  "server/routes/admin-rbac.ts",
  "server/routes/sdk-api.ts",
  "server/services/feature-flags/routes.ts",
  "server/services/feature-flags/site-routes.ts",
  "server/routes/admin-sites.ts",
  "server/routes/admin-users.ts",
  "server/routes/incidents.ts",
  "server/routes/automation.ts",
  "server/routes/projects.ts",
  "server/routes/assistant.ts",
  "server/routes/intelligent-watcher-admin.ts",
  "server/routes/messaging.ts",
];

/**
 * Marker function names recognized by the lint. Any handler whose first
 * non-path argument is a call to one of these is considered marked.
 */
const MARKER_NAMES = [
  "protect",
  "protectAll",
  "protectAny",
  "authRoute",
  "publicRoute",
];

/**
 * HTTP methods to scan. Anything matching `router.<method>(...` is treated
 * as a route registration and must use a marker.
 */
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "all", "use"];

interface RouteCall {
  method: string;
  path: string;
  handlerSnippet: string;
  line: number;
}

/**
 * Find all `router.METHOD("path", ...handler...)` invocations in a file.
 * Returns each with its line number and the handler portion (the second
 * argument forward).
 *
 * Uses String.matchAll to enumerate route registrations. The matched offset
 * is the location of the open paren; we then walk forward with a small
 * bracket counter to find the matching close paren.
 */
function findRouteCalls(content: string): RouteCall[] {
  const calls: RouteCall[] = [];
  const lines = content.split("\n");

  // Pattern that matches `router.<method>(` anywhere in the file.
  const startPattern = new RegExp(
    `router\\.(${HTTP_METHODS.join("|")})\\s*\\(`,
    "g"
  );

  // matchAll gives us all occurrences with .index for positional info.
  for (const match of content.matchAll(startPattern)) {
    const method = match[1];
    const matchIndex = match.index ?? 0;
    const matchEnd = matchIndex + match[0].length;
    const lineIndex = content.slice(0, matchIndex).split("\n").length - 1;

    const slice = content.slice(matchEnd);
    const args = extractParenContents(slice);
    if (!args) continue;

    // First arg is the path string; rest is the handler chain.
    const firstCommaIdx = findTopLevelComma(args);
    const pathArg =
      firstCommaIdx >= 0 ? args.slice(0, firstCommaIdx).trim() : args.trim();
    const handlerSnippet =
      firstCommaIdx >= 0 ? args.slice(firstCommaIdx + 1).trim() : "";

    // `router.use(middleware)` (no path) is also valid — handle it by
    // checking if pathArg looks like a string literal.
    const isPathString = /^["'`]/.test(pathArg);

    calls.push({
      method,
      path: isPathString ? pathArg : "<no-path>",
      handlerSnippet: isPathString ? handlerSnippet : args.trim(),
      line: lineIndex + 1,
    });

    // Suppress unused-var warning for `lines` (kept for future extensions
    // that need source-line context).
    void lines;
  }

  return calls;
}

/**
 * Given a string starting with the contents inside an open paren, return
 * the substring up to the matching close paren (exclusive). Tracks nested
 * parens/brackets/braces and string literals.
 */
function extractParenContents(s: string): string | null {
  let depth = 1;
  let inString: string | null = null;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return s.slice(0, i);
    }
    i++;
  }
  return null;
}

/**
 * Find the index of the first comma at the top level of an expression
 * (ignoring commas inside parens, brackets, braces, and strings).
 */
function findTopLevelComma(s: string): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}

/**
 * True if a handler snippet starts with a call to one of the marker
 * functions (e.g. `protect("perm", ...)` or `authRoute(...)`).
 */
function isHandlerMarked(snippet: string): boolean {
  for (const marker of MARKER_NAMES) {
    const re = new RegExp(`^${marker}\\s*\\(`);
    if (re.test(snippet)) return true;
  }
  return false;
}

describe("RBAC marker coverage in migrated route files", () => {
  for (const relativePath of MIGRATED_FILES) {
    describe(relativePath, () => {
      const fullPath = join(REPO_ROOT, relativePath);
      const content = readFileSync(fullPath, "utf-8");
      const calls = findRouteCalls(content);

      it("imports protect from ../middleware/rbac-protect", () => {
        expect(content).toMatch(/from\s+["'][^"']*rbac-protect["']/);
      });

      it("registers at least one route", () => {
        // A migrated file with zero routes is suspicious — likely a parse
        // failure or accidental file emptying.
        const routeCalls = calls.filter(
          (c) => c.method !== "use" || c.path !== "<no-path>"
        );
        expect(
          routeCalls.length,
          "Migrated file has zero detected routes — check the parser or the file"
        ).toBeGreaterThan(0);
      });

      it("every route handler is wrapped in a marker", () => {
        const offenders = calls
          .filter((c) => c.method !== "use") // router.use can hold middleware lists
          .filter((c) => !isHandlerMarked(c.handlerSnippet));

        if (offenders.length > 0) {
          const lines = offenders.map(
            (o) =>
              `  ${relativePath}:${o.line} — router.${o.method}(${o.path}, …) is not wrapped in a marker`
          );
          throw new Error(
            [
              `Found ${offenders.length} unmarked route handler(s) in ${relativePath}:`,
              ...lines,
              "",
              "Wrap each handler in one of:",
              "  protect(permission, async (req, res) => { ... })",
              "  protectAll([perms], async (req, res) => { ... })",
              "  protectAny([perms], async (req, res) => { ... })",
              "  authRoute(async (req, res) => { ... })",
              "  publicRoute(async (req, res) => { ... })",
              "",
              "See server/middleware/rbac-protect.ts and",
              "tests/security/rbac-fail-closed.test.ts for the contract.",
            ].join("\n")
          );
        }
        expect(offenders).toEqual([]);
      });
    });
  }

  // Sanity: assert the parser is actually running by checking the migrated
  // file contains expected routes. If MIGRATED_FILES gets pruned to zero,
  // this test still surfaces the empty list as a failure rather than a
  // silent pass.
  it("MIGRATED_FILES is non-empty", () => {
    expect(MIGRATED_FILES.length).toBeGreaterThan(0);
  });
});
