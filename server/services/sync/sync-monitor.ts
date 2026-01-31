/**
 * @file sync-monitor.ts
 * @description Sync Monitoring Dashboard Service
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Comprehensive monitoring for multi-site synchronization:
 * - Real-time sync status
 * - Metrics collection and aggregation
 * - Health checks
 * - Alerting
 * - Historical analysis
 */

import { EventEmitter } from "events";
import {
  SyncMetrics,
  SyncHealthCheck,
  SyncHealthCheckItem,
  SyncAlert,
  SyncSession,
  SyncProgress,
  SiteIdentity,
  SiteStatus,
  ConflictRecord,
  SyncError,
} from "./types";
import { SyncQueue, QueueStats } from "./sync-queue";
import { ContentReplicator, ReplicationState } from "./content-replication";
import { AssetDistributionService, AssetSyncState } from "./asset-distribution";
import { ConfigSyncManager, ConfigSyncState } from "./config-sync";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dashboard data
 */
export interface DashboardData {
  /** Overview metrics */
  overview: {
    sitesOnline: number;
    sitesTotal: number;
    activeSyncs: number;
    pendingChanges: number;
    unresolvedConflicts: number;
    activeAlerts: number;
  };
  /** Site statuses */
  sites: SiteStatusEntry[];
  /** Active sync sessions */
  sessions: SyncSessionSummary[];
  /** Recent alerts */
  alerts: SyncAlert[];
  /** Metrics summary */
  metrics: MetricsSummary;
  /** Queue status */
  queue: QueueStats;
  /** Last updated */
  lastUpdated: Date;
}

/**
 * Site status entry
 */
export interface SiteStatusEntry {
  site: SiteIdentity;
  status: SiteStatus;
  syncState: SyncStateEntry;
}

/**
 * Sync state entry
 */
export interface SyncStateEntry {
  content: ReplicationState;
  assets: AssetSyncState;
  config: ConfigSyncState;
}

/**
 * Sync session summary
 */
export interface SyncSessionSummary {
  id: string;
  sourceSite: string;
  targetSite: string;
  direction: string;
  status: string;
  progress: number;
  startedAt: Date;
  duration: number;
  errors: number;
  conflicts: number;
}

/**
 * Metrics summary
 */
export interface MetricsSummary {
  last24Hours: {
    changesSynced: number;
    bytesTransferred: number;
    errorsCount: number;
    conflictsCount: number;
    avgLatency: number;
  };
  last7Days: {
    changesSynced: number;
    bytesTransferred: number;
    errorsCount: number;
    conflictsCount: number;
    avgLatency: number;
  };
}

/**
 * Monitor options
 */
export interface MonitorOptions {
  /** Metrics collection interval in ms */
  metricsInterval?: number;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Alert retention in ms */
  alertRetention?: number;
  /** Metrics retention in ms */
  metricsRetention?: number;
  /** Lag threshold for alerts (ms) */
  lagThreshold?: number;
  /** Error rate threshold for alerts (percentage) */
  errorRateThreshold?: number;
}

// =============================================================================
// METRICS COLLECTOR
// =============================================================================

/**
 * Metrics time series entry
 */
interface MetricsEntry {
  timestamp: Date;
  metrics: SyncMetrics;
}

/**
 * Metrics collector
 */
export class MetricsCollector {
  private entries: Map<string, MetricsEntry[]>;
  private retention: number;

  constructor(retention: number = 7 * 24 * 60 * 60 * 1000) {
    this.entries = new Map();
    this.retention = retention;
  }

  /**
   * Record metrics
   */
  record(siteId: string, metrics: SyncMetrics): void {
    if (!this.entries.has(siteId)) {
      this.entries.set(siteId, []);
    }

    const siteEntries = this.entries.get(siteId)!;
    siteEntries.push({
      timestamp: new Date(),
      metrics,
    });

    // Prune old entries
    this.prune(siteId);
  }

  /**
   * Get metrics for a site within a time range
   */
  getMetrics(
    siteId: string,
    since: Date,
    until: Date = new Date()
  ): MetricsEntry[] {
    const siteEntries = this.entries.get(siteId) || [];
    return siteEntries.filter(
      (e) => e.timestamp >= since && e.timestamp <= until
    );
  }

