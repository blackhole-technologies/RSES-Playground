/**
 * @file content-replication.ts
 * @description Content Replication Service for Multi-Site Sync
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements content replication between sites inspired by:
 * - CouchDB: Continuous replication with checkpoints
 * - Kafka: Event-driven streaming
 * - MySQL: Binary log replication
 */

import { EventEmitter } from "events";
import {
  ChangeDocument,
  ChangeSequence,
  SyncSession,
  SyncProgress,
  SyncCheckpoint,
  SyncError,
  SyndicationRule,
  SiteIdentity,
  VectorClock,
  SyncMode,
  SyncDirection,
  BatchSyncResult,
  SyncResult,
  ConflictRecord,
} from "./types";
import {
  createVectorClock,
  incrementClock,
  createChangeSequence,
  generateRevisionId,
  compareSequences,
} from "./vector-clock";
import { ConflictResolutionEngine } from "./conflict-resolver";
import { generateJsonPatch, applyJsonPatch } from "./delta-sync";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Replication state
 */
export type ReplicationState =
  | "idle"
  | "connecting"
  | "replicating"
  | "paused"
  | "error"
  | "complete";

/**
 * Change feed item
 */
export interface ChangeFeedItem {
  seq: ChangeSequence;
  id: string;
  changes: Array<{ rev: string }>;
  deleted?: boolean;
  doc?: Record<string, unknown>;
}

/**
 * Replication options
 */
export interface ReplicationOptions {
  /** Source site */
  source: SiteIdentity;
  /** Target site */
  target: SiteIdentity;
  /** Sync direction */
  direction: SyncDirection;
  /** Sync mode */
  mode: SyncMode;
  /** Content types to replicate */
  contentTypes?: string[];
  /** Taxonomy filter */
  taxonomyFilter?: {
    vocabularyId: string;
    termIds: string[];
  };
  /** Batch size */
  batchSize?: number;
  /** Checkpoint interval */
  checkpointInterval?: number;
  /** Retry on error */
  retryOnError?: boolean;
  /** Max retries */
  maxRetries?: number;
  /** Conflict resolution strategy */
  conflictStrategy?: string;
  /** Live mode (continuous) */
  live?: boolean;
  /** Heartbeat interval for live mode */
  heartbeatInterval?: number;
}

// =============================================================================
// CHANGE LOG
// =============================================================================

/**
 * Change log - stores changes for replication
 */
export class ChangeLog {
  private changes: Map<string, ChangeDocument>;
  private sequence: number;
  private siteId: string;
  private vectorClock: VectorClock;

  constructor(siteId: string) {
    this.siteId = siteId;
    this.changes = new Map();
    this.sequence = 0;
    this.vectorClock = createVectorClock();
  }

  /**
   * Append a change to the log
   */
  append(
    entityType: "content" | "asset" | "config" | "taxonomy",
    entityId: string,
    entityUuid: string,
    changeType: "create" | "update" | "delete",
    data: Record<string, unknown> | null,
    metadata: { author: string; message: string }
  ): ChangeDocument {
    this.sequence++;
    this.vectorClock = incrementClock(this.vectorClock, this.siteId);

    const revisionId = data
      ? generateRevisionId(data, this.vectorClock)
      : `${this.sequence}-deleted`;

    const change: ChangeDocument = {
      id: uuidv4(),
      seq: createChangeSequence(this.siteId, this.sequence),
      entityType,
      entityId,
      entityUuid,
      changeType,
      revisionId,
      parentRevisions: [], // Will be filled by caller if known
      vectorClock: { clocks: { ...this.vectorClock.clocks } },
      data,
      metadata: {
        ...metadata,
        timestamp: new Date(),
        sourcesite: this.siteId,
      },
    };

    this.changes.set(change.id, change);
    return change;
  }

  /**
   * Get changes since a sequence
   */
  getChangesSince(
    since: ChangeSequence | null,
    limit: number = 100
  ): ChangeDocument[] {
    const all = Array.from(this.changes.values());

    // Sort by sequence
    all.sort((a, b) => compareSequences(a.seq, b.seq));

    // Filter by since
    let filtered = all;
    if (since) {
      filtered = all.filter((c) => compareSequences(c.seq, since) > 0);
    }

    return filtered.slice(0, limit);
  }

