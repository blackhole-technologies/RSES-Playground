/**
 * @file use-websocket.ts
 * @description React hook for WebSocket connection to receive real-time updates.
 * Uses a singleton connection shared across all hook instances.
 * @phase Phase 3 - File System Integration
 * @author UI (UI Development Expert Agent)
 * @validated FW (File Watcher Specialist Agent)
 * @created 2026-01-31
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";

/**
 * WebSocket message types from server.
 *
 * Kept in sync with `server/ws/types.ts` `WSMessageType`. When you add a
 * new type on the server side, mirror it here so the client hook can
 * subscribe to it without a type error.
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
  // Collaboration events (added 2026-04-14 — used by use-collaboration.ts)
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
 * Generic WebSocket message.
 */
export interface WSMessage {
  type: WSMessageType;
  timestamp: number;
  data?: unknown;
}

/**
 * WebSocket connection state.
 */
export type WSConnectionState = "connecting" | "connected" | "disconnected" | "error";

/**
 * WebSocket hook options.
 */
export interface UseWebSocketOptions {
  /** Channels to subscribe to */
  channels?: string[];
  /** Whether to auto-connect (default: true) */
  autoConnect?: boolean;
}

/**
 * WebSocket hook return value.
 */
export interface UseWebSocketReturn {
  /** Current connection state */
  state: WSConnectionState;
  /** Client ID assigned by server */
  clientId: string | null;
  /** Last received message */
  lastMessage: WSMessage | null;
  /** All received messages (latest 100) */
  messages: WSMessage[];
  /** Send a message to server */
  send: (message: unknown) => void;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Subscribe to channels */
  subscribe: (channels: string[]) => void;
  /** Unsubscribe from channels */
  unsubscribe: (channels: string[]) => void;
}

const MAX_MESSAGES = 100;
const RECONNECT_INTERVAL = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

// =============================================================================
// SINGLETON WEBSOCKET MANAGER
// =============================================================================

type Listener = () => void;

interface WSState {
  connectionState: WSConnectionState;
  clientId: string | null;
  messages: WSMessage[];
  lastMessage: WSMessage | null;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private subscribedChannels: Set<string> = new Set(["default"]);
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  private state: WSState = {
    connectionState: "disconnected",
    clientId: null,
    messages: [],
    lastMessage: null,
  };

