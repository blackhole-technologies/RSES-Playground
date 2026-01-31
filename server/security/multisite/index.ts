/**
 * @file index.ts
 * @description Multi-Site Security Module - Main Export.
 *              Provides comprehensive security for multi-tenant and multi-site architectures.
 * @phase Phase 10 - Multi-Site Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Multi-Tenancy, Azure Tenant Isolation, NIST SP 800-53
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Tenant & Site Types
  Tenant,
  TenantType,
  TenantStatus,
  SubscriptionTier,
  Site,
  SiteStatus,
  SiteType,
  IsolationLevel,

  // Configuration Types
  TenantConfig,
  TenantFeatures,
  TenantBranding,
  IntegrationConfig,
  NotificationConfig,
  WebhookConfig,
  SlackConfig,
  LocalizationConfig,
  SiteConfig,
  SiteFeatures,
  ContentConfig,
  SeoConfig,
  AnalyticsConfig,

  // Security Configuration Types
  TenantSecurityConfig,
  SiteSecurityConfig,
  AuthenticationConfig,
  AuthMethod,
  PasswordPolicy,
  MfaConfig,
  MfaMethod,
  SessionConfig,
  SsoConfig,
  AuthorizationConfig,
  DataProtectionConfig,
  DataClassification,
  ClassificationLevel,
  RetentionPolicy,
  BackupConfig,
  NetworkSecurityConfig,
  TlsConfig,
  FirewallRule,
  GeoRestriction,
  AuditConfig,
  AuditEventType,
  SiemConfig,
  ComplianceRequirements,
  SecurityHeader,
  CorsConfig,
  CspConfig,
  RateLimitingConfig,
  IpRestrictionConfig,
  SiteLimits,

  // Isolation Types
  IsolationContext,
  EncryptionContext,
  CrossSiteAccessPolicy,
  CrossSiteAccessType,
  AccessCondition,

  // Audit & Security Event Types
  SiteAuditEvent,
  AuditActor,
  AuditResource,
  RequestContext,
  SecurityIncident,
  IncidentType,
  IncidentStatus,
  IncidentAction,
  IncidentNote,

  // Key Management Types
  SiteEncryptionKey,
  KeyRotationEvent,
} from './types';

// =============================================================================
// TENANT ISOLATION SERVICE EXPORTS
// =============================================================================

export {
  TenantIsolationService,
  tenantIsolation,
  type TenantIsolationConfig,
  type IsolationValidationResult,
} from './tenant-isolation';

// =============================================================================
// CONVENIENCE FACTORIES
// =============================================================================

import { TenantIsolationService, type TenantIsolationConfig } from './tenant-isolation';

/**
 * Create a multi-site security stack.
 */
export function createMultiSiteSecurityStack(config: {
  tenantIsolation?: Partial<TenantIsolationConfig>;
} = {}): MultiSiteSecurityStack {
  return {
    tenantIsolation: new TenantIsolationService(config.tenantIsolation),
  };
}

export interface MultiSiteSecurityStack {
  tenantIsolation: TenantIsolationService;
}

// =============================================================================
// ISOLATION PRESETS
// =============================================================================

/**
 * Pre-configured isolation levels for different deployment scenarios.
 */
