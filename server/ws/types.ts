/**
 * @file types.ts
 * @description Type definitions for WebSocket messages.
 * @phase Phase 3 - File System Integration
 * @author FW (File Watcher Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 */

/**
 * WebSocket message types for real-time updates.
 */
export type WSMessageType =
  | "connection"
  | "heartbeat"
  | "project:added"
  | "project:changed"
  | "project:removed"
  | "symlink:created"
  | "symlink:removed"
  | "symlink:error"
  | "scan:started"
  | "scan:progress"
  | "scan:completed"
  | "error"
  // Kernel events
  | "kernel:event"
  | "kernel:module:registered"
  | "kernel:module:loaded"
  | "kernel:module:started"
  | "kernel:module:stopped"
  | "kernel:module:enabled"
  | "kernel:module:disabled"
  | "kernel:module:failed"
  | "kernel:module:health"
  | "kernel:system:ready"
  | "kernel:system:shutdown"
  | "kernel:system:health"
  // Feature flag events
  | "feature:created"
  | "feature:updated"
  | "feature:deleted"
  | "feature:enabled"
  | "feature:disabled"
  | "feature:override:set"
  | "feature:override:deleted"
  | "feature:rollout:changed"
  | "feature:targeting:updated"
  | "feature:cache:invalidated"
  // Collaboration events (added 2026-04-14 — used by client/src/hooks/use-collaboration.ts)
  | "presence:update"
  | "presence:leave"
  | "cursor:update"
  | "comment:add"
  | "comment:update"
  | "comment:delete"
  | "conflict:detected"
  | "conflict:resolved"
  | "version:created";

/**
 * Base WebSocket message structure.
 */
export interface WSMessage {
  type: WSMessageType;
  timestamp: number;
}

/**
 * Connection established message.
 */
export interface WSConnectionMessage extends WSMessage {
  type: "connection";
  clientId: string;
  serverVersion: string;
}

/**
 * Heartbeat message for connection health.
 */
export interface WSHeartbeatMessage extends WSMessage {
  type: "heartbeat";
  clientId?: string;
}

/**
 * Project file event data.
 */
export interface ProjectEventData {
  path: string;
  name: string;
  classification?: {
    sets: string[];
    topics: string[];
    types: string[];
  };
}

/**
 * Project added event.
 */
export interface WSProjectAddedMessage extends WSMessage {
  type: "project:added";
  data: ProjectEventData;
}

/**
 * Project changed event.
 */
export interface WSProjectChangedMessage extends WSMessage {
  type: "project:changed";
  data: ProjectEventData;
}

/**
 * Project removed event.
 */
export interface WSProjectRemovedMessage extends WSMessage {
  type: "project:removed";
  data: { path: string; name: string };
}

/**
 * Symlink operation result.
 */
export interface SymlinkEventData {
  source: string;
  target: string;
  category: string;
}

/**
 * Symlink created event.
 */
export interface WSSymlinkCreatedMessage extends WSMessage {
  type: "symlink:created";
  data: SymlinkEventData;
}

/**
 * Symlink removed event.
 */
export interface WSSymlinkRemovedMessage extends WSMessage {
  type: "symlink:removed";
  data: SymlinkEventData;
}

/**
 * Symlink error event.
 */
export interface WSSymlinkErrorMessage extends WSMessage {
  type: "symlink:error";
  data: { source: string; error: string };
}

/**
 * Scan progress data.
 */
export interface ScanProgressData {
  scannedCount: number;
  totalEstimate?: number;
  currentPath?: string;
}

/**
 * Scan started event.
 */
export interface WSScanStartedMessage extends WSMessage {
  type: "scan:started";
  data: { rootPath: string };
}

/**
 * Scan progress event.
 */
export interface WSScanProgressMessage extends WSMessage {
  type: "scan:progress";
  data: ScanProgressData;
}

/**
 * Scan completed event.
 */
export interface WSScanCompletedMessage extends WSMessage {
  type: "scan:completed";
  data: { projectCount: number; duration: number };
}

