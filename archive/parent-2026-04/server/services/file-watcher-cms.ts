/**
 * @file file-watcher-cms.ts
 * @description Advanced file watching system for RSES CMS transformation.
 * @tier Tier 2 core — CMS production watcher. See docs/architecture/FILE-WATCHERS.md.
 * @phase Phase 9 - CMS Content Type System
 * @author FW (File Watcher Specialist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Multi-directory watching with different handlers per directory type
 * - Event debouncing and throttling with configurable strategies
 * - Integration with event bus for decoupled architecture
 * - WebSocket broadcasting of file events
 * - Background service management (start, stop, status)
 * - Resource limits to prevent DoS
 * - Crash recovery and state persistence
 * - Watcher health monitoring and metrics
 * - Symlink state synchronization and healing
 * - Security anomaly detection (path traversal, etc.)
 *
 * Directory Types Watched:
 * - content: Project directories for auto-classification
 * - config: RSES config files for hot reload
 * - theme: Theme files for development hot reload
 * - module: Module directories for discovery
 * - symlink: Symlink state synchronization
 */

import chokidar, { FSWatcher } from "chokidar";
// chokidar v5 no longer exports WatchOptions as a named type; the options
// are passed inline. Redefine a local minimal shape for our code paths.
type WatchOptions = Parameters<typeof chokidar.watch>[1];
import path from "path";
import { Stats } from "node:fs";
import fs from "fs/promises";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("file-watcher-cms");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Watch directory types - each type has different handling behavior
 */
export type WatchDirectoryType =
  | "content"     // Project directories for auto-classification
  | "config"      // RSES config files for hot reload
  | "theme"       // Theme files for development hot reload
  | "module"      // Module directories for discovery
  | "symlink"     // Symlink state synchronization
  | "media"       // Media file uploads
  | "cache"       // Cache invalidation
  | "custom";     // User-defined handlers

/**
 * File event types
 */
export type FileEventType =
  | "add"
  | "addDir"
  | "change"
  | "unlink"
  | "unlinkDir"
  | "symlink:created"
  | "symlink:broken"
  | "symlink:healed"
  | "symlink:removed"
  | "error";

/**
 * Debounce strategy types
 */
export type DebounceStrategy =
  | "trailing"    // Fire after delay (default)
  | "leading"     // Fire immediately, then wait
  | "throttle"    // Fire at most once per interval
  | "batch";      // Collect events and fire as batch

/**
 * Individual file event
 */
export interface FileEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: FileEventType;
  /** Absolute path to file/directory */
  path: string;
  /** Relative path from watch root */
  relativePath: string;
  /** Watch directory type */
  directoryType: WatchDirectoryType;
  /** Watch root this event originated from */
  watchRoot: string;
  /** Event timestamp */
  timestamp: number;
  /** File stats (if available) */
  stats?: {
    size: number;
    mtime: Date;
    isDirectory: boolean;
    isSymbolicLink: boolean;
  };
  /** Symlink target (if symlink) */
  symlinkTarget?: string;
  /** Whether symlink is broken */
  symlinkBroken?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Batched file events for batch debounce strategy
 */
export interface BatchedFileEvents {
  /** Batch ID */
  batchId: string;
  /** Watch root */
  watchRoot: string;
  /** Directory type */
  directoryType: WatchDirectoryType;
  /** Events in this batch */
  events: FileEvent[];
  /** Batch start time */
  startTime: number;
  /** Batch end time */
  endTime: number;
}

/**
 * Watch directory configuration
 */
export interface WatchDirectoryConfig {
  /** Absolute path to watch */
  path: string;
  /** Directory type for handler routing */
  type: WatchDirectoryType;
  /** Human-readable label */
  label?: string;
  /** Whether watching is enabled */
  enabled: boolean;
  /** Patterns to ignore (glob format) */
  ignorePatterns?: string[];
  /** Maximum depth to traverse (undefined = unlimited) */
  depth?: number;
  /** Whether to follow symlinks */
  followSymlinks?: boolean;
  /** Debounce configuration */
  debounce: DebounceConfig;
  /** Handler-specific options */
  handlerOptions?: Record<string, unknown>;
  /** Priority (higher = processed first) */
  priority?: number;
}

/**
 * Debounce configuration
 */
export interface DebounceConfig {
  /** Debounce strategy */
  strategy: DebounceStrategy;
  /** Delay in milliseconds */
  delayMs: number;
  /** Maximum wait time for batch strategy */
  maxWaitMs?: number;
  /** Maximum batch size for batch strategy */
  maxBatchSize?: number;
  /** Whether to combine events for same path */
  combineEvents?: boolean;
}

/**
 * Resource limits configuration
 */
export interface ResourceLimitsConfig {
  /** Maximum concurrent watchers */
  maxWatchers: number;
  /** Maximum total watched paths */
  maxWatchedPaths: number;
  /** Maximum events per second (rate limiting) */
  maxEventsPerSecond: number;
  /** Maximum pending events in queue */
  maxPendingEvents: number;
  /** Memory limit for event storage (bytes) */
  memoryLimitBytes: number;
  /** CPU throttle threshold (0-1) */
  cpuThrottleThreshold: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Allowed base directories (all watches must be under these) */
  allowedBasePaths: string[];
  /** Blocked paths (never watch these) */
  blockedPaths: string[];
  /** Whether to detect path traversal attempts */
  detectPathTraversal: boolean;
  /** Whether to log security events */
  logSecurityEvents: boolean;
  /** Maximum symlink depth to follow */
  maxSymlinkDepth: number;
  /** Blocked file extensions */
  blockedExtensions: string[];
  /** Rate limit per client (events/sec) */
  clientRateLimit: number;
}

/**
 * State persistence configuration
 */
export interface StatePersistenceConfig {
  /** Whether to persist state */
  enabled: boolean;
  /** Path to state file */
  statePath: string;
  /** Interval to save state (ms) */
  saveIntervalMs: number;
  /** Whether to restore state on startup */
  restoreOnStartup: boolean;
}

