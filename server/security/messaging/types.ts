/**
 * @file types.ts
 * @description Type definitions for Messaging Security System.
 *              Implements Signal Protocol-inspired E2E encryption, at-rest encryption,
 *              message retention policies, DLP scanning, and compliance support.
 * @phase Phase 10 - Messaging & Social Media Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards Signal Protocol, Matrix Protocol, HIPAA, SOC2, GDPR
 */

// =============================================================================
// SIGNAL PROTOCOL TYPES (E2E ENCRYPTION)
// =============================================================================

/**
 * X3DH (Extended Triple Diffie-Hellman) key bundle for initiating sessions.
 * Based on Signal Protocol specification.
 */
export interface X3DHKeyBundle {
  /** Identity key (long-term) */
  identityKey: CryptoKeyPair;
  /** Signed pre-key (medium-term, rotated periodically) */
  signedPreKey: SignedPreKey;
  /** One-time pre-keys (single use) */
  oneTimePreKeys: OneTimePreKey[];
  /** Timestamp when bundle was created */
  createdAt: Date;
  /** User/device this bundle belongs to */
  ownerId: string;
  /** Device ID for multi-device support */
  deviceId: string;
}

export interface CryptoKeyPair {
  /** Key ID */
  keyId: string;
  /** Public key (base64 encoded) */
  publicKey: string;
  /** Private key (encrypted, base64 encoded) */
  privateKey: string;
  /** Algorithm used */
  algorithm: 'X25519' | 'Ed25519' | 'Kyber768'; // Including post-quantum option
  /** Creation timestamp */
  createdAt: Date;
}

export interface SignedPreKey {
  /** Key pair */
  keyPair: CryptoKeyPair;
  /** Signature over the public key using identity key */
  signature: string;
  /** Timestamp when signed */
  signedAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
}

export interface OneTimePreKey {
  /** Key ID */
  keyId: string;
  /** Key pair */
  keyPair: CryptoKeyPair;
  /** Whether this key has been used */
  used: boolean;
  /** Used at timestamp */
  usedAt?: Date;
  /** Used by (user ID) */
  usedBy?: string;
}

/**
 * Double Ratchet session state for ongoing E2E encryption.
 */
export interface DoubleRatchetSession {
  /** Session ID */
  sessionId: string;
  /** Remote user ID */
  remoteUserId: string;
  /** Remote device ID */
  remoteDeviceId: string;
  /** DHs (sending chain key pair) */
  sendingChainKey: CryptoKeyPair;
  /** DHr (receiving chain key - public only) */
  receivingChainKey: string;
  /** Root key for derivation */
  rootKey: string;
  /** Sending chain key state */
  sendingChainState: ChainState;
  /** Receiving chain key state */
  receivingChainState: ChainState;
  /** Message counters */
  counters: RatchetCounters;
  /** Skipped message keys (for out-of-order delivery) */
  skippedMessageKeys: SkippedMessageKey[];
  /** Session established at */
  establishedAt: Date;
  /** Last activity */
  lastActivity: Date;
  /** Session status */
  status: 'active' | 'stale' | 'terminated';
}

export interface ChainState {
  /** Chain key (derived from root key) */
  chainKey: string;
  /** Message number in this chain */
  messageNumber: number;
  /** Previous chain length (for header) */
  previousChainLength: number;
}

export interface RatchetCounters {
  /** Number of messages sent */
  sent: number;
  /** Number of messages received */
  received: number;
  /** Number of ratchet steps performed */
  ratchetSteps: number;
}

export interface SkippedMessageKey {
  /** Public key that was used */
  publicKey: string;
  /** Message number */
  messageNumber: number;
  /** Message key */
  messageKey: string;
  /** Stored at timestamp */
  storedAt: Date;
  /** Expiration (auto-delete for forward secrecy) */
  expiresAt: Date;
}

// =============================================================================
// ENCRYPTED MESSAGE TYPES
// =============================================================================

