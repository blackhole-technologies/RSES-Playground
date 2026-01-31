/**
 * @file orchestrator.ts
 * @description Multi-Site Synchronization Orchestrator
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Central orchestrator for multi-site synchronization that coordinates:
 * - Site topology management
 * - Sync scheduling
 * - Event routing
 * - Failure recovery
 * - Load balancing
 */

import { EventEmitter } from "events";
import {
  SiteIdentity,
  SiteRole,
  SiteStatus,
  SyndicationRule,
  SyncSession,
  SyncError,
  ConflictRecord,
  SyncDirection,
  SyncMode,
} from "../../server/services/sync/types";
import {
  ReplicationManager,
  ContentStorage,
} from "../../server/services/sync/content-replication";
import {
  AssetDistributionService,
  AssetStore,
} from "../../server/services/sync/asset-distribution";
import {
  ConfigSyncManager,
  ConfigStore,
} from "../../server/services/sync/config-sync";
import { SyncQueue, SyncQueueConsumer } from "../../server/services/sync/sync-queue";
import {
  SyncMonitorService,
  DashboardData,
} from "../../server/services/sync/sync-monitor";
import { ConflictResolutionEngine } from "../../server/services/sync/conflict-resolver";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Orchestrator state
 */
export type OrchestratorState =
  | "initializing"
  | "running"
  | "degraded"
  | "stopped"
  | "error";

/**
 * Sync topology type
 */
export type TopologyType =
  | "star"           // Single primary, multiple replicas
  | "mesh"           // All sites sync with each other
  | "hub_spoke"      // Regional hubs with local spokes
  | "chain"          // Linear replication chain
  | "custom";        // Custom topology

/**
 * Site connection
 */
export interface SiteConnection {
  sourceId: string;
  targetId: string;
  direction: SyncDirection;
  active: boolean;
  latency: number;
  lastSync: Date | null;
  errors: number;
}

/**
 * Scheduled sync job
 */
export interface ScheduledSyncJob {
  id: string;
  ruleId: string;
  schedule: string; // Cron expression
  nextRun: Date;
  lastRun: Date | null;
  enabled: boolean;
}

/**
 * Orchestrator options
 */
export interface OrchestratorOptions {
  /** Local site ID */
  siteId: string;
  /** Topology type */
  topology?: TopologyType;
  /** Auto-discover sites */
  autoDiscover?: boolean;
  /** Health check interval */
  healthCheckInterval?: number;
  /** Sync retry delay */
  retryDelay?: number;
  /** Max retry attempts */
  maxRetries?: number;
  /** Enable auto-failover */
  autoFailover?: boolean;
  /** Failover timeout */
  failoverTimeout?: number;
}

// =============================================================================
// SITE REGISTRY
// =============================================================================

/**
 * Site registry - manages known sites
 */
export class SiteRegistry extends EventEmitter {
  private sites: Map<string, SiteIdentity>;
  private connections: Map<string, SiteConnection>;
  private primarySiteId: string | null;

  constructor() {
    super();
    this.sites = new Map();
    this.connections = new Map();
    this.primarySiteId = null;
  }

  /**
   * Register a site
   */
  register(site: SiteIdentity): void {
    this.sites.set(site.id, site);

    if (site.role === "primary") {
      this.primarySiteId = site.id;
    }

    this.emit("site_registered", site);
  }

  /**
   * Unregister a site
   */
  unregister(siteId: string): void {
    const site = this.sites.get(siteId);
    if (!site) return;

    this.sites.delete(siteId);

    if (this.primarySiteId === siteId) {
      this.primarySiteId = null;
    }

    // Remove connections
    for (const [key, conn] of this.connections) {
      if (conn.sourceId === siteId || conn.targetId === siteId) {
        this.connections.delete(key);
      }
    }

    this.emit("site_unregistered", siteId);
  }

  /**
   * Get a site by ID
   */
  get(siteId: string): SiteIdentity | undefined {
    return this.sites.get(siteId);
  }

  /**
   * Get all sites
   */
  getAll(): SiteIdentity[] {
    return Array.from(this.sites.values());
  }

  /**
   * Get sites by role
   */
  getByRole(role: SiteRole): SiteIdentity[] {
    return this.getAll().filter((s) => s.role === role);
  }

  /**
   * Get primary site
   */
  getPrimary(): SiteIdentity | undefined {
    return this.primarySiteId ? this.sites.get(this.primarySiteId) : undefined;
  }

  /**
   * Update site status
   */
  updateStatus(siteId: string, status: Partial<SiteStatus>): void {
    const site = this.sites.get(siteId);
    if (site) {
      site.status = { ...site.status, ...status };
      site.lastSeen = new Date();
      this.emit("site_status_updated", site);
    }
  }

