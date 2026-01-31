/**
 * @file asset-distribution.ts
 * @description Asset Distribution Service for Multi-Site Sync
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements efficient asset synchronization and CDN distribution:
 * - Delta sync using rsync algorithm
 * - Lazy replication (on-demand)
 * - Bandwidth optimization
 * - CDN purge coordination
 */

import { EventEmitter } from "events";
import { createHash } from "crypto";
import {
  AssetEntry,
  AssetManifest,
  AssetDelta,
  CDNDistribution,
  SiteIdentity,
  SyncProgress,
  SyncError,
  BlockChecksum,
} from "./types";
import {
  DeltaSyncService,
  diffManifests,
  ManifestDiff,
  calculateSyncRequirements,
  generateBlockSignatures,
  calculateSHA256,
} from "./delta-sync";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Asset sync state
 */
export type AssetSyncState =
  | "idle"
  | "scanning"
  | "comparing"
  | "syncing"
  | "distributing"
  | "complete"
  | "error";

/**
 * Asset transfer priority
 */
export type AssetPriority = "critical" | "high" | "normal" | "low" | "lazy";

/**
 * Asset transfer request
 */
export interface AssetTransferRequest {
  id: string;
  assetId: string;
  assetUuid: string;
  sourceSite: string;
  targetSite: string;
  priority: AssetPriority;
  useDelta: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  status: "pending" | "transferring" | "completed" | "failed";
  bytesTransferred: number;
  error: string | null;
}

/**
 * Asset sync options
 */
export interface AssetSyncOptions {
  /** Source site */
  source: SiteIdentity;
  /** Target site */
  target: SiteIdentity;
  /** Use delta sync */
  useDelta?: boolean;
  /** Maximum concurrent transfers */
  maxConcurrent?: number;
  /** Bandwidth limit in bytes/sec (0 = unlimited) */
  bandwidthLimit?: number;
  /** Minimum file size for delta sync */
  minDeltaSize?: number;
  /** Asset types to sync */
  assetTypes?: string[];
  /** Priority filter */
  priorityFilter?: AssetPriority[];
  /** Lazy replication (on-demand only) */
  lazyReplication?: boolean;
}

/**
 * CDN purge request
 */
export interface CDNPurgeRequest {
  id: string;
  distributionId: string;
  paths: string[];
  type: "paths" | "all" | "tags";
  tags?: string[];
  createdAt: Date;
  completedAt: Date | null;
  status: "pending" | "processing" | "completed" | "failed";
}

// =============================================================================
// ASSET STORE INTERFACE
// =============================================================================

/**
 * Asset storage interface
 */
export interface AssetStore {
  getManifest(): Promise<AssetManifest>;
  getAsset(assetId: string): Promise<Buffer | null>;
  getAssetMetadata(assetId: string): Promise<AssetEntry | null>;
  putAsset(assetId: string, data: Buffer, metadata: Partial<AssetEntry>): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
  listAssets(filter?: { type?: string; since?: Date }): Promise<AssetEntry[]>;
}

// =============================================================================
// BANDWIDTH LIMITER
// =============================================================================

/**
 * Token bucket bandwidth limiter
 */
export class BandwidthLimiter {
  private tokens: number;
  private lastRefill: number;
  private bytesPerSecond: number;
  private maxBurst: number;

  constructor(bytesPerSecond: number, burstMultiplier: number = 2) {
    this.bytesPerSecond = bytesPerSecond;
    this.maxBurst = bytesPerSecond * burstMultiplier;
    this.tokens = this.maxBurst;
    this.lastRefill = Date.now();
  }

