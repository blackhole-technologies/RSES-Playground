/**
 * @file index.ts
 * @description Multi-Site Module Entry Point for RSES CMS
 * @module multisite
 * @author Project Architect Agent
 * @created 2026-02-01
 *
 * This module provides multi-site deployment capabilities including:
 * - Site context management with request-scoped isolation
 * - Domain routing and DNS management
 * - Automated site provisioning
 * - Database sharding and connection management
 * - Single Sign-On (SSO) across sites
 * - Content syndication between sites
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export * from './types';

// =============================================================================
// SITE CONTEXT
// =============================================================================

export {
  getSiteContext,
  tryGetSiteContext,
  runWithSiteContext,
  getCurrentSiteId,
  getCurrentSiteConfig,
  isFeatureEnabled,
  createSiteContextMiddleware,
  SiteScopedRepository,
  SiteContextError,
  type SiteContextMiddlewareDeps,
} from './site/site-context';

// =============================================================================
// DOMAIN ROUTING
// =============================================================================

export {
  DomainRouter,
  EdgeDomainRouter,
  DEFAULT_DOMAIN_ROUTER_CONFIG,
  type DomainRouterConfig,
  type DomainRegistry,
  type DNSProvider,
  type DomainError,
} from './routing/domain-router';

// =============================================================================
// PROVISIONING
// =============================================================================

export {
  ProvisioningService,
  ProvisioningError,
  DEFAULT_PROVISIONING_CONFIG,
  type ProvisioningConfig,
  type DatabaseProvisioningResult,
  type DNSSetupResult,
  type SSLProvisioningResult,
} from './provisioning/provisioning-service';

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

import type {
  Network,
  NetworkStatus,
  NetworkTier,
  NetworkQuota,
  NetworkFeatures,
  SiteConfig,
  SiteStatus,
  SiteTier,
  SiteFeatures,
  SiteConfigDetails,
  DomainMapping,
  DomainType,
  SSLStatus,
  DNSRecord,
  DNSVerificationResult,
  ShardInfo,
  ShardStatus,
  ShardAssignment,
  ProvisioningRequest,
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningOverallStatus,
  ProvisioningStepStatus,
  SiteTemplate,
  NetworkIdentity,
  NetworkRole,
  SiteRoleAssignment,
  SiteRole,
  NetworkSession,
  SessionMetadata,
  NetworkAnalytics,
  SiteMetrics,
  AggregatedMetrics,
  SyndicationRequest,
  SyndicationResult,
  SiteContext,
  ScopedDatabasePool,
  ScopedCache,
  AuthenticatedUser,
  RequestMetadata,
  PaginationOptions,
  PaginatedResponse,
  Result,
} from './types';

export type {
  Network,
  NetworkStatus,
  NetworkTier,
  NetworkQuota,
  NetworkFeatures,
  SiteConfig,
  SiteStatus,
  SiteTier,
  SiteFeatures,
  SiteConfigDetails,
  DomainMapping,
  DomainType,
  SSLStatus,
  DNSRecord,
  DNSVerificationResult,
  ShardInfo,
  ShardStatus,
  ShardAssignment,
  ProvisioningRequest,
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningOverallStatus,
  ProvisioningStepStatus,
  SiteTemplate,
  NetworkIdentity,
  NetworkRole,
  SiteRoleAssignment,
  SiteRole,
  NetworkSession,
  SessionMetadata,
  NetworkAnalytics,
  SiteMetrics,
  AggregatedMetrics,
  SyndicationRequest,
  SyndicationResult,
  SiteContext,
  ScopedDatabasePool,
  ScopedCache,
  AuthenticatedUser,
  RequestMetadata,
  PaginationOptions,
  PaginatedResponse,
  Result,
};

// =============================================================================
// MODULE INITIALIZATION
// =============================================================================

/**
 * Multi-site module configuration.
 */
export interface MultisiteModuleConfig {
  /** Enable multi-site features */
  enabled: boolean;