  /**
   * Add a connection between sites
   */
  addConnection(
    sourceId: string,
    targetId: string,
    direction: SyncDirection
  ): SiteConnection {
    const key = `${sourceId}->${targetId}`;
    const connection: SiteConnection = {
      sourceId,
      targetId,
      direction,
      active: true,
      latency: 0,
      lastSync: null,
      errors: 0,
    };

    this.connections.set(key, connection);
    this.emit("connection_added", connection);

    return connection;
  }

  /**
   * Get connection between sites
   */
  getConnection(sourceId: string, targetId: string): SiteConnection | undefined {
    return this.connections.get(`${sourceId}->${targetId}`);
  }

  /**
   * Get all connections for a site
   */
  getConnectionsFor(siteId: string): SiteConnection[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.sourceId === siteId || c.targetId === siteId
    );
  }

  /**
   * Get all connections
   */
  getAllConnections(): SiteConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get online sites
   */
  getOnlineSites(): SiteIdentity[] {
    return this.getAll().filter((s) => s.status.online);
  }

  /**
   * Count sites
   */
  get count(): number {
    return this.sites.size;
  }
}

// =============================================================================
// SYNC SCHEDULER
// =============================================================================

/**
 * Sync scheduler - manages scheduled sync jobs
 */
export class SyncScheduler extends EventEmitter {
  private jobs: Map<string, ScheduledSyncJob>;
  private timers: Map<string, NodeJS.Timeout>;
  private running: boolean;

  constructor() {
    super();
    this.jobs = new Map();
    this.timers = new Map();
    this.running = false;
  }

  /**
   * Schedule a sync job
   */
  schedule(
    ruleId: string,
    cronExpression: string
  ): ScheduledSyncJob {
    const job: ScheduledSyncJob = {
      id: uuidv4(),
      ruleId,
      schedule: cronExpression,
      nextRun: this.parseNextRun(cronExpression),
      lastRun: null,
      enabled: true,
    };

    this.jobs.set(job.id, job);

    if (this.running) {
      this.scheduleTimer(job);
    }

    this.emit("job_scheduled", job);
    return job;
  }

  /**
   * Cancel a scheduled job
   */
  cancel(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }

    this.jobs.delete(jobId);
    this.emit("job_cancelled", jobId);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;

    this.running = true;

    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this.scheduleTimer(job);
      }
    }

    this.emit("started");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.running = false;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.emit("stopped");
  }

  /**
   * Enable a job
   */
  enable(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = true;
      if (this.running) {
        this.scheduleTimer(job);
      }
    }
  }

  /**
   * Disable a job
   */
  disable(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = false;
      const timer = this.timers.get(jobId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(jobId);
      }
    }
  }

  /**
   * Get all jobs
   */
  getJobs(): ScheduledSyncJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs for a rule
   */
  getJobsForRule(ruleId: string): ScheduledSyncJob[] {
    return this.getJobs().filter((j) => j.ruleId === ruleId);
  }

  private scheduleTimer(job: ScheduledSyncJob): void {
    const delay = job.nextRun.getTime() - Date.now();

    if (delay <= 0) {
      // Run immediately
      this.executeJob(job);
      return;
    }

    const timer = setTimeout(() => {
      this.executeJob(job);
    }, delay);

    this.timers.set(job.id, timer);
  }

  private executeJob(job: ScheduledSyncJob): void {
    job.lastRun = new Date();
    job.nextRun = this.parseNextRun(job.schedule);

    this.emit("job_executing", job);

    // Reschedule
    if (this.running && job.enabled) {
      this.scheduleTimer(job);
    }
  }

  private parseNextRun(cronExpression: string): Date {
    // Simplified cron parsing - in production use a proper cron library
    // For now, just schedule 1 hour from now
    return new Date(Date.now() + 60 * 60 * 1000);
  }
}

// =============================================================================
// FAILOVER MANAGER
// =============================================================================

/**
 * Failover manager - handles automatic failover
 */
export class FailoverManager extends EventEmitter {
  private registry: SiteRegistry;
  private failoverTimeout: number;
  private checkInterval: NodeJS.Timeout | null;

  constructor(registry: SiteRegistry, failoverTimeout: number = 60000) {
    super();
    this.registry = registry;
    this.failoverTimeout = failoverTimeout;
    this.checkInterval = null;
  }

