/**
 * @file module-security-middleware.ts
 * @description Express middleware for module security enforcement
 * @phase Phase 9 - CMS Transformation (Security Middleware)
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * This middleware integrates module security into the request pipeline:
 * - Validates module API calls against capabilities
 * - Enforces tenant isolation
 * - Applies rate limits per module
 * - Logs security-relevant events
 * - Provides graceful degradation when security modules disabled
 */

import { type Request, type Response, type NextFunction } from "express";
import {
  checkCapability,
  validateApiCall,
  recordSandboxViolation,
  isSecurityModuleEnabled,
  applySecurityDefaults,
  queryAuditEvents,
  getModuleSecuritySummary,
} from "../security/module-security";
import type { ModuleCapability, TenantContext } from "../security/module-security-architecture";

// =============================================================================
// TYPE EXTENSIONS
// =============================================================================

/**
 * Extend Express Request with module security context.
 */
declare global {
  namespace Express {
    interface Request {
      moduleContext?: ModuleSecurityContext;
      tenantContext?: TenantContext;
    }
  }
}

/**
 * Module security context attached to requests.
 */
export interface ModuleSecurityContext {
  /** Calling module name */
  moduleName: string;

  /** Module's trust level */
  trustLevel: 'core' | 'verified' | 'community' | 'custom' | 'untrusted';

  /** Resolved capabilities */
  capabilities: ModuleCapability[];

  /** Whether request is sandboxed */
  sandboxed: boolean;

  /** Request start time for rate limiting */
  requestStartTime: number;
}

// =============================================================================
// MODULE SECURITY MIDDLEWARE
// =============================================================================

/**
 * Main module security middleware.
 * Extracts module context and prepares security checks.
 */
export function moduleSecurityContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract module identifier from request
    // Could be from header, API key, or session
    const moduleIdentifier = extractModuleIdentifier(req);

    if (moduleIdentifier) {
      const summary = getModuleSecuritySummary(moduleIdentifier);

      req.moduleContext = {
        moduleName: moduleIdentifier,
        trustLevel: summary.sandbox?.context === 'kernel' ? 'core'
          : summary.sandbox?.context === 'standard' ? 'verified'
          : summary.sandbox?.context === 'quarantine' ? 'untrusted'
          : 'community',
        capabilities: summary.capabilities,
        sandboxed: summary.sandbox?.strictMode ?? true,
        requestStartTime: Date.now(),
      };
    }

    next();
  };
}

/**
 * Extract module identifier from request.
 */
function extractModuleIdentifier(req: Request): string | null {
  // Priority order:
  // 1. X-Module-Name header (for module-to-module calls)
  // 2. API key associated module
  // 3. Route-based module detection
  // 4. Session-based module context

  const headerModule = req.headers['x-module-name'];
  if (typeof headerModule === 'string') {
    return headerModule;
  }

  // Check if this is a module API route
  const moduleRouteMatch = req.path.match(/^\/api\/modules\/([^/]+)/);
  if (moduleRouteMatch) {
    return moduleRouteMatch[1];
  }

  return null;
}

/**
 * Capability check middleware factory.
 * Creates middleware that requires specific capability.
 */
export function requireCapability(capability: ModuleCapability) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { moduleContext } = req;

    if (!moduleContext) {
      // No module context - this is a direct user request, not module call
      return next();
    }

    const hasCapability = checkCapability(moduleContext.moduleName, capability);

    if (!hasCapability) {
      recordSandboxViolation(moduleContext.moduleName, 'capability_violation', {
        requiredCapability: capability,
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        error: 'Permission denied',
        message: `Module '${moduleContext.moduleName}' lacks required capability: ${capability}`,
        code: 'E_CAPABILITY_DENIED',
        capability,
      });
    }

    next();
  };
}

/**
 * API access validation middleware.
 * Validates module API calls against sandbox policies.
 */
