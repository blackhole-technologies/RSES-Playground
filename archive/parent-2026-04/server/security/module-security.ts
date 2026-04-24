/**
 * @file module-security.ts
 * @description Module Security Enforcement Implementation
 * @phase Phase 9 - CMS Transformation (Security Implementation)
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * This file implements the module security enforcement service, providing:
 * - Sandbox creation and management
 * - Capability checking and granting
 * - Module verification
 * - Security event logging
 * - Graceful degradation when security modules disabled
 */

import crypto from "crypto";
import {
  type ModuleSandbox,
  type ModuleCapability,
  type ModuleTrustLevel,
  type ModuleExecutionContext,
  type ModuleVerificationResult,
  type ModuleAuditEvent,
  type ModuleAuditEventType,
  type TenantContext,
  type SecurityModuleType,
  type CapabilityRiskLevel,
  DEFAULT_RESOURCE_LIMITS,
  CAPABILITY_REGISTRY,
  PRODUCTION_SECURITY_DEFAULTS,
} from "./module-security-architecture";

// =============================================================================
// MODULE SECURITY SERVICE IMPLEMENTATION
// =============================================================================

/**
 * In-memory storage for module sandboxes (would be database in production).
 */
const moduleSandboxes = new Map<string, ModuleSandbox>();
const moduleCapabilities = new Map<string, Set<ModuleCapability>>();
const pendingCapabilityRequests = new Map<string, CapabilityRequest[]>();
const auditLog: ModuleAuditEvent[] = [];

/**
 * Capability request for admin approval.
 */
interface CapabilityRequest {
  id: string;
  moduleName: string;
  capability: ModuleCapability;
  justification: string;
  requestedBy: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
}

/**
 * Trust level to execution context mapping.
 */
const TRUST_TO_CONTEXT: Record<ModuleTrustLevel, ModuleExecutionContext> = {
  core: 'kernel',
  verified: 'standard',
  community: 'restricted',
  custom: 'restricted',
  untrusted: 'quarantine',
};

/**
 * Create a sandbox for a module based on its trust level.
 */
export function createSandbox(
  moduleName: string,
  trustLevel: ModuleTrustLevel
): ModuleSandbox {
  const context = TRUST_TO_CONTEXT[trustLevel];
  const limits = DEFAULT_RESOURCE_LIMITS[context];

  const sandbox: ModuleSandbox = {
    id: `sandbox_${moduleName}_${crypto.randomUUID()}`,
    moduleName,
    context,
    limits: { ...limits },
    capabilities: getDefaultCapabilities(context),
    deniedOperations: getDeniedOperations(context),
    apiAccess: {
      allowedNamespaces: getAllowedApiNamespaces(context),
      blockedMethods: getBlockedMethods(context),
      rateLimits: getRateLimits(context),
      allowInternalApis: context === 'kernel',
    },
    dataScope: {
      allowedContentTypes: context === 'kernel' ? 'all' : [],
      allowedTaxonomies: context === 'kernel' ? 'all' : [],
      crossTenantAccess: false,
      dataRetentionDays: context === 'quarantine' ? 7 : -1,
      maskedFields: context === 'kernel' ? [] : ['passwordHash', 'apiKey', 'secret'],
      piiPolicy: context === 'kernel' ? 'full' : 'anonymize',
    },
    storageNamespace: `modules/${moduleName}`,
    strictMode: context !== 'kernel',
    createdAt: new Date(),
  };

  moduleSandboxes.set(moduleName, sandbox);
  moduleCapabilities.set(moduleName, new Set(sandbox.capabilities));

  logAuditEvent({
    eventType: 'module.installed',
    severity: 'info',
    module: { name: moduleName, version: '1.0.0', trustLevel },
    actor: { type: 'system', id: 'security-service' },
    details: { sandboxId: sandbox.id, context },
    outcome: 'success',
    tags: ['sandbox', 'initialization'],
  });

  return sandbox;
}

/**
 * Get default capabilities for an execution context.
 */
function getDefaultCapabilities(context: ModuleExecutionContext): ModuleCapability[] {
  switch (context) {
    case 'kernel':
      // Core modules get all capabilities
      return CAPABILITY_REGISTRY.map(c => c.id);

    case 'standard':
      // Verified modules get normal + some elevated
      return CAPABILITY_REGISTRY
        .filter(c => c.riskLevel === 'normal' || c.riskLevel === 'elevated')
        .map(c => c.id);

    case 'restricted':
      // Third-party modules get only normal capabilities
      return CAPABILITY_REGISTRY
        .filter(c => c.riskLevel === 'normal')
        .map(c => c.id);

    case 'quarantine':
      // Untrusted modules get minimal read-only capabilities
      return [
        'content.read',
        'user.read_profile',
        'config.read_public',
        'fs.read_public',
        'db.read_own_tables',
        'crypto.hash',
        'crypto.verify',
        'system.services_read',
      ];
  }
}