/**
 * Error event.
 */
export interface WSErrorMessage extends WSMessage {
  type: "error";
  code: string;
  message: string;
}

// =============================================================================
// KERNEL EVENT MESSAGES
// =============================================================================

/**
 * Generic kernel event payload for streaming.
 */
export interface KernelEventData {
  type: string;
  moduleId?: string;
  data?: unknown;
  source?: string;
  correlationId?: string;
}

/**
 * Generic kernel event message.
 */
export interface WSKernelEventMessage extends WSMessage {
  type: "kernel:event";
  data: KernelEventData;
}

/**
 * Module lifecycle event data.
 */
export interface ModuleEventData {
  moduleId: string;
  moduleName: string;
  tier: string;
  state?: string;
  version?: string;
  error?: string;
}

/**
 * Module registered event.
 */
export interface WSKernelModuleRegisteredMessage extends WSMessage {
  type: "kernel:module:registered";
  data: ModuleEventData;
}

/**
 * Module loaded event.
 */
export interface WSKernelModuleLoadedMessage extends WSMessage {
  type: "kernel:module:loaded";
  data: ModuleEventData;
}

/**
 * Module started event.
 */
export interface WSKernelModuleStartedMessage extends WSMessage {
  type: "kernel:module:started";
  data: ModuleEventData;
}

/**
 * Module stopped event.
 */
export interface WSKernelModuleStoppedMessage extends WSMessage {
  type: "kernel:module:stopped";
  data: ModuleEventData;
}

/**
 * Module enabled event.
 */
export interface WSKernelModuleEnabledMessage extends WSMessage {
  type: "kernel:module:enabled";
  data: ModuleEventData;
}

/**
 * Module disabled event.
 */
export interface WSKernelModuleDisabledMessage extends WSMessage {
  type: "kernel:module:disabled";
  data: ModuleEventData;
}

/**
 * Module failed event.
 */
export interface WSKernelModuleFailedMessage extends WSMessage {
  type: "kernel:module:failed";
  data: ModuleEventData & { error: string };
}

/**
 * Module health changed event.
 */
export interface WSKernelModuleHealthMessage extends WSMessage {
  type: "kernel:module:health";
  data: {
    moduleId: string;
    status: "healthy" | "degraded" | "unhealthy";
    message?: string;
  };
}

/**
 * System ready event.
 */
export interface WSKernelSystemReadyMessage extends WSMessage {
  type: "kernel:system:ready";
  data: {
    bootTimeMs: number;
    modulesLoaded: number;
  };
}

/**
 * System shutdown event.
 */
export interface WSKernelSystemShutdownMessage extends WSMessage {
  type: "kernel:system:shutdown";
  data: {
    reason?: string;
  };
}

/**
 * System health check event.
 */
export interface WSKernelSystemHealthMessage extends WSMessage {
  type: "kernel:system:health";
  data: {
    status: "healthy" | "degraded" | "unhealthy";
    modules: Record<string, { status: string; message?: string }>;
  };
}

// =============================================================================
// FEATURE FLAG EVENT MESSAGES
// =============================================================================

/**
 * Feature flag created event.
 */
export interface WSFeatureCreatedMessage extends WSMessage {
  type: "feature:created";
  data: {
    key: string;
    name: string;
    category: string;
    globallyEnabled: boolean;
  };
}

/**
 * Feature flag updated event.
 */
export interface WSFeatureUpdatedMessage extends WSMessage {
  type: "feature:updated";
  data: {
    key: string;
    name: string;
    changes: string[];
    globallyEnabled: boolean;
  };
}

/**
 * Feature flag deleted event.
 */
export interface WSFeatureDeletedMessage extends WSMessage {
  type: "feature:deleted";
  data: {
    key: string;
  };
}

/**
 * Feature flag enabled event.
 */
export interface WSFeatureEnabledMessage extends WSMessage {
  type: "feature:enabled";
  data: {
    key: string;
    name: string;
  };
}

/**
 * Feature flag disabled event.
 */
