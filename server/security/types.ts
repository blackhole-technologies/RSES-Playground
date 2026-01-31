/**
 * @file types.ts
 * @description Core type definitions for the Zero-Trust Security Architecture.
 *              Defines interfaces for AI-powered threat detection, quantum-safe crypto,
 *              ABAC, self-healing security, and compliance automation.
 * @phase Phase 9 - Zero-Trust Security Enhancement
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Well-Architected Security Pillar, Google BeyondCorp, NIST CSF, OWASP ASVS L3
 */

// =============================================================================
// CORE SECURITY CONTEXT
// =============================================================================

/**
 * Security context that travels with every request through the system.
 * Implements zero-trust principle: never trust, always verify.
 */
export interface SecurityContext {
  /** Unique request identifier for tracing */
  requestId: string;
  /** Timestamp when context was created */
  timestamp: Date;
  /** Identity context if authenticated */
  identity?: IdentityContext;
  /** Device/client context */
  device: DeviceContext;
  /** Network context */
  network: NetworkContext;
  /** Current risk assessment */
  riskScore: RiskScore;
  /** Applied access policies */
  policies: AppliedPolicy[];
  /** Audit trail for this request */
  auditTrail: AuditEntry[];
}

/**
 * Identity context after authentication.
 */
export interface IdentityContext {
  /** User ID */
  userId: string;
  /** User's principal name */
  principal: string;
  /** Authentication method used */
  authMethod: AuthenticationMethod;
  /** Authentication strength level */
  authStrength: AuthStrength;
  /** Session information */
  session: SessionContext;
  /** User attributes for ABAC */
  attributes: UserAttributes;
  /** Groups/roles the user belongs to */
  groups: string[];
  /** Permissions granted */
  permissions: Permission[];
  /** Time of last authentication */
  lastAuthenticated: Date;
  /** Whether MFA was used */
  mfaVerified: boolean;
}

export type AuthenticationMethod =
  | 'password'
  | 'mfa_totp'
  | 'mfa_webauthn'
  | 'mfa_sms'
  | 'sso_saml'
  | 'sso_oidc'
  | 'api_key'
  | 'jwt'
  | 'certificate'
  | 'biometric';

export type AuthStrength = 'low' | 'medium' | 'high' | 'very_high';

/**
 * Session context information.
 */
export interface SessionContext {
  /** Session ID */
  sessionId: string;
  /** When session was created */
  createdAt: Date;
  /** Last activity time */
  lastActivity: Date;
  /** Session expiration time */
  expiresAt: Date;
  /** Whether session is bound to device */
  deviceBound: boolean;
  /** IP address at session creation */
  initialIp: string;
  /** Whether session was elevated via step-up auth */
  elevated: boolean;
  /** Elevation expiration if elevated */
  elevationExpires?: Date;
}

/**
 * User attributes for Attribute-Based Access Control (ABAC).
 */
export interface UserAttributes {
  /** Department */
  department?: string;
  /** Job title/role */
  title?: string;
  /** Clearance level */
  clearanceLevel?: ClearanceLevel;
  /** Geographic location */
  location?: string;
  /** Cost center */
  costCenter?: string;
  /** Manager chain */
  managerChain?: string[];
  /** Custom attributes */
  custom: Record<string, string | number | boolean | string[]>;
}

export type ClearanceLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';

/**
 * Device context for continuous verification.
 */
export interface DeviceContext {
  /** Device fingerprint */
  fingerprint: string;
  /** Device type */
  type: DeviceType;
  /** Operating system */
  os: string;
  /** Browser/client info */
  client: string;
  /** Whether device is managed/corporate */
  managed: boolean;
  /** Device trust score */
  trustScore: number;
  /** Last security check time */
  lastSecurityCheck?: Date;
  /** Device compliance status */
  complianceStatus: ComplianceStatus;
  /** Known device from user history */
  knownDevice: boolean;
}

export type DeviceType = 'desktop' | 'laptop' | 'mobile' | 'tablet' | 'server' | 'iot' | 'unknown';