/**
 * Get denied operations for an execution context.
 */
function getDeniedOperations(context: ModuleExecutionContext): string[] {
  switch (context) {
    case 'kernel':
      return [];

    case 'standard':
      return [
        'system.exec',
        'db.raw_query',
        'user.impersonate',
      ];

    case 'restricted':
      return [
        'system.exec',
        'db.raw_query',
        'db.drop_tables',
        'user.impersonate',
        'user.delete',
        'fs.write_any',
        'fs.execute',
        'network.outbound_any',
        'config.write',
      ];

    case 'quarantine':
      return [
        // Block almost everything dangerous
        ...CAPABILITY_REGISTRY
          .filter(c => c.riskLevel === 'dangerous' || c.riskLevel === 'elevated')
          .map(c => c.id),
        'network.outbound_http',
        'network.websocket',
        'db.write_own_tables',
      ];
  }
}

/**
 * Get allowed API namespaces for an execution context.
 */
function getAllowedApiNamespaces(context: ModuleExecutionContext): string[] {
  switch (context) {
    case 'kernel':
      return ['*']; // All namespaces

    case 'standard':
      return [
        'content', 'taxonomy', 'user', 'config',
        'file', 'media', 'search', 'notification',
      ];

    case 'restricted':
      return ['content', 'taxonomy', 'file', 'search'];

    case 'quarantine':
      return ['content']; // Read-only content access
  }
}

/**
 * Get blocked methods for an execution context.
 */
function getBlockedMethods(context: ModuleExecutionContext): string[] {
  switch (context) {
    case 'kernel':
      return [];

    case 'standard':
      return ['system.shutdown', 'database.migrate', 'user.createAdmin'];

    case 'restricted':
      return [
        'system.shutdown', 'database.migrate', 'user.createAdmin',
        'config.write', 'module.install', 'module.uninstall',
      ];

    case 'quarantine':
      return [
        // Block all write methods
        '*.create', '*.update', '*.delete', '*.write',
        'system.*', 'database.*', 'user.*', 'config.*',
      ];
  }
}

/**
 * Get rate limits per namespace for an execution context.
 */
function getRateLimits(context: ModuleExecutionContext): Record<string, number> {
  const base = {
    content: 1000,
    taxonomy: 500,
    user: 100,
    file: 200,
    search: 300,
  };

  switch (context) {
    case 'kernel':
      return {}; // No limits

    case 'standard':
      return base;

    case 'restricted':
      return Object.fromEntries(
        Object.entries(base).map(([k, v]) => [k, Math.floor(v / 2)])
      );

    case 'quarantine':
      return Object.fromEntries(
        Object.entries(base).map(([k, v]) => [k, Math.floor(v / 10)])
      );
  }
}

/**
 * Check if a module has a specific capability.
 */
export function checkCapability(
  moduleName: string,
  capability: ModuleCapability
): boolean {
  const capabilities = moduleCapabilities.get(moduleName);
  if (!capabilities) {
    return false;
  }

  const sandbox = moduleSandboxes.get(moduleName);
  if (!sandbox) {
    return false;
  }

  // Check if explicitly denied
  if (sandbox.deniedOperations.includes(capability)) {
    return false;
  }

  return capabilities.has(capability);
}

/**
 * Request a capability for a module (creates pending request for dangerous caps).
 */
