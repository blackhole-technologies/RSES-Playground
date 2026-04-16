/**
 * @file types.ts
 * @description Cross-Site Synchronization Type Definitions
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Comprehensive type system for multi-site synchronization inspired by:
 * - CouchDB: Replication protocol (sequence-based, conflict detection)
 * - Kafka: Event streaming (partitions, offsets, consumer groups)
 * - rsync: Delta sync (rolling checksums, block-level diff)
 * - Git: Distributed sync (merkle trees, refs, branches)
 * - Dropbox: Conflict resolution (last-write-wins, forking)
 */

import { z } from "zod";

// =============================================================================
// SITE IDENTITY AND TOPOLOGY
// =============================================================================

/**
 * Site role in the multi-site topology
 */
export type SiteRole = "primary" | "replica" | "edge" | "hub";

/**
 * Site identity definition
 */
export interface SiteIdentity {
  /** Unique site ID (UUID) */
  id: string;
  /** Human-readable site name */
  name: string;
  /** Site URL/endpoint */
  endpoint: string;
  /** Site role in the topology */
  role: SiteRole;
  /** Geographic region */
  region: string;
  /** Datacenter/zone */
  zone: string;
  /** Vector clock component for this site */
  vectorClockId: number;
  /** Site metadata */
  metadata: Record<string, unknown>;
  /** Site capabilities */
  capabilities: SiteCapabilities;
  /** Connection settings */
  connection: SiteConnectionSettings;
  /** Site status */
  status: SiteStatus;
  /** Last seen timestamp */
  lastSeen: Date;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Site capabilities
 */
export interface SiteCapabilities {
  /** Can receive content pushes */
  canReceivePush: boolean;
  /** Can initiate pulls */
  canPull: boolean;
  /** Supports real-time sync */
  supportsRealtime: boolean;
  /** Supports delta sync for assets */
  supportsDeltaSync: boolean;
  /** Maximum concurrent sync connections */
  maxConcurrentSync: number;
  /** Supported content types for sync */
  supportedContentTypes: string[];
  /** Supported asset types */
  supportedAssetTypes: string[];
  /** Bandwidth limit in bytes per second (0 = unlimited) */
  bandwidthLimit: number;
}

/**
 * Site connection settings
 */
export interface SiteConnectionSettings {
  /** Authentication method */
  authMethod: "api_key" | "oauth2" | "jwt" | "mtls";
  /** API key or token (encrypted) */
  credentials: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Retry configuration */
  retry: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
  /** TLS settings */
  tls: {
    verify: boolean;
    certPath?: string;
    keyPath?: string;
    caPath?: string;
  };
}

/**
 * Site status
 */
export interface SiteStatus {
  /** Is site online and reachable */
  online: boolean;
  /** Last successful sync */
  lastSync: Date | null;
  /** Pending changes count */
  pendingChanges: number;
  /** Current sync lag in ms */
  syncLag: number;
  /** Health score (0-100) */
  healthScore: number;
  /** Active connections count */
  activeConnections: number;
  /** Error state */
  error: string | null;
}

// =============================================================================
// SYNC PROTOCOL - INSPIRED BY COUCHDB REPLICATION
// =============================================================================

/**
 * Sync direction
 */
export type SyncDirection = "push" | "pull" | "bidirectional";

/**
 * Generic field value used by the conflict resolver and field mergers.
 * Added 2026-04-14 — the conflict-resolver references this name but it
 * was missing from the types module.
 */
export type FieldValue = unknown;

/**
 * Sync mode
 */
export type SyncMode =
  | "full"        // Complete resync
  | "incremental" // Only changes since last sync
  | "selective"   // Specific content types/taxonomies
  | "live"        // Real-time continuous sync
  ;

/**
 * Change sequence number (CouchDB-style)
 * Combines site ID, timestamp, and sequence for global ordering
 */
export interface ChangeSequence {
  /** Source site ID */
  siteId: string;
  /** Timestamp component */
  timestamp: number;
  /** Local sequence number */
  sequence: number;
  /** Combined sequence string */
  toString(): string;
}

/**
 * Vector clock for conflict detection (Git/CouchDB-style)
 */
export interface VectorClock {
  /** Map of site ID to logical timestamp */
  clocks: Record<string, number>;
}

/**
 * Change document - unit of replication
 */
export interface ChangeDocument {
  /** Change ID */
  id: string;
  /** Sequence number */
  seq: ChangeSequence;
  /** Entity type */
  entityType: "content" | "asset" | "config" | "taxonomy";
  /** Entity ID */
  entityId: string;
  /** Entity UUID */
  entityUuid: string;
  /** Change type */
  changeType: "create" | "update" | "delete";
  /** Document revision ID (hash-based) */
  revisionId: string;
  /** Parent revision IDs (for conflict detection) */
  parentRevisions: string[];
  /** Vector clock at time of change */
  vectorClock: VectorClock;
  /** Change data (serialized entity) */
  data: Record<string, unknown> | null;
  /** Delta patch (for updates) */
  delta?: DeltaPatch;
  /** Metadata */
  metadata: {
    author: string;
    message: string;
    timestamp: Date;
    sourcesite: string;
  };
}

/**
 * Delta patch for efficient updates (rsync-style)
 */
export interface DeltaPatch {
  /** Patch format version */
  version: number;
  /** Operations */
  operations: DeltaOperation[];
  /** Original checksum */
  originalChecksum: string;
  /** Result checksum */
  resultChecksum: string;
  /** Patch size in bytes */
  size: number;
}

/**
 * Delta operation
 */
export type DeltaOperation =
  | { type: "copy"; offset: number; length: number }
  | { type: "insert"; data: string }
  | { type: "set"; path: string; value: unknown }
  | { type: "unset"; path: string }
  | { type: "arrayPush"; path: string; value: unknown }
  | { type: "arrayRemove"; path: string; index: number }
  ;

/**
 * Sync checkpoint - tracks progress
 */
export interface SyncCheckpoint {
  /** Checkpoint ID */
  id: string;
  /** Source site ID */
  sourceSite: string;
  /** Target site ID */
  targetSite: string;
  /** Last processed sequence */
  lastSeq: ChangeSequence;
  /** Entity type filter */
  entityType?: string;
  /** Checkpoint timestamp */
  timestamp: Date;
  /** Session ID for this sync */
  sessionId: string;
}

/**
 * Sync session - tracks a sync operation
 */
export interface SyncSession {
  /** Session ID */
  id: string;
  /** Source site */
  sourceSite: string;
  /** Target site */
  targetSite: string;
  /** Sync direction */
  direction: SyncDirection;
  /** Sync mode */
  mode: SyncMode;
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt: Date | null;
  /** Status */
  status: "running" | "completed" | "failed" | "cancelled";
  /** Progress */
  progress: SyncProgress;
  /** Errors */
  errors: SyncError[];
  /** Conflicts detected */
  conflicts: ConflictRecord[];
}

/**
 * Sync progress tracking
 */
export interface SyncProgress {
  /** Total changes to process */
  totalChanges: number;
  /** Processed changes */
  processedChanges: number;
  /** Transferred bytes */
  bytesTransferred: number;
  /** Current phase */
  phase: "init" | "comparing" | "transferring" | "applying" | "resolving" | "cleanup" | "complete";
  /** Current entity being synced */
  currentEntity?: string;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number;
  /** Changes per second */
  changesPerSecond: number;
}

/**
 * Sync error
 */
export interface SyncError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Entity that caused the error */
  entityId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Is this error recoverable */
  recoverable: boolean;
  /** Retry count */
  retryCount: number;
}