  /**
   * Start monitoring for failover
   */
  start(): void {
    this.checkInterval = setInterval(() => {
      this.checkForFailover();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check if failover is needed
   */
  private checkForFailover(): void {
    const primary = this.registry.getPrimary();
    if (!primary) return;

    // Check if primary is offline
    if (!primary.status.online) {
      const offlineTime = Date.now() - primary.lastSeen.getTime();

      if (offlineTime > this.failoverTimeout) {
        this.initiateFailover(primary);
      }
    }
  }

  /**
   * Initiate failover to a new primary
   */
  private initiateFailover(oldPrimary: SiteIdentity): void {
    this.emit("failover_initiated", oldPrimary);

    // Find best candidate for new primary
    const replicas = this.registry.getByRole("replica");
    const onlineReplicas = replicas.filter((r) => r.status.online);

    if (onlineReplicas.length === 0) {
      this.emit("failover_failed", "No online replicas available");
      return;
    }

    // Select replica with best health score
    const newPrimary = onlineReplicas.reduce((best, current) =>
      current.status.healthScore > best.status.healthScore ? current : best
    );

    // Promote to primary
    newPrimary.role = "primary";
    oldPrimary.role = "replica";

    this.registry.register(newPrimary);
    this.registry.register(oldPrimary);

    this.emit("failover_completed", {
      oldPrimary: oldPrimary.id,
      newPrimary: newPrimary.id,
    });
  }

  /**
   * Manually trigger failover
   */
  manualFailover(newPrimaryId: string): void {
    const oldPrimary = this.registry.getPrimary();
    const newPrimary = this.registry.get(newPrimaryId);

    if (!newPrimary) {
      throw new Error(`Site ${newPrimaryId} not found`);
    }

    if (!newPrimary.status.online) {
      throw new Error(`Site ${newPrimaryId} is offline`);
    }

    newPrimary.role = "primary";
    if (oldPrimary) {
      oldPrimary.role = "replica";
      this.registry.register(oldPrimary);
    }

    this.registry.register(newPrimary);

    this.emit("failover_completed", {
      oldPrimary: oldPrimary?.id,
      newPrimary: newPrimary.id,
      manual: true,
    });
  }
}

// =============================================================================
// SYNC ORCHESTRATOR
// =============================================================================

/**
 * Events emitted by orchestrator
 */
export interface OrchestratorEvents {
  state_changed: (state: OrchestratorState) => void;
  site_added: (site: SiteIdentity) => void;
  site_removed: (siteId: string) => void;
  sync_started: (session: SyncSession) => void;
  sync_completed: (session: SyncSession) => void;
  sync_failed: (session: SyncSession, error: SyncError) => void;
  conflict_detected: (conflict: ConflictRecord) => void;
  failover: (oldPrimary: string, newPrimary: string) => void;
  error: (error: Error) => void;
}

/**
 * Multi-site synchronization orchestrator
 */
export class SyncOrchestrator extends EventEmitter {
  private options: Required<OrchestratorOptions>;
  private state: OrchestratorState;
  private registry: SiteRegistry;
  private scheduler: SyncScheduler;
  private failoverManager: FailoverManager;
  private replicationManager: ReplicationManager | null;
  private configManager: ConfigSyncManager | null;
  private queue: SyncQueue;
  private monitor: SyncMonitorService;
  private conflictResolver: ConflictResolutionEngine;
  private syndicationRules: Map<string, SyndicationRule>;
  private activeSessions: Map<string, SyncSession>;
  private healthCheckInterval: NodeJS.Timeout | null;

  constructor(
    private contentStorage: ContentStorage,
    private configStore: ConfigStore,
    options: OrchestratorOptions
  ) {
    super();

    this.options = {
      siteId: options.siteId,
      topology: options.topology || "star",
      autoDiscover: options.autoDiscover ?? false,
      healthCheckInterval: options.healthCheckInterval || 30000,
      retryDelay: options.retryDelay || 5000,
      maxRetries: options.maxRetries || 3,
      autoFailover: options.autoFailover ?? true,
      failoverTimeout: options.failoverTimeout || 60000,
    };

    this.state = "initializing";
    this.registry = new SiteRegistry();
    this.scheduler = new SyncScheduler();
    this.failoverManager = new FailoverManager(
      this.registry,
      this.options.failoverTimeout
    );
    this.replicationManager = null;
    this.configManager = null;
    this.queue = new SyncQueue();
    this.monitor = new SyncMonitorService();
    this.conflictResolver = new ConflictResolutionEngine();
    this.syndicationRules = new Map();
    this.activeSessions = new Map();
    this.healthCheckInterval = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    this.setState("initializing");

    // Create replication manager
    this.replicationManager = new ReplicationManager(
      this.options.siteId,
      this.contentStorage
    );

    // Create config manager
    this.configManager = new ConfigSyncManager(
      this.options.siteId,
      this.configStore
    );

    // Set up monitor
    this.monitor.setSyncQueue(this.queue);

    // Register local site
    const localSite = this.createLocalSiteIdentity();
    this.registry.register(localSite);
    this.monitor.registerSite(localSite);

    this.setState("running");
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.state !== "running") {
      await this.initialize();
    }

    // Start components
    this.scheduler.start();
    this.monitor.start();

    if (this.options.autoFailover) {
      this.failoverManager.start();
    }

    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.options.healthCheckInterval);

    // Auto-discover sites if enabled
    if (this.options.autoDiscover) {
      await this.discoverSites();
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    this.scheduler.stop();
    this.monitor.stop();
    this.failoverManager.stop();
    this.queue.stop();

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    await this.replicationManager?.stopAll();

    this.setState("stopped");
  }

  /**
   * Add a site to the network
   */
  addSite(site: SiteIdentity): void {
    this.registry.register(site);
    this.replicationManager?.registerSite(site);
    this.monitor.registerSite(site);

    // Set up connections based on topology
    this.setupTopologyConnections(site);

    this.emit("site_added", site);
  }

  /**
   * Remove a site from the network
   */
  removeSite(siteId: string): void {
    this.registry.unregister(siteId);
    this.monitor.unregisterSite(siteId);

    this.emit("site_removed", siteId);
  }

  /**
   * Add a syndication rule
   */
  addSyndicationRule(rule: SyndicationRule): void {
    this.syndicationRules.set(rule.id, rule);
    this.replicationManager?.addRule(rule);

    // Schedule if has cron expression
    if (rule.schedule) {
      this.scheduler.schedule(rule.id, rule.schedule);
    }
  }

  /**
   * Remove a syndication rule
   */
  removeSyndicationRule(ruleId: string): void {
    this.syndicationRules.delete(ruleId);
    this.replicationManager?.removeRule(ruleId);

    // Cancel scheduled jobs
    const jobs = this.scheduler.getJobsForRule(ruleId);
    for (const job of jobs) {
      this.scheduler.cancel(job.id);
    }
  }

  /**
   * Trigger immediate sync based on a rule
   */
  async triggerSync(ruleId: string): Promise<SyncSession[]> {
    const rule = this.syndicationRules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const sessions = await this.replicationManager?.startReplication(ruleId);
    return sessions || [];
  }

  /**
   * Sync content to a specific site
   */
  async syncToSite(
    targetSiteId: string,
    options?: {
      contentTypes?: string[];
      mode?: SyncMode;
    }
  ): Promise<SyncSession | null> {
    const targetSite = this.registry.get(targetSiteId);
    if (!targetSite) {
      throw new Error(`Site ${targetSiteId} not found`);
    }

    const localSite = this.registry.get(this.options.siteId);
    if (!localSite) {
      throw new Error("Local site not registered");
    }

    // Create ad-hoc rule
    const rule: SyndicationRule = {
      id: uuidv4(),
      name: `Sync to ${targetSite.name}`,
      active: true,
      sourceSites: [this.options.siteId],
      targetSites: [targetSiteId],
      contentTypes: options?.contentTypes || [],
      mode: options?.mode || "incremental",
      conflictStrategy: "last_write_wins",
      priority: 10,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.replicationManager?.addRule(rule);

    try {
      const sessions = await this.replicationManager?.startReplication(rule.id);
      return sessions?.[0] || null;
    } finally {
      this.replicationManager?.removeRule(rule.id);
    }
  }

  /**
   * Export configuration
   */
  async exportConfig(name?: string): Promise<unknown> {
    return this.configManager?.export({ name });
  }

  /**
   * Import configuration from another site
   */
  async importConfigFromSite(
    sourceSiteId: string,
    options?: {
      environment?: string;
      dryRun?: boolean;
    }
  ): Promise<unknown> {
    const sourceSite = this.registry.get(sourceSiteId);
    if (!sourceSite) {
      throw new Error(`Site ${sourceSiteId} not found`);
    }

    return this.configManager?.syncFromSite(sourceSite, options);
  }

  /**
   * Get dashboard data
   */
  getDashboard(): DashboardData {
    return this.monitor.getDashboard();
  }

  /**
   * Get all sites
   */
  getSites(): SiteIdentity[] {
    return this.registry.getAll();
  }

  /**
   * Get site connections
   */
  getConnections(): SiteConnection[] {
    return this.registry.getAllConnections();
  }

  /**
   * Get active sync sessions
   */
  getActiveSessions(): SyncSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get syndication rules
   */
  getSyndicationRules(): SyndicationRule[] {
    return Array.from(this.syndicationRules.values());
  }

  /**
   * Get scheduled jobs
   */
  getScheduledJobs(): ScheduledSyncJob[] {
    return this.scheduler.getJobs();
  }

  /**
   * Get current state
   */
  getState(): OrchestratorState {
    return this.state;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private setState(state: OrchestratorState): void {
    this.state = state;
    this.emit("state_changed", state);
  }

  private setupEventHandlers(): void {
    // Scheduler events
    this.scheduler.on("job_executing", async (job) => {
      try {
        await this.triggerSync(job.ruleId);
      } catch (error) {
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
      }
    });

    // Failover events
    this.failoverManager.on("failover_completed", ({ oldPrimary, newPrimary }) => {
      this.emit("failover", oldPrimary, newPrimary);
    });

    // Conflict events
    this.conflictResolver.on("conflict_detected", (conflict) => {
      this.emit("conflict_detected", conflict);
    });

    // Registry events
    this.registry.on("site_status_updated", (site) => {
      // Check if we need to update topology
      if (!site.status.online) {
        this.handleSiteOffline(site);
      }
    });
  }

  private createLocalSiteIdentity(): SiteIdentity {
    return {
      id: this.options.siteId,
      name: `Site ${this.options.siteId}`,
      endpoint: "http://localhost:5000",
      role: "replica",
      region: "default",
      zone: "default",
      vectorClockId: 1,
      metadata: {},
      capabilities: {
        canReceivePush: true,
        canPull: true,
        supportsRealtime: true,
        supportsDeltaSync: true,
        maxConcurrentSync: 5,
        supportedContentTypes: [],
        supportedAssetTypes: [],
        bandwidthLimit: 0,
      },
      connection: {
        authMethod: "api_key",
        credentials: "",
        timeout: 30000,
        retry: {
          maxAttempts: 3,
          backoffMs: 1000,
          maxBackoffMs: 30000,
        },
        tls: {
          verify: true,
        },
      },
      status: {
        online: true,
        lastSync: null,
        pendingChanges: 0,
        syncLag: 0,
        healthScore: 100,
        activeConnections: 0,
        error: null,
      },
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private setupTopologyConnections(site: SiteIdentity): void {
    switch (this.options.topology) {
      case "star":
        // Connect to primary
        const primary = this.registry.getPrimary();
        if (primary && primary.id !== site.id) {
          this.registry.addConnection(primary.id, site.id, "push");
          this.registry.addConnection(site.id, primary.id, "pull");
        }
        break;

      case "mesh":
        // Connect to all other sites
        for (const other of this.registry.getAll()) {
          if (other.id !== site.id) {
            this.registry.addConnection(site.id, other.id, "bidirectional");
          }
        }
        break;

      case "hub_spoke":
        // Connect to hub based on region
        const hubs = this.registry.getByRole("hub");
        const regionalHub = hubs.find((h) => h.region === site.region);
        if (regionalHub && regionalHub.id !== site.id) {
          this.registry.addConnection(regionalHub.id, site.id, "bidirectional");
        }
        break;

      case "chain":
        // Connect to previous site in chain
        const allSites = this.registry.getAll();
        const index = allSites.findIndex((s) => s.id === site.id);
        if (index > 0) {
          this.registry.addConnection(allSites[index - 1].id, site.id, "push");
        }
        break;
    }
  }

  private async discoverSites(): Promise<void> {
    // In production, would discover sites via DNS, API, or registry
    // For now, this is a placeholder
  }

  private async performHealthChecks(): Promise<void> {
    for (const site of this.registry.getAll()) {
      try {
        const healthy = await this.checkSiteHealth(site);
        this.registry.updateStatus(site.id, {
          online: healthy,
          healthScore: healthy ? 100 : 0,
        });
      } catch (error) {
        this.registry.updateStatus(site.id, {
          online: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async checkSiteHealth(site: SiteIdentity): Promise<boolean> {
    // In production, would ping the site endpoint
    // For now, always return true for local site
    return site.id === this.options.siteId;
  }

  private handleSiteOffline(site: SiteIdentity): void {
    // Update connections
    const connections = this.registry.getConnectionsFor(site.id);
    for (const conn of connections) {
      conn.active = false;
    }

    // If this is primary and auto-failover is enabled, failover manager will handle it
    if (site.role === "primary" && !this.options.autoFailover) {
      this.setState("degraded");
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  SiteRegistry,
  SyncScheduler,
  FailoverManager,
  SyncOrchestrator,
};