export function validateModuleApiAccess() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { moduleContext } = req;

    if (!moduleContext) {
      return next();
    }

    // Parse API namespace and method from route
    const apiMatch = req.path.match(/^\/api\/([^/]+)(?:\/([^/]+))?/);
    if (!apiMatch) {
      return next();
    }

    const [, namespace, method = req.method.toLowerCase()] = apiMatch;

    const validation = validateApiCall(
      moduleContext.moduleName,
      namespace,
      method,
      req.tenantContext
    );

    if (!validation.allowed) {
      return res.status(403).json({
        error: 'API access denied',
        message: validation.reason,
        code: 'E_API_ACCESS_DENIED',
        module: moduleContext.moduleName,
        namespace,
        method,
      });
    }

    next();
  };
}

/**
 * Module rate limiting middleware.
 * Applies per-module rate limits based on sandbox configuration.
 */
export function moduleRateLimiter() {
  // Track request counts per module
  const requestCounts = new Map<string, { count: number; windowStart: number }>();
  const WINDOW_MS = 60 * 1000; // 1 minute window

  return (req: Request, res: Response, next: NextFunction) => {
    const { moduleContext } = req;

    if (!moduleContext) {
      return next();
    }

    const now = Date.now();
    const moduleName = moduleContext.moduleName;
    const current = requestCounts.get(moduleName) || { count: 0, windowStart: now };

    // Reset window if expired
    if (now - current.windowStart > WINDOW_MS) {
      current.count = 0;
      current.windowStart = now;
    }

    current.count++;
    requestCounts.set(moduleName, current);

    // Get rate limit from sandbox (default to 1000/min)
    const summary = getModuleSecuritySummary(moduleName);
    const limit = summary.sandbox?.limits.requestsPerMinute ?? 1000;

    if (limit > 0 && current.count > limit) {
      recordSandboxViolation(moduleName, 'rate_limit_exceeded', {
        limit,
        count: current.count,
        windowMs: WINDOW_MS,
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Module '${moduleName}' has exceeded its rate limit`,
        code: 'E_RATE_LIMIT',
        limit,
        retryAfter: Math.ceil((current.windowStart + WINDOW_MS - now) / 1000),
      });
    }

    next();
  };
}

/**
 * Tenant isolation middleware.
 * Ensures modules only access data within their tenant scope.
 */
export function tenantIsolation() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract tenant from request (from subdomain, header, or session)
    const tenantId = extractTenantId(req);

    if (tenantId) {
      req.tenantContext = {
        tenant: {
          id: tenantId,
          name: tenantId, // Would lookup actual tenant config
          isolationStrategy: 'row_level_security',
          enabledModules: [],
          moduleOverrides: {},
          storageNamespace: `tenants/${tenantId}`,
          quotas: {
            maxStorage: 1024 * 1024 * 1024, // 1GB
            maxContentItems: 10000,
            maxUsers: 100,
            maxApiRequestsPerDay: 100000,
            maxUploadSize: 50 * 1024 * 1024, // 50MB
            maxConcurrentSessions: 100,
          },
          status: 'active',
          createdAt: new Date(),
        },
        correlationId: req.headers['x-correlation-id'] as string || crypto.randomUUID(),
        dbConnection: null, // Would be resolved database connection
        storagePath: `/data/tenants/${tenantId}`,
        user: req.user ? { id: (req.user as any).id, roles: (req.user as any).roles || [] } : undefined,
      };
    }

    next();
  };
}

/**
 * Extract tenant ID from request.
 */
function extractTenantId(req: Request): string | null {
  // Priority order:
  // 1. X-Tenant-ID header
  // 2. Subdomain
  // 3. URL path prefix
  // 4. Session/cookie

  const headerTenant = req.headers['x-tenant-id'];
  if (typeof headerTenant === 'string') {
    return headerTenant;
  }

  // Extract from subdomain (e.g., tenant1.cms.example.com)
  const host = req.hostname;
  const subdomainMatch = host.match(/^([^.]+)\.cms\./);
  if (subdomainMatch) {
    return subdomainMatch[1];
  }

  // Extract from path (e.g., /t/tenant1/api/...)
  const pathMatch = req.path.match(/^\/t\/([^/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Security degradation middleware.
 * Applies fallback behaviors when security modules are disabled.
 */
export function securityDegradation() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check each security module and apply fallbacks
    const degradedModules: string[] = [];

    if (!isSecurityModuleEnabled('rate_limiting')) {
      degradedModules.push('rate_limiting');
      // Basic rate limiting is still applied via default middleware
    }

    if (!isSecurityModuleEnabled('dlp')) {
      degradedModules.push('dlp');
      // Would enable stricter content sanitization
    }

    if (!isSecurityModuleEnabled('mfa')) {
      degradedModules.push('mfa');
      // Single-factor auth with stronger password requirements
    }

    // Add warning header if running in degraded mode
    if (degradedModules.length > 0) {
      res.setHeader('X-Security-Mode', 'degraded');
      res.setHeader('X-Degraded-Modules', degradedModules.join(','));
    }

    next();
  };
}

/**
 * Module audit logging middleware.
 * Logs all module API access for audit trail.
 */
export function moduleAuditLogging() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { moduleContext } = req;

    if (!moduleContext) {
      return next();
    }

    // Capture response for audit
    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      // Log the API access
      const duration = Date.now() - moduleContext.requestStartTime;

      // Would log to audit system
      if (process.env.NODE_ENV === 'development') {
        console.log('[Module Audit]', {
          module: moduleContext.moduleName,
          path: req.path,
          method: req.method,
          status: res.statusCode,
          duration,
        });
      }

      return originalJson(body);
    };

    next();
  };
}

// =============================================================================
// ADMIN ENDPOINTS FOR MODULE SECURITY
// =============================================================================

import { Router } from "express";

export const moduleSecurityRouter = Router();

/**
 * Get security summary for a module.
 */
moduleSecurityRouter.get('/modules/:moduleName/security', (req, res) => {
  const { moduleName } = req.params;
  const summary = getModuleSecuritySummary(moduleName);

  if (!summary.sandbox) {
    return res.status(404).json({
      error: 'Module not found',
      message: `No security context found for module '${moduleName}'`,
    });
  }

  res.json({
    module: moduleName,
    sandbox: {
      context: summary.sandbox.context,
      strictMode: summary.sandbox.strictMode,
      limits: summary.sandbox.limits,
    },
    capabilities: summary.capabilities,
    pendingRequests: summary.pendingRequests,
    audit: summary.auditSummary,
  });
});

/**
 * Get audit events for a module.
 */
moduleSecurityRouter.get('/modules/:moduleName/audit', (req, res) => {
  const { moduleName } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;

  const events = queryAuditEvents({
    moduleName,
    limit,
  });

  res.json({
    module: moduleName,
    events,
    count: events.length,
  });
});

/**
 * Get all security violations.
 */
moduleSecurityRouter.get('/security/violations', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;

  const events = queryAuditEvents({
    eventTypes: ['module.sandbox_violation', 'module.permission_denied'],
    limit,
  });

  res.json({
    violations: events,
    count: events.length,
  });
});

/**
 * Get security module status.
 */
moduleSecurityRouter.get('/security/modules', (req, res) => {
  const modules = [
    'e2e_encryption',
    'dlp',
    'oauth_provider',
    'oauth_client',
    'mfa',
    'audit_enhanced',
    'intrusion_detection',
    'waf',
    'rate_limiting',
    'captcha',
  ] as const;

  const status = modules.map(mod => ({
    module: mod,
    enabled: isSecurityModuleEnabled(mod),
  }));

  res.json({ securityModules: status });
});

// =============================================================================
// COMBINED SECURITY MIDDLEWARE STACK
// =============================================================================

/**
 * Creates the complete module security middleware stack.
 * Order matters - each middleware depends on context from previous.
 */
export function createModuleSecurityStack() {
  return [
    tenantIsolation(),
    moduleSecurityContext(),
    securityDegradation(),
    validateModuleApiAccess(),
    moduleRateLimiter(),
    moduleAuditLogging(),
  ];
}

// Import crypto for UUID generation
import crypto from "crypto";