  /**
   * Aggregate metrics over a period
   */
  aggregate(siteId: string, since: Date, until: Date = new Date()): SyncMetrics {
    const entries = this.getMetrics(siteId, since, until);

    if (entries.length === 0) {
      return this.emptyMetrics(siteId);
    }

    const aggregated: SyncMetrics = {
      siteId,
      window: { start: since, end: until },
      changesSynced: 0,
      bytesTransferred: 0,
      averageLatency: 0,
      p99Latency: 0,
      errorRate: 0,
      conflictRate: 0,
      queueDepth: 0,
      activeSessions: 0,
      bandwidthUsage: { inbound: 0, outbound: 0 },
    };

    const latencies: number[] = [];

    for (const entry of entries) {
      aggregated.changesSynced += entry.metrics.changesSynced;
      aggregated.bytesTransferred += entry.metrics.bytesTransferred;
      latencies.push(entry.metrics.averageLatency);
      aggregated.bandwidthUsage.inbound += entry.metrics.bandwidthUsage.inbound;
      aggregated.bandwidthUsage.outbound += entry.metrics.bandwidthUsage.outbound;
    }

    // Calculate averages
    if (latencies.length > 0) {
      aggregated.averageLatency =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;

      // Calculate P99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      aggregated.p99Latency = latencies[p99Index] || latencies[latencies.length - 1];
    }

    // Use latest values for current state
    const latest = entries[entries.length - 1].metrics;
    aggregated.errorRate = latest.errorRate;
    aggregated.conflictRate = latest.conflictRate;
    aggregated.queueDepth = latest.queueDepth;
    aggregated.activeSessions = latest.activeSessions;

    return aggregated;
  }

  /**
   * Get all site IDs with metrics
   */
  getSiteIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Prune old entries for a site
   */
  private prune(siteId: string): void {
    const siteEntries = this.entries.get(siteId);
    if (!siteEntries) return;

    const cutoff = new Date(Date.now() - this.retention);
    const pruned = siteEntries.filter((e) => e.timestamp >= cutoff);
    this.entries.set(siteId, pruned);
  }

  /**
   * Create empty metrics
   */
  private emptyMetrics(siteId: string): SyncMetrics {
    const now = new Date();
    return {
      siteId,
      window: { start: now, end: now },
      changesSynced: 0,
      bytesTransferred: 0,
      averageLatency: 0,
      p99Latency: 0,
      errorRate: 0,
      conflictRate: 0,
      queueDepth: 0,
      activeSessions: 0,
      bandwidthUsage: { inbound: 0, outbound: 0 },
    };
  }
}

// =============================================================================
// HEALTH CHECKER
// =============================================================================

/**
 * Health check function
 */
type HealthCheckFn = () => Promise<SyncHealthCheckItem>;

/**
 * Health checker
 */
export class HealthChecker {
  private checks: Map<string, HealthCheckFn>;

  constructor() {
    this.checks = new Map();
  }

  /**
   * Register a health check
   */
  register(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async runAll(): Promise<SyncHealthCheck> {
    const startTime = Date.now();
    const items: SyncHealthCheckItem[] = [];

    for (const [name, check] of this.checks) {
      try {
        const checkStart = Date.now();
        const result = await check();
        result.duration = Date.now() - checkStart;
        items.push(result);
      } catch (error) {
        items.push({
          name,
          status: "fail",
          message: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        });
      }
    }

    // Determine overall status
    const hasFail = items.some((i) => i.status === "fail");
    const hasWarn = items.some((i) => i.status === "warn");

    return {
      status: hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy",
      checks: items,
      checkedAt: new Date(),
    };
  }
}

// =============================================================================
// ALERT MANAGER
// =============================================================================

/**
 * Alert rule
 */
export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: SyncMetrics) => boolean;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  cooldown: number; // ms between alerts
}

/**
 * Alert manager
 */