// =============================================================================
// CONFLICT RESOLUTION - INSPIRED BY DROPBOX AND GIT
// =============================================================================

/**
 * Conflict types
 */
export type ConflictType =
  | "concurrent_edit"    // Same entity edited on multiple sites
  | "delete_update"      // Deleted on one site, updated on another
  | "parent_missing"     // Reference to non-existent parent
  | "schema_mismatch"    // Different schemas on different sites
  | "constraint_violation" // Unique constraint violated
  ;

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy =
  | "last_write_wins"    // Most recent timestamp wins
  | "first_write_wins"   // Earliest timestamp wins
  | "primary_wins"       // Primary site always wins
  | "merge"              // Attempt automatic merge
  | "fork"               // Create conflicting copies
  | "manual"             // Require manual resolution
  | "custom"             // Custom resolver function
  ;

/**
 * Conflict record
 */
export interface ConflictRecord {
  /** Conflict ID */
  id: string;
  /** Conflict type */
  type: ConflictType;
  /** Entity type */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Entity UUID */
  entityUuid: string;
  /** Conflicting revisions */
  revisions: ConflictingRevision[];
  /** Resolution strategy used */
  strategy: ConflictResolutionStrategy;
  /** Resolution status */
  status: "pending" | "auto_resolved" | "manually_resolved" | "forked";
  /** Winning revision (if resolved) */
  winningRevision?: string;
  /** Resolution timestamp */
  resolvedAt: Date | null;
  /** Resolution by (user/system) */
  resolvedBy: string | null;
  /** Created at */
  createdAt: Date;
}

