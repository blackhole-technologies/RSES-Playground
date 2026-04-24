/**
 * Registry of user-scoped tables and their user_id column.
 *
 * Dependency-free (no db, no drizzle runtime). The WeakMap is keyed by
 * Drizzle table object identity so that disposable test tables can be
 * garbage-collected naturally. The factory below scopes the registry
 * per TenantScope instance, which lets tests keep isolated registries
 * without global state coordination.
 *
 * Ported from archive/parent-2026-04/server/lib/tenant-scoped-tables.ts.
 */

import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

export interface UserScopedTableRegistry {
  /**
   * Register a Drizzle table as user-scoped with the column that holds the
   * user id. Idempotent: calling a second time with the same table replaces
   * the column. No explicit unregister; if a table should no longer be
   * scoped, remove the registration call.
   */
  register(table: PgTable, userIdColumn: PgColumn): void;

  /** True if the table has been registered. */
  isRegistered(table: PgTable): boolean;

  /**
   * Resolve the user_id column for a table. Throws if the table is not
   * registered — a missing registration is always a bug, so fail loud.
   */
  userIdColumnFor(table: PgTable): PgColumn;
}

export function createUserScopedTableRegistry(): UserScopedTableRegistry {
  const tables = new WeakMap<object, PgColumn>();

  return {
    register(table, userIdColumn) {
      tables.set(table, userIdColumn);
    },
    isRegistered(table) {
      return tables.has(table);
    },
    userIdColumnFor(table) {
      const col = tables.get(table);
      if (!col) {
        throw new Error(
          "Table is not registered as user-scoped. " +
            "Call tenantScope.register(table, column) during bootstrap, or use " +
            "the unscoped db client if cross-user access is intentional.",
        );
      }
      return col;
    },
  };
}
