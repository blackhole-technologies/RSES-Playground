/**
 * @file protocol.ts
 * @description Cross-Site Synchronization Protocol Specification
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * RSES CMS Multi-Site Synchronization Protocol v1.0
 *
 * This protocol defines the communication patterns and data formats
 * for synchronizing content, assets, and configuration across multiple
 * RSES CMS instances.
 *
 * Inspired by:
 * - CouchDB Replication Protocol
 * - Kafka Wire Protocol
 * - Git Pack Protocol
 * - rsync Protocol
 */

// =============================================================================
// PROTOCOL VERSION
// =============================================================================

export const PROTOCOL_VERSION = "1.0.0";
export const PROTOCOL_MAGIC = 0x52534553; // "RSES" in hex

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Protocol message types
 */
export enum MessageType {
  // Handshake
  HELLO = 0x01,
  HELLO_ACK = 0x02,
  AUTH_REQUEST = 0x03,
  AUTH_RESPONSE = 0x04,

  // Replication
  GET_CHECKPOINT = 0x10,
  CHECKPOINT = 0x11,
  CHANGES_REQUEST = 0x12,
  CHANGES_RESPONSE = 0x13,
  DOCUMENT = 0x14,
  DOCUMENT_ACK = 0x15,
  REVS_DIFF = 0x16,
  REVS_DIFF_RESPONSE = 0x17,

  // Asset sync
  MANIFEST_REQUEST = 0x20,
  MANIFEST_RESPONSE = 0x21,
  ASSET_REQUEST = 0x22,
  ASSET_RESPONSE = 0x23,
  SIGNATURE_REQUEST = 0x24,
  SIGNATURE_RESPONSE = 0x25,
  DELTA = 0x26,
  DELTA_ACK = 0x27,

  // Config sync
  CONFIG_EXPORT = 0x30,
  CONFIG_IMPORT = 0x31,
  CONFIG_ACK = 0x32,
  SCHEMA_VERSION = 0x33,
  MIGRATION = 0x34,

  // Real-time
  SUBSCRIBE = 0x40,
  UNSUBSCRIBE = 0x41,
  EVENT = 0x42,
  EVENT_ACK = 0x43,
  HEARTBEAT = 0x44,
  HEARTBEAT_ACK = 0x45,

  // Control
  ERROR = 0xE0,
  CLOSE = 0xF0,
}

// =============================================================================
// MESSAGE HEADER
// =============================================================================

/**
 * Protocol message header (12 bytes)
 */
export interface MessageHeader {
  /** Magic number (4 bytes) - 0x52534553 "RSES" */
  magic: number;
  /** Protocol version (2 bytes) */
  version: number;
  /** Message type (1 byte) */
  type: MessageType;
  /** Flags (1 byte) */
  flags: MessageFlags;
  /** Message ID (4 bytes) - for request/response correlation */
  messageId: number;
  /** Payload length (4 bytes) */
  payloadLength: number;
}

/**
 * Message flags
 */
export enum MessageFlags {
  NONE = 0x00,
  COMPRESSED = 0x01,
  ENCRYPTED = 0x02,
  CHUNKED = 0x04,
  FINAL_CHUNK = 0x08,
  URGENT = 0x10,
}

// =============================================================================
// HANDSHAKE MESSAGES
// =============================================================================

/**
 * Hello message - initiates connection
 */
