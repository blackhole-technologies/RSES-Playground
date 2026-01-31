/**
 * @file monitoring.ts
 * @description Monitoring and logging system for automation.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Automation run history tracking
 * - Success/failure metrics
 * - Alert system for failures
 * - Performance analytics
 * - Audit logging
 * - Retention policies
 */

import { randomUUID } from "crypto";
import type {
  WorkflowId,
  ExecutionId,
  ExecutionStatus,
  AutomationRun,
  AutomationMetrics,
  AlertConfig,
  AlertCondition,
  NotificationChannel,
  TriggerType,
  ResourceUsage,
  SiteId,
} from "./types";

// ==================== Time Series Data ====================

/**
 * Time series data point.
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

/**
 * Time series aggregation.
 */
export interface TimeSeriesAggregation {
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Calculates percentile from sorted values.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Time series storage with retention.
 */
export class TimeSeriesStore {
  private data: Map<string, TimeSeriesPoint[]> = new Map();
  private retentionMs: number;
  private maxPointsPerMetric: number;

  constructor(retentionMs: number = 7 * 24 * 60 * 60 * 1000, maxPointsPerMetric: number = 10000) {
    this.retentionMs = retentionMs;
    this.maxPointsPerMetric = maxPointsPerMetric;
  }

  /**
   * Records a data point.
   */
  record(metric: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(metric, labels);

    let points = this.data.get(key);
    if (!points) {
      points = [];
      this.data.set(key, points);
    }

    points.push({
      timestamp: new Date(),
      value,
      labels,
    });

    // Enforce retention and max points
    this.enforceRetention(key);
  }

  /**
   * Queries data points within a time range.
   */
  query(
    metric: string,
    startTime: Date,
    endTime: Date,
    labels?: Record<string, string>
  ): TimeSeriesPoint[] {
    const key = this.getKey(metric, labels);
    const points = this.data.get(key) || [];

    return points.filter(
      (p) => p.timestamp >= startTime && p.timestamp <= endTime
    );
  }

  /**
   * Gets aggregated statistics.
   */
  aggregate(
    metric: string,
    startTime: Date,
    endTime: Date,
    labels?: Record<string, string>
  ): TimeSeriesAggregation | null {
    const points = this.query(metric, startTime, endTime, labels);

    if (points.length === 0) {
      return null;
    }

    const values = points.map((p) => p.value);
    const sortedValues = [...values].sort((a, b) => a - b);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      sum: values.reduce((a, b) => a + b, 0),
      count: values.length,
      p50: percentile(sortedValues, 50),
      p90: percentile(sortedValues, 90),
      p95: percentile(sortedValues, 95),
      p99: percentile(sortedValues, 99),
    };
  }

  /**
   * Gets rate (events per second) over a window.
   */
  rate(
    metric: string,
    windowMs: number,
    labels?: Record<string, string>
  ): number {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - windowMs);
    const points = this.query(metric, startTime, endTime, labels);