/**
 * Main watcher configuration
 */
export interface CMSFileWatcherConfig {
  /** Watch directories */
  directories: WatchDirectoryConfig[];
  /** Default skip patterns */
  defaultSkipPatterns: string[];
  /** Resource limits */
  resourceLimits: ResourceLimitsConfig;
  /** Security configuration */
  security: SecurityConfig;
  /** State persistence */
  persistence: StatePersistenceConfig;
  /** Health check interval (ms) */
  healthCheckIntervalMs: number;
  /** Whether to emit metrics */
  emitMetrics: boolean;
}

/**
 * Watcher health status
 */
export interface WatcherHealthStatus {
  /** Overall health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Last health check time */
  lastCheck: number;
  /** Active watcher count */
  activeWatchers: number;
  /** Total watched paths */
  watchedPathCount: number;
  /** Pending events count */
  pendingEventsCount: number;
  /** Events processed in last minute */
  eventsLastMinute: number;
  /** Average event processing time (ms) */
  avgProcessingTimeMs: number;
  /** Memory usage (bytes) */
  memoryUsageBytes: number;
  /** Individual watcher status */
  watchers: WatcherStatus[];
  /** Any error messages */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Individual watcher status
 */
export interface WatcherStatus {
  /** Watch root path */
  path: string;
  /** Directory type */
  type: WatchDirectoryType;
  /** Is watcher ready */
  ready: boolean;
  /** Is watcher running */
  running: boolean;
  /** Watched file count */
  watchedCount: number;
  /** Last event time */
  lastEventTime: number | null;
  /** Error count */
  errorCount: number;
  /** Last error message */
  lastError: string | null;
}

/**
 * Watcher metrics
 */
export interface WatcherMetrics {
  /** Total events processed */
  eventsProcessed: number;
  /** Events by type */
  eventsByType: Record<FileEventType, number>;
  /** Events by directory type */
  eventsByDirectoryType: Record<WatchDirectoryType, number>;
  /** Average debounce delay (ms) */
  avgDebounceDelayMs: number;
  /** Total debounced events (combined) */
  debouncedEvents: number;
  /** Security events detected */
  securityEventsDetected: number;
  /** Symlinks healed */
  symlinksHealed: number;
  /** Errors encountered */
  errorsEncountered: number;
  /** Uptime (ms) */
  uptimeMs: number;
  /** Start time */
  startTime: number;
}

/**
 * Symlink state for synchronization
 */
export interface SymlinkState {
  /** Symlink path */
  linkPath: string;
  /** Target path */
  targetPath: string;
  /** Resolved absolute target */
  resolvedTarget: string;
  /** Is symlink valid/working */
  isValid: boolean;
  /** Category (from path structure) */
  category: string;
  /** Last verified time */
  lastVerified: number;
  /** Associated database record ID */
  dbRecordId?: number;
  /** Sync status */
  syncStatus: "synced" | "pending" | "error";
}

/**
 * Security anomaly event
 */
export interface SecurityAnomaly {
  /** Anomaly ID */
  id: string;
  /** Anomaly type */
  type: "path_traversal" | "blocked_extension" | "rate_limit" | "unauthorized_access" | "symlink_attack";
  /** Affected path */
  path: string;
  /** Description */
  description: string;
  /** Severity */
  severity: "low" | "medium" | "high" | "critical";
  /** Timestamp */
  timestamp: number;
  /** Additional details */
  details: Record<string, unknown>;
  /** Whether action was blocked */
  blocked: boolean;
}

/**
 * Event handler function type
 */
export type FileEventHandler = (event: FileEvent) => Promise<void>;

/**
 * Batch event handler function type
 */
export type BatchEventHandler = (batch: BatchedFileEvents) => Promise<void>;

/**
 * Security anomaly handler function type
 */
export type SecurityAnomalyHandler = (anomaly: SecurityAnomaly) => Promise<void>;

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/**
 * Default skip patterns for all watchers
 */
export const DEFAULT_SKIP_PATTERNS: string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.svn/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/venv/**",
  "**/.venv/**",
  "**/env/**",
  "**/.env/**",
  "**/target/**",
  "**/vendor/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/Pods/**",
  "**/*.egg-info/**",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/*.log",
  "**/*.tmp",
  "**/*.swp",
  "**/*~",
];

/**
 * Default resource limits
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimitsConfig = {
  maxWatchers: 20,
  maxWatchedPaths: 50000,
  maxEventsPerSecond: 1000,
  maxPendingEvents: 10000,
  memoryLimitBytes: 100 * 1024 * 1024, // 100MB
  cpuThrottleThreshold: 0.8,
};

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowedBasePaths: [],
  blockedPaths: ["/etc", "/var", "/usr", "/bin", "/sbin", "/root", "/System"],
  detectPathTraversal: true,
  logSecurityEvents: true,
  maxSymlinkDepth: 10,
  blockedExtensions: [".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".sh"],
  clientRateLimit: 100,
};

/**
 * Default debounce configuration by directory type
 */
export const DEFAULT_DEBOUNCE_BY_TYPE: Record<WatchDirectoryType, DebounceConfig> = {
  content: {
    strategy: "batch",
    delayMs: 2000,
    maxWaitMs: 10000,
    maxBatchSize: 100,
    combineEvents: true,
  },
  config: {
    strategy: "trailing",
    delayMs: 500,
    combineEvents: true,
  },
  theme: {
    strategy: "throttle",
    delayMs: 100,
    combineEvents: false,
  },
  module: {
    strategy: "trailing",
    delayMs: 1000,
    combineEvents: true,
  },
  symlink: {
    strategy: "leading",
    delayMs: 0,
    combineEvents: false,
  },
  media: {
    strategy: "batch",
    delayMs: 1000,
    maxWaitMs: 5000,
    maxBatchSize: 50,
    combineEvents: true,
  },
  cache: {
    strategy: "throttle",
    delayMs: 500,
    combineEvents: true,
  },
  custom: {
    strategy: "trailing",
    delayMs: 1000,
    combineEvents: false,
  },
};