/**
 * Encrypted message structure.
 */
export interface EncryptedMessage {
  /** Message ID */
  messageId: string;
  /** Sender user ID */
  senderId: string;
  /** Sender device ID */
  senderDeviceId: string;
  /** Message header (contains DH public key and counters) */
  header: MessageHeader;
  /** Encrypted ciphertext (base64) */
  ciphertext: string;
  /** MAC for authentication */
  mac: string;
  /** Encryption timestamp */
  encryptedAt: Date;
  /** Message type */
  type: MessageType;
  /** Pre-key message flag (for session establishment) */
  isPreKeyMessage: boolean;
  /** Registration ID (for identity verification) */
  registrationId: number;
}

export interface MessageHeader {
  /** Sender's current DH public key */
  publicKey: string;
  /** Previous chain length (PN) */
  previousChainLength: number;
  /** Message number in current chain (N) */
  messageNumber: number;
  /** Timestamp */
  timestamp: Date;
}

export type MessageType =
  | 'text'
  | 'media'
  | 'file'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'reply'
  | 'edit'
  | 'delete'
  | 'read_receipt'
  | 'typing_indicator'
  | 'key_exchange'
  | 'session_reset';

/**
 * Decrypted message content.
 */
export interface DecryptedMessage {
  /** Message ID */
  messageId: string;
  /** Conversation ID */
  conversationId: string;
  /** Sender ID */
  senderId: string;
  /** Content based on type */
  content: MessageContent;
  /** Metadata */
  metadata: MessageMetadata;
  /** Decryption verification */
  verification: DecryptionVerification;
}

export type MessageContent =
  | TextContent
  | MediaContent
  | FileContent
  | LocationContent
  | ReactionContent
  | SystemContent;

export interface TextContent {
  type: 'text';
  text: string;
  /** Mentioned users */
  mentions?: string[];
  /** Formatted text (markdown) */
  formatted?: string;
  /** Preview data for links */
  linkPreviews?: LinkPreview[];
}

export interface MediaContent {
  type: 'media';
  mediaType: 'image' | 'video' | 'audio' | 'gif';
  /** Encrypted media URL or blob reference */
  encryptedUrl: string;
  /** Media encryption key (encrypted with message key) */
  mediaKey: string;
  /** Media hash for verification */
  mediaHash: string;
  /** Thumbnail (encrypted, base64) */
  thumbnail?: string;
  /** Duration in seconds (for audio/video) */
  duration?: number;
  /** Dimensions */
  dimensions?: { width: number; height: number };
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Caption */
  caption?: string;
}

export interface FileContent {
  type: 'file';
  /** File name */
  fileName: string;
  /** Encrypted file URL */
  encryptedUrl: string;
  /** File encryption key */
  fileKey: string;
  /** File hash */
  fileHash: string;
  /** File size */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Caption */
  caption?: string;
}

export interface LocationContent {
  type: 'location';
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Accuracy in meters */
  accuracy?: number;
  /** Location name/label */
  name?: string;
  /** Address */
  address?: string;
  /** Live location duration (for sharing) */
  liveDuration?: number;
}

export interface ReactionContent {
  type: 'reaction';
  /** Message being reacted to */
  targetMessageId: string;
  /** Reaction emoji or identifier */
  reaction: string;
  /** Whether this removes a reaction */
  remove?: boolean;
}

export interface SystemContent {
  type: 'system';
  /** System event type */
  event: SystemEventType;
  /** Event data */
  data: Record<string, unknown>;
}

export type SystemEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'group_name_changed'
  | 'group_avatar_changed'
  | 'encryption_verified'
  | 'message_deleted'
  | 'message_edited'
  | 'call_started'
  | 'call_ended';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface MessageMetadata {
  /** Reply to message ID */
  replyTo?: string;
  /** Forward from (original message ID) */
  forwardedFrom?: string;
  /** Edit of (original message ID) */
  editOf?: string;
  /** Expiring message (seconds until expiration) */
  expiresIn?: number;
  /** View once flag */
  viewOnce?: boolean;
  /** Client info */
  client?: {
    name: string;
    version: string;
    platform: string;
  };
}

