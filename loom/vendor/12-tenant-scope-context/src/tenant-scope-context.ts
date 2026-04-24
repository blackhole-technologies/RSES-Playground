/**
 * @file tenant-scope-context.ts
 * @description AsyncLocalStorage-based tenant scope tracking, dependency-free.
 * @module lib
 * @phase Phase 1 - Foundation Hardening (added 2026-04-14, ROADMAP M1.3)
 *
 * # Why this is split out from tenant-scoped.ts
 *
 * `tenant-scoped.ts` imports the Drizzle `db` client. Importing `db` triggers
 * `server/db.ts` which throws at module load if `DATABASE_URL` is not set —
 * a sensible defense in production but a hard blocker in unit tests that
 * just want to verify the AsyncLocalStorage propagation semantics.
 *
 * This file contains ONLY the AsyncLocalStorage primitives (run, get, assert).
 * It has no db dependency, no schema dependency, and can be imported safely
 * from any test or background-job context regardless of database availability.
 * `tenant-scoped.ts` re-exports these so production callers don't need to
 * know about the split.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-async-chain storage for the currently-bound tenant scope. Set by
 * `runInTenantScope` for the duration of every callback. Reads via
 * `getCurrentTenantScope` or `assertScoped`.
 *
 * Module-singleton on purpose — only one tenant scope can be active per
 * async chain, and creating multiple instances would defeat propagation.
 */
const scopeContext = new AsyncLocalStorage<{ siteId: string }>();

/**
 * Run a function inside a tenant scope. Propagates through await/Promise
 * chains via AsyncLocalStorage.
 */
export function runInTenantScope<T>(
  siteId: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return scopeContext.run({ siteId }, fn);
}

/**
 * Read the currently bound tenant scope, or undefined if none is active.
 */
export function getCurrentTenantScope(): { siteId: string } | undefined {
  return scopeContext.getStore();
}

/**
 * Assert that we are running inside a tenant scope. Throws with a caller
 * label otherwise. Returns the bound siteId so the caller can use it
 * without re-importing getCurrentTenantScope.
 *
 * @example
 *   async function reindexFeatureFlags() {
 *     const siteId = assertScoped("reindexFeatureFlags");
 *     await scoped(siteId).select(siteFeatureOverrides);
 *   }
 */
export function assertScoped(callerName: string): string {
  const ctx = scopeContext.getStore();
  if (!ctx) {
    throw new Error(
      `${callerName} requires a tenant scope but none is bound. ` +
        `Wrap the call in runInTenantScope(siteId, () => ...) or scoped(siteId).`
    );
  }
  return ctx.siteId;
}
