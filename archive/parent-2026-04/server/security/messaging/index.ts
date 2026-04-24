/**
 * @file index.ts
 * @description Messaging Security Module - Main Export.
 *              Provides comprehensive security for messaging, social media, and voice/video.
 * @phase Phase 10 - Messaging & Social Media Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards Signal Protocol, OAuth 2.0, HIPAA, SOC2, GDPR, PCI-DSS
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // X3DH & Signal Protocol Types
  X3DHKeyBundle,
  CryptoKeyPair,
  SignedPreKey,
  OneTimePreKey,
  DoubleRatchetSession,
  ChainState,
  RatchetCounters,
  SkippedMessageKey,

  // Encrypted Message Types
  EncryptedMessage,
  MessageHeader,
  MessageType,
  DecryptedMessage,
  MessageContent,
  TextContent,
  MediaContent,
  FileContent,
  LocationContent,
  ReactionContent,
  SystemContent,
  SystemEventType,
  LinkPreview,
  MessageMetadata,
  DecryptionVerification,

  // At-Rest Encryption Types
  AtRestEncryptionConfig,
  KdfParams,
  KeyRotationPolicy,
  HsmConfig,
  EncryptedEnvelope,

  // Retention Types
  RetentionPolicyConfig,
  RetentionScope,
  RetentionPeriod,
  RetentionAction,
  RetentionException,
  LegalHold,
  LegalHoldScope,

  // DLP Types
  DlpPolicy,
  DlpRule,
  DlpPattern,
  DlpAction,
  DlpActionType,
  DlpScope,
  DlpException,
  DlpScanResult,
  DlpPolicyMatch,
  DlpRuleMatch,
  DlpMatch,
  DlpDetectionType,
  SensitiveDataType,
  DlpActionTaken,

  // Compliance Types
  MessagingComplianceConfig,
  ComplianceFrameworkRef,
  EDiscoveryConfig,
  MessagingAuditConfig,
  MessagingAuditEvent,
  ComplianceExportConfig,
  ArchivalConfig,

  // Key Management Types
  KeyManagementConfig,
  KekPolicy,
  DekPolicy,
  KeyEscrowConfig,
  KeyBackupConfig,

  // Voice/Video Security Types
  MediaSecurityConfig,
  SrtpConfig,
  DtlsConfig,
  RecordingSecurityConfig,
  TranscriptionSecurityConfig,

  // Security Event Types
  MessagingSecurityEvent,
  MessagingSecurityEventType,
} from './types';

// =============================================================================
// ENCRYPTION SERVICE EXPORTS
// =============================================================================

export {
  EncryptionService,
  encryptionService,
  type EncryptionServiceConfig,
  type PublicKeyBundle,
  type X3DHKeyAgreementResult,
} from './encryption-service';

// =============================================================================
// DLP SERVICE EXPORTS
// =============================================================================

export {
  DlpService,
  dlpService,
  type DlpServiceConfig,
  type ScanContext,
  type SensitiveDataDetection,
  type SensitiveDataDetectionResult,
  type ValidationResult,
  type RedactionEntry,
  type RedactionResult,
  type ComplianceViolation,
  type ComplianceReport,
} from './dlp-service';

// =============================================================================
// OAUTH CREDENTIAL MANAGER EXPORTS
// =============================================================================

export {
  OAuthCredentialManager,
  oauthCredentialManager,
  type CredentialManagerConfig,
  type OAuthProvider,
  type OAuthCredential,
  type EncryptedToken,
  type CredentialStatus,
  type ProviderConfig,
  type ScopeDefinition,
  type RateLimitConfig,
  type AuthorizationState,
  type TokenRefreshResult,
  type CredentialAuditEvent,
  type CredentialEventType,
  type RateLimitStatus,
  type CredentialUsageReport,
} from './oauth-credential-manager';

// =============================================================================
// CONVENIENCE FACTORIES
// =============================================================================

import { EncryptionService, type EncryptionServiceConfig } from './encryption-service';
import { DlpService, type DlpServiceConfig } from './dlp-service';
import { OAuthCredentialManager, type CredentialManagerConfig } from './oauth-credential-manager';

/**
 * Create a complete messaging security stack.
 */
export function createMessagingSecurityStack(config: {
  encryption?: Partial<EncryptionServiceConfig>;
  dlp?: Partial<DlpServiceConfig>;
  oauth?: Partial<CredentialManagerConfig>;
} = {}): MessagingSecurityStack {
  return {
    encryption: new EncryptionService(config.encryption),
    dlp: new DlpService(config.dlp),
    oauth: new OAuthCredentialManager(config.oauth),
  };
}

export interface MessagingSecurityStack {
  encryption: EncryptionService;
  dlp: DlpService;
  oauth: OAuthCredentialManager;
}

// =============================================================================
// SECURITY PRESETS
// =============================================================================

/**
 * Pre-configured security levels for different use cases.
 */
