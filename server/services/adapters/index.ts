/**
 * @file index.ts
 * @description Service adapters barrel export
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

export { createNetworkDbAdapter, createDefaultSiteConfig } from "./network-db";
export { createShardRouterAdapter, createScopedPool } from "./shard-router";
export { createCacheServiceAdapter, getCacheStats, clearAllCache } from "./cache-service";
export { createFeatureServiceAdapter, getDefaultFeaturesForTier } from "./feature-service";
export { createDomainRegistryAdapter } from "./domain-registry";
export { createDnsProviderAdapter } from "./dns-provider";