export const IsolationPresets = {
  /**
   * Shared infrastructure - cost-effective for small tenants.
   */
  shared: (): Partial<TenantIsolationConfig> => ({
    strictIsolation: true,
    defaultIsolationLevel: 'shared',
    perSiteEncryption: true,
    keyRotationDays: 90,
    crossSiteAccessEnabled: true,
    crossSiteApprovalRequired: false,
    auditAllAccess: false,
    realtimeChecks: true,
  }),

  /**
   * Dedicated resources - balanced isolation and cost.
   */
  dedicated: (): Partial<TenantIsolationConfig> => ({
    strictIsolation: true,
    defaultIsolationLevel: 'dedicated',
    perSiteEncryption: true,
    keyRotationDays: 30,
    crossSiteAccessEnabled: true,
    crossSiteApprovalRequired: true,
    auditAllAccess: true,
    realtimeChecks: true,
  }),

  /**
   * Isolated infrastructure - maximum security.
   */
  isolated: (): Partial<TenantIsolationConfig> => ({
    strictIsolation: true,
    defaultIsolationLevel: 'isolated',
    perSiteEncryption: true,
    keyRotationDays: 7,
    crossSiteAccessEnabled: false,
    crossSiteApprovalRequired: true,
    auditAllAccess: true,
    realtimeChecks: true,
  }),

  /**
   * Air-gapped - for highly sensitive environments.
   */
  airGapped: (): Partial<TenantIsolationConfig> => ({
    strictIsolation: true,
    defaultIsolationLevel: 'air_gapped',
    perSiteEncryption: true,
    keyRotationDays: 1,
    crossSiteAccessEnabled: false,
    crossSiteApprovalRequired: true,
    auditAllAccess: true,
    realtimeChecks: true,
  }),
};

// =============================================================================
// TENANT TYPE PRESETS
// =============================================================================

/**
 * Pre-configured security settings for different tenant types.
 */
export const TenantTypePresets = {
  /**
   * Standard tenant - default security settings.
   */
  standard: {
    passwordMinLength: 12,
    mfaRequired: false,
    mfaRequiredForAdmins: true,
    sessionTimeoutMinutes: 60,
    dataClassification: 'internal' as const,
    auditRetentionDays: 365,
  },

  /**
   * Enterprise tenant - enhanced security.
   */
  enterprise: {
    passwordMinLength: 14,
    mfaRequired: false,
    mfaRequiredForAdmins: true,
    sessionTimeoutMinutes: 30,
    dataClassification: 'confidential' as const,
    auditRetentionDays: 730,
  },

  /**
   * Government tenant - strict security.
   */
  government: {
    passwordMinLength: 16,
    mfaRequired: true,
    mfaRequiredForAdmins: true,
    sessionTimeoutMinutes: 15,
    dataClassification: 'restricted' as const,
    auditRetentionDays: 2555, // 7 years
  },

  /**
   * Healthcare tenant - HIPAA compliant.
   */
  healthcare: {
    passwordMinLength: 14,
    mfaRequired: true,
    mfaRequiredForAdmins: true,
    sessionTimeoutMinutes: 30,
    dataClassification: 'confidential' as const,
    auditRetentionDays: 2555, // 7 years
  },

  /**
   * Education tenant - balanced settings.
   */
  education: {
    passwordMinLength: 12,
    mfaRequired: false,
    mfaRequiredForAdmins: true,
    sessionTimeoutMinutes: 120,
    dataClassification: 'internal' as const,
    auditRetentionDays: 365,
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create tenant ID from name.
 */
export function createTenantSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Create site slug from name.
 */
export function createSiteSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

/**
 * Validate domain format.
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * Validate IP CIDR format.
 */
export function isValidCidr(cidr: string): boolean {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  return cidrRegex.test(cidr);
}

// =============================================================================
// VERSION INFO
// =============================================================================

export const MULTISITE_SECURITY_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  name: 'Multi-Site Security Architecture',
  codename: 'Fortress',
  releaseDate: '2026-02-01',
  features: [
    'Multi-Tenant Isolation',
    'Per-Site Encryption Keys',
    'Cross-Site Access Policies',
    'Data Segregation',
    'Site-Level Audit Logging',
    'Security Incident Management',
    'Automatic Key Rotation',
    'HSM Integration Support',
    'Compliance Configuration',
    'Rate Limiting by Site',
    'IP Restrictions',
    'Custom Security Headers',
  ],
  standards: [
    'AWS Multi-Tenancy Best Practices',
    'Azure Tenant Isolation',
    'Google Cloud Multi-tenancy',
    'NIST SP 800-53',
    'SOC 2 Type II',
    'ISO 27001',
  ],
};