// =============================================================================
// EVENT BUS
// =============================================================================

/**
 * Event bus for decoupled file watcher communication.
 * Allows services to subscribe to file events without tight coupling.
 */
export class FileWatcherEventBus extends EventEmitter {
  private static instance: FileWatcherEventBus | null = null;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): FileWatcherEventBus {
    if (!FileWatcherEventBus.instance) {
      FileWatcherEventBus.instance = new FileWatcherEventBus();
    }
    return FileWatcherEventBus.instance;
  }

  static resetInstance(): void {
    if (FileWatcherEventBus.instance) {
      FileWatcherEventBus.instance.removeAllListeners();
      FileWatcherEventBus.instance = null;
    }
  }

  // Type-safe event methods
  emitFileEvent(event: FileEvent): boolean {
    return this.emit("file", event);
  }

  emitBatchEvent(batch: BatchedFileEvents): boolean {
    return this.emit("batch", batch);
  }

  emitSecurityAnomaly(anomaly: SecurityAnomaly): boolean {
    return this.emit("security", anomaly);
  }

  emitHealthUpdate(health: WatcherHealthStatus): boolean {
    return this.emit("health", health);
  }

  emitSymlinkStateChange(state: SymlinkState): boolean {
    return this.emit("symlink", state);
  }

  onFileEvent(handler: FileEventHandler): this {
    return this.on("file", handler);
  }

  onBatchEvent(handler: BatchEventHandler): this {
    return this.on("batch", handler);
  }

  onSecurityAnomaly(handler: SecurityAnomalyHandler): this {
    return this.on("security", handler);
  }

  onHealthUpdate(handler: (health: WatcherHealthStatus) => void): this {
    return this.on("health", handler);
  }

  onSymlinkStateChange(handler: (state: SymlinkState) => void): this {
    return this.on("symlink", handler);
  }
}

// =============================================================================
// DEBOUNCER
// =============================================================================

/**
 * Advanced debouncer supporting multiple strategies
 */
export class EventDebouncer {
  private pendingEvents: Map<string, FileEvent[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private lastFired: Map<string, number> = new Map();
  private config: DebounceConfig;
  private onFlush: (events: FileEvent[]) => void;

  constructor(config: DebounceConfig, onFlush: (events: FileEvent[]) => void) {
    this.config = config;
    this.onFlush = onFlush;
  }

  add(event: FileEvent): void {
    const key = this.getKey(event);

    switch (this.config.strategy) {
      case "leading":
        this.handleLeading(key, event);
        break;
      case "throttle":
        this.handleThrottle(key, event);
        break;
      case "batch":
        this.handleBatch(key, event);
        break;
      case "trailing":
      default:
        this.handleTrailing(key, event);
        break;
    }
  }

  private getKey(event: FileEvent): string {
    if (this.config.combineEvents) {
      return event.path;
    }
    return `${event.path}:${event.type}`;
  }

  private handleTrailing(key: string, event: FileEvent): void {
    // Cancel existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Store event
    const events = this.pendingEvents.get(key) || [];
    events.push(event);
    this.pendingEvents.set(key, events);

    // Set new timer
    const timer = setTimeout(() => {
      const eventsToFlush = this.pendingEvents.get(key) || [];
      this.pendingEvents.delete(key);
      this.timers.delete(key);
      if (eventsToFlush.length > 0) {
        this.onFlush(eventsToFlush);
      }
    }, this.config.delayMs);

    this.timers.set(key, timer);
  }

  private handleLeading(key: string, event: FileEvent): void {
    const lastFired = this.lastFired.get(key) || 0;
    const now = Date.now();

    if (now - lastFired >= this.config.delayMs) {
      this.lastFired.set(key, now);
      this.onFlush([event]);
    }
    // Otherwise, event is dropped
  }

  private handleThrottle(key: string, event: FileEvent): void {
    const lastFired = this.lastFired.get(key) || 0;
    const now = Date.now();

    // Store event
    const events = this.pendingEvents.get(key) || [];
    events.push(event);
    this.pendingEvents.set(key, events);

    if (now - lastFired >= this.config.delayMs) {
      this.lastFired.set(key, now);
      const eventsToFlush = this.pendingEvents.get(key) || [];
      this.pendingEvents.delete(key);
      if (eventsToFlush.length > 0) {
        this.onFlush(eventsToFlush);
      }
    }
  }

  private handleBatch(key: string, event: FileEvent): void {
    const events = this.pendingEvents.get(key) || [];
    events.push(event);
    this.pendingEvents.set(key, events);

    // Check max batch size
    if (this.config.maxBatchSize && events.length >= this.config.maxBatchSize) {
      this.flushBatch(key);
      return;
    }

    // Set timer if not already set
    if (!this.timers.has(key)) {
      const timer = setTimeout(() => {
        this.flushBatch(key);
      }, this.config.maxWaitMs || this.config.delayMs);

      this.timers.set(key, timer);
    }
  }

  private flushBatch(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    const eventsToFlush = this.pendingEvents.get(key) || [];
    this.pendingEvents.delete(key);
    if (eventsToFlush.length > 0) {
      this.onFlush(eventsToFlush);
    }
  }

  flush(): void {
    // Flush all pending events
    for (const key of this.pendingEvents.keys()) {
      this.flushBatch(key);
    }
  }

  clear(): void {
    // Clear all timers and pending events
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.pendingEvents.clear();
    this.lastFired.clear();
  }

  get pendingCount(): number {
    let count = 0;
    for (const events of this.pendingEvents.values()) {
      count += events.length;
    }
    return count;
  }
}

// =============================================================================
// SYMLINK MANAGER
// =============================================================================

/**
 * Manages symlink state synchronization and healing
 */
export class SymlinkManager {
  private symlinkStates: Map<string, SymlinkState> = new Map();
  private eventBus: FileWatcherEventBus;
  private healingQueue: Set<string> = new Set();
  private isHealing: boolean = false;

