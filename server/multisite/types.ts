/**
 * @file types.ts
 * @description Core types for RSES CMS Multi-Site Architecture
 * @module multisite
 * @author Project Architect Agent
 * @created 2026-02-01
 */

// =============================================================================
// NETWORK TYPES
// =============================================================================

/**
 * Network represents a collection of related sites under common management.
 */
export interface Network {
  /** Unique network identifier */
  id: string;

  /** Network name */
  name: string;

  /** URL-safe slug */
  slug: string;

  /** Network status */
  status: NetworkStatus;

  /** Subscription tier */
  tier: NetworkTier;

  /** Resource quotas */
  quota: NetworkQuota;

  /** Feature flags */
  features: NetworkFeatures;

  /** Primary owner user ID */
  ownerId: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

export type NetworkStatus = 'active' | 'suspended' | 'pending' | 'deleted';

export type NetworkTier = 'starter' | 'professional' | 'enterprise';

/**
 * Network resource quotas.
 */
export interface NetworkQuota {
  /** Maximum number of sites */
  maxSites: number;

  /** Maximum storage in bytes */
  maxStorageBytes: number;

  /** Maximum monthly bandwidth in bytes */
  maxBandwidthBytes: number;

  /** Maximum API requests per month */
  maxApiRequests: number;

  /** Maximum users across all sites */
  maxUsers: number;

  /** Maximum custom domains */
  maxCustomDomains: number;
}

/**
 * Network feature flags.
 */
export interface NetworkFeatures {
  /** Custom domains enabled */
  customDomains: boolean;

  /** SSL certificates enabled */
  sslEnabled: boolean;

  /** Content syndication across sites */
  contentSyndication: boolean;

  /** Enterprise tier sites allowed */
  enterpriseTier: boolean;

  /** API access enabled */
  apiAccess: boolean;

  /** SSO configuration allowed */
  ssoConfiguration: boolean;

  /** White-labeling enabled */
  whiteLabel: boolean;

  /** Edge deployment enabled */
  edgeDeployment: boolean;

  /** Advanced analytics */
  advancedAnalytics: boolean;
}

// =============================================================================
// SITE TYPES
// =============================================================================

/**
 * Site configuration stored in network database.
 */
export interface SiteConfig {
  /** Unique site identifier */
  siteId: string;

  /** Parent network ID */
  networkId: string;

  /** Site name */
  name: string;

  /** URL-safe slug */
  slug: string;

  /** Primary domain */
  primaryDomain: string;

  /** Site status */
  status: SiteStatus;

  /** Deployment tier */
  tier: SiteTier;

  /** Geographic region */
  region: string;

  /** Database shard ID */
  shardId: string;

  /** Database schema name (for schema-per-site) */
  schemaName: string;

  /** Feature flags for this site */
  features: SiteFeatures;

  /** Detailed configuration */
  config: SiteConfigDetails;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

export type SiteStatus = 'active' | 'suspended' | 'pending' | 'maintenance' | 'deleted';

export type SiteTier = 'free' | 'pro' | 'enterprise';

/**
 * Site-specific feature flags.
 */
export interface SiteFeatures {
  /** RSES classification enabled */
  rsesEnabled: boolean;

  /** AI features enabled */
  aiEnabled: boolean;

  /** Quantum features enabled */
  quantumEnabled: boolean;

  /** Real-time collaboration */
  realTimeEnabled: boolean;

  /** Content versioning */
  versioningEnabled: boolean;

  /** Workflow engine */
  workflowEnabled: boolean;

  /** Custom code execution */
  customCodeEnabled: boolean;

  /** API rate limit override */
  apiRateLimitOverride?: number;
}

/**
 * Detailed site configuration.
 */
export interface SiteConfigDetails {
  /** RSES configuration ID */
  rsesConfigId?: number;

  /** Theme settings */
  theme: {
    name: string;
    customCss?: string;
    customJs?: string;
  };

  /** Localization settings */
  localization: {
    defaultLocale: string;
    supportedLocales: string[];
    timezone: string;
  };

  /** Media settings */
  media: {
    maxUploadSizeBytes: number;
    allowedMimeTypes: string[];
    cdnUrl?: string;
    imageOptimization: boolean;
  };

  /** API settings */
  api: {
    rateLimitPerMinute: number;
    allowedOrigins: string[];
    webhookSecret?: string;
  };

  /** SEO settings */
  seo: {
    siteName: string;
    defaultTitle?: string;
    defaultDescription?: string;
    robotsTxt?: string;
  };

  /** Security settings */
  security: {
    allowedIPs?: string[];
    blockedIPs?: string[];
    requireAuth: boolean;
    sessionTimeout: number;
  };
}

// =============================================================================
// DOMAIN TYPES
// =============================================================================

/**
 * Domain mapping for routing.
 */
export interface DomainMapping {
  /** Mapping ID */
  id: string;

