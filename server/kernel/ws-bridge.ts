/**
 * @file ws-bridge.ts
 * @description Bridge between Kernel EventBus and WebSocket for real-time event streaming.
 *
 * This module subscribes to kernel events and broadcasts them to WebSocket clients
 * subscribed to the "kernel" channel. This enables the admin UI to display
 * real-time module lifecycle events, health changes, and system events.
 *
 * @module kernel/ws-bridge
 * @phase Phase 4 - Real-time Event Streaming
 * @created 2026-02-01
 */

import type { IEventBus, EventPayload } from "./types";
import type { WSServer } from "../ws";
import type {
  WSKernelEventMessage,
  WSKernelModuleRegisteredMessage,
  WSKernelModuleLoadedMessage,
  WSKernelModuleStartedMessage,
  WSKernelModuleStoppedMessage,
  WSKernelModuleEnabledMessage,
  WSKernelModuleDisabledMessage,
  WSKernelModuleFailedMessage,
  WSKernelModuleHealthMessage,
  WSKernelSystemReadyMessage,
  WSKernelSystemShutdownMessage,
  WSKernelSystemHealthMessage,
} from "../ws/types";
import { REGISTRY_EVENTS } from "./registry";
import { SYSTEM_EVENTS } from "./bootstrap";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("kernel-ws-bridge");

/**
 * WebSocket channel for kernel events.
 * Clients must subscribe to this channel to receive kernel events.
 */
export const KERNEL_WS_CHANNEL = "kernel";

/**
 * Map of kernel event types to WebSocket message types.
 */
const EVENT_TO_WS_TYPE: Record<string, string> = {
  [REGISTRY_EVENTS.MODULE_REGISTERED]: "kernel:module:registered",
  [REGISTRY_EVENTS.MODULE_LOADED]: "kernel:module:loaded",
  [REGISTRY_EVENTS.MODULE_STARTED]: "kernel:module:started",
  [REGISTRY_EVENTS.MODULE_STOPPED]: "kernel:module:stopped",
  [REGISTRY_EVENTS.MODULE_ENABLED]: "kernel:module:enabled",
  [REGISTRY_EVENTS.MODULE_DISABLED]: "kernel:module:disabled",
  [REGISTRY_EVENTS.MODULE_FAILED]: "kernel:module:failed",
  [REGISTRY_EVENTS.MODULE_HEALTH_CHANGED]: "kernel:module:health",
  [SYSTEM_EVENTS.READY]: "kernel:system:ready",
  [SYSTEM_EVENTS.SHUTDOWN]: "kernel:system:shutdown",
  [SYSTEM_EVENTS.HEALTH_CHECK]: "kernel:system:health",
};

/**
 * Subscriptions maintained by the bridge for cleanup.
 */
interface BridgeSubscriptions {
  moduleRegistered: () => void;
  moduleLoaded: () => void;
  moduleStarted: () => void;
  moduleStopped: () => void;
  moduleEnabled: () => void;
  moduleDisabled: () => void;
  moduleFailed: () => void;
  moduleHealthChanged: () => void;
  systemReady: () => void;
  systemShutdown: () => void;
  systemHealthCheck: () => void;
  allEvents: () => void;
}

/**
 * Creates the bridge between kernel EventBus and WebSocket server.
 *
 * @param events - The kernel event bus
 * @param wsServer - The WebSocket server instance
 * @returns Cleanup function to unsubscribe all handlers
 */
