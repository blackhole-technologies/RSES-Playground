/**
 * @file security-types.ts
 * @description TypeScript interfaces for RSES CMS Security Architecture
 * @phase Phase 9 - CMS Transformation (Security Design)
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * This file defines the complete type system for:
 * - User authentication and identity
 * - Role-based access control (RBAC)
 * - Granular permissions
 * - Module security manifests
 * - Audit logging
 * - Session management
 */

// =============================================================================
// USER & IDENTITY
// =============================================================================

/**
 * Authentication provider types supported by the system.
 */
export type AuthProvider = 'local' | 'oauth_github' | 'oauth_gitlab' | 'oauth_google' | 'oauth_microsoft' | 'saml' | 'ldap' | 'api_key';

/**
 * User account status.
 */
export type UserStatus = 'active' | 'inactive' | 'pending_verification' | 'suspended' | 'deleted';

/**
 * Complete user entity with all security-relevant fields.
 */
export interface User {
  /** Unique user identifier */
  id: string;

  /** Unique username for login */
  username: string;

  /** Email address (unique, for notifications and recovery) */
  email: string;

  /** Display name (not unique) */
  displayName?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Account status */
  status: UserStatus;

  /** Primary authentication provider */
  primaryAuthProvider: AuthProvider;

  /** Linked authentication providers */
  linkedProviders: AuthProviderLink[];

  /** Assigned role IDs */
  roleIds: string[];

  /** Direct permission grants (in addition to roles) */
  directPermissions: string[];

  /** Permission denials (override grants) */
  deniedPermissions: string[];

  /** Account creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Last successful login */
  lastLoginAt?: Date;

  /** Last login IP address */
  lastLoginIp?: string;

  /** Failed login attempt count (for lockout) */
  failedLoginAttempts: number;

  /** Lockout expiry timestamp */
  lockoutUntil?: Date;

  /** Password change requirement flag */
  mustChangePassword: boolean;

  /** Password last changed timestamp */
  passwordChangedAt?: Date;

  /** Two-factor authentication enabled */
  mfaEnabled: boolean;

  /** MFA secret (encrypted) */
  mfaSecret?: string;

  /** Recovery codes (hashed) */
  recoveryCodes?: string[];

  /** User preferences */
  preferences: UserPreferences;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Safe user representation (no sensitive fields).
 */
export type SafeUser = Omit<User, 'mfaSecret' | 'recoveryCodes' | 'deniedPermissions'>;

/**
 * Minimal user representation for listings.
 */
export interface UserSummary {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: UserStatus;
}

/**
 * Linked authentication provider.
 */
export interface AuthProviderLink {
  provider: AuthProvider;
  providerId: string;
  providerUsername?: string;
  linkedAt: Date;
  lastUsedAt?: Date;
}

/**
 * User preferences.
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  emailNotifications: boolean;
  sessionTimeout: number; // minutes
}

/**
 * Credentials for local authentication.
 */
export interface LocalCredentials {
  /** Scrypt-hashed password in format "salt:hash" */
  passwordHash: string;
}

// =============================================================================
// ROLES
// =============================================================================

/**
 * Role trust level (affects available permissions).
 */
export type RoleTrustLevel = 'system' | 'admin' | 'elevated' | 'standard' | 'restricted';

/**
 * Role definition.
 */
export interface Role {
  /** Unique role identifier */
  id: string;

  /** Machine name (for code references) */
  machineName: string;

  /** Human-readable label */
  label: string;

  /** Role description */
  description?: string;

  /** Trust level */
  trustLevel: RoleTrustLevel;

  /** Permissions granted by this role */
  permissions: string[];

  /** Parent role IDs (inheritance) */
  inheritsFrom: string[];

  /** Whether this role is a system role (cannot be deleted) */
  isSystem: boolean;

  /** Weight for ordering */
  weight: number;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Built-in system roles.
 */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SITE_ADMIN: 'site_admin',
  SECURITY_ADMIN: 'security_admin',
  CONTENT_MANAGER: 'content_manager',
  CONFIG_EDITOR: 'config_editor',
  MODULE_ADMIN: 'module_admin',
  THEME_ADMIN: 'theme_admin',
  USER_ADMIN: 'user_admin',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
} as const;

export type SystemRoleId = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

// =============================================================================
// PERMISSIONS
// =============================================================================

/**
 * Permission operations.
 */
export type PermissionOperation =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'administer'
  | 'publish'
  | 'unpublish'
  | 'archive'
  | 'restore';

/**
 * Permission resource types.
 */
export type PermissionResource =
  | 'config'
  | 'project'
  | 'content'
  | 'module'
  | 'theme'
  | 'user'
  | 'role'
  | 'permission'
  | 'symlink'
  | 'audit'
  | 'system';

/**
 * Permission scopes.
 */
export type PermissionScope =
  | 'own'        // Only entities owned by the user
  | 'any'        // Any entity
  | 'published'  // Only published entities
  | 'draft'      // Only draft entities
  | 'restricted' // Within defined restrictions
  | 'all';       // Full access

/**
 * Permission definition.
 */
export interface Permission {
  /** Unique permission identifier (e.g., "create.config.own") */
  id: string;

