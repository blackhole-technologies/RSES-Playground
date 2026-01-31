/**
 * @file domain-router.ts
 * @description Domain routing service for multi-site deployment
 * @module multisite/routing
 * @author Project Architect Agent
 * @created 2026-02-01
 */

import type {
  SiteConfig,
  DomainMapping,
  DNSRecord,
  DNSVerificationResult,
  Result,
} from '../types';
import { ok, err } from '../types';

// =============================================================================
// DOMAIN ROUTER
// =============================================================================

/**
 * Domain router configuration.
 */
export interface DomainRouterConfig {
  /** Cache TTL for domain lookups in milliseconds */
  cacheTtlMs: number;

  /** Default domain suffix for subdomains */
  defaultDomainSuffix: string;

  /** Edge server hostname for CNAME */
  edgeHostname: string;

  /** Verification token prefix */
  verificationPrefix: string;

  /** Maximum domains per site */
  maxDomainsPerSite: number;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: DomainRouterConfig = {
  cacheTtlMs: 60000, // 1 minute
  defaultDomainSuffix: 'rses-network.com',
  edgeHostname: 'edge.rses-network.com',
  verificationPrefix: 'rses-site-verify',
  maxDomainsPerSite: 10,
};

/**
 * Domain registry interface for persistence.
 */
export interface DomainRegistry {
  getDomainMapping(domain: string): Promise<DomainMapping | null>;
  getDomainsBySite(siteId: string): Promise<DomainMapping[]>;
  createDomainMapping(mapping: Omit<DomainMapping, 'id' | 'createdAt'>): Promise<DomainMapping>;
  updateDomainMapping(id: string, updates: Partial<DomainMapping>): Promise<DomainMapping>;
  deleteDomainMapping(id: string): Promise<void>;
  getSiteConfig(siteId: string): Promise<SiteConfig | null>;
  getSiteByDomain(domain: string): Promise<SiteConfig | null>;
}

/**
 * DNS provider interface.
 */
export interface DNSProvider {
  createRecord(record: DNSRecord): Promise<void>;
  updateRecord(name: string, type: DNSRecord['type'], value: string): Promise<void>;
  deleteRecord(name: string, type: DNSRecord['type']): Promise<void>;
  getRecords(domain: string): Promise<DNSRecord[]>;
  verifyRecord(domain: string, type: DNSRecord['type'], expectedValue: string): Promise<boolean>;
}

/**
 * Logger interface.
 */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Domain router service.
 * Handles domain-to-site resolution and domain management.
 */
export class DomainRouter {
  private readonly config: DomainRouterConfig;
  private readonly registry: DomainRegistry;
  private readonly dnsProvider: DNSProvider;
  private readonly logger: Logger;

  /** In-memory cache for domain lookups */
  private readonly domainCache: Map<string, CacheEntry<SiteConfig>> = new Map();

