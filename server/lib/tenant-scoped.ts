/**
 * @file tenant-scoped.ts
 * @description Tenant-scoped database query helper.
 * @module lib
 * @phase Phase 1 - Foundation Hardening (added 2026-04-14)
 *
 * # Why this exists
 *
 * The `tenant-isolation` middleware attaches a site context to each request,
 * but it does NOT enforce that subsequent database queries scope to that
 * site. A developer can write
 *
 *     await db.select().from(projects).where(eq(projects.id, id));
 *
 * and silently leak data across tenants. The middleware only blocks
 * cross-site access when a `siteId` parameter is explicitly mismatched in
 * the URL — which is rare. Most leaks would come from forgotten WHERE
 * clauses, not from explicit cross-tenant requests.
 *
 * This helper provides a **fail-fast** wrapper around Drizzle queries on
 * tagged multi-tenant tables. Two contracts:
 *
 * 1. **Explicit site_id binding required.** Every call must pass a siteId.
 *    There is no implicit "current request" lookup. This is deliberate:
 *    AsyncLocalStorage lookups can fail silently in background jobs, queue
 *    workers, and event handlers. Forcing the binding into the signature
 *    means the call site cannot forget.
 *
 * 2. **Tagged tables only.** A table must be registered in
 *    `MULTI_TENANT_TABLES` to be queried via this helper. Untagged tables
 *    fall through to plain Drizzle. This keeps the blast radius of the
 *    helper small and explicit while we work toward Postgres row-level
 *    security (tracked in ROADMAP M1.4).
 *
 * # Usage
 *
 * Read:
 *     const rows = await scoped(siteId).select(siteFeatureOverrides);
 *     const one  = await scoped(siteId).selectOne(siteFeatureOverrides, { id });
 *
 * Write:
 *     await scoped(siteId).insert(siteFeatureOverrides, { ... });
 *     await scoped(siteId).update(siteFeatureOverrides, { id }, { enabled: true });
 *     await scoped(siteId).deleteWhere(siteFeatureOverrides, { id });
 *
 * Custom WHERE clauses must still pass through Drizzle's where() builder, but
 * the helper always AND-merges the site_id binding so cross-tenant leaks are
 * structurally impossible.
 *
 * # What this is not
 *
 * - It is not row-level security. A developer who bypasses the helper and
 *   calls `db.select()` directly is not protected. M1.3 will add a Drizzle
 *   pre-query hook that blocks this in dev, and M1.4 will add Postgres RLS
 *   for the long-term defense.
 * - It is not for cross-site queries. Admin tools that legitimately need to
 *   read across sites must use the unscoped `db` and document why in the
 *   call site.
 */

import { and, eq, sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { createModuleLogger } from "../logger";
// AsyncLocalStorage primitives live in a sibling file with no db dependency
// so test code can verify scope propagation without provisioning a database.
// Production callers re-export them through this module so the public API
// is unchanged.
import {
  runInTenantScope,
  getCurrentTenantScope,
  assertScoped,
} from "./tenant-scope-context";
// Table registry primitives also live in a sibling file with no db
// dependency so the dev-query guard and its unit tests can import the
// WeakMap logic without triggering server/db.ts. Same re-export pattern
// as tenant-scope-context above — production callers see the same API.
import {
  registerMultiTenantTable,
  isMultiTenantTable,
  siteIdColumnFor,
} from "./tenant-scoped-tables";

export { runInTenantScope, getCurrentTenantScope, assertScoped };
export { registerMultiTenantTable, isMultiTenantTable };

const log = createModuleLogger("tenant-scoped");

/**
 * A query builder bound to a specific site id. Returned by scoped().
 * Each method includes the site id in every WHERE clause.
 */
export interface ScopedQueries {
  /**
   * SELECT all rows for this site, optionally narrowed by an additional
   * WHERE clause.
   */
  select<T extends PgTable>(
    table: T,
    extraWhere?: SQL | undefined
  ): Promise<Array<T["$inferSelect"]>>;

  /**
   * SELECT one row for this site by an additional filter (typically
   * { id } or { key }). Returns undefined if not found. Throws if the
   * filter matches more than one row — multi-tenant tables should always
   * have unique business keys per site.
   */
  selectOne<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>
  ): Promise<T["$inferSelect"] | undefined>;

  /**
   * INSERT with an automatic site_id binding. Throws if the caller passes
   * a mismatched site_id in the values, since that would indicate either
   * a bug or a deliberate cross-tenant write attempt.
   */
  insert<T extends PgTable>(
    table: T,
    values: Omit<T["$inferInsert"], "siteId"> & { siteId?: string }
  ): Promise<void>;

  /**
   * UPDATE rows for this site matching an additional filter.
   */
  update<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>,
    set: Partial<T["$inferInsert"]>
  ): Promise<void>;

  /**
   * DELETE rows for this site matching an additional filter.
   */
  deleteWhere<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>
  ): Promise<void>;
}