export function createKernelWSBridge(
  events: IEventBus,
  wsServer: WSServer
): () => void {
  log.info("Creating kernel-to-WebSocket bridge");

  const subscriptions: Partial<BridgeSubscriptions> = {};

  // =========================================================================
  // MODULE LIFECYCLE EVENTS
  // =========================================================================

  // Module registered
  subscriptions.moduleRegistered = events.on(
    REGISTRY_EVENTS.MODULE_REGISTERED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string; version: string } };
      const msg: WSKernelModuleRegisteredMessage = {
        type: "kernel:module:registered",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
          version: data.manifest.version,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:registered");
    }
  ).unsubscribe;

  // Module loaded
  subscriptions.moduleLoaded = events.on(
    REGISTRY_EVENTS.MODULE_LOADED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string; version: string }; state: string };
      const msg: WSKernelModuleLoadedMessage = {
        type: "kernel:module:loaded",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
          version: data.manifest.version,
          state: data.state,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:loaded");
    }
  ).unsubscribe;

  // Module started
  subscriptions.moduleStarted = events.on(
    REGISTRY_EVENTS.MODULE_STARTED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string; version: string } };
      const msg: WSKernelModuleStartedMessage = {
        type: "kernel:module:started",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
          version: data.manifest.version,
          state: "running",
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:started");
    }
  ).unsubscribe;

  // Module stopped
  subscriptions.moduleStopped = events.on(
    REGISTRY_EVENTS.MODULE_STOPPED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string } };
      const msg: WSKernelModuleStoppedMessage = {
        type: "kernel:module:stopped",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
          state: "stopped",
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:stopped");
    }
  ).unsubscribe;

  // Module enabled
  subscriptions.moduleEnabled = events.on(
    REGISTRY_EVENTS.MODULE_ENABLED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string } };
      const msg: WSKernelModuleEnabledMessage = {
        type: "kernel:module:enabled",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:enabled");
    }
  ).unsubscribe;

  // Module disabled
  subscriptions.moduleDisabled = events.on(
    REGISTRY_EVENTS.MODULE_DISABLED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string } };
      const msg: WSKernelModuleDisabledMessage = {
        type: "kernel:module:disabled",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:disabled");
    }
  ).unsubscribe;

  // Module failed
  subscriptions.moduleFailed = events.on(
    REGISTRY_EVENTS.MODULE_FAILED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; manifest: { name: string; tier: string }; error: Error };
      const msg: WSKernelModuleFailedMessage = {
        type: "kernel:module:failed",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          moduleName: data.manifest.name,
          tier: data.manifest.tier,
          error: data.error?.message || "Unknown error",
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId }, "Broadcast module:failed");
    }
  ).unsubscribe;

  // Module health changed
  subscriptions.moduleHealthChanged = events.on(
    REGISTRY_EVENTS.MODULE_HEALTH_CHANGED,
    (event: EventPayload) => {
      const data = event.data as { moduleId: string; health: { status: string; message?: string } };
      const msg: WSKernelModuleHealthMessage = {
        type: "kernel:module:health",
        timestamp: Date.now(),
        data: {
          moduleId: data.moduleId,
          status: data.health.status as "healthy" | "degraded" | "unhealthy",
          message: data.health.message,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ moduleId: data.moduleId, status: data.health.status }, "Broadcast module:health");
    }
  ).unsubscribe;

  // =========================================================================
  // SYSTEM EVENTS
  // =========================================================================

  // System ready
  subscriptions.systemReady = events.on(
    SYSTEM_EVENTS.READY,
    (event: EventPayload) => {
      const data = event.data as { bootTimeMs: number; modulesLoaded: number };
      const msg: WSKernelSystemReadyMessage = {
        type: "kernel:system:ready",
        timestamp: Date.now(),
        data: {
          bootTimeMs: data.bootTimeMs,
          modulesLoaded: data.modulesLoaded,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug("Broadcast system:ready");
    }
  ).unsubscribe;

  // System shutdown
  subscriptions.systemShutdown = events.on(
    SYSTEM_EVENTS.SHUTDOWN,
    (event: EventPayload) => {
      const data = event.data as { reason?: string };
      const msg: WSKernelSystemShutdownMessage = {
        type: "kernel:system:shutdown",
        timestamp: Date.now(),
        data: {
          reason: data.reason,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug("Broadcast system:shutdown");
    }
  ).unsubscribe;

  // System health check
  subscriptions.systemHealthCheck = events.on(
    SYSTEM_EVENTS.HEALTH_CHECK,
    (event: EventPayload) => {
      const data = event.data as { modules: Record<string, { status: string; message?: string }> };

      // Determine overall status
      const statuses = Object.values(data.modules).map((m) => m.status);
      let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (statuses.some((s) => s === "unhealthy")) {
        overallStatus = "unhealthy";
      } else if (statuses.some((s) => s === "degraded")) {
        overallStatus = "degraded";
      }

      const msg: WSKernelSystemHealthMessage = {
        type: "kernel:system:health",
        timestamp: Date.now(),
        data: {
          status: overallStatus,
          modules: data.modules,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
      log.debug({ status: overallStatus }, "Broadcast system:health");
    }
  ).unsubscribe;

  // =========================================================================
  // GENERIC EVENT FORWARDING (for custom/module events)
  // =========================================================================

  // Forward all events with ":" in them as generic kernel events
  // This allows modules to emit custom events that also get streamed
  subscriptions.allEvents = events.on(
    "*",
    (event: EventPayload) => {
      // Skip already-handled registry and system events
      if (
        event.type.startsWith("registry:") ||
        event.type.startsWith("system:")
      ) {
        return;
      }

      // Only forward module-specific events (contain ":")
      if (!event.type.includes(":")) {
        return;
      }

      const msg: WSKernelEventMessage = {
        type: "kernel:event",
        timestamp: Date.now(),
        data: {
          type: event.type,
          moduleId: event.source,
          data: event.data,
          source: event.source,
          correlationId: event.correlationId,
        },
      };
      wsServer.broadcast(msg, KERNEL_WS_CHANNEL);
    }
  ).unsubscribe;

  log.info("Kernel-to-WebSocket bridge created, subscribed to kernel events");

  // =========================================================================
  // CLEANUP FUNCTION
  // =========================================================================

  return () => {
    log.info("Cleaning up kernel-to-WebSocket bridge");

    Object.values(subscriptions).forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });

    log.debug("All kernel event subscriptions removed");
  };
}