  getState(): WSState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private setState(partial: Partial<WSState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.isConnecting = true;
    this.setState({ connectionState: "connecting" });

    const url = getDefaultWSUrl();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setState({ connectionState: "connected" });

        // Subscribe to all channels
        if (this.subscribedChannels.size > 0) {
          this.send({ type: "subscribe", channels: Array.from(this.subscribedChannels) });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;

          // Handle connection message
          if (message.type === "connection" && "clientId" in message) {
            this.setState({ clientId: (message as { clientId: string }).clientId });
          }

          // Store message
          const messages = [message, ...this.state.messages].slice(0, MAX_MESSAGES);
          this.setState({ messages, lastMessage: message });
        } catch (err) {
          console.error("[WS] Failed to parse message:", err);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.setState({ connectionState: "disconnected" });

        // Auto-reconnect
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          console.log(`[WS] Reconnecting in ${RECONNECT_INTERVAL}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          this.reconnectTimeout = setTimeout(() => this.connect(), RECONNECT_INTERVAL);
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        this.setState({ connectionState: "error" });
      };
    } catch (err) {
      this.isConnecting = false;
      console.error("[WS] Failed to connect:", err);
      this.setState({ connectionState: "error" });
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState({ connectionState: "disconnected" });
  }

  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribeToChannels(channels: string[]) {
    const newChannels = channels.filter((c) => !this.subscribedChannels.has(c));
    if (newChannels.length === 0) return;

    newChannels.forEach((c) => this.subscribedChannels.add(c));

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "subscribe", channels: newChannels });
    }
  }

  unsubscribeFromChannels(channels: string[]) {
    channels.forEach((c) => this.subscribedChannels.delete(c));

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "unsubscribe", channels });
    }
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

function getWSManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

/**
 * Gets the default WebSocket URL based on current location.
 */
function getDefaultWSUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:5000/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

/**
 * Hook for WebSocket connection with automatic reconnection.
 * Uses a singleton connection shared across all components.
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { channels = ["default"], autoConnect = true } = options;

  const manager = getWSManager();

  // Use useSyncExternalStore for safe concurrent rendering
  const state = useSyncExternalStore(
    (callback) => manager.subscribe(callback),
    () => manager.getState(),
    () => manager.getState()
  );

  // Connect on mount, subscribe to channels
  useEffect(() => {
    if (autoConnect) {
      manager.connect();
    }
    manager.subscribeToChannels(channels);

    // Don't unsubscribe on unmount - let other hooks use the channels
    // The singleton will manage the connection lifecycle
  }, [autoConnect, channels.join(",")]);

  const send = useCallback((message: unknown) => {
    manager.send(message);
  }, []);

  const connect = useCallback(() => {
    manager.connect();
  }, []);

  const disconnect = useCallback(() => {
    manager.disconnect();
  }, []);

  const subscribe = useCallback((channelList: string[]) => {
    manager.subscribeToChannels(channelList);
  }, []);

  const unsubscribe = useCallback((channelList: string[]) => {
    manager.unsubscribeFromChannels(channelList);
  }, []);

  return {
    state: state.connectionState,
    clientId: state.clientId,
    lastMessage: state.lastMessage,
    messages: state.messages,
    send,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
}

/**
 * Hook for subscribing to specific WebSocket message types.
 */
export function useWSMessages<T extends WSMessage>(
  type: WSMessageType | WSMessageType[]
): T[] {
  const { messages } = useWebSocket();
  const types = Array.isArray(type) ? type : [type];

  return messages.filter((m) => types.includes(m.type)) as T[];
}

/**
 * Hook for project-related WebSocket messages.
 */
export function useProjectEvents() {
  const { lastMessage, state } = useWebSocket({ channels: ["projects"] });
  const [projects, setProjects] = useState<Map<string, { name: string; path: string }>>(new Map());

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "project:added") {
      const data = lastMessage.data as { path: string; name: string };
      setProjects((prev) => new Map(prev).set(data.path, data));
    } else if (lastMessage.type === "project:removed") {
      const data = lastMessage.data as { path: string };
      setProjects((prev) => {
        const next = new Map(prev);
        next.delete(data.path);
        return next;
      });
    }
  }, [lastMessage]);

  return {
    projects: Array.from(projects.values()),
    isConnected: state === "connected",
  };
}

/**
 * Hook for scan progress tracking.
 */
export function useScanProgress() {
  const { lastMessage, state } = useWebSocket({ channels: ["scanner"] });
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ scanned: 0, current: "" });
  const [result, setResult] = useState<{ count: number; duration: number } | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "scan:started":
        setScanning(true);
        setProgress({ scanned: 0, current: "" });
        setResult(null);
        break;

      case "scan:progress": {
        const data = lastMessage.data as { scannedCount: number; currentPath?: string };
        setProgress({ scanned: data.scannedCount, current: data.currentPath || "" });
        break;
      }

      case "scan:completed": {
        const data = lastMessage.data as { projectCount: number; duration: number };
        setScanning(false);
        setResult({ count: data.projectCount, duration: data.duration });
        break;
      }
    }
  }, [lastMessage]);

  return {
    scanning,
    progress,
    result,
    isConnected: state === "connected",
  };
}

// =============================================================================
// KERNEL EVENTS
// =============================================================================

/**
 * Kernel event data structure.
 */
export interface KernelEvent {
  type: WSMessageType;
  timestamp: number;
  data?: {
    moduleId?: string;
    moduleName?: string;
    tier?: string;
    state?: string;
    version?: string;
    error?: string;
    status?: "healthy" | "degraded" | "unhealthy";
    message?: string;
    bootTimeMs?: number;
    modulesLoaded?: number;
    reason?: string;
    modules?: Record<string, { status: string; message?: string }>;
    [key: string]: unknown;
  };
}

/**
 * Hook for real-time kernel events via WebSocket.
 *
 * @description Subscribes to the "kernel" channel and receives live events
 * for module lifecycle changes, health updates, and system events.
 */
export function useKernelEventsWS(maxEvents: number = 100) {
  const { lastMessage, state, messages } = useWebSocket({ channels: ["kernel"] });
  const [events, setEvents] = useState<KernelEvent[]>([]);

  // Filter and store kernel events
  useEffect(() => {
    if (!lastMessage) return;

    // Only process kernel-related messages
    if (!lastMessage.type.startsWith("kernel:")) return;

    const kernelEvent: KernelEvent = {
      type: lastMessage.type,
      timestamp: lastMessage.timestamp,
      data: lastMessage.data as KernelEvent["data"],
    };

    setEvents((prev) => {
      const updated = [kernelEvent, ...prev];
      return updated.slice(0, maxEvents);
    });
  }, [lastMessage, maxEvents]);

  // Get latest kernel event
  const latestEvent = events.length > 0 ? events[0] : null;

  // Module-specific event helpers
  const moduleEvents = events.filter(
    (e) => e.type.startsWith("kernel:module:")
  );

  const systemEvents = events.filter(
    (e) => e.type.startsWith("kernel:system:")
  );

  return {
    /** All kernel events (newest first) */
    events,
    /** Latest kernel event received */
    latestEvent,
    /** Module lifecycle events only */
    moduleEvents,
    /** System events only */
    systemEvents,
    /** WebSocket connection state */
    isConnected: state === "connected",
    /** Current connection state */
    connectionState: state,
    /** Clear all events */
    clearEvents: () => setEvents([]),
  };
}
