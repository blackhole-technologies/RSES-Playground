/**
 * @file index.ts
 * @description Zero-Trust Security Architecture - Main Export Module.
 *              Provides a comprehensive, industry-leading security framework implementing:
 *              - AI-Powered Threat Detection
 *              - Quantum-Safe Cryptography
 *              - Attribute-Based Access Control (ABAC)
 *              - Self-Healing Security
 *              - Compliance Automation
 * @phase Phase 9 - Zero-Trust Security Enhancement
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Well-Architected Security Pillar, Google BeyondCorp, NIST CSF, OWASP ASVS L3
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type {
  // Security Context
  SecurityContext,
  IdentityContext,
  DeviceContext,
  NetworkContext,
  SessionContext,
  UserAttributes,
  GeoLocation,
  AsnInfo,
  ComplianceStatus,

  // Risk Assessment
  RiskScore,
  RiskLevel,
  RiskComponents,
  RiskFactor,
  RiskRecommendation,
  RiskAction,

  // Threat Detection
  ThreatDetectionEngine,
  ThreatDetectionResult,
  DetectedThreat,
  ThreatType,
  ThreatResponse,
  AnomalyIndicator,
  BehaviorAnalysis,
  BehaviorMetric,
  IndicatorOfCompromise,

  // Quantum-Safe Crypto
  QuantumSafeCryptoConfig,
  QuantumSafeKEM,
  QuantumSafeSignature,
  ClassicalAlgorithm,
  CryptoKey,
  KeyUsage,
  RotationPolicy,
  AlgorithmTransition,

  // ABAC
  AbacPolicy,
  PolicyTarget,
  PolicyRule,
  AttributeCondition,
  ConditionOperator,
  CombiningAlgorithm,
  PolicyObligation,
  AppliedPolicy,
  Permission,
  PermissionScope,
  TimeRestriction,
  EnvironmentCondition,

  // Self-Healing
  SelfHealingConfig,
  ResponsePolicy,
  TriggerCondition,
  TriggerType,
  AutoResponseAction,
  AutoResponseType,
  AutoScaleConfig,
  AutoBlockConfig,
  BlockThreshold,
  SessionRevocationConfig,
  ConfigAutoRepairConfig,
  NotificationChannel,
  GeoRestriction,

  // Compliance
  ComplianceConfig,
  ComplianceFramework,
  ComplianceFrameworkStatus,
  ComplianceControl,
  ComplianceEvidence,
  AutomatedComplianceConfig,
  ComplianceReportingConfig,
  PiaConfig,
  PiaTrigger,
  PiaTemplate,
  PiaSection,
  PiaQuestion,
  DataLineageConfig,
  DataCategory,
  RightToDeletionConfig,
  RetainedDataConfig,
  DeletionNotificationConfig,

  // Audit & Logging
  AuditEntry,
  AuditEventType,
  AuditCategory,
  AuditActor,
  AuditResource,

  // Security Events
  SecurityEvent,
  SecurityEventType,
  AffectedEntity,

  // Zero-Trust Verification
  VerificationResult,
  VerificationComponent,
  RequiredAction,

  // Authentication Types
  AuthenticationMethod,
  AuthStrength,
  ClearanceLevel,
  DeviceType,
  NetworkRiskIndicator,
} from './types';

// =============================================================================
// RISK ENGINE
// =============================================================================

export {
  RiskEngine,
  riskEngine,
  type RiskEngineConfig,
  type RiskThresholds,
  type ComponentWeights,
  type BehaviorAnalysisConfig,
  type AnomalyDetectionConfig,
  type ThreatIntelConfig,
  type BehavioralProfile,
  type HourDistribution,
  type LocationPattern,
  type DevicePattern,
  type ActionPattern,
  type RateBaseline,
  type ResourcePattern,
  type RiskHistoryEntry,
} from './risk-engine';

// =============================================================================
// QUANTUM-SAFE CRYPTOGRAPHY
// =============================================================================

export {
  QuantumCryptoManager,
  quantumCrypto,
  AlgorithmRegistry,
  KYBER_PARAMS,
  DILITHIUM_PARAMS,
  type KEMKeyPair,
  type SigningKeyPair,
  type HybridKeyPair,
  type EncapsulatedKey,
  type DigitalSignature,
  type HybridEncryptionResult,
  type AlgorithmInfo,
} from './quantum-crypto';

// =============================================================================
// ATTRIBUTE-BASED ACCESS CONTROL (ABAC)
// =============================================================================

export {
  AbacEngine,
  abacEngine,
  type AbacEngineConfig,
  type RiskThresholds as AbacRiskThresholds,
  type JitConfig,
  type ContinuousAuthConfig as AbacContinuousAuthConfig,
  type AccessRequest,
  type SubjectAttributes,
  type ResourceAttributes,
  type ActionAttributes,
  type EnvironmentAttributes,
  type AccessDecision,
  type RiskModification,
  type JitGrantRequest,
  type JitGrant,
  type StepUpRequirement,
} from './abac-engine';

// =============================================================================
// SELF-HEALING SECURITY
// =============================================================================

export {
  SelfHealingSecurityManager,
  selfHealingSecurity,
  type ActionResult,
  type RateLimitAdjustment,
  type BlockStatus,
  type SessionUpdateResult,
  type DriftCheckResult,
} from './self-healing';

// =============================================================================
// COMPLIANCE ENGINE
// =============================================================================

export {
  ComplianceEngine,
  complianceEngine,
  type DataLineageRecord,
  type DataSource,
  type LegalBasis,
  type DataTransformation,
  type DeletionRequest,
  type RequesterIdentity,
  type IdentityProof,
  type DeletionStatus,
  type AffectedSystem,
  type RetainedDataRecord,
  type DeletionCertificate,
  type DeletionSummary,
  type ComplianceCheckResult,
  type ComplianceFinding,
  type RemediationSuggestion,
  type PrivacyImpactAssessment,
  type PiaResponse,
  type PiaMitigation,
  type PiaReviewer,
  type ComplianceReport,
} from './compliance-engine';

// =============================================================================
// ZERO-TRUST ORCHESTRATOR
// =============================================================================

export {
  ZeroTrustOrchestrator,
  zeroTrust,
  createZeroTrustMiddleware,
  type ZeroTrustConfig,
  type VerificationConfig,
  type ContinuousAuthConfig,
  type MicroSegmentationConfig,
  type SegmentDefinition,
  type LeastPrivilegeConfig,
  type AuditConfig,
  type AccessToken,
  type TokenVerificationResult,
  type SecurityPosture,
} from './zero-trust';

// =============================================================================
// CONVENIENCE FACTORIES
// =============================================================================

import { ZeroTrustOrchestrator, type ZeroTrustConfig } from './zero-trust';
import { RiskEngine, type RiskEngineConfig } from './risk-engine';
import { QuantumCryptoManager, type QuantumSafeCryptoConfig } from './quantum-crypto';
import { AbacEngine, type AbacEngineConfig } from './abac-engine';
import { SelfHealingSecurityManager, type SelfHealingConfig } from './self-healing';
import { ComplianceEngine, type ComplianceConfig } from './compliance-engine';

/**
 * Create a complete zero-trust security stack.
 */