    return (points.length / windowMs) * 1000;
  }

  /**
   * Gets the metric key including labels.
   */
  private getKey(metric: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return metric;
    }
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${metric}{${sortedLabels}}`;
  }

  /**
   * Enforces retention policy.
   */
  private enforceRetention(key: string): void {
    const points = this.data.get(key);
    if (!points) return;

    const cutoff = new Date(Date.now() - this.retentionMs);

    // Remove old points
    while (points.length > 0 && points[0].timestamp < cutoff) {
      points.shift();
    }

    // Enforce max points
    while (points.length > this.maxPointsPerMetric) {
      points.shift();
    }
  }

  /**
   * Cleans up all expired data.
   */
  cleanup(): void {
    for (const key of this.data.keys()) {
      this.enforceRetention(key);
      const points = this.data.get(key);
      if (!points || points.length === 0) {
        this.data.delete(key);
      }
    }
  }
}

// ==================== Run History ====================

/**
 * Stores and retrieves automation run history.
 */
export class RunHistoryStore {
  private runs: Map<string, AutomationRun> = new Map();
  private workflowRuns: Map<WorkflowId, Set<string>> = new Map();
  private retentionDays: number;
  private maxRuns: number;

  constructor(retentionDays: number = 30, maxRuns: number = 10000) {
    this.retentionDays = retentionDays;
    this.maxRuns = maxRuns;
  }

  /**
   * Records a new run.
   */
  recordRun(run: AutomationRun): void {
    this.runs.set(run.id, run);

    // Index by workflow
    let workflowSet = this.workflowRuns.get(run.workflowId);
    if (!workflowSet) {
      workflowSet = new Set();
      this.workflowRuns.set(run.workflowId, workflowSet);
    }
    workflowSet.add(run.id);

    // Enforce limits
    this.enforceRetention();
  }

  /**
   * Updates a run.
   */
  updateRun(runId: string, updates: Partial<AutomationRun>): void {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, updates);
    }
  }

  /**
   * Gets a run by ID.
   */
  getRun(runId: string): AutomationRun | undefined {
    return this.runs.get(runId);
  }

  /**
   * Gets runs for a workflow.
   */
  getWorkflowRuns(
    workflowId: WorkflowId,
    options?: {
      limit?: number;
      offset?: number;
      status?: ExecutionStatus;
      startTime?: Date;
      endTime?: Date;
    }
  ): AutomationRun[] {
    const runIds = this.workflowRuns.get(workflowId);
    if (!runIds) return [];

    let runs = Array.from(runIds)
      .map((id) => this.runs.get(id))
      .filter((r): r is AutomationRun => r !== undefined);

    // Filter by status
    if (options?.status) {
      runs = runs.filter((r) => r.status === options.status);
    }

    // Filter by time
    if (options?.startTime) {
      runs = runs.filter((r) => r.startedAt >= options.startTime!);
    }
    if (options?.endTime) {
      runs = runs.filter((r) => r.startedAt <= options.endTime!);
    }

    // Sort by start time descending
    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;

    return runs.slice(offset, offset + limit);
  }

  /**
   * Gets recent runs across all workflows.
   */
  getRecentRuns(limit: number = 50): AutomationRun[] {
    return Array.from(this.runs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Gets run statistics.
   */
  getStatistics(
    workflowId?: WorkflowId,
    period?: { startTime: Date; endTime: Date }
  ): {
    total: number;
    successful: number;
    failed: number;
    cancelled: number;
    avgDurationMs: number;
    successRate: number;
  } {
    let runs: AutomationRun[];

    if (workflowId) {
      runs = this.getWorkflowRuns(workflowId);
    } else {
      runs = Array.from(this.runs.values());
    }

    if (period) {
      runs = runs.filter(
        (r) => r.startedAt >= period.startTime && r.startedAt <= period.endTime
      );
    }

    const successful = runs.filter((r) => r.status === "completed").length;
    const failed = runs.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const cancelled = runs.filter((r) => r.status === "cancelled").length;

    const completedRuns = runs.filter((r) => r.durationMs !== undefined);
    const avgDurationMs =
      completedRuns.length > 0
        ? completedRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / completedRuns.length
        : 0;

    return {
      total: runs.length,
      successful,
      failed,
      cancelled,
      avgDurationMs,
      successRate: runs.length > 0 ? successful / runs.length : 0,
    };
  }

  /**
   * Enforces retention policy.
   */
  private enforceRetention(): void {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    // Remove old runs
    for (const [id, run] of this.runs) {
      if (run.startedAt < cutoff) {
        this.runs.delete(id);

        const workflowSet = this.workflowRuns.get(run.workflowId);
        if (workflowSet) {
          workflowSet.delete(id);
        }
      }
    }

    // Enforce max runs
    if (this.runs.size > this.maxRuns) {
      const sortedRuns = Array.from(this.runs.values())
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

      const toRemove = sortedRuns.slice(0, this.runs.size - this.maxRuns);
      for (const run of toRemove) {
        this.runs.delete(run.id);
        const workflowSet = this.workflowRuns.get(run.workflowId);
        if (workflowSet) {
          workflowSet.delete(run.id);
        }
      }
    }
  }
}

// ==================== Alert Manager ====================

/**
 * Alert instance.
 */
export interface Alert {
  id: string;
  configId: string;
  name: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  notificationsSent: string[];
}

/**
 * Notification sender interface.
 */
export interface NotificationSender {
  send(channel: NotificationChannel, alert: Alert): Promise<boolean>;
}

/**
 * Default notification sender (console).
 */
export class ConsoleNotificationSender implements NotificationSender {
  async send(channel: NotificationChannel, alert: Alert): Promise<boolean> {
    console.log(`[ALERT] ${channel.type} -> ${channel.target}: ${alert.message}`);
    return true;
  }
}

/**
 * Manages alerts and notifications.
 */
export class AlertManager {
  private configs: Map<string, AlertConfig> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private cooldowns: Map<string, Date> = new Map();
  private notificationSender: NotificationSender;
  private metricsStore: TimeSeriesStore;
  private maxHistorySize: number = 1000;

  constructor(metricsStore: TimeSeriesStore, notificationSender?: NotificationSender) {
    this.metricsStore = metricsStore;
    this.notificationSender = notificationSender || new ConsoleNotificationSender();
  }

  /**
   * Registers an alert configuration.
   */
  registerAlert(config: AlertConfig): void {
    this.configs.set(config.id, config);
  }

  /**
   * Unregisters an alert configuration.
   */
  unregisterAlert(configId: string): void {
    this.configs.delete(configId);
  }

  /**
   * Enables or disables an alert.
   */
  setAlertEnabled(configId: string, enabled: boolean): void {
    const config = this.configs.get(configId);
    if (config) {
      config.enabled = enabled;
    }
  }

  /**
   * Checks all alert conditions.
   */
  async checkAlerts(): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const config of this.configs.values()) {
      if (!config.enabled) continue;

      // Check cooldown
      const cooldownEnd = this.cooldowns.get(config.id);
      if (cooldownEnd && new Date() < cooldownEnd) {
        continue;
      }

      const triggered = await this.checkCondition(config);
      if (triggered) {
        triggeredAlerts.push(triggered);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Acknowledges an alert.
   */
  acknowledgeAlert(alertId: string, userId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();

    return true;
  }

  /**
   * Resolves an alert.
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = new Date();
    this.activeAlerts.delete(alertId);
    this.alertHistory.push(alert);

    // Enforce history size
    while (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    return true;
  }

  /**
   * Gets active alerts.
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Gets alert history.
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Checks a single alert condition.
   */
  private async checkCondition(config: AlertConfig): Promise<Alert | null> {
    const { condition } = config;
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - condition.windowMs);

    // Get metric aggregation
    const aggregation = this.metricsStore.aggregate(
      this.getMetricName(condition.metric),
      windowStart,
      windowEnd
    );

    if (!aggregation || aggregation.count < condition.minSamples) {
      return null;
    }

    // Get the value to compare
    let value: number;
    switch (condition.metric) {
      case "error_rate":
        value = aggregation.avg;
        break;
      case "duration":
        value = aggregation.p95;
        break;
      case "queue_size":
        value = aggregation.max;
        break;
      case "failure_count":
        value = aggregation.sum;
        break;
      default:
        value = aggregation.avg;
    }

    // Check threshold
    let triggered = false;
    switch (condition.operator) {
      case "gt":
        triggered = value > condition.threshold;
        break;
      case "lt":
        triggered = value < condition.threshold;
        break;
      case "gte":
        triggered = value >= condition.threshold;
        break;
      case "lte":
        triggered = value <= condition.threshold;
        break;
      case "eq":
        triggered = value === condition.threshold;
        break;
    }

    if (!triggered) {
      // Check if we should resolve existing alert
      const existingAlert = Array.from(this.activeAlerts.values()).find(
        (a) => a.configId === config.id
      );
      if (existingAlert) {
        this.resolveAlert(existingAlert.id);
      }
      return null;
    }

    // Create alert
    const alert: Alert = {
      id: randomUUID(),
      configId: config.id,
      name: config.name,
      severity: this.getSeverity(condition.metric, value, condition.threshold),
      message: `${config.name}: ${condition.metric} is ${value.toFixed(2)} (threshold: ${condition.threshold})`,
      value,
      threshold: condition.threshold,
      triggeredAt: new Date(),
      acknowledged: false,
      notificationsSent: [],
    };

    this.activeAlerts.set(alert.id, alert);

    // Set cooldown
    this.cooldowns.set(config.id, new Date(Date.now() + config.cooldownMs));

    // Send notifications
    for (const channel of config.channels) {
      try {
        const sent = await this.notificationSender.send(channel, alert);
        if (sent) {
          alert.notificationsSent.push(`${channel.type}:${channel.target}`);
        }
      } catch (err) {
        console.error(`Failed to send notification to ${channel.type}:`, err);
      }
    }

    return alert;
  }

  /**
   * Gets metric name for condition.
   */
  private getMetricName(metric: AlertCondition["metric"]): string {
    const mapping: Record<AlertCondition["metric"], string> = {
      error_rate: "automation.error_rate",
      duration: "automation.duration",
      queue_size: "automation.queue_size",
      failure_count: "automation.failures",
    };
    return mapping[metric];
  }

  /**
   * Determines alert severity.
   */
  private getSeverity(
    metric: string,
    value: number,
    threshold: number
  ): "info" | "warning" | "critical" {
    const ratio = value / threshold;

    if (ratio >= 2) return "critical";
    if (ratio >= 1.5) return "warning";
    return "info";
  }
}

// ==================== Audit Logger ====================

/**
 * Audit log entry.
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  entityType: "workflow" | "execution" | "trigger" | "connection" | "alert";
  entityId: string;
  userId?: string;
  siteId: SiteId;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit log store.
 */
export class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private maxEntries: number;
  private retentionDays: number;

  constructor(maxEntries: number = 50000, retentionDays: number = 90) {
    this.maxEntries = maxEntries;
    this.retentionDays = retentionDays;
  }

  /**
   * Logs an audit entry.
   */
  log(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    this.entries.push(fullEntry);
    this.enforceRetention();

    return fullEntry;
  }

  /**
   * Queries audit log.
   */
  query(options: {
    entityType?: AuditLogEntry["entityType"];
    entityId?: string;
    userId?: string;
    action?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): AuditLogEntry[] {
    let results = [...this.entries];

    if (options.entityType) {
      results = results.filter((e) => e.entityType === options.entityType);
    }
    if (options.entityId) {
      results = results.filter((e) => e.entityId === options.entityId);
    }
    if (options.userId) {
      results = results.filter((e) => e.userId === options.userId);
    }
    if (options.action) {
      results = results.filter((e) => e.action.includes(options.action!));
    }
    if (options.startTime) {
      results = results.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter((e) => e.timestamp <= options.endTime!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Exports audit log to JSON.
   */
  export(options?: {
    startTime?: Date;
    endTime?: Date;
  }): string {
    let entries = this.entries;

    if (options?.startTime) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Enforces retention policy.
   */
  private enforceRetention(): void {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);

    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }
}

// ==================== Automation Monitor ====================

/**
 * Main automation monitoring service.
 */
export class AutomationMonitor {
  private metricsStore: TimeSeriesStore;
  private runHistory: RunHistoryStore;
  private alertManager: AlertManager;
  private auditLogger: AuditLogger;
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    this.metricsStore = new TimeSeriesStore();
    this.runHistory = new RunHistoryStore();
    this.alertManager = new AlertManager(this.metricsStore);
    this.auditLogger = new AuditLogger();

    // Register default alerts
    this.registerDefaultAlerts();
  }

  /**
   * Records an execution start.
   */
  recordExecutionStart(
    executionId: ExecutionId,
    workflowId: WorkflowId,
    workflowName: string,
    triggerType: TriggerType,
    siteId: SiteId,
    triggeredBy?: string
  ): void {
    const run: AutomationRun = {
      id: randomUUID(),
      executionId,
      workflowId,
      workflowName,
      triggerType,
      status: "running" as ExecutionStatus,
      startedAt: new Date(),
      stepsExecuted: 0,
      stepsSucceeded: 0,
      stepsFailed: 0,
      siteId,
      triggeredBy,
    };

    this.runHistory.recordRun(run);
    this.metricsStore.record("automation.executions.started", 1, { workflowId, siteId });

    this.auditLogger.log({
      action: "execution.started",
      entityType: "execution",
      entityId: executionId,
      userId: triggeredBy,
      siteId,
      details: { workflowId, workflowName, triggerType },
    });
  }

  /**
   * Records an execution completion.
   */
  recordExecutionComplete(
    executionId: ExecutionId,
    status: ExecutionStatus,
    stepsExecuted: number,
    stepsSucceeded: number,
    stepsFailed: number,
    error?: string,
    resourceUsage?: ResourceUsage
  ): void {
    const run = this.findRunByExecutionId(executionId);
    if (!run) return;

    const durationMs = Date.now() - run.startedAt.getTime();

    this.runHistory.updateRun(run.id, {
      status,
      completedAt: new Date(),
      durationMs,
      stepsExecuted,
      stepsSucceeded,
      stepsFailed,
      errorSummary: error,
      resourceUsage,
    });

    // Record metrics
    this.metricsStore.record("automation.executions.completed", 1, {
      workflowId: run.workflowId,
      status,
    });
    this.metricsStore.record("automation.duration", durationMs, {
      workflowId: run.workflowId,
    });

    if (status === "failed" || status === "timed_out") {
      this.metricsStore.record("automation.failures", 1, {
        workflowId: run.workflowId,
      });
      this.metricsStore.record("automation.error_rate", 1, {
        workflowId: run.workflowId,
      });
    } else {
      this.metricsStore.record("automation.error_rate", 0, {
        workflowId: run.workflowId,
      });
    }

    this.auditLogger.log({
      action: `execution.${status}`,
      entityType: "execution",
      entityId: executionId,
      siteId: run.siteId,
      details: {
        workflowId: run.workflowId,
        durationMs,
        stepsExecuted,
        stepsSucceeded,
        stepsFailed,
        error,
      },
    });
  }

  /**
   * Records a step execution.
   */
  recordStepExecution(
    executionId: ExecutionId,
    stepId: string,
    stepName: string,
    success: boolean,
    durationMs: number
  ): void {
    this.metricsStore.record("automation.steps.duration", durationMs, { stepId });
    this.metricsStore.record(
      success ? "automation.steps.success" : "automation.steps.failure",
      1,
      { stepId }
    );
  }

  /**
   * Gets automation metrics.
   */
  getMetrics(period?: { startTime: Date; endTime: Date }): AutomationMetrics {
    const endTime = period?.endTime || new Date();
    const startTime = period?.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    const stats = this.runHistory.getStatistics(undefined, { startTime, endTime });

    const durationAgg = this.metricsStore.aggregate(
      "automation.duration",
      startTime,
      endTime
    );

    // Get top errors
    const recentRuns = this.runHistory.getRecentRuns(100);
    const errorCounts = new Map<string, { count: number; message: string }>();
    for (const run of recentRuns) {
      if (run.errorSummary) {
        const existing = errorCounts.get(run.errorSummary) || { count: 0, message: run.errorSummary };
        existing.count++;
        errorCounts.set(run.errorSummary, existing);
      }
    }

    const topErrors = Array.from(errorCounts.entries())
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalExecutions: stats.total,
      successfulExecutions: stats.successful,
      failedExecutions: stats.failed,
      averageDurationMs: stats.avgDurationMs,
      p95DurationMs: durationAgg?.p95 || 0,
      executionsPerHour: stats.total / ((endTime.getTime() - startTime.getTime()) / 3600000),
      errorRate: stats.total > 0 ? stats.failed / stats.total : 0,
      topErrors,
      activeWorkflows: 0, // Would need workflow registry integration
      queuedExecutions: 0, // Would need queue integration
      resourceTrends: [],
    };
  }

  /**
   * Gets run history.
   */
  getRunHistory(options?: {
    workflowId?: WorkflowId;
    limit?: number;
    offset?: number;
    status?: ExecutionStatus;
    startTime?: Date;
    endTime?: Date;
  }): AutomationRun[] {
    if (options?.workflowId) {
      return this.runHistory.getWorkflowRuns(options.workflowId, options);
    }
    return this.runHistory.getRecentRuns(options?.limit);
  }

  /**
   * Gets active alerts.
   */
  getActiveAlerts(): Alert[] {
    return this.alertManager.getActiveAlerts();
  }

  /**
   * Gets audit log.
   */
  getAuditLog(options: Parameters<AuditLogger["query"]>[0]): AuditLogEntry[] {
    return this.auditLogger.query(options);
  }

  /**
   * Starts the monitoring service.
   */
  start(): void {
    // Check alerts periodically
    this.checkInterval = setInterval(async () => {
      await this.alertManager.checkAlerts();
      this.metricsStore.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Stops the monitoring service.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Finds a run by execution ID.
   */
  private findRunByExecutionId(executionId: ExecutionId): AutomationRun | undefined {
    const recentRuns = this.runHistory.getRecentRuns(1000);
    return recentRuns.find((r) => r.executionId === executionId);
  }

  /**
   * Registers default alert configurations.
   */
  private registerDefaultAlerts(): void {
    // High error rate alert
    this.alertManager.registerAlert({
      id: "high-error-rate",
      name: "High Error Rate",
      condition: {
        metric: "error_rate",
        operator: "gt",
        threshold: 0.1, // 10%
        windowMs: 300000, // 5 minutes
        minSamples: 5,
      },
      channels: [],
      cooldownMs: 600000, // 10 minutes
      enabled: true,
    });

    // Long duration alert
    this.alertManager.registerAlert({
      id: "long-duration",
      name: "Long Execution Duration",
      condition: {
        metric: "duration",
        operator: "gt",
        threshold: 300000, // 5 minutes
        windowMs: 600000, // 10 minutes
        minSamples: 3,
      },
      channels: [],
      cooldownMs: 900000, // 15 minutes
      enabled: true,
    });

    // High failure count alert
    this.alertManager.registerAlert({
      id: "high-failures",
      name: "High Failure Count",
      condition: {
        metric: "failure_count",
        operator: "gt",
        threshold: 10,
        windowMs: 3600000, // 1 hour
        minSamples: 1,
      },
      channels: [],
      cooldownMs: 3600000, // 1 hour
      enabled: true,
    });
  }
}

// ==================== Singleton Instance ====================

let automationMonitorInstance: AutomationMonitor | null = null;

/**
 * Gets the automation monitor instance.
 */
export function getAutomationMonitor(): AutomationMonitor {
  if (!automationMonitorInstance) {
    automationMonitorInstance = new AutomationMonitor();
  }
  return automationMonitorInstance;
}

/**
 * Resets the automation monitor (for testing).
 */
export function resetAutomationMonitor(): void {
  if (automationMonitorInstance) {
    automationMonitorInstance.stop();
    automationMonitorInstance = null;
  }
}
