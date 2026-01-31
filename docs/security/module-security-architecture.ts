/**
 * @file module-security-architecture.ts
 * @description Security Architecture for RSES CMS Modular System
 * @phase Phase 9 - CMS Transformation (Security Architecture)
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * This file provides the complete security architecture for the RSES CMS
 * modular system, including:
 *
 * 1. Module Sandboxing Strategy
 * 2. Permission System for Modules
 * 3. Third-Party Module Verification/Signing
 * 4. Security Modules (E2E, DLP, OAuth) as Toggleable
 * 5. Audit Logging for Module State Changes
 * 6. Tenant Isolation
 * 7. Security Defaults When Modules Disabled
 *
 * KEY SECURITY GUARANTEES:
 * - Malicious modules cannot compromise core system
 * - Security degradation is graceful when security modules disabled
 * - Admin must approve dangerous permissions
 * - Complete audit trail of module activity
 */

import { z } from "zod";

// =============================================================================
// 1. MODULE SANDBOXING STRATEGY
// =============================================================================

/**
 * Module execution contexts define isolation levels for different module trust tiers.
 * This is the FIRST LINE OF DEFENSE against malicious modules.
 *
 * DESIGN RATIONALE:
 * - Core modules run in "kernel" context with full access
 * - Verified modules get "standard" context with API-mediated access
 * - Third-party modules run in "restricted" sandbox with capability-based security
 * - Untrusted modules run in "quarantine" with minimal permissions
 */
export type ModuleExecutionContext =
  | 'kernel'      // Core CMS modules - full trust, no sandbox
  | 'standard'    // Verified modules - API-mediated access
  | 'restricted'  // Third-party modules - capability-based sandbox
  | 'quarantine'; // Untrusted/new modules - minimal permissions

/**
 * Sandbox configuration for module isolation.
 * Each module runs in an isolated context based on its trust level.
 */
export interface ModuleSandbox {
  /** Unique sandbox identifier */
  id: string;

  /** Module this sandbox belongs to */
  moduleName: string;

  /** Execution context level */
  context: ModuleExecutionContext;

  /** Resource limits */
  limits: SandboxResourceLimits;

  /** Allowed capabilities (what the module CAN do) */
  capabilities: ModuleCapability[];

  /** Denied operations (explicit blocklist, overrides capabilities) */
  deniedOperations: string[];

  /** API access restrictions */
  apiAccess: ApiAccessPolicy;

  /** Data access scope */
  dataScope: DataScopePolicy;

  /** Isolated storage namespace */
  storageNamespace: string;

  /** Whether sandbox violations are fatal or logged */
  strictMode: boolean;

  /** Sandbox creation timestamp */
  createdAt: Date;
}

/**
 * Resource limits prevent DoS and resource exhaustion attacks.
 */
export interface SandboxResourceLimits {
  /** Maximum memory usage in bytes (default: 256MB) */
  maxMemory: number;

  /** Maximum CPU time per request in milliseconds (default: 5000) */
  maxCpuTime: number;

  /** Maximum concurrent operations (default: 10) */
  maxConcurrency: number;

  /** Maximum file handles (default: 100) */
  maxFileHandles: number;

  /** Maximum outbound network connections (default: 10) */
  maxNetworkConnections: number;

  /** Maximum database queries per request (default: 100) */
  maxDatabaseQueries: number;

  /** Storage quota in bytes (default: 100MB) */
  storageQuota: number;

  /** Rate limit: requests per minute (default: 1000) */
  requestsPerMinute: number;
}

/**
 * Default resource limits by execution context.
 */
export const DEFAULT_RESOURCE_LIMITS: Record<ModuleExecutionContext, SandboxResourceLimits> = {
  kernel: {
    maxMemory: -1,              // Unlimited
    maxCpuTime: -1,
    maxConcurrency: -1,
    maxFileHandles: -1,
    maxNetworkConnections: -1,
    maxDatabaseQueries: -1,
    storageQuota: -1,
    requestsPerMinute: -1,
  },
  standard: {
    maxMemory: 512 * 1024 * 1024,   // 512MB
    maxCpuTime: 10000,               // 10 seconds
    maxConcurrency: 50,
    maxFileHandles: 500,
    maxNetworkConnections: 50,
    maxDatabaseQueries: 500,
    storageQuota: 500 * 1024 * 1024, // 500MB
    requestsPerMinute: 5000,
  },
  restricted: {
    maxMemory: 256 * 1024 * 1024,   // 256MB
    maxCpuTime: 5000,                // 5 seconds
    maxConcurrency: 10,
    maxFileHandles: 100,
    maxNetworkConnections: 10,
    maxDatabaseQueries: 100,
    storageQuota: 100 * 1024 * 1024, // 100MB
    requestsPerMinute: 1000,
  },
  quarantine: {
    maxMemory: 64 * 1024 * 1024,    // 64MB
    maxCpuTime: 1000,                // 1 second
    maxConcurrency: 2,
    maxFileHandles: 10,
    maxNetworkConnections: 0,        // No network
    maxDatabaseQueries: 10,
    storageQuota: 10 * 1024 * 1024,  // 10MB
    requestsPerMinute: 100,
  },
};

