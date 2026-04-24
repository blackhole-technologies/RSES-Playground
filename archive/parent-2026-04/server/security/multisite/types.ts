/**
 * @file types.ts
 * @description Type definitions for Multi-Site Security System.
 *              Implements site isolation, tenant data segregation, per-site encryption,
 *              cross-site attack prevention, and site-level audit logging.
 * @phase Phase 10 - Multi-Site Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Multi-Tenancy Best Practices, Azure Tenant Isolation, NIST SP 800-53
 */

// =============================================================================
// TENANT & SITE TYPES
// =============================================================================

/**
 * Tenant (organization) definition.
 */
export interface Tenant {
  /** Tenant ID */
  tenantId: string;
  /** Tenant name */
  name: string;
  /** Tenant type */
  type: TenantType;
  /** Status */
  status: TenantStatus;
  /** Subscription tier */
  tier: SubscriptionTier;
  /** Primary domain */
  primaryDomain: string;
  /** Additional domains */
  domains: string[];
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
  /** Configuration */
  config: TenantConfig;
  /** Security settings */
  security: TenantSecurityConfig;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export type TenantType = 'standard' | 'enterprise' | 'government' | 'healthcare' | 'education';

export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deactivated' | 'locked';

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'unlimited';

/**
 * Site within a tenant (multi-site architecture).
 */
export interface Site {
  /** Site ID */
  siteId: string;
  /** Parent tenant ID */
  tenantId: string;
  /** Site name */
  name: string;
  /** Site slug (URL-friendly) */
  slug: string;
  /** Site URL */
  url: string;
  /** Custom domain (if any) */
  customDomain?: string;
  /** Status */
  status: SiteStatus;
  /** Site type */
  type: SiteType;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
  /** Configuration */
  config: SiteConfig;
  /** Security settings (inherits from tenant with overrides) */
  security: SiteSecurityConfig;
  /** Resource limits */
  limits: SiteLimits;
  /** Isolation level */
  isolationLevel: IsolationLevel;
}

export type SiteStatus = 'active' | 'maintenance' | 'suspended' | 'archived';

export type SiteType = 'production' | 'staging' | 'development' | 'sandbox' | 'demo';

export type IsolationLevel = 'shared' | 'dedicated' | 'isolated' | 'air_gapped';

// =============================================================================
// TENANT CONFIGURATION
// =============================================================================

/**
 * Tenant configuration.
 */
export interface TenantConfig {
  /** Features enabled */
  features: TenantFeatures;
  /** Branding */
  branding: TenantBranding;
  /** Integrations */
  integrations: IntegrationConfig[];
  /** Notification settings */
  notifications: NotificationConfig;
  /** Localization */
  localization: LocalizationConfig;
}

export interface TenantFeatures {
  /** Multi-site enabled */
  multiSite: boolean;
  /** Max sites allowed */
  maxSites: number;
  /** SSO enabled */
  ssoEnabled: boolean;
  /** Custom domains allowed */
  customDomains: boolean;
  /** API access */
  apiAccess: boolean;
  /** Advanced security features */
  advancedSecurity: boolean;
  /** Compliance features */
  compliance: boolean;
  /** Custom branding */
  customBranding: boolean;
}

export interface TenantBranding {
  /** Logo URL */
  logo?: string;
  /** Favicon */
  favicon?: string;
  /** Primary color */
  primaryColor?: string;
  /** Secondary color */
  secondaryColor?: string;
  /** Custom CSS */
  customCss?: string;
}

export interface IntegrationConfig {
  /** Integration ID */
  integrationId: string;
  /** Integration type */
  type: string;
  /** Enabled */
  enabled: boolean;
  /** Configuration */
  config: Record<string, unknown>;
}

export interface NotificationConfig {
  /** Email notifications */
  email: boolean;
  /** Webhook notifications */
  webhooks: WebhookConfig[];
  /** Slack integration */
  slack?: SlackConfig;
}

export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** Events to send */
  events: string[];
  /** Secret for signing */
  secret: string;
  /** Active */
  active: boolean;
}

export interface SlackConfig {
  /** Webhook URL */
  webhookUrl: string;
  /** Channel */
  channel: string;
  /** Events to send */
  events: string[];
}

