/**
 * @file file-watcher-metrics.ts
 * @description Prometheus metrics for CMS file watcher service.
 * @tier Tier 2 telemetry — Metrics for file-watcher-cms.ts. See docs/architecture/FILE-WATCHERS.md.
 * @phase Phase 9 - CMS Content Type System
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 */

import { Registry, Counter, Histogram, Gauge, Summary } from "prom-client";
import type { WatchDirectoryType, FileEventType, WatcherHealthStatus } from "./file-watcher-cms";

// Use the existing registry or create dedicated one
const register = new Registry();

// =============================================================================
// FILE EVENT METRICS
// =============================================================================

/**
 * Total file events processed
 */
export const fileEventsTotal = new Counter({
  name: "file_watcher_events_total",
  help: "Total file events processed by the watcher",
  labelNames: ["event_type", "directory_type", "watch_root"],
  registers: [register],
});

/**
 * File events per second (rate)
 */
export const fileEventsRate = new Gauge({
  name: "file_watcher_events_rate",
  help: "File events per second",
  labelNames: ["directory_type"],
  registers: [register],
});

/**
 * Event processing duration
 */
export const eventProcessingDuration = new Histogram({
  name: "file_watcher_event_processing_seconds",
  help: "Time to process file events",
  labelNames: ["event_type", "directory_type"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/**
 * Debounced events (events combined by debouncer)
 */
export const debouncedEventsTotal = new Counter({
  name: "file_watcher_debounced_events_total",
  help: "Total events combined by debouncer",
  labelNames: ["directory_type"],
  registers: [register],
});

/**
 * Batch sizes (for batch debounce strategy)
 */
export const batchSizes = new Summary({
  name: "file_watcher_batch_size",
  help: "Size of event batches",
  labelNames: ["directory_type"],
  percentiles: [0.5, 0.9, 0.99],
  registers: [register],
});

// =============================================================================
// WATCHER STATE METRICS
// =============================================================================

/**
 * Number of active watchers
 */
export const activeWatchers = new Gauge({
  name: "file_watcher_active_count",
  help: "Number of active file watchers",
  registers: [register],
});

/**
 * Watched paths count
 */
export const watchedPathsCount = new Gauge({
  name: "file_watcher_watched_paths_count",
  help: "Total number of watched paths",
  labelNames: ["directory_type"],
  registers: [register],
});

/**
 * Pending events in debouncer queue
 */
export const pendingEventsCount = new Gauge({
  name: "file_watcher_pending_events_count",
  help: "Number of events pending in debouncer queue",
  labelNames: ["directory_type"],
  registers: [register],
});

/**
 * Watcher health status (1 = healthy, 0.5 = degraded, 0 = unhealthy)
 */
export const watcherHealthGauge = new Gauge({
  name: "file_watcher_health_status",
  help: "Watcher health status (1=healthy, 0.5=degraded, 0=unhealthy)",
  registers: [register],
});

/**
 * Watcher uptime
 */
export const watcherUptime = new Gauge({
  name: "file_watcher_uptime_seconds",
  help: "File watcher uptime in seconds",
  registers: [register],
});

// =============================================================================
// SYMLINK METRICS
// =============================================================================

/**
 * Total symlinks tracked
 */
export const symlinksTrackedTotal = new Gauge({
  name: "file_watcher_symlinks_tracked_total",
  help: "Total number of tracked symlinks",
  registers: [register],
});

/**
 * Broken symlinks count
 */
export const brokenSymlinksCount = new Gauge({
  name: "file_watcher_broken_symlinks_count",
  help: "Number of broken symlinks",
  registers: [register],
});

/**
 * Symlinks healed
 */
export const symlinksHealedTotal = new Counter({
  name: "file_watcher_symlinks_healed_total",
  help: "Total symlinks healed",
  registers: [register],
});

/**
 * Symlink healing failures
 */
export const symlinkHealingFailuresTotal = new Counter({
  name: "file_watcher_symlink_healing_failures_total",
  help: "Total symlink healing failures",
  registers: [register],
});

/**
 * Symlink verification duration
 */
export const symlinkVerificationDuration = new Histogram({
  name: "file_watcher_symlink_verification_seconds",
  help: "Time to verify symlinks",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

// =============================================================================
// SECURITY METRICS
// =============================================================================

/**
 * Security anomalies detected
 */
export const securityAnomaliesTotal = new Counter({
  name: "file_watcher_security_anomalies_total",
  help: "Total security anomalies detected",
  labelNames: ["type", "severity"],
  registers: [register],
});

/**
 * Blocked operations due to security
 */
export const securityBlockedOpsTotal = new Counter({
  name: "file_watcher_security_blocked_total",
  help: "Total operations blocked due to security",
  labelNames: ["type"],
  registers: [register],
});

/**
 * Rate limit violations
 */
export const rateLimitViolationsTotal = new Counter({
  name: "file_watcher_rate_limit_violations_total",
  help: "Total rate limit violations",
  labelNames: ["path_prefix"],
  registers: [register],
});

// =============================================================================
// RESOURCE METRICS
// =============================================================================

/**
 * Memory usage by watcher
 */
export const watcherMemoryUsage = new Gauge({
  name: "file_watcher_memory_bytes",
  help: "Memory usage by file watcher",
  registers: [register],
});

/**
 * CPU usage by watcher operations
 */
export const watcherCpuUsage = new Gauge({
  name: "file_watcher_cpu_percent",
  help: "CPU usage by file watcher operations",
  registers: [register],
});

/**
 * Errors encountered
 */
export const watcherErrorsTotal = new Counter({
  name: "file_watcher_errors_total",
  help: "Total errors encountered",
  labelNames: ["error_type", "directory_type"],
  registers: [register],
});

// =============================================================================
// AUTO-CLASSIFICATION METRICS
// =============================================================================

/**
 * Auto-classification operations
 */
export const autoClassifyTotal = new Counter({
  name: "file_watcher_auto_classify_total",
  help: "Total auto-classification operations",
  labelNames: ["status"],
  registers: [register],
});

/**
 * Auto-classification duration
 */
export const autoClassifyDuration = new Histogram({
  name: "file_watcher_auto_classify_seconds",
  help: "Time to auto-classify a project",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Symlinks created by auto-classification
 */
export const autoClassifySymlinksCreated = new Counter({
  name: "file_watcher_auto_classify_symlinks_created_total",
  help: "Total symlinks created by auto-classification",
  registers: [register],
});

// =============================================================================
// HOT RELOAD METRICS
// =============================================================================

/**
 * Config hot reloads
 */
export const configReloadsTotal = new Counter({
  name: "file_watcher_config_reloads_total",
  help: "Total config hot reloads",
  labelNames: ["status"],
  registers: [register],
});

/**
 * Theme hot reloads
 */
export const themeReloadsTotal = new Counter({
  name: "file_watcher_theme_reloads_total",
  help: "Total theme hot reloads",
  labelNames: ["status"],
  registers: [register],
});

/**
 * Module discoveries
 */
export const moduleDiscoveriesTotal = new Counter({
  name: "file_watcher_module_discoveries_total",
  help: "Total module discoveries",
  registers: [register],
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Records a file event in metrics
 */
export function recordFileEvent(
  eventType: FileEventType,
  directoryType: WatchDirectoryType,
  watchRoot: string,
  processingTimeMs: number
): void {
  fileEventsTotal.inc({ event_type: eventType, directory_type: directoryType, watch_root: watchRoot });
  eventProcessingDuration.observe(
    { event_type: eventType, directory_type: directoryType },
    processingTimeMs / 1000
  );
}

/**
 * Records a batch of events
 */
export function recordBatch(
  directoryType: WatchDirectoryType,
  batchSize: number,
  debouncedCount: number
): void {
  batchSizes.observe({ directory_type: directoryType }, batchSize);
  if (debouncedCount > 0) {
    debouncedEventsTotal.inc({ directory_type: directoryType }, debouncedCount);
  }
}

/**
 * Records a security anomaly
 */
export function recordSecurityAnomaly(
  type: string,
  severity: string,
  blocked: boolean
): void {
  securityAnomaliesTotal.inc({ type, severity });
  if (blocked) {
    securityBlockedOpsTotal.inc({ type });
  }
}

/**
 * Updates watcher health metrics
 */
export function updateHealthMetrics(health: WatcherHealthStatus): void {
  // Health status
  let healthValue = 1;
  if (health.status === "degraded") healthValue = 0.5;
  if (health.status === "unhealthy") healthValue = 0;
  watcherHealthGauge.set(healthValue);

  // Active watchers
  activeWatchers.set(health.activeWatchers);

  // Watched paths
  watchedPathsCount.set({ directory_type: "total" }, health.watchedPathCount);

  // Pending events
  pendingEventsCount.set({ directory_type: "total" }, health.pendingEventsCount);

  // Memory
  watcherMemoryUsage.set(health.memoryUsageBytes);

  // Per-watcher metrics
  for (const watcher of health.watchers) {
    watchedPathsCount.set({ directory_type: watcher.type }, watcher.watchedCount);
  }
}

/**
 * Records symlink operations
 */
export function recordSymlinkOperation(
  operation: "healed" | "healing_failed" | "verified",
  count: number = 1
): void {
  switch (operation) {
    case "healed":
      symlinksHealedTotal.inc(count);
      break;
    case "healing_failed":
      symlinkHealingFailuresTotal.inc(count);
      break;
    // verified doesn't have a counter, uses histogram
  }
}

/**
 * Records auto-classification operation
 */
export function recordAutoClassify(
  success: boolean,
  durationMs: number,
  symlinksCreated: number
): void {
  autoClassifyTotal.inc({ status: success ? "success" : "failure" });
  autoClassifyDuration.observe(durationMs / 1000);
  if (symlinksCreated > 0) {
    autoClassifySymlinksCreated.inc(symlinksCreated);
  }
}

/**
 * Records hot reload operation
 */
export function recordHotReload(
  type: "config" | "theme",
  success: boolean
): void {
  if (type === "config") {
    configReloadsTotal.inc({ status: success ? "success" : "failure" });
  } else {
    themeReloadsTotal.inc({ status: success ? "success" : "failure" });
  }
}

/**
 * Records an error
 */
export function recordError(
  errorType: string,
  directoryType: WatchDirectoryType
): void {
  watcherErrorsTotal.inc({ error_type: errorType, directory_type: directoryType });
}

/**
 * Gets all metrics as Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Gets the metrics registry
 */
export function getRegistry(): Registry {
  return register;
}

/**
 * Resets all metrics (for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}