export interface DecryptionVerification {
  /** Verification successful */
  verified: boolean;
  /** Identity key fingerprint verified */
  identityVerified: boolean;
  /** Session ID used */
  sessionId: string;
  /** Decryption timestamp */
  decryptedAt: Date;
  /** Any warnings */
  warnings?: string[];
}

// =============================================================================
// AT-REST ENCRYPTION TYPES
// =============================================================================

/**
 * At-rest encryption configuration.
 */
export interface AtRestEncryptionConfig {
  /** Enable at-rest encryption */
  enabled: boolean;
  /** Encryption algorithm */
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'AES-256-CBC';
  /** Key derivation function */
  kdf: 'PBKDF2' | 'Argon2id' | 'scrypt';
  /** KDF parameters */
  kdfParams: KdfParams;
  /** Key rotation policy */
  keyRotation: KeyRotationPolicy;
  /** Envelope encryption (for scalability) */
  envelopeEncryption: boolean;
  /** HSM integration */
  hsmEnabled: boolean;
  /** HSM configuration */
  hsmConfig?: HsmConfig;
}

export interface KdfParams {
  /** Iterations (for PBKDF2) */
  iterations?: number;
  /** Memory cost (for Argon2id) */
  memoryCost?: number;
  /** Time cost (for Argon2id) */
  timeCost?: number;
  /** Parallelism (for Argon2id) */
  parallelism?: number;
  /** Salt length in bytes */
  saltLength: number;
}

export interface KeyRotationPolicy {
  /** Enable automatic rotation */
  autoRotate: boolean;
  /** Rotation interval in days */
  intervalDays: number;
  /** Number of previous keys to retain */
  retainPrevious: number;
  /** Re-encrypt data on rotation */
  reEncryptOnRotation: boolean;
}

export interface HsmConfig {
  /** HSM type */
  type: 'AWS_CloudHSM' | 'Azure_KeyVault' | 'HashiCorp_Vault' | 'Thales_Luna';
  /** Connection endpoint */
  endpoint: string;
  /** Credentials (encrypted) */
  credentials: string;
  /** Key label/alias */
  keyLabel: string;
}

/**
 * Encrypted data envelope for at-rest storage.
 */
export interface EncryptedEnvelope {
  /** Envelope ID */
  envelopeId: string;
  /** Version for format compatibility */
  version: number;
  /** Data encryption key (DEK) - encrypted with KEK */
  encryptedDek: string;
  /** KEK ID used to encrypt DEK */
  kekId: string;
  /** IV/nonce for DEK encryption */
  dekIv: string;
  /** Encrypted data */
  encryptedData: string;
  /** IV/nonce for data encryption */
  dataIv: string;
  /** Authentication tag */
  authTag: string;
  /** Additional authenticated data (AAD) */
  aad?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Encryption algorithm used */
  algorithm: string;
}

// =============================================================================
// MESSAGE RETENTION TYPES
// =============================================================================

/**
 * Message retention policy configuration.
 */
export interface RetentionPolicyConfig {
  /** Policy ID */
  policyId: string;
  /** Policy name */
  name: string;
  /** Description */
  description: string;
  /** Applies to */
  scope: RetentionScope;
  /** Retention period */
  retention: RetentionPeriod;
  /** Actions */
  actions: RetentionAction[];
  /** Exceptions */
  exceptions: RetentionException[];
  /** Legal hold override */
  legalHoldOverride: boolean;
  /** Compliance requirements */
  complianceRequirements: string[];
  /** Status */
  status: 'active' | 'inactive' | 'draft';
  /** Created at */
  createdAt: Date;
  /** Last modified */
  modifiedAt: Date;
}