  constructor() {
    this.eventBus = FileWatcherEventBus.getInstance();
  }

  /**
   * Scans directory for symlinks and updates state
   */
  async scanSymlinks(basePath: string): Promise<SymlinkState[]> {
    const states: SymlinkState[] = [];

    async function scan(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isSymbolicLink()) {
            try {
              const target = await fs.readlink(fullPath);
              const resolvedTarget = path.resolve(path.dirname(fullPath), target);
              let isValid = true;

              try {
                await fs.access(resolvedTarget);
              } catch {
                isValid = false;
              }

              const relativePath = path.relative(basePath, fullPath);
              const category = path.dirname(relativePath);

              states.push({
                linkPath: fullPath,
                targetPath: target,
                resolvedTarget,
                isValid,
                category,
                lastVerified: Date.now(),
                syncStatus: "synced",
              });
            } catch {
              // Broken symlink
              states.push({
                linkPath: fullPath,
                targetPath: "",
                resolvedTarget: "",
                isValid: false,
                category: path.dirname(path.relative(basePath, fullPath)),
                lastVerified: Date.now(),
                syncStatus: "error",
              });
            }
          } else if (entry.isDirectory()) {
            await scan(fullPath);
          }
        }
      } catch (err) {
        log.error({ err, dir }, "Error scanning symlinks");
      }
    }

    await scan(basePath);

    // Update internal state
    for (const state of states) {
      this.symlinkStates.set(state.linkPath, state);
    }

    return states;
  }

  /**
   * Verifies a single symlink
   */
  async verifySymlink(linkPath: string): Promise<SymlinkState | null> {
    try {
      const stats = await fs.lstat(linkPath);

      if (!stats.isSymbolicLink()) {
        return null;
      }

      const target = await fs.readlink(linkPath);
      const resolvedTarget = path.resolve(path.dirname(linkPath), target);
      let isValid = true;

      try {
        await fs.access(resolvedTarget);
      } catch {
        isValid = false;
      }

      const state: SymlinkState = {
        linkPath,
        targetPath: target,
        resolvedTarget,
        isValid,
        category: "",
        lastVerified: Date.now(),
        syncStatus: isValid ? "synced" : "error",
      };

      this.symlinkStates.set(linkPath, state);
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Attempts to heal a broken symlink by finding the target
   */
  async healSymlink(
    linkPath: string,
    searchPaths: string[]
  ): Promise<{ healed: boolean; newTarget?: string; error?: string }> {
    const state = this.symlinkStates.get(linkPath);
    if (!state) {
      return { healed: false, error: "Symlink state not found" };
    }

    if (state.isValid) {
      return { healed: true };
    }

    // Try to find the target by name
    const targetName = path.basename(state.targetPath);

    for (const searchPath of searchPaths) {
      try {
        const entries = await fs.readdir(searchPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === targetName) {
            const newTarget = path.join(searchPath, entry.name);

            // Remove old symlink
            await fs.unlink(linkPath);

            // Create new symlink
            const relativePath = path.relative(path.dirname(linkPath), newTarget);
            await fs.symlink(relativePath, linkPath);

            // Update state
            state.targetPath = relativePath;
            state.resolvedTarget = newTarget;
            state.isValid = true;
            state.lastVerified = Date.now();
            state.syncStatus = "synced";

            this.eventBus.emitSymlinkStateChange(state);

            log.info({ linkPath, newTarget }, "Symlink healed");

            return { healed: true, newTarget };
          }
        }
      } catch {
        // Continue searching
      }
    }

    return { healed: false, error: "Could not find target in search paths" };
  }

  /**
   * Queues a symlink for healing
   */
  queueForHealing(linkPath: string): void {
    this.healingQueue.add(linkPath);
    this.processHealingQueue();
  }

  /**
   * Processes the healing queue
   */
  private async processHealingQueue(): Promise<void> {
    if (this.isHealing || this.healingQueue.size === 0) {
      return;
    }

    this.isHealing = true;

    while (this.healingQueue.size > 0) {
      // values().next().value can be `undefined` if the set is empty by the
      // time we read it (race with concurrent processors). The size check
      // above prevents this in practice, but we narrow the type explicitly.
      const linkPath = this.healingQueue.values().next().value;
      if (linkPath === undefined) break;
      this.healingQueue.delete(linkPath);

      // Healing would be called here with appropriate search paths
      // This is a placeholder - actual implementation depends on CMS configuration
      log.debug({ linkPath }, "Symlink queued for healing");
    }

    this.isHealing = false;
  }

  /**
   * Gets all broken symlinks
   */
  getBrokenSymlinks(): SymlinkState[] {
    return Array.from(this.symlinkStates.values()).filter((s) => !s.isValid);
  }

  /**
   * Gets all symlink states
   */
  getAllStates(): SymlinkState[] {
    return Array.from(this.symlinkStates.values());
  }

  /**
   * Clears all state
   */
  clear(): void {
    this.symlinkStates.clear();
    this.healingQueue.clear();
    this.isHealing = false;
  }
}

// =============================================================================
// SECURITY MONITOR
// =============================================================================

/**
 * Monitors for security anomalies in file events
 */
export class SecurityMonitor {
  private config: SecurityConfig;
  private eventBus: FileWatcherEventBus;
  private recentEvents: Map<string, number[]> = new Map(); // path -> timestamps

  constructor(config: SecurityConfig) {
    this.config = config;
    this.eventBus = FileWatcherEventBus.getInstance();
  }

