/**
 * AsyncLocalStorage-based user scope tracking.
 *
 * Dependency-free (no db, no drizzle) so it can be imported from any
 * test or background-job context regardless of DB availability.
 *
 * Ported from archive/parent-2026-04/server/lib/tenant-scope-context.ts
 * with siteId -> userId renamed. The engine name stays "tenant-scope"
 * because the pattern is the same; only the scope key differs.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-async-chain storage for the currently-bound user scope.
 * Module-singleton on purpose: only one user scope can be active per
 * async chain, and multiple instances would defeat propagation.
 */
const scopeContext = new AsyncLocalStorage<{ userId: string }>();

/** Run a function inside a user scope. Propagates through await/Promise. */
export function runInUserScope<T>(
  userId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return scopeContext.run({ userId }, fn);
}

/** Read the currently bound user scope, or undefined if none active. */
export function getCurrentUserScope(): { userId: string } | undefined {
  return scopeContext.getStore();
}

/**
 * Assert we are inside a user scope. Throws with a caller label otherwise.
 * Returns the bound userId so the caller can use it directly.
 */
export function assertUserScope(callerName: string): string {
  const ctx = scopeContext.getStore();
  if (!ctx) {
    throw new Error(
      `${callerName} requires a user scope but none is bound. ` +
        `Wrap the call in runInUserScope(userId, () => ...) or scoped(userId).`,
    );
  }
  return ctx.userId;
}
