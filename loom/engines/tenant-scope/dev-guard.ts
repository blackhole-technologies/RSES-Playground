/**
 * Development-time Proxy guard.
 *
 * Wraps a Drizzle db client and blocks `select/insert/update/delete`
 * calls on registered user-scoped tables when the caller has bypassed
 * the scoped() helper. Only active in development — zero overhead in
 * production and test environments.
 *
 * Why dev-only:
 *   - Production defense lives at the Postgres RLS layer (migrations
 *     enable policies keyed on app.current_user_id).
 *   - A Proxy adds microsecond overhead per query; fine in dev,
 *     unnecessary in prod.
 *   - False positives in prod (e.g. a missed registration) would brick
 *     reads; dev catches that before it ships.
 *
 * Escape hatch: transaction clients (`tx`) returned by
 * `db.transaction(fn)` are NOT wrapped. The scoped() helper and
 * withDbUserScope() go through transactions, so they bypass the guard
 * naturally. An intentional cross-user admin query runs on the raw
 * top-level db and gets blocked in dev — comment the call site and
 * run its tests under NODE_ENV=test (not development).
 *
 * Ported from archive/parent-2026-04/server/lib/dev-query-guard.ts.
 */

import type { PgTable } from "drizzle-orm/pg-core";
import type { UserScopedTableRegistry } from "./registry";

export interface DevGuardOptions {
  /** When false, returns the raw db unchanged — zero overhead. */
  enabled: boolean;
}

function blockedMessage(verb: string, table: PgTable): string {
  const name =
    (table as unknown as { _?: { name?: string } })._?.name ?? "<unknown>";
  return (
    `tenant-scope dev-guard: blocked direct db.${verb}() on user-scoped table "${name}". ` +
    `Use tenantScope.scoped(userId).${verb === "select" ? "select" : verb}(table, ...) ` +
    `or tenantScope.withDbUserScope(userId, async (tx) => ...) and write through tx. ` +
    `If this call site is intentionally cross-user, annotate it with a comment ` +
    `and run the path under NODE_ENV=test or production — the guard only runs in development.`
  );
}

/**
 * Wrap a Drizzle-like db client with the guard. When `enabled` is false,
 * returns the raw reference unchanged (same identity — typeof/instanceof
 * still work). The generic T is preserved exactly so Drizzle's deep
 * type surface at call sites is unaffected.
 */
export function wrapDbWithDevGuard<T extends object>(
  rawDb: T,
  registry: UserScopedTableRegistry,
  options: DevGuardOptions,
): T {
  if (!options.enabled) return rawDb;

  return new Proxy(rawDb, {
    get(target, prop, receiver) {
      if (
        prop !== "select" &&
        prop !== "insert" &&
        prop !== "update" &&
        prop !== "delete"
      ) {
        return Reflect.get(target, prop, receiver);
      }

      const original = Reflect.get(target, prop, receiver) as unknown;
      if (typeof original !== "function") return original;

      if (prop === "select") {
        // select() returns a builder; the table name isn't known until
        // .from(table) is called, so we intercept that one method.
        return function selectWithGuard(
          this: unknown,
          ...args: unknown[]
        ): unknown {
          const builder = (original as (...a: unknown[]) => object).apply(
            target,
            args,
          );
          return new Proxy(builder, {
            get(bTarget, bProp, bReceiver) {
              if (bProp !== "from") return Reflect.get(bTarget, bProp, bReceiver);
              const rawFrom = Reflect.get(bTarget, bProp, bReceiver) as unknown;
              if (typeof rawFrom !== "function") return rawFrom;
              return function fromWithGuard(
                this: unknown,
                table: PgTable,
                ...rest: unknown[]
              ): unknown {
                if (registry.isRegistered(table)) {
                  throw new Error(blockedMessage("select", table));
                }
                return (rawFrom as (...a: unknown[]) => unknown).apply(
                  bTarget,
                  [table, ...rest],
                );
              };
            },
          });
        };
      }

      // insert / update / delete all take the table as the first arg.
      return function verbWithGuard(
        this: unknown,
        table: PgTable,
        ...rest: unknown[]
      ): unknown {
        if (registry.isRegistered(table)) {
          throw new Error(blockedMessage(prop as string, table));
        }
        return (original as (...a: unknown[]) => unknown).apply(target, [
          table,
          ...rest,
        ]);
      };
    },
  });
}