// =============================================================================
// 2. MODULE PERMISSION SYSTEM
// =============================================================================

/**
 * Fine-grained capabilities that modules can request.
 * Based on capability-based security model.
 *
 * DESIGN RATIONALE:
 * - Principle of least privilege: modules only get what they need
 * - Explicit capability requests make security reviews easier
 * - Dangerous capabilities require admin approval
 */
export type ModuleCapability =
  // Content Operations
  | 'content.read'              // Read published content
  | 'content.read_unpublished'  // Read draft/unpublished content (ELEVATED)
  | 'content.create'            // Create new content
  | 'content.update_own'        // Update own content
  | 'content.update_any'        // Update any content (ELEVATED)
  | 'content.delete_own'        // Delete own content
  | 'content.delete_any'        // Delete any content (ELEVATED)
  | 'content.publish'           // Publish content (ELEVATED)

  // User Operations
  | 'user.read_profile'         // Read user profiles
  | 'user.read_email'           // Read user emails (ELEVATED)
  | 'user.create'               // Create users (ELEVATED)
  | 'user.update_self'          // Update own profile
  | 'user.update_any'           // Update any profile (DANGEROUS)
  | 'user.delete'               // Delete users (DANGEROUS)
  | 'user.impersonate'          // Impersonate users (DANGEROUS)

  // Configuration
  | 'config.read_public'        // Read public configuration
  | 'config.read_all'           // Read all configuration (ELEVATED)
  | 'config.write'              // Modify configuration (DANGEROUS)

  // File System
  | 'fs.read_public'            // Read from public directories
  | 'fs.read_private'           // Read from private directories (ELEVATED)
  | 'fs.write_uploads'          // Write to upload directories
  | 'fs.write_any'              // Write anywhere (DANGEROUS)
  | 'fs.execute'                // Execute files (DANGEROUS)

  // Network
  | 'network.outbound_http'     // Make outbound HTTP requests (ELEVATED)
  | 'network.outbound_any'      // Make any outbound connections (DANGEROUS)
  | 'network.inbound_routes'    // Register HTTP routes
  | 'network.websocket'         // Use WebSocket connections

  // Database
  | 'db.read_own_tables'        // Read module's own tables
  | 'db.read_shared'            // Read shared tables
  | 'db.write_own_tables'       // Write to module's own tables
  | 'db.write_shared'           // Write to shared tables (ELEVATED)
  | 'db.create_tables'          // Create new tables
  | 'db.drop_tables'            // Drop tables (DANGEROUS)
  | 'db.raw_query'              // Execute raw SQL (DANGEROUS)

  // Cryptography
  | 'crypto.hash'               // Use hashing functions
  | 'crypto.encrypt'            // Encrypt data (ELEVATED)
  | 'crypto.decrypt'            // Decrypt data (ELEVATED)
  | 'crypto.sign'               // Sign data (ELEVATED)
  | 'crypto.verify'             // Verify signatures

  // System
  | 'system.hooks_register'     // Register hooks
  | 'system.hooks_trigger'      // Trigger hooks (ELEVATED)
  | 'system.services_read'      // Read services
  | 'system.services_register'  // Register services (ELEVATED)
  | 'system.exec'               // Execute system commands (DANGEROUS)
  | 'system.admin_ui'           // Access admin UI
  | 'system.debug'              // Access debug information (ELEVATED);

/**
 * Capability classification by risk level.
 */
export type CapabilityRiskLevel = 'normal' | 'elevated' | 'dangerous';

/**
 * Capability metadata including risk classification.
 */
export interface CapabilityDefinition {
  id: ModuleCapability;
  label: string;
  description: string;
  riskLevel: CapabilityRiskLevel;
  requiresAdminApproval: boolean;
  auditLogged: boolean;
  category: string;
}

/**
 * Complete capability registry with risk classifications.
 */