export interface LocalizationConfig {
  /** Default language */
  defaultLanguage: string;
  /** Supported languages */
  supportedLanguages: string[];
  /** Timezone */
  timezone: string;
  /** Date format */
  dateFormat: string;
}

// =============================================================================
// SITE CONFIGURATION
// =============================================================================

/**
 * Site configuration.
 */
export interface SiteConfig {
  /** Site-specific features */
  features: SiteFeatures;
  /** Content settings */
  content: ContentConfig;
  /** SEO settings */
  seo: SeoConfig;
  /** Analytics */
  analytics: AnalyticsConfig;
}

export interface SiteFeatures {
  /** Comments enabled */
  comments: boolean;
  /** User registration */
  registration: boolean;
  /** Public API */
  publicApi: boolean;
  /** Search */
  search: boolean;
}

export interface ContentConfig {
  /** Content types enabled */
  contentTypes: string[];
  /** Media storage */
  mediaStorage: 'local' | 's3' | 'azure' | 'gcs';
  /** Max upload size (bytes) */
  maxUploadSize: number;
}

export interface SeoConfig {
  /** Site title */
  title: string;
  /** Meta description */
  description: string;
  /** Keywords */
  keywords: string[];
  /** Robots.txt */
  robotsTxt: string;
}

export interface AnalyticsConfig {
  /** Google Analytics ID */
  googleAnalyticsId?: string;
  /** Custom tracking scripts */
  customScripts?: string[];
}

// =============================================================================
// SECURITY CONFIGURATION
// =============================================================================

/**
 * Tenant security configuration.
 */
export interface TenantSecurityConfig {
  /** Authentication settings */
  authentication: AuthenticationConfig;
  /** Authorization settings */
  authorization: AuthorizationConfig;
  /** Data protection */
  dataProtection: DataProtectionConfig;
  /** Network security */
  network: NetworkSecurityConfig;
  /** Audit settings */
  audit: AuditConfig;
  /** Compliance requirements */
  compliance: ComplianceRequirements;
}

/**
 * Site security configuration (inherits from tenant).
 */
export interface SiteSecurityConfig {
  /** Override tenant settings */
  overrideTenant: boolean;
  /** Authentication overrides */
  authentication?: Partial<AuthenticationConfig>;
  /** Additional security headers */
  securityHeaders: SecurityHeader[];
  /** CORS configuration */
  cors: CorsConfig;
  /** Content security policy */
  csp: CspConfig;
  /** Rate limiting */
  rateLimiting: RateLimitingConfig;
  /** IP restrictions */
  ipRestrictions?: IpRestrictionConfig;
}

export interface AuthenticationConfig {
  /** Allowed auth methods */
  allowedMethods: AuthMethod[];
  /** Password policy */
  passwordPolicy: PasswordPolicy;
  /** MFA configuration */
  mfa: MfaConfig;
  /** Session configuration */
  session: SessionConfig;
  /** SSO configuration */
  sso?: SsoConfig;
}

export type AuthMethod =
  | 'password'
  | 'magic_link'
  | 'sso_saml'
  | 'sso_oidc'
  | 'social'
  | 'api_key'
  | 'certificate';

export interface PasswordPolicy {
  /** Minimum length */
  minLength: number;
  /** Require uppercase */
  requireUppercase: boolean;
  /** Require lowercase */
  requireLowercase: boolean;
  /** Require numbers */
  requireNumbers: boolean;
  /** Require special characters */
  requireSpecial: boolean;
  /** Password history (prevent reuse) */
  historyCount: number;
  /** Max age (days, 0 = never) */
  maxAgeDays: number;
  /** Lockout threshold */
  lockoutThreshold: number;
  /** Lockout duration (minutes) */
  lockoutDurationMinutes: number;
}

export interface MfaConfig {
  /** MFA enabled */
  enabled: boolean;
  /** Required for all users */
  required: boolean;
  /** Required for admins */
  requiredForAdmins: boolean;
  /** Allowed MFA methods */
  allowedMethods: MfaMethod[];
  /** Remember device duration (days) */
  rememberDeviceDays: number;
}

export type MfaMethod = 'totp' | 'sms' | 'email' | 'webauthn' | 'push';