  /**
   * Get latest sequence
   */
  getLatestSequence(): ChangeSequence | null {
    if (this.changes.size === 0) {
      return null;
    }

    const all = Array.from(this.changes.values());
    all.sort((a, b) => compareSequences(b.seq, a.seq)); // Descending
    return all[0].seq;
  }

  /**
   * Get change by ID
   */
  getChange(id: string): ChangeDocument | undefined {
    return this.changes.get(id);
  }

  /**
   * Get current vector clock
   */
  getVectorClock(): VectorClock {
    return { clocks: { ...this.vectorClock.clocks } };
  }

  /**
   * Merge remote vector clock
   */
  mergeVectorClock(remote: VectorClock): void {
    for (const [siteId, timestamp] of Object.entries(remote.clocks)) {
      const current = this.vectorClock.clocks[siteId] || 0;
      this.vectorClock.clocks[siteId] = Math.max(current, timestamp);
    }
  }

  /**
   * Get total change count
   */
  get size(): number {
    return this.changes.size;
  }

  /**
   * Prune old changes
   */
  prune(beforeSequence: ChangeSequence): number {
    let pruned = 0;
    for (const [id, change] of this.changes) {
      if (compareSequences(change.seq, beforeSequence) < 0) {
        this.changes.delete(id);
        pruned++;
      }
    }
    return pruned;
  }
}

// =============================================================================
// CONTENT REPLICATOR
// =============================================================================

/**
 * Events emitted by content replicator
 */
export interface ContentReplicatorEvents {
  state_changed: (state: ReplicationState) => void;
  change_received: (change: ChangeDocument) => void;
  change_applied: (change: ChangeDocument) => void;
  conflict_detected: (conflict: ConflictRecord) => void;
  error: (error: SyncError) => void;
  checkpoint_saved: (checkpoint: SyncCheckpoint) => void;
  complete: (session: SyncSession) => void;
  progress: (progress: SyncProgress) => void;
}

/**
 * Content replicator - handles replication between sites
 */
export class ContentReplicator extends EventEmitter {
  // Required<> minus the genuinely optional fields. Required<ReplicationOptions>
  // would force every field including taxonomyFilter to be non-undefined,
  // which doesn't match how it's actually populated.
  private options: Omit<Required<ReplicationOptions>, "taxonomyFilter"> & {
    taxonomyFilter?: ReplicationOptions["taxonomyFilter"];
  };
  private state: ReplicationState;
  private session: SyncSession | null;
  private changeLog: ChangeLog;
  private conflictResolver: ConflictResolutionEngine;
  private checkpoints: Map<string, SyncCheckpoint>;
  private pendingChanges: ChangeDocument[];
  private appliedChanges: ChangeDocument[];
  private errors: SyncError[];
  private abortController: AbortController | null;

  constructor(
    private localSiteId: string,
    private storage: ContentStorage,
    options: ReplicationOptions
  ) {
    super();

    this.options = {
      source: options.source,
      target: options.target,
      direction: options.direction,
      mode: options.mode,
      contentTypes: options.contentTypes || [],
      taxonomyFilter: options.taxonomyFilter,
      batchSize: options.batchSize || 100,
      checkpointInterval: options.checkpointInterval || 100,
      retryOnError: options.retryOnError ?? true,
      maxRetries: options.maxRetries || 3,
      conflictStrategy: options.conflictStrategy || "last_write_wins",
      live: options.live || false,
      heartbeatInterval: options.heartbeatInterval || 30000,
    };

    this.state = "idle";
    this.session = null;
    this.changeLog = new ChangeLog(localSiteId);
    this.conflictResolver = new ConflictResolutionEngine({
      primarySiteId: options.source.role === "primary" ? options.source.id : undefined,
    });
    this.checkpoints = new Map();
    this.pendingChanges = [];
    this.appliedChanges = [];
    this.errors = [];
    this.abortController = null;

    // Forward conflict events
    this.conflictResolver.on("conflict_detected", (conflict) => {
      this.emit("conflict_detected", conflict);
    });
  }