export function createSecurityStack(config: {
  zeroTrust?: Partial<ZeroTrustConfig>;
  risk?: Partial<RiskEngineConfig>;
  crypto?: Partial<QuantumSafeCryptoConfig>;
  abac?: Partial<AbacEngineConfig>;
  selfHealing?: Partial<SelfHealingConfig>;
  compliance?: Partial<ComplianceConfig>;
} = {}): SecurityStack {
  return {
    zeroTrust: new ZeroTrustOrchestrator(config.zeroTrust),
    riskEngine: new RiskEngine(config.risk),
    quantumCrypto: new QuantumCryptoManager(config.crypto),
    abacEngine: new AbacEngine(config.abac),
    selfHealing: new SelfHealingSecurityManager(config.selfHealing),
    compliance: new ComplianceEngine(config.compliance),
  };
}

export interface SecurityStack {
  zeroTrust: ZeroTrustOrchestrator;
  riskEngine: RiskEngine;
  quantumCrypto: QuantumCryptoManager;
  abacEngine: AbacEngine;
  selfHealing: SelfHealingSecurityManager;
  compliance: ComplianceEngine;
}

// =============================================================================
// SECURITY PRESETS
// =============================================================================

/**
 * Pre-configured security levels for different deployment scenarios.
 */
export const SecurityPresets = {
  /**
   * Development preset - relaxed security for local development.
   */
  development: (): Partial<ZeroTrustConfig> => ({
    enabled: true,
    verification: {
      verifyEveryRequest: false,
      cacheTtlSeconds: 300,
      requiredComponents: ['identity'],
      minConfidenceThreshold: 0.5,
    },
    continuousAuth: {
      enabled: false,
      checkIntervalSeconds: 3600,
      reVerifyOn: [],
    },
    audit: {
      enabled: true,
      auditAllRequests: false,
      sensitiveActions: ['admin'],
      retentionDays: 7,
      siemIntegration: false,
    },
  }),

  /**
   * Production preset - balanced security and usability.
   */
  production: (): Partial<ZeroTrustConfig> => ({
    enabled: true,
    verification: {
      verifyEveryRequest: true,
      cacheTtlSeconds: 60,
      requiredComponents: ['identity', 'device', 'network', 'behavior'],
      minConfidenceThreshold: 0.7,
    },
    continuousAuth: {
      enabled: true,
      checkIntervalSeconds: 300,
      reVerifyOn: ['sensitive_action', 'risk_increase', 'location_change'],
    },
    audit: {
      enabled: true,
      auditAllRequests: true,
      sensitiveActions: ['delete', 'admin', 'config_change', 'user_management'],
      retentionDays: 365,
      siemIntegration: true,
    },
  }),

  /**
   * High security preset - maximum protection for sensitive environments.
   */
  highSecurity: (): Partial<ZeroTrustConfig> => ({
    enabled: true,
    verification: {
      verifyEveryRequest: true,
      cacheTtlSeconds: 30,
      requiredComponents: ['identity', 'device', 'network', 'behavior', 'context'],
      minConfidenceThreshold: 0.85,
    },
    continuousAuth: {
      enabled: true,
      checkIntervalSeconds: 60,
      reVerifyOn: ['sensitive_action', 'risk_increase', 'time_elapsed', 'location_change', 'device_change'],
    },
    microSegmentation: {
      enabled: true,
      defaultPolicy: 'deny',
      segments: [],
    },
    leastPrivilege: {
      enabled: true,
      defaultDurationMinutes: 30,
      requireJustification: true,
      autoRevokeUnusedMinutes: 15,
    },
    audit: {
      enabled: true,
      auditAllRequests: true,
      sensitiveActions: ['read', 'write', 'delete', 'admin', 'config_change', 'user_management'],
      retentionDays: 730,
      siemIntegration: true,
    },
  }),

  /**
   * Compliance-focused preset - emphasizes regulatory compliance.
   */
  compliant: (): Partial<ZeroTrustConfig> => ({
    enabled: true,
    verification: {
      verifyEveryRequest: true,
      cacheTtlSeconds: 60,
      requiredComponents: ['identity', 'device', 'network', 'behavior'],
      minConfidenceThreshold: 0.75,
    },
    continuousAuth: {
      enabled: true,
      checkIntervalSeconds: 180,
      reVerifyOn: ['sensitive_action', 'risk_increase'],
    },
    audit: {
      enabled: true,
      auditAllRequests: true,
      sensitiveActions: ['read', 'write', 'delete', 'admin', 'config_change', 'user_management', 'data_access', 'export'],
      retentionDays: 2555, // 7 years for compliance
      siemIntegration: true,
    },
  }),
};