  /** Human-readable label */
  label: string;

  /** Description of what this permission allows */
  description: string;

  /** Operation type */
  operation: PermissionOperation;

  /** Resource type */
  resource: PermissionResource;

  /** Scope limitation */
  scope: PermissionScope;

  /** Required trust level to grant this permission */
  requiredTrustLevel: RoleTrustLevel;

  /** Dependencies (other permissions required) */
  dependencies: string[];

  /** Whether this is a dangerous permission requiring extra care */
  dangerous: boolean;

  /** Category for UI grouping */
  category: string;

  /** Weight for ordering */
  weight: number;
}

/**
 * Permission check context.
 */
export interface PermissionContext {
  /** User performing the action */
  user: User;

  /** Resource being accessed (if applicable) */
  resource?: {
    type: PermissionResource;
    id: string;
    ownerId?: string;
    status?: string;
  };

  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Permission check result.
 */
export interface PermissionCheckResult {
  /** Whether access is allowed */
  allowed: boolean;

  /** Reason for denial (if denied) */
  reason?: string;

  /** Permission that was checked */
  permission: string;

  /** How access was granted (role, direct, bypass) */
  grantedBy?: 'role' | 'direct' | 'bypass';

  /** Role that granted access (if via role) */
  grantingRole?: string;
}

// =============================================================================
// CONTENT ACCESS CONTROL
// =============================================================================

/**
 * Content visibility/status.
 */
export type ContentStatus = 'draft' | 'review' | 'published' | 'archived' | 'deleted';

/**
 * Access control entry type.
 */
export type AclEntryType = 'grant' | 'deny';

/**
 * Principal type for ACL entries.
 */
export type AclPrincipalType = 'user' | 'role' | 'group' | 'anonymous' | 'authenticated';

/**
 * Access control list entry.
 */
export interface AclEntry {
  /** Entry type */
  type: AclEntryType;

  /** Principal type */
  principalType: AclPrincipalType;

  /** Principal ID (user ID, role ID, or group ID) */
  principalId: string;

  /** Permissions granted/denied */
  permissions: string[];

  /** Conditions for this entry */
  conditions?: AclCondition[];

  /** Entry priority (higher = evaluated first) */
  priority: number;

  /** Expiry date (optional) */
  expiresAt?: Date;
}

/**
 * Condition for ACL entry evaluation.
 */
export interface AclCondition {
  /** Condition type */
  type: 'time_range' | 'ip_range' | 'attribute' | 'custom';

  /** Condition parameters */
  params: Record<string, unknown>;
}

/**
 * Content access control list.
 */
export interface ContentAcl {
  /** Content entity ID */
  contentId: string;

  /** Content type */
  contentType: string;

  /** ACL entries */
  entries: AclEntry[];

  /** Inherit from parent (for hierarchical content) */
  inheritFromParent: boolean;

  /** Last updated timestamp */
  updatedAt: Date;
}

// =============================================================================
// MODULE SECURITY
// =============================================================================

/**
 * Module trust level.
 */
export type ModuleTrustLevel = 'core' | 'verified' | 'community' | 'custom' | 'untrusted';

/**
 * Module capability requirements.
 */
export interface ModuleCapabilities {
  /** File system access requirements */
  fileSystem: {
    read: string[];   // Glob patterns for read access
    write: string[];  // Glob patterns for write access
  };

  /** Network access requirements */
  network: {
    outbound: string[];  // Allowed outbound URLs/domains
    inbound: boolean;    // Can register routes
  };

  /** Database access */
  database: {
    tables: string[];    // Tables this module can access
    operations: ('select' | 'insert' | 'update' | 'delete')[];
  };

  /** Process capabilities */
  process: {
    spawn: boolean;      // Can spawn child processes
    env: string[];       // Environment variables needed
  };

  /** Crypto capabilities */
  crypto: {
    encrypt: boolean;
    sign: boolean;
  };
}

/**
 * Module security manifest.
 */
export interface ModuleManifest {
  /** Module machine name */
  name: string;