export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  // Content - Normal
  { id: 'content.read', label: 'Read Content', description: 'Read published content', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'content' },
  { id: 'content.create', label: 'Create Content', description: 'Create new content', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'content' },
  { id: 'content.update_own', label: 'Update Own Content', description: 'Update content you created', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'content' },
  { id: 'content.delete_own', label: 'Delete Own Content', description: 'Delete content you created', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'content' },

  // Content - Elevated
  { id: 'content.read_unpublished', label: 'Read Unpublished', description: 'Read draft and unpublished content', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'content' },
  { id: 'content.update_any', label: 'Update Any Content', description: 'Update any content', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'content' },
  { id: 'content.delete_any', label: 'Delete Any Content', description: 'Delete any content', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'content' },
  { id: 'content.publish', label: 'Publish Content', description: 'Publish or unpublish content', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'content' },

  // User - Elevated/Dangerous
  { id: 'user.read_profile', label: 'Read Profiles', description: 'Read user profile information', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'user' },
  { id: 'user.read_email', label: 'Read Emails', description: 'Read user email addresses', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'user' },
  { id: 'user.update_self', label: 'Update Own Profile', description: 'Update own user profile', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'user' },
  { id: 'user.create', label: 'Create Users', description: 'Create new user accounts', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'user' },
  { id: 'user.update_any', label: 'Update Any User', description: 'Modify any user account', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'user' },
  { id: 'user.delete', label: 'Delete Users', description: 'Delete user accounts', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'user' },
  { id: 'user.impersonate', label: 'Impersonate Users', description: 'Act as another user', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'user' },

  // File System
  { id: 'fs.read_public', label: 'Read Public Files', description: 'Read from public directories', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'filesystem' },
  { id: 'fs.read_private', label: 'Read Private Files', description: 'Read from private directories', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'filesystem' },
  { id: 'fs.write_uploads', label: 'Write Uploads', description: 'Write to upload directories', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'filesystem' },
  { id: 'fs.write_any', label: 'Write Any File', description: 'Write to any location', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'filesystem' },
  { id: 'fs.execute', label: 'Execute Files', description: 'Execute binary files', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'filesystem' },

  // Network
  { id: 'network.outbound_http', label: 'HTTP Requests', description: 'Make outbound HTTP/HTTPS requests', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'network' },
  { id: 'network.outbound_any', label: 'Any Network', description: 'Make any network connections', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'network' },
  { id: 'network.inbound_routes', label: 'Register Routes', description: 'Add HTTP route handlers', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'network' },
  { id: 'network.websocket', label: 'WebSocket', description: 'Use WebSocket connections', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: false, category: 'network' },

  // Database
  { id: 'db.read_own_tables', label: 'Read Own Tables', description: 'Read module-specific tables', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'database' },
  { id: 'db.read_shared', label: 'Read Shared Tables', description: 'Read shared CMS tables', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'database' },
  { id: 'db.write_own_tables', label: 'Write Own Tables', description: 'Write to module-specific tables', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'database' },
  { id: 'db.write_shared', label: 'Write Shared Tables', description: 'Write to shared CMS tables', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'database' },
  { id: 'db.create_tables', label: 'Create Tables', description: 'Create database tables', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'database' },
  { id: 'db.drop_tables', label: 'Drop Tables', description: 'Delete database tables', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'database' },
  { id: 'db.raw_query', label: 'Raw SQL', description: 'Execute raw SQL queries', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'database' },

  // Cryptography
  { id: 'crypto.hash', label: 'Hash Data', description: 'Use hashing functions', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'crypto' },
  { id: 'crypto.encrypt', label: 'Encrypt Data', description: 'Encrypt sensitive data', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'crypto' },
  { id: 'crypto.decrypt', label: 'Decrypt Data', description: 'Decrypt encrypted data', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'crypto' },
  { id: 'crypto.sign', label: 'Sign Data', description: 'Create digital signatures', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'crypto' },
  { id: 'crypto.verify', label: 'Verify Signatures', description: 'Verify digital signatures', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'crypto' },

  // System
  { id: 'system.hooks_register', label: 'Register Hooks', description: 'Register event hooks', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: true, category: 'system' },
  { id: 'system.hooks_trigger', label: 'Trigger Hooks', description: 'Trigger system hooks', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'system' },
  { id: 'system.services_read', label: 'Read Services', description: 'Access registered services', riskLevel: 'normal', requiresAdminApproval: false, auditLogged: false, category: 'system' },
  { id: 'system.services_register', label: 'Register Services', description: 'Register new services', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'system' },
  { id: 'system.exec', label: 'Execute Commands', description: 'Run system commands', riskLevel: 'dangerous', requiresAdminApproval: true, auditLogged: true, category: 'system' },
  { id: 'system.admin_ui', label: 'Admin UI', description: 'Access admin interface', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'system' },
  { id: 'system.debug', label: 'Debug Access', description: 'Access debug information', riskLevel: 'elevated', requiresAdminApproval: true, auditLogged: true, category: 'system' },
];

/**
 * API access policy defines what APIs a module can call.
 */
export interface ApiAccessPolicy {
  /** Allowed API namespaces (e.g., ["content", "taxonomy"]) */
  allowedNamespaces: string[];

  /** Blocked API methods (explicit deny list) */
  blockedMethods: string[];

  /** Rate limits per API namespace */
  rateLimits: Record<string, number>;

  /** Whether to allow internal/private API access */
  allowInternalApis: boolean;
}

/**
 * Data scope policy defines what data a module can access.
 */
export interface DataScopePolicy {
  /** Content types the module can access */
  allowedContentTypes: string[] | 'all';

  /** Taxonomies the module can access */
  allowedTaxonomies: string[] | 'all';

  /** Whether module can access other tenants' data */
  crossTenantAccess: boolean;

  /** Data retention policy (days, -1 for unlimited) */
  dataRetentionDays: number;

  /** Fields to mask in responses */
  maskedFields: string[];

  /** PII handling policy */
  piiPolicy: 'none' | 'anonymize' | 'full';
}

// =============================================================================
// 3. THIRD-PARTY MODULE VERIFICATION/SIGNING
// =============================================================================