export interface RetentionScope {
  /** Scope type */
  type: 'global' | 'organization' | 'team' | 'channel' | 'user' | 'conversation_type';
  /** Scope identifiers */
  identifiers?: string[];
  /** Message types */
  messageTypes?: MessageType[];
  /** Content types */
  contentTypes?: ('text' | 'media' | 'file' | 'all')[];
}

export interface RetentionPeriod {
  /** Duration value */
  value: number;
  /** Duration unit */
  unit: 'days' | 'months' | 'years' | 'indefinite';
  /** Start from */
  startFrom: 'message_sent' | 'message_received' | 'last_access' | 'conversation_end';
}

export interface RetentionAction {
  /** Action type */
  type: 'delete' | 'archive' | 'anonymize' | 'export' | 'notify';
  /** When to trigger */
  trigger: 'on_expiration' | 'before_expiration';
  /** Days before expiration (for before_expiration trigger) */
  daysBefore?: number;
  /** Action parameters */
  params?: Record<string, unknown>;
}

export interface RetentionException {
  /** Exception type */
  type: 'legal_hold' | 'compliance_hold' | 'user_request' | 'regulatory';
  /** Exception reason */
  reason: string;
  /** Exception duration (if temporary) */
  duration?: RetentionPeriod;
  /** Created by */
  createdBy: string;
  /** Created at */
  createdAt: Date;
}

/**
 * Legal hold for message preservation.
 */
export interface LegalHold {
  /** Hold ID */
  holdId: string;
  /** Hold name */
  name: string;
  /** Description */
  description: string;
  /** Matter/case reference */
  matterRef: string;
  /** Custodians (users under hold) */
  custodians: string[];
  /** Scope of hold */
  scope: LegalHoldScope;
  /** Start date */
  startDate: Date;
  /** End date (null for indefinite) */
  endDate?: Date;
  /** Status */
  status: 'active' | 'released' | 'pending';
  /** Created by */
  createdBy: string;
  /** Created at */
  createdAt: Date;
  /** Notifications sent */
  notificationsSent: boolean;
}

export interface LegalHoldScope {
  /** Include all messages */
  allMessages: boolean;
  /** Date range */
  dateRange?: {
    from: Date;
    to: Date;
  };
  /** Keywords to match */
  keywords?: string[];
  /** Channels/conversations */
  channels?: string[];
  /** Message types */
  messageTypes?: MessageType[];
}

// =============================================================================
// DLP (DATA LOSS PREVENTION) TYPES
// =============================================================================

/**
 * DLP policy configuration.
 */
export interface DlpPolicy {
  /** Policy ID */
  policyId: string;
  /** Policy name */
  name: string;
  /** Description */
  description: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Detection rules */
  rules: DlpRule[];
  /** Actions to take */
  actions: DlpAction[];
  /** Scope */
  scope: DlpScope;
  /** Exceptions */
  exceptions: DlpException[];
  /** Status */
  status: 'enabled' | 'disabled' | 'test_mode';
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
}

export interface DlpRule {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  name: string;
  /** Detection type */
  detectionType: DlpDetectionType;
  /** Patterns/keywords */
  patterns: DlpPattern[];
  /** Confidence threshold (0-100) */
  confidenceThreshold: number;
  /** Minimum occurrences */
  minOccurrences: number;
  /** Match within proximity (characters) */
  proximity?: number;
}

export type DlpDetectionType =
  | 'regex'
  | 'keyword'
  | 'dictionary'
  | 'ml_classifier'
  | 'document_fingerprint'
  | 'exact_data_match';

export interface DlpPattern {
  /** Pattern type */
  type: 'regex' | 'keyword' | 'dictionary_ref' | 'classifier_ref';
  /** Pattern value */
  value: string;
  /** Weight for scoring */
  weight: number;
}