/**
 * Conflicting revision
 */
export interface ConflictingRevision {
  /** Revision ID */
  revisionId: string;
  /** Source site */
  siteId: string;
  /** Vector clock */
  vectorClock: VectorClock;
  /** Timestamp */
  timestamp: Date;
  /** Document data */
  data: Record<string, unknown>;
  /** Author */
  author: string;
}

/**
 * Merge result
 */
export interface MergeResult {
  /** Was merge successful */
  success: boolean;
  /** Merged document (if successful) */
  merged?: Record<string, unknown>;
  /** Fields that couldn't be merged */
  unmergableFields: string[];
  /** Merge strategy used per field */
  fieldStrategies: Record<string, string>;
}

// =============================================================================
// CONTENT SYNDICATION
// =============================================================================

/**
 * Syndication rule - defines what content syncs where
 */
export interface SyndicationRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Is rule active */
  active: boolean;
  /** Source sites (or "*" for all) */
  sourceSites: string[];
  /** Target sites */
  targetSites: string[];
  /** Content type filter */
  contentTypes: string[];
  /** Taxonomy filter */
  taxonomyFilter?: TaxonomyFilter;
  /** Field mapping for transformation */
  fieldMapping?: FieldMapping[];
  /** Schedule (cron expression) */
  schedule?: string;
  /** Sync mode */
  mode: SyncMode;
  /** Conflict resolution strategy */
  conflictStrategy: ConflictResolutionStrategy;
  /** Priority (higher = processed first) */
  priority: number;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
}

/**
 * Taxonomy filter for selective sync
 */
export interface TaxonomyFilter {
  /** Vocabulary ID */
  vocabularyId: string;
  /** Term IDs to include */
  includeTerms?: string[];
  /** Term IDs to exclude */
  excludeTerms?: string[];
  /** Include children of specified terms */
  includeChildren: boolean;
}

/**
 * Field mapping for content transformation
 */
export interface FieldMapping {
  /** Source field */
  sourceField: string;
  /** Target field */
  targetField: string;
  /** Transformation function */
  transform?: "copy" | "uppercase" | "lowercase" | "truncate" | "custom";
  /** Transformation options */
  options?: Record<string, unknown>;
}

// =============================================================================
// ASSET SYNCHRONIZATION - INSPIRED BY RSYNC
// =============================================================================

/**
 * Asset sync manifest
 */
export interface AssetManifest {
  /** Manifest ID */
  id: string;
  /** Site ID */
  siteId: string;
  /** Generated at */
  generatedAt: Date;
  /** Total asset count */
  totalAssets: number;
  /** Total size in bytes */
  totalSize: number;
  /** Assets in manifest */
  assets: AssetEntry[];
  /** Checksum of manifest */
  checksum: string;
}

/**
 * Asset entry in manifest
 */
