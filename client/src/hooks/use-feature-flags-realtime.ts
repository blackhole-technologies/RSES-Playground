/**
 * @file use-feature-flags-realtime.ts
 * @description React hooks for real-time feature flag updates via WebSocket.
 * @phase Phase 2 - Real-time Feature Flag Updates
 * @created 2026-02-02
 *
 * Provides hooks for subscribing to feature flag changes and receiving
 * live updates when flags are created, updated, enabled, disabled, or deleted.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWebSocket, type WSMessage } from "./use-websocket";

/**
 * Feature flag WebSocket message types.
 */
export type FeatureFlagMessageType =
  | "feature:created"
  | "feature:updated"
  | "feature:deleted"
  | "feature:enabled"
  | "feature:disabled"
  | "feature:override:set"
  | "feature:override:deleted"
  | "feature:rollout:changed"
  | "feature:targeting:updated"
  | "feature:cache:invalidated";

/**
 * Base feature flag event structure.
 */
export interface FeatureFlagEvent {
  type: FeatureFlagMessageType;
  timestamp: number;
  data: unknown;
}

/**
 * Feature created event.
 */
export interface FeatureCreatedEvent extends FeatureFlagEvent {
  type: "feature:created";
  data: {
    key: string;
    name: string;
    category: string;
    globallyEnabled: boolean;
  };
}

/**
 * Feature updated event.
 */
export interface FeatureUpdatedEvent extends FeatureFlagEvent {
  type: "feature:updated";
  data: {
    key: string;
    name: string;
    changes: string[];
    globallyEnabled: boolean;
  };
}

/**
 * Feature deleted event.
 */
export interface FeatureDeletedEvent extends FeatureFlagEvent {
  type: "feature:deleted";
  data: {
    key: string;
  };
}

/**
 * Feature enabled event.
 */
export interface FeatureEnabledEvent extends FeatureFlagEvent {
  type: "feature:enabled";
  data: {
    key: string;
    name: string;
  };
}

/**
 * Feature disabled event.
 */
export interface FeatureDisabledEvent extends FeatureFlagEvent {
  type: "feature:disabled";
  data: {
    key: string;
    name: string;
  };
}

/**
 * Override set event.
 */
export interface OverrideSetEvent extends FeatureFlagEvent {
  type: "feature:override:set";
  data: {
    featureKey: string;
    scope: "site" | "user";
    targetId: string;
    enabled: boolean;
  };
}

/**
 * Override deleted event.
 */
export interface OverrideDeletedEvent extends FeatureFlagEvent {
  type: "feature:override:deleted";
  data: {
    featureKey: string;
    scope: "site" | "user";
    targetId: string;
  };
}

/**
 * Rollout changed event.
 */
export interface RolloutChangedEvent extends FeatureFlagEvent {
  type: "feature:rollout:changed";
  data: {
    key: string;
    percentage: number;
    enabled: boolean;
  };
}

/**
 * Targeting updated event.
 */
export interface TargetingUpdatedEvent extends FeatureFlagEvent {
  type: "feature:targeting:updated";
  data: {
    key: string;
    rulesCount: number;
  };
}

/**
 * Cache invalidated event.
 */
export interface CacheInvalidatedEvent extends FeatureFlagEvent {
  type: "feature:cache:invalidated";
  data: {
    keys: string[];
  };
}

/**
 * Union of all feature flag events.
 */
export type FeatureFlagEventUnion =
  | FeatureCreatedEvent
  | FeatureUpdatedEvent
  | FeatureDeletedEvent
  | FeatureEnabledEvent
  | FeatureDisabledEvent
  | OverrideSetEvent
  | OverrideDeletedEvent
  | RolloutChangedEvent
  | TargetingUpdatedEvent
  | CacheInvalidatedEvent;

const FEATURE_FLAGS_CHANNEL = "feature-flags";
const MAX_EVENTS = 100;

