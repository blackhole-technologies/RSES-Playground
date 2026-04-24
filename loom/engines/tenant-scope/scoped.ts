/**
 * User-scoped query helpers.
 *
 * Two bound primitives per user id:
 *
 *   scoped(userId).{select, selectOne, insert, update, deleteWhere}
 *     — fail-fast wrappers that inject the user_id predicate into
 *       every query on a registered table.
 *
 *   withDbUserScope(userId, fn)
 *     — opens a Drizzle transaction, sets the `app.current_user_id`
 *       session variable via set_config(..., is_local=true), and runs
 *       `fn(tx)` inside it. Postgres RLS policies read the session var
 *       so the tx is structurally isolated. The is_local=true flag
 *       auto-clears on COMMIT/ROLLBACK — safe under connection pooling.
 *
 * Why set_config instead of SET LOCAL: `SET LOCAL` does not accept bind
 * parameters; passing the userId would require string interpolation,
 * which is a SQL injection surface. `set_config('key', $1, true)` is
 * a function call that parameterizes the value properly.
 *
 * Ported from archive/parent-2026-04/server/lib/tenant-scoped.ts.
 * Renamed: siteId -> userId, site_id -> user_id, app.current_site_id
 * -> app.current_user_id. Restructured as a factory that takes a
 * DbHandle + registry instead of a module-level singleton db import.
 */

import { and, eq, sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createModuleLogger } from "../logger";
import type { DbHandle } from "../../core/db";
import type { UserScopedTableRegistry } from "./registry";
import { runInUserScope } from "./context";

/**
 * Transaction client type — extract from Drizzle's transaction signature
 * so we track upstream changes without hand-coded type shims.
 */
export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

export interface ScopedQueries {
  /** SELECT rows for this user, optionally narrowed by an additional WHERE. */
  select<T extends PgTable>(
    table: T,
    extraWhere?: SQL | undefined,
  ): Promise<Array<T["$inferSelect"]>>;

  /**
   * SELECT one row for this user by additional filter. Undefined if not found.
   * Throws if the filter matches more than one row.
   */
  selectOne<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>,
  ): Promise<T["$inferSelect"] | undefined>;

  /**
   * INSERT with automatic user_id binding. If the caller passes a userId in
   * the values, it must match the bound userId or we throw.
   */
  insert<T extends PgTable>(
    table: T,
    values: Omit<T["$inferInsert"], "userId"> & { userId?: string },
  ): Promise<void>;

  /** UPDATE rows for this user matching an additional filter. */
  update<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>,
    set: Partial<T["$inferInsert"]>,
  ): Promise<void>;

  /** DELETE rows for this user matching an additional filter. */
  deleteWhere<T extends PgTable>(
    table: T,
    where: Partial<T["$inferSelect"]>,
  ): Promise<void>;
}

export interface ScopedEngine {
  /**
   * Open a transaction bound to a user. The callback receives the Drizzle
   * transaction client; any query inside it runs with
   * `app.current_user_id = userId` set via set_config. Used directly for
   * query shapes not covered by ScopedQueries (upsert, orderBy/limit,
   * multi-statement transactions). The caller is responsible for including
   * the `user_id = ...` predicate — this helper sets the session var that
   * Postgres RLS reads; it does not rewrite your WHERE clauses.
   */
  withDbUserScope<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;

  /**
   * Bind queries to a specific user id. Throws if userId is empty — never
   * silently allow an unscoped query through.
   */
  scoped(userId: string): ScopedQueries;
}

export function createScopedEngine(
  handle: DbHandle,
  registry: UserScopedTableRegistry,
): ScopedEngine {
  const log = createModuleLogger("tenant-scope");

  const withDbUserScope = async <T>(
    userId: string,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> => {
    return handle.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
      );
      return fn(tx);
    });
  };

  const scoped = (userId: string): ScopedQueries => {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new Error(
        "scoped() requires a non-empty userId string. " +
          "Did you forget to read the user from the request?",
      );
    }

    const buildWhere = (
      table: PgTable,
      extra?: SQL | undefined,
    ): SQL | undefined => {
      const col = registry.userIdColumnFor(table);
      const userEq = eq(col, userId);
      return extra ? and(userEq, extra) : userEq;
    };

    const inScope = <T>(fn: () => T | Promise<T>): T | Promise<T> =>
      runInUserScope(userId, fn);

    return {
      async select(table, extraWhere) {
        return inScope(async () =>
          withDbUserScope(userId, async (tx) => {
            const where = buildWhere(table, extraWhere);
            return tx.select().from(table).where(where) as Promise<
              Array<(typeof table)["$inferSelect"]>
            >;
          }),
        ) as Promise<Array<(typeof table)["$inferSelect"]>>;
      },

      async selectOne(table, where) {
        return inScope(async () => {
          const extra = partialToWhere(table, where);
          const rows = await this.select(table, extra);
          if (rows.length > 1) {
            throw new Error(
              `selectOne matched ${rows.length} rows; expected at most one. ` +
                `User-scoped tables should have unique business keys per user.`,
            );
          }
          return rows[0];
        }) as Promise<(typeof table)["$inferSelect"] | undefined>;
      },

      async insert(table, values) {
        return inScope(async () =>
          withDbUserScope(userId, async (tx) => {
            const provided = (values as { userId?: string }).userId;
            if (provided !== undefined && provided !== userId) {
              log.error(
                { boundUserId: userId, providedUserId: provided },
                "user-scoped insert blocked: userId mismatch in payload",
              );
              throw new Error(
                `user-scoped insert: payload userId "${provided}" does not match bound userId "${userId}"`,
              );
            }
            const fullValues = { ...values, userId };
            await tx.insert(table).values(fullValues as (typeof table)["$inferInsert"]);
          }),
        ) as Promise<void>;
      },

      async update(table, where, set) {
        return inScope(async () =>
          withDbUserScope(userId, async (tx) => {
            if ((set as { userId?: unknown }).userId !== undefined) {
              throw new Error(
                "user-scoped update: cannot modify userId via scoped helper",
              );
            }
            const extra = partialToWhere(table, where);
            const wherePred = buildWhere(table, extra);
            await tx.update(table).set(set).where(wherePred);
          }),
        ) as Promise<void>;
      },

      async deleteWhere(table, where) {
        return inScope(async () =>
          withDbUserScope(userId, async (tx) => {
            const extra = partialToWhere(table, where);
            const wherePred = buildWhere(table, extra);
            await tx.delete(table).where(wherePred);
          }),
        ) as Promise<void>;
      },
    };
  };

  return { scoped, withDbUserScope };
}

/**
 * Convert a partial-row object into a Drizzle WHERE clause by AND-ing
 * eq(column, value) for each provided field. Skips undefined fields so
 * callers can pass a single object even when only some fields are set.
 */
function partialToWhere(
  table: PgTable,
  partial: Record<string, unknown>,
): SQL | undefined {
  const clauses: SQL[] = [];
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    const column = (table as unknown as Record<string, PgColumn | undefined>)[
      key
    ];
    if (!column) {
      const name =
        (table as unknown as { _?: { name?: string } })._?.name ?? "<unknown>";
      throw new Error(`Unknown column "${key}" on table ${name}`);
    }
    clauses.push(eq(column, value));
  }
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
}
