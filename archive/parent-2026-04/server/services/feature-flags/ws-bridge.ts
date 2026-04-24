/**
 * @file ws-bridge.ts
 * @description Bridge between Feature Flags Service and WebSocket for real-time updates.
 *
 * Subscribes to feature flag events and broadcasts them to WebSocket clients
 * subscribed to the "feature-flags" channel. Enables admin UI to display
 * real-time flag changes, override updates, and rollout modifications.
 *
 * @module feature-flags/ws-bridge
 * @phase Phase 2 - Real-time Feature Flag Updates
 * @created 2026-02-02
 */

import type { WSServer } from "../../ws";
import type {
  WSFeatureCreatedMessage,
  WSFeatureUpdatedMessage,
  WSFeatureDeletedMessage,
  WSFeatureEnabledMessage,
  WSFeatureDisabledMessage,
  WSFeatureOverrideSetMessage,
  WSFeatureOverrideDeletedMessage,
  WSFeatureRolloutChangedMessage,
  WSFeatureTargetingUpdatedMessage,
  WSFeatureCacheInvalidatedMessage,
} from "../../ws/types";
import type { FeatureFlagEvent, FeatureFlagEventHandler } from "./types";
import type { FeatureFlagsService } from "./index";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-flags-ws-bridge");

/**
 * WebSocket channel for feature flag events.
 * Clients must subscribe to this channel to receive feature flag updates.
 */
export const FEATURE_FLAGS_WS_CHANNEL = "feature-flags";

/**
 * Union of all feature flag WebSocket messages.
 */
export type WSFeatureFlagMessageUnion =
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
 * Creates the bridge between Feature Flags Service and WebSocket server.
 *
 * @param service - The feature flags service instance
 * @param wsServer - The WebSocket server instance
 * @returns Cleanup function to unsubscribe the handler
 */
export function createFeatureFlagsWSBridge(
  service: FeatureFlagsService,
  wsServer: WSServer
): () => void {
  log.info("Creating feature-flags-to-WebSocket bridge");

  /**
   * Converts internal FeatureFlagEvent to WebSocket message format.
   */
  const eventHandler: FeatureFlagEventHandler = (event: FeatureFlagEvent) => {
    let message: WSFeatureFlagMessageUnion;
    const timestamp = Date.now();

    switch (event.type) {
      case "flag_created":
        message = {
          type: "feature:created",
          timestamp,
          data: {
            key: event.flag.key,
            name: event.flag.name,
            category: event.flag.category,
            globallyEnabled: event.flag.globallyEnabled,
          },
        };
        break;

      case "flag_updated":
        // Determine what changed
        const changes: string[] = [];
        if (event.previousState.name !== event.flag.name) changes.push("name");
        if (event.previousState.description !== event.flag.description) changes.push("description");
        if (event.previousState.globallyEnabled !== event.flag.globallyEnabled) changes.push("globallyEnabled");
        if (event.previousState.category !== event.flag.category) changes.push("category");
        if (JSON.stringify(event.previousState.percentageRollout) !== JSON.stringify(event.flag.percentageRollout)) {
          changes.push("percentageRollout");
        }
        if (JSON.stringify(event.previousState.targetingRules) !== JSON.stringify(event.flag.targetingRules)) {
          changes.push("targetingRules");
        }

        message = {
          type: "feature:updated",
          timestamp,
          data: {
            key: event.flag.key,
            name: event.flag.name,
            changes,
            globallyEnabled: event.flag.globallyEnabled,
          },
        };
        break;

      case "flag_deleted":
        message = {
          type: "feature:deleted",
          timestamp,
          data: {
            key: event.key,
          },
        };
        break;

      case "flag_enabled":
        message = {
          type: "feature:enabled",
          timestamp,
          data: {
            key: event.key,
            name: event.key, // Will be enriched by client if needed
          },
        };
        break;

      case "flag_disabled":
        message = {
          type: "feature:disabled",
          timestamp,
          data: {
            key: event.key,
            name: event.key,
          },
        };
        break;

      case "override_set":
        const override = event.override;
        const isSiteOverride = "siteId" in override;
        message = {
          type: "feature:override:set",
          timestamp,
          data: {
            featureKey: override.featureKey,
            scope: event.scope,
            targetId: isSiteOverride ? (override as any).siteId : (override as any).userId,
            enabled: override.enabled,
          },
        };
        break;

      case "override_deleted":
        message = {
          type: "feature:override:deleted",
          timestamp,
          data: {
            featureKey: event.key,
            scope: event.scope,
            targetId: event.targetId,
          },
        };
        break;

      case "rollout_changed":
        message = {
          type: "feature:rollout:changed",
          timestamp,
          data: {
            key: event.key,
            percentage: event.percentage,
            enabled: event.percentage > 0,
          },
        };
        break;

      case "targeting_updated":
        message = {
          type: "feature:targeting:updated",
          timestamp,
          data: {
            key: event.key,
            rulesCount: event.rules.length,
          },
        };
        break;

      case "cache_invalidated":
        message = {
          type: "feature:cache:invalidated",
          timestamp,
          data: {
            keys: event.keys,
          },
        };
        break;

      default:
        log.warn({ event }, "Unknown feature flag event type");
        return;
    }

    // Broadcast to all clients subscribed to the feature-flags channel
    wsServer.broadcast(message as any, FEATURE_FLAGS_WS_CHANNEL);
    log.debug({ type: message.type, data: message.data }, "Broadcast feature flag event");
  };

  // Register the event handler with the service
  service.onEvent(eventHandler);

  log.info("Feature-flags-to-WebSocket bridge created");

  // Return cleanup function
  return () => {
    log.info("Cleaning up feature-flags-to-WebSocket bridge");
    service.offEvent(eventHandler);
    log.debug("Feature flag event handler removed");
  };
}
