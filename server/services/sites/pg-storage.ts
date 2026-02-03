/**
 * @file pg-storage.ts
 * @description PostgreSQL Sites Storage Implementation
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @created 2026-02-02
 *
 * Persistent storage for site configurations using PostgreSQL via Drizzle ORM.
 */

import { eq, and, or, ilike, inArray, sql, desc, asc } from "drizzle-orm";
import { db, withCircuitBreaker } from "../../db";
import { sites, type SiteRow, type InsertSiteRow } from "@shared/schema";
import { safeLikePattern } from "../../lib/sql-utils";
import type { SiteConfig, ResourceUsage } from "@shared/admin/types";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("sites-pg-storage");

// =============================================================================
// TYPE CONVERTERS
// =============================================================================

/**
 * Convert database row to SiteConfig type
 */
function rowToSite(row: SiteRow): SiteConfig {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    environment: row.environment,
    region: row.region,
    version: row.version,
    healthStatus: row.healthStatus,
    lastHealthCheck: row.lastHealthCheck?.toISOString() ?? new Date().toISOString(),
    uptime: (row.uptime ?? 0) / 100, // Convert back from integer percentage
    resourceUsage: row.resourceUsage ?? undefined,
    resourceHistory: [], // Not stored in DB, computed on demand
    enabledFeatures: row.enabledFeatures ?? [],
    featureOverrides: row.featureOverrides ?? {},
    rsesConfigId: row.rsesConfigId ?? undefined,
    rsesConfigVersion: row.rsesConfigVersion ?? undefined,
    owner: row.owner ?? undefined,
    tags: row.tags ?? [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    lastDeployedAt: row.lastDeployedAt?.toISOString(),
  };
}

// =============================================================================
// SITES STORAGE CLASS
// =============================================================================