  /**
   * Start replication
   */
  async start(): Promise<SyncSession> {
    if (this.state === "replicating") {
      throw new Error("Replication already in progress");
    }

    this.setState("connecting");
    this.abortController = new AbortController();

    // Create session
    this.session = {
      id: uuidv4(),
      sourceSite: this.options.source.id,
      targetSite: this.options.target.id,
      direction: this.options.direction,
      mode: this.options.mode,
      startedAt: new Date(),
      completedAt: null,
      status: "running",
      progress: {
        totalChanges: 0,
        processedChanges: 0,
        bytesTransferred: 0,
        phase: "init",
        estimatedTimeRemaining: 0,
        changesPerSecond: 0,
      },
      errors: [],
      conflicts: [],
    };

    try {
      await this.connect();
      this.setState("replicating");

      if (this.options.live) {
        await this.runLiveReplication();
      } else {
        await this.runBatchReplication();
      }

      this.session.status = "completed";
      this.session.completedAt = new Date();
      this.setState("complete");
      this.emit("complete", this.session);

      return this.session;
    } catch (error) {
      this.session.status = "failed";
      this.session.completedAt = new Date();
      this.setState("error");

      const syncError: SyncError = {
        code: "REPLICATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recoverable: false,
        retryCount: 0,
      };
      this.session.errors.push(syncError);
      this.emit("error", syncError);

      throw error;
    }
  }

  /**
   * Stop replication
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.session) {
      this.session.status = "cancelled";
      this.session.completedAt = new Date();
    }

    this.setState("idle");
  }

  /**
   * Pause replication
   */
  pause(): void {
    if (this.state === "replicating") {
      this.setState("paused");
    }
  }

  /**
   * Resume replication
   */
  resume(): void {
    if (this.state === "paused") {
      this.setState("replicating");
    }
  }

  /**
   * Get current state
   */
  getState(): ReplicationState {
    return this.state;
  }

  /**
   * Get current session
   */
  getSession(): SyncSession | null {
    return this.session;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private setState(state: ReplicationState): void {
    this.state = state;
    this.emit("state_changed", state);
  }

  private async connect(): Promise<void> {
    // In production, establish connection to remote site
    // For now, simulate connection delay
    await this.sleep(100);
  }

  private async runBatchReplication(): Promise<void> {
    // Get checkpoint
    const checkpointKey = `${this.options.source.id}->${this.options.target.id}`;
    const checkpoint = this.checkpoints.get(checkpointKey);
    const since = checkpoint?.lastSeq || null;

    this.updateProgress({ phase: "comparing" });

    // Fetch changes from source
    const changes = await this.fetchChanges(since);
    this.session!.progress.totalChanges = changes.length;

    this.updateProgress({ phase: "transferring" });

    // Process changes in batches
    for (let i = 0; i < changes.length; i += this.options.batchSize) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      while (this.state === "paused") {
        await this.sleep(1000);
      }

      const batch = changes.slice(i, i + this.options.batchSize);
      await this.processBatch(batch);

      // Save checkpoint
      if ((i + this.options.batchSize) % this.options.checkpointInterval === 0) {
        await this.saveCheckpoint(batch[batch.length - 1].seq);
      }
    }

    this.updateProgress({ phase: "cleanup" });
    await this.cleanup();

    this.updateProgress({ phase: "complete" });
  }

  private async runLiveReplication(): Promise<void> {
    // Continuous replication with heartbeat
    while (!this.abortController?.signal.aborted) {
      const checkpointKey = `${this.options.source.id}->${this.options.target.id}`;
      const checkpoint = this.checkpoints.get(checkpointKey);
      const since = checkpoint?.lastSeq || null;

      const changes = await this.fetchChanges(since);

      if (changes.length > 0) {
        await this.processBatch(changes);
        await this.saveCheckpoint(changes[changes.length - 1].seq);
      }

      // Wait for heartbeat interval
      await this.sleep(this.options.heartbeatInterval);
    }
  }

  private async fetchChanges(since: ChangeSequence | null): Promise<ChangeDocument[]> {
    // In production, fetch from remote site
    // For now, get from local change log
    return this.changeLog.getChangesSince(since, this.options.batchSize * 10);
  }

