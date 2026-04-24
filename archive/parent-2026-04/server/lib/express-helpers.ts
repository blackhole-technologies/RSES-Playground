/**
 * @file express-helpers.ts
 * @description Small typed helpers for Express request handling.
 * @module lib
 *
 * Why this file exists: Express 5 + the project's typings produce
 * `string | string[]` for `req.params.X` and `req.query.X` in some routes.
 * Storage and service methods expect plain `string`. This file gives those
 * call sites a one-call coercion that's auditable in code review and
 * easier to grep for than ad-hoc `String(req.params.x)` casts.
 *
 * Use:
 *   import { reqParam, reqQuery, reqQueryOptional } from "@/server/lib/express-helpers";
 *   const id = reqParam(req.params.id);
 *   const search = reqQueryOptional(req.query.search);
 *
 * Rules of thumb:
 * - `reqParam` for path params (e.g. `:id`) — throws on missing because a
 *   missing route param is always a programming bug.
 * - `reqQuery` for required query strings — same throw-on-missing semantics.
 * - `reqQueryOptional` for optional query strings — returns undefined when
 *   absent; callers must handle the undefined case.
 *
 * Why these throw on missing: a route handler that reaches the helper
 * with an undefined value almost certainly has a wrong route definition or
 * a typo in the URL. Failing fast surfaces the bug immediately rather than
 * propagating an empty string into a query that returns the wrong rows.
 */

/**
 * Coerce a path parameter value to a string. Throws if the value is
 * undefined, null, or an empty array — those represent route-definition
 * bugs that should not fail silently.
 *
 * Returns the first element if Express somehow handed us an array
 * (theoretically shouldn't happen for path params but the project's
 * types allow it).
 */
export function reqParam(value: string | string[] | undefined): string {
  if (value === undefined || value === null) {
    throw new Error(
      "reqParam: route parameter is undefined. Check the route definition matches the URL pattern."
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error("reqParam: route parameter array is empty.");
    }
    return value[0];
  }
  return value;
}

/**
 * Coerce a required query-string value to a string. Throws on missing.
 * Use for query params the route handler depends on absolutely.
 */
export function reqQuery(value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error(
      "reqQuery: required query parameter is missing. Validate input before calling reqQuery."
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error("reqQuery: required query parameter array is empty.");
    }
    return String(value[0]);
  }
  return String(value);
}

/**
 * Coerce an optional query-string value. Returns undefined if absent.
 * Use for filters, search terms, and other "narrow the result" params.
 */
export function reqQueryOptional(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return String(value[0]);
  }
  return String(value);
}
