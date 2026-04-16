/**
 * @file dev-query-guard.ts
 * @description Development-time Proxy guard that blocks direct `db.select/insert/update/delete`
 *              calls on tables registered in the multi-tenant registry.
 * @module lib
 * @phase Phase 1 - Foundation Hardening
 * @milestone M1.3 (ROADMAP_2026-04-14_v6.md — "Drizzle pre-query hook blocking direct db.select() on tagged tables in dev")
 * @created 2026-04-15
 *
 * # Why this exists
 *
 * Layer 2 of the three-layer tenant isolation model (see
 * docs/security/TENANT-ISOLATION.md) is the `scoped(siteId)` helper in
 * `tenant-scoped.ts`. It only works if developers actually use it. A
 * direct `db.select().from(siteFeatureOverrides)` call bypasses the
 * helper entirely and silently leaks rows across tenants — exactly the
 * bug the static lint in `tests/security/tenant-scoped-imports.test.ts`
 * tries to catch, but the lint only checks *imports*. A file that
 * correctly imports the helper AND *also* calls raw `db.select()` for
 * a tagged table passes the lint but still leaks.
 *
 * This guard closes that hole at runtime, in development only:
 *
 *   - Wraps the Drizzle `db` client with a `Proxy`.
 *   - On `select/insert/update/delete`, inspects the table argument.
 *   - If the table is registered in `tenant-scoped-tables.ts` and the
 *     caller is NOT already inside a `scoped()` / `withDbSiteScope()`
 *     transaction (i.e. is using the raw top-level `db`, not a `tx`),
 *     throws with a clear error pointing at the fix.
 *
 * # Why dev only
 *
 * In production, the real defense is Postgres RLS (M1.4 Phase D —
 * migration 0004). A forgotten `scoped()` call returns zero rows under
 * FORCE ROW LEVEL SECURITY, which is noisy enough to catch in staging.
 * But "zero rows" is a slow feedback loop — a developer running
 * locally without RLS applied would not see the bug at all. This
 * guard gives the dev loop the same fail-fast behavior that FORCE RLS
 * gives the staging loop.
 *
 * The guard does NOT run in production because:
 *
 *   - The Proxy overhead on every query is non-zero (microseconds,
 *     but it compounds across high-QPS paths).
 *   - The production DB role is non-superuser and is already gated by
 *     Phase B + Phase D policies. A bypass in prod is already blocked
 *     at the DB layer, not at the application layer.
 *   - False positives in prod would be catastrophic — a mis-registered
 *     table could brick production reads. Dev catches the registration
 *     issue before it gets there.
 *
 * It also does NOT run in tests (NODE_ENV === 'test') because many
 * test fixtures seed data via raw `db.insert()` calls on tagged tables
 * before enabling policies. Blocking those would require rewriting
 * every fixture to go through `withDbSiteScope`, which is out of
 * scope for M1.3 and would double the surface area of this change.
 *
 * # Escape hatches
 *
 * The guard distinguishes the top-level `db` from a transaction `tx`
 * passed into `withDbSiteScope(siteId, tx => ...)`. `tx` is NOT wrapped
 * by this guard — only the top-level `db` object is. So:
 *
 *   - `db.select().from(siteFeatureOverrides)` — BLOCKED in dev
 *   - `scoped(siteId).select(siteFeatureOverrides)` — OK (uses tx internally)
 *   - `withDbSiteScope(siteId, tx => tx.select().from(siteFeatureOverrides))` — OK
 *
 * An intentional cross-tenant admin path that must use raw `db` on a
 * tagged table can be allowed in dev by catching the error and falling
 * back, but the recommended pattern is to document the exception at
 * the call site with a comment (see `pg-storage.ts:getForFeature` for
 * examples of cross-tenant admin queries annotated with
 * `INTENTIONAL CROSS-TENANT`) and run the code path under integration
 * tests that set `NODE_ENV=test` rather than `development`.
 *
 * # Relationship to the static lint
 *
 * `tests/security/tenant-scoped-imports.test.ts` is still valuable as
 * a PR-time gate — it fails fast without having to run any code. This
 * guard is the runtime complement: it catches the "imports helper,
 * forgets to use it" class of bug the lint cannot see.
 */

import type { PgTable } from "drizzle-orm/pg-core";
import { isMultiTenantTable } from "./tenant-scoped-tables";

/**
 * Options for the guard. Exposed so tests can force-enable the guard
 * without having to set `NODE_ENV=development`, and so the production
 * `server/db.ts` call site can pass a computed boolean instead of
 * reading the environment variable a second time.
 */
export interface DevQueryGuardOptions {
  /**
   * When false, `wrapDbWithDevGuard` returns the raw db unchanged. Used
   * by production and test environments to avoid any Proxy overhead.
   */
  enabled: boolean;
}