/**
 * Hook for real-time feature flag events via WebSocket.
 *
 * @description Subscribes to the "feature-flags" channel and receives live
 * updates for all feature flag changes. Useful for admin dashboards.
 *
 * @example
 * ```tsx
 * function FeatureFlagsDashboard() {
 *   const { events, latestEvent, isConnected } = useFeatureFlagsRealtime();
 *
 *   useEffect(() => {
 *     if (latestEvent?.type === "feature:updated") {
 *       // Refresh flag data when a flag is updated
 *       refetchFlags();
 *     }
 *   }, [latestEvent]);
 *
 *   return (
 *     <div>
 *       <ConnectionStatus connected={isConnected} />
 *       <EventLog events={events} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeatureFlagsRealtime(maxEvents: number = MAX_EVENTS) {
  const { lastMessage, state, messages } = useWebSocket({
    channels: [FEATURE_FLAGS_CHANNEL],
  });

  const [events, setEvents] = useState<FeatureFlagEventUnion[]>([]);

  // Filter and store feature flag events
  useEffect(() => {
    if (!lastMessage) return;

    // Only process feature flag messages
    if (!lastMessage.type.startsWith("feature:")) return;

    const event = lastMessage as unknown as FeatureFlagEventUnion;

    setEvents((prev) => {
      const updated = [event, ...prev];
      return updated.slice(0, maxEvents);
    });
  }, [lastMessage, maxEvents]);

  // Get latest event
  const latestEvent = events.length > 0 ? events[0] : null;

  // Helper to get events by type
  const getEventsByType = useCallback(
    <T extends FeatureFlagEventUnion>(type: FeatureFlagMessageType): T[] => {
      return events.filter((e) => e.type === type) as T[];
    },
    [events]
  );

  // Event type helpers
  const createdEvents = useMemo(
    () => getEventsByType<FeatureCreatedEvent>("feature:created"),
    [getEventsByType]
  );

  const updatedEvents = useMemo(
    () => getEventsByType<FeatureUpdatedEvent>("feature:updated"),
    [getEventsByType]
  );

  const deletedEvents = useMemo(
    () => getEventsByType<FeatureDeletedEvent>("feature:deleted"),
    [getEventsByType]
  );

  const enabledEvents = useMemo(
    () => getEventsByType<FeatureEnabledEvent>("feature:enabled"),
    [getEventsByType]
  );

  const disabledEvents = useMemo(
    () => getEventsByType<FeatureDisabledEvent>("feature:disabled"),
    [getEventsByType]
  );

  const overrideEvents = useMemo(
    () => [
      ...getEventsByType<OverrideSetEvent>("feature:override:set"),
      ...getEventsByType<OverrideDeletedEvent>("feature:override:deleted"),
    ],
    [getEventsByType]
  );

  return {
    /** All feature flag events (newest first) */
    events,
    /** Latest event received */
    latestEvent,
    /** Events by type */
    createdEvents,
    updatedEvents,
    deletedEvents,
    enabledEvents,
    disabledEvents,
    overrideEvents,
    /** WebSocket connection state */
    isConnected: state === "connected",
    /** Current connection state */
    connectionState: state,
    /** Clear all events */
    clearEvents: () => setEvents([]),
    /** Get events by type */
    getEventsByType,
  };
}

