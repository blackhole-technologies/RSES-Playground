/**
 * @file site-context.ts
 * @description Site context management using AsyncLocalStorage for request-scoped isolation
 * @module multisite/site
 * @author Project Architect Agent
 * @created 2026-02-01
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';
import type {
  SiteContext,
  SiteConfig,
  SiteFeatures,
  ScopedDatabasePool,
  ScopedCache,
  AuthenticatedUser,
  RequestMetadata,
  Result,
  ok,
  err,
} from '../types';

// =============================================================================
// ASYNC LOCAL STORAGE
// =============================================================================

/**
 * AsyncLocalStorage instance for site context.
 * Provides request-scoped site isolation without passing context through every function.
 */
const siteContextStorage = new AsyncLocalStorage<SiteContext>();

/**
 * Gets the current site context.
 * @throws Error if called outside of a request context
 */
export function getSiteContext(): SiteContext {
  const context = siteContextStorage.getStore();
  if (!context) {
    throw new SiteContextError(
      'Site context not available. Ensure you are within a request context.',
      'CONTEXT_NOT_FOUND'
    );
  }
  return context;
}

/**
 * Gets the current site context or undefined if not in request context.
 */
export function tryGetSiteContext(): SiteContext | undefined {
  return siteContextStorage.getStore();
}

/**
 * Runs a function with a specific site context.
 * Useful for background jobs or testing.
 */
export function runWithSiteContext<T>(
  context: SiteContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return siteContextStorage.run(context, fn);
}

/**
 * Gets only the site ID from current context (convenience method).
 */
export function getCurrentSiteId(): string {
  return getSiteContext().siteId;
}

/**
 * Gets only the site config from current context (convenience method).
 */
export function getCurrentSiteConfig(): SiteConfig {
  return getSiteContext().config;
}

/**
 * Checks if a feature is enabled for the current site.
 */
export function isFeatureEnabled(feature: keyof SiteFeatures): boolean {
  const context = tryGetSiteContext();
  if (!context) {
    return false;
  }
  return context.features[feature] as boolean;
}

// =============================================================================
// SITE CONTEXT ERROR
// =============================================================================

/**
 * Error thrown when site context operations fail.
 */
export class SiteContextError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SiteContextError';
    this.code = code;
  }
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Dependencies for site context middleware.
 */
export interface SiteContextMiddlewareDeps {
  /** Network database for loading site configs */
  networkDb: NetworkDatabase;

  /** Shard router for database connections */
  shardRouter: ShardRouter;

  /** Feature service for resolving feature flags */
  featureService: FeatureService;

  /** Cache service for site-scoped caching */
  cacheService: CacheService;

  /** Logger instance */
  logger: Logger;
}

/**
 * Network database interface (simplified).
 */
export interface NetworkDatabase {
  getSiteConfig(siteId: string): Promise<SiteConfig | null>;
  getSiteByDomain(domain: string): Promise<SiteConfig | null>;
}

/**
 * Shard router interface (simplified).
 */
export interface ShardRouter {
  getPoolForSite(siteId: string, schemaName: string): Promise<ScopedDatabasePool>;
}

/**
 * Feature service interface (simplified).
 */
export interface FeatureService {
  resolveFeatures(siteId: string, tier: string): Promise<SiteFeatures>;
}

/**
 * Cache service interface (simplified).
 */
export interface CacheService {
  createScopedCache(siteId: string): ScopedCache;
}

/**
 * Logger interface (simplified).
 */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Creates the site context middleware.
 * This middleware extracts site ID from headers or domain, loads site config,
 * and makes it available throughout the request lifecycle.
 */