export interface SessionConfig {
  /** Session timeout (minutes) */
  timeoutMinutes: number;
  /** Absolute timeout (minutes) */
  absoluteTimeoutMinutes: number;
  /** Single session per user */
  singleSession: boolean;
  /** Bind session to IP */
  bindToIp: boolean;
  /** Bind session to device */
  bindToDevice: boolean;
  /** Secure cookie */
  secureCookie: boolean;
  /** Same site cookie policy */
  sameSite: 'strict' | 'lax' | 'none';
}

export interface SsoConfig {
  /** SSO type */
  type: 'saml' | 'oidc';
  /** Provider name */
  providerName: string;
  /** Issuer */
  issuer: string;
  /** Entry point/authorization URL */
  entryPoint: string;
  /** Certificate for verification */
  certificate: string;
  /** Client ID (for OIDC) */
  clientId?: string;
  /** Client secret (encrypted) */
  clientSecret?: string;
  /** Attribute mappings */
  attributeMappings: Record<string, string>;
  /** Auto-provision users */
  autoProvision: boolean;
  /** Default role for new users */
  defaultRole: string;
}

export interface AuthorizationConfig {
  /** RBAC enabled */
  rbacEnabled: boolean;
  /** Default role */
  defaultRole: string;
  /** Admin roles */
  adminRoles: string[];
  /** Resource-based access control */
  resourceAcl: boolean;
  /** Attribute-based access control */
  abacEnabled: boolean;
}

export interface DataProtectionConfig {
  /** Encryption at rest */
  encryptionAtRest: boolean;
  /** Encryption key ID */
  encryptionKeyId: string;
  /** Data classification */
  classification: DataClassification;
  /** Retention policy */
  retention: RetentionPolicy;
  /** Backup configuration */
  backup: BackupConfig;
}

export interface DataClassification {
  /** Enable classification */
  enabled: boolean;
  /** Default classification */
  defaultLevel: ClassificationLevel;
  /** Auto-classify content */
  autoClassify: boolean;
}

export type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export interface RetentionPolicy {
  /** Default retention (days) */
  defaultDays: number;
  /** Audit log retention (days) */
  auditLogDays: number;
  /** Backup retention (days) */
  backupDays: number;
}

export interface BackupConfig {
  /** Backup enabled */
  enabled: boolean;
  /** Backup frequency (hours) */
  frequencyHours: number;
  /** Backup destination */
  destination: 'local' | 's3' | 'azure' | 'gcs';
  /** Encrypt backups */
  encrypt: boolean;
  /** Retention count */
  retentionCount: number;
}

export interface NetworkSecurityConfig {
  /** TLS configuration */
  tls: TlsConfig;
  /** Firewall rules */
  firewall: FirewallRule[];
  /** VPN required */
  vpnRequired: boolean;
  /** Geo-restrictions */
  geoRestrictions?: GeoRestriction[];
}

export interface TlsConfig {
  /** Minimum TLS version */
  minVersion: 'TLS1.2' | 'TLS1.3';
  /** Allowed cipher suites */
  cipherSuites: string[];
  /** HSTS enabled */
  hstsEnabled: boolean;
  /** HSTS max age (seconds) */
  hstsMaxAge: number;
  /** Certificate pinning */
  certificatePinning: boolean;
}

export interface FirewallRule {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  name: string;
  /** Action */
  action: 'allow' | 'deny';
  /** Source IPs (CIDR) */
  sourceIps?: string[];
  /** Destination ports */
  ports?: number[];
  /** Protocol */
  protocol?: 'tcp' | 'udp' | 'any';
  /** Priority */
  priority: number;
}

export interface GeoRestriction {
  /** Country code */
  countryCode: string;
  /** Action */
  action: 'allow' | 'deny';
}

export interface AuditConfig {
  /** Audit enabled */
  enabled: boolean;
  /** Events to audit */
  events: AuditEventType[];
  /** Include request body */
  includeRequestBody: boolean;
  /** Include response body */
  includeResponseBody: boolean;
  /** Retention (days) */
  retentionDays: number;
  /** Real-time alerts */
  realTimeAlerts: boolean;
  /** SIEM integration */
  siemIntegration?: SiemConfig;
}

export type AuditEventType =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'admin_action'
  | 'security_event'
  | 'api_call'
  | 'file_access'
  | 'configuration_change';

