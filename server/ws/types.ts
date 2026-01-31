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
  | "error";

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
  | WSErrorMessage;

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