  /** Domain name */
  domain: string;

  /** Associated site ID */
  siteId: string;

  /** Domain type */
  type: DomainType;

  /** SSL certificate status */
  sslStatus: SSLStatus;

  /** SSL certificate expiry */
  sslExpiresAt?: Date;

  /** DNS verification status */
  dnsVerified: boolean;

  /** DNS verification token */
  dnsVerificationToken: string;

  /** Last verification attempt */
  lastVerificationAt?: Date;

  /** Verification error message */
  verificationError?: string;

  /** Created timestamp */
  createdAt: Date;
}

export type DomainType = 'primary' | 'alias' | 'preview' | 'branch';

export type SSLStatus = 'pending' | 'provisioning' | 'active' | 'expired' | 'failed';

/**
 * DNS record for domain configuration.
 */
export interface DNSRecord {
  /** Record type */
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'CAA';

  /** Record name (subdomain or @) */
  name: string;

  /** Record value */
  value: string;

  /** TTL in seconds */
  ttl: number;

  /** Optional priority (for MX) */
  priority?: number;

  /** Human-readable description */
  description?: string;
}

/**
 * DNS verification result.
 */
export interface DNSVerificationResult {
  /** Overall verification status */
  verified: boolean;

  /** Individual check results */
  checks: {
    cname: boolean;
    txt: boolean;
    caa?: boolean;
  };

  /** Current DNS values found */
  current: {
    cname?: string;
    txt?: string[];
    caa?: string[];
  };

  /** Expected values */
  expected: {
    cname: string;
    txt: string;
    caa?: string;
  };

  /** Error messages */
  errors: string[];

  /** Timestamp of verification */
  verifiedAt: Date;
}

// =============================================================================
// SHARDING TYPES
// =============================================================================

/**
 * Database shard information.
 */
export interface ShardInfo {
  /** Shard identifier */
  shardId: string;

  /** Geographic region */
  region: string;

  /** Primary database host */
  primaryHost: string;

  /** Replica database hosts */
  replicaHosts: string[];

  /** Connection string template */
  connectionStringTemplate: string;

  /** Site ID range (for range-based sharding) */
  siteRange: [number, number];

  /** Current load (0-1) */
  currentLoad: number;

  /** Maximum sites on this shard */
  maxSites: number;

  /** Current site count */
  currentSiteCount: number;

  /** Shard status */
  status: ShardStatus;

  /** Created timestamp */
  createdAt: Date;
}

export type ShardStatus = 'active' | 'readonly' | 'draining' | 'offline';

/**
 * Shard assignment for a site.
 */
export interface ShardAssignment {
  /** Site ID */
  siteId: string;

  /** Assigned shard ID */
  shardId: string;

  /** Schema name within shard */
  schemaName: string;

  /** Assignment timestamp */
  assignedAt: Date;

  /** Migration status (if being moved) */
  migrationStatus?: 'pending' | 'in_progress' | 'completed';
}

// =============================================================================
// PROVISIONING TYPES
// =============================================================================

/**
 * Site provisioning request.
 */
export interface ProvisioningRequest {
  /** Request ID for tracking */
  requestId: string;

  /** Target network */
  networkId: string;

  /** Site configuration */
  site: {
    name: string;
    slug: string;
    tier: SiteTier;
    region: string;
    template?: string;
  };

  /** Domain configuration */
  domain?: {
    custom?: string;
    includeSubdomain: boolean;
  };

  /** Initial site configuration */
  config?: Partial<SiteConfigDetails>;

  /** User making the request */
  requestedBy: string;

  /** Request priority */
  priority: 'low' | 'normal' | 'high';

  /** Request timestamp */
  requestedAt: Date;
}

/**
 * Provisioning status.
 */
export interface ProvisioningStatus {
  /** Request ID */
  requestId: string;

  /** Overall status */
  status: ProvisioningOverallStatus;

  /** Individual steps */
  steps: ProvisioningStep[];

  /** Created site ID (on success) */
  siteId?: string;

  /** Error message (on failure) */
  error?: string;

  /** Timestamps */
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  /** Estimated completion */
  estimatedCompletion?: Date;

  /** Progress percentage (0-100) */
  overallProgress: number;
}

export type ProvisioningOverallStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Individual provisioning step.
 */
export interface ProvisioningStep {
  /** Step name */
  name: string;

  /** Step description */
  description: string;

  /** Step status */
  status: ProvisioningStepStatus;

  /** Progress percentage (0-100) */
  progress: number;

