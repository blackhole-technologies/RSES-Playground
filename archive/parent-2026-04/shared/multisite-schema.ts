/**
 * @file multisite-schema.ts
 * @description Database schema for RSES CMS Multi-Site Network
 * @module shared/multisite
 * @author Project Architect Agent
 * @created 2026-02-01
 *
 * This schema defines the network-level database tables for multi-site management.
 * These tables are stored in the central network database, not in individual site shards.
 */

import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  varchar,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// =============================================================================
// NETWORKS TABLE
// =============================================================================

/**
 * Networks represent collections of related sites under common management.
 * Each network has its own quota, features, and billing.
 */
export const networks = pgTable('networks', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  tier: varchar('tier', { length: 20 }).notNull().default('starter'),

  // Quotas
  maxSites: integer('max_sites').notNull().default(10),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).notNull().default(10737418240), // 10GB
  maxBandwidthBytes: bigint('max_bandwidth_bytes', { mode: 'number' }).notNull().default(107374182400), // 100GB
  maxApiRequests: integer('max_api_requests').notNull().default(100000),
  maxUsers: integer('max_users').notNull().default(100),
  maxCustomDomains: integer('max_custom_domains').notNull().default(5),

  // Features
  features: jsonb('features').$type<NetworkFeatures>().notNull().default({
    customDomains: false,
    sslEnabled: true,
    contentSyndication: false,
    enterpriseTier: false,
    apiAccess: true,
    ssoConfiguration: false,
    whiteLabel: false,
    edgeDeployment: false,
    advancedAnalytics: false,
  }),

  // Ownership
  ownerId: varchar('owner_id', { length: 64 }).notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('networks_slug_idx').on(table.slug),
  ownerIdx: index('networks_owner_idx').on(table.ownerId),
  statusIdx: index('networks_status_idx').on(table.status),
}));

export interface NetworkFeatures {
  customDomains: boolean;
  sslEnabled: boolean;
  contentSyndication: boolean;
  enterpriseTier: boolean;
  apiAccess: boolean;
  ssoConfiguration: boolean;
  whiteLabel: boolean;
  edgeDeployment: boolean;
  advancedAnalytics: boolean;
}

export const insertNetworkSchema = createInsertSchema(networks).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectNetworkSchema = createSelectSchema(networks);

export type Network = typeof networks.$inferSelect;
export type InsertNetwork = z.infer<typeof insertNetworkSchema>;

// =============================================================================
// SITES TABLE
// =============================================================================

/**
 * Sites represent individual installations within a network.
 * Each site has its own content, users, and configuration.
 */
export const sites = pgTable('sites', {
  siteId: varchar('site_id', { length: 64 }).primaryKey(),
  networkId: varchar('network_id', { length: 64 }).notNull().references(() => networks.id),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  primaryDomain: varchar('primary_domain', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  tier: varchar('tier', { length: 20 }).notNull().default('free'),
  region: varchar('region', { length: 32 }).notNull(),

  // Database shard assignment
  shardId: varchar('shard_id', { length: 64 }).notNull(),
  schemaName: varchar('schema_name', { length: 64 }).notNull(),

  // Features
  features: jsonb('features').$type<SiteFeatures>().notNull().default({
    rsesEnabled: true,
    aiEnabled: false,
    quantumEnabled: false,
    realTimeEnabled: false,
    versioningEnabled: true,
    workflowEnabled: false,
    customCodeEnabled: false,
  }),

  // Configuration
  config: jsonb('config').$type<SiteConfig>().notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  networkIdx: index('sites_network_idx').on(table.networkId),
  slugIdx: uniqueIndex('sites_slug_idx').on(table.slug),
  domainIdx: uniqueIndex('sites_domain_idx').on(table.primaryDomain),
  statusIdx: index('sites_status_idx').on(table.status),
  regionIdx: index('sites_region_idx').on(table.region),
  shardIdx: index('sites_shard_idx').on(table.shardId),
}));

export interface SiteFeatures {
  rsesEnabled: boolean;
  aiEnabled: boolean;
  quantumEnabled: boolean;
  realTimeEnabled: boolean;
  versioningEnabled: boolean;
  workflowEnabled: boolean;
  customCodeEnabled: boolean;
  apiRateLimitOverride?: number;
}

