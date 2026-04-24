/**
 * @file network-db.ts
 * @description Network database adapter for site context middleware
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

import type { SiteConfig, SiteFeatures, SiteConfigDetails } from "../../multisite/types";
import type { NetworkDatabase } from "../../multisite/site/site-context";
import { db } from "../../db";
import { sites, domains } from "@shared/multisite-schema";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("network-db-adapter");

/**
 * Default site features for development/fallback.
 */
const defaultFeatures: SiteFeatures = {
  rsesEnabled: true,
  aiEnabled: false,
  quantumEnabled: false,
  realTimeEnabled: true,
  versioningEnabled: true,
  workflowEnabled: false,
  customCodeEnabled: false,
};

/**
 * Default site config details for development/fallback.
 */
const defaultConfigDetails: SiteConfigDetails = {
  theme: {
    name: "default",
  },
  localization: {
    defaultLocale: "en",
    supportedLocales: ["en"],
    timezone: "UTC",
  },
  media: {
    maxUploadSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["image/*", "video/*", "audio/*", "application/pdf"],
    imageOptimization: true,
  },
  api: {
    rateLimitPerMinute: 100,
    allowedOrigins: ["*"],
  },
  seo: {
    siteName: "RSES CMS",
  },
  security: {
    requireAuth: false,
    sessionTimeout: 3600,
  },
};

/**
 * Creates a NetworkDatabase adapter that queries the database for site configs.
 * Falls back to default config in development mode.
 */
export function createNetworkDbAdapter(): NetworkDatabase {
  const isDev = process.env.NODE_ENV !== "production";

  return {
    async getSiteConfig(siteId: string): Promise<SiteConfig | null> {
      try {
        // Query database for site
        const [site] = await db
          .select()
          .from(sites)
          .where(eq(sites.siteId, siteId))
          .limit(1);

        if (site) {
          return mapDbSiteToConfig(site);
        }

        // In development, return default config for any site ID
        if (isDev) {
          log.debug({ siteId }, "Using default site config (dev mode)");
          return createDefaultSiteConfig(siteId);
        }

        return null;
      } catch (error) {
        log.error({ error, siteId }, "Failed to get site config");

        // In development, fall back to default
        if (isDev) {
          return createDefaultSiteConfig(siteId);
        }

        throw error;
      }
    },

    async getSiteByDomain(domain: string): Promise<SiteConfig | null> {
      try {
        // Query domains table
        const [domainRecord] = await db
          .select()
          .from(domains)
          .where(eq(domains.domain, domain))
          .limit(1);

        if (domainRecord) {
          return this.getSiteConfig(domainRecord.siteId);
        }

        // Check if domain matches default pattern (e.g., localhost, *.rses-network.com)
        if (isDev && (domain === "localhost" || domain.includes("localhost"))) {
          log.debug({ domain }, "Using default site for localhost");
          return createDefaultSiteConfig("default");
        }

        return null;
      } catch (error) {
        log.error({ error, domain }, "Failed to get site by domain");

        // In development, fall back to default
        if (isDev) {
          return createDefaultSiteConfig("default");
        }

        throw error;
      }
    },
  };
}

/**
 * Maps database site record to SiteConfig interface.
 */
function mapDbSiteToConfig(site: any): SiteConfig {
  return {
    siteId: site.siteId,
    networkId: site.networkId || "default",
    name: site.name || "Unnamed Site",
    slug: site.slug || site.siteId,
    primaryDomain: site.primaryDomain || `${site.siteId}.rses-network.com`,
    status: site.status || "active",
    tier: site.tier || "free",
    region: site.region || "us-east-1",
    shardId: site.shardId || "default",
    schemaName: site.schemaName || `site_${site.siteId}`,
    features: site.features || defaultFeatures,
    config: site.config || defaultConfigDetails,
    createdAt: site.createdAt || new Date(),
    updatedAt: site.updatedAt || new Date(),
  };
}

/**
 * Creates a default site config for development.
 */
function createDefaultSiteConfig(siteId: string): SiteConfig {
  return {
    siteId,
    networkId: "default",
    name: "Development Site",
    slug: siteId,
    primaryDomain: "localhost",
    status: "active",
    tier: "pro",
    region: "local",
    shardId: "default",
    schemaName: "public",
    features: defaultFeatures,
    config: defaultConfigDetails,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export { createDefaultSiteConfig, defaultFeatures, defaultConfigDetails };