  /**
   * Validates a path for security concerns
   */
  validatePath(targetPath: string): {
    valid: boolean;
    anomalies: SecurityAnomaly[];
  } {
    const anomalies: SecurityAnomaly[] = [];
    const normalizedPath = path.normalize(targetPath);

    // Check for path traversal
    if (this.config.detectPathTraversal) {
      if (targetPath.includes("..") || targetPath.includes("./")) {
        anomalies.push(this.createAnomaly(
          "path_traversal",
          targetPath,
          "Path contains traversal sequences",
          "high"
        ));
      }
    }

    // Check against blocked paths
    for (const blocked of this.config.blockedPaths) {
      if (normalizedPath.startsWith(blocked)) {
        anomalies.push(this.createAnomaly(
          "unauthorized_access",
          targetPath,
          `Path is in blocked directory: ${blocked}`,
          "critical"
        ));
      }
    }

    // Check against allowed base paths
    if (this.config.allowedBasePaths.length > 0) {
      const isAllowed = this.config.allowedBasePaths.some(
        (base) => normalizedPath.startsWith(path.normalize(base))
      );
      if (!isAllowed) {
        anomalies.push(this.createAnomaly(
          "unauthorized_access",
          targetPath,
          "Path is not under any allowed base path",
          "high"
        ));
      }
    }

    // Check file extension
    const ext = path.extname(targetPath).toLowerCase();
    if (this.config.blockedExtensions.includes(ext)) {
      anomalies.push(this.createAnomaly(
        "blocked_extension",
        targetPath,
        `File extension ${ext} is blocked`,
        "medium"
      ));
    }

    // Emit anomalies
    for (const anomaly of anomalies) {
      if (this.config.logSecurityEvents) {
        log.warn({ anomaly }, "Security anomaly detected");
      }
      this.eventBus.emitSecurityAnomaly(anomaly);
    }

    return {
      valid: anomalies.length === 0,
      anomalies,
    };
  }

  /**
   * Checks rate limit for a path
   */
  checkRateLimit(targetPath: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Get recent events for this path
    let timestamps = this.recentEvents.get(targetPath) || [];

    // Filter to last second
    timestamps = timestamps.filter((t) => t > oneSecondAgo);

    // Add current event
    timestamps.push(now);
    this.recentEvents.set(targetPath, timestamps);

    // Check limit
    if (timestamps.length > this.config.clientRateLimit) {
      this.eventBus.emitSecurityAnomaly(this.createAnomaly(
        "rate_limit",
        targetPath,
        `Rate limit exceeded: ${timestamps.length} events/second`,
        "medium"
      ));
      return false;
    }

    return true;
  }

  /**
   * Validates symlink for security concerns
   */
  async validateSymlink(linkPath: string): Promise<{
    valid: boolean;
    anomaly?: SecurityAnomaly;
  }> {
    try {
      let currentPath = linkPath;
      let depth = 0;

      while (depth < this.config.maxSymlinkDepth) {
        const stats = await fs.lstat(currentPath);

        if (!stats.isSymbolicLink()) {
          // Reached final target
          return this.validatePath(currentPath);
        }

        const target = await fs.readlink(currentPath);
        currentPath = path.resolve(path.dirname(currentPath), target);
        depth++;
      }

      // Exceeded max depth - possible symlink attack
      const anomaly = this.createAnomaly(
        "symlink_attack",
        linkPath,
        `Symlink depth exceeded maximum (${this.config.maxSymlinkDepth})`,
        "high"
      );

      this.eventBus.emitSecurityAnomaly(anomaly);

      return { valid: false, anomaly };
    } catch {
      return { valid: true }; // Broken symlink, not a security issue
    }
  }

  private createAnomaly(
    type: SecurityAnomaly["type"],
    path: string,
    description: string,
    severity: SecurityAnomaly["severity"]
  ): SecurityAnomaly {
    return {
      id: randomUUID(),
      type,
      path,
      description,
      severity,
      timestamp: Date.now(),
      details: {},
      blocked: severity === "critical" || severity === "high",
    };
  }

  /**
   * Cleans up old rate limit data
   */
  cleanup(): void {
    const oneMinuteAgo = Date.now() - 60000;

    for (const [path, timestamps] of this.recentEvents.entries()) {
      const filtered = timestamps.filter((t) => t > oneMinuteAgo);
      if (filtered.length === 0) {
        this.recentEvents.delete(path);
      } else {
        this.recentEvents.set(path, filtered);
      }
    }
  }
}

// =============================================================================
// MAIN CMS FILE WATCHER SERVICE
// =============================================================================

/**
 * Main CMS file watcher service with all features
 */