/**
 * Hook for tracking a specific feature flag's real-time state.
 *
 * @description Subscribes to updates for a specific feature flag key
 * and provides callbacks when the flag changes.
 *
 * @example
 * ```tsx
 * function FeatureToggle({ featureKey }: { featureKey: string }) {
 *   const { isEnabled, lastUpdate, isConnected } = useFeatureFlagWatch(featureKey);
 *
 *   return (
 *     <div>
 *       <span>{featureKey}: {isEnabled ? "ON" : "OFF"}</span>
 *       {lastUpdate && <span>Updated: {new Date(lastUpdate).toLocaleTimeString()}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeatureFlagWatch(
  featureKey: string,
  initialEnabled?: boolean
) {
  const { latestEvent, isConnected } = useFeatureFlagsRealtime();
  const [isEnabled, setIsEnabled] = useState<boolean | undefined>(initialEnabled);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [changes, setChanges] = useState<string[]>([]);

  // Track changes for this specific flag
  useEffect(() => {
    if (!latestEvent) return;

    // Check if this event is for our flag
    const data = latestEvent.data as { key?: string; featureKey?: string };
    const eventKey = data.key || data.featureKey;

    if (eventKey !== featureKey) return;

    switch (latestEvent.type) {
      case "feature:enabled":
        setIsEnabled(true);
        setLastUpdate(latestEvent.timestamp);
        setChanges((prev) => ["enabled", ...prev.slice(0, 9)]);
        break;

      case "feature:disabled":
        setIsEnabled(false);
        setLastUpdate(latestEvent.timestamp);
        setChanges((prev) => ["disabled", ...prev.slice(0, 9)]);
        break;

      case "feature:updated":
        const updateData = latestEvent.data as FeatureUpdatedEvent["data"];
        setIsEnabled(updateData.globallyEnabled);
        setLastUpdate(latestEvent.timestamp);
        setChanges((prev) => [`updated: ${updateData.changes.join(", ")}`, ...prev.slice(0, 9)]);
        break;

      case "feature:deleted":
        setIsEnabled(undefined);
        setLastUpdate(latestEvent.timestamp);
        setChanges((prev) => ["deleted", ...prev.slice(0, 9)]);
        break;

      case "feature:created":
        const createData = latestEvent.data as FeatureCreatedEvent["data"];
        setIsEnabled(createData.globallyEnabled);
        setLastUpdate(latestEvent.timestamp);
        setChanges((prev) => ["created", ...prev.slice(0, 9)]);
        break;
    }
  }, [latestEvent, featureKey]);

  return {
    /** Current enabled state (undefined if flag doesn't exist) */
    isEnabled,
    /** Timestamp of last update */
    lastUpdate,
    /** Recent change history */
    changes,
    /** WebSocket connection state */
    isConnected,
  };
}

/**
 * Hook for invalidation-aware feature flag fetching.
 *
 * @description Provides a callback when feature flags should be refetched
 * due to server-side changes. Useful for keeping cached data in sync.
 *
 * @example
 * ```tsx
 * function FeatureFlagsProvider() {
 *   const { data, refetch } = useQuery(['feature-flags'], fetchFlags);
 *   const { shouldRefetch, acknowledgeRefetch } = useFeatureFlagInvalidation();
 *
 *   useEffect(() => {
 *     if (shouldRefetch) {
 *       refetch();
 *       acknowledgeRefetch();
 *     }
 *   }, [shouldRefetch, refetch, acknowledgeRefetch]);
 *
 *   return <FlagsContext.Provider value={data}>{children}</FlagsContext.Provider>;
 * }
 * ```
 */
export function useFeatureFlagInvalidation() {
  const { latestEvent, isConnected } = useFeatureFlagsRealtime();
  const [shouldRefetch, setShouldRefetch] = useState(false);
  const [invalidatedKeys, setInvalidatedKeys] = useState<string[]>([]);

  // Track events that should trigger a refetch
  useEffect(() => {
    if (!latestEvent) return;

    // These events indicate data has changed and should be refetched
    const refetchTriggers: FeatureFlagMessageType[] = [
      "feature:created",
      "feature:updated",
      "feature:deleted",
      "feature:enabled",
      "feature:disabled",
      "feature:override:set",
      "feature:override:deleted",
      "feature:rollout:changed",
      "feature:targeting:updated",
      "feature:cache:invalidated",
    ];

    if (refetchTriggers.includes(latestEvent.type)) {
      setShouldRefetch(true);

      // Track which keys were invalidated
      const data = latestEvent.data as { key?: string; keys?: string[]; featureKey?: string };
      const keys = data.keys || [data.key || data.featureKey].filter(Boolean) as string[];
      setInvalidatedKeys((prev) => Array.from(new Set([...keys, ...prev])));
    }
  }, [latestEvent]);

  const acknowledgeRefetch = useCallback(() => {
    setShouldRefetch(false);
    setInvalidatedKeys([]);
  }, []);

  return {
    /** Whether data should be refetched */
    shouldRefetch,
    /** Keys that were invalidated */
    invalidatedKeys,
    /** Call after refetching to reset state */
    acknowledgeRefetch,
    /** WebSocket connection state */
    isConnected,
  };
}
