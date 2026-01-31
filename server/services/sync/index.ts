/**
 * @file index.ts
 * @description Cross-Site Synchronization Module Exports
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Comprehensive cross-site synchronization system for RSES CMS multi-site
 * architecture. Inspired by:
 *
 * - CouchDB: Replication protocol (sequence-based, checkpoint-based sync)
 * - Kafka: Event streaming (partitions, consumer groups, offsets)
 * - rsync: Delta sync (rolling checksums, block-level diff)
 * - Git: Distributed sync (merkle trees, revision trees)
 * - Dropbox: Conflict resolution (LWW, forking, manual resolution)
 *
 * Features:
 * - Content syndication with selective sync
 * - Asset distribution with CDN integration
 * - Configuration export/import with migrations
 * - Real-time event-driven replication
 * - Conflict detection and resolution
 * - Comprehensive monitoring dashboard
 */

// =============================================================================
// TYPES
// =============================================================================

export * from "./types";

// =============================================================================
// VECTOR CLOCK & VERSIONING
// =============================================================================

export {
  // Vector clock operations
  createVectorClock,
  cloneVectorClock,
  incrementClock,
  mergeClock,
  compareClocks,
  descendsFrom,
  areConcurrent,
  getClockDepth,
  serializeVectorClock,
  parseVectorClock,
  // Change sequence operations
  createChangeSequence,
  parseChangeSequence,
  compareSequences,
  // Revision operations
  generateRevisionId,
  getRevisionDepth,
  isAncestor,
  // Revision tree
  RevisionTree,
} from "./vector-clock";

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

export {
  // Engine
  ConflictResolutionEngine,
  // Detector
  ConflictDetector,
  // Resolvers
  LastWriteWinsResolver,
  FirstWriteWinsResolver,
  PrimaryWinsResolver,
  ForkResolver,
  MergeResolver,
  // Field mergers
  TextFieldMerger,
  ArrayFieldMerger,
  NumericFieldMerger,
  // Types
  type ConflictResolver,
  type ConflictResolution,
  type FieldMerger,
  type ConflictResolutionEvents,
} from "./conflict-resolver";

// =============================================================================
// DELTA SYNC
// =============================================================================

export {
  // Service
  DeltaSyncService,
  // Rolling checksum
  RollingChecksum,
  // Functions
  generateBlockSignatures,
  buildSignatureLookup,
  generateDelta,
  applyDelta,
  generateJsonPatch,
  applyJsonPatch,
  calculateSHA256,
  // Manifest operations
  diffManifests,
  calculateSyncRequirements,
  // Constants
  DEFAULT_BLOCK_SIZE,
  // Types
  type DeltaSyncEvents,
  type ManifestDiff,
} from "./delta-sync";

// =============================================================================
// CONTENT REPLICATION
// =============================================================================

export {
  // Change log
  ChangeLog,
  // Replicator
  ContentReplicator,
  // Manager
  ReplicationManager,
  // Types
  type ReplicationState,
  type ReplicationOptions,
  type ContentStorage,
  type ContentReplicatorEvents,
} from "./content-replication";

// =============================================================================
// ASSET DISTRIBUTION
// =============================================================================

export {
  // Service
  AssetDistributionService,
  // Queue
  TransferQueue,
  // Bandwidth limiter
  BandwidthLimiter,
  // Lazy replication
  LazyReplicationProxy,
  // Types
  type AssetSyncState,
  type AssetPriority,
  type AssetTransferRequest,
  type AssetSyncOptions,
  type AssetSyncStats,
  type CDNPurgeRequest,
  type AssetDistributionEvents,
  type AssetStore,
} from "./asset-distribution";

// =============================================================================
// CONFIG SYNC
// =============================================================================

export {
  // Services
  ConfigExportService,
  ConfigImportService,
  ConfigSyncManager,
  // Types
  type ConfigSyncState,
  type ConfigValidationResult,
  type ConfigImportResult,
  type ConfigStore,
  type ModuleState,
  type ModuleSyncResult,
  type ConfigSyncEvents,
} from "./config-sync";

// =============================================================================
// SYNC QUEUE
// =============================================================================

export {
  // Queue
  SyncQueue,
  Partition,
  // Consumer
  SyncQueueConsumer,
  // Types
  type QueueOptions,
  type ConsumerOptions,
  type MessageHandler,
  type QueueStats,
  type SyncQueueEvents,
} from "./sync-queue";

// =============================================================================
// MONITORING
// =============================================================================

export {
  // Service
  SyncMonitorService,
  // Components
  MetricsCollector,
  HealthChecker,
  AlertManager,
  // Types
  type DashboardData,
  type SiteStatusEntry,
  type SyncSessionSummary,
  type MetricsSummary,
  type AlertRule,
  type MonitorOptions,
  type SyncMonitorEvents,
} from "./sync-monitor";

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

import { SiteIdentity } from "./types";
import { ContentReplicator, ReplicationManager, ContentStorage } from "./content-replication";
import { AssetDistributionService, AssetStore } from "./asset-distribution";
import { ConfigSyncManager, ConfigStore } from "./config-sync";
import { SyncQueue } from "./sync-queue";
import { SyncMonitorService } from "./sync-monitor";
import { ConflictResolutionEngine } from "./conflict-resolver";

/**
 * Create a complete sync infrastructure
 */
export function createSyncInfrastructure(options: {
  siteId: string;
  contentStore: ContentStorage;
  assetStore: AssetStore;
  configStore: ConfigStore;
  primarySiteId?: string;
}): SyncInfrastructure {
  const { siteId, contentStore, assetStore, configStore, primarySiteId } = options;

  // Create queue
  const queue = new SyncQueue({
    maxSize: 100000,
    messageTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxRetries: 5,
    enableDeadLetter: true,
  });

  // Create conflict resolver
  const conflictResolver = new ConflictResolutionEngine({
    primarySiteId,
    defaultStrategy: "last_write_wins",
  });

  // Create replication manager
  const replicationManager = new ReplicationManager(siteId, contentStore);

  // Create config sync manager
  const configManager = new ConfigSyncManager(siteId, configStore);

  // Create monitor
  const monitor = new SyncMonitorService({
    metricsInterval: 60000,
    healthCheckInterval: 30000,
    lagThreshold: 60000,
    errorRateThreshold: 5,
  });

  monitor.setSyncQueue(queue);

  return {
    queue,
    conflictResolver,
    replicationManager,
    configManager,
    monitor,
    start: () => {
      monitor.start();
    },
    stop: async () => {
      monitor.stop();
      queue.stop();
      await replicationManager.stopAll();
    },
  };
}

/**
 * Sync infrastructure container
 */
export interface SyncInfrastructure {
  queue: SyncQueue;
  conflictResolver: ConflictResolutionEngine;
  replicationManager: ReplicationManager;
  configManager: ConfigSyncManager;
  monitor: SyncMonitorService;
  start: () => void;
  stop: () => Promise<void>;
}

/**
 * Create an asset distribution service
 */
export function createAssetDistribution(options: {
  siteId: string;
  source: SiteIdentity;
  target: SiteIdentity;
  store: AssetStore;
  bandwidthLimit?: number;
}): AssetDistributionService {
  return new AssetDistributionService(options.siteId, options.store, {
    source: options.source,
    target: options.target,
    bandwidthLimit: options.bandwidthLimit,
    useDelta: true,
    maxConcurrent: 5,
    lazyReplication: false,
  });
}