  /** Timestamps */
  startedAt?: Date;
  completedAt?: Date;

  /** Error message if failed */
  error?: string;

  /** Step output data */
  output?: Record<string, unknown>;
}

export type ProvisioningStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Site template for provisioning.
 */
export interface SiteTemplate {
  /** Template ID */
  id: string;

  /** Template name */
  name: string;

  /** Template description */
  description: string;

  /** Preview image URL */
  previewUrl?: string;

  /** Content types to create */
  contentTypes: ContentTypeTemplate[];

  /** Taxonomy vocabularies */
  vocabularies: VocabularyTemplate[];

  /** RSES configuration */
  rsesConfig?: RSESConfigTemplate;

  /** Sample content */
  sampleContent?: ContentTemplate[];

  /** Theme configuration */
  theme?: ThemeTemplate;

  /** Required tier */
  requiredTier: SiteTier;
}

export interface ContentTypeTemplate {
  name: string;
  slug: string;
  fields: FieldTemplate[];
}

export interface FieldTemplate {
  name: string;
  type: string;
  required: boolean;
  config?: Record<string, unknown>;
}

export interface VocabularyTemplate {
  name: string;
  slug: string;
  hierarchyType: 'flat' | 'single' | 'multiple';
  terms?: TermTemplate[];
}

export interface TermTemplate {
  name: string;
  slug: string;
  children?: TermTemplate[];
}

export interface RSESConfigTemplate {
  name: string;
  content: string;
}

export interface ContentTemplate {
  type: string;
  title: string;
  fields: Record<string, unknown>;
}

export interface ThemeTemplate {
  name: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  customCss?: string;
}

// =============================================================================
// SSO TYPES
// =============================================================================

/**
 * Network-wide user identity.
 */
export interface NetworkIdentity {
  /** Identity ID */
  id: string;

  /** Network ID */
  networkId: string;

  /** Email address */
  email: string;

  /** Display name */
  displayName: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Network-level role */
  networkRole: NetworkRole;

  /** Per-site role assignments */
  siteRoles: SiteRoleAssignment[];

  /** SSO provider (if external) */
  ssoProvider?: string;

  /** SSO subject ID */
  ssoSubjectId?: string;

  /** MFA enabled */
  mfaEnabled: boolean;

  /** Created timestamp */
  createdAt: Date;

  /** Last login timestamp */
  lastLoginAt?: Date;
}

export type NetworkRole = 'owner' | 'admin' | 'member';

/**
 * Site-specific role assignment.
 */
export interface SiteRoleAssignment {
  /** Site ID */
  siteId: string;

  /** Role on site */
  role: SiteRole;

  /** Specific permissions (can override role defaults) */
  permissions: string[];

  /** Assignment timestamp */
  grantedAt: Date;

  /** User who granted the role */
  grantedBy: string;
}

export type SiteRole = 'admin' | 'editor' | 'author' | 'viewer';

/**
 * Network session for SSO.
 */
export interface NetworkSession {
  /** Session token */
  token: string;

  /** Associated identity ID */
  identityId: string;

  /** Network ID */
  networkId: string;

  /** Sites this session has access to */
  accessibleSites: string[];

  /** Session creation time */
  createdAt: Date;

  /** Session expiry */
  expiresAt: Date;

  /** Last activity */
  lastActivityAt: Date;

  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Session metadata.
 */
export interface SessionMetadata {
  /** IP address */
  ipAddress: string;

  /** User agent */
  userAgent: string;

  /** Device type */
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';

  /** Geographic location */
  location?: {
    country: string;
    region?: string;
    city?: string;
  };
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

/**
 * Network-wide analytics summary.
 */
export interface NetworkAnalytics {
  /** Network ID */
  networkId: string;

  /** Date range */
  dateRange: DateRange;

  /** Per-site metrics */
  siteMetrics: SiteMetrics[];

  /** Aggregated totals */
  totals: AggregatedMetrics;

  /** Generated timestamp */
  generatedAt: Date;
}

/**
 * Date range for analytics.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Metrics for a single site.
 */
export interface SiteMetrics {
  /** Site ID */
  siteId: string;

  /** Site name */
  siteName: string;

  /** Page views */
  pageViews: number;

  /** Unique visitors */
  uniqueVisitors: number;

  /** Average session duration (seconds) */
  avgSessionDuration: number;

  /** Bounce rate (0-1) */
  bounceRate: number;

  /** Content items created */
  contentCreated: number;

  /** Storage used (bytes) */
  storageUsed: number;

  /** Bandwidth used (bytes) */
  bandwidthUsed: number;

  /** API requests */
  apiRequests: number;

  /** Error count */
  errorCount: number;
}

/**
 * Aggregated metrics across network.
 */
export interface AggregatedMetrics {
  /** Total page views */
  totalPageViews: number;