  constructor(
    registry: DomainRegistry,
    dnsProvider: DNSProvider,
    logger: Logger,
    config: Partial<DomainRouterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry;
    this.dnsProvider = dnsProvider;
    this.logger = logger;

    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), this.config.cacheTtlMs);
  }

  // ===========================================================================
  // DOMAIN RESOLUTION
  // ===========================================================================

  /**
   * Resolves a hostname to a site configuration.
   */
  async resolve(hostname: string): Promise<SiteConfig | null> {
    // Normalize hostname
    const normalizedHostname = this.normalizeHostname(hostname);

    // Check cache first
    const cached = this.domainCache.get(normalizedHostname);
    if (cached && !this.isCacheExpired(cached)) {
      this.logger.debug('Domain cache hit', { hostname: normalizedHostname });
      return cached.value;
    }

    this.logger.debug('Domain cache miss', { hostname: normalizedHostname });

    // Check for built-in subdomain patterns
    const subdomainSite = await this.resolveSubdomain(normalizedHostname);
    if (subdomainSite) {
      this.cacheResult(normalizedHostname, subdomainSite);
      return subdomainSite;
    }

    // Query domain registry
    const config = await this.registry.getSiteByDomain(normalizedHostname);

    if (config) {
      this.cacheResult(normalizedHostname, config);
    }

    return config;
  }

  /**
   * Resolves built-in subdomain patterns.
   */
  private async resolveSubdomain(hostname: string): Promise<SiteConfig | null> {
    const suffix = `.${this.config.defaultDomainSuffix}`;

    if (!hostname.endsWith(suffix)) {
      return null;
    }

    const subdomain = hostname.slice(0, -suffix.length);

    // Pattern: {site-slug}.rses-network.com
    // Direct site slug lookup
    const siteConfig = await this.registry.getSiteConfig(subdomain);
    if (siteConfig) {
      return siteConfig;
    }

    // Pattern: preview-{site-id}.rses-network.com
    const previewMatch = subdomain.match(/^preview-(.+)$/);
    if (previewMatch) {
      return this.registry.getSiteConfig(previewMatch[1]);
    }

    // Pattern: {branch}--{site-id}.rses-network.com
    const branchMatch = subdomain.match(/^[a-zA-Z0-9-]+--(.+)$/);
    if (branchMatch) {
      return this.registry.getSiteConfig(branchMatch[1]);
    }

    return null;
  }

  // ===========================================================================
  // DOMAIN MANAGEMENT
  // ===========================================================================

  /**
   * Adds a custom domain to a site.
   */
  async addDomain(
    siteId: string,
    domain: string,
    type: DomainMapping['type'] = 'alias'
  ): Promise<Result<DomainMapping, DomainError>> {
    // Validate domain format
    if (!this.isValidDomain(domain)) {
      return err({
        code: 'INVALID_DOMAIN',
        message: `Invalid domain format: ${domain}`,
      });
    }

    // Check if domain is already registered
    const existing = await this.registry.getDomainMapping(domain);
    if (existing) {
      return err({
        code: 'DOMAIN_EXISTS',
        message: `Domain ${domain} is already registered`,
        existingSiteId: existing.siteId,
      });
    }

    // Check domain limit
    const siteDomains = await this.registry.getDomainsBySite(siteId);
    if (siteDomains.length >= this.config.maxDomainsPerSite) {
      return err({
        code: 'DOMAIN_LIMIT_EXCEEDED',
        message: `Site has reached maximum domain limit (${this.config.maxDomainsPerSite})`,
      });
    }

    // Generate verification token
    const verificationToken = this.generateVerificationToken(siteId);

    // Create domain mapping
    const mapping = await this.registry.createDomainMapping({
      domain: this.normalizeHostname(domain),
      siteId,
      type,
      sslStatus: 'pending',
      dnsVerified: false,
      dnsVerificationToken: verificationToken,
    });

    this.logger.info('Domain added', { siteId, domain, mappingId: mapping.id });

    return ok(mapping);
  }

  /**
   * Removes a domain from a site.
   */
  async removeDomain(siteId: string, domain: string): Promise<Result<void, DomainError>> {
    const normalizedDomain = this.normalizeHostname(domain);

    const mapping = await this.registry.getDomainMapping(normalizedDomain);

    if (!mapping) {
      return err({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain ${domain} not found`,
      });
    }

    if (mapping.siteId !== siteId) {
      return err({
        code: 'DOMAIN_NOT_OWNED',
        message: `Domain ${domain} is not owned by this site`,
      });
    }

    if (mapping.type === 'primary') {
      return err({
        code: 'CANNOT_REMOVE_PRIMARY',
        message: 'Cannot remove primary domain. Set another domain as primary first.',
      });
    }

    await this.registry.deleteDomainMapping(mapping.id);

    // Invalidate cache
    this.domainCache.delete(normalizedDomain);

    this.logger.info('Domain removed', { siteId, domain });

    return ok(undefined);
  }

  /**
   * Sets a domain as the primary domain for a site.
   */
  async setPrimaryDomain(
    siteId: string,
    domain: string
  ): Promise<Result<DomainMapping, DomainError>> {
    const normalizedDomain = this.normalizeHostname(domain);

    const mapping = await this.registry.getDomainMapping(normalizedDomain);

    if (!mapping) {
      return err({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain ${domain} not found`,
      });
    }

    if (mapping.siteId !== siteId) {
      return err({
        code: 'DOMAIN_NOT_OWNED',
        message: `Domain ${domain} is not owned by this site`,
      });
    }

    if (!mapping.dnsVerified) {
      return err({
        code: 'DNS_NOT_VERIFIED',
        message: 'Domain DNS must be verified before setting as primary',
      });
    }

    if (mapping.sslStatus !== 'active') {
      return err({
        code: 'SSL_NOT_ACTIVE',
        message: 'Domain must have active SSL before setting as primary',
      });
    }

    // Demote current primary
    const siteDomains = await this.registry.getDomainsBySite(siteId);
    const currentPrimary = siteDomains.find((d) => d.type === 'primary');
    if (currentPrimary && currentPrimary.id !== mapping.id) {
      await this.registry.updateDomainMapping(currentPrimary.id, { type: 'alias' });
    }

    // Promote new primary
    const updated = await this.registry.updateDomainMapping(mapping.id, {
      type: 'primary',
    });

    // Invalidate caches
    this.domainCache.delete(normalizedDomain);
    if (currentPrimary) {
      this.domainCache.delete(currentPrimary.domain);
    }

    this.logger.info('Primary domain changed', { siteId, domain });

    return ok(updated);
  }

  /**
   * Gets all domains for a site.
   */
  async getDomainsForSite(siteId: string): Promise<DomainMapping[]> {
    return this.registry.getDomainsBySite(siteId);
  }

  // ===========================================================================
  // DNS VERIFICATION
  // ===========================================================================

  /**
   * Verifies DNS configuration for a domain.
   */
  async verifyDNS(domain: string): Promise<Result<DNSVerificationResult, DomainError>> {
    const normalizedDomain = this.normalizeHostname(domain);

    const mapping = await this.registry.getDomainMapping(normalizedDomain);

    if (!mapping) {
      return err({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain ${domain} not found`,
      });
    }

    const result: DNSVerificationResult = {
      verified: false,
      checks: {
        cname: false,
        txt: false,
      },
      current: {},
      expected: {
        cname: this.config.edgeHostname,
        txt: `${this.config.verificationPrefix}=${mapping.siteId}`,
      },
      errors: [],
      verifiedAt: new Date(),
    };

    try {
      // Check CNAME record
      const cnameVerified = await this.dnsProvider.verifyRecord(
        normalizedDomain,
        'CNAME',
        this.config.edgeHostname
      );
      result.checks.cname = cnameVerified;

      if (!cnameVerified) {
        result.errors.push(
          `CNAME record should point to ${this.config.edgeHostname}`
        );
      }

      // Check TXT verification record
      const txtRecord = `_rses-verify.${normalizedDomain}`;
      const txtVerified = await this.dnsProvider.verifyRecord(
        txtRecord,
        'TXT',
        mapping.dnsVerificationToken
      );
      result.checks.txt = txtVerified;

      if (!txtVerified) {
        result.errors.push(
          `TXT record _rses-verify.${normalizedDomain} should contain ${mapping.dnsVerificationToken}`
        );
      }

      // All checks passed
      result.verified = cnameVerified && txtVerified;

      // Update mapping status
      if (result.verified && !mapping.dnsVerified) {
        await this.registry.updateDomainMapping(mapping.id, {
          dnsVerified: true,
          lastVerificationAt: new Date(),
          verificationError: undefined,
        });

        this.logger.info('DNS verified', { domain: normalizedDomain });
      } else if (!result.verified) {
        await this.registry.updateDomainMapping(mapping.id, {
          lastVerificationAt: new Date(),
          verificationError: result.errors.join('; '),
        });
      }

      return ok(result);
    } catch (error) {
      this.logger.error('DNS verification failed', {
        domain: normalizedDomain,
        error: (error as Error).message,
      });

      return err({
        code: 'VERIFICATION_ERROR',
        message: `DNS verification failed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Gets the required DNS records for a domain.
   */
  getRequiredDNSRecords(domain: string, siteId: string): DNSRecord[] {
    return [
      {
        type: 'CNAME',
        name: domain,
        value: this.config.edgeHostname,
        ttl: 300,
        description: 'Points your domain to RSES edge servers',
      },
      {
        type: 'TXT',
        name: `_rses-verify.${domain}`,
        value: `${this.config.verificationPrefix}=${siteId}`,
        ttl: 300,
        description: 'Verifies domain ownership',
      },
      {
        type: 'CAA',
        name: domain,
        value: '0 issue "letsencrypt.org"',
        ttl: 3600,
        description: 'Allows SSL certificate issuance (optional but recommended)',
      },
    ];
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Normalizes a hostname (lowercase, no trailing dot).
   */
  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, '');
  }

  /**
   * Validates domain format.
   */
  private isValidDomain(domain: string): boolean {
    // Basic domain validation
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  /**
   * Generates a verification token.
   */
  private generateVerificationToken(siteId: string): string {
    const random = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    return `${this.config.verificationPrefix}=${siteId}-${random}-${timestamp}`;
  }

  /**
   * Caches a domain resolution result.
   */
  private cacheResult(hostname: string, config: SiteConfig): void {
    this.domainCache.set(hostname, {
      value: config,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  /**
   * Checks if a cache entry is expired.
   */
  private isCacheExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Cleans up expired cache entries.
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.domainCache.entries()) {
      if (now > entry.expiresAt) {
        this.domainCache.delete(key);
      }
    }
  }

  /**
   * Invalidates cache for a specific domain.
   */
  invalidateCache(domain: string): void {
    this.domainCache.delete(this.normalizeHostname(domain));
  }

  /**
   * Clears entire cache.
   */
  clearCache(): void {
    this.domainCache.clear();
  }
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Cache entry with expiration.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Domain operation error.
 */
export interface DomainError {
  code: string;
  message: string;
  existingSiteId?: string;
}

// =============================================================================
// EDGE WORKER
// =============================================================================

/**
 * Edge worker request handler for CDN-based routing.
 * This is designed to run at the edge (Cloudflare Workers, Vercel Edge, etc.).
 */
export class EdgeDomainRouter {
  private readonly domainRouter: DomainRouter;
  private readonly originUrls: string[];

  constructor(domainRouter: DomainRouter, originUrls: string[]) {
    this.domainRouter = domainRouter;
    this.originUrls = originUrls;
  }

  /**
   * Handles an incoming request at the edge.
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Resolve site from domain
    const siteConfig = await this.domainRouter.resolve(hostname);

    if (!siteConfig) {
      return new Response(
        JSON.stringify({
          error: 'Site not found',
          code: 'SITE_NOT_FOUND',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check site status
    if (siteConfig.status === 'suspended') {
      return new Response(
        JSON.stringify({
          error: 'Site suspended',
          code: 'SITE_SUSPENDED',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check for domain redirect (alias to primary)
    if (hostname !== siteConfig.primaryDomain) {
      const domains = await this.domainRouter.getDomainsForSite(siteConfig.siteId);
      const mapping = domains.find((d) => d.domain === hostname);

      if (mapping?.type === 'alias') {
        // Redirect to primary domain
        const redirectUrl = new URL(request.url);
        redirectUrl.hostname = siteConfig.primaryDomain;
        return Response.redirect(redirectUrl.toString(), 301);
      }
    }

    // Create modified request with site context headers
    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('X-Site-ID', siteConfig.siteId);
    modifiedHeaders.set('X-Site-Shard', siteConfig.shardId);
    modifiedHeaders.set('X-Site-Tier', siteConfig.tier);
    modifiedHeaders.set('X-Site-Region', siteConfig.region);
    modifiedHeaders.set('X-Original-Host', hostname);

    // Forward to origin
    return this.forwardToOrigin(request, modifiedHeaders, siteConfig.region);
  }

  /**
   * Forwards request to the appropriate origin server.
   */
  private async forwardToOrigin(
    request: Request,
    headers: Headers,
    preferredRegion: string
  ): Promise<Response> {
    // Select origin based on region (simplified)
    const originUrl = this.selectOrigin(preferredRegion);

    const url = new URL(request.url);
    url.hostname = new URL(originUrl).hostname;
    url.port = new URL(originUrl).port;

    const modifiedRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });

    try {
      return await fetch(modifiedRequest);
    } catch (error) {
      // Try fallback origin
      const fallbackUrl = this.originUrls.find((u) => u !== originUrl) || originUrl;
      const fallbackUrlObj = new URL(fallbackUrl);
      url.hostname = fallbackUrlObj.hostname;
      url.port = fallbackUrlObj.port;

      const fallbackRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      });

      return fetch(fallbackRequest);
    }
  }

  /**
   * Selects origin URL based on preferred region.
   */
  private selectOrigin(preferredRegion: string): string {
    // Simplified origin selection
    // In production, this would use latency-based routing
    return this.originUrls[0];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_CONFIG as DEFAULT_DOMAIN_ROUTER_CONFIG };
