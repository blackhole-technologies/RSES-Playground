/**
 * Tenant-scope engine.
 *
 * Three-layer user isolation primitives:
 *   1. AsyncLocalStorage context (runInUserScope, assertUserScope)
 *   2. scoped(userId) helper + withDbUserScope transaction wrapper
 *   3. dev-only Proxy guard catching raw db.* on registered tables
 *
 * Bootstrap wires it in:
 *
 *     const tenantScope = createTenantScope(db);
 *     db.db = tenantScope.wrapDb(db.db);  // dev-only effect
 *     tenantScope.register(users, users.id);  // per user-scoped table
 *
 * Modules then use:
 *
 *     await tenantScope.scoped(userId).select(posts);
 *     await tenantScope.withDbUserScope(userId, async (tx) => ...);
 */

import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { DbHandle } from "../../core/db";
import {
  createUserScopedTableRegistry,
  type UserScopedTableRegistry,
} from "./registry";
import { createScopedEngine, type ScopedEngine, type Tx } from "./scoped";
import { wrapDbWithDevGuard, type DevGuardOptions } from "./dev-guard";

export {
  runInUserScope,
  getCurrentUserScope,
  assertUserScope,
} from "./context";

export type { ScopedQueries } from "./scoped";
export type { Tx };

export interface TenantScope extends ScopedEngine {
  /** Register a table as user-scoped with the column that holds the user id. */
  register(table: PgTable, userIdColumn: PgColumn): void;

  /** True if the table has been registered. */
  isRegistered(table: PgTable): boolean;

  /**
   * Wrap a Drizzle client with the dev-only Proxy guard. Returns the raw
   * client unchanged when `enabled` is false. Typically called once in
   * bootstrap to replace `db.db` with the wrapped version in development.
   */
  wrapDb<T extends object>(rawDb: T, options?: DevGuardOptions): T;
}

export function createTenantScope(handle: DbHandle): TenantScope {
  const registry = createUserScopedTableRegistry();
  const { scoped, withDbUserScope } = createScopedEngine(handle, registry);

  return {
    register: registry.register,
    isRegistered: registry.isRegistered,
    scoped,
    withDbUserScope,
    wrapDb(rawDb, options) {
      return wrapDbWithDevGuard(rawDb, registry, {
        enabled: options?.enabled ?? process.env.NODE_ENV === "development",
      });
    },
  };
}

export type { UserScopedTableRegistry };