  /** Display name */
  displayName: string;

  /** Module version (semver) */
  version: string;

  /** Module description */
  description: string;

  /** Author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** License identifier */
  license: string;

  /** Module homepage */
  homepage?: string;

  /** Repository URL */
  repository?: string;

  /** Trust level */
  trustLevel: ModuleTrustLevel;

  /** Required capabilities */
  capabilities: ModuleCapabilities;

  /** Required permissions to install */
  installPermissions: string[];

  /** Permissions this module defines */
  definesPermissions: Permission[];

  /** Dependencies on other modules */
  dependencies: ModuleDependency[];

  /** Minimum RSES CMS version */
  minCmsVersion: string;

  /** Maximum RSES CMS version (optional) */
  maxCmsVersion?: string;

  /** Security contact email */
  securityContact?: string;

  /** Cryptographic signatures */
  signatures: ModuleSignature[];

  /** Content integrity checksums */
  checksums: ModuleChecksums;

  /** Security review status */
  securityReview?: SecurityReviewStatus;
}

/**
 * Module dependency specification.
 */
export interface ModuleDependency {
  /** Module name */
  name: string;

  /** Version constraint (semver range) */
  version: string;

  /** Whether dependency is optional */
  optional: boolean;
}

/**
 * Module cryptographic signature.
 */
export interface ModuleSignature {
  /** Signature algorithm */
  algorithm: 'RSA-SHA256' | 'ECDSA-SHA256' | 'Ed25519';

  /** Signer key ID */
  keyId: string;

  /** Signer identity */
  signer: string;

  /** Signature value (base64) */
  signature: string;

  /** Signing timestamp */
  signedAt: Date;
}

/**
 * Module content checksums.
 */
export interface ModuleChecksums {
  /** Overall package checksum */
  package: {
    algorithm: 'sha256' | 'sha384' | 'sha512';
    hash: string;
  };

  /** Individual file checksums */
  files: Record<string, string>;
}

/**
 * Security review status.
 */
export interface SecurityReviewStatus {
  /** Review status */
  status: 'pending' | 'approved' | 'rejected' | 'needs_changes';

  /** Reviewer identity */
  reviewer?: string;

  /** Review date */
  reviewedAt?: Date;

  /** Review notes */
  notes?: string;

  /** Known vulnerabilities */
  vulnerabilities: SecurityVulnerability[];
}

/**
 * Security vulnerability record.
 */
export interface SecurityVulnerability {
  /** CVE or internal ID */
  id: string;

  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Vulnerability description */
  description: string;

  /** Fixed in version (if applicable) */
  fixedIn?: string;

  /** Workaround (if applicable) */
  workaround?: string;

  /** Disclosure date */
  disclosedAt: Date;
}

// =============================================================================
// THEME SECURITY
// =============================================================================

/**
 * Theme security manifest.
 */
export interface ThemeManifest {
  /** Theme machine name */
  name: string;

  /** Display name */
  displayName: string;

  /** Theme version */
  version: string;

  /** Description */
  description: string;

  /** Author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** Base theme (if extending) */
  baseTheme?: string;

  /** Regions defined */
  regions: string[];

  /** Required libraries/assets */
  libraries: ThemeLibrary[];

  /** Security settings */
  security: ThemeSecuritySettings;

  /** Checksums */
  checksums: ModuleChecksums;
}

/**
 * Theme library dependency.
 */
export interface ThemeLibrary {
  /** Library name */
  name: string;

  /** Source type */
  source: 'local' | 'cdn' | 'npm';

  /** Source URL or path */
  url: string;

  /** Integrity hash (SRI) */
  integrity?: string;
}

/**
 * Theme security settings.
 */
export interface ThemeSecuritySettings {
  /** Allow inline styles */
  allowInlineStyles: boolean;

  /** Trusted script sources */
  trustedScriptSources: string[];

  /** Trusted style sources */
  trustedStyleSources: string[];

  /** Trusted font sources */
  trustedFontSources: string[];

  /** Trusted image sources */
  trustedImageSources: string[];

  /** CSP frame-ancestors override */
  frameAncestors?: string[];
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Session data stored in session store.
 */
export interface SessionData {
  /** User ID */
  userId: string;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** Session IP address */
  ipAddress: string;

  /** User agent */
  userAgent: string;

  /** Session device fingerprint */
  fingerprint?: string;

  /** Remember me flag */
  rememberMe: boolean;

  /** Elevated privileges granted */
  elevatedPrivileges: boolean;

  /** Elevation expiry */
  elevationExpiresAt?: Date;

  /** CSRF token */
  csrfToken: string;

