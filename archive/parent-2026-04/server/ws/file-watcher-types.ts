/**
 * @file file-watcher-types.ts
 * @description WebSocket message types for CMS file watcher events.
 * @phase Phase 9 - CMS Content Type System
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 */

import type {
  FileEvent,
  BatchedFileEvents,
  WatcherHealthStatus,
  SecurityAnomaly,
  SymlinkState,
  WatcherMetrics,
  WatchDirectoryConfig,
  WatchDirectoryType,
} from "../services/file-watcher-cms";

// =============================================================================
// SERVER -> CLIENT MESSAGES
// =============================================================================

/**
 * File event notification
 */
export interface WSFileEventMessage {
  type: "file:event";
  timestamp: number;
  data: FileEvent;
}

/**
 * Batch file events notification
 */
export interface WSFileBatchMessage {
  type: "file:batch";
  timestamp: number;
  data: BatchedFileEvents;
}

/**
 * Watcher health status update
 */
export interface WSWatcherHealthMessage {
  type: "watcher:health";
  timestamp: number;
  data: WatcherHealthStatus;
}

/**
 * Security anomaly notification
 */
export interface WSSecurityAnomalyMessage {
  type: "watcher:security";
  timestamp: number;
  data: SecurityAnomaly;
}

/**
 * Symlink state change notification
 */
export interface WSSymlinkStateMessage {
  type: "symlink:state";
  timestamp: number;
  data: SymlinkState;
}

/**
 * Watcher started notification
 */
export interface WSWatcherStartedMessage {
  type: "watcher:started";
  timestamp: number;
  data: {
    path: string;
    type: WatchDirectoryType;
  };
}

/**
 * Watcher stopped notification
 */
export interface WSWatcherStoppedMessage {
  type: "watcher:stopped";
  timestamp: number;
  data: {
    path: string;
    reason?: string;
  };
}

/**
 * Watcher error notification
 */
export interface WSWatcherErrorMessage {
  type: "watcher:error";
  timestamp: number;
  data: {
    path?: string;
    error: string;
    code?: string;
  };
}

/**
 * Watcher metrics update
 */
export interface WSWatcherMetricsMessage {
  type: "watcher:metrics";
  timestamp: number;
  data: WatcherMetrics;
}

/**
 * Auto-classification result
 */
export interface WSAutoClassifyResultMessage {
  type: "classify:result";
  timestamp: number;
  data: {
    path: string;
    projectName: string;
    classification: {
      sets: string[];
      topics: string[];
      types: string[];
    };
    symlinksCreated: number;
    duration: number;
  };
}

/**
 * Config hot reload notification
 */
export interface WSConfigReloadMessage {
  type: "config:reloaded";
  timestamp: number;
  data: {
    configId: number;
    configName: string;
    changedFile: string;
  };
}

/**
 * Theme hot reload notification
 */
export interface WSThemeReloadMessage {
  type: "theme:reloaded";
  timestamp: number;
  data: {
    themeId: string;
    changedFiles: string[];
  };
}

/**
 * Module discovered notification
 */
export interface WSModuleDiscoveredMessage {
  type: "module:discovered";
  timestamp: number;
  data: {
    moduleName: string;
    modulePath: string;
    version?: string;
  };
}

/**
 * Symlink healing result
 */
export interface WSSymlinkHealedMessage {
  type: "symlink:healed";
  timestamp: number;
  data: {
    linkPath: string;
    oldTarget: string;
    newTarget: string;
  };
}

/**
 * Union of all watcher-related server messages
 */
export type WSFileWatcherServerMessage =
  | WSFileEventMessage
  | WSFileBatchMessage
  | WSWatcherHealthMessage
  | WSSecurityAnomalyMessage
  | WSSymlinkStateMessage
  | WSWatcherStartedMessage
  | WSWatcherStoppedMessage
  | WSWatcherErrorMessage
  | WSWatcherMetricsMessage
  | WSAutoClassifyResultMessage
  | WSConfigReloadMessage
  | WSThemeReloadMessage
  | WSModuleDiscoveredMessage
  | WSSymlinkHealedMessage;

// =============================================================================
// CLIENT -> SERVER MESSAGES
// =============================================================================

/**
 * Request to add a watch directory
 */
export interface WSAddWatchRequest {
  type: "watcher:add";
  data: WatchDirectoryConfig;
}

/**
 * Request to remove a watch directory
 */
export interface WSRemoveWatchRequest {
  type: "watcher:remove";
  data: {
    path: string;
  };
}

/**
 * Request to pause a watcher
 */
export interface WSPauseWatchRequest {
  type: "watcher:pause";
  data: {
    path: string;
  };
}

/**
 * Request to resume a watcher
 */
export interface WSResumeWatchRequest {
  type: "watcher:resume";
  data: {
    path: string;
  };
}