export interface DlpAction {
  /** Action type */
  type: DlpActionType;
  /** Action parameters */
  params?: Record<string, unknown>;
  /** Notify recipients */
  notify?: DlpNotification[];
}

export type DlpActionType =
  | 'block'
  | 'quarantine'
  | 'encrypt'
  | 'redact'
  | 'warn'
  | 'log'
  | 'notify_admin'
  | 'require_justification'
  | 'apply_label';

export interface DlpNotification {
  /** Recipient type */
  recipientType: 'sender' | 'admin' | 'security_team' | 'manager' | 'custom';
  /** Custom recipient IDs */
  recipients?: string[];
  /** Notification method */
  method: 'email' | 'in_app' | 'siem' | 'webhook';
  /** Include content in notification */
  includeContent: boolean;
}

export interface DlpScope {
  /** Scope type */
  type: 'all' | 'selected';
  /** Include channels */
  channels?: string[];
  /** Include users */
  users?: string[];
  /** Include message directions */
  directions: ('inbound' | 'outbound' | 'internal')[];
  /** Content types to scan */
  contentTypes: ('text' | 'files' | 'images')[];
}

export interface DlpException {
  /** Exception type */
  type: 'user' | 'group' | 'channel' | 'domain';
  /** Exception identifiers */
  identifiers: string[];
  /** Reason */
  reason: string;
  /** Expiration */
  expiresAt?: Date;
}

/**
 * DLP scan result.
 */
export interface DlpScanResult {
  /** Scan ID */
  scanId: string;
  /** Message ID scanned */
  messageId: string;
  /** Scan timestamp */
  scannedAt: Date;
  /** Policies matched */
  matchedPolicies: DlpPolicyMatch[];
  /** Overall verdict */
  verdict: 'clean' | 'blocked' | 'quarantined' | 'warning' | 'redacted';
  /** Actions taken */
  actionsTaken: DlpActionTaken[];
  /** Scan duration (ms) */
  scanDurationMs: number;
  /** Content was modified */
  contentModified: boolean;
  /** Modified content (if redacted) */
  modifiedContent?: string;
}

export interface DlpPolicyMatch {
  /** Policy ID */
  policyId: string;
  /** Policy name */
  policyName: string;
  /** Matched rules */
  matchedRules: DlpRuleMatch[];
  /** Confidence score (0-100) */
  confidence: number;
}

export interface DlpRuleMatch {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Detection type */
  detectionType: DlpDetectionType;
  /** Matches found */
  matches: DlpMatch[];
  /** Confidence */
  confidence: number;
}

export interface DlpMatch {
  /** Match value (may be partially redacted) */
  value: string;
  /** Location in content */
  location: {
    start: number;
    end: number;
  };
  /** Context (surrounding text) */
  context?: string;
  /** Sensitive data type detected */
  dataType?: SensitiveDataType;
}

export type SensitiveDataType =
  | 'credit_card'
  | 'ssn'
  | 'passport'
  | 'driver_license'
  | 'bank_account'
  | 'api_key'
  | 'password'
  | 'phi' // Protected Health Information
  | 'pii' // Personally Identifiable Information
  | 'financial'
  | 'intellectual_property'
  | 'confidential'
  | 'custom';

export interface DlpActionTaken {
  /** Action type */
  type: DlpActionType;
  /** Success */
  success: boolean;
  /** Result message */
  message?: string;
  /** Timestamp */
  timestamp: Date;
}

// =============================================================================
// COMPLIANCE TYPES
// =============================================================================

/**
 * Compliance configuration for messaging.
 */
export interface MessagingComplianceConfig {
  /** Enable compliance features */
  enabled: boolean;
  /** Frameworks to comply with */
  frameworks: ComplianceFrameworkRef[];
  /** eDiscovery configuration */
  eDiscovery: EDiscoveryConfig;
  /** Audit configuration */
  audit: MessagingAuditConfig;
  /** Export configuration */
  export: ComplianceExportConfig;
  /** Archival configuration */
  archival: ArchivalConfig;
}