/**
 * Module trust levels determine sandbox restrictions and capabilities.
 */
export type ModuleTrustLevel =
  | 'core'        // Built-in CMS modules (fully trusted)
  | 'verified'    // Verified by security review (high trust)
  | 'community'   // Community modules with signatures (medium trust)
  | 'custom'      // Custom/private modules (configurable trust)
  | 'untrusted';  // Unknown/unverified modules (minimal trust)

/**
 * Signature verification status.
 */
export type SignatureStatus =
  | 'valid'           // Signature verified successfully
  | 'invalid'         // Signature verification failed
  | 'expired'         // Signature expired
  | 'revoked'         // Signing key revoked
  | 'unknown_signer'  // Signer not in trusted keyring
  | 'missing';        // No signature present

/**
 * Module signature for integrity verification.
 */
export interface ModuleSignature {
  /** Signature algorithm (Ed25519 recommended) */
  algorithm: 'Ed25519' | 'RSA-SHA256' | 'ECDSA-SHA384';

  /** Signing key identifier */
  keyId: string;

  /** Signer identity (e.g., email, organization) */
  signer: string;

  /** Signature value (base64 encoded) */
  signature: string;

  /** What was signed (manifest digest) */
  signedDigest: string;

  /** Signing timestamp */
  signedAt: Date;

  /** Signature expiry (optional) */
  expiresAt?: Date;

  /** Certificate chain (for PKI-based verification) */
  certificateChain?: string[];
}

/**
 * Trusted signer configuration.
 */
export interface TrustedSigner {
  /** Key identifier */
  keyId: string;

  /** Public key (PEM or base64) */
  publicKey: string;

  /** Signer identity */
  identity: string;

  /** Trust level assigned to modules signed by this signer */
  trustLevel: ModuleTrustLevel;

  /** Key expiry date */
  expiresAt?: Date;

  /** Whether this key is revoked */
  revoked: boolean;

  /** Revocation timestamp */
  revokedAt?: Date;

  /** Revocation reason */
  revocationReason?: string;
}

/**
 * Module verification result.
 */
export interface ModuleVerificationResult {
  /** Overall verification passed */
  verified: boolean;

  /** Trust level determined */
  trustLevel: ModuleTrustLevel;

  /** Signature verification status */
  signatureStatus: SignatureStatus;

  /** Signer information (if signed) */
  signer?: TrustedSigner;

  /** Checksum verification passed */
  checksumValid: boolean;

  /** Manifest validation passed */
  manifestValid: boolean;

  /** Security review status */
  securityReviewStatus?: 'approved' | 'pending' | 'rejected';

  /** Known vulnerabilities */
  vulnerabilities: ModuleVulnerability[];

  /** Verification errors */
  errors: string[];

  /** Verification warnings */
  warnings: string[];

  /** Verification timestamp */
  verifiedAt: Date;
}

/**
 * Known vulnerability in a module.
 */
export interface ModuleVulnerability {
  /** CVE or internal ID */
  id: string;

  /** Severity (CVSS-based) */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Affected versions (semver range) */
  affectedVersions: string;

  /** Fixed in version */
  fixedVersion?: string;

  /** Vulnerability description */
  description: string;

  /** Mitigation advice */
  mitigation?: string;

  /** Disclosure date */
  disclosedAt: Date;
}

/**
 * Module verification service interface.
 */
export interface ModuleVerificationService {
  /**
   * Verify a module's signatures and integrity.
   */
  verifyModule(modulePath: string): Promise<ModuleVerificationResult>;

  /**
   * Check if module has known vulnerabilities.
   */
  checkVulnerabilities(moduleName: string, version: string): Promise<ModuleVulnerability[]>;

  /**
   * Add a trusted signer.
   */
  addTrustedSigner(signer: TrustedSigner): Promise<void>;

  /**
   * Revoke a signer's trust.
   */
  revokeSigner(keyId: string, reason: string): Promise<void>;

  /**
   * List trusted signers.
   */
  listTrustedSigners(): Promise<TrustedSigner[]>;
}

// =============================================================================
// 4. SECURITY MODULES AS TOGGLEABLE FEATURES
// =============================================================================

/**
 * Security module types that can be enabled/disabled.
 */
export type SecurityModuleType =
  | 'e2e_encryption'      // End-to-end encryption for sensitive content
  | 'dlp'                 // Data Loss Prevention
  | 'oauth_provider'      // OAuth/OIDC provider
  | 'oauth_client'        // OAuth client for external providers
  | 'mfa'                 // Multi-factor authentication
  | 'audit_enhanced'      // Enhanced audit logging
  | 'intrusion_detection' // IDS/anomaly detection
  | 'waf'                 // Web Application Firewall rules
  | 'rate_limiting'       // Advanced rate limiting
  | 'captcha'             // CAPTCHA integration
  | 'encryption_at_rest'  // Database/file encryption
  | 'key_management'      // Key management service
  | 'certificate_pinning' // TLS certificate pinning
  | 'content_security';   // Enhanced CSP management