/**
 * Build the standard blocked-call error message. Centralized so every
 * blocked path produces an identical diagnostic and the tests can
 * assert a single substring rather than four different ones.
 *
 * Intentionally includes:
 *   - The verb that was blocked (`select/insert/update/delete`).
 *   - The table name extracted from Drizzle's internal table metadata
 *     (or "<unknown>" if it cannot be resolved — Drizzle exposes this
 *     under a `_` property on the table object).
 *   - A one-line fix recipe pointing at `scoped()` and
 *     `withDbSiteScope` so the developer can apply the fix without
 *     grep'ing the codebase.
 */
function blockedMessage(verb: string, table: PgTable): string {
  // Drizzle stores the table's SQL name in `table._.name` per the
  // pg-core runtime. Reading it defensively — the guard must not
  // throw a different error just because Drizzle restructured its
  // internals.
  const name =
    (table as unknown as { _?: { name?: string } })._?.name ?? "<unknown>";
  return (
    `dev-query-guard: blocked direct db.${verb}() on multi-tenant table "${name}". ` +
    `Use scoped(siteId).${verb === "select" ? "select" : verb}(table, ...) from ` +
    `server/lib/tenant-scoped.ts, or for Drizzle query shapes that scoped() ` +
    `does not cover (upsert, orderBy/limit, rowCount), use ` +
    `withDbSiteScope(siteId, async (tx) => ...) and write the Drizzle query ` +
    `through tx instead of db. If this call site is intentionally cross-tenant ` +
    `(admin tool, background job), annotate it with a code comment and run the ` +
    `path under NODE_ENV=test or production — the guard only runs in development.`
  );
}

/**
 * Wrap a Drizzle-like `db` client with a Proxy that blocks direct
 * `select/insert/update/delete` calls on multi-tenant tables. When
 * `options.enabled` is false, returns the raw db unchanged so the
 * call sites do not pay any Proxy cost.
 *
 * The generic `T` is preserved exactly — the returned value is
 * statically and structurally indistinguishable from the raw db. This
 * matters because Drizzle's `db` has a deeply typed `$with`, `query`,
 * `transaction`, etc., and any widening in the wrapper's signature
 * would erase those types at every call site that imports `db`.
 *
 * We do NOT constrain `T` to a `DrizzleLike` shape — doing so would
 * widen the return type to the constraint rather than preserving `T`
 * itself. The Proxy does its own per-property runtime inspection, so
 * it does not need static knowledge of `T`'s shape.
 *
 * @param rawDb  A Drizzle node-postgres client (or any object that
 *               exposes the four verb methods). Not validated — the
 *               Proxy forwards everything.
 * @param options.enabled  Controls whether the guard is active.
 *                         Production and test environments should
 *                         pass false. Development should pass true.
 */
export function wrapDbWithDevGuard<T extends object>(
  rawDb: T,
  options: DevQueryGuardOptions
): T {
  if (!options.enabled) {
    // Hot path: no interception. Returning the raw reference means
    // consumers get identical behavior to un-guarded db, including
    // `typeof`, instanceof, and property enumeration.
    return rawDb;
  }

  return new Proxy(rawDb, {
    get(target, prop, receiver) {
      // Only the four verbs are candidates for blocking. Everything
      // else (transaction, execute, query, logger, etc.) passes
      // through unchanged via Reflect.get so Drizzle's internals and
      // other re-exports keep working.
      if (
        prop !== "select" &&
        prop !== "insert" &&
        prop !== "update" &&
        prop !== "delete"
      ) {
        return Reflect.get(target, prop, receiver);
      }

      const original = Reflect.get(target, prop, receiver) as unknown;
      if (typeof original !== "function") {
        return original;
      }

      if (prop === "select") {
        // `db.select()` takes optional projection args and returns a
        // builder whose `.from(table)` actually names the table. We
        // cannot inspect the table until `.from()` is called, so we
        // return a lightweight wrapper around the builder that
        // intercepts only that one method.
        return function selectWithGuard(
          this: unknown,
          ...args: unknown[]
        ): unknown {
          const builder = (original as (...a: unknown[]) => object).apply(
            target,
            args
          );
          return new Proxy(builder, {
            get(bTarget, bProp, bReceiver) {
              if (bProp !== "from") {
                return Reflect.get(bTarget, bProp, bReceiver);
              }
              const rawFrom = Reflect.get(bTarget, bProp, bReceiver) as unknown;
              if (typeof rawFrom !== "function") {
                return rawFrom;
              }
              return function fromWithGuard(
                this: unknown,
                table: PgTable,
                ...rest: unknown[]
              ): unknown {
                if (isMultiTenantTable(table)) {
                  throw new Error(blockedMessage("select", table));
                }
                return (rawFrom as (...a: unknown[]) => unknown).apply(
                  bTarget,
                  [table, ...rest]
                );
              };
            },
          });
        };
      }

      // insert / update / delete all take the table as the first arg
      // to the top-level method, so we can check it without following
      // a builder chain.
      return function verbWithGuard(
        this: unknown,
        table: PgTable,
        ...rest: unknown[]
      ): unknown {
        if (isMultiTenantTable(table)) {
          throw new Error(blockedMessage(prop as string, table));
        }
        return (original as (...a: unknown[]) => unknown).apply(
          target,
          [table, ...rest]
        );
      };
    },
  });
}