  /** Custom session data */
  data?: Record<string, unknown>;
}

/**
 * Session configuration.
 */
export interface SessionConfig {
  /** Cookie name */
  cookieName: string;

  /** Session secret */
  secret: string;

  /** Cookie domain */
  domain?: string;

  /** Secure cookie (HTTPS only) */
  secure: boolean;

  /** SameSite attribute */
  sameSite: 'strict' | 'lax' | 'none';

  /** HttpOnly flag */
  httpOnly: boolean;

  /** Default session TTL (milliseconds) */
  ttl: number;

  /** Remember me TTL (milliseconds) */
  rememberMeTtl: number;

  /** Idle timeout (milliseconds) */
  idleTimeout: number;

  /** Maximum concurrent sessions per user */
  maxConcurrentSessions: number;

  /** Regenerate session ID on login */
  regenerateOnLogin: boolean;

  /** Session store type */
  storeType: 'memory' | 'redis' | 'postgresql';
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Audit event categories.
 */
export type AuditCategory =
  | 'authentication'
  | 'authorization'
  | 'content'
  | 'configuration'
  | 'security'
  | 'system'
  | 'user_management'
  | 'module'
  | 'theme';

/**
 * Audit event severity.
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Audit event outcome.
 */
export type AuditOutcome = 'success' | 'failure' | 'error' | 'denied';

/**
 * Actor performing the audited action.
 */
export interface AuditActor {
  /** Actor type */
  type: 'user' | 'system' | 'api_key' | 'module' | 'anonymous';

  /** Actor ID */
  id: string;

  /** Actor username or name */
  name?: string;

  /** Actor IP address */
  ip?: string;

  /** Actor user agent */
  userAgent?: string;

  /** Actor session ID (if applicable) */
  sessionId?: string;
}

/**
 * Resource affected by the audited action.
 */
export interface AuditResource {
  /** Resource type */
  type: string;

  /** Resource ID */
  id: string;

  /** Resource name/label */
  name?: string;

  /** Resource path (if applicable) */
  path?: string;
}

/**
 * Complete audit event record.
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string;

  /** Event timestamp */
  timestamp: Date;

  /** Request correlation ID */
  correlationId: string;

  /** Event category */
  category: AuditCategory;

  /** Event severity */
  severity: AuditSeverity;

  /** Action performed */
  action: string;

  /** Action outcome */
  outcome: AuditOutcome;

  /** Actor information */
  actor: AuditActor;

  /** Resource affected */
  resource?: AuditResource;

  /** Changes made (before/after) */
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    diff?: Record<string, { old: unknown; new: unknown }>;
  };

  /** Error information (if applicable) */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  /** Additional context */
  metadata?: Record<string, unknown>;

  /** Event tags for filtering */
  tags: string[];
}

/**
 * Audit event filter for queries.
 */
export interface AuditEventFilter {
  /** Filter by category */
  categories?: AuditCategory[];

  /** Filter by severity */
  severities?: AuditSeverity[];

  /** Filter by outcome */
  outcomes?: AuditOutcome[];

  /** Filter by actor ID */
  actorId?: string;

  /** Filter by actor type */
  actorType?: AuditActor['type'];

  /** Filter by resource type */
  resourceType?: string;

  /** Filter by resource ID */
  resourceId?: string;

  /** Filter by action */
  actions?: string[];

  /** Filter by date range */
  dateRange?: {
    from: Date;
    to: Date;
  };

  /** Filter by correlation ID */
  correlationId?: string;

  /** Filter by tags */
  tags?: string[];

  /** Search text */
  search?: string;
}

// =============================================================================
// API SECURITY
// =============================================================================

/**
 * API rate limit tier.
 */
export interface RateLimitTier {
  /** Tier name */
  name: string;

  /** Maximum requests */
  maxRequests: number;

  /** Time window (milliseconds) */
  windowMs: number;

  /** Applies to these principals */
  appliesTo: ('anonymous' | 'authenticated' | 'api_key' | 'admin')[];

  /** Exempt paths (glob patterns) */
  exemptPaths: string[];
}

/**
 * CORS configuration.
 */
export interface CorsConfig {
  /** Allowed origins */
  origins: string[];

  /** Allowed methods */
  methods: string[];

  /** Allowed headers */
  allowedHeaders: string[];

  /** Exposed headers */
  exposedHeaders: string[];

  /** Allow credentials */
  credentials: boolean;

  /** Preflight max age (seconds) */
  maxAge: number;
}

/**
 * API key entity.
 */
export interface ApiKey {
  /** Key ID (public identifier) */
  id: string;