export const MessagingSecurityPresets = {
  /**
   * Consumer messaging - balanced security and usability.
   */
  consumer: (): Partial<EncryptionServiceConfig> => ({
    e2eEnabled: true,
    atRest: {
      enabled: true,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2',
      kdfParams: {
        iterations: 100000,
        saltLength: 32,
      },
      keyRotation: {
        autoRotate: true,
        intervalDays: 90,
        retainPrevious: 2,
        reEncryptOnRotation: false,
      },
      envelopeEncryption: true,
      hsmEnabled: false,
    },
    maxSkippedKeys: 1000,
    preKeyRotationDays: 7,
    oneTimePreKeyPoolSize: 100,
  }),

  /**
   * Enterprise messaging - enhanced security and compliance.
   */
  enterprise: (): Partial<EncryptionServiceConfig> => ({
    e2eEnabled: true,
    atRest: {
      enabled: true,
      algorithm: 'AES-256-GCM',
      kdf: 'Argon2id',
      kdfParams: {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        saltLength: 32,
      },
      keyRotation: {
        autoRotate: true,
        intervalDays: 30,
        retainPrevious: 5,
        reEncryptOnRotation: true,
      },
      envelopeEncryption: true,
      hsmEnabled: true,
    },
    maxSkippedKeys: 500,
    preKeyRotationDays: 3,
    oneTimePreKeyPoolSize: 200,
  }),

  /**
   * Healthcare messaging - HIPAA compliant.
   */
  healthcare: (): Partial<EncryptionServiceConfig> => ({
    e2eEnabled: true,
    atRest: {
      enabled: true,
      algorithm: 'AES-256-GCM',
      kdf: 'Argon2id',
      kdfParams: {
        memoryCost: 131072,
        timeCost: 4,
        parallelism: 4,
        saltLength: 32,
      },
      keyRotation: {
        autoRotate: true,
        intervalDays: 30,
        retainPrevious: 10,
        reEncryptOnRotation: true,
      },
      envelopeEncryption: true,
      hsmEnabled: true,
    },
    keyManagement: {
      backend: 'hsm',
      kekPolicy: {
        algorithm: 'AES-256',
        rotationDays: 365,
        multiPartyControl: true,
        quorum: 2,
      },
      dekPolicy: {
        algorithm: 'AES-256-GCM',
        perMessageKeys: true,
        derivation: 'HKDF',
      },
      keyEscrow: {
        enabled: true,
        type: 'threshold',
        threshold: 3,
        totalShares: 5,
        custodians: [],
      },
      backup: {
        enabled: true,
        encrypted: true,
        destinations: ['cloud', 'offline'],
        frequencyHours: 24,
        retentionDays: 2555, // 7 years for HIPAA
      },
    },
    maxSkippedKeys: 500,
    preKeyRotationDays: 1,
    oneTimePreKeyPoolSize: 500,
  }),
};

/**
 * Pre-configured DLP policies for different industries.
 */
export const DlpPresets = {
  /**
   * Financial services DLP - PCI-DSS focused.
   */
  financial: (): Partial<DlpServiceConfig> => ({
    enabled: true,
    scanTimeoutMs: 3000,
    mlDetectionEnabled: true,
    logAllScans: true,
    defaultOnError: 'block',
  }),

  /**
   * Healthcare DLP - HIPAA focused.
   */
  healthcare: (): Partial<DlpServiceConfig> => ({
    enabled: true,
    scanTimeoutMs: 5000,
    mlDetectionEnabled: true,
    logAllScans: true,
    defaultOnError: 'quarantine',
  }),

  /**
   * Technology DLP - Secrets and IP protection.
   */
  technology: (): Partial<DlpServiceConfig> => ({
    enabled: true,
    scanTimeoutMs: 3000,
    mlDetectionEnabled: true,
    logAllScans: true,
    defaultOnError: 'quarantine',
  }),
};

// =============================================================================
// VERSION INFO
// =============================================================================

export const MESSAGING_SECURITY_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  name: 'Messaging Security Architecture',
  codename: 'Cipher',
  releaseDate: '2026-02-01',
  features: [
    'Signal Protocol E2E Encryption',
    'X3DH Key Agreement',
    'Double Ratchet Algorithm',
    'At-Rest Encryption with Envelope Encryption',
    'Data Loss Prevention (DLP)',
    'OAuth Credential Vault',
    'Automatic Token Refresh',
    'Compliance Reporting (HIPAA, SOC2, GDPR, PCI-DSS)',
    'Message Retention Policies',
    'Legal Hold Support',
    'eDiscovery Integration',
  ],
  standards: [
    'Signal Protocol',
    'OAuth 2.0',
    'OpenID Connect',
    'PKCE',
    'HIPAA',
    'SOC2',
    'GDPR',
    'PCI-DSS',
    'NIST SP 800-56A',
  ],
};