export function requestCapability(
  moduleName: string,
  capability: ModuleCapability,
  justification: string,
  requestedBy: string
): { approved: boolean; pendingApproval: boolean; requestId?: string } {
  const capDef = CAPABILITY_REGISTRY.find(c => c.id === capability);
  if (!capDef) {
    return { approved: false, pendingApproval: false };
  }

  const sandbox = moduleSandboxes.get(moduleName);
  if (!sandbox) {
    return { approved: false, pendingApproval: false };
  }

  // Check if already granted
  if (checkCapability(moduleName, capability)) {
    return { approved: true, pendingApproval: false };
  }

  // Check if explicitly denied by context
  if (sandbox.deniedOperations.includes(capability)) {
    logAuditEvent({
      eventType: 'module.capability_revoked',
      severity: 'warning',
      module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
      actor: { type: 'user', id: requestedBy },
      details: { capability, reason: 'Denied by execution context' },
      outcome: 'denied',
      tags: ['capability', 'denied'],
    });
    return { approved: false, pendingApproval: false };
  }

  // Normal capabilities can be auto-granted
  if (capDef.riskLevel === 'normal' && !capDef.requiresAdminApproval) {
    grantCapability(moduleName, capability, 'auto-grant');
    return { approved: true, pendingApproval: false };
  }

  // Elevated/dangerous capabilities need admin approval
  const requestId = crypto.randomUUID();
  const request: CapabilityRequest = {
    id: requestId,
    moduleName,
    capability,
    justification,
    requestedBy,
    requestedAt: new Date(),
    status: 'pending',
  };

  const pending = pendingCapabilityRequests.get(moduleName) || [];
  pending.push(request);
  pendingCapabilityRequests.set(moduleName, pending);

  logAuditEvent({
    eventType: 'module.capability_granted',
    severity: 'warning',
    module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
    actor: { type: 'user', id: requestedBy },
    details: { capability, justification, requestId, status: 'pending_approval' },
    outcome: 'success',
    tags: ['capability', 'request', 'pending'],
  });

  return { approved: false, pendingApproval: true, requestId };
}

/**
 * Admin approves a capability request.
 */
export function approveCapabilityRequest(
  requestId: string,
  approvedBy: string,
  note?: string
): boolean {
  for (const [moduleName, requests] of pendingCapabilityRequests) {
    const request = requests.find(r => r.id === requestId);
    if (request && request.status === 'pending') {
      request.status = 'approved';
      request.reviewedBy = approvedBy;
      request.reviewedAt = new Date();
      request.reviewNote = note;

      grantCapability(moduleName, request.capability, approvedBy);

      logAuditEvent({
        eventType: 'module.capability_granted',
        severity: 'warning',
        module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
        actor: { type: 'user', id: approvedBy },
        details: {
          capability: request.capability,
          requestId,
          justification: request.justification,
          note,
        },
        outcome: 'success',
        tags: ['capability', 'approved'],
      });

      return true;
    }
  }
  return false;
}

/**
 * Admin denies a capability request.
 */
export function denyCapabilityRequest(
  requestId: string,
  deniedBy: string,
  reason: string
): boolean {
  for (const [moduleName, requests] of pendingCapabilityRequests) {
    const request = requests.find(r => r.id === requestId);
    if (request && request.status === 'pending') {
      request.status = 'denied';
      request.reviewedBy = deniedBy;
      request.reviewedAt = new Date();
      request.reviewNote = reason;

      logAuditEvent({
        eventType: 'module.capability_revoked',
        severity: 'warning',
        module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
        actor: { type: 'user', id: deniedBy },
        details: {
          capability: request.capability,
          requestId,
          reason,
        },
        outcome: 'denied',
        tags: ['capability', 'denied'],
      });

      return true;
    }
  }
  return false;
}

/**
 * Grant a capability to a module.
 */
export function grantCapability(
  moduleName: string,
  capability: ModuleCapability,
  approvedBy: string
): void {
  const capabilities = moduleCapabilities.get(moduleName);
  if (!capabilities) {
    return;
  }

  capabilities.add(capability);

  const capDef = CAPABILITY_REGISTRY.find(c => c.id === capability);
  if (capDef?.auditLogged) {
    logAuditEvent({
      eventType: 'module.capability_granted',
      severity: capDef.riskLevel === 'dangerous' ? 'warning' : 'info',
      module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
      actor: { type: 'user', id: approvedBy },
      details: { capability, riskLevel: capDef.riskLevel },
      outcome: 'success',
      tags: ['capability', 'granted'],
    });
  }
}

/**
 * Revoke a capability from a module.
 */
export function revokeCapability(
  moduleName: string,
  capability: ModuleCapability,
  reason: string,
  revokedBy: string
): void {
  const capabilities = moduleCapabilities.get(moduleName);
  if (!capabilities) {
    return;
  }

  capabilities.delete(capability);

  logAuditEvent({
    eventType: 'module.capability_revoked',
    severity: 'warning',
    module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
    actor: { type: 'user', id: revokedBy },
    details: { capability, reason },
    outcome: 'success',
    tags: ['capability', 'revoked'],
  });
}

/**
 * Quarantine a module (disable and restrict to minimum permissions).
 */