export interface ISitesStorage {
  getAll(): Promise<SiteConfig[]>;
  getById(id: string): Promise<SiteConfig | null>;
  getByIds(ids: string[]): Promise<SiteConfig[]>;
  create(site: Omit<SiteConfig, "createdAt" | "updatedAt" | "resourceHistory">): Promise<SiteConfig>;
  update(id: string, updates: Partial<SiteConfig>): Promise<SiteConfig | null>;
  delete(id: string): Promise<boolean>;
  search(query: {
    search?: string;
    environments?: string[];
    healthStatus?: string[];
    regions?: string[];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ sites: SiteConfig[]; total: number }>;
  updateHealthStatus(id: string, status: SiteConfig["healthStatus"]): Promise<void>;
  updateResourceUsage(id: string, usage: ResourceUsage): Promise<void>;
}

/**
 * PostgreSQL sites storage implementation
 */
export class PgSitesStorage implements ISitesStorage {
  async getAll(): Promise<SiteConfig[]> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(sites);
      return rows.map(rowToSite);
    });
  }

  async getById(id: string): Promise<SiteConfig | null> {
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
      return rows.length > 0 ? rowToSite(rows[0]) : null;
    });
  }

  async getByIds(ids: string[]): Promise<SiteConfig[]> {
    if (ids.length === 0) return [];
    return withCircuitBreaker(async () => {
      const rows = await db.select().from(sites).where(inArray(sites.id, ids));
      return rows.map(rowToSite);
    });
  }

  async create(site: Omit<SiteConfig, "createdAt" | "updatedAt" | "resourceHistory">): Promise<SiteConfig> {
    return withCircuitBreaker(async () => {
      const now = new Date();
      const [row] = await db
        .insert(sites)
        .values({
          id: site.id,
          name: site.name,
          domain: site.domain,
          environment: site.environment,
          region: site.region,
          version: site.version,
          healthStatus: site.healthStatus,
          lastHealthCheck: site.lastHealthCheck ? new Date(site.lastHealthCheck) : now,
          uptime: Math.round((site.uptime ?? 0) * 100), // Store as integer percentage
          resourceUsage: site.resourceUsage,
          enabledFeatures: site.enabledFeatures,
          featureOverrides: site.featureOverrides,
          rsesConfigId: site.rsesConfigId,
          rsesConfigVersion: site.rsesConfigVersion,
          owner: site.owner,
          tags: site.tags,
          createdAt: now,
          updatedAt: now,
          lastDeployedAt: site.lastDeployedAt ? new Date(site.lastDeployedAt) : undefined,
        })
        .returning();

      log.info({ id: site.id }, "Created site");
      return rowToSite(row);
    });
  }

  async update(id: string, updates: Partial<SiteConfig>): Promise<SiteConfig | null> {
    return withCircuitBreaker(async () => {
      const now = new Date();

      // Build update object, converting types as needed
      const updateData: Partial<InsertSiteRow> = {
        updatedAt: now,
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.domain !== undefined) updateData.domain = updates.domain;
      if (updates.environment !== undefined) updateData.environment = updates.environment;
      if (updates.region !== undefined) updateData.region = updates.region;
      if (updates.version !== undefined) updateData.version = updates.version;
      if (updates.healthStatus !== undefined) updateData.healthStatus = updates.healthStatus;
      if (updates.lastHealthCheck !== undefined) updateData.lastHealthCheck = new Date(updates.lastHealthCheck);
      if (updates.uptime !== undefined) updateData.uptime = Math.round(updates.uptime * 100);
      if (updates.resourceUsage !== undefined) updateData.resourceUsage = updates.resourceUsage;
      if (updates.enabledFeatures !== undefined) updateData.enabledFeatures = updates.enabledFeatures;
      if (updates.featureOverrides !== undefined) updateData.featureOverrides = updates.featureOverrides;
      if (updates.rsesConfigId !== undefined) updateData.rsesConfigId = updates.rsesConfigId;
      if (updates.rsesConfigVersion !== undefined) updateData.rsesConfigVersion = updates.rsesConfigVersion;
      if (updates.owner !== undefined) updateData.owner = updates.owner;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.lastDeployedAt !== undefined) updateData.lastDeployedAt = new Date(updates.lastDeployedAt);

      const [row] = await db
        .update(sites)
        .set(updateData)
        .where(eq(sites.id, id))
        .returning();

      if (!row) return null;

      log.info({ id }, "Updated site");
      return rowToSite(row);
    });
  }

  async delete(id: string): Promise<boolean> {
    return withCircuitBreaker(async () => {
      const result = await db.delete(sites).where(eq(sites.id, id));
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {
        log.info({ id }, "Deleted site");
      }
      return deleted;
    });
  }

  async search(query: {
    search?: string;
    environments?: string[];
    healthStatus?: string[];
    regions?: string[];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ sites: SiteConfig[]; total: number }> {
    return withCircuitBreaker(async () => {
      const conditions = [];

      if (query.search) {
        const searchPattern = safeLikePattern(query.search);
        conditions.push(
          or(
            ilike(sites.name, searchPattern),
            ilike(sites.domain, searchPattern)
          )
        );
      }

      if (query.environments && query.environments.length > 0) {
        conditions.push(inArray(sites.environment, query.environments as any));
      }

      if (query.healthStatus && query.healthStatus.length > 0) {
        conditions.push(inArray(sites.healthStatus, query.healthStatus as any));
      }

      if (query.regions && query.regions.length > 0) {
        conditions.push(inArray(sites.region, query.regions));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(sites)
        .where(whereClause);
      const total = Number(countResult[0]?.count ?? 0);

      // Get paginated results
      let queryBuilder = db.select().from(sites).where(whereClause).orderBy(asc(sites.name));

      if (query.offset) {
        queryBuilder = queryBuilder.offset(query.offset) as typeof queryBuilder;
      }
      if (query.limit) {
        queryBuilder = queryBuilder.limit(query.limit) as typeof queryBuilder;
      }

      const rows = await queryBuilder;

      // Filter by tags in memory (jsonb array search is complex)
      let results = rows.map(rowToSite);
      if (query.tags && query.tags.length > 0) {
        results = results.filter((s) => s.tags.some((t) => query.tags!.includes(t)));
      }

      return { sites: results, total };
    });
  }

  async updateHealthStatus(id: string, status: SiteConfig["healthStatus"]): Promise<void> {
    await withCircuitBreaker(async () => {
      await db
        .update(sites)
        .set({
          healthStatus: status,
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sites.id, id));
    });
  }

  async updateResourceUsage(id: string, usage: ResourceUsage): Promise<void> {
    await withCircuitBreaker(async () => {
      await db
        .update(sites)
        .set({
          resourceUsage: usage,
          updatedAt: new Date(),
        })
        .where(eq(sites.id, id));
    });
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: PgSitesStorage | null = null;

export function getSitesStorage(): ISitesStorage {
  if (!instance) {
    instance = new PgSitesStorage();
  }
  return instance;
}