/**
 * Security module state.
 */
export type SecurityModuleState =
  | 'enabled'     // Fully operational
  | 'disabled'    // Turned off (graceful degradation)
  | 'degraded'    // Partially functional (missing dependencies)
  | 'failed'      // Failed to initialize
  | 'pending';    // Awaiting configuration

/**
 * Security module configuration.
 */
export interface SecurityModuleConfig {
  /** Module type */
  type: SecurityModuleType;

  /** Current state */
  state: SecurityModuleState;

  /** Whether this module is required (cannot be disabled) */
  required: boolean;

  /** Dependencies on other security modules */
  dependencies: SecurityModuleType[];

  /** Modules that depend on this one */
  dependents: SecurityModuleType[];

  /** Fallback behavior when disabled */
  fallbackBehavior: SecurityFallbackBehavior;

  /** Module-specific configuration */
  settings: Record<string, unknown>;

  /** Last state change */
  lastStateChange: Date;

  /** State change reason */
  stateChangeReason?: string;

  /** Admin who made the change */
  stateChangedBy?: string;
}

/**
 * Fallback behavior when security module is disabled.
 */
export interface SecurityFallbackBehavior {
  /** What to do with protected content */
  contentBehavior: 'allow_unprotected' | 'block_access' | 'read_only' | 'warn';

  /** Whether to log access attempts */
  logAccess: boolean;

  /** Warning message to display */
  warningMessage?: string;

  /** Alternative authentication method */
  alternativeAuth?: string;

  /** Grace period before enforcement (hours) */
  gracePeriodHours: number;
}

/**
 * E2E Encryption module configuration.
 */
export interface E2EEncryptionConfig {
  /** Key derivation function */
  kdf: 'argon2id' | 'scrypt' | 'pbkdf2';

  /** Encryption algorithm */
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';

  /** Key rotation interval (days) */
  keyRotationDays: number;

  /** Content types to encrypt */
  encryptedContentTypes: string[];

  /** Fields to encrypt */
  encryptedFields: string[];

  /** Key escrow enabled */
  keyEscrow: boolean;

  /** Recovery key holders (admin user IDs) */
  recoveryKeyHolders: string[];
}

/**
 * Data Loss Prevention module configuration.
 */
export interface DLPConfig {
  /** Enabled detection patterns */
  detectionPatterns: DLPPattern[];

  /** Action to take on detection */
  defaultAction: 'block' | 'warn' | 'log' | 'redact';

  /** Content types to scan */
  scannedContentTypes: string[];

  /** Exempted roles */
  exemptRoles: string[];

  /** Notification recipients */
  notifyOnDetection: string[];

  /** External DLP service URL (optional) */
  externalServiceUrl?: string;
}

/**
 * DLP detection pattern.
 */
export interface DLPPattern {
  /** Pattern identifier */
  id: string;

  /** Pattern name */
  name: string;

  /** Detection type */
  type: 'regex' | 'keyword' | 'ml_classifier' | 'checksum';

  /** Pattern value (regex string, keywords, etc.) */
  pattern: string;

  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /** Action override */
  action?: 'block' | 'warn' | 'log' | 'redact';

  /** Is pattern enabled */
  enabled: boolean;
}

/**
 * OAuth module configuration.
 */
export interface OAuthConfig {
  /** Enabled providers */
  providers: OAuthProviderConfig[];

  /** Token settings */
  tokenSettings: {
    accessTokenTtl: number;   // seconds
    refreshTokenTtl: number;  // seconds
    rotateRefreshTokens: boolean;
  };

  /** PKCE requirement */
  requirePkce: boolean;

  /** Allowed redirect URIs */
  allowedRedirectUris: string[];

  /** Allowed scopes */
  allowedScopes: string[];
}

/**
 * OAuth provider configuration.
 */
export interface OAuthProviderConfig {
  /** Provider identifier */
  id: string;

  /** Display name */
  name: string;

  /** Provider type */
  type: 'github' | 'google' | 'microsoft' | 'gitlab' | 'oidc_generic';

  /** Client ID */
  clientId: string;

  /** Client secret (encrypted) */
  clientSecretEncrypted: string;

  /** Authorization URL (for OIDC generic) */
  authorizationUrl?: string;

  /** Token URL */
  tokenUrl?: string;

  /** User info URL */
  userInfoUrl?: string;

  /** Scopes to request */
  scopes: string[];

  /** Enabled */
  enabled: boolean;
}

// =============================================================================
// 5. AUDIT LOGGING FOR MODULE STATE CHANGES
// =============================================================================

/**
 * Module audit event types.
 */
export type ModuleAuditEventType =
  // Lifecycle events
  | 'module.installed'
  | 'module.uninstalled'
  | 'module.enabled'
  | 'module.disabled'
  | 'module.upgraded'
  | 'module.downgraded'

  // Configuration events
  | 'module.config_changed'
  | 'module.permissions_changed'
  | 'module.capability_granted'
  | 'module.capability_revoked'

  // Security events
  | 'module.verification_failed'
  | 'module.signature_invalid'
  | 'module.vulnerability_detected'
  | 'module.sandbox_violation'
  | 'module.rate_limit_exceeded'
  | 'module.quarantined'

  // Access events
  | 'module.api_access'
  | 'module.data_access'
  | 'module.permission_denied'
  | 'module.capability_used';

