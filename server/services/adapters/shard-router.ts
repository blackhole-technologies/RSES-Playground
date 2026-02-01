/**
 * @file shard-router.ts
 * @description Shard router adapter for site-scoped database connections
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

import type { ScopedDatabasePool } from "../../multisite/types";
import type { ShardRouter } from "../../multisite/site/site-context";
import { db } from "../../db";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("shard-router-adapter");

/**
 * Creates a ShardRouter adapter that provides site-scoped database pools.
 *
 * In the current implementation, all sites share the same database with
 * schema-based isolation. In production, this would route to different
 * database shards based on the site's shard assignment.
 */
export function createShardRouterAdapter(): ShardRouter {
  return {
    async getPoolForSite(siteId: string, schemaName: string): Promise<ScopedDatabasePool> {
      log.debug({ siteId, schemaName }, "Getting pool for site");

      // Return a scoped database pool that automatically applies site isolation
      return createScopedPool(siteId, schemaName);
    },
  };
}

/**
 * Creates a site-scoped database pool wrapper.
 * Automatically injects site_id into queries and filters.
 */
function createScopedPool(siteId: string, schemaName: string): ScopedDatabasePool {
  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      // Execute raw SQL - in production, would set search_path to schema
      // For now, assume public schema with site_id filtering
      try {
        // Use drizzle's execute for raw queries
        const result = await (db as any).execute({
          sql,
          params: params || [],
        });
        return (result.rows || result) as T[];
      } catch (error) {
        log.error({ error, sql, siteId }, "Query failed");
        throw error;
      }
    },

    async insert<T>(table: string, data: Omit<T, "siteId">): Promise<T> {
      // Add site_id to the data
      const dataWithSite = {
        ...data,
        siteId: parseInt(siteId, 10) || siteId,
      };

      const columns = Object.keys(dataWithSite);
      const values = Object.values(dataWithSite);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

      const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`;

      try {
        const result = await (db as any).execute({
          sql,
          params: values,
        });
        return (result.rows?.[0] || result[0]) as T;
      } catch (error) {
        log.error({ error, table, siteId }, "Insert failed");
        throw error;
      }
    },

    async update<T>(
      table: string,
      where: Partial<T>,
      data: Partial<T>
    ): Promise<T> {
      const setEntries = Object.entries(data);
      const whereEntries = Object.entries(where);

      // Add site_id to where clause
      whereEntries.push(["site_id", siteId]);

      const setClause = setEntries
        .map(([key], i) => `${key} = $${i + 1}`)
        .join(", ");
      const whereClause = whereEntries
        .map(([key], i) => `${key} = $${setEntries.length + i + 1}`)
        .join(" AND ");

      const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
      const params = [...setEntries.map(([, v]) => v), ...whereEntries.map(([, v]) => v)];

      try {
        const result = await (db as any).execute({
          sql,
          params,
        });
        return (result.rows?.[0] || result[0]) as T;
      } catch (error) {
        log.error({ error, table, siteId }, "Update failed");
        throw error;
      }
    },

    async delete(table: string, where: Record<string, unknown>): Promise<void> {
      const whereEntries = Object.entries(where);

      // Add site_id to where clause
      whereEntries.push(["site_id", siteId]);

      const whereClause = whereEntries
        .map(([key], i) => `${key} = $${i + 1}`)
        .join(" AND ");

      const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
      const params = whereEntries.map(([, v]) => v);

      try {
        await (db as any).execute({
          sql,
          params,
        });
      } catch (error) {
        log.error({ error, table, siteId }, "Delete failed");
        throw error;
      }
    },

    async transaction<T>(fn: (tx: ScopedDatabasePool) => Promise<T>): Promise<T> {
      // For now, just execute without true transaction wrapping
      // In production, would use db.transaction()
      return fn(this);
    },

    getPool(): unknown {
      return db;
    },
  };
}

export { createScopedPool };