  /** Key hash (for verification) */
  keyHash: string;

  /** Key prefix (for identification) */
  prefix: string;

  /** Key name/label */
  name: string;

  /** Owner user ID */
  userId: string;

  /** Permissions granted to this key */
  permissions: string[];

  /** Allowed IP addresses */
  allowedIps?: string[];

  /** Rate limit tier override */
  rateLimitTier?: string;

  /** Expiry date */
  expiresAt?: Date;

  /** Last used timestamp */
  lastUsedAt?: Date;

  /** Created timestamp */
  createdAt: Date;

  /** Revoked flag */
  revoked: boolean;

  /** Revoked timestamp */
  revokedAt?: Date;
}

// =============================================================================
// INPUT VALIDATION
// =============================================================================

/**
 * Validation rule definition.
 */
export interface ValidationRule {
  /** Rule type */
  type: 'pattern' | 'length' | 'range' | 'enum' | 'custom';

  /** Rule parameters */
  params: Record<string, unknown>;

  /** Error message */
  message: string;

  /** Error code */
  code: string;
}

/**
 * Field validation schema.
 */
export interface FieldValidation {
  /** Field name */
  field: string;

  /** Whether field is required */
  required: boolean;

  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';

  /** Validation rules */
  rules: ValidationRule[];

  /** Sanitization functions to apply */
  sanitize: ('trim' | 'lowercase' | 'uppercase' | 'escape_html' | 'strip_tags')[];
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors */
  errors: ValidationError[];

  /** Sanitized data (if valid) */
  data?: Record<string, unknown>;
}

/**
 * Validation error.
 */
export interface ValidationError {
  /** Field that failed validation */
  field: string;

  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Received value (sanitized for logging) */
  received?: unknown;

  /** Expected value/format */
  expected?: string;
}

// =============================================================================
// SECURITY EVENTS
// =============================================================================

/**
 * Security event types for real-time monitoring.
 */
export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_change'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'permission_denied'
  | 'rate_limit_exceeded'
  | 'path_traversal_attempt'
  | 'csrf_failure'
  | 'session_hijack_attempt'
  | 'suspicious_activity'
  | 'module_install'
  | 'config_change'
  | 'user_created'
  | 'user_deleted'
  | 'role_changed'
  | 'api_key_created'
  | 'api_key_revoked';

/**
 * Security event for real-time alerting.
 */
export interface SecurityEvent {
  /** Event type */
  type: SecurityEventType;

  /** Event timestamp */
  timestamp: Date;

  /** Severity level */
  severity: 'info' | 'warning' | 'high' | 'critical';

  /** Actor information */
  actor: AuditActor;

  /** Event details */
  details: Record<string, unknown>;

  /** Alert triggered */
  alerted: boolean;
}

// =============================================================================
// MIDDLEWARE CHAIN
// =============================================================================

/**
 * Security middleware configuration.
 */
export interface SecurityMiddlewareConfig {
  /** Enable Helmet security headers */
  helmet: boolean;

  /** Rate limiting configuration */
  rateLimit: RateLimitTier[];

  /** CORS configuration */
  cors: CorsConfig;

  /** CSRF protection enabled */
  csrf: {
    enabled: boolean;
    exemptPaths: string[];
  };

  /** Path traversal protection */
  pathTraversal: {
    enabled: boolean;
    blockedPatterns: RegExp[];
  };

  /** Input size limits */
  inputLimits: {
    maxBodySize: number;
    maxConfigSize: number;
    maxUploadSize: number;
  };

  /** Authentication required for paths */
  authRequired: string[];

  /** Paths requiring specific roles */
  roleRequired: Record<string, string[]>;
}

/**
 * Middleware chain order.
 */
export const MIDDLEWARE_ORDER = [
  'correlation',        // Add correlation ID
  'requestLogging',     // Log request start
  'helmet',             // Security headers
  'rateLimit',          // Rate limiting
  'cors',               // CORS handling
  'bodyParser',         // Parse request body
  'pathTraversal',      // Block path traversal
  'inputSize',          // Check input sizes
  'session',            // Session management
  'passport',           // Authentication
  'csrf',               // CSRF protection
  'rbac',               // Role-based access
  'permission',         // Permission check
  'audit',              // Audit logging
] as const;

export type MiddlewareName = typeof MIDDLEWARE_ORDER[number];

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  User as UserEntity,
  Role as RoleEntity,
  Permission as PermissionEntity,
  ModuleManifest as ModuleManifestEntity,
  ThemeManifest as ThemeManifestEntity,
  AuditEvent as AuditEventEntity,
  ApiKey as ApiKeyEntity,
};