export interface ComplianceFrameworkRef {
  /** Framework ID */
  id: string;
  /** Framework name */
  name: 'HIPAA' | 'SOC2' | 'GDPR' | 'CCPA' | 'FINRA' | 'SEC17a-4' | 'MiFID_II' | 'DORA';
  /** Requirements enabled */
  requirements: string[];
  /** Status */
  status: 'compliant' | 'partial' | 'non_compliant';
}

export interface EDiscoveryConfig {
  /** Enable eDiscovery */
  enabled: boolean;
  /** Search capabilities */
  searchCapabilities: ('content' | 'metadata' | 'attachments' | 'deleted')[];
  /** Export formats */
  exportFormats: ('eml' | 'pst' | 'json' | 'csv' | 'pdf')[];
  /** Chain of custody tracking */
  chainOfCustody: boolean;
  /** Bates numbering */
  batesNumbering: boolean;
}

export interface MessagingAuditConfig {
  /** Enable audit logging */
  enabled: boolean;
  /** Events to audit */
  auditEvents: MessagingAuditEvent[];
  /** Immutable audit log */
  immutable: boolean;
  /** Retention period (days) */
  retentionDays: number;
  /** SIEM integration */
  siemIntegration: boolean;
}

export type MessagingAuditEvent =
  | 'message_sent'
  | 'message_received'
  | 'message_read'
  | 'message_deleted'
  | 'message_edited'
  | 'attachment_download'
  | 'search_performed'
  | 'export_created'
  | 'policy_violation'
  | 'key_exchange'
  | 'session_established'
  | 'session_terminated';

export interface ComplianceExportConfig {
  /** Enable exports */
  enabled: boolean;
  /** Require approval */
  requireApproval: boolean;
  /** Approvers */
  approvers: string[];
  /** Watermarking */
  watermark: boolean;
  /** Track exports */
  trackExports: boolean;
}

export interface ArchivalConfig {
  /** Enable archival */
  enabled: boolean;
  /** Archive destination */
  destination: 'internal' | 'external' | 'cloud';
  /** Encryption in archive */
  encryptArchive: boolean;
  /** Verification (hash) */
  verifyIntegrity: boolean;
  /** Archive format */
  format: 'original' | 'normalized' | 'both';
}

// =============================================================================
// KEY MANAGEMENT TYPES
// =============================================================================

/**
 * Key management service interface.
 */
export interface KeyManagementConfig {
  /** Key storage backend */
  backend: 'local' | 'hsm' | 'cloud_kms';
  /** Key encryption key (KEK) policy */
  kekPolicy: KekPolicy;
  /** Data encryption key (DEK) policy */
  dekPolicy: DekPolicy;
  /** Key escrow configuration (for compliance) */
  keyEscrow?: KeyEscrowConfig;
  /** Backup configuration */
  backup: KeyBackupConfig;
}

export interface KekPolicy {
  /** Algorithm */
  algorithm: 'AES-256' | 'RSA-4096' | 'KYBER-1024';
  /** Rotation interval (days) */
  rotationDays: number;
  /** Multi-party control */
  multiPartyControl: boolean;
  /** Quorum for operations */
  quorum?: number;
}

export interface DekPolicy {
  /** Algorithm */
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  /** Per-message keys */
  perMessageKeys: boolean;
  /** Key derivation */
  derivation: 'HKDF' | 'PBKDF2';
}

export interface KeyEscrowConfig {
  /** Enable key escrow */
  enabled: boolean;
  /** Escrow type */
  type: 'split_key' | 'threshold' | 'trusted_third_party';
  /** Minimum shares for recovery */
  threshold: number;
  /** Total shares */
  totalShares: number;
  /** Custodians */
  custodians: string[];
}