export interface HelloMessage {
  type: MessageType.HELLO;
  /** Site ID */
  siteId: string;
  /** Site name */
  siteName: string;
  /** Protocol version */
  protocolVersion: string;
  /** Supported features */
  features: string[];
  /** Compression algorithms supported */
  compression: string[];
  /** Encryption algorithms supported */
  encryption: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Hello acknowledgment
 */
export interface HelloAckMessage {
  type: MessageType.HELLO_ACK;
  /** Remote site ID */
  siteId: string;
  /** Accepted protocol version */
  protocolVersion: string;
  /** Negotiated features */
  features: string[];
  /** Selected compression */
  compression: string | null;
  /** Selected encryption */
  encryption: string | null;
  /** Session ID */
  sessionId: string;
}

/**
 * Authentication request
 */
export interface AuthRequestMessage {
  type: MessageType.AUTH_REQUEST;
  /** Auth method */
  method: "api_key" | "jwt" | "oauth2" | "mtls";
  /** Credentials (encrypted) */
  credentials: string;
  /** Additional auth data */
  data?: Record<string, unknown>;
}

/**
 * Authentication response
 */
export interface AuthResponseMessage {
  type: MessageType.AUTH_RESPONSE;
  /** Success flag */
  success: boolean;
  /** Session token (if successful) */
  token?: string;
  /** Expires at */
  expiresAt?: number;
  /** Error message (if failed) */
  error?: string;
  /** Permissions granted */
  permissions?: string[];
}

// =============================================================================
// REPLICATION MESSAGES
// =============================================================================

/**
 * Get checkpoint request
 */
export interface GetCheckpointMessage {
  type: MessageType.GET_CHECKPOINT;
  /** Source site ID */
  sourceSite: string;
  /** Target site ID */
  targetSite: string;
  /** Entity type filter */
  entityType?: string;
}

/**
 * Checkpoint response
 */
export interface CheckpointMessage {
  type: MessageType.CHECKPOINT;
  /** Checkpoint ID */
  checkpointId: string;
  /** Last sequence */
  lastSeq: string;
  /** Session ID */
  sessionId: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Changes request
 */
export interface ChangesRequestMessage {
  type: MessageType.CHANGES_REQUEST;
  /** Start after this sequence */
  since: string | null;
  /** Maximum number of changes */
  limit: number;
  /** Include document body */
  includeDocs: boolean;
  /** Entity type filter */
  entityTypes?: string[];
  /** Content type filter */
  contentTypes?: string[];
  /** Taxonomy filter */
  taxonomyFilter?: {
    vocabularyId: string;
    termIds: string[];
  };
  /** Style: all_docs, normal, longpoll */
  style: "all_docs" | "normal" | "longpoll";
  /** Timeout for longpoll (ms) */
  timeout?: number;
}

/**
 * Changes response
 */
export interface ChangesResponseMessage {
  type: MessageType.CHANGES_RESPONSE;
  /** Last sequence in this batch */
  lastSeq: string;
  /** Pending changes count */
  pending: number;
  /** Change results */
  results: ChangeResult[];
}

/**
 * Individual change result
 */
export interface ChangeResult {
  /** Sequence number */
  seq: string;
  /** Document ID */
  id: string;
  /** Document UUID */
  uuid: string;
  /** Change revisions */
  changes: Array<{ rev: string }>;
  /** Is deleted */
  deleted?: boolean;
  /** Document body (if includeDocs) */
  doc?: Record<string, unknown>;
}

/**
 * Document message
 */
export interface DocumentMessage {
  type: MessageType.DOCUMENT;
  /** Document ID */
  id: string;
  /** Document UUID */
  uuid: string;
  /** Revision ID */
  rev: string;
  /** Entity type */
  entityType: string;
  /** Document body */
  doc: Record<string, unknown>;
  /** Revision history */
  revisions: {
    start: number;
    ids: string[];
  };
  /** Attachments (references) */
  attachments?: Record<string, AttachmentStub>;
}

/**
 * Attachment stub for document references
 */
export interface AttachmentStub {
  /** Content type */
  contentType: string;
  /** Digest (checksum) */
  digest: string;
  /** Length in bytes */
  length: number;
  /** Is stub (not included in body) */
  stub: boolean;
}

/**
 * Document acknowledgment
 */
export interface DocumentAckMessage {
  type: MessageType.DOCUMENT_ACK;
  /** Document ID */
  id: string;
  /** Revision ID */
  rev: string;
  /** Success flag */
  ok: boolean;
  /** Error if failed */
  error?: string;
  /** Reason if failed */
  reason?: string;
}

/**
 * Revisions diff request
 */
export interface RevsDiffMessage {
  type: MessageType.REVS_DIFF;
  /** Map of document ID to revision IDs */
  docs: Record<string, string[]>;
}

/**
 * Revisions diff response
 */
export interface RevsDiffResponseMessage {
  type: MessageType.REVS_DIFF_RESPONSE;
  /** Map of document ID to missing/possible ancestors */
  docs: Record<
    string,
    {
      missing: string[];
      possible_ancestors?: string[];
    }
  >;
}

// =============================================================================
// ASSET SYNC MESSAGES
// =============================================================================

/**
 * Manifest request
 */
export interface ManifestRequestMessage {
  type: MessageType.MANIFEST_REQUEST;
  /** Asset types to include */
  assetTypes?: string[];
  /** Modified since */
  since?: number;
}

/**
 * Manifest response
 */
export interface ManifestResponseMessage {
  type: MessageType.MANIFEST_RESPONSE;
  /** Manifest ID */
  manifestId: string;
  /** Total assets */
  totalAssets: number;
  /** Total size */
  totalSize: number;
  /** Manifest checksum */
  checksum: string;
  /** Asset entries (may be chunked) */
  assets: AssetManifestEntry[];
}

/**
 * Asset manifest entry
 */
export interface AssetManifestEntry {
  /** Asset ID */
  id: string;
  /** Asset UUID */
  uuid: string;
  /** File path */
  path: string;
  /** Size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Weak checksum */
  weakChecksum: number;
  /** Strong checksum */
  strongChecksum: string;
  /** Modified at */
  modifiedAt: number;
}

/**
 * Asset request
 */
export interface AssetRequestMessage {
  type: MessageType.ASSET_REQUEST;
  /** Asset ID */
  assetId: string;
  /** Request delta instead of full asset */
  useDelta: boolean;
  /** Local signatures (for delta) */
  signatures?: BlockSignature[];
}

/**
 * Block signature
 */
export interface BlockSignature {
  /** Block index */
  index: number;
  /** Block offset */
  offset: number;
  /** Block size */
  size: number;
  /** Weak checksum */
  weak: number;
  /** Strong checksum */
  strong: string;
}

/**
 * Asset response
 */
export interface AssetResponseMessage {
  type: MessageType.ASSET_RESPONSE;
  /** Asset ID */
  assetId: string;
  /** Is delta */
  isDelta: boolean;
  /** Checksum */
  checksum: string;
  /** Size */
  size: number;
  /** Data (may be chunked) */
  data: Uint8Array;
}

/**
 * Delta message
 */
export interface DeltaMessage {
  type: MessageType.DELTA;
  /** Asset ID */
  assetId: string;
  /** Source checksum */
  sourceChecksum: string;
  /** Target checksum */
  targetChecksum: string;
  /** Delta size */
  deltaSize: number;
  /** Delta instructions */
  instructions: DeltaInstruction[];
}

/**
 * Delta instruction
 */
export type DeltaInstruction =
  | { op: "copy"; offset: number; length: number }
  | { op: "insert"; data: Uint8Array };

// =============================================================================
// CONFIG SYNC MESSAGES
// =============================================================================

/**
 * Config export message
 */
export interface ConfigExportMessage {
  type: MessageType.CONFIG_EXPORT;
  /** Export ID */
  exportId: string;
  /** Export name */
  name: string;
  /** Schema version */
  schemaVersion: string;
  /** Config items */
  items: ConfigItemEntry[];
  /** Checksum */
  checksum: string;
}

/**
 * Config item entry
 */
export interface ConfigItemEntry {
  /** Config type */
  configType: string;
  /** Config ID */
  configId: string;
  /** Config name */
  name: string;
  /** UUID */
  uuid: string;
  /** Config data */
  data: Record<string, unknown>;
  /** Dependencies */
  dependencies: string[];
}

/**
 * Config import message
 */
export interface ConfigImportMessage {
  type: MessageType.CONFIG_IMPORT;
  /** Export ID to import */
  exportId: string;
  /** Environment name */
  environment?: string;
  /** Apply overrides */
  applyOverrides?: boolean;
  /** Dry run */
  dryRun?: boolean;
}

/**
 * Config acknowledgment
 */
export interface ConfigAckMessage {
  type: MessageType.CONFIG_ACK;
  /** Export ID */
  exportId: string;
  /** Success flag */
  success: boolean;
  /** Items created */
  created: number;
  /** Items updated */
  updated: number;
  /** Items skipped */
  skipped: number;
  /** Errors */
  errors?: Array<{ item: string; error: string }>;
}

// =============================================================================
// REAL-TIME MESSAGES
// =============================================================================

/**
 * Subscribe message
 */
export interface SubscribeMessage {
  type: MessageType.SUBSCRIBE;
  /** Subscription ID */
  subscriptionId: string;
  /** Channels to subscribe to */
  channels: string[];
  /** Filter */
  filter?: {
    entityTypes?: string[];
    contentTypes?: string[];
    siteIds?: string[];
  };
}

/**
 * Unsubscribe message
 */
export interface UnsubscribeMessage {
  type: MessageType.UNSUBSCRIBE;
  /** Subscription ID */
  subscriptionId: string;
}

/**
 * Event message
 */
export interface EventMessage {
  type: MessageType.EVENT;
  /** Event ID */
  eventId: string;
  /** Channel */
  channel: string;
  /** Event type */
  eventType: "change" | "delete" | "conflict" | "sync_complete";
  /** Event data */
  data: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Heartbeat message
 */
export interface HeartbeatMessage {
  type: MessageType.HEARTBEAT;
  /** Timestamp */
  timestamp: number;
  /** Sequence number */
  sequence: number;
}

/**
 * Heartbeat acknowledgment
 */
export interface HeartbeatAckMessage {
  type: MessageType.HEARTBEAT_ACK;
  /** Original timestamp */
  originalTimestamp: number;
  /** Response timestamp */
  responseTimestamp: number;
}

// =============================================================================
// CONTROL MESSAGES
// =============================================================================

/**
 * Error message
 */
export interface ErrorMessage {
  type: MessageType.ERROR;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Related message ID */
  messageId?: number;
  /** Is fatal */
  fatal: boolean;
  /** Details */
  details?: Record<string, unknown>;
}

/**
 * Close message
 */
export interface CloseMessage {
  type: MessageType.CLOSE;
  /** Close code */
  code: number;
  /** Reason */
  reason: string;
}

// =============================================================================
// PROTOCOL MESSAGE UNION
// =============================================================================

export type ProtocolMessage =
  | HelloMessage
  | HelloAckMessage
  | AuthRequestMessage
  | AuthResponseMessage
  | GetCheckpointMessage
  | CheckpointMessage
  | ChangesRequestMessage
  | ChangesResponseMessage
  | DocumentMessage
  | DocumentAckMessage
  | RevsDiffMessage
  | RevsDiffResponseMessage
  | ManifestRequestMessage
  | ManifestResponseMessage
  | AssetRequestMessage
  | AssetResponseMessage
  | DeltaMessage
  | ConfigExportMessage
  | ConfigImportMessage
  | ConfigAckMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | EventMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | ErrorMessage
  | CloseMessage;

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serialize a message header
 */
export function serializeHeader(header: MessageHeader): Buffer {
  const buffer = Buffer.alloc(16);

  buffer.writeUInt32BE(header.magic, 0);
  buffer.writeUInt16BE(header.version, 4);
  buffer.writeUInt8(header.type, 6);
  buffer.writeUInt8(header.flags, 7);
  buffer.writeUInt32BE(header.messageId, 8);
  buffer.writeUInt32BE(header.payloadLength, 12);

  return buffer;
}

/**
 * Parse a message header
 */
export function parseHeader(buffer: Buffer): MessageHeader {
  if (buffer.length < 16) {
    throw new Error("Buffer too short for header");
  }

  const magic = buffer.readUInt32BE(0);
  if (magic !== PROTOCOL_MAGIC) {
    throw new Error(`Invalid magic number: ${magic.toString(16)}`);
  }

  return {
    magic,
    version: buffer.readUInt16BE(4),
    type: buffer.readUInt8(6) as MessageType,
    flags: buffer.readUInt8(7),
    messageId: buffer.readUInt32BE(8),
    payloadLength: buffer.readUInt32BE(12),
  };
}

/**
 * Serialize a protocol message
 */
export function serializeMessage(
  message: ProtocolMessage,
  messageId: number,
  flags: MessageFlags = MessageFlags.NONE
): Buffer {
  const payload = Buffer.from(JSON.stringify(message));

  const header: MessageHeader = {
    magic: PROTOCOL_MAGIC,
    version: 0x0100,
    type: message.type,
    flags,
    messageId,
    payloadLength: payload.length,
  };

  return Buffer.concat([serializeHeader(header), payload]);
}

/**
 * Parse a protocol message
 */
export function parseMessage(buffer: Buffer): {
  header: MessageHeader;
  message: ProtocolMessage;
} {
  const header = parseHeader(buffer);
  const payloadBuffer = buffer.subarray(16, 16 + header.payloadLength);
  const message = JSON.parse(payloadBuffer.toString()) as ProtocolMessage;

  return { header, message };
}

// =============================================================================
// ERROR CODES
// =============================================================================

export const ErrorCodes = {
  // General
  UNKNOWN_ERROR: "E0001",
  PROTOCOL_VERSION_MISMATCH: "E0002",
  INVALID_MESSAGE: "E0003",
  MESSAGE_TOO_LARGE: "E0004",

  // Authentication
  AUTH_REQUIRED: "E1001",
  AUTH_FAILED: "E1002",
  AUTH_EXPIRED: "E1003",
  PERMISSION_DENIED: "E1004",

  // Replication
  CHECKPOINT_NOT_FOUND: "E2001",
  DOCUMENT_NOT_FOUND: "E2002",
  CONFLICT: "E2003",
  REVISION_NOT_FOUND: "E2004",

  // Assets
  ASSET_NOT_FOUND: "E3001",
  CHECKSUM_MISMATCH: "E3002",
  TRANSFER_FAILED: "E3003",

  // Config
  CONFIG_NOT_FOUND: "E4001",
  SCHEMA_MISMATCH: "E4002",
  MIGRATION_FAILED: "E4003",
  DEPENDENCY_MISSING: "E4004",

  // Connection
  CONNECTION_TIMEOUT: "E5001",
  CONNECTION_CLOSED: "E5002",
  RATE_LIMITED: "E5003",
} as const;

// =============================================================================
// CLOSE CODES
// =============================================================================

export const CloseCodes = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
  RESTART: 1012,
  TRY_AGAIN_LATER: 1013,
} as const;