/**
 * Module audit event severity.
 */
export type ModuleAuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Complete module audit event.
 */
export interface ModuleAuditEvent {
  /** Unique event ID */
  id: string;

  /** Event timestamp (high precision) */
  timestamp: Date;

  /** Request correlation ID */
  correlationId: string;

  /** Event type */
  eventType: ModuleAuditEventType;

  /** Severity level */
  severity: ModuleAuditSeverity;

  /** Module involved */
  module: {
    name: string;
    version: string;
    trustLevel: ModuleTrustLevel;
  };

  /** Actor who triggered the event */
  actor: {
    type: 'user' | 'system' | 'module' | 'api_key';
    id: string;
    name?: string;
    ip?: string;
    userAgent?: string;
  };

  /** Event-specific details */
  details: Record<string, unknown>;

  /** Previous state (for changes) */
  previousState?: Record<string, unknown>;

  /** New state (for changes) */
  newState?: Record<string, unknown>;

  /** Outcome */
  outcome: 'success' | 'failure' | 'denied' | 'error';

  /** Error information if applicable */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  /** Tags for filtering */
  tags: string[];

  /** Tenant ID (for multi-tenant) */
  tenantId?: string;
}

/**
 * Audit log retention policy.
 */
export interface AuditRetentionPolicy {
  /** Default retention days */
  defaultRetentionDays: number;

  /** Retention by severity */
  retentionBySeverity: Record<ModuleAuditSeverity, number>;

  /** Event types to keep indefinitely */
  permanentEventTypes: ModuleAuditEventType[];

  /** Archival destination */
  archiveDestination?: string;

  /** Compression enabled */
  compressArchives: boolean;

  /** Encryption for archives */
  encryptArchives: boolean;
}

/**
 * Default audit retention policy.
 */
export const DEFAULT_AUDIT_RETENTION: AuditRetentionPolicy = {
  defaultRetentionDays: 90,
  retentionBySeverity: {
    info: 30,
    warning: 90,
    error: 365,
    critical: -1, // Permanent
  },
  permanentEventTypes: [
    'module.installed',
    'module.uninstalled',
    'module.vulnerability_detected',
    'module.sandbox_violation',
    'module.quarantined',
  ],
  compressArchives: true,
  encryptArchives: true,
};

/**
 * Audit logger interface for modules.
 */
export interface ModuleAuditLogger {
  /**
   * Log a module event.
   */
  log(event: Omit<ModuleAuditEvent, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Query audit events.
   */
  query(filter: ModuleAuditFilter): Promise<ModuleAuditEvent[]>;

  /**
   * Export audit events.
   */
  export(filter: ModuleAuditFilter, format: 'json' | 'csv' | 'syslog'): Promise<string>;
}

/**
 * Audit event filter.
 */
export interface ModuleAuditFilter {
  /** Filter by event types */
  eventTypes?: ModuleAuditEventType[];

  /** Filter by module name */
  moduleName?: string;

  /** Filter by actor ID */
  actorId?: string;

  /** Filter by severity */
  severities?: ModuleAuditSeverity[];

  /** Filter by outcome */
  outcomes?: ('success' | 'failure' | 'denied' | 'error')[];

  /** Date range */
  dateRange?: { from: Date; to: Date };

  /** Filter by tags */
  tags?: string[];

  /** Full-text search */
  search?: string;

  /** Pagination */
  limit?: number;
  offset?: number;
}

// =============================================================================
// 6. TENANT ISOLATION FOR SHARED DATA
// =============================================================================

/**
 * Tenant isolation strategy.
 */
export type TenantIsolationStrategy =
  | 'database_per_tenant'     // Separate database per tenant
  | 'schema_per_tenant'       // Separate schema per tenant
  | 'row_level_security'      // RLS in shared tables
  | 'shared_discriminator';   // tenant_id column

/**
 * Tenant configuration.
 */
export interface TenantConfig {
  /** Unique tenant identifier */
  id: string;

  /** Tenant name */
  name: string;

  /** Isolation strategy */
  isolationStrategy: TenantIsolationStrategy;

  /** Database connection details (for separate DB strategy) */
  database?: {
    host: string;
    port: number;
    name: string;
    schema?: string;
  };

  /** Enabled modules for this tenant */
  enabledModules: string[];

  /** Module overrides (tenant-specific settings) */
  moduleOverrides: Record<string, Record<string, unknown>>;

  /** Storage namespace */
  storageNamespace: string;

  /** Resource quotas */
  quotas: TenantQuotas;

  /** Tenant status */
  status: 'active' | 'suspended' | 'deleted';

  /** Created timestamp */
  createdAt: Date;
}

/**
 * Tenant resource quotas.
 */
export interface TenantQuotas {
  /** Maximum storage in bytes */
  maxStorage: number;