export interface KeyBackupConfig {
  /** Enable backup */
  enabled: boolean;
  /** Backup encryption */
  encrypted: boolean;
  /** Backup destinations */
  destinations: ('local' | 'cloud' | 'offline')[];
  /** Backup frequency (hours) */
  frequencyHours: number;
  /** Retention (days) */
  retentionDays: number;
}

// =============================================================================
// VOICE/VIDEO SECURITY TYPES
// =============================================================================

/**
 * Voice/Video security configuration.
 */
export interface MediaSecurityConfig {
  /** SRTP configuration */
  srtp: SrtpConfig;
  /** DTLS configuration */
  dtls: DtlsConfig;
  /** Recording security */
  recording: RecordingSecurityConfig;
  /** Transcription security */
  transcription: TranscriptionSecurityConfig;
}

export interface SrtpConfig {
  /** Enable SRTP */
  enabled: boolean;
  /** Cipher suite */
  cipherSuite: 'AES_CM_128_HMAC_SHA1_80' | 'AES_CM_128_HMAC_SHA1_32' | 'AEAD_AES_128_GCM' | 'AEAD_AES_256_GCM';
  /** Key exchange */
  keyExchange: 'DTLS-SRTP' | 'SDES' | 'ZRTP';
  /** Master key lifetime (packets) */
  masterKeyLifetime: number;
}

export interface DtlsConfig {
  /** Enable DTLS */
  enabled: boolean;
  /** Minimum version */
  minVersion: 'DTLS1.0' | 'DTLS1.2';
  /** Certificate verification */
  verifyCertificate: boolean;
  /** Fingerprint algorithm */
  fingerprintAlgorithm: 'sha-256' | 'sha-384' | 'sha-512';
}

export interface RecordingSecurityConfig {
  /** Enable recording */
  enabled: boolean;
  /** Encryption for recordings */
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyManagement: 'per_recording' | 'shared';
  };
  /** Access controls */
  accessControl: {
    requireApproval: boolean;
    approvers: string[];
    auditAccess: boolean;
    timeBasedAccess: boolean;
    maxAccessDuration?: number;
  };
  /** Retention */
  retention: RetentionPeriod;
  /** Transcription of recordings */
  transcription: boolean;
}

export interface TranscriptionSecurityConfig {
  /** Enable transcription */
  enabled: boolean;
  /** PII detection */
  piiDetection: {
    enabled: boolean;
    categories: SensitiveDataType[];
    action: 'redact' | 'mask' | 'flag' | 'block';
  };
  /** Encryption */
  encryption: boolean;
  /** Retention */
  retention: RetentionPeriod;
  /** Access controls */
  accessControl: {
    restrictedAccess: boolean;
    allowedRoles: string[];
  };
}

// =============================================================================
// SECURITY EVENT TYPES
// =============================================================================

/**
 * Messaging security event.
 */
export interface MessagingSecurityEvent {
  /** Event ID */
  eventId: string;
  /** Event type */
  type: MessagingSecurityEventType;
  /** Severity */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp */
  timestamp: Date;
  /** User involved */
  userId?: string;
  /** Device involved */
  deviceId?: string;
  /** Conversation involved */
  conversationId?: string;
  /** Message involved */
  messageId?: string;
  /** Description */
  description: string;
  /** Details */
  details: Record<string, unknown>;
  /** Actions taken */
  actionsTaken?: string[];
  /** Requires attention */
  requiresAttention: boolean;
}

export type MessagingSecurityEventType =
  | 'encryption_failure'
  | 'decryption_failure'
  | 'key_compromise_suspected'
  | 'session_hijack_attempt'
  | 'dlp_violation'
  | 'retention_violation'
  | 'unauthorized_access'
  | 'export_without_approval'
  | 'identity_mismatch'
  | 'replay_attack_detected'
  | 'man_in_middle_detected'
  | 'key_exchange_failure'
  | 'certificate_invalid'
  | 'pii_detected'
  | 'compliance_violation';