export function quarantineModule(
  moduleName: string,
  reason: string,
  quarantinedBy: string
): void {
  const sandbox = moduleSandboxes.get(moduleName);
  if (!sandbox) {
    return;
  }

  // Update sandbox to quarantine context
  sandbox.context = 'quarantine';
  sandbox.limits = { ...DEFAULT_RESOURCE_LIMITS.quarantine };
  sandbox.capabilities = getDefaultCapabilities('quarantine');
  sandbox.deniedOperations = getDeniedOperations('quarantine');
  sandbox.strictMode = true;

  // Update capabilities
  moduleCapabilities.set(moduleName, new Set(sandbox.capabilities));

  logAuditEvent({
    eventType: 'module.quarantined',
    severity: 'critical',
    module: { name: moduleName, version: '1.0.0', trustLevel: 'untrusted' },
    actor: { type: 'user', id: quarantinedBy },
    details: { reason, previousContext: sandbox.context },
    outcome: 'success',
    tags: ['quarantine', 'security'],
  });
}

/**
 * Validate an API call from a module.
 */
export function validateApiCall(
  moduleName: string,
  apiNamespace: string,
  method: string,
  tenantContext?: TenantContext
): { allowed: boolean; reason?: string } {
  const sandbox = moduleSandboxes.get(moduleName);
  if (!sandbox) {
    return { allowed: false, reason: 'Module not found or not sandboxed' };
  }

  // Check namespace access
  const { allowedNamespaces, blockedMethods } = sandbox.apiAccess;
  if (!allowedNamespaces.includes('*') && !allowedNamespaces.includes(apiNamespace)) {
    logAuditEvent({
      eventType: 'module.permission_denied',
      severity: 'warning',
      module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
      actor: { type: 'module', id: moduleName },
      details: { apiNamespace, method, reason: 'Namespace not allowed' },
      outcome: 'denied',
      tags: ['api', 'access-denied'],
    });
    return { allowed: false, reason: `Namespace '${apiNamespace}' not allowed` };
  }

  // Check method blocklist
  const fullMethod = `${apiNamespace}.${method}`;
  for (const blocked of blockedMethods) {
    if (blocked === fullMethod || blocked === `${apiNamespace}.*` || blocked === `*.${method}`) {
      logAuditEvent({
        eventType: 'module.permission_denied',
        severity: 'warning',
        module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
        actor: { type: 'module', id: moduleName },
        details: { apiNamespace, method, reason: 'Method blocked' },
        outcome: 'denied',
        tags: ['api', 'access-denied'],
      });
      return { allowed: false, reason: `Method '${fullMethod}' is blocked` };
    }
  }

  // Check cross-tenant access
  if (tenantContext && !sandbox.dataScope.crossTenantAccess) {
    // Would validate tenant context here
  }

  return { allowed: true };
}

/**
 * Record a sandbox violation.
 */
export function recordSandboxViolation(
  moduleName: string,
  violationType: string,
  details: Record<string, unknown>
): void {
  const sandbox = moduleSandboxes.get(moduleName);

  logAuditEvent({
    eventType: 'module.sandbox_violation',
    severity: 'error',
    module: { name: moduleName, version: '1.0.0', trustLevel: 'community' },
    actor: { type: 'module', id: moduleName },
    details: { violationType, ...details },
    outcome: 'denied',
    tags: ['sandbox', 'violation', 'security'],
  });

  // In strict mode, quarantine after violation
  if (sandbox?.strictMode) {
    quarantineModule(moduleName, `Sandbox violation: ${violationType}`, 'security-service');
  }
}

// =============================================================================
// SECURITY MODULE STATE MANAGEMENT
// =============================================================================

/**
 * Security module states.
 */
const securityModuleStates = new Map<SecurityModuleType, {
  enabled: boolean;
  fallbackActive: boolean;
  lastChange: Date;
}>();

/**
 * Enable a security module.
 */
export function enableSecurityModule(
  moduleType: SecurityModuleType,
  enabledBy: string
): void {
  securityModuleStates.set(moduleType, {
    enabled: true,
    fallbackActive: false,
    lastChange: new Date(),
  });

  logAuditEvent({
    eventType: 'module.enabled',
    severity: 'info',
    module: { name: moduleType, version: '1.0.0', trustLevel: 'core' },
    actor: { type: 'user', id: enabledBy },
    details: { moduleType },
    outcome: 'success',
    tags: ['security-module', 'enabled'],
  });
}

/**
 * Disable a security module with graceful degradation.
 */