export function createSiteContextMiddleware(deps: SiteContextMiddlewareDeps) {
  const { networkDb, shardRouter, featureService, cacheService, logger } = deps;

  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
    const startTime = Date.now();

    try {
      // Extract site ID from header or resolve from domain
      const siteId = await resolveSiteId(req, networkDb);

      if (!siteId) {
        logger.warn('Site ID not found', {
          host: req.hostname,
          path: req.path,
          requestId,
        });
        return res.status(404).json({
          error: 'Site not found',
          code: 'SITE_NOT_FOUND',
        });
      }

      // Load site configuration
      const config = await networkDb.getSiteConfig(siteId);

      if (!config) {
        logger.warn('Site config not found', { siteId, requestId });
        return res.status(404).json({
          error: 'Site configuration not found',
          code: 'SITE_CONFIG_NOT_FOUND',
        });
      }

      // Check site status
      if (config.status === 'suspended') {
        logger.info('Request to suspended site', { siteId, requestId });
        return res.status(403).json({
          error: 'Site is suspended',
          code: 'SITE_SUSPENDED',
        });
      }

      if (config.status === 'maintenance') {
        return res.status(503).json({
          error: 'Site is under maintenance',
          code: 'SITE_MAINTENANCE',
          retryAfter: 300, // 5 minutes
        });
      }

      if (config.status !== 'active') {
        return res.status(404).json({
          error: 'Site not available',
          code: 'SITE_NOT_AVAILABLE',
        });
      }

      // Get database pool for site's shard
      const db = await shardRouter.getPoolForSite(siteId, config.schemaName);

      // Resolve feature flags
      const features = await featureService.resolveFeatures(siteId, config.tier);

      // Create scoped cache
      const cache = cacheService.createScopedCache(siteId);

      // Extract authenticated user if present
      const user = extractAuthenticatedUser(req, siteId);

      // Build request metadata
      const requestMetadata: RequestMetadata = {
        id: requestId,
        startTime,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        path: req.path,
        method: req.method,
      };

      // Create site context
      const context: SiteContext = {
        siteId,
        config,
        db,
        cache,
        features,
        user,
        request: requestMetadata,
      };

      // Attach to request object for legacy access
      (req as any).siteContext = context;

      // Run remaining middleware and route handlers with site context
      siteContextStorage.run(context, () => {
        // Add response header for debugging
        res.setHeader('X-Site-ID', siteId);
        res.setHeader('X-Request-ID', requestId);

        // Log request start
        logger.debug('Request started with site context', {
          siteId,
          requestId,
          path: req.path,
          method: req.method,
        });

        // Continue to next middleware
        next();
      });
    } catch (error) {
      logger.error('Failed to establish site context', {
        error: (error as Error).message,
        requestId,
        host: req.hostname,
      });

      return res.status(500).json({
        error: 'Failed to establish site context',
        code: 'SITE_CONTEXT_ERROR',
      });
    }
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolves site ID from request headers or domain.
 */
async function resolveSiteId(
  req: Request,
  networkDb: NetworkDatabase
): Promise<string | null> {
  // First, check for explicit X-Site-ID header (set by edge router)
  const headerSiteId = req.headers['x-site-id'] as string;
  if (headerSiteId) {
    return headerSiteId;
  }

  // Otherwise, resolve from hostname
  const hostname = req.hostname;

  // Check for preview/branch domains
  // Format: preview-{siteId}.rses-network.com or {branch}--{siteId}.rses-network.com
  const previewMatch = hostname.match(/^preview-([a-zA-Z0-9-]+)\./);
  if (previewMatch) {
    return previewMatch[1];
  }

  const branchMatch = hostname.match(/^[a-zA-Z0-9-]+--([a-zA-Z0-9-]+)\./);
  if (branchMatch) {
    return branchMatch[1];
  }

  // Query domain registry for custom domains
  const siteConfig = await networkDb.getSiteByDomain(hostname);
  if (siteConfig) {
    return siteConfig.siteId;
  }

  return null;
}

/**
 * Extracts authenticated user from request.
 */
function extractAuthenticatedUser(
  req: Request,
  siteId: string
): AuthenticatedUser | undefined {
  // Check for passport user
  const passportUser = (req as any).user;
  if (!passportUser) {
    return undefined;
  }

  // Find role for current site
  const siteRole = passportUser.siteRoles?.find(
    (r: any) => r.siteId === siteId
  );

  if (!siteRole) {
    // User authenticated but no access to this site
    return undefined;
  }

  return {
    id: passportUser.id,
    identityId: passportUser.identityId || passportUser.id,
    email: passportUser.email,
    displayName: passportUser.displayName || passportUser.username,
    role: siteRole.role,
    permissions: siteRole.permissions || [],
  };
}

/**
 * Gets client IP address, handling proxies.
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0];
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Generates a unique request ID.
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${random}`;
}

// =============================================================================
// SITE-SCOPED REPOSITORY BASE
// =============================================================================

/**
 * Base class for site-scoped repositories.
 * Automatically applies site_id filtering to all queries.
 */
export abstract class SiteScopedRepository<T extends { siteId?: string }> {
  protected readonly tableName: string;
  protected readonly siteIdColumn: string;

  constructor(tableName: string, siteIdColumn: string = 'site_id') {
    this.tableName = tableName;
    this.siteIdColumn = siteIdColumn;
  }

  /**
   * Gets the database pool from current site context.
   */
  protected getDb(): ScopedDatabasePool {
    return getSiteContext().db;
  }

  /**
   * Gets the current site ID.
   */
  protected getSiteId(): string {
    return getSiteContext().siteId;
  }

  /**
   * Finds all records for current site.
   */
  async findAll(): Promise<T[]> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    return db.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${this.siteIdColumn} = $1`,
      [siteId]
    );
  }

  /**
   * Finds a single record by ID within current site.
   */
  async findById(id: string | number): Promise<T | null> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    const results = await db.query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND ${this.siteIdColumn} = $2 LIMIT 1`,
      [id, siteId]
    );

    return results[0] || null;
  }

  /**
   * Finds records matching criteria within current site.
   */
  async findWhere(criteria: Partial<T>): Promise<T[]> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    const keys = Object.keys(criteria);
    const values = Object.values(criteria);

    const whereClauses = [
      `${this.siteIdColumn} = $1`,
      ...keys.map((key, i) => `${key} = $${i + 2}`),
    ];

    return db.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${whereClauses.join(' AND ')}`,
      [siteId, ...values]
    );
  }

  /**
   * Creates a new record for current site.
   */
  async create(data: Omit<T, 'siteId' | 'id'>): Promise<T> {
    const db = this.getDb();
    return db.insert<T>(this.tableName, data as any);
  }

  /**
   * Updates a record within current site.
   */
  async update(id: string | number, data: Partial<Omit<T, 'siteId' | 'id'>>): Promise<T | null> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    const keys = Object.keys(data);
    const values = Object.values(data);

    const setClauses = keys.map((key, i) => `${key} = $${i + 3}`).join(', ');

    const results = await db.query<T>(
      `UPDATE ${this.tableName} SET ${setClauses} WHERE id = $1 AND ${this.siteIdColumn} = $2 RETURNING *`,
      [id, siteId, ...values]
    );

    return results[0] || null;
  }

  /**
   * Deletes a record within current site.
   */
  async delete(id: string | number): Promise<boolean> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    await db.delete(this.tableName, { id, [this.siteIdColumn]: siteId });
    return true;
  }

  /**
   * Counts records for current site.
   */
  async count(criteria?: Partial<T>): Promise<number> {
    const db = this.getDb();
    const siteId = this.getSiteId();

    if (!criteria) {
      const results = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${this.siteIdColumn} = $1`,
        [siteId]
      );
      return parseInt(results[0]?.count || '0', 10);
    }

    const keys = Object.keys(criteria);
    const values = Object.values(criteria);

    const whereClauses = [
      `${this.siteIdColumn} = $1`,
      ...keys.map((key, i) => `${key} = $${i + 2}`),
    ];

    const results = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${whereClauses.join(' AND ')}`,
      [siteId, ...values]
    );

    return parseInt(results[0]?.count || '0', 10);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  siteContextStorage,
  generateRequestId,
};