  /** Total unique visitors */
  totalUniqueVisitors: number;

  /** Average session duration (seconds) */
  avgSessionDuration: number;

  /** Average bounce rate (0-1) */
  avgBounceRate: number;

  /** Total content items */
  totalContent: number;

  /** Total storage used (bytes) */
  totalStorageUsed: number;

  /** Total bandwidth used (bytes) */
  totalBandwidthUsed: number;

  /** Total API requests */
  totalApiRequests: number;

  /** Total errors */
  totalErrors: number;

  /** Active sites count */
  activeSites: number;
}

// =============================================================================
// SYNDICATION TYPES
// =============================================================================

/**
 * Content syndication request.
 */
export interface SyndicationRequest {
  /** Source site ID */
  sourceSiteId: string;

  /** Source content ID */
  sourceContentId: string;

  /** Target site IDs */
  targetSiteIds: string[];

  /** Syndication options */
  options: SyndicationOptions;

  /** Requesting user */
  requestedBy: string;

  /** Request timestamp */
  requestedAt: Date;
}

/**
 * Syndication options.
 */
export interface SyndicationOptions {
  /** Keep content synced with source */
  keepSynced: boolean;

  /** Include media assets */
  includeMedia: boolean;

  /** Include taxonomy terms */
  includeTaxonomy: boolean;

  /** Publish immediately on target */
  publishImmediately: boolean;

  /** Override fields on target */
  overrideFields?: Record<string, unknown>;
}

/**
 * Syndication result.
 */
export interface SyndicationResult {
  /** Source content ID */
  sourceContentId: string;

  /** Source site ID */
  sourceSiteId: string;

  /** Per-target results */
  targets: SyndicationTargetResult[];

  /** Overall success */
  success: boolean;

  /** Completed timestamp */
  completedAt: Date;
}

/**
 * Syndication result for a single target.
 */
export interface SyndicationTargetResult {
  /** Target site ID */
  siteId: string;

  /** Created content ID (on success) */
  contentId: string | null;

  /** Result status */
  status: 'success' | 'failed' | 'skipped';

  /** Error message if failed */
  error?: string;
}

// =============================================================================
// SITE CONTEXT TYPES
// =============================================================================

/**
 * Request-scoped site context.
 */
export interface SiteContext {
  /** Site ID */
  readonly siteId: string;

  /** Site configuration */
  readonly config: SiteConfig;

  /** Database pool scoped to site */
  readonly db: ScopedDatabasePool;

  /** Cache scoped to site */
  readonly cache: ScopedCache;

  /** Feature flags */
  readonly features: SiteFeatures;

  /** Authenticated user (if any) */
  readonly user?: AuthenticatedUser;

  /** Request metadata */
  readonly request: RequestMetadata;
}

/**
 * Database pool with automatic site scoping.
 */
export interface ScopedDatabasePool {
  /** Execute raw SQL within site scope */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Insert with automatic site_id */
  insert<T>(table: string, data: Omit<T, 'siteId'>): Promise<T>;

  /** Update within site scope */
  update<T>(
    table: string,
    where: Partial<T>,
    data: Partial<T>
  ): Promise<T>;

  /** Delete within site scope */
  delete(table: string, where: Record<string, unknown>): Promise<void>;

  /** Transaction within site scope */
  transaction<T>(fn: (tx: ScopedDatabasePool) => Promise<T>): Promise<T>;

  /** Get underlying pool for advanced operations */
  getPool(): unknown;
}

/**
 * Cache with automatic site key prefixing.
 */
export interface ScopedCache {
  /** Get cached value */
  get<T = unknown>(key: string): Promise<T | null>;

  /** Set cached value */
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Delete cached value */
  delete(key: string): Promise<void>;

  /** Delete multiple keys by pattern */
  deletePattern(pattern: string): Promise<number>;

  /** Invalidate all cache for site */
  invalidateAll(): Promise<void>;
}

/**
 * Authenticated user in site context.
 */
export interface AuthenticatedUser {
  /** User ID */
  id: string;

  /** Network identity ID */
  identityId: string;

  /** Email */
  email: string;

  /** Display name */
  displayName: string;

  /** Role on current site */
  role: SiteRole;

  /** Permissions on current site */
  permissions: string[];
}

/**
 * Request metadata.
 */
export interface RequestMetadata {
  /** Request ID for tracing */
  id: string;

  /** Request start time */
  startTime: number;

  /** Client IP address */
  ip: string;

  /** User agent string */
  userAgent: string;

  /** Request path */
  path: string;

  /** Request method */
  method: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Pagination options.
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Paginated response.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Creates a successful result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