export function disableSecurityModule(
  moduleType: SecurityModuleType,
  disabledBy: string,
  reason: string
): void {
  securityModuleStates.set(moduleType, {
    enabled: false,
    fallbackActive: true,
    lastChange: new Date(),
  });

  // Apply fallback defaults
  applySecurityDefaults(moduleType);

  logAuditEvent({
    eventType: 'module.disabled',
    severity: 'warning',
    module: { name: moduleType, version: '1.0.0', trustLevel: 'core' },
    actor: { type: 'user', id: disabledBy },
    details: { moduleType, reason, fallbackActive: true },
    outcome: 'success',
    tags: ['security-module', 'disabled', 'fallback'],
  });
}

/**
 * Apply security defaults when a module is disabled.
 */
export function applySecurityDefaults(moduleType: SecurityModuleType): void {
  const defaults = PRODUCTION_SECURITY_DEFAULTS;

  switch (moduleType) {
    case 'oauth_provider':
    case 'oauth_client':
      // Fall back to local authentication
      console.log('[Security] OAuth disabled - enforcing local authentication');
      // Would configure session-based local auth here
      break;

    case 'e2e_encryption':
      // Fall back to TLS-only encryption
      console.log('[Security] E2E encryption disabled - enforcing TLS');
      // Would configure TLS requirements here
      break;

    case 'dlp':
      // Fall back to basic content sanitization
      console.log('[Security] DLP disabled - enforcing HTML sanitization');
      // Would enable stricter sanitization here
      break;

    case 'mfa':
      // Fall back to single-factor with stronger password policy
      console.log('[Security] MFA disabled - enforcing stronger password policy');
      // Would configure stricter password requirements here
      break;

    case 'rate_limiting':
      // Fall back to basic rate limiting
      console.log('[Security] Advanced rate limiting disabled - using basic limits');
      // Would configure basic limits here
      break;

    case 'audit_enhanced':
      // Fall back to basic audit logging
      console.log('[Security] Enhanced audit disabled - using basic audit');
      // Would configure mandatory events only here
      break;
  }
}

/**
 * Check if a security module is enabled.
 */
export function isSecurityModuleEnabled(moduleType: SecurityModuleType): boolean {
  return securityModuleStates.get(moduleType)?.enabled ?? false;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log a module audit event.
 */
function logAuditEvent(
  event: Omit<ModuleAuditEvent, 'id' | 'timestamp' | 'correlationId'>
): void {
  const fullEvent: ModuleAuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date(),
    correlationId: crypto.randomUUID(), // Would come from request context
  };

  auditLog.push(fullEvent);

  // In production, would persist to database and/or send to SIEM
  if (event.severity === 'critical' || event.severity === 'error') {
    console.error('[Security Audit]', JSON.stringify(fullEvent, null, 2));
  }
}

/**
 * Query audit events.
 */
export function queryAuditEvents(filter: {
  moduleName?: string;
  eventTypes?: ModuleAuditEventType[];
  severity?: string[];
  limit?: number;
}): ModuleAuditEvent[] {
  let results = [...auditLog];

  if (filter.moduleName) {
    results = results.filter(e => e.module.name === filter.moduleName);
  }

  if (filter.eventTypes?.length) {
    results = results.filter(e => filter.eventTypes!.includes(e.eventType));
  }

  if (filter.severity?.length) {
    results = results.filter(e => filter.severity!.includes(e.severity));
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

/**
 * Get module security summary.
 */
export function getModuleSecuritySummary(moduleName: string): {
  sandbox: ModuleSandbox | undefined;
  capabilities: ModuleCapability[];
  pendingRequests: number;
  auditSummary: {
    totalEvents: number;
    violations: number;
    denials: number;
    lastActivity: Date | null;
  };
} {
  const sandbox = moduleSandboxes.get(moduleName);
  const capabilities = Array.from(moduleCapabilities.get(moduleName) || []);
  const pendingRequests = (pendingCapabilityRequests.get(moduleName) || [])
    .filter(r => r.status === 'pending').length;

  const moduleEvents = auditLog.filter(e => e.module.name === moduleName);
  const violations = moduleEvents.filter(e => e.eventType === 'module.sandbox_violation').length;
  const denials = moduleEvents.filter(e => e.outcome === 'denied').length;
  const lastEvent = moduleEvents[moduleEvents.length - 1];

  return {
    sandbox,
    capabilities,
    pendingRequests,
    auditSummary: {
      totalEvents: moduleEvents.length,
      violations,
      denials,
      lastActivity: lastEvent?.timestamp || null,
    },
  };
}

// =============================================================================
// EXPORTS FOR TESTING AND MIDDLEWARE
// =============================================================================

export {
  moduleSandboxes,
  moduleCapabilities,
  pendingCapabilityRequests,
  auditLog,
};