export class CMSFileWatcherService {
  private config: CMSFileWatcherConfig;
  private watchers: Map<string, FSWatcher> = new Map();
  private debouncers: Map<string, EventDebouncer> = new Map();
  private handlers: Map<WatchDirectoryType, FileEventHandler[]> = new Map();
  private batchHandlers: Map<WatchDirectoryType, BatchEventHandler[]> = new Map();
  private eventBus: FileWatcherEventBus;
  private symlinkManager: SymlinkManager;
  private securityMonitor: SecurityMonitor;
  private metrics: WatcherMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private persistenceTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CMSFileWatcherConfig>) {
    this.config = {
      directories: [],
      defaultSkipPatterns: DEFAULT_SKIP_PATTERNS,
      resourceLimits: { ...DEFAULT_RESOURCE_LIMITS, ...config.resourceLimits },
      security: { ...DEFAULT_SECURITY_CONFIG, ...config.security },
      persistence: {
        enabled: false,
        statePath: "./watcher-state.json",
        saveIntervalMs: 60000,
        restoreOnStartup: true,
        ...config.persistence,
      },
      healthCheckIntervalMs: 30000,
      emitMetrics: true,
      ...config,
    };

    this.eventBus = FileWatcherEventBus.getInstance();
    this.symlinkManager = new SymlinkManager();
    this.securityMonitor = new SecurityMonitor(this.config.security);
    this.metrics = this.createInitialMetrics();
  }

  private createInitialMetrics(): WatcherMetrics {
    return {
      eventsProcessed: 0,
      eventsByType: {
        add: 0,
        addDir: 0,
        change: 0,
        unlink: 0,
        unlinkDir: 0,
        "symlink:created": 0,
        "symlink:broken": 0,
        "symlink:healed": 0,
        "symlink:removed": 0,
        error: 0,
      },
      eventsByDirectoryType: {
        content: 0,
        config: 0,
        theme: 0,
        module: 0,
        symlink: 0,
        media: 0,
        cache: 0,
        custom: 0,
      },
      avgDebounceDelayMs: 0,
      debouncedEvents: 0,
      securityEventsDetected: 0,
      symlinksHealed: 0,
      errorsEncountered: 0,
      uptimeMs: 0,
      startTime: 0,
    };
  }

  /**
   * Starts the file watcher service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("File watcher already running");
      return;
    }

    log.info("Starting CMS file watcher service");

    this.metrics.startTime = Date.now();
    this.isRunning = true;

    // Restore state if enabled
    if (this.config.persistence.enabled && this.config.persistence.restoreOnStartup) {
      await this.restoreState();
    }

    // Start watching each configured directory
    for (const dirConfig of this.config.directories) {
      if (dirConfig.enabled) {
        await this.startWatcher(dirConfig);
      }
    }

    // Start health check interval
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckIntervalMs
    );

    // Start cleanup interval (every minute)
    this.cleanupInterval = setInterval(() => {
      this.securityMonitor.cleanup();
    }, 60000);

    // Start persistence interval if enabled
    if (this.config.persistence.enabled) {
      this.persistenceTimer = setInterval(
        () => this.persistState(),
        this.config.persistence.saveIntervalMs
      );
    }

    log.info(
      { watcherCount: this.watchers.size },
      "CMS file watcher service started"
    );
  }

  /**
   * Stops the file watcher service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping CMS file watcher service");

    this.isRunning = false;

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }

    // Flush all debouncers
    for (const debouncer of this.debouncers.values()) {
      debouncer.flush();
    }

    // Stop all watchers
    const closePromises: Promise<void>[] = [];
    for (const [path, watcher] of this.watchers.entries()) {
      closePromises.push(
        watcher.close().then(() => {
          log.debug({ path }, "Watcher closed");
        })
      );
    }

    await Promise.all(closePromises);

    // Persist final state
    if (this.config.persistence.enabled) {
      await this.persistState();
    }

    // Clear all state
    this.watchers.clear();
    this.debouncers.clear();
    this.symlinkManager.clear();

    log.info("CMS file watcher service stopped");
  }

  /**
   * Starts a watcher for a specific directory
   */
  private async startWatcher(dirConfig: WatchDirectoryConfig): Promise<void> {
    // Validate path security
    const validation = this.securityMonitor.validatePath(dirConfig.path);
    if (!validation.valid) {
      log.error(
        { path: dirConfig.path, anomalies: validation.anomalies },
        "Cannot start watcher - security validation failed"
      );
      return;
    }

    // Check resource limits
    if (this.watchers.size >= this.config.resourceLimits.maxWatchers) {
      log.error({ maxWatchers: this.config.resourceLimits.maxWatchers },
        "Cannot start watcher - maximum watchers reached"
      );
      return;
    }

    const ignored = [
      ...this.config.defaultSkipPatterns,
      ...(dirConfig.ignorePatterns || []),
    ];

    const watchOptions: WatchOptions = {
      ignored,
      persistent: true,
      ignoreInitial: false,
      followSymlinks: dirConfig.followSymlinks ?? false,
      depth: dirConfig.depth,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      alwaysStat: true,
    };

    const watcher = chokidar.watch(dirConfig.path, watchOptions);

    // Create debouncer for this directory
    const debounceConfig = dirConfig.debounce || DEFAULT_DEBOUNCE_BY_TYPE[dirConfig.type];
    const debouncer = new EventDebouncer(debounceConfig, (events) => {
      this.handleDebouncedEvents(dirConfig, events);
    });

    this.debouncers.set(dirConfig.path, debouncer);

    // Set up event handlers
    watcher.on("ready", () => {
      log.info({ path: dirConfig.path, type: dirConfig.type }, "Watcher ready");

      // Scan for symlinks if this is a symlink directory
      if (dirConfig.type === "symlink") {
        this.symlinkManager.scanSymlinks(dirConfig.path).catch((err) => {
          log.error({ err, path: dirConfig.path }, "Error scanning symlinks");
        });
      }
    });

    watcher.on("add", (filePath, stats) =>
      this.handleRawEvent("add", filePath, dirConfig, stats));
    watcher.on("addDir", (filePath, stats) =>
      this.handleRawEvent("addDir", filePath, dirConfig, stats));
    watcher.on("change", (filePath, stats) =>
      this.handleRawEvent("change", filePath, dirConfig, stats));
    watcher.on("unlink", (filePath) =>
      this.handleRawEvent("unlink", filePath, dirConfig));
    watcher.on("unlinkDir", (filePath) =>
      this.handleRawEvent("unlinkDir", filePath, dirConfig));

    watcher.on("error", (error) => {
      this.metrics.errorsEncountered++;
      log.error({ error, path: dirConfig.path }, "Watcher error");
    });

    this.watchers.set(dirConfig.path, watcher);
    log.debug({ path: dirConfig.path, type: dirConfig.type }, "Watcher started");
  }

  /**
   * Handles raw file events before debouncing
   */
  private async handleRawEvent(
    type: FileEventType,
    filePath: string,
    dirConfig: WatchDirectoryConfig,
    // fs/promises does not re-export Stats; import it from node:fs (the
    // shape is identical to the one returned by fs.promises.stat).
    stats?: Stats
  ): Promise<void> {
    // Security validation
    const validation = this.securityMonitor.validatePath(filePath);
    if (!validation.valid) {
      return;
    }

    // Rate limit check
    if (!this.securityMonitor.checkRateLimit(filePath)) {
      return;
    }

    // Create event object
    const event: FileEvent = {
      id: randomUUID(),
      type,
      path: filePath,
      relativePath: path.relative(dirConfig.path, filePath),
      directoryType: dirConfig.type,
      watchRoot: dirConfig.path,
      timestamp: Date.now(),
    };

    // Add stats if available
    if (stats) {
      event.stats = {
        size: stats.size,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
      };
    }

    // Check for symlink events
    try {
      const lstats = await fs.lstat(filePath);
      if (lstats.isSymbolicLink()) {
        const target = await fs.readlink(filePath);
        event.symlinkTarget = target;

        try {
          await fs.access(path.resolve(path.dirname(filePath), target));
          event.symlinkBroken = false;
        } catch {
          event.symlinkBroken = true;
          event.type = "symlink:broken";

          // Queue for healing
          if (dirConfig.type === "symlink") {
            this.symlinkManager.queueForHealing(filePath);
          }
        }
      }
    } catch {
      // File might have been deleted
    }

    // Add to debouncer
    const debouncer = this.debouncers.get(dirConfig.path);
    if (debouncer) {
      debouncer.add(event);
    }
  }

  /**
   * Handles debounced events
   */
  private async handleDebouncedEvents(
    dirConfig: WatchDirectoryConfig,
    events: FileEvent[]
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Update metrics
    for (const event of events) {
      this.metrics.eventsProcessed++;
      this.metrics.eventsByType[event.type]++;
      this.metrics.eventsByDirectoryType[event.directoryType]++;
    }

    // If batch strategy, emit as batch
    if (dirConfig.debounce.strategy === "batch") {
      const batch: BatchedFileEvents = {
        batchId: randomUUID(),
        watchRoot: dirConfig.path,
        directoryType: dirConfig.type,
        events,
        startTime: events[0].timestamp,
        endTime: events[events.length - 1].timestamp,
      };

      this.eventBus.emitBatchEvent(batch);

      // Call batch handlers
      const handlers = this.batchHandlers.get(dirConfig.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler(batch);
          } catch (err) {
            log.error({ err, batchId: batch.batchId }, "Batch handler error");
          }
        }
      }
    } else {
      // Emit individual events
      for (const event of events) {
        this.eventBus.emitFileEvent(event);

        // Call individual handlers
        const handlers = this.handlers.get(event.directoryType);
        if (handlers) {
          for (const handler of handlers) {
            try {
              await handler(event);
            } catch (err) {
              log.error({ err, eventId: event.id }, "Event handler error");
            }
          }
        }
      }
    }

    // Track debounced events
    if (events.length > 1) {
      this.metrics.debouncedEvents += events.length - 1;
    }
  }

  /**
   * Registers an event handler for a directory type
   */
  registerHandler(type: WatchDirectoryType, handler: FileEventHandler): void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    log.debug({ type }, "Event handler registered");
  }

  /**
   * Registers a batch event handler for a directory type
   */
  registerBatchHandler(type: WatchDirectoryType, handler: BatchEventHandler): void {
    const handlers = this.batchHandlers.get(type) || [];
    handlers.push(handler);
    this.batchHandlers.set(type, handlers);
    log.debug({ type }, "Batch event handler registered");
  }

  /**
   * Adds a directory to watch
   */
  async addDirectory(config: WatchDirectoryConfig): Promise<void> {
    this.config.directories.push(config);
    if (this.isRunning && config.enabled) {
      await this.startWatcher(config);
    }
  }

  /**
   * Removes a directory from watching
   */
  async removeDirectory(watchPath: string): Promise<void> {
    const watcher = this.watchers.get(watchPath);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(watchPath);
    }

    const debouncer = this.debouncers.get(watchPath);
    if (debouncer) {
      debouncer.flush();
      this.debouncers.delete(watchPath);
    }

    this.config.directories = this.config.directories.filter(
      (d) => d.path !== watchPath
    );

    log.info({ path: watchPath }, "Directory removed from watching");
  }

  /**
   * Gets the current health status
   */
  getHealthStatus(): WatcherHealthStatus {
    const watcherStatuses: WatcherStatus[] = [];
    let totalWatchedPaths = 0;

    for (const [watchPath, watcher] of this.watchers.entries()) {
      const dirConfig = this.config.directories.find((d) => d.path === watchPath);
      const watched = watcher.getWatched();
      const watchedCount = Object.values(watched).reduce(
        (sum, files) => sum + files.length,
        0
      );
      totalWatchedPaths += watchedCount;

      watcherStatuses.push({
        path: watchPath,
        type: dirConfig?.type || "custom",
        ready: true, // chokidar doesn't expose ready state easily
        running: true,
        watchedCount,
        lastEventTime: null, // Would need separate tracking
        errorCount: 0,
        lastError: null,
      });
    }

    const pendingEvents = Array.from(this.debouncers.values()).reduce(
      (sum, d) => sum + d.pendingCount,
      0
    );

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check resource limits
    if (totalWatchedPaths > this.config.resourceLimits.maxWatchedPaths * 0.9) {
      warnings.push("Approaching maximum watched paths limit");
    }

    if (pendingEvents > this.config.resourceLimits.maxPendingEvents * 0.9) {
      warnings.push("Approaching maximum pending events limit");
    }

    // Determine overall status
    let status: WatcherHealthStatus["status"] = "healthy";
    if (errors.length > 0) {
      status = "unhealthy";
    } else if (warnings.length > 0) {
      status = "degraded";
    }

    return {
      status,
      lastCheck: Date.now(),
      activeWatchers: this.watchers.size,
      watchedPathCount: totalWatchedPaths,
      pendingEventsCount: pendingEvents,
      eventsLastMinute: 0, // Would need separate tracking
      avgProcessingTimeMs: 0, // Would need separate tracking
      memoryUsageBytes: process.memoryUsage().heapUsed,
      watchers: watcherStatuses,
      errors,
      warnings,
    };
  }

  /**
   * Gets current metrics
   */
  getMetrics(): WatcherMetrics {
    return {
      ...this.metrics,
      uptimeMs: Date.now() - this.metrics.startTime,
    };
  }

  /**
   * Gets the symlink manager
   */
  getSymlinkManager(): SymlinkManager {
    return this.symlinkManager;
  }

  /**
   * Gets the event bus
   */
  getEventBus(): FileWatcherEventBus {
    return this.eventBus;
  }

  /**
   * Performs a health check
   */
  private performHealthCheck(): void {
    const health = this.getHealthStatus();
    this.eventBus.emitHealthUpdate(health);

    if (health.status === "unhealthy") {
      log.error({ health }, "File watcher health check failed");
    } else if (health.status === "degraded") {
      log.warn({ health }, "File watcher health degraded");
    }
  }

  /**
   * Persists state to disk
   */
  private async persistState(): Promise<void> {
    if (!this.config.persistence.enabled) {
      return;
    }

    const state = {
      timestamp: Date.now(),
      metrics: this.metrics,
      symlinks: this.symlinkManager.getAllStates(),
      directories: this.config.directories,
    };

    try {
      await fs.writeFile(
        this.config.persistence.statePath,
        JSON.stringify(state, null, 2)
      );
      log.debug("State persisted");
    } catch (err) {
      log.error({ err }, "Failed to persist state");
    }
  }

  /**
   * Restores state from disk
   */
  private async restoreState(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.persistence.statePath, "utf-8");
      const state = JSON.parse(data);

      // Restore metrics (partially)
      if (state.metrics) {
        this.metrics.eventsProcessed = state.metrics.eventsProcessed || 0;
      }

      log.info("State restored from disk");
    } catch {
      // File might not exist on first run
      log.debug("No state file to restore");
    }
  }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let cmsWatcherInstance: CMSFileWatcherService | null = null;