export interface SiteConfig {
  rsesConfigId?: number;
  theme: {
    name: string;
    customCss?: string;
    customJs?: string;
  };
  localization: {
    defaultLocale: string;
    supportedLocales: string[];
    timezone: string;
  };
  media: {
    maxUploadSizeBytes: number;
    allowedMimeTypes: string[];
    cdnUrl?: string;
    imageOptimization: boolean;
  };
  api: {
    rateLimitPerMinute: number;
    allowedOrigins: string[];
    webhookSecret?: string;
  };
  seo: {
    siteName: string;
    defaultTitle?: string;
    defaultDescription?: string;
    robotsTxt?: string;
  };
  security: {
    allowedIPs?: string[];
    blockedIPs?: string[];
    requireAuth: boolean;
    sessionTimeout: number;
  };
}

export const insertSiteSchema = createInsertSchema(sites).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectSiteSchema = createSelectSchema(sites);

export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

// =============================================================================
// DOMAINS TABLE
// =============================================================================

/**
 * Domain mappings for sites.
 * Each site can have multiple domains (primary, alias, preview, branch).
 */
export const domains = pgTable('domains', {
  id: varchar('id', { length: 64 }).primaryKey(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  siteId: varchar('site_id', { length: 64 }).notNull().references(() => sites.siteId),
  type: varchar('type', { length: 20 }).notNull().default('alias'),

  // SSL status
  sslStatus: varchar('ssl_status', { length: 20 }).notNull().default('pending'),
  sslExpiresAt: timestamp('ssl_expires_at'),

  // DNS verification
  dnsVerified: boolean('dns_verified').notNull().default(false),
  dnsVerificationToken: text('dns_verification_token').notNull(),
  lastVerificationAt: timestamp('last_verification_at'),
  verificationError: text('verification_error'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  domainIdx: uniqueIndex('domains_domain_idx').on(table.domain),
  siteIdx: index('domains_site_idx').on(table.siteId),
  sslStatusIdx: index('domains_ssl_status_idx').on(table.sslStatus),
}));

export const insertDomainSchema = createInsertSchema(domains).omit({
  createdAt: true,
});

export const selectDomainSchema = createSelectSchema(domains);

export type Domain = typeof domains.$inferSelect;
export type InsertDomain = z.infer<typeof insertDomainSchema>;

// =============================================================================
// SHARDS TABLE
// =============================================================================

/**
 * Database shards for horizontal scaling.
 * Each shard can host multiple sites.
 */
export const shards = pgTable('shards', {
  shardId: varchar('shard_id', { length: 64 }).primaryKey(),
  region: varchar('region', { length: 32 }).notNull(),
  primaryHost: text('primary_host').notNull(),
  replicaHosts: jsonb('replica_hosts').$type<string[]>().notNull().default([]),
  connectionStringTemplate: text('connection_string_template').notNull(),

  // Capacity
  maxSites: integer('max_sites').notNull().default(1000),
  currentSiteCount: integer('current_site_count').notNull().default(0),
  currentLoad: integer('current_load').notNull().default(0), // 0-100

  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  regionIdx: index('shards_region_idx').on(table.region),
  statusIdx: index('shards_status_idx').on(table.status),
}));

export const insertShardSchema = createInsertSchema(shards).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectShardSchema = createSelectSchema(shards);

export type Shard = typeof shards.$inferSelect;
export type InsertShard = z.infer<typeof insertShardSchema>;

// =============================================================================
// NETWORK IDENTITIES TABLE
// =============================================================================

/**
 * Network-wide user identities for SSO.
 * Each identity can have access to multiple sites.
 */