/**
 * Database transaction client shim — narrow enough to let the scoped helper
 * call select/insert/update/delete/execute on a Drizzle `tx` object without
 * pulling in Drizzle's full strongly-typed generics. The cast happens at
 * the boundary; the public ScopedQueries interface still enforces type
 * safety at the call site.
 */
type AnyTxClient = {
  select: (...a: unknown[]) => unknown;
  insert: (...a: unknown[]) => unknown;
  update: (...a: unknown[]) => unknown;
  delete: (...a: unknown[]) => unknown;
  execute: (q: SQL) => Promise<unknown>;
};

/**
 * Run an async function inside a Postgres transaction that has
 * `app.current_site_id` set via `set_config(..., true)` so it is
 * visible to any row-level security policy on the queried tables and
 * auto-clears on COMMIT.
 *
 * # Why set_config instead of SET LOCAL
 *
 * `SET LOCAL` is a plain SQL statement that does not accept bind
 * parameters — passing the siteId would require string interpolation,
 * which is a SQL injection surface. `set_config('key', $1, true)` is
 * a function call that accepts parameterized values, keeping the
 * siteId out of the SQL text entirely. The third argument
 * (`is_local = true`) makes the setting transaction-scoped: it is
 * visible inside this transaction and auto-reset on COMMIT/ROLLBACK.
 *
 * # Why a transaction per query
 *
 * The alternative — setting the session variable once on connection
 * check-out from the pool — is unsafe under connection pooling. The
 * variable would stick to the connection, and a subsequent checkout
 * by a different request would inherit the prior tenant's binding.
 * Per-query transactions give us a fresh, strictly-bounded scope at
 * the cost of BEGIN/COMMIT overhead (~sub-millisecond for local PG).
 *
 * # What happens without RLS policies
 *
 * If the tables do not yet have RLS policies (i.e. migration 0003 has
 * not been applied), the set_config call is harmless — it sets a
 * session setting nobody reads. This means Phase A (this code) is
 * safe to ship independently of Phase B (the migration).
 *
 * # When to use this vs. scoped()
 *
 * Prefer `scoped(siteId)` for the common verbs (select/selectOne/
 * insert/update/deleteWhere) — it adds the site_id AND clause for you
 * and fails closed on unregistered tables. Use `withDbSiteScope`
 * directly only when you need a Drizzle query shape the ScopedQueries
 * interface does not cover (upsert via `onConflictDoUpdate`,
 * `orderBy`/`limit`, a returning() count, or a multi-statement
 * transaction that touches the same site). The caller of this
 * function is responsible for including the `site_id = …` predicate
 * themselves — the helper only sets the session variable that
 * Postgres RLS reads; it does not rewrite your WHERE clause.
 */
export async function withDbSiteScope<T>(
  siteId: string,
  fn: (tx: AnyTxClient) => Promise<T>
): Promise<T> {
  return (db as unknown as {
    transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
  }).transaction(async (tx) => {
    const txAny = tx as AnyTxClient;
    await txAny.execute(
      sql`SELECT set_config('app.current_site_id', ${siteId}, true)`
    );
    return fn(txAny);
  });
}

/**
 * Bind queries to a specific site id. Throws if siteId is empty or
 * obviously invalid — never silently allow an unscoped query through.
 */