  private async processBatch(changes: ChangeDocument[]): Promise<void> {
    for (const change of changes) {
      try {
        await this.processChange(change);
        this.appliedChanges.push(change);
        this.session!.progress.processedChanges++;
        this.updateProgress({});
        this.emit("change_applied", change);
      } catch (error) {
        const syncError: SyncError = {
          code: "CHANGE_APPLY_FAILED",
          message: error instanceof Error ? error.message : String(error),
          entityId: change.entityId,
          timestamp: new Date(),
          recoverable: this.options.retryOnError,
          retryCount: 0,
        };
        this.errors.push(syncError);
        this.session!.errors.push(syncError);
        this.emit("error", syncError);

        if (!this.options.retryOnError) {
          throw error;
        }
      }
    }
  }

  private async processChange(change: ChangeDocument): Promise<void> {
    this.emit("change_received", change);

    // Check content type filter
    if (
      this.options.contentTypes.length > 0 &&
      change.entityType === "content" &&
      change.data
    ) {
      const contentType = change.data.type as string;
      if (!this.options.contentTypes.includes(contentType)) {
        return; // Skip filtered content type
      }
    }

    // Check for conflicts
    const local = await this.storage.getByUuid(change.entityUuid);
    if (local) {
      const localChange = this.toChangeDocument(local);
      const conflict = this.conflictResolver.detectConflict(localChange, change);

      if (conflict) {
        this.session!.conflicts.push(conflict);
        const resolution = await this.conflictResolver.resolveConflict(conflict.id);

        if (!resolution.success) {
          throw new Error(`Conflict resolution failed: ${resolution.message}`);
        }

        // Apply winning revision
        if (resolution.winningRevision) {
          await this.applyChange(change, resolution.winningRevision.data);
        }
        return;
      }
    }

    // Apply change
    await this.applyChange(change, change.data || undefined);
  }

  private async applyChange(
    change: ChangeDocument,
    data?: Record<string, unknown>
  ): Promise<void> {
    switch (change.changeType) {
      case "create":
        if (data) {
          await this.storage.create(change.entityType, change.entityId, data);
        }
        break;

      case "update":
        if (data) {
          if (change.delta) {
            // Apply delta patch
            const existing = await this.storage.get(change.entityType, change.entityId);
            if (existing) {
              const patched = applyJsonPatch(existing, change.delta.operations);
              await this.storage.update(change.entityType, change.entityId, patched);
            }
          } else {
            await this.storage.update(change.entityType, change.entityId, data);
          }
        }
        break;

      case "delete":
        await this.storage.delete(change.entityType, change.entityId);
        break;
    }

    // Merge vector clock
    this.changeLog.mergeVectorClock(change.vectorClock);
  }

  private async saveCheckpoint(seq: ChangeSequence): Promise<void> {
    const checkpoint: SyncCheckpoint = {
      id: uuidv4(),
      sourceSite: this.options.source.id,
      targetSite: this.options.target.id,
      lastSeq: seq,
      entityType: this.options.contentTypes.join(",") || undefined,
      timestamp: new Date(),
      sessionId: this.session!.id,
    };

    const key = `${this.options.source.id}->${this.options.target.id}`;
    this.checkpoints.set(key, checkpoint);
    this.emit("checkpoint_saved", checkpoint);
  }

  private async cleanup(): Promise<void> {
    // Clean up temporary resources
    this.pendingChanges = [];
  }

  private updateProgress(updates: Partial<SyncProgress>): void {
    if (!this.session) return;

    Object.assign(this.session.progress, updates);

    // Calculate changes per second
    const elapsed = (Date.now() - this.session.startedAt.getTime()) / 1000;
    if (elapsed > 0) {
      this.session.progress.changesPerSecond =
        this.session.progress.processedChanges / elapsed;
    }

    // Estimate remaining time
    const remaining =
      this.session.progress.totalChanges - this.session.progress.processedChanges;
    if (this.session.progress.changesPerSecond > 0) {
      this.session.progress.estimatedTimeRemaining =
        (remaining / this.session.progress.changesPerSecond) * 1000;
    }

    this.emit("progress", this.session.progress);
  }

