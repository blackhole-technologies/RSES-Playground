/**
 * @file tenant-scoped-tables.ts
 * @description Dependency-free registry of multi-tenant tables and their site_id column mapping.
 * @module lib
 * @phase Phase 1 - Foundation Hardening (added 2026-04-15 for ROADMAP M1.3)
 *
 * # Why this is split out from tenant-scoped.ts
 *
 * `tenant-scoped.ts` imports the Drizzle `db` client. Importing `db` triggers
 * `server/db.ts` which throws at module load if `DATABASE_URL` is not set.
 * The WeakMap of tagged tables and the three small helpers around it have
 * no db dependency — they only need Drizzle's type-level `PgTable` and
 * `PgColumn` exports. Splitting them into this file lets the dev-query
 * guard (`dev-query-guard.ts`) and its unit tests import the registry
 * without pulling in the database client.
 *
 * `tenant-scoped.ts` re-exports the three public functions so production
 * callers do not need to know about the split, matching the existing
 * pattern established by `tenant-scope-context.ts`.
 *
 * # What lives here
 *
 *   - MULTI_TENANT_TABLES: WeakMap<PgTable, PgColumn>
 *   - registerMultiTenantTable(table, col)
 *   - isMultiTenantTable(table)
 *   - siteIdColumnFor(table)
 *
 * # What does NOT live here
 *
 *   - `scoped(siteId)` and its ScopedQueries implementation — they touch the
 *     db client.
 *   - `withDbSiteScope(siteId, fn)` — it opens a transaction via the db
 *     client.
 *   - AsyncLocalStorage primitives — those are in `tenant-scope-context.ts`.
 *
 * Keeping this file narrow is deliberate: a registry of tables and their
 * scoping columns is a pure data structure, and dragging db-level concerns
 * into it would re-introduce the very coupling the split exists to avoid.
 */

import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * Registry of multi-tenant tables and the column that holds their site id.
 *
 * Keyed by the Drizzle table object (referential identity). WeakMap rather
 * than Map so that dev/test fixtures that create throwaway table objects
 * do not pin them in memory — the GC can reclaim unused table descriptors
 * naturally.
 *
 * This map is a module-singleton by design. There is only one tenant-scoped
 * registry per process. Tests that need isolation do so by creating fresh
 * fake table objects for each test; they cannot collide because each fake
 * is a distinct identity.
 */
const MULTI_TENANT_TABLES = new WeakMap<object, PgColumn>();

/**
 * Register a Drizzle table as multi-tenant scoped to a column.
 * Call this once at module load for each multi-tenant table.
 *
 * Example usage lives in `server/lib/tenant-scoped-registry.ts` —
 * see that file for the canonical pattern of importing tables from
 * the shared schema and registering them with their site-id column.
 * Doc examples are NOT reproduced here to avoid tripping the static
 * import-pattern lint in `tests/security/tenant-scoped-imports.test.ts`.
 *
 * Idempotent: a second call with the same table silently overwrites the
 * previous registration with the same column. There is no explicit
 * unregister — if you need to de-register a table, the correct fix is to
 * stop calling registerMultiTenantTable for it (typically by removing
 * the call from `tenant-scoped-registry.ts`).
 */
export function registerMultiTenantTable(
  table: PgTable,
  siteIdColumn: PgColumn
): void {
  MULTI_TENANT_TABLES.set(table, siteIdColumn);
}

/**
 * Returns true if a table has been registered as multi-tenant.
 *
 * Used by `scoped()` to validate the caller passed a registered table,
 * and by the dev-query guard (`dev-query-guard.ts`) to decide whether
 * a raw `db.select/insert/update/delete` call should be blocked.
 */
export function isMultiTenantTable(table: PgTable): boolean {
  return MULTI_TENANT_TABLES.has(table);
}

/**
 * Fetch the site id column for a table, throwing if the table is not
 * registered. Throwing is intentional — it surfaces the omission loudly
 * during development rather than silently dropping the scope.
 *
 * The error message names the convention fix so the developer can apply
 * it without grepping the codebase for the helper's definition.
 */
export function siteIdColumnFor(table: PgTable): PgColumn {
  const col = MULTI_TENANT_TABLES.get(table);
  if (!col) {
    throw new Error(
      `Table is not registered as multi-tenant. ` +
        `Call registerMultiTenantTable() at module load, or use the unscoped db client ` +
        `if cross-tenant access is intentional.`
    );
  }
  return col;
}