export function scoped(siteId: string): ScopedQueries {
  if (!siteId || typeof siteId !== "string" || siteId.trim() === "") {
    // Hard-throw rather than return undefined — an unscoped scoped() call is
    // always a bug, and we want it to surface at the caller in tests, not as
    // a missing-data symptom in production.
    throw new Error(
      "scoped() requires a non-empty siteId string. " +
        "Did you forget to read the site context from the request?"
    );
  }

  const buildWhere = (
    table: PgTable,
    extra?: SQL | undefined
  ): SQL | undefined => {
    const siteCol = siteIdColumnFor(table);
    const siteEq = eq(siteCol, siteId);
    return extra ? and(siteEq, extra) : siteEq;
  };

  // Every query the helper runs is wrapped in runInTenantScope so any
  // downstream code (background jobs, event handlers) that calls
  // assertScoped() observes the same siteId. This makes nested scopes
  // safe — re-entering scoped(siteId) inside a callback either matches
  // the existing scope (no-op semantics) or creates a child scope under
  // AsyncLocalStorage's normal propagation rules.
  const inScope = <T>(fn: () => T | Promise<T>): T | Promise<T> =>
    runInTenantScope(siteId, fn);

  return {
    async select(table, extraWhere) {
      return inScope(async () =>
        withDbSiteScope(siteId, async (tx) => {
          const where = buildWhere(table, extraWhere);
          return (tx.select() as {
            from: (t: unknown) => {
              where: (w: unknown) => Promise<unknown[]>;
            };
          })
            .from(table)
            .where(where);
        })
      ) as Promise<
        Array<typeof table extends PgTable ? typeof table["$inferSelect"] : never>
      >;
    },

    async selectOne(table, where) {
      return inScope(async () => {
        const extra = partialToWhere(table, where);
        const rows = await this.select(table, extra);
        if (rows.length > 1) {
          throw new Error(
            `selectOne matched ${rows.length} rows; expected at most one. ` +
              `Multi-tenant tables should have unique business keys per site.`
          );
        }
        return rows[0];
      }) as Promise<
        typeof table extends PgTable ? typeof table["$inferSelect"] | undefined : never
      >;
    },

    async insert(table, values) {
      return inScope(async () =>
        withDbSiteScope(siteId, async (tx) => {
          // Reject mismatched siteId in payload. If the caller passed
          // nothing, we inject the bound siteId. If they passed a matching
          // value, we accept. If they passed a mismatch, we throw.
          const provided = (values as { siteId?: string }).siteId;
          if (provided !== undefined && provided !== siteId) {
            log.error(
              { boundSiteId: siteId, providedSiteId: provided },
              "Tenant-scoped insert blocked: siteId mismatch in payload"
            );
            throw new Error(
              `tenant-scoped insert: payload siteId "${provided}" does not match bound siteId "${siteId}"`
            );
          }
          const fullValues = { ...values, siteId };
          await (tx.insert as unknown as (t: unknown) => {
            values: (v: unknown) => Promise<void>;
          })(table).values(fullValues);
        })
      ) as Promise<void>;
    },

    async update(table, where, set) {
      return inScope(async () =>
        withDbSiteScope(siteId, async (tx) => {
          // Refuse to update the site_id itself — a tenant cannot move
          // data between sites via this helper. Cross-site moves require
          // the unscoped client and an explicit code review.
          if ((set as { siteId?: unknown }).siteId !== undefined) {
            throw new Error(
              "tenant-scoped update: cannot modify siteId via scoped helper"
            );
          }
          const extra = partialToWhere(table, where);
          const wherePred = buildWhere(table, extra);
          await (
            tx.update as unknown as (t: unknown) => {
              set: (s: unknown) => { where: (w: unknown) => Promise<void> };
            }
          )(table)
            .set(set)
            .where(wherePred);
        })
      ) as Promise<void>;
    },

    async deleteWhere(table, where) {
      return inScope(async () =>
        withDbSiteScope(siteId, async (tx) => {
          const extra = partialToWhere(table, where);
          const wherePred = buildWhere(table, extra);
          await (
            tx.delete as unknown as (t: unknown) => {
              where: (w: unknown) => Promise<void>;
            }
          )(table).where(wherePred);
        })
      ) as Promise<void>;
    },
  };
}

/**
 * Convert a partial-row object into a Drizzle WHERE clause by AND-ing
 * eq(column, value) for each provided field. Skips undefined fields so
 * callers can pass a single object even when only some fields are set.
 */
function partialToWhere(
  table: PgTable,
  partial: Record<string, unknown>
): SQL | undefined {
  const clauses: SQL[] = [];
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    // Drizzle exposes columns as own properties of the table object.
    const column = (table as unknown as Record<string, PgColumn | undefined>)[key];
    if (!column) {
      throw new Error(`Unknown column "${key}" on table ${(table as { _: { name: string } })._?.name ?? "<unknown>"}`);
    }
    clauses.push(eq(column, value));
  }
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
}
