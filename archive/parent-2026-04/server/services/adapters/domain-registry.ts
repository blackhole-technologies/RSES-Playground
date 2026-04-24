/**
 * @file domain-registry.ts
 * @description Domain registry adapter for domain router
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

import type { DomainMapping, SiteConfig } from "../../multisite/types";
import type { DomainRegistry } from "../../multisite/routing/domain-router";
import { db } from "../../db";
import { domains, sites } from "@shared/multisite-schema";
import { eq, and } from "drizzle-orm";
import { withDbSiteScope } from "../../lib/tenant-scoped";
import { createModuleLogger } from "../../logger";
import { createDefaultSiteConfig } from "./network-db";

const log = createModuleLogger("domain-registry-adapter");

/**
 * Creates a DomainRegistry adapter backed by the database.
 */
export function createDomainRegistryAdapter(): DomainRegistry {
  const isDev = process.env.NODE_ENV !== "production";

  return {
    async getDomainMapping(domain: string): Promise<DomainMapping | null> {
      try {
        const [record] = await db
          .select()
          .from(domains)
          .where(eq(domains.domain, domain))
          .limit(1);

        if (!record) return null;

        return {
          id: record.id,
          domain: record.domain,
          siteId: record.siteId,
          type: record.type as DomainMapping["type"],
          sslStatus: record.sslStatus as DomainMapping["sslStatus"],
          sslExpiresAt: record.sslExpiresAt || undefined,
          dnsVerified: record.dnsVerified,
          dnsVerificationToken: record.dnsVerificationToken,
          lastVerificationAt: record.lastVerificationAt || undefined,
          verificationError: record.verificationError || undefined,
          createdAt: record.createdAt,
        };
      } catch (error) {
        log.error({ error, domain }, "Failed to get domain mapping");
        return null;
      }
    },

    async getDomainsBySite(siteId: string): Promise<DomainMapping[]> {
      try {
        const records = await db
          .select()
          .from(domains)
          .where(eq(domains.siteId, siteId));

        return records.map((record) => ({
          id: record.id,
          domain: record.domain,
          siteId: record.siteId,
          type: record.type as DomainMapping["type"],
          sslStatus: record.sslStatus as DomainMapping["sslStatus"],
          sslExpiresAt: record.sslExpiresAt || undefined,
          dnsVerified: record.dnsVerified,
          dnsVerificationToken: record.dnsVerificationToken,
          lastVerificationAt: record.lastVerificationAt || undefined,
          verificationError: record.verificationError || undefined,
          createdAt: record.createdAt,
        }));
      } catch (error) {
        log.error({ error, siteId }, "Failed to get domains by site");
        return [];
      }
    },

    async createDomainMapping(
      mapping: Omit<DomainMapping, "id" | "createdAt">
    ): Promise<DomainMapping> {
      const id = `dom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const [record] = await db
        .insert(domains)
        .values({
          id,
          domain: mapping.domain,
          siteId: mapping.siteId,
          type: mapping.type,
          sslStatus: mapping.sslStatus,
          sslExpiresAt: mapping.sslExpiresAt,
          dnsVerified: mapping.dnsVerified,
          dnsVerificationToken: mapping.dnsVerificationToken,
          lastVerificationAt: mapping.lastVerificationAt,
          verificationError: mapping.verificationError,
        })
        .returning();

      return {
        id: record.id,
        domain: record.domain,
        siteId: record.siteId,
        type: record.type as DomainMapping["type"],
        sslStatus: record.sslStatus as DomainMapping["sslStatus"],
        sslExpiresAt: record.sslExpiresAt || undefined,
        dnsVerified: record.dnsVerified,
        dnsVerificationToken: record.dnsVerificationToken,
        lastVerificationAt: record.lastVerificationAt || undefined,
        verificationError: record.verificationError || undefined,
        createdAt: record.createdAt,
      };
    },

    async updateDomainMapping(
      id: string,
      updates: Partial<DomainMapping>
    ): Promise<DomainMapping> {
      const [record] = await db
        .update(domains)
        .set({
          sslStatus: updates.sslStatus,
          sslExpiresAt: updates.sslExpiresAt,
          dnsVerified: updates.dnsVerified,
          lastVerificationAt: updates.lastVerificationAt,
          verificationError: updates.verificationError,
        })
        .where(eq(domains.id, id))
        .returning();

      return {
        id: record.id,
        domain: record.domain,
        siteId: record.siteId,
        type: record.type as DomainMapping["type"],
        sslStatus: record.sslStatus as DomainMapping["sslStatus"],
        sslExpiresAt: record.sslExpiresAt || undefined,
        dnsVerified: record.dnsVerified,
        dnsVerificationToken: record.dnsVerificationToken,
        lastVerificationAt: record.lastVerificationAt || undefined,
        verificationError: record.verificationError || undefined,
        createdAt: record.createdAt,
      };
    },

    async deleteDomainMapping(id: string, siteId?: string): Promise<void> {
      if (siteId) {
        await withDbSiteScope(siteId, async (tx) => {
          const txDb = tx as unknown as typeof db;
          await txDb.delete(domains).where(and(eq(domains.id, id), eq(domains.siteId, siteId)));
        });
        return;
      }
      await db.delete(domains).where(eq(domains.id, id));
    },

    async getSiteConfig(siteId: string): Promise<SiteConfig | null> {
      try {
        const [site] = await db
          .select()
          .from(sites)
          .where(eq(sites.siteId, siteId))
          .limit(1);

        if (!site) {
          if (isDev) {
            return createDefaultSiteConfig(siteId);
          }
          return null;
        }

        return {
          siteId: site.siteId,
          networkId: site.networkId,
          name: site.name,
          slug: site.slug,
          primaryDomain: site.primaryDomain,
          status: site.status as SiteConfig["status"],
          tier: site.tier as SiteConfig["tier"],
          region: site.region,
          shardId: site.shardId,
          schemaName: site.schemaName,
          features: site.features,
          config: site.config,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        };
      } catch (error) {
        log.error({ error, siteId }, "Failed to get site config");
        if (isDev) {
          return createDefaultSiteConfig(siteId);
        }
        return null;
      }
    },

    async getSiteByDomain(domain: string): Promise<SiteConfig | null> {
      const mapping = await this.getDomainMapping(domain);
      if (!mapping) return null;
      return this.getSiteConfig(mapping.siteId);
    },
  };
}