export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule>;
  private alerts: SyncAlert[];
  private lastFired: Map<string, Date>;
  private retention: number;

  constructor(retention: number = 7 * 24 * 60 * 60 * 1000) {
    super();
    this.rules = new Map();
    this.alerts = [];
    this.lastFired = new Map();
    this.retention = retention;
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Evaluate metrics against rules
   */
  evaluate(metrics: SyncMetrics): SyncAlert[] {
    const newAlerts: SyncAlert[] = [];
    const now = new Date();

    for (const rule of this.rules.values()) {
      try {
        if (rule.condition(metrics)) {
          // Check cooldown
          const lastFired = this.lastFired.get(rule.id);
          if (lastFired && now.getTime() - lastFired.getTime() < rule.cooldown) {
            continue;
          }

          const alert: SyncAlert = {
            id: uuidv4(),
            type: this.getAlertType(rule.id),
            severity: rule.severity,
            message: rule.message,
            sourceSite: metrics.siteId,
            firedAt: now,
            resolvedAt: null,
            acknowledgedBy: null,
            metadata: { metrics },
          };

          this.alerts.push(alert);
          this.lastFired.set(rule.id, now);
          newAlerts.push(alert);
          this.emit("alert_fired", alert);
        }
      } catch (error) {
        // Ignore rule evaluation errors
      }
    }

    this.prune();
    return newAlerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledge(alertId: string, by: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledgedBy = by;
      this.emit("alert_acknowledged", alert);
    }
  }

  /**
   * Resolve an alert
   */
  resolve(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      this.emit("alert_resolved", alert);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): SyncAlert[] {
    return this.alerts.filter((a) => !a.resolvedAt);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): SyncAlert[] {
    return [...this.alerts];
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: string): SyncAlert[] {
    return this.alerts.filter((a) => a.severity === severity);
  }

  private getAlertType(
    ruleId: string
  ): "lag" | "error" | "conflict" | "offline" | "capacity" {
    if (ruleId.includes("lag")) return "lag";
    if (ruleId.includes("error")) return "error";
    if (ruleId.includes("conflict")) return "conflict";
    if (ruleId.includes("offline")) return "offline";
    return "capacity";
  }

  private prune(): void {
    const cutoff = new Date(Date.now() - this.retention);
    this.alerts = this.alerts.filter(
      (a) => a.firedAt >= cutoff || !a.resolvedAt
    );
  }
}

// =============================================================================
// SYNC MONITOR SERVICE
// =============================================================================

/**
 * Events emitted by sync monitor
 */
export interface SyncMonitorEvents {
  metrics_collected: (metrics: SyncMetrics) => void;
  health_check_complete: (health: SyncHealthCheck) => void;
  alert_fired: (alert: SyncAlert) => void;
  dashboard_updated: (dashboard: DashboardData) => void;
}

/**
 * Sync monitoring service
 */
export class SyncMonitorService extends EventEmitter {
  private options: Required<MonitorOptions>;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  private alertManager: AlertManager;
  private sites: Map<string, SiteIdentity>;
  private siteStatuses: Map<string, SiteStatus>;
  private replicators: Map<string, ContentReplicator>;
  private sessions: Map<string, SyncSession>;
  private conflicts: ConflictRecord[];
  private syncQueue: SyncQueue | null;
  private metricsInterval: NodeJS.Timeout | null;
  private healthInterval: NodeJS.Timeout | null;

  constructor(options: MonitorOptions = {}) {
    super();

    this.options = {
      metricsInterval: options.metricsInterval || 60000, // 1 minute
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      alertRetention: options.alertRetention || 7 * 24 * 60 * 60 * 1000, // 7 days
      metricsRetention: options.metricsRetention || 30 * 24 * 60 * 60 * 1000, // 30 days
      lagThreshold: options.lagThreshold || 60000, // 1 minute
      errorRateThreshold: options.errorRateThreshold || 5, // 5%
    };

    this.metricsCollector = new MetricsCollector(this.options.metricsRetention);
    this.healthChecker = new HealthChecker();
    this.alertManager = new AlertManager(this.options.alertRetention);
    this.sites = new Map();
    this.siteStatuses = new Map();
    this.replicators = new Map();
    this.sessions = new Map();
    this.conflicts = [];
    this.syncQueue = null;
    this.metricsInterval = null;
    this.healthInterval = null;

    // Forward alert events
    this.alertManager.on("alert_fired", (alert) => {
      this.emit("alert_fired", alert);
    });

    // Set up default alert rules
    this.setupDefaultAlertRules();
  }

  /**
   * Register a site for monitoring
   */
  registerSite(site: SiteIdentity): void {
    this.sites.set(site.id, site);
    this.siteStatuses.set(site.id, site.status);

    // Add health check for site
    this.healthChecker.register(`site-${site.id}`, async () => ({
      name: `Site ${site.name} Connectivity`,
      status: site.status.online ? "pass" : "fail",
      message: site.status.online
        ? "Site is online"
        : `Site offline: ${site.status.error || "Unknown error"}`,
      duration: 0,
    }));
  }