export interface AssetEntry {
  /** Asset ID */
  id: string;
  /** Asset UUID */
  uuid: string;
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Weak checksum (rolling, rsync-style) */
  weakChecksum: number;
  /** Strong checksum (SHA-256) */
  strongChecksum: string;
  /** Block checksums for delta sync */
  blockChecksums?: BlockChecksum[];
  /** Last modified */
  modifiedAt: Date;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Block checksum for delta sync (rsync algorithm)
 */
export interface BlockChecksum {
  /** Block index */
  index: number;
  /** Block offset */
  offset: number;
  /** Block size */
  size: number;
  /** Weak (rolling) checksum */
  weak: number;
  /** Strong (MD5) checksum */
  strong: string;
}

/**
 * Asset delta - difference between versions
 */
export interface AssetDelta {
  /** Asset ID */
  assetId: string;
  /** Source revision */
  sourceRevision: string;
  /** Target revision */
  targetRevision: string;
  /** Instructions for reconstruction */
  instructions: DeltaInstruction[];
  /** Total delta size */
  deltaSize: number;
  /** Compression ratio */
  compressionRatio: number;
}

/**
 * Delta instruction
 */
export type DeltaInstruction =
  | { type: "copy"; sourceOffset: number; length: number }
  | { type: "literal"; data: Buffer }
  ;

/**
 * CDN distribution settings
 */
export interface CDNDistribution {
  /** Distribution ID */
  id: string;
  /** Provider */
  provider: "cloudflare" | "cloudfront" | "fastly" | "bunny" | "custom";
  /** Origin URL */
  originUrl: string;
  /** CDN domain */
  cdnDomain: string;
  /** Cache TTL in seconds */
  cacheTtl: number;
  /** Purge on update */
  purgeOnUpdate: boolean;
  /** Geographic restrictions */
  geoRestrictions?: {
    type: "whitelist" | "blacklist";
    countries: string[];
  };
  /** Headers to set */
  headers: Record<string, string>;
  /** Is active */
  active: boolean;
}

// =============================================================================
// CONFIGURATION SYNC
// =============================================================================

/**
 * Configuration export package
 */
export interface ConfigExport {
  /** Export ID */
  id: string;
  /** Export name */
  name: string;
  /** Exported from site */
  sourceSite: string;
  /** Export timestamp */
  exportedAt: Date;
  /** Schema version */
  schemaVersion: string;
  /** Configuration items */
  items: ConfigItem[];
  /** Dependencies */
  dependencies: string[];
  /** Checksum */
  checksum: string;
}

/**
 * Configuration item
 */
export interface ConfigItem {
  /** Config type */
  type: "content_type" | "field_storage" | "field_instance" | "view_display" | "form_display" | "vocabulary" | "rses_config" | "module" | "custom";
  /** Config ID */
  id: string;
  /** Config name */
  name: string;
  /** Config data */
  data: Record<string, unknown>;
  /** Dependencies */
  dependencies: string[];
  /** UUID for tracking */
  uuid: string;
}

/**
 * Environment-specific override
 */
export interface EnvironmentOverride {
  /** Override ID */
  id: string;
  /** Environment name */
  environment: string;
  /** Config item type */
  configType: string;
  /** Config item ID */
  configId: string;
  /** Override data (merged with base) */
  overrides: Record<string, unknown>;
  /** Priority */
  priority: number;
  /** Active */
  active: boolean;
}

/**
 * Schema migration for config sync
 */
export interface ConfigMigration {
  /** Migration ID */
  id: string;
  /** Source schema version */
  sourceVersion: string;
  /** Target schema version */
  targetVersion: string;
  /** Migration steps */
  steps: ConfigMigrationStep[];
  /** Is reversible */
  reversible: boolean;
  /** Rollback steps */
  rollbackSteps?: ConfigMigrationStep[];
}

/**
 * Config migration step
 */
export interface ConfigMigrationStep {
  /** Step type */
  type: "add" | "remove" | "rename" | "transform" | "move";
  /** Target path */
  path: string;
  /** Old value (for rollback) */
  oldValue?: unknown;
  /** New value */
  newValue?: unknown;
  /** Transformation function */
  transform?: string;
}

// =============================================================================
// REAL-TIME SYNC - INSPIRED BY KAFKA
// =============================================================================

/**
 * Sync event (Kafka-style)
 */
export interface SyncEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: "change" | "delete" | "conflict" | "error" | "heartbeat";
  /** Partition (by entity type or site) */
  partition: string;
  /** Offset within partition */
  offset: number;
  /** Event key */
  key: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Headers */
  headers: Record<string, string>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Consumer group for sync
 */
export interface SyncConsumerGroup {
  /** Group ID */
  id: string;
  /** Group name */
  name: string;
  /** Subscribed partitions */
  partitions: string[];
  /** Consumer instances */
  consumers: SyncConsumer[];
  /** Committed offsets */
  offsets: Record<string, number>;
  /** Rebalance strategy */
  rebalanceStrategy: "range" | "roundrobin" | "sticky";
}

/**
 * Sync consumer
 */
export interface SyncConsumer {
  /** Consumer ID */
  id: string;
  /** Consumer host */
  host: string;
  /** Assigned partitions */
  assignedPartitions: string[];
  /** Last heartbeat */
  lastHeartbeat: Date;
  /** Is active */
  active: boolean;
}

/**
 * Sync queue message
 */
export interface SyncQueueMessage {
  /** Message ID */
  id: string;
  /** Queue name */
  queue: string;
  /** Message payload */
  payload: ChangeDocument;
  /** Priority */
  priority: number;
  /** Attempts */
  attempts: number;
  /** Max attempts */
  maxAttempts: number;
  /** Created at */
  createdAt: Date;
  /** Process after */
  processAfter: Date;
  /** Locked by (consumer ID) */
  lockedBy: string | null;
  /** Lock expires */
  lockExpires: Date | null;
  /** Status */
  status: "pending" | "processing" | "completed" | "failed" | "dead";
}

// =============================================================================
// SYNC MONITORING
// =============================================================================

/**
 * Sync metrics
 */
export interface SyncMetrics {
  /** Site ID */
  siteId: string;
  /** Time window */
  window: {
    start: Date;
    end: Date;
  };
  /** Changes synced */
  changesSynced: number;
  /** Bytes transferred */
  bytesTransferred: number;
  /** Average latency in ms */
  averageLatency: number;
  /** P99 latency in ms */
  p99Latency: number;
  /** Error rate */
  errorRate: number;
  /** Conflict rate */
  conflictRate: number;
  /** Queue depth */
  queueDepth: number;
  /** Active sessions */
  activeSessions: number;
  /** Bandwidth usage */
  bandwidthUsage: {
    inbound: number;
    outbound: number;
  };
}

/**
 * Sync health check
 */
export interface SyncHealthCheck {
  /** Overall status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Individual checks */
  checks: SyncHealthCheckItem[];
  /** Last checked */
  checkedAt: Date;
}

/**
 * Individual health check item
 */
export interface SyncHealthCheckItem {
  /** Check name */
  name: string;
  /** Status */
  status: "pass" | "warn" | "fail";
  /** Message */
  message: string;
  /** Duration in ms */
  duration: number;
  /** Details */
  details?: Record<string, unknown>;
}

/**
 * Sync alert
 */
export interface SyncAlert {
  /** Alert ID */
  id: string;
  /** Alert type */
  type: "lag" | "error" | "conflict" | "offline" | "capacity";
  /** Severity */
  severity: "info" | "warning" | "error" | "critical";
  /** Message */
  message: string;
  /** Source site */
  sourceSite: string;
  /** Target site */
  targetSite?: string;
  /** Fired at */
  firedAt: Date;
  /** Resolved at */
  resolvedAt: Date | null;
  /** Acknowledged by */
  acknowledgedBy: string | null;
  /** Metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

export const siteIdentitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  endpoint: z.string().url(),
  role: z.enum(["primary", "replica", "edge", "hub"]),
  region: z.string(),
  zone: z.string(),
  vectorClockId: z.number().int().positive(),
  metadata: z.record(z.unknown()).default({}),
});

export const syndicationRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  active: z.boolean().default(true),
  sourceSites: z.array(z.string()),
  targetSites: z.array(z.string()),
  contentTypes: z.array(z.string()),
  mode: z.enum(["full", "incremental", "selective", "live"]),
  conflictStrategy: z.enum([
    "last_write_wins",
    "first_write_wins",
    "primary_wins",
    "merge",
    "fork",
    "manual",
    "custom",
  ]),
  priority: z.number().int().default(0),
});

export const changeDocumentSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(["content", "asset", "config", "taxonomy"]),
  entityId: z.string(),
  entityUuid: z.string().uuid(),
  changeType: z.enum(["create", "update", "delete"]),
  revisionId: z.string(),
  parentRevisions: z.array(z.string()),
  data: z.record(z.unknown()).nullable(),
});

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Sync operation result
 */
export interface SyncResult<T = void> {
  success: boolean;
  data?: T;
  error?: SyncError;
  warnings: string[];
  duration: number;
}

/**
 * Batch sync result
 */
export interface BatchSyncResult {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  results: SyncResult[];
  duration: number;
}

/**
 * Sync filter options
 */
export interface SyncFilterOptions {
  contentTypes?: string[];
  taxonomyTerms?: string[];
  sites?: string[];
  since?: Date;
  until?: Date;
  status?: string[];
}

/**
 * Pagination options
 */
export interface SyncPaginationOptions {
  limit: number;
  offset: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}