export interface ComplianceStatus {
  /** Whether device meets security requirements */
  compliant: boolean;
  /** Specific compliance checks */
  checks: {
    osUpdated: boolean;
    antivirusEnabled: boolean;
    firewallEnabled: boolean;
    diskEncrypted: boolean;
    screenLockEnabled: boolean;
  };
  /** Compliance check timestamp */
  checkedAt: Date;
}

/**
 * Network context for zero-trust verification.
 */
export interface NetworkContext {
  /** Client IP address */
  ipAddress: string;
  /** Whether IP is from known VPN */
  vpnDetected: boolean;
  /** Whether IP is from known proxy */
  proxyDetected: boolean;
  /** Whether IP is from Tor exit node */
  torDetected: boolean;
  /** GeoIP information */
  geoLocation: GeoLocation;
  /** ASN information */
  asn: AsnInfo;
  /** Whether connection is from trusted network */
  trustedNetwork: boolean;
  /** Network risk indicators */
  riskIndicators: NetworkRiskIndicator[];
}

export interface GeoLocation {
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export interface AsnInfo {
  number: number;
  name: string;
  type: 'isp' | 'hosting' | 'business' | 'education' | 'government';
}

export type NetworkRiskIndicator =
  | 'known_bad_ip'
  | 'datacenter_ip'
  | 'residential_proxy'
  | 'vpn_detected'
  | 'tor_exit'
  | 'unusual_geolocation'
  | 'impossible_travel'
  | 'new_location';

// =============================================================================
// RISK SCORING & THREAT DETECTION
// =============================================================================

/**
 * Comprehensive risk score calculated from multiple factors.
 */
export interface RiskScore {
  /** Overall risk score (0-100) */
  overall: number;
  /** Risk level classification */
  level: RiskLevel;
  /** Component scores */
  components: RiskComponents;
  /** Factors that contributed to the score */
  factors: RiskFactor[];
  /** Recommended actions based on risk */
  recommendations: RiskRecommendation[];
  /** When score was calculated */
  calculatedAt: Date;
  /** Whether additional verification is required */
  requiresVerification: boolean;
}

export type RiskLevel = 'minimal' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskComponents {
  /** Identity-based risk */
  identity: number;
  /** Device-based risk */
  device: number;
  /** Network-based risk */
  network: number;
  /** Behavioral risk */
  behavior: number;
  /** Context/time-based risk */
  context: number;
  /** Historical risk */
  historical: number;
}

export interface RiskFactor {
  /** Factor identifier */
  id: string;
  /** Factor category */
  category: 'identity' | 'device' | 'network' | 'behavior' | 'context';
  /** Factor name */
  name: string;
  /** Description */
  description: string;
  /** Impact on risk score */
  impact: number;
  /** Whether this is a positive (reducing) or negative (increasing) factor */
  direction: 'positive' | 'negative';
  /** Confidence in this factor */
  confidence: number;
}

export interface RiskRecommendation {
  /** Recommendation ID */
  id: string;
  /** Action to take */
  action: RiskAction;
  /** Reason for recommendation */
  reason: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Whether action is mandatory */
  mandatory: boolean;
}

export type RiskAction =
  | 'allow'
  | 'allow_with_logging'
  | 'require_mfa'
  | 'require_reauthentication'
  | 'require_device_check'
  | 'require_admin_approval'
  | 'limit_access'
  | 'deny'
  | 'block_and_alert';

// =============================================================================
// AI-POWERED THREAT DETECTION
// =============================================================================

/**
 * AI/ML-based threat detection engine interface.
 */
export interface ThreatDetectionEngine {
  /** Engine identifier */
  id: string;
  /** Engine name */
  name: string;
  /** Detection capabilities */
  capabilities: ThreatDetectionCapability[];
  /** Model version */
  modelVersion: string;
  /** Last model update */
  lastUpdated: Date;
  /** Detection statistics */
  stats: ThreatDetectionStats;
}

export type ThreatDetectionCapability =
  | 'behavioral_analysis'
  | 'anomaly_detection'
  | 'pattern_recognition'
  | 'predictive_modeling'
  | 'credential_stuffing_detection'
  | 'account_takeover_detection'
  | 'bot_detection'
  | 'api_abuse_detection'
  | 'data_exfiltration_detection'
  | 'privilege_escalation_detection';

export interface ThreatDetectionStats {
  /** Total threats detected */
  threatsDetected: number;
  /** False positive rate */
  falsePositiveRate: number;
  /** Detection latency (ms) */
  avgLatencyMs: number;
  /** Last 24h detections */
  last24hDetections: number;
}

/**
 * Threat detection result.
 */
export interface ThreatDetectionResult {
  /** Detection ID */
  detectionId: string;
  /** Timestamp */
  timestamp: Date;
  /** Whether a threat was detected */
  threatDetected: boolean;
  /** Threat details if detected */
  threat?: DetectedThreat;
  /** Anomaly indicators */
  anomalies: AnomalyIndicator[];
  /** Behavioral analysis results */
  behaviorAnalysis: BehaviorAnalysis;
  /** Confidence score (0-1) */
  confidence: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface DetectedThreat {
  /** Threat ID */
  id: string;
  /** Threat type */
  type: ThreatType;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description */
  description: string;
  /** Attack vector */
  attackVector?: string;
  /** MITRE ATT&CK technique if applicable */
  mitreAttackId?: string;
  /** Indicators of compromise */
  iocs: IndicatorOfCompromise[];
  /** Recommended response */
  response: ThreatResponse;
}

export type ThreatType =
  | 'credential_stuffing'
  | 'account_takeover'
  | 'brute_force'
  | 'session_hijacking'
  | 'api_abuse'
  | 'data_exfiltration'
  | 'injection_attack'
  | 'privilege_escalation'
  | 'insider_threat'
  | 'bot_activity'
  | 'ddos'
  | 'zero_day';

export interface IndicatorOfCompromise {
  /** IOC type */
  type: 'ip' | 'domain' | 'hash' | 'email' | 'pattern' | 'behavior';
  /** IOC value */
  value: string;
  /** Confidence */
  confidence: number;
  /** Source */
  source: string;
}

export interface ThreatResponse {
  /** Immediate action */
  immediateAction: 'block' | 'challenge' | 'monitor' | 'alert';
  /** Whether to auto-remediate */
  autoRemediate: boolean;
  /** Remediation steps */
  remediationSteps: string[];
  /** Whether to escalate */
  escalate: boolean;
  /** Escalation target */
  escalateTo?: string;
}

export interface AnomalyIndicator {
  /** Anomaly type */
  type: string;
  /** Score (0-1, higher = more anomalous) */
  score: number;
  /** Baseline value */
  baseline: number;
  /** Observed value */
  observed: number;
  /** Standard deviations from baseline */
  deviation: number;
  /** Description */
  description: string;
}

export interface BehaviorAnalysis {
  /** User behavior profile ID */
  profileId: string;
  /** Overall behavior score (0-1, lower = more suspicious) */
  normalcyScore: number;
  /** Specific behavior metrics */
  metrics: BehaviorMetric[];
  /** Risk indicators from behavior */
  riskIndicators: string[];
  /** Whether behavior matches historical patterns */
  matchesHistory: boolean;
}

export interface BehaviorMetric {
  /** Metric name */
  name: string;
  /** Expected value */
  expected: number;
  /** Observed value */
  observed: number;
  /** Whether this is anomalous */
  anomalous: boolean;
  /** Contribution to overall score */
  weight: number;
}

// =============================================================================
// QUANTUM-SAFE CRYPTOGRAPHY
// =============================================================================

/**
 * Quantum-safe cryptography configuration and interfaces.
 */
export interface QuantumSafeCryptoConfig {
  /** Enable quantum-safe algorithms */
  enabled: boolean;
  /** Key exchange algorithm */
  keyExchange: QuantumSafeKEM;
  /** Digital signature algorithm */
  signature: QuantumSafeSignature;
  /** Use hybrid mode (classical + post-quantum) */
  hybridMode: boolean;
  /** Classical algorithm for hybrid mode */
  classicalAlgorithm?: ClassicalAlgorithm;
  /** Enable crypto-agility */
  cryptoAgility: boolean;
  /** Allowed algorithm transitions */
  allowedTransitions: AlgorithmTransition[];
}

export type QuantumSafeKEM =
  | 'CRYSTALS-Kyber-512'
  | 'CRYSTALS-Kyber-768'
  | 'CRYSTALS-Kyber-1024'
  | 'NTRU-HPS-2048-509'
  | 'NTRU-HPS-4096-821'
  | 'SABER-Light'
  | 'SABER-Main'
  | 'SABER-Fire';

export type QuantumSafeSignature =
  | 'CRYSTALS-Dilithium2'
  | 'CRYSTALS-Dilithium3'
  | 'CRYSTALS-Dilithium5'
  | 'Falcon-512'
  | 'Falcon-1024'
  | 'SPHINCS+-128f'
  | 'SPHINCS+-192f'
  | 'SPHINCS+-256f';

export type ClassicalAlgorithm =
  | 'RSA-4096'
  | 'ECDH-P384'
  | 'ECDH-P521'
  | 'Ed25519'
  | 'Ed448';

export interface AlgorithmTransition {
  /** Current algorithm */
  from: string;
  /** Target algorithm */
  to: string;
  /** Transition deadline */
  deadline: Date;
  /** Whether transition is mandatory */
  mandatory: boolean;
}

/**
 * Cryptographic key information.
 */
export interface CryptoKey {
  /** Key identifier */
  keyId: string;
  /** Key type */
  type: 'symmetric' | 'asymmetric_public' | 'asymmetric_private';
  /** Algorithm */
  algorithm: string;
  /** Key usage */
  usage: KeyUsage[];
  /** Creation time */
  createdAt: Date;
  /** Expiration time */
  expiresAt: Date;
  /** Rotation schedule */
  rotationPolicy: RotationPolicy;
  /** Key status */
  status: 'active' | 'pending_rotation' | 'deprecated' | 'compromised';
}

export type KeyUsage =
  | 'sign'
  | 'verify'
  | 'encrypt'
  | 'decrypt'
  | 'wrap'
  | 'unwrap'
  | 'derive';

export interface RotationPolicy {
  /** Enable automatic rotation */
  autoRotate: boolean;
  /** Rotation interval in days */
  intervalDays: number;
  /** Number of previous keys to retain */
  retainPrevious: number;
  /** Notify before rotation (days) */
  notifyBeforeDays: number;
}

// =============================================================================
// ATTRIBUTE-BASED ACCESS CONTROL (ABAC)
// =============================================================================

/**
 * ABAC policy definition.
 */
export interface AbacPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Policy description */
  description: string;
  /** Policy version */
  version: number;
  /** Target resources */
  target: PolicyTarget;
  /** Policy rules */
  rules: PolicyRule[];
  /** Combining algorithm */
  combiningAlgorithm: CombiningAlgorithm;
  /** Obligations */
  obligations: PolicyObligation[];
  /** Policy priority */
  priority: number;
  /** Whether policy is enabled */
  enabled: boolean;
}

export interface PolicyTarget {
  /** Resource type */
  resourceType: string;
  /** Resource pattern (e.g., "/api/configs/*") */
  resourcePattern: string;
  /** Required actions */
  actions: string[];
  /** Environmental conditions */
  environment?: EnvironmentCondition[];
}

export interface EnvironmentCondition {
  /** Condition attribute */
  attribute: string;
  /** Condition operator */
  operator: ConditionOperator;
  /** Condition value */
  value: unknown;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'matches_regex'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export interface PolicyRule {
  /** Rule ID */
  id: string;
  /** Rule description */
  description: string;
  /** Subject conditions (who) */
  subject: AttributeCondition[];
  /** Resource conditions (what) */
  resource: AttributeCondition[];
  /** Action conditions (how) */
  action: AttributeCondition[];
  /** Environment conditions (when/where) */
  environment: AttributeCondition[];
  /** Rule effect */
  effect: 'permit' | 'deny';
  /** Rule priority */
  priority: number;
}

export interface AttributeCondition {
  /** Attribute category */
  category: 'subject' | 'resource' | 'action' | 'environment';
  /** Attribute name */
  attribute: string;
  /** Condition operator */
  operator: ConditionOperator;
  /** Expected value */
  value: unknown;
  /** Whether condition is optional */
  optional?: boolean;
}

export type CombiningAlgorithm =
  | 'deny_overrides'
  | 'permit_overrides'
  | 'first_applicable'
  | 'only_one_applicable'
  | 'deny_unless_permit'
  | 'permit_unless_deny';

export interface PolicyObligation {
  /** Obligation ID */
  id: string;
  /** When to apply */
  fulfillOn: 'permit' | 'deny';
  /** Obligation action */
  action: string;
  /** Action parameters */
  parameters: Record<string, unknown>;
}

/**
 * Applied policy result for a specific request.
 */
export interface AppliedPolicy {
  /** Policy ID */
  policyId: string;
  /** Policy name */
  policyName: string;
  /** Decision made */
  decision: 'permit' | 'deny' | 'not_applicable' | 'indeterminate';
  /** Matched rules */
  matchedRules: string[];
  /** Obligations to fulfill */
  obligations: PolicyObligation[];
  /** Evaluation time in ms */
  evaluationTimeMs: number;
}

/**
 * Permission definition.
 */
export interface Permission {
  /** Permission ID */
  id: string;
  /** Resource type */
  resource: string;
  /** Allowed actions */
  actions: string[];
  /** Scope restrictions */
  scope?: PermissionScope;
  /** Time-based restrictions */
  timeRestrictions?: TimeRestriction;
  /** Granted by */
  grantedBy: 'role' | 'group' | 'direct' | 'jit';
  /** Grant expiration */
  expiresAt?: Date;
}

export interface PermissionScope {
  /** Scope type */
  type: 'own' | 'team' | 'department' | 'organization' | 'global';
  /** Specific scope identifier */
  identifier?: string;
}

export interface TimeRestriction {
  /** Allowed days of week (0-6, Sunday = 0) */
  allowedDays?: number[];
  /** Allowed hours (0-23) */
  allowedHours?: { start: number; end: number };
  /** Timezone */
  timezone?: string;
}

// =============================================================================
// SELF-HEALING SECURITY
// =============================================================================

/**
 * Self-healing security configuration.
 */
export interface SelfHealingConfig {
  /** Enable self-healing */
  enabled: boolean;
  /** Response policies */
  responsePolicies: ResponsePolicy[];
  /** Auto-scaling rate limits */
  autoScaleRateLimits: AutoScaleConfig;
  /** Automatic IP blocking */
  autoBlockConfig: AutoBlockConfig;
  /** Session revocation on anomaly */
  sessionRevocation: SessionRevocationConfig;
  /** Configuration auto-repair */
  configAutoRepair: ConfigAutoRepairConfig;
}

export interface ResponsePolicy {
  /** Policy ID */
  id: string;
  /** Trigger condition */
  trigger: TriggerCondition;
  /** Actions to take */
  actions: AutoResponseAction[];
  /** Cooldown period in seconds */
  cooldownSeconds: number;
  /** Maximum times to trigger */
  maxTriggers: number;
  /** Whether to notify on trigger */
  notify: boolean;
  /** Notification channels */
  notifyChannels: NotificationChannel[];
}

export interface TriggerCondition {
  /** Condition type */
  type: TriggerType;
  /** Threshold value */
  threshold: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Additional parameters */
  parameters?: Record<string, unknown>;
}

export type TriggerType =
  | 'failed_auth_attempts'
  | 'rate_limit_exceeded'
  | 'anomaly_score_threshold'
  | 'threat_detected'
  | 'error_rate_threshold'
  | 'latency_threshold'
  | 'unusual_data_access'
  | 'privilege_escalation_attempt'
  | 'configuration_drift';

export interface AutoResponseAction {
  /** Action type */
  type: AutoResponseType;
  /** Action parameters */
  parameters: Record<string, unknown>;
  /** Delay before action (seconds) */
  delaySeconds?: number;
  /** Action duration (for temporary actions) */
  durationSeconds?: number;
  /** Rollback action if needed */
  rollbackAction?: AutoResponseType;
}

export type AutoResponseType =
  | 'block_ip'
  | 'revoke_session'
  | 'disable_user'
  | 'require_mfa'
  | 'reduce_rate_limit'
  | 'enable_captcha'
  | 'quarantine_resource'
  | 'isolate_endpoint'
  | 'rotate_credentials'
  | 'restore_configuration'
  | 'scale_up_defenses'
  | 'notify_security_team'
  | 'create_incident';

export type NotificationChannel =
  | 'email'
  | 'sms'
  | 'slack'
  | 'pagerduty'
  | 'opsgenie'
  | 'webhook'
  | 'siem';

export interface AutoScaleConfig {
  /** Enable auto-scaling rate limits */
  enabled: boolean;
  /** Baseline rate limit */
  baselineLimit: number;
  /** Minimum rate limit */
  minLimit: number;
  /** Maximum rate limit */
  maxLimit: number;
  /** Scale up threshold (CPU/load percentage) */
  scaleUpThreshold: number;
  /** Scale down threshold */
  scaleDownThreshold: number;
  /** Cool down period between adjustments (seconds) */
  cooldownSeconds: number;
}

export interface AutoBlockConfig {
  /** Enable automatic IP blocking */
  enabled: boolean;
  /** ML model for blocking decisions */
  useMLModel: boolean;
  /** Thresholds for different block durations */
  thresholds: BlockThreshold[];
  /** Whitelist (never block) */
  whitelist: string[];
  /** Geographic restrictions */
  geoRestrictions?: GeoRestriction[];
}

export interface BlockThreshold {
  /** Number of violations */
  violations: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Block duration in seconds */
  blockDurationSeconds: number;
  /** Block type */
  blockType: 'soft' | 'hard';
}

export interface GeoRestriction {
  /** Country code */
  countryCode: string;
  /** Restriction type */
  type: 'allow' | 'block' | 'challenge';
}

export interface SessionRevocationConfig {
  /** Enable automatic session revocation */
  enabled: boolean;
  /** Revoke on anomaly score threshold */
  anomalyThreshold: number;
  /** Revoke on impossible travel */
  revokeOnImpossibleTravel: boolean;
  /** Revoke on device change */
  revokeOnDeviceChange: boolean;
  /** Revoke on privilege escalation attempt */
  revokeOnPrivilegeEscalation: boolean;
  /** Grace period before revocation (seconds) */
  gracePeriodSeconds: number;
}

export interface ConfigAutoRepairConfig {
  /** Enable configuration auto-repair */
  enabled: boolean;
  /** Configuration drift detection interval (seconds) */
  driftCheckIntervalSeconds: number;
  /** Auto-repair on drift */
  autoRepairOnDrift: boolean;
  /** Notify on drift */
  notifyOnDrift: boolean;
  /** Backup configuration before repair */
  backupBeforeRepair: boolean;
}

// =============================================================================
// COMPLIANCE AUTOMATION
// =============================================================================

/**
 * Compliance framework configuration.
 */
export interface ComplianceConfig {
  /** Enabled compliance frameworks */
  frameworks: ComplianceFramework[];
  /** Automated compliance checking */
  automatedChecking: AutomatedComplianceConfig;
  /** Privacy impact assessment config */
  privacyImpactAssessment: PiaConfig;
  /** Data lineage tracking */
  dataLineage: DataLineageConfig;
  /** Right to deletion automation */
  rightToDeletion: RightToDeletionConfig;
}

export interface ComplianceFramework {
  /** Framework ID */
  id: string;
  /** Framework name */
  name: string;
  /** Framework version */
  version: string;
  /** Framework type */
  type: 'privacy' | 'security' | 'industry' | 'regulatory';
  /** Enabled controls */
  controls: ComplianceControl[];
  /** Last assessment date */
  lastAssessment?: Date;
  /** Compliance status */
  status: ComplianceFrameworkStatus;
}

export type ComplianceFrameworkStatus =
  | 'compliant'
  | 'partially_compliant'
  | 'non_compliant'
  | 'not_assessed'
  | 'in_progress';

export interface ComplianceControl {
  /** Control ID */
  id: string;
  /** Control name */
  name: string;
  /** Control description */
  description: string;
  /** Control category */
  category: string;
  /** Implementation status */
  status: 'implemented' | 'partial' | 'not_implemented' | 'not_applicable';
  /** Evidence */
  evidence: ComplianceEvidence[];
  /** Last tested */
  lastTested?: Date;
  /** Test result */
  testResult?: 'pass' | 'fail' | 'warning';
}

export interface ComplianceEvidence {
  /** Evidence type */
  type: 'document' | 'log' | 'configuration' | 'screenshot' | 'attestation';
  /** Evidence description */
  description: string;
  /** Evidence location/reference */
  reference: string;
  /** Collection date */
  collectedAt: Date;
  /** Validity period */
  validUntil?: Date;
}

export interface AutomatedComplianceConfig {
  /** Enable automated compliance checking */
  enabled: boolean;
  /** Check schedule (cron expression) */
  schedule: string;
  /** Controls to check automatically */
  autoCheckControls: string[];
  /** Remediation suggestions */
  suggestRemediation: boolean;
  /** Auto-remediate low-risk issues */
  autoRemediateLowRisk: boolean;
  /** Reporting configuration */
  reporting: ComplianceReportingConfig;
}

export interface ComplianceReportingConfig {
  /** Generate automated reports */
  generateReports: boolean;
  /** Report schedule (cron expression) */
  schedule: string;
  /** Report formats */
  formats: ('pdf' | 'json' | 'csv' | 'html')[];
  /** Report recipients */
  recipients: string[];
  /** Retention period in days */
  retentionDays: number;
}

export interface PiaConfig {
  /** Enable PIA automation */
  enabled: boolean;
  /** PIA triggers */
  triggers: PiaTrigger[];
  /** PIA template */
  template: PiaTemplate;
  /** Auto-generate preliminary PIAs */
  autoGeneratePreliminary: boolean;
}

export interface PiaTrigger {
  /** Trigger type */
  type: 'new_processing' | 'data_type_change' | 'scope_change' | 'technology_change' | 'risk_threshold';
  /** Trigger parameters */
  parameters: Record<string, unknown>;
}

export interface PiaTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Required sections */
  sections: PiaSection[];
}

export interface PiaSection {
  /** Section ID */
  id: string;
  /** Section title */
  title: string;
  /** Section questions */
  questions: PiaQuestion[];
  /** Required for completion */
  required: boolean;
}

export interface PiaQuestion {
  /** Question ID */
  id: string;
  /** Question text */
  text: string;
  /** Question type */
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'rating';
  /** Options for select/multiselect */
  options?: string[];
  /** Whether question is required */
  required: boolean;
  /** Help text */
  helpText?: string;
}

export interface DataLineageConfig {
  /** Enable data lineage tracking */
  enabled: boolean;
  /** Track field-level lineage */
  fieldLevel: boolean;
  /** Retention period for lineage data (days) */
  retentionDays: number;
  /** Tracked data categories */
  trackedCategories: DataCategory[];
  /** Visualization enabled */
  visualizationEnabled: boolean;
}

export type DataCategory =
  | 'pii'
  | 'phi'
  | 'financial'
  | 'credentials'
  | 'biometric'
  | 'location'
  | 'behavioral'
  | 'preference'
  | 'technical';

export interface RightToDeletionConfig {
  /** Enable automated right to deletion */
  enabled: boolean;
  /** Verification required before deletion */
  verificationRequired: boolean;
  /** Verification method */
  verificationMethod: 'email' | 'phone' | 'id_document' | 'multi_factor';
  /** Grace period before deletion (days) */
  gracePeriodDays: number;
  /** Data to retain after deletion */
  retainedData: RetainedDataConfig[];
  /** Notification configuration */
  notifications: DeletionNotificationConfig;
}

export interface RetainedDataConfig {
  /** Data type */
  dataType: string;
  /** Retention reason */
  reason: 'legal_obligation' | 'contractual' | 'legitimate_interest';
  /** Retention period (days) */
  retentionDays: number;
  /** Legal basis */
  legalBasis: string;
}

export interface DeletionNotificationConfig {
  /** Notify user on request receipt */
  notifyOnReceipt: boolean;
  /** Notify user on completion */
  notifyOnCompletion: boolean;
  /** Notify affected systems */
  notifyAffectedSystems: boolean;
  /** Generate deletion certificate */
  generateCertificate: boolean;
}

// =============================================================================
// AUDIT & LOGGING
// =============================================================================

/**
 * Comprehensive audit entry.
 */
export interface AuditEntry {
  /** Audit entry ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Event type */
  eventType: AuditEventType;
  /** Event category */
  category: AuditCategory;
  /** Actor information */
  actor: AuditActor;
  /** Action performed */
  action: string;
  /** Resource affected */
  resource: AuditResource;
  /** Outcome */
  outcome: 'success' | 'failure' | 'error' | 'unknown';
  /** Risk level of the action */
  riskLevel: RiskLevel;
  /** Security context at time of action */
  securityContext: Partial<SecurityContext>;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Correlation ID for related events */
  correlationId?: string;
  /** Parent event ID if part of a chain */
  parentEventId?: string;
}

export type AuditEventType =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'configuration_change'
  | 'security_event'
  | 'compliance_event'
  | 'system_event';

export type AuditCategory =
  | 'identity'
  | 'access'
  | 'data'
  | 'config'
  | 'security'
  | 'compliance'
  | 'operations';

export interface AuditActor {
  /** Actor type */
  type: 'user' | 'service' | 'system' | 'external';
  /** Actor ID */
  id: string;
  /** Actor name */
  name: string;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
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

// =============================================================================
// SECURITY EVENT HANDLING
// =============================================================================

/**
 * Security event for SIEM integration.
 */
export interface SecurityEvent {
  /** Event ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Event type */
  type: SecurityEventType;
  /** Severity */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Source */
  source: string;
  /** Category */
  category: string;
  /** Description */
  description: string;
  /** Affected entities */
  affectedEntities: AffectedEntity[];
  /** Threat indicators */
  threatIndicators?: IndicatorOfCompromise[];
  /** Recommended actions */
  recommendedActions: string[];
  /** Status */
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  /** Assigned to */
  assignedTo?: string;
  /** Related events */
  relatedEvents: string[];
}

export type SecurityEventType =
  | 'authentication_failure'
  | 'authentication_success'
  | 'authorization_failure'
  | 'threat_detected'
  | 'anomaly_detected'
  | 'policy_violation'
  | 'rate_limit_exceeded'
  | 'session_hijack_attempt'
  | 'privilege_escalation'
  | 'data_exfiltration'
  | 'configuration_change'
  | 'compliance_violation';

export interface AffectedEntity {
  /** Entity type */
  type: 'user' | 'device' | 'resource' | 'service' | 'ip';
  /** Entity ID */
  id: string;
  /** Entity name */
  name?: string;
  /** Impact level */
  impact: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

// =============================================================================
// ZERO-TRUST VERIFICATION
// =============================================================================

/**
 * Continuous verification result.
 */
export interface VerificationResult {
  /** Verification ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Overall verification status */
  status: 'verified' | 'challenged' | 'denied';
  /** Verification components */
  components: VerificationComponent[];
  /** Required actions */
  requiredActions: RequiredAction[];
  /** Verification expiration */
  expiresAt: Date;
  /** Next verification due */
  nextVerificationDue: Date;
}

export interface VerificationComponent {
  /** Component name */
  name: string;
  /** Component type */
  type: 'identity' | 'device' | 'network' | 'behavior' | 'context';
  /** Verification status */
  status: 'verified' | 'partial' | 'failed' | 'skipped';
  /** Confidence score (0-1) */
  confidence: number;
  /** Last verified */
  lastVerified: Date;
  /** Verification method */
  method: string;
}

export interface RequiredAction {
  /** Action type */
  type: 'mfa' | 'reauthenticate' | 'device_check' | 'captcha' | 'approval';
  /** Reason for requirement */
  reason: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Deadline */
  deadline?: Date;
}