  /** Maximum content items */
  maxContentItems: number;

  /** Maximum users */
  maxUsers: number;

  /** Maximum API requests per day */
  maxApiRequestsPerDay: number;

  /** Maximum file upload size */
  maxUploadSize: number;

  /** Maximum concurrent sessions */
  maxConcurrentSessions: number;
}

/**
 * Tenant context for request processing.
 */
export interface TenantContext {
  /** Current tenant */
  tenant: TenantConfig;

  /** Request correlation ID */
  correlationId: string;

  /** Resolved database connection */
  dbConnection: unknown;

  /** Resolved storage path */
  storagePath: string;

  /** Active user within tenant */
  user?: {
    id: string;
    roles: string[];
  };
}

/**
 * Module data access with tenant isolation.
 */
export interface TenantIsolatedDataAccess {
  /**
   * Execute query with automatic tenant scoping.
   */
  query<T>(sql: string, params: unknown[]): Promise<T[]>;

  /**
   * Insert with automatic tenant ID injection.
   */
  insert<T>(table: string, data: Omit<T, 'tenantId'>): Promise<T>;

  /**
   * Update with tenant scope enforcement.
   */
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>;

  /**
   * Delete with tenant scope enforcement.
   */
  delete(table: string, id: string): Promise<boolean>;

  /**
   * Check if module can access cross-tenant data.
   */
  canAccessTenant(targetTenantId: string): boolean;
}

/**
 * Cross-tenant data sharing configuration.
 */
export interface CrossTenantSharingConfig {
  /** Sharing enabled */
  enabled: boolean;

  /** What can be shared */
  sharableResourceTypes: string[];

  /** Sharing requires approval */
  requireApproval: boolean;

  /** Audit cross-tenant access */
  auditAccess: boolean;

  /** Maximum tenants to share with */
  maxShareTargets: number;
}

// =============================================================================
// 7. SECURITY DEFAULTS WHEN MODULES DISABLED
// =============================================================================

/**
 * Default security behavior when specific features are unavailable.
 */
export interface SecurityDefaults {
  /**
   * Authentication defaults when OAuth module disabled.
   */
  authenticationDefaults: {
    /** Allow local authentication */
    allowLocalAuth: boolean;

    /** Password requirements */
    passwordPolicy: PasswordPolicy;

    /** Session configuration */
    sessionConfig: SessionDefaults;

    /** Lockout policy */
    lockoutPolicy: LockoutPolicy;
  };

  /**
   * Encryption defaults when E2E module disabled.
   */
  encryptionDefaults: {
    /** Encrypt passwords (always true) */
    encryptPasswords: true;

    /** Hash algorithm for passwords */
    passwordHashAlgorithm: 'argon2id' | 'scrypt';

    /** Encrypt session data */
    encryptSessions: boolean;

    /** TLS required for API */
    requireTls: boolean;
  };

  /**
   * Content access defaults when DLP disabled.
   */
  contentDefaults: {
    /** Allow public content */
    allowPublicContent: boolean;

    /** Default content visibility */
    defaultVisibility: 'public' | 'authenticated' | 'private';

    /** Sanitize HTML input */
    sanitizeHtml: boolean;

    /** Maximum content size */
    maxContentSize: number;
  };

  /**
   * API defaults when advanced rate limiting disabled.
   */
  apiDefaults: {
    /** Basic rate limiting enabled */
    basicRateLimiting: boolean;

    /** Requests per minute (anonymous) */
    anonymousRateLimit: number;

    /** Requests per minute (authenticated) */
    authenticatedRateLimit: number;

    /** CORS policy */
    corsPolicy: CorsDefaults;
  };

  /**
   * Audit defaults when enhanced audit disabled.
   */
  auditDefaults: {
    /** Basic audit logging enabled */
    basicAuditEnabled: boolean;

    /** Events to always log */
    mandatoryEvents: string[];

    /** Retention days */
    retentionDays: number;
  };