  /**
   * Request tokens (bytes) for transfer
   */
  async acquire(bytes: number): Promise<void> {
    if (this.bytesPerSecond === 0) {
      return; // Unlimited
    }

    this.refill();

    while (this.tokens < bytes) {
      const waitTime = ((bytes - this.tokens) / this.bytesPerSecond) * 1000;
      await this.sleep(Math.min(waitTime, 100));
      this.refill();
    }

    this.tokens -= bytes;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxBurst, this.tokens + elapsed * this.bytesPerSecond);
    this.lastRefill = now;
  }

  /**
   * Update bandwidth limit
   */
  setLimit(bytesPerSecond: number): void {
    this.bytesPerSecond = bytesPerSecond;
    this.maxBurst = bytesPerSecond * 2;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// TRANSFER QUEUE
// =============================================================================

/**
 * Priority queue for asset transfers
 */
export class TransferQueue {
  private queues: Map<AssetPriority, AssetTransferRequest[]>;
  private priorities: AssetPriority[] = ["critical", "high", "normal", "low", "lazy"];

  constructor() {
    this.queues = new Map();
    for (const priority of this.priorities) {
      this.queues.set(priority, []);
    }
  }

  /**
   * Add a transfer request
   */
  enqueue(request: AssetTransferRequest): void {
    const queue = this.queues.get(request.priority)!;
    queue.push(request);
  }

  /**
   * Get next request (highest priority first)
   */
  dequeue(): AssetTransferRequest | null {
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  /**
   * Peek at next request without removing
   */
  peek(): AssetTransferRequest | null {
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  /**
   * Get queue length
   */
  get length(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get lengths by priority
   */
  getLengthsByPriority(): Record<AssetPriority, number> {
    const result: Record<AssetPriority, number> = {} as Record<AssetPriority, number>;
    for (const [priority, queue] of this.queues) {
      result[priority] = queue.length;
    }
    return result;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  /**
   * Remove a specific request
   */
  remove(requestId: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex((r) => r.id === requestId);
      if (index >= 0) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }
}

// =============================================================================
// ASSET DISTRIBUTION SERVICE
// =============================================================================

/**
 * Events emitted by asset distribution service
 */
export interface AssetDistributionEvents {
  state_changed: (state: AssetSyncState) => void;
  transfer_started: (request: AssetTransferRequest) => void;
  transfer_progress: (request: AssetTransferRequest, progress: number) => void;
  transfer_completed: (request: AssetTransferRequest) => void;
  transfer_failed: (request: AssetTransferRequest, error: Error) => void;
  cdn_purge_started: (request: CDNPurgeRequest) => void;
  cdn_purge_completed: (request: CDNPurgeRequest) => void;
  sync_completed: (stats: AssetSyncStats) => void;
  error: (error: SyncError) => void;
}

/**
 * Asset sync statistics
 */
export interface AssetSyncStats {
  startedAt: Date;
  completedAt: Date;
  assetsScanned: number;
  assetsAdded: number;
  assetsModified: number;
  assetsDeleted: number;
  bytesTransferred: number;
  bytesSavedByDelta: number;
  averageTransferSpeed: number;
  errors: SyncError[];
}

/**
 * Asset distribution service
 */
export class AssetDistributionService extends EventEmitter {
  private state: AssetSyncState;
  private options: Required<AssetSyncOptions>;
  private localStore: AssetStore;
  private deltaService: DeltaSyncService;
  private bandwidthLimiter: BandwidthLimiter;
  private transferQueue: TransferQueue;
  private activeTransfers: Map<string, AssetTransferRequest>;
  private cdnDistributions: Map<string, CDNDistribution>;
  private stats: AssetSyncStats | null;
  private abortController: AbortController | null;

  constructor(
    private siteId: string,
    localStore: AssetStore,
    options: AssetSyncOptions
  ) {
    super();

    this.localStore = localStore;
    this.options = {
      source: options.source,
      target: options.target,
      useDelta: options.useDelta ?? true,
      maxConcurrent: options.maxConcurrent ?? 5,
      bandwidthLimit: options.bandwidthLimit ?? 0,
      minDeltaSize: options.minDeltaSize ?? 1024 * 100, // 100KB
      assetTypes: options.assetTypes ?? [],
      priorityFilter: options.priorityFilter ?? [],
      lazyReplication: options.lazyReplication ?? false,
    };

    this.state = "idle";
    this.deltaService = new DeltaSyncService();
    this.bandwidthLimiter = new BandwidthLimiter(this.options.bandwidthLimit);
    this.transferQueue = new TransferQueue();
    this.activeTransfers = new Map();
    this.cdnDistributions = new Map();
    this.stats = null;
    this.abortController = null;
  }

  /**
   * Start asset synchronization
   */
  async startSync(): Promise<AssetSyncStats> {
    if (this.state !== "idle") {
      throw new Error(`Cannot start sync in state ${this.state}`);
    }

    this.abortController = new AbortController();
    this.stats = {
      startedAt: new Date(),
      completedAt: new Date(),
      assetsScanned: 0,
      assetsAdded: 0,
      assetsModified: 0,
      assetsDeleted: 0,
      bytesTransferred: 0,
      bytesSavedByDelta: 0,
      averageTransferSpeed: 0,
      errors: [],
    };

    try {
      // Phase 1: Scan local assets
      this.setState("scanning");
      const localManifest = await this.localStore.getManifest();
      this.stats.assetsScanned = localManifest.totalAssets;

      // Phase 2: Compare with remote
      this.setState("comparing");
      const remoteManifest = await this.fetchRemoteManifest();
      const diff = diffManifests(localManifest, remoteManifest);

      // Phase 3: Queue transfers
      this.queueTransfers(diff);

      // Phase 4: Process transfers
      this.setState("syncing");
      await this.processTransfers();

      // Phase 5: CDN distribution
      this.setState("distributing");
      await this.updateCDN(diff);

      this.stats.completedAt = new Date();
      this.setState("complete");
      this.emit("sync_completed", this.stats);

      return this.stats;
    } catch (error) {
      this.setState("error");
      const syncError: SyncError = {
        code: "ASSET_SYNC_FAILED",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recoverable: false,
        retryCount: 0,
      };
      this.stats!.errors.push(syncError);
      this.emit("error", syncError);
      throw error;
    }
  }

  /**
   * Stop synchronization
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.transferQueue.clear();
    this.activeTransfers.clear();
    this.setState("idle");
  }

  /**
   * Request lazy replication of an asset
   */
  async requestAsset(
    assetId: string,
    assetUuid: string,
    priority: AssetPriority = "normal"
  ): Promise<AssetTransferRequest> {
    const request: AssetTransferRequest = {
      id: uuidv4(),
      assetId,
      assetUuid,
      sourceSite: this.options.source.id,
      targetSite: this.options.target.id,
      priority,
      useDelta: this.options.useDelta,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      status: "pending",
      bytesTransferred: 0,
      error: null,
    };

    this.transferQueue.enqueue(request);

    // Start processing if idle
    if (this.state === "idle") {
      this.processTransfers().catch((err) => this.emit("error", err));
    }

    return request;
  }

  /**
   * Register a CDN distribution
   */
  registerCDN(distribution: CDNDistribution): void {
    this.cdnDistributions.set(distribution.id, distribution);
  }

  /**
   * Purge CDN cache
   */
  async purgeCDN(
    distributionId: string,
    paths: string[],
    type: "paths" | "all" | "tags" = "paths"
  ): Promise<CDNPurgeRequest> {
    const distribution = this.cdnDistributions.get(distributionId);
    if (!distribution) {
      throw new Error(`CDN distribution ${distributionId} not found`);
    }

    const request: CDNPurgeRequest = {
      id: uuidv4(),
      distributionId,
      paths,
      type,
      createdAt: new Date(),
      completedAt: null,
      status: "pending",
    };

    this.emit("cdn_purge_started", request);

    try {
      await this.executeCDNPurge(distribution, request);
      request.status = "completed";
      request.completedAt = new Date();
      this.emit("cdn_purge_completed", request);
    } catch (error) {
      request.status = "failed";
      request.completedAt = new Date();
    }

    return request;
  }

  /**
   * Get current state
   */
  getState(): AssetSyncState {
    return this.state;
  }

  /**
   * Get transfer queue status
   */
  getQueueStatus(): {
    pending: number;
    active: number;
    byPriority: Record<AssetPriority, number>;
  } {
    return {
      pending: this.transferQueue.length,
      active: this.activeTransfers.size,
      byPriority: this.transferQueue.getLengthsByPriority(),
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private setState(state: AssetSyncState): void {
    this.state = state;
    this.emit("state_changed", state);
  }

  private async fetchRemoteManifest(): Promise<AssetManifest> {
    // In production, fetch from remote site
    // For now, return empty manifest
    return {
      id: uuidv4(),
      siteId: this.options.source.id,
      generatedAt: new Date(),
      totalAssets: 0,
      totalSize: 0,
      assets: [],
      checksum: "",
    };
  }

  private queueTransfers(diff: ManifestDiff): void {
    // Queue added assets
    for (const asset of diff.added) {
      this.transferQueue.enqueue({
        id: uuidv4(),
        assetId: asset.id,
        assetUuid: asset.uuid,
        sourceSite: this.options.source.id,
        targetSite: this.options.target.id,
        priority: this.determinePriority(asset),
        useDelta: false, // New assets don't need delta
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        status: "pending",
        bytesTransferred: 0,
        error: null,
      });
      this.stats!.assetsAdded++;
    }

    // Queue modified assets
    for (const asset of diff.modified) {
      this.transferQueue.enqueue({
        id: uuidv4(),
        assetId: asset.id,
        assetUuid: asset.uuid,
        sourceSite: this.options.source.id,
        targetSite: this.options.target.id,
        priority: this.determinePriority(asset),
        useDelta: this.options.useDelta && asset.size >= this.options.minDeltaSize,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        status: "pending",
        bytesTransferred: 0,
        error: null,
      });
      this.stats!.assetsModified++;
    }

    this.stats!.assetsDeleted = diff.deleted.length;
  }

  private determinePriority(asset: AssetEntry): AssetPriority {
    // Determine priority based on asset type and size
    const mimeType = asset.mimeType.toLowerCase();

    if (mimeType.startsWith("image/") && asset.size < 100000) {
      return "high"; // Small images are high priority
    } else if (mimeType.startsWith("text/css") || mimeType.includes("javascript")) {
      return "critical"; // CSS and JS are critical
    } else if (asset.size > 10000000) {
      return "low"; // Large files are low priority
    }

    return "normal";
  }

  private async processTransfers(): Promise<void> {
    const startTime = Date.now();
    let totalBytes = 0;

    while (
      (this.transferQueue.length > 0 || this.activeTransfers.size > 0) &&
      !this.abortController?.signal.aborted
    ) {
      // Start new transfers up to max concurrent
      while (
        this.activeTransfers.size < this.options.maxConcurrent &&
        this.transferQueue.length > 0
      ) {
        const request = this.transferQueue.dequeue()!;
        this.activeTransfers.set(request.id, request);
        this.processTransfer(request).catch((err) => {
          request.status = "failed";
          request.error = err.message;
          this.emit("transfer_failed", request, err);
        });
      }

      // Wait for some transfers to complete
      await this.sleep(100);
    }

    // Calculate average speed
    const elapsed = (Date.now() - startTime) / 1000;
    this.stats!.averageTransferSpeed =
      elapsed > 0 ? this.stats!.bytesTransferred / elapsed : 0;
  }

  private async processTransfer(request: AssetTransferRequest): Promise<void> {
    request.status = "transferring";
    request.startedAt = new Date();
    this.emit("transfer_started", request);

    try {
      let data: Buffer;
      let bytesSaved = 0;

      if (request.useDelta) {
        // Delta sync
        const localAsset = await this.localStore.getAsset(request.assetId);
        if (localAsset) {
          const signatures = this.deltaService.generateSignatures(
            request.assetId,
            localAsset
          );

          // In production, send signatures to remote and receive delta
          const remoteData = await this.fetchRemoteAsset(request.assetId);
          const delta = this.deltaService.generateDeltaFromSignatures(
            request.assetId,
            remoteData,
            signatures
          );

          if (delta) {
            data = this.deltaService.applyDelta(request.assetId, localAsset, delta);
            bytesSaved = remoteData.length - delta.deltaSize;
            this.stats!.bytesSavedByDelta += bytesSaved;
          } else {
            data = remoteData;
          }
        } else {
          data = await this.fetchRemoteAsset(request.assetId);
        }
      } else {
        data = await this.fetchRemoteAsset(request.assetId);
      }

      // Apply bandwidth limiting
      await this.bandwidthLimiter.acquire(data.length);

      // Store the asset
      const metadata = await this.fetchRemoteAssetMetadata(request.assetId);
      if (metadata) {
        await this.localStore.putAsset(request.assetId, data, metadata);
      }

      request.bytesTransferred = data.length;
      request.status = "completed";
      request.completedAt = new Date();
      this.stats!.bytesTransferred += data.length;

      this.emit("transfer_completed", request);
    } finally {
      this.activeTransfers.delete(request.id);
    }
  }

  private async fetchRemoteAsset(assetId: string): Promise<Buffer> {
    // In production, fetch from remote site
    // For now, return empty buffer
    return Buffer.alloc(0);
  }

  private async fetchRemoteAssetMetadata(assetId: string): Promise<AssetEntry | null> {
    // In production, fetch from remote site
    return null;
  }

  private async updateCDN(diff: ManifestDiff): Promise<void> {
    // Purge CDN for modified and deleted assets
    const pathsToPurge = [
      ...diff.modified.map((a) => a.path),
      ...diff.deleted.map((a) => a.path),
    ];

    if (pathsToPurge.length === 0) {
      return;
    }

    // Purge all registered CDNs
    for (const distribution of this.cdnDistributions.values()) {
      if (distribution.purgeOnUpdate && distribution.active) {
        await this.purgeCDN(distribution.id, pathsToPurge, "paths");
      }
    }
  }

  private async executeCDNPurge(
    distribution: CDNDistribution,
    request: CDNPurgeRequest
  ): Promise<void> {
    // In production, call CDN provider API
    // This is a placeholder implementation
    request.status = "processing";

    switch (distribution.provider) {
      case "cloudflare":
        // await cloudflareAPI.purge(distribution, request);
        break;
      case "cloudfront":
        // await cloudfrontAPI.createInvalidation(distribution, request);
        break;
      case "fastly":
        // await fastlyAPI.purge(distribution, request);
        break;
      case "bunny":
        // await bunnyAPI.purge(distribution, request);
        break;
      default:
        // Custom CDN - would call configured webhook
        break;
    }

    await this.sleep(100); // Simulate API call
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// LAZY REPLICATION PROXY
// =============================================================================

/**
 * Lazy replication proxy - fetches assets on demand
 */
export class LazyReplicationProxy {
  private assetService: AssetDistributionService;
  private localStore: AssetStore;
  private pendingRequests: Map<string, Promise<Buffer>>;
  private hitRate: { hits: number; misses: number };

  constructor(assetService: AssetDistributionService, localStore: AssetStore) {
    this.assetService = assetService;
    this.localStore = localStore;
    this.pendingRequests = new Map();
    this.hitRate = { hits: 0, misses: 0 };
  }

  /**
   * Get asset (from local or remote)
   */
  async getAsset(
    assetId: string,
    assetUuid: string,
    priority: AssetPriority = "normal"
  ): Promise<Buffer | null> {
    // Try local first
    const local = await this.localStore.getAsset(assetId);
    if (local) {
      this.hitRate.hits++;
      return local;
    }

    this.hitRate.misses++;

    // Check if already fetching
    if (this.pendingRequests.has(assetId)) {
      return this.pendingRequests.get(assetId)!;
    }

    // Request from remote
    const promise = this.fetchAndStore(assetId, assetUuid, priority);
    this.pendingRequests.set(assetId, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(assetId);
    }
  }

  private async fetchAndStore(
    assetId: string,
    assetUuid: string,
    priority: AssetPriority
  ): Promise<Buffer | null> {
    await this.assetService.requestAsset(assetId, assetUuid, priority);

    // Wait for transfer to complete (poll local store)
    for (let i = 0; i < 100; i++) {
      const local = await this.localStore.getAsset(assetId);
      if (local) {
        return local;
      }
      await this.sleep(100);
    }

    return null;
  }

  /**
   * Get hit rate statistics
   */
  getHitRate(): { ratio: number; hits: number; misses: number } {
    const total = this.hitRate.hits + this.hitRate.misses;
    return {
      ratio: total > 0 ? this.hitRate.hits / total : 0,
      ...this.hitRate,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hitRate = { hits: 0, misses: 0 };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  BandwidthLimiter,
  TransferQueue,
  AssetDistributionService,
  LazyReplicationProxy,
  AssetSyncState,
  AssetPriority,
  AssetTransferRequest,
  AssetSyncOptions,
  AssetSyncStats,
  CDNPurgeRequest,
};