export const networkIdentities = pgTable('network_identities', {
  id: varchar('id', { length: 64 }).primaryKey(),
  networkId: varchar('network_id', { length: 64 }).notNull().references(() => networks.id),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  networkRole: varchar('network_role', { length: 20 }).notNull().default('member'),

  // SSO provider info
  ssoProvider: varchar('sso_provider', { length: 64 }),
  ssoSubjectId: varchar('sso_subject_id', { length: 255 }),

  // Security
  passwordHash: text('password_hash'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: text('mfa_secret'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
}, (table) => ({
  networkIdx: index('identities_network_idx').on(table.networkId),
  emailIdx: index('identities_email_idx').on(table.email),
  ssoIdx: index('identities_sso_idx').on(table.ssoProvider, table.ssoSubjectId),
  networkEmailIdx: uniqueIndex('identities_network_email_idx').on(table.networkId, table.email),
}));

export const insertNetworkIdentitySchema = createInsertSchema(networkIdentities).omit({
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export const selectNetworkIdentitySchema = createSelectSchema(networkIdentities);

export type NetworkIdentity = typeof networkIdentities.$inferSelect;
export type InsertNetworkIdentity = z.infer<typeof insertNetworkIdentitySchema>;

// =============================================================================
// SITE ROLE ASSIGNMENTS TABLE
// =============================================================================

/**
 * Role assignments for identities on specific sites.
 */
export const siteRoleAssignments = pgTable('site_role_assignments', {
  identityId: varchar('identity_id', { length: 64 }).notNull().references(() => networkIdentities.id),
  siteId: varchar('site_id', { length: 64 }).notNull().references(() => sites.siteId),
  role: varchar('role', { length: 20 }).notNull().default('viewer'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
  grantedBy: varchar('granted_by', { length: 64 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identityId, table.siteId] }),
  siteIdx: index('role_assignments_site_idx').on(table.siteId),
  roleIdx: index('role_assignments_role_idx').on(table.role),
}));

export const insertSiteRoleAssignmentSchema = createInsertSchema(siteRoleAssignments).omit({
  grantedAt: true,
});

export const selectSiteRoleAssignmentSchema = createSelectSchema(siteRoleAssignments);

export type SiteRoleAssignment = typeof siteRoleAssignments.$inferSelect;
export type InsertSiteRoleAssignment = z.infer<typeof insertSiteRoleAssignmentSchema>;

// =============================================================================
// NETWORK SESSIONS TABLE
// =============================================================================

/**
 * Network-wide sessions for SSO.
 */
export const networkSessions = pgTable('network_sessions', {
  token: varchar('token', { length: 255 }).primaryKey(),
  identityId: varchar('identity_id', { length: 64 }).notNull().references(() => networkIdentities.id),
  networkId: varchar('network_id', { length: 64 }).notNull().references(() => networks.id),
  accessibleSites: jsonb('accessible_sites').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<SessionMetadata>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
}, (table) => ({
  identityIdx: index('sessions_identity_idx').on(table.identityId),
  expiresIdx: index('sessions_expires_idx').on(table.expiresAt),
}));

export interface SessionMetadata {
  ipAddress: string;
  userAgent: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  location?: {
    country: string;
    region?: string;
    city?: string;
  };
}

export const insertNetworkSessionSchema = createInsertSchema(networkSessions).omit({
  createdAt: true,
  lastActivityAt: true,
});

export const selectNetworkSessionSchema = createSelectSchema(networkSessions);

export type NetworkSession = typeof networkSessions.$inferSelect;
export type InsertNetworkSession = z.infer<typeof insertNetworkSessionSchema>;

// =============================================================================
// PROVISIONING REQUESTS TABLE
// =============================================================================

/**
 * Site provisioning request queue.
 */
export const provisioningRequests = pgTable('provisioning_requests', {
  requestId: varchar('request_id', { length: 64 }).primaryKey(),
  networkId: varchar('network_id', { length: 64 }).notNull().references(() => networks.id),
  status: varchar('status', { length: 20 }).notNull().default('queued'),

  // Request details
  siteConfig: jsonb('site_config').$type<ProvisioningSiteConfig>().notNull(),
  domainConfig: jsonb('domain_config').$type<ProvisioningDomainConfig>(),
  requestedBy: varchar('requested_by', { length: 64 }).notNull(),
  priority: varchar('priority', { length: 20 }).notNull().default('normal'),

  // Status tracking
  steps: jsonb('steps').$type<ProvisioningStepStatus[]>().notNull().default([]),
  siteId: varchar('site_id', { length: 64 }),
  error: text('error'),
  overallProgress: integer('overall_progress').notNull().default(0),

  // Timestamps
  queuedAt: timestamp('queued_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  estimatedCompletion: timestamp('estimated_completion'),
}, (table) => ({
  networkIdx: index('provisioning_network_idx').on(table.networkId),
  statusIdx: index('provisioning_status_idx').on(table.status),
  priorityIdx: index('provisioning_priority_idx').on(table.priority),
}));

export interface ProvisioningSiteConfig {
  name: string;
  slug: string;
  tier: string;
  region: string;
  template?: string;
}

export interface ProvisioningDomainConfig {
  custom?: string;
  includeSubdomain: boolean;
}

export interface ProvisioningStepStatus {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: Record<string, unknown>;
}

export const insertProvisioningRequestSchema = createInsertSchema(provisioningRequests).omit({
  queuedAt: true,
  startedAt: true,
  completedAt: true,
});

export const selectProvisioningRequestSchema = createSelectSchema(provisioningRequests);

export type ProvisioningRequest = typeof provisioningRequests.$inferSelect;
export type InsertProvisioningRequest = z.infer<typeof insertProvisioningRequestSchema>;

// =============================================================================
// SITE ANALYTICS TABLE
// =============================================================================

/**
 * Aggregated site analytics for network-wide reporting.
 */
export const siteAnalytics = pgTable('site_analytics', {
  id: serial('id').primaryKey(),
  siteId: varchar('site_id', { length: 64 }).notNull().references(() => sites.siteId),
  date: timestamp('date').notNull(),

  // Traffic metrics
  pageViews: integer('page_views').notNull().default(0),
  uniqueVisitors: integer('unique_visitors').notNull().default(0),
  avgSessionDuration: integer('avg_session_duration').notNull().default(0), // seconds
  bounceRate: integer('bounce_rate').notNull().default(0), // 0-100

  // Content metrics
  contentCreated: integer('content_created').notNull().default(0),
  contentUpdated: integer('content_updated').notNull().default(0),
  contentPublished: integer('content_published').notNull().default(0),

  // Resource usage
  storageUsed: bigint('storage_used', { mode: 'number' }).notNull().default(0),
  bandwidthUsed: bigint('bandwidth_used', { mode: 'number' }).notNull().default(0),
  apiRequests: integer('api_requests').notNull().default(0),

  // Errors
  errorCount: integer('error_count').notNull().default(0),
}, (table) => ({
  siteIdx: index('analytics_site_idx').on(table.siteId),
  dateIdx: index('analytics_date_idx').on(table.date),
  siteDateIdx: uniqueIndex('analytics_site_date_idx').on(table.siteId, table.date),
}));

export const insertSiteAnalyticsSchema = createInsertSchema(siteAnalytics).omit({
  id: true,
});

export const selectSiteAnalyticsSchema = createSelectSchema(siteAnalytics);

export type SiteAnalytics = typeof siteAnalytics.$inferSelect;
export type InsertSiteAnalytics = z.infer<typeof insertSiteAnalyticsSchema>;

// =============================================================================
// SYNDICATION LINKS TABLE
// =============================================================================

/**
 * Content syndication relationships between sites.
 */
export const syndicationLinks = pgTable('syndication_links', {
  id: serial('id').primaryKey(),
  sourceSiteId: varchar('source_site_id', { length: 64 }).notNull().references(() => sites.siteId),
  sourceContentId: varchar('source_content_id', { length: 64 }).notNull(),
  targetSiteId: varchar('target_site_id', { length: 64 }).notNull().references(() => sites.siteId),
  targetContentId: varchar('target_content_id', { length: 64 }).notNull(),

  // Options
  keepSynced: boolean('keep_synced').notNull().default(false),
  includeMedia: boolean('include_media').notNull().default(true),
  includeTaxonomy: boolean('include_taxonomy').notNull().default(true),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastSyncAt: timestamp('last_sync_at'),
  syncError: text('sync_error'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 64 }).notNull(),
}, (table) => ({
  sourceIdx: index('syndication_source_idx').on(table.sourceSiteId, table.sourceContentId),
  targetIdx: index('syndication_target_idx').on(table.targetSiteId, table.targetContentId),
  statusIdx: index('syndication_status_idx').on(table.status),
}));

export const insertSyndicationLinkSchema = createInsertSchema(syndicationLinks).omit({
  id: true,
  createdAt: true,
});

export const selectSyndicationLinkSchema = createSelectSchema(syndicationLinks);

export type SyndicationLink = typeof syndicationLinks.$inferSelect;
export type InsertSyndicationLink = z.infer<typeof insertSyndicationLinkSchema>;

// =============================================================================
// FEATURE FLAGS TABLE
// =============================================================================

/**
 * Network-level feature flags for gradual rollouts.
 */
export const featureFlags = pgTable('feature_flags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),

  // Targeting
  targetNetworks: jsonb('target_networks').$type<string[]>().default([]),
  targetSites: jsonb('target_sites').$type<string[]>().default([]),
  targetTiers: jsonb('target_tiers').$type<string[]>().default([]),
  rolloutPercentage: integer('rollout_percentage').notNull().default(0), // 0-100

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('feature_flags_name_idx').on(table.name),
  enabledIdx: index('feature_flags_enabled_idx').on(table.enabled),
}));

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectFeatureFlagSchema = createSelectSchema(featureFlags);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