  /**
   * Module defaults when verification disabled.
   */
  moduleDefaults: {
    /** Allow unverified modules */
    allowUnverified: boolean;

    /** Maximum trust level for unverified */
    maxUnverifiedTrustLevel: ModuleTrustLevel;

    /** Require admin approval */
    requireAdminApproval: boolean;
  };
}

/**
 * Password policy.
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;          // days, 0 = no expiry
  preventReuse: number;    // number of previous passwords to check
  blockCommonPasswords: boolean;
}

/**
 * Session defaults.
 */
export interface SessionDefaults {
  ttl: number;              // milliseconds
  idleTimeout: number;      // milliseconds
  absoluteTimeout: number;  // milliseconds
  regenerateOnAuth: boolean;
  secureCookies: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

/**
 * Account lockout policy.
 */
export interface LockoutPolicy {
  enabled: boolean;
  maxFailedAttempts: number;
  lockoutDuration: number;  // seconds
  resetAttemptsAfter: number; // seconds
  notifyOnLockout: boolean;
}

/**
 * CORS defaults.
 */
export interface CorsDefaults {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Production-ready security defaults.
 */
export const PRODUCTION_SECURITY_DEFAULTS: SecurityDefaults = {
  authenticationDefaults: {
    allowLocalAuth: true,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90,
      preventReuse: 12,
      blockCommonPasswords: true,
    },
    sessionConfig: {
      ttl: 8 * 60 * 60 * 1000,        // 8 hours
      idleTimeout: 30 * 60 * 1000,    // 30 minutes
      absoluteTimeout: 24 * 60 * 60 * 1000, // 24 hours
      regenerateOnAuth: true,
      secureCookies: true,
      sameSite: 'strict',
    },
    lockoutPolicy: {
      enabled: true,
      maxFailedAttempts: 5,
      lockoutDuration: 15 * 60,        // 15 minutes
      resetAttemptsAfter: 60 * 60,     // 1 hour
      notifyOnLockout: true,
    },
  },
  encryptionDefaults: {
    encryptPasswords: true,
    passwordHashAlgorithm: 'argon2id',
    encryptSessions: true,
    requireTls: true,
  },
  contentDefaults: {
    allowPublicContent: true,
    defaultVisibility: 'authenticated',
    sanitizeHtml: true,
    maxContentSize: 10 * 1024 * 1024, // 10MB
  },
  apiDefaults: {
    basicRateLimiting: true,
    anonymousRateLimit: 60,          // per minute
    authenticatedRateLimit: 300,     // per minute
    corsPolicy: {
      allowedOrigins: [],            // None by default (must configure)
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 86400,
    },
  },
  auditDefaults: {
    basicAuditEnabled: true,
    mandatoryEvents: [
      'user.login',
      'user.logout',
      'user.password_change',
      'module.installed',
      'module.uninstalled',
      'config.changed',
      'permission.changed',
    ],
    retentionDays: 90,
  },
  moduleDefaults: {
    allowUnverified: false,
    maxUnverifiedTrustLevel: 'untrusted',
    requireAdminApproval: true,
  },
};

// =============================================================================
// SECURITY ENFORCEMENT SERVICE
// =============================================================================

/**
 * Module security enforcement service interface.
 */
export interface ModuleSecurityService {
  /**
   * Create sandbox for a module based on its trust level.
   */
  createSandbox(moduleName: string, trustLevel: ModuleTrustLevel): Promise<ModuleSandbox>;

  /**
   * Check if module has required capability.
   */
  checkCapability(moduleName: string, capability: ModuleCapability): Promise<boolean>;

  /**
   * Grant capability to module (requires admin approval for dangerous).
   */
  grantCapability(moduleName: string, capability: ModuleCapability, approvedBy: string): Promise<void>;

  /**
   * Revoke capability from module.
   */
  revokeCapability(moduleName: string, capability: ModuleCapability, reason: string): Promise<void>;

  /**
   * Verify module signatures and integrity.
   */
  verifyModule(modulePath: string): Promise<ModuleVerificationResult>;

  /**
   * Quarantine a module (disable and restrict).
   */
  quarantineModule(moduleName: string, reason: string): Promise<void>;

  /**
   * Get current security state for a module.
   */
  getModuleSecurityState(moduleName: string): Promise<{
    sandbox: ModuleSandbox;
    capabilities: ModuleCapability[];
    verification: ModuleVerificationResult;
    auditSummary: {
      totalEvents: number;
      violations: number;
      lastActivity: Date;
    };
  }>;

  /**
   * Apply security defaults when module is disabled.
   */
  applySecurityDefaults(moduleType: SecurityModuleType): Promise<void>;

  /**
   * Validate module API call against capabilities and policies.
   */
  validateApiCall(
    moduleName: string,
    apiNamespace: string,
    method: string,
    context: TenantContext
  ): Promise<{ allowed: boolean; reason?: string }>;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

/**
 * Module manifest schema for validation.
 */
export const moduleManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  displayName: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/),
  description: z.string().max(500),
  author: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
  license: z.string(),
  capabilities: z.array(z.string()),
  dependencies: z.array(z.object({
    name: z.string(),
    version: z.string(),
    optional: z.boolean().default(false),
  })).default([]),
  minCmsVersion: z.string().optional(),
  securityContact: z.string().email().optional(),
});

/**
 * Capability grant request schema.
 */
export const capabilityGrantRequestSchema = z.object({
  moduleName: z.string(),
  capability: z.string(),
  justification: z.string().min(10).max(500),
  requestedBy: z.string(),
  expiresAt: z.date().optional(),
});

/**
 * Module state change request schema.
 */
export const moduleStateChangeSchema = z.object({
  moduleName: z.string(),
  action: z.enum(['enable', 'disable', 'quarantine', 'unquarantine']),
  reason: z.string().min(10).max(500),
  changedBy: z.string(),
  notifyUsers: z.boolean().default(false),
});

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  ModuleSandbox as ModuleSandboxEntity,
  ModuleAuditEvent as ModuleAuditEntity,
  TenantConfig as TenantConfigEntity,
  SecurityModuleConfig as SecurityModuleEntity,
};