/**
 * Request to force rescan a directory
 */
export interface WSRescanRequest {
  type: "watcher:rescan";
  data: {
    path: string;
    deep?: boolean;
  };
}

/**
 * Request health status
 */
export interface WSHealthRequest {
  type: "watcher:health:request";
}

/**
 * Request metrics
 */
export interface WSMetricsRequest {
  type: "watcher:metrics:request";
}

/**
 * Request to heal broken symlinks
 */
export interface WSHealSymlinksRequest {
  type: "symlink:heal";
  data: {
    linkPaths?: string[]; // Specific paths, or all if empty
    searchPaths: string[];
  };
}

/**
 * Request to verify symlinks
 */
export interface WSVerifySymlinksRequest {
  type: "symlink:verify";
  data: {
    basePath: string;
  };
}

/**
 * Subscribe to file watcher channels
 */
export interface WSWatcherSubscribe {
  type: "watcher:subscribe";
  channels: WatcherChannel[];
}

/**
 * Unsubscribe from file watcher channels
 */
export interface WSWatcherUnsubscribe {
  type: "watcher:unsubscribe";
  channels: WatcherChannel[];
}

/**
 * Union of all watcher-related client messages
 */
export type WSFileWatcherClientMessage =
  | WSAddWatchRequest
  | WSRemoveWatchRequest
  | WSPauseWatchRequest
  | WSResumeWatchRequest
  | WSRescanRequest
  | WSHealthRequest
  | WSMetricsRequest
  | WSHealSymlinksRequest
  | WSVerifySymlinksRequest
  | WSWatcherSubscribe
  | WSWatcherUnsubscribe;

// =============================================================================
// CHANNELS
// =============================================================================

/**
 * Available watcher subscription channels
 */
export type WatcherChannel =
  | "files"           // All file events
  | "files:content"   // Content directory events only
  | "files:config"    // Config file events only
  | "files:theme"     // Theme file events only
  | "files:module"    // Module discovery events
  | "files:media"     // Media file events
  | "symlinks"        // Symlink state changes
  | "health"          // Health status updates
  | "metrics"         // Metrics updates
  | "security"        // Security anomaly alerts
  | "admin";          // Admin-only events (includes health + security)

/**
 * Default channels for different user roles
 */
export const DEFAULT_CHANNELS_BY_ROLE: Record<string, WatcherChannel[]> = {
  admin: ["files", "symlinks", "health", "metrics", "security", "admin"],
  editor: ["files:content", "files:media", "symlinks"],
  developer: ["files", "files:theme", "files:module", "symlinks"],
  viewer: ["files:content"],
};

// =============================================================================
// ADMIN API TYPES
// =============================================================================

/**
 * Watcher admin API response types
 */

export interface WatcherListResponse {
  watchers: Array<{
    path: string;
    type: WatchDirectoryType;
    enabled: boolean;
    status: "running" | "stopped" | "error";
    watchedCount: number;
    lastEvent: number | null;
  }>;
  totalWatchers: number;
  totalWatchedPaths: number;
}

export interface WatcherDetailResponse {
  path: string;
  type: WatchDirectoryType;
  config: WatchDirectoryConfig;
  status: "running" | "stopped" | "error";
  health: {
    ready: boolean;
    watchedCount: number;
    pendingEvents: number;
    errorCount: number;
    lastError: string | null;
  };
  recentEvents: FileEvent[];
  symlinks?: SymlinkState[];
}

export interface WatcherCreateRequest {
  path: string;
  type: WatchDirectoryType;
  label?: string;
  enabled?: boolean;
  ignorePatterns?: string[];
  depth?: number;
  followSymlinks?: boolean;
  debounce?: {
    strategy: "trailing" | "leading" | "throttle" | "batch";
    delayMs: number;
    maxWaitMs?: number;
    maxBatchSize?: number;
  };
  handlerOptions?: Record<string, unknown>;
}

export interface WatcherUpdateRequest {
  enabled?: boolean;
  ignorePatterns?: string[];
  depth?: number;
  debounce?: {
    strategy?: "trailing" | "leading" | "throttle" | "batch";
    delayMs?: number;
    maxWaitMs?: number;
    maxBatchSize?: number;
  };
}

export interface SymlinkListResponse {
  symlinks: SymlinkState[];
  total: number;
  broken: number;
  healthy: number;
}

export interface SymlinkHealRequest {
  linkPaths?: string[];
  searchPaths: string[];
  dryRun?: boolean;
}

export interface SymlinkHealResponse {
  healed: Array<{
    linkPath: string;
    newTarget: string;
  }>;
  failed: Array<{
    linkPath: string;
    error: string;
  }>;
  totalHealed: number;
  totalFailed: number;
}

export interface SecurityEventsResponse {
  events: SecurityAnomaly[];
  total: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}