export interface SiemConfig {
  /** SIEM type */
  type: 'splunk' | 'elastic' | 'sumo' | 'datadog' | 'custom';
  /** Endpoint URL */
  endpoint: string;
  /** API key */
  apiKey: string;
  /** Format */
  format: 'json' | 'cef' | 'syslog';
}

export interface ComplianceRequirements {
  /** Required frameworks */
  frameworks: string[];
  /** Data residency */
  dataResidency?: string[];
  /** GDPR subject requests */
  gdprEnabled: boolean;
  /** HIPAA compliance */
  hipaaEnabled: boolean;
  /** SOC2 compliance */
  soc2Enabled: boolean;
}

export interface SecurityHeader {
  /** Header name */
  name: string;
  /** Header value */
  value: string;
}

export interface CorsConfig {
  /** Allowed origins */
  allowedOrigins: string[];
  /** Allowed methods */
  allowedMethods: string[];
  /** Allowed headers */
  allowedHeaders: string[];
  /** Exposed headers */
  exposedHeaders: string[];
  /** Allow credentials */
  allowCredentials: boolean;
  /** Max age (seconds) */
  maxAge: number;
}

export interface CspConfig {
  /** Enable CSP */
  enabled: boolean;
  /** Report only mode */
  reportOnly: boolean;
  /** Directives */
  directives: Record<string, string[]>;
  /** Report URI */
  reportUri?: string;
}

export interface RateLimitingConfig {
  /** Enable rate limiting */
  enabled: boolean;
  /** Default limit per minute */
  defaultLimitPerMinute: number;
  /** Burst limit */
  burstLimit: number;
  /** Rate limits by endpoint */
  endpointLimits: Record<string, number>;
  /** Rate limits by role */
  roleLimits: Record<string, number>;
}

export interface IpRestrictionConfig {
  /** Restriction mode */
  mode: 'allowlist' | 'denylist';
  /** IP list (CIDR) */
  ipList: string[];
  /** Bypass for admins */
  bypassForAdmins: boolean;
}

export interface SiteLimits {
  /** Max storage (bytes) */
  maxStorage: number;
  /** Max bandwidth (bytes/month) */
  maxBandwidth: number;
  /** Max API calls per day */
  maxApiCallsPerDay: number;
  /** Max users */
  maxUsers: number;
  /** Max content items */
  maxContentItems: number;
}

// =============================================================================
// ISOLATION & SEGREGATION TYPES
// =============================================================================

/**
 * Data isolation context.
 */
export interface IsolationContext {
  /** Tenant ID */
  tenantId: string;
  /** Site ID (optional) */
  siteId?: string;
  /** User ID */
  userId: string;
  /** Request ID */
  requestId: string;
  /** Isolation level */
  isolationLevel: IsolationLevel;
  /** Data classification */
  dataClassification: ClassificationLevel;
  /** Encryption context */
  encryptionContext: EncryptionContext;
}

export interface EncryptionContext {
  /** Key ID */
  keyId: string;
  /** Algorithm */
  algorithm: string;
  /** Additional authenticated data */
  aad?: Record<string, string>;
}

/**
 * Cross-site access control.
 */
export interface CrossSiteAccessPolicy {
  /** Policy ID */
  policyId: string;
  /** Source site */
  sourceSiteId: string;
  /** Target site */
  targetSiteId: string;
  /** Access type */
  accessType: CrossSiteAccessType;
  /** Resources allowed */
  resources: string[];
  /** Actions allowed */
  actions: string[];
  /** Conditions */
  conditions: AccessCondition[];
  /** Expiration */
  expiresAt?: Date;
  /** Status */
  status: 'active' | 'suspended' | 'expired';
}

export type CrossSiteAccessType = 'read' | 'write' | 'admin' | 'sync';

export interface AccessCondition {
  /** Condition type */
  type: 'time' | 'ip' | 'user_attribute' | 'mfa';
  /** Condition parameters */
  params: Record<string, unknown>;
}

// =============================================================================
// AUDIT & SECURITY EVENTS
// =============================================================================

/**
 * Site-level audit event.
 */