  /**
   * Unregister a site
   */
  unregisterSite(siteId: string): void {
    this.sites.delete(siteId);
    this.siteStatuses.delete(siteId);
    this.healthChecker.unregister(`site-${siteId}`);
  }

  /**
   * Register a replicator for monitoring
   */
  registerReplicator(key: string, replicator: ContentReplicator): void {
    this.replicators.set(key, replicator);

    // Listen for session updates
    replicator.on("complete", (session) => {
      this.sessions.set(session.id, session);
    });

    replicator.on("error", (error) => {
      // Track errors
    });

    replicator.on("conflict_detected", (conflict) => {
      this.conflicts.push(conflict);
    });
  }

  /**
   * Set the sync queue for monitoring
   */
  setSyncQueue(queue: SyncQueue): void {
    this.syncQueue = queue;
  }

  /**
   * Start monitoring
   */
  start(): void {
    // Start metrics collection
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    // Start health checks
    this.healthInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.options.healthCheckInterval);

    // Initial collection
    this.collectMetrics();
    this.runHealthChecks();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  /**
   * Get dashboard data
   */
  getDashboard(): DashboardData {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate overview
    const sitesOnline = Array.from(this.siteStatuses.values()).filter(
      (s) => s.online
    ).length;

    const activeSyncs = Array.from(this.sessions.values()).filter(
      (s) => s.status === "running"
    ).length;

    const pendingChanges = this.syncQueue?.getStats().pendingMessages || 0;

    const unresolvedConflicts = this.conflicts.filter(
      (c) => c.status === "pending"
    ).length;

    const activeAlerts = this.alertManager.getActiveAlerts().length;

    // Build site statuses
    const siteEntries: SiteStatusEntry[] = [];
    for (const [siteId, site] of this.sites) {
      siteEntries.push({
        site,
        status: this.siteStatuses.get(siteId) || site.status,
        syncState: this.getSiteState(siteId),
      });
    }

    // Build session summaries
    const sessionSummaries: SyncSessionSummary[] = Array.from(
      this.sessions.values()
    )
      .slice(-20) // Last 20 sessions
      .map((session) => ({
        id: session.id,
        sourceSite: session.sourceSite,
        targetSite: session.targetSite,
        direction: session.direction,
        status: session.status,
        progress:
          session.progress.totalChanges > 0
            ? (session.progress.processedChanges / session.progress.totalChanges) *
              100
            : 0,
        startedAt: session.startedAt,
        duration: session.completedAt
          ? session.completedAt.getTime() - session.startedAt.getTime()
          : now.getTime() - session.startedAt.getTime(),
        errors: session.errors.length,
        conflicts: session.conflicts.length,
      }));

    // Calculate metrics summary
    const metrics24h = this.aggregateMetrics(last24Hours, now);
    const metrics7d = this.aggregateMetrics(last7Days, now);

    return {
      overview: {
        sitesOnline,
        sitesTotal: this.sites.size,
        activeSyncs,
        pendingChanges,
        unresolvedConflicts,
        activeAlerts,
      },
      sites: siteEntries,
      sessions: sessionSummaries,
      alerts: this.alertManager.getActiveAlerts().slice(-10),
      metrics: {
        last24Hours: {
          changesSynced: metrics24h.changesSynced,
          bytesTransferred: metrics24h.bytesTransferred,
          errorsCount: 0, // Would need to track separately
          conflictsCount: this.conflicts.filter(
            (c) => c.createdAt >= last24Hours
          ).length,
          avgLatency: metrics24h.averageLatency,
        },
        last7Days: {
          changesSynced: metrics7d.changesSynced,
          bytesTransferred: metrics7d.bytesTransferred,
          errorsCount: 0,
          conflictsCount: this.conflicts.filter((c) => c.createdAt >= last7Days)
            .length,
          avgLatency: metrics7d.averageLatency,
        },
      },
      queue: this.syncQueue?.getStats() || {
        totalMessages: 0,
        pendingMessages: 0,
        processingMessages: 0,
        deadLetterCount: 0,
        partitionCount: 0,
        consumerGroupCount: 0,
        partitions: {},
      },
      lastUpdated: now,
    };
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<SyncHealthCheck> {
    return this.healthChecker.runAll();
  }

  /**
   * Get metrics for a site
   */
  getMetrics(siteId: string, since: Date, until?: Date): SyncMetrics {
    return this.metricsCollector.aggregate(siteId, since, until);
  }

  /**
   * Get active alerts
   */
  getAlerts(): SyncAlert[] {
    return this.alertManager.getActiveAlerts();
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, by: string): void {
    this.alertManager.acknowledge(alertId, by);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    this.alertManager.resolve(alertId);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private collectMetrics(): void {
    for (const [siteId, status] of this.siteStatuses) {
      const queueStats = this.syncQueue?.getStats();
      const activeSessions = Array.from(this.sessions.values()).filter(
        (s) => s.status === "running" && (s.sourceSite === siteId || s.targetSite === siteId)
      );

      const metrics: SyncMetrics = {
        siteId,
        window: {
          start: new Date(Date.now() - this.options.metricsInterval),
          end: new Date(),
        },
        changesSynced: status.pendingChanges,
        bytesTransferred: 0, // Would need to track
        averageLatency: status.syncLag,
        p99Latency: status.syncLag * 1.5, // Estimate
        errorRate: 0, // Would need to calculate
        conflictRate: 0, // Would need to calculate
        queueDepth: queueStats?.pendingMessages || 0,
        activeSessions: activeSessions.length,
        bandwidthUsage: { inbound: 0, outbound: 0 },
      };

      this.metricsCollector.record(siteId, metrics);

      // Evaluate alert rules
      this.alertManager.evaluate(metrics);

      this.emit("metrics_collected", metrics);
    }
  }

  private async runHealthChecks(): Promise<void> {
    const health = await this.healthChecker.runAll();
    this.emit("health_check_complete", health);
  }

  private getSiteState(siteId: string): SyncStateEntry {
    // Get state from registered replicators
    let contentState: ReplicationState = "idle";
    for (const [key, replicator] of this.replicators) {
      if (key.includes(siteId)) {
        contentState = replicator.getState();
        break;
      }
    }

    return {
      content: contentState,
      assets: "idle",
      config: "idle",
    };
  }

  private aggregateMetrics(since: Date, until: Date): SyncMetrics {
    // Aggregate across all sites
    const allSiteIds = this.metricsCollector.getSiteIds();

    const aggregated: SyncMetrics = {
      siteId: "all",
      window: { start: since, end: until },
      changesSynced: 0,
      bytesTransferred: 0,
      averageLatency: 0,
      p99Latency: 0,
      errorRate: 0,
      conflictRate: 0,
      queueDepth: 0,
      activeSessions: 0,
      bandwidthUsage: { inbound: 0, outbound: 0 },
    };

    let latencySum = 0;
    let latencyCount = 0;

    for (const siteId of allSiteIds) {
      const siteMetrics = this.metricsCollector.aggregate(siteId, since, until);
      aggregated.changesSynced += siteMetrics.changesSynced;
      aggregated.bytesTransferred += siteMetrics.bytesTransferred;
      latencySum += siteMetrics.averageLatency;
      latencyCount++;
    }

    if (latencyCount > 0) {
      aggregated.averageLatency = latencySum / latencyCount;
    }

    return aggregated;
  }

  private setupDefaultAlertRules(): void {
    // High lag alert
    this.alertManager.addRule({
      id: "high-lag",
      name: "High Sync Lag",
      condition: (m) => m.averageLatency > this.options.lagThreshold,
      severity: "warning",
      message: "Sync lag exceeds threshold",
      cooldown: 5 * 60 * 1000, // 5 minutes
    });

    // Error rate alert
    this.alertManager.addRule({
      id: "high-error-rate",
      name: "High Error Rate",
      condition: (m) => m.errorRate > this.options.errorRateThreshold,
      severity: "error",
      message: "Error rate exceeds threshold",
      cooldown: 5 * 60 * 1000,
    });

    // Queue depth alert
    this.alertManager.addRule({
      id: "queue-depth",
      name: "High Queue Depth",
      condition: (m) => m.queueDepth > 10000,
      severity: "warning",
      message: "Sync queue depth is high",
      cooldown: 10 * 60 * 1000,
    });

    // Site offline alert
    this.alertManager.addRule({
      id: "site-offline",
      name: "Site Offline",
      condition: (m) => {
        const status = this.siteStatuses.get(m.siteId);
        return status ? !status.online : false;
      },
      severity: "critical",
      message: "Site is offline",
      cooldown: 1 * 60 * 1000,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MetricsCollector,
  HealthChecker,
  AlertManager,
  SyncMonitorService,
  DashboardData,
  SiteStatusEntry,
  SyncSessionSummary,
  MetricsSummary,
  AlertRule,
};