/**
 * Gets or creates the CMS file watcher instance
 */
export function getCMSFileWatcher(
  config?: Partial<CMSFileWatcherConfig>
): CMSFileWatcherService {
  if (!cmsWatcherInstance) {
    cmsWatcherInstance = new CMSFileWatcherService(config || {});
  }
  return cmsWatcherInstance;
}

/**
 * Resets the CMS file watcher instance
 */
export async function resetCMSFileWatcher(): Promise<void> {
  if (cmsWatcherInstance) {
    await cmsWatcherInstance.stop();
    cmsWatcherInstance = null;
  }
  FileWatcherEventBus.resetInstance();
}

// =============================================================================
// WEBSOCKET INTEGRATION
// =============================================================================

/**
 * WebSocket message types for file watcher events
 */
export interface WSFileEventMessage {
  type: "file:event";
  timestamp: number;
  data: FileEvent;
}

export interface WSFileBatchMessage {
  type: "file:batch";
  timestamp: number;
  data: BatchedFileEvents;
}

export interface WSWatcherHealthMessage {
  type: "watcher:health";
  timestamp: number;
  data: WatcherHealthStatus;
}

export interface WSSecurityAnomalyMessage {
  type: "watcher:security";
  timestamp: number;
  data: SecurityAnomaly;
}