export interface SiteAuditEvent {
  /** Event ID */
  eventId: string;
  /** Tenant ID */
  tenantId: string;
  /** Site ID */
  siteId: string;
  /** Event type */
  eventType: AuditEventType;
  /** Category */
  category: 'security' | 'access' | 'data' | 'admin' | 'system';
  /** Severity */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp */
  timestamp: Date;
  /** Actor */
  actor: AuditActor;
  /** Action */
  action: string;
  /** Resource */
  resource: AuditResource;
  /** Result */
  result: 'success' | 'failure' | 'partial';
  /** Details */
  details: Record<string, unknown>;
  /** Request context */
  requestContext: RequestContext;
  /** Correlation ID */
  correlationId?: string;
}

export interface AuditActor {
  /** Actor type */
  type: 'user' | 'service' | 'system' | 'anonymous';
  /** Actor ID */
  id: string;
  /** Actor name */
  name?: string;
  /** Email */
  email?: string;
  /** Roles */
  roles?: string[];
}

export interface AuditResource {
  /** Resource type */
  type: string;
  /** Resource ID */
  id: string;
  /** Resource name */
  name?: string;
  /** Resource path */
  path?: string;
}

export interface RequestContext {
  /** IP address */
  ipAddress: string;
  /** User agent */
  userAgent?: string;
  /** Request method */
  method: string;
  /** Request path */
  path: string;
  /** Request ID */
  requestId: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Security incident.
 */
export interface SecurityIncident {
  /** Incident ID */
  incidentId: string;
  /** Tenant ID */
  tenantId: string;
  /** Site ID */
  siteId?: string;
  /** Incident type */
  type: IncidentType;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Status */
  status: IncidentStatus;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Affected resources */
  affectedResources: AuditResource[];
  /** Related audit events */
  relatedEvents: string[];
  /** Detection source */
  detectionSource: 'automated' | 'manual' | 'external';
  /** Detected at */
  detectedAt: Date;
  /** Resolved at */
  resolvedAt?: Date;
  /** Response actions */
  responseActions: IncidentAction[];
  /** Assigned to */
  assignedTo?: string;
  /** Notes */
  notes: IncidentNote[];
}

export type IncidentType =
  | 'unauthorized_access'
  | 'data_breach'
  | 'malware'
  | 'ddos'
  | 'account_compromise'
  | 'policy_violation'
  | 'suspicious_activity'
  | 'configuration_drift'
  | 'compliance_violation';

export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';

export interface IncidentAction {
  /** Action ID */
  actionId: string;
  /** Action type */
  type: string;
  /** Description */
  description: string;
  /** Performed by */
  performedBy: string;
  /** Performed at */
  performedAt: Date;
  /** Result */
  result: 'success' | 'failure';
}

export interface IncidentNote {
  /** Note ID */
  noteId: string;
  /** Content */
  content: string;
  /** Created by */
  createdBy: string;
  /** Created at */
  createdAt: Date;
}

// =============================================================================
// KEY MANAGEMENT
// =============================================================================

/**
 * Per-site encryption key.
 */
export interface SiteEncryptionKey {
  /** Key ID */
  keyId: string;
  /** Tenant ID */
  tenantId: string;
  /** Site ID */
  siteId: string;
  /** Key type */
  type: 'master' | 'data' | 'backup';
  /** Algorithm */
  algorithm: string;
  /** Key material (encrypted) */
  encryptedKeyMaterial: string;
  /** Status */
  status: 'active' | 'rotating' | 'deprecated' | 'destroyed';
  /** Created at */
  createdAt: Date;
  /** Rotated at */
  rotatedAt?: Date;
  /** Expires at */
  expiresAt?: Date;
  /** Version */
  version: number;
  /** Parent key ID (for key hierarchy) */
  parentKeyId?: string;
}

/**
 * Key rotation event.
 */
export interface KeyRotationEvent {
  /** Event ID */
  eventId: string;
  /** Tenant ID */
  tenantId: string;
  /** Site ID */
  siteId: string;
  /** Old key ID */
  oldKeyId: string;
  /** New key ID */
  newKeyId: string;
  /** Rotation reason */
  reason: 'scheduled' | 'manual' | 'compromise' | 'compliance';
  /** Status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt?: Date;
  /** Records re-encrypted */
  recordsReEncrypted: number;
  /** Errors */
  errors?: string[];
}