  /** Default domain suffix for subdomains */
  defaultDomainSuffix: string;

  /** Edge hostname for CNAME records */
  edgeHostname: string;

  /** Maximum sites per network (default quota) */
  defaultMaxSites: number;

  /** Enable automatic provisioning queue */
  autoStartProvisioning: boolean;

  /** Cache TTL for domain lookups (ms) */
  domainCacheTtlMs: number;
}

/**
 * Default module configuration.
 */
export const DEFAULT_MULTISITE_CONFIG: MultisiteModuleConfig = {
  enabled: true,
  defaultDomainSuffix: 'rses-network.com',
  edgeHostname: 'edge.rses-network.com',
  defaultMaxSites: 10,
  autoStartProvisioning: true,
  domainCacheTtlMs: 60000,
};

/**
 * Multi-site module instance.
 */
export class MultisiteModule {
  private readonly config: MultisiteModuleConfig;
  private domainRouter?: DomainRouter;
  private provisioningService?: ProvisioningService;
  private initialized = false;

  constructor(config: Partial<MultisiteModuleConfig> = {}) {
    this.config = { ...DEFAULT_MULTISITE_CONFIG, ...config };
  }

  /**
   * Initializes the multi-site module with dependencies.
   */
  initialize(deps: MultisiteModuleDeps): void {
    if (this.initialized) {
      throw new Error('Multi-site module already initialized');
    }

    if (!this.config.enabled) {
      return;
    }

    // Initialize domain router
    this.domainRouter = new DomainRouter(
      deps.domainRegistry,
      deps.dnsProvider,
      deps.logger,
      {
        cacheTtlMs: this.config.domainCacheTtlMs,
        defaultDomainSuffix: this.config.defaultDomainSuffix,
        edgeHostname: this.config.edgeHostname,
      }
    );

    // Initialize provisioning service
    this.provisioningService = new ProvisioningService(
      deps.networkDb,
      deps.shardRouter,
      deps.dnsService,
      deps.sslService,
      deps.cdnService,
      deps.templateService,
      deps.eventBus,
      deps.logger
    );

    // Start provisioning queue if enabled
    if (this.config.autoStartProvisioning) {
      this.provisioningService.start();
    }

    this.initialized = true;
  }

  /**
   * Gets the domain router instance.
   */
  getDomainRouter(): DomainRouter {
    if (!this.domainRouter) {
      throw new Error('Multi-site module not initialized');
    }
    return this.domainRouter;
  }

  /**
   * Gets the provisioning service instance.
   */
  getProvisioningService(): ProvisioningService {
    if (!this.provisioningService) {
      throw new Error('Multi-site module not initialized');
    }
    return this.provisioningService;
  }

  /**
   * Shuts down the multi-site module.
   */
  shutdown(): void {
    if (this.provisioningService) {
      this.provisioningService.stop();
    }
    if (this.domainRouter) {
      this.domainRouter.clearCache();
    }
    this.initialized = false;
  }
}

/**
 * Dependencies for multi-site module initialization.
 */
export interface MultisiteModuleDeps {
  networkDb: import('./provisioning/provisioning-service').NetworkDatabase;
  domainRegistry: import('./routing/domain-router').DomainRegistry;
  dnsProvider: import('./routing/domain-router').DNSProvider;
  shardRouter: import('./provisioning/provisioning-service').ShardRouter;
  dnsService: import('./provisioning/provisioning-service').DNSService;
  sslService: import('./provisioning/provisioning-service').SSLService;
  cdnService: import('./provisioning/provisioning-service').CDNService;
  templateService: import('./provisioning/provisioning-service').TemplateService;
  eventBus: import('./provisioning/provisioning-service').EventBus;
  logger: import('./routing/domain-router').Logger;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default multi-site module instance.
 * Initialize with `multisiteModule.initialize(deps)` before use.
 */
export const multisiteModule = new MultisiteModule();
