/**
 * @file use-websocket.ts
 * @description React hook for WebSocket connection to receive real-time updates.
 * @phase Phase 3 - File System Integration
 * @author UI (UI Development Expert Agent)
 * @validated FW (File Watcher Specialist Agent)
 * @created 2026-01-31
 */

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * WebSocket message types from server.
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
  /** WebSocket URL (default: ws://host/ws) */
  url?: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect interval in ms */
  reconnectInterval?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Channels to subscribe to */
  channels?: string[];
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
const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Hook for WebSocket connection with automatic reconnection.
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = getDefaultWSUrl(),
    autoReconnect = true,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    channels = ["default"],
  } = options;

  const [state, setState] = useState<WSConnectionState>("disconnected");
  const [clientId, setClientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Connects to the WebSocket server.
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState("connecting");

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setState("connected");
        reconnectAttemptsRef.current = 0;

        // Subscribe to channels
        if (channels.length > 0) {
          wsRef.current?.send(
            JSON.stringify({ type: "subscribe", channels })
          );
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          setLastMessage(message);

          // Handle connection message
          if (message.type === "connection" && "clientId" in message) {
            setClientId((message as { clientId: string }).clientId);
          }

          // Store message (keep last 100)
          setMessages((prev) => {
            const updated = [message, ...prev];
            return updated.slice(0, MAX_MESSAGES);
          });
        } catch (err) {
          console.error("[WS] Failed to parse message:", err);
        }
      };

      wsRef.current.onclose = () => {
        setState("disconnected");
        wsRef.current = null;

        // Auto-reconnect
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(
            `[WS] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      wsRef.current.onerror = () => {
        setState("error");
      };
    } catch (err) {
      console.error("[WS] Failed to connect:", err);
      setState("error");
    }
  }, [url, autoReconnect, reconnectInterval, maxReconnectAttempts, channels]);

  /**
   * Disconnects from the WebSocket server.
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState("disconnected");
  }, [maxReconnectAttempts]);

  /**
   * Sends a message to the server.
   */
  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("[WS] Cannot send: not connected");
    }
  }, []);

  /**
   * Subscribes to channels.
   */
  const subscribe = useCallback((channelList: string[]) => {
    send({ type: "subscribe", channels: channelList });
  }, [send]);

  /**
   * Unsubscribes from channels.
   */
  const unsubscribe = useCallback((channelList: string[]) => {
    send({ type: "unsubscribe", channels: channelList });
  }, [send]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    state,
    clientId,
    lastMessage,
    messages,
    send,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
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