export interface WSSymlinkStateMessage {
  type: "symlink:state";
  timestamp: number;
  data: SymlinkState;
}

/**
 * Sets up WebSocket integration for file watcher events
 */
export function setupFileWatcherWebSocket(
  watcher: CMSFileWatcherService,
  broadcast: (message: unknown, channel?: string) => void
): void {
  const eventBus = watcher.getEventBus();

  // The event bus handler types are async (Promise<void>); wrap each
  // sync broadcast in an async function so the assignment is type-safe.
  eventBus.onFileEvent(async (event) => {
    const message: WSFileEventMessage = {
      type: "file:event",
      timestamp: Date.now(),
      data: event,
    };
    broadcast(message, "files");
  });

  eventBus.onBatchEvent(async (batch) => {
    const message: WSFileBatchMessage = {
      type: "file:batch",
      timestamp: Date.now(),
      data: batch,
    };
    broadcast(message, "files");
  });

  eventBus.onHealthUpdate((health) => {
    const message: WSWatcherHealthMessage = {
      type: "watcher:health",
      timestamp: Date.now(),
      data: health,
    };
    broadcast(message, "admin");
  });

  eventBus.onSecurityAnomaly(async (anomaly) => {
    const message: WSSecurityAnomalyMessage = {
      type: "watcher:security",
      timestamp: Date.now(),
      data: anomaly,
    };
    broadcast(message, "admin");
  });

  eventBus.onSymlinkStateChange((state) => {
    const message: WSSymlinkStateMessage = {
      type: "symlink:state",
      timestamp: Date.now(),
      data: state,
    };
    broadcast(message, "symlinks");
  });

  log.info("WebSocket integration set up for file watcher");
}

// =============================================================================
// LAUNCHD / SYSTEMD INTEGRATION
// =============================================================================

/**
 * launchd plist configuration for macOS
 */
export const LAUNCHD_PLIST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rses.cms.filewatcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>{{INSTALL_PATH}}/server/services/file-watcher-daemon.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/rses-filewatcher.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/rses-filewatcher.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>{{INSTALL_PATH}}</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>`;

/**
 * systemd service configuration for Linux
 */
export const SYSTEMD_SERVICE_TEMPLATE = `[Unit]
Description=RSES CMS File Watcher Service
After=network.target

[Service]
Type=simple
User=rses
Group=rses
WorkingDirectory={{INSTALL_PATH}}
ExecStart=/usr/bin/node {{INSTALL_PATH}}/server/services/file-watcher-daemon.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

# Resource limits
MemoryLimit=512M
CPUQuota=25%

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={{DATA_PATH}}
PrivateTmp=true

[Install]
WantedBy=multi-user.target`;

/**
 * Generates launchd plist for macOS
 */
export function generateLaunchdPlist(installPath: string): string {
  return LAUNCHD_PLIST_TEMPLATE.replace(/\{\{INSTALL_PATH\}\}/g, installPath);
}

/**
 * Generates systemd service file for Linux
 */
export function generateSystemdService(
  installPath: string,
  dataPath: string
): string {
  return SYSTEMD_SERVICE_TEMPLATE
    .replace(/\{\{INSTALL_PATH\}\}/g, installPath)
    .replace(/\{\{DATA_PATH\}\}/g, dataPath);
}