// =============================================================================
// MESSAGING SECURITY MODULE
// =============================================================================

export {
  // Encryption Service
  EncryptionService,
  encryptionService,
  type EncryptionServiceConfig,
  type PublicKeyBundle,
  type X3DHKeyAgreementResult,

  // DLP Service
  DlpService,
  dlpService,
  type DlpServiceConfig,
  type ScanContext,
  type SensitiveDataDetection,
  type SensitiveDataDetectionResult,
  type RedactionResult,
  type ComplianceReport as DlpComplianceReport,

  // OAuth Credential Manager
  OAuthCredentialManager,
  oauthCredentialManager,
  type CredentialManagerConfig,
  type OAuthProvider,
  type OAuthCredential,
  type CredentialStatus,
  type ProviderConfig,
  type RateLimitStatus,
  type CredentialUsageReport,

  // Factory & Presets
  createMessagingSecurityStack,
  type MessagingSecurityStack,
  MessagingSecurityPresets,
  DlpPresets,
  MESSAGING_SECURITY_VERSION,
} from './messaging';

// =============================================================================
// MULTI-SITE SECURITY MODULE
// =============================================================================

export {
  // Tenant Isolation Service
  TenantIsolationService,
  tenantIsolation,
  type TenantIsolationConfig,
  type IsolationValidationResult,

  // Types
  type Tenant,
  type Site,
  type TenantConfig,
  type SiteConfig,
  type TenantSecurityConfig,
  type SiteSecurityConfig,
  type IsolationContext,
  type CrossSiteAccessPolicy,
  type SiteAuditEvent,
  type SecurityIncident,
  type SiteEncryptionKey,
  type KeyRotationEvent,

  // Factory & Presets
  createMultiSiteSecurityStack,
  type MultiSiteSecurityStack,
  IsolationPresets,
  TenantTypePresets,

  // Helpers
  createTenantSlug,
  createSiteSlug,
  isValidDomain,
  isValidCidr,
  MULTISITE_SECURITY_VERSION,
} from './multisite';

// =============================================================================
// VERSION INFO
// =============================================================================

export const SECURITY_VERSION = {
  major: 1,
  minor: 1,
  patch: 0,
  name: 'Zero-Trust Security Architecture',
  codename: 'Citadel',
  releaseDate: '2026-02-01',
  modules: [
    'Zero-Trust Core',
    'AI-Powered Threat Detection',
    'Quantum-Safe Cryptography',
    'ABAC Engine',
    'Self-Healing Security',
    'Compliance Automation',
    'Messaging Security (E2E, DLP, OAuth)',
    'Multi-Site Security (Tenant Isolation)',
  ],
  standards: [
    'AWS Well-Architected Security Pillar',
    'Google BeyondCorp',
    'NIST Cybersecurity Framework 1.1',
    'OWASP ASVS Level 3',
    'NIST SP 800-207 (Zero Trust)',
    'NIST PQC Standards (FIPS 203/204)',
    'Signal Protocol',
    'OAuth 2.0 / OpenID Connect',
    'AWS Multi-Tenancy Best Practices',
    'GDPR',
    'CCPA',
    'HIPAA',
    'SOC2',
    'PCI-DSS',
  ],
};