export interface WSFeatureDisabledMessage extends WSMessage {
  type: "feature:disabled";
  data: {
    key: string;
    name: string;
  };
}

/**
 * Feature override set event.
 */
export interface WSFeatureOverrideSetMessage extends WSMessage {
  type: "feature:override:set";
  data: {
    featureKey: string;
    scope: "site" | "user";
    targetId: string;
    enabled: boolean;
  };
}

/**
 * Feature override deleted event.
 */
export interface WSFeatureOverrideDeletedMessage extends WSMessage {
  type: "feature:override:deleted";
  data: {
    featureKey: string;
    scope: "site" | "user";
    targetId: string;
  };
}

/**
 * Feature rollout changed event.
 */
export interface WSFeatureRolloutChangedMessage extends WSMessage {
  type: "feature:rollout:changed";
  data: {
    key: string;
    percentage: number;
    enabled: boolean;
  };
}

/**
 * Feature targeting updated event.
 */
export interface WSFeatureTargetingUpdatedMessage extends WSMessage {
  type: "feature:targeting:updated";
  data: {
    key: string;
    rulesCount: number;
  };
}

/**
 * Feature cache invalidated event.
 */
export interface WSFeatureCacheInvalidatedMessage extends WSMessage {
  type: "feature:cache:invalidated";
  data: {
    keys: string[];
  };
}

/**
 * Union of all WebSocket message types.
 */
export type WSMessageUnion =
  | WSConnectionMessage
  | WSHeartbeatMessage
  | WSProjectAddedMessage
  | WSProjectChangedMessage
  | WSProjectRemovedMessage
  | WSSymlinkCreatedMessage
  | WSSymlinkRemovedMessage
  | WSSymlinkErrorMessage
  | WSScanStartedMessage
  | WSScanProgressMessage
  | WSScanCompletedMessage
  | WSErrorMessage
  // Kernel events
  | WSKernelEventMessage
  | WSKernelModuleRegisteredMessage
  | WSKernelModuleLoadedMessage
  | WSKernelModuleStartedMessage
  | WSKernelModuleStoppedMessage
  | WSKernelModuleEnabledMessage
  | WSKernelModuleDisabledMessage
  | WSKernelModuleFailedMessage
  | WSKernelModuleHealthMessage
  | WSKernelSystemReadyMessage
  | WSKernelSystemShutdownMessage
  | WSKernelSystemHealthMessage
  // Feature flag events
  | WSFeatureCreatedMessage
  | WSFeatureUpdatedMessage
  | WSFeatureDeletedMessage
  | WSFeatureEnabledMessage
  | WSFeatureDisabledMessage
  | WSFeatureOverrideSetMessage
  | WSFeatureOverrideDeletedMessage
  | WSFeatureRolloutChangedMessage
  | WSFeatureTargetingUpdatedMessage
  | WSFeatureCacheInvalidatedMessage;

/**
 * Client-to-server message types.
 */
export type WSClientMessageType =
  | "heartbeat"
  | "scan:request"
  | "symlink:request"
  | "subscribe"
  | "unsubscribe";

/**
 * Client heartbeat/pong response.
 */
export interface WSClientHeartbeat {
  type: "heartbeat";
}

/**
 * Client scan request.
 */
export interface WSClientScanRequest {
  type: "scan:request";
  rootPath: string;
  configId?: number;
}

/**
 * Client symlink request.
 */
export interface WSClientSymlinkRequest {
  type: "symlink:request";
  projectPath: string;
  configId: number;
}

/**
 * Client subscription request.
 */
export interface WSClientSubscribe {
  type: "subscribe";
  channels: string[];
}

/**
 * Client unsubscribe request.
 */
export interface WSClientUnsubscribe {
  type: "unsubscribe";
  channels: string[];
}

/**
 * Union of all client message types.
 */
export type WSClientMessage =
  | WSClientHeartbeat
  | WSClientScanRequest
  | WSClientSymlinkRequest
  | WSClientSubscribe
  | WSClientUnsubscribe;