  private toChangeDocument(entity: Record<string, unknown>): ChangeDocument {
    return {
      id: entity.id as string,
      seq: createChangeSequence(this.localSiteId, 0),
      entityType: entity.entityType as "content" | "asset" | "config" | "taxonomy",
      entityId: entity.id as string,
      entityUuid: entity.uuid as string,
      changeType: "update",
      revisionId: entity.revisionId as string,
      parentRevisions: [],
      vectorClock: createVectorClock(),
      data: entity,
      metadata: {
        author: "system",
        message: "Local version",
        timestamp: new Date(),
        sourcesite: this.localSiteId,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// CONTENT STORAGE INTERFACE
// =============================================================================

/**
 * Storage interface for content replication
 */
export interface ContentStorage {
  get(entityType: string, entityId: string): Promise<Record<string, unknown> | null>;
  getByUuid(uuid: string): Promise<Record<string, unknown> | null>;
  create(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  update(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  delete(entityType: string, entityId: string): Promise<void>;
  list(
    entityType: string,
    filter?: Record<string, unknown>
  ): Promise<Record<string, unknown>[]>;
}

// =============================================================================
// REPLICATION MANAGER
// =============================================================================

/**
 * Manages multiple replication tasks
 */
export class ReplicationManager {
  private replicators: Map<string, ContentReplicator>;
  private rules: Map<string, SyndicationRule>;
  private sites: Map<string, SiteIdentity>;
  private localSiteId: string;
  private storage: ContentStorage;

  constructor(localSiteId: string, storage: ContentStorage) {
    this.localSiteId = localSiteId;
    this.storage = storage;
    this.replicators = new Map();
    this.rules = new Map();
    this.sites = new Map();
  }

  /**
   * Register a site
   */
  registerSite(site: SiteIdentity): void {
    this.sites.set(site.id, site);
  }

  /**
   * Unregister a site
   */
  unregisterSite(siteId: string): void {
    this.sites.delete(siteId);
    // Stop any replications to this site
    for (const [key, replicator] of this.replicators) {
      if (key.includes(siteId)) {
        replicator.stop();
        this.replicators.delete(key);
      }
    }
  }

  /**
   * Add a syndication rule
   */
  addRule(rule: SyndicationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a syndication rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Start replication based on a rule
   */
  async startReplication(ruleId: string): Promise<SyncSession[]> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    if (!rule.active) {
      throw new Error(`Rule ${ruleId} is not active`);
    }

    const sessions: SyncSession[] = [];

    // Determine source sites
    const sourceSites =
      rule.sourceSites.includes("*")
        ? Array.from(this.sites.values())
        : rule.sourceSites
            .map((id) => this.sites.get(id))
            .filter(Boolean) as SiteIdentity[];

    // Determine target sites
    const targetSites = rule.targetSites
      .map((id) => this.sites.get(id))
      .filter(Boolean) as SiteIdentity[];

    // Create replicators for each source-target pair
    for (const source of sourceSites) {
      for (const target of targetSites) {
        if (source.id === target.id) continue;

        const key = `${source.id}->${target.id}:${ruleId}`;

        if (!this.replicators.has(key)) {
          const replicator = new ContentReplicator(this.localSiteId, this.storage, {
            source,
            target,
            direction: "push",
            mode: rule.mode,
            contentTypes: rule.contentTypes,
            conflictStrategy: rule.conflictStrategy,
          });

          this.replicators.set(key, replicator);
        }

        const replicator = this.replicators.get(key)!;
        const session = await replicator.start();
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Stop replication
   */
  async stopReplication(replicatorKey: string): Promise<void> {
    const replicator = this.replicators.get(replicatorKey);
    if (replicator) {
      await replicator.stop();
    }
  }

  /**
   * Stop all replications
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.replicators.values()).map((r) => r.stop());
    await Promise.all(promises);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SyncSession[] {
    return Array.from(this.replicators.values())
      .map((r) => r.getSession())
      .filter((s): s is SyncSession => s !== null && s.status === "running");
  }

  /**
   * Get replication status
   */
  getStatus(): {
    activeSessions: number;
    sites: number;
    rules: number;
    replicators: number;
  } {
    return {
      activeSessions: this.getActiveSessions().length,
      sites: this.sites.size,
      rules: this.rules.size,
      replicators: this.replicators.size,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================
// All entries are inline-exported. Trailing block removed 2026-04-14 to
// fix duplicate-export errors.
