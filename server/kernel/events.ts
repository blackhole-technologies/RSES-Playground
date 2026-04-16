/**
 * @file events.ts
 * @description Event Bus for cross-module communication in the RSES CMS Kernel.
 *
 * The Event Bus implements the Publish/Subscribe pattern, enabling loose
 * coupling between modules. Modules can:
 *
 * - **Publish events** when something happens (e.g., "message:sent")
 * - **Subscribe to events** to react to other modules' actions
 *
 * ## Why an Event Bus?
 *
 * Without an event bus, modules would need direct references to each other:
 *
 * ```typescript
 * // BAD: Tight coupling
 * class MessagingModule {
 *   constructor(private notifications: NotificationModule) {}
 *
 *   sendMessage(msg: Message) {
 *     // ... send message ...
 *     this.notifications.notify(msg.recipientId, "New message!");
 *   }
 * }
 * ```
 *
 * With an event bus, modules are decoupled:
 *
 * ```typescript
 * // GOOD: Loose coupling
 * class MessagingModule {
 *   constructor(private events: IEventBus) {}
 *
 *   sendMessage(msg: Message) {
 *     // ... send message ...
 *     this.events.emit("message:sent", msg);
 *   }
 * }
 *
 * class NotificationModule {
 *   constructor(private events: IEventBus) {
 *     events.on("message:sent", this.handleNewMessage);
 *   }
 *
 *   handleNewMessage = (event) => {
 *     this.notify(event.data.recipientId, "New message!");
 *   }
 * }
 * ```
 *
 * ## Event Naming Convention
 *
 * Events follow a `domain:action` naming pattern:
 *
 * - `message:sent` - A message was sent
 * - `message:received` - A message was received
 * - `user:login` - A user logged in
 * - `content:published` - Content was published
 * - `system:shutdown` - System is shutting down
 *
 * Wildcards are supported: `message:*` matches all message events.
 *
 * @module kernel/events
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

import { EventEmitter } from "events";
import { createModuleLogger, getCorrelationId } from "../logger";
import type {
  IEventBus,
  EventPayload,
  EventHandler,
  EventSubscription,
  SubscriptionOptions,
  EmitOptions,
} from "./types";

const log = createModuleLogger("event-bus");

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of events to keep in history.
 * Used for debugging and replay capabilities.
 */
const MAX_HISTORY_SIZE = 1000;

/**
 * Default timeout for synchronous event processing (ms).
 */
const DEFAULT_SYNC_TIMEOUT = 5000;

/**
 * Wildcard character for pattern matching.
 */
const WILDCARD = "*";

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

/**
 * Handler registration with metadata.
 */
interface HandlerRegistration<T = unknown> {
  handler: EventHandler<T>;
  options: SubscriptionOptions;
  subscribedAt: Date;
  moduleId?: string;
}

/**
 * Event Bus - Pub/Sub messaging for cross-module communication.
 *
 * @description Enables loose coupling between modules through events.
 *
 * ## Features
 *
 * 1. **Async Handlers**: Handlers can be async functions
 * 2. **Error Isolation**: One handler's error doesn't break others
 * 3. **Priority**: Handlers can specify execution order
 * 4. **Wildcards**: Subscribe to event patterns (e.g., "user:*")
 * 5. **History**: Recent events are stored for debugging
 * 6. **Correlation**: Events carry correlation IDs for tracing
 *
 * ## Usage
 *
 * ```typescript
 * const events = new EventBus();
 *
 * // Subscribe to specific event
 * const sub = events.on("user:login", async (event) => {
 *   console.log(`User ${event.data.userId} logged in`);
 *   await sendWelcomeEmail(event.data.email);
 * });
 *
 * // Subscribe to all user events
 * events.on("user:*", (event) => {
 *   analytics.track(event.type, event.data);
 * });
 *
 * // Emit an event
 * await events.emit("user:login", {
 *   userId: "user-123",
 *   email: "user@example.com",
 *   timestamp: new Date()
 * });
 *
 * // Cleanup
 * sub.unsubscribe();
 * ```
 */
export class EventBus implements IEventBus {
  // =========================================================================
  // PRIVATE FIELDS
  // =========================================================================

  /**
   * Internal event emitter for pub/sub.
   * We use Node's EventEmitter under the hood for efficiency.
   */
  private emitter = new EventEmitter();

  /**
   * Map of event type to registered handlers.
   * We track handlers separately from the emitter for metadata.
   */
  private handlers = new Map<string, Set<HandlerRegistration>>();

  /**
   * Event history for debugging and replay.
   * Circular buffer that keeps last MAX_HISTORY_SIZE events.
   */
  private history: EventPayload[] = [];

  /**
   * Whether the bus has been disposed.
   */
  private disposed = false;

  // =========================================================================
  // CONSTRUCTOR
  // =========================================================================

  /**
   * Create a new EventBus.
   *
   * @example
   * ```typescript
   * const events = new EventBus();
   *
   * // The bus is ready to use immediately
   * events.on("test", (e) => console.log(e));
   * events.emit("test", { message: "Hello!" });
   * ```
   */
  constructor() {
    // Configure EventEmitter
    this.emitter.setMaxListeners(0); // Unlimited listeners

    log.debug("Event bus initialized");
  }

  // =========================================================================
  // SUBSCRIPTION METHODS
  // =========================================================================

  /**
   * Subscribe to an event type.
   *
   * @description Registers a handler to be called when matching events
   * are emitted. The handler receives an EventPayload with the event data.
   *
   * ## Event Type Patterns
   *
   * - `"user:login"` - Exact match
   * - `"user:*"` - Wildcard: matches user:login, user:logout, etc.
   * - `"*"` - Matches all events (use sparingly!)
   *
   * ## Handler Execution
   *
   * - Handlers are called in priority order (higher first)
   * - If a handler throws, other handlers still execute
   * - Async handlers are awaited when using sync emit
   *
   * @param eventType - The event type to listen for (supports wildcards)
   * @param handler - Function called when event is emitted
   * @param options - Subscription options (priority, filter, once)
   * @returns Subscription handle with unsubscribe method
   *
   * @example
   * ```typescript
   * // Simple subscription
   * const sub = events.on("message:sent", (event) => {
   *   console.log(`Message sent: ${event.data.content}`);
   * });
   *
   * // With options
   * events.on("critical:*", handleCritical, {
   *   priority: 100,  // Execute first
   *   filter: (e) => e.data.severity === "high"
   * });
   *
   * // Unsubscribe when done
   * sub.unsubscribe();
   * ```
   */
  on<T = unknown>(
    eventType: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): EventSubscription {
    this.ensureNotDisposed();

    // Get or create handler set for this event type
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const handlers = this.handlers.get(eventType)!;

    // Create registration
    const registration: HandlerRegistration<T> = {
      handler: handler as EventHandler<unknown>,
      options: {
        priority: options.priority ?? 0,
        once: options.once ?? false,
        filter: options.filter,
      },
      subscribedAt: new Date(),
    };

    // Type assertion: handlers is a Set<HandlerRegistration<unknown>>, but
    // we have a HandlerRegistration<T>. The mismatch is purely about the
    // payload type parameter, which is structurally compatible because the
    // wrapper function below accepts unknown and casts at the boundary.
    handlers.add(registration as unknown as HandlerRegistration<unknown>);

    // Create wrapper that handles the registration
    const wrappedHandler = async (payload: EventPayload<T>) => {
      // Apply filter if provided
      if (registration.options.filter && !registration.options.filter(payload)) {
        return;
      }

      try {
        await handler(payload);
      } catch (error) {
        log.error(
          { eventType, error },
          "Error in event handler"
        );
      }

      // Handle "once" subscriptions
      if (registration.options.once) {
        handlers.delete(registration as unknown as HandlerRegistration<unknown>);
        this.emitter.off(eventType, wrappedHandler);
      }
    };

    // Register with the emitter
    this.emitter.on(eventType, wrappedHandler);

    // Store reference for cleanup
    (registration as any)._wrappedHandler = wrappedHandler;

    log.debug(
      { eventType, priority: registration.options.priority },
      "Event handler subscribed"
    );

    // Return subscription handle
    return {
      eventType,
      subscribedAt: registration.subscribedAt,
      unsubscribe: () => {
        handlers.delete(registration as unknown as HandlerRegistration<unknown>);
        this.emitter.off(eventType, (registration as any)._wrappedHandler);
        log.debug({ eventType }, "Event handler unsubscribed");
      },
    };
  }

  /**
   * Subscribe to an event type for one occurrence only.
   *
   * @description Convenience method that auto-unsubscribes after
   * the first matching event is received.
   *
   * @param eventType - The event type to listen for
   * @param handler - Function called when event is emitted
   * @returns Subscription handle
   *
   * @example
   * ```typescript
   * // Wait for a single event
   * events.once("initialization:complete", (event) => {
   *   console.log("System initialized!");
   *   startAcceptingRequests();
   * });
   *
   * // Can also use with promises
   * const event = await new Promise((resolve) => {
   *   events.once("data:ready", resolve);
   * });
   * ```
   */
  once<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): EventSubscription {
    return this.on(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe a handler from an event type.
   *
   * @description Removes the first matching handler for the event type.
   * Prefer using the subscription's unsubscribe() method instead.
   *
   * @param eventType - The event type
   * @param handler - The handler to remove
   * @returns true if a handler was removed
   *
   * @example
   * ```typescript
   * function myHandler(event) { ... }
   *
   * events.on("test", myHandler);
   * // Later...
   * events.off("test", myHandler);
   * ```
   */
  off<T = unknown>(eventType: string, handler: EventHandler<T>): boolean {
    const handlers = this.handlers.get(eventType);
    if (!handlers) {
      return false;
    }

    for (const reg of handlers) {
      if (reg.handler === handler) {
        handlers.delete(reg);
        this.emitter.off(eventType, (reg as any)._wrappedHandler);
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // EMIT METHODS
  // =========================================================================

  /**
   * Emit an event to all subscribers.
   *
   * @description Publishes an event that triggers all matching handlers.
   * Matching includes exact matches and wildcard patterns.
   *
   * ## Event Payload
   *
   * The event is wrapped in an EventPayload with metadata:
   * - `type`: The event type
   * - `data`: Your event data
   * - `timestamp`: When the event was created
   * - `correlationId`: Request tracing ID (if available)
   * - `source`: Module that emitted (if specified)
   *
   * ## Execution Modes
   *
   * - **Fire-and-forget** (default): Returns immediately, handlers run async
   * - **Synchronous**: Waits for all handlers to complete
   *
   * @param eventType - The event type (e.g., "user:login")
   * @param data - The event payload data
   * @param options - Emit options (sync, timeout, continueOnError)
   * @returns Promise that resolves when handlers complete (if sync)
   *
   * @example
   * ```typescript
   * // Fire-and-forget (default)
   * events.emit("user:login", { userId: "123" });
   *
   * // Wait for handlers to complete
   * await events.emit("critical:update", data, { sync: true });
   *
   * // With timeout
   * await events.emit("slow:operation", data, {
   *   sync: true,
   *   timeout: 10000  // 10 seconds
   * });
   *
   * // From a specific module
   * await events.emit("message:sent", message, {
   *   source: "messaging"
   * });
   * ```
   */
  async emit<T = unknown>(
    eventType: string,
    data: T,
    options: EmitOptions & { source?: string; siteId?: string } = {}
  ): Promise<void> {
    this.ensureNotDisposed();

    // Create the event payload with metadata
    const payload: EventPayload<T> = {
      type: eventType,
      data,
      timestamp: new Date(),
      correlationId: getCorrelationId(),
      source: options.source,
      siteId: options.siteId,
    };

    // Add to history
    this.addToHistory(payload);

    log.debug(
      { eventType, correlationId: payload.correlationId },
      "Emitting event"
    );

    // Get all handlers that should receive this event
    const matchingHandlers = this.getMatchingHandlers(eventType);

    if (matchingHandlers.length === 0) {
      return;
    }

    // Sort by priority (higher first)
    matchingHandlers.sort(
      (a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0)
    );

    // Execute handlers
    if (options.sync) {
      await this.executeSyncHandlers(matchingHandlers, payload, options);
    } else {
      this.executeAsyncHandlers(matchingHandlers, payload, options);
    }
  }

  /**
   * Execute handlers synchronously (waiting for all to complete).
   */
  private async executeSyncHandlers<T>(
    handlers: HandlerRegistration[],
    payload: EventPayload<T>,
    options: EmitOptions
  ): Promise<void> {
    const timeout = options.timeout ?? DEFAULT_SYNC_TIMEOUT;
    const continueOnError = options.continueOnError ?? true;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Event handlers timed out after ${timeout}ms`)),
        timeout
      );
    });

    const handlersPromise = (async () => {
      for (const reg of handlers) {
        try {
          // Apply filter
          if (reg.options.filter && !reg.options.filter(payload)) {
            continue;
          }

          await reg.handler(payload);
        } catch (error) {
          log.error(
            { eventType: payload.type, error },
            "Error in sync event handler"
          );

          if (!continueOnError) {
            throw error;
          }
        }
      }
    })();

    await Promise.race([handlersPromise, timeoutPromise]);
  }

  /**
   * Execute handlers asynchronously (fire-and-forget).
   */
  private executeAsyncHandlers<T>(
    handlers: HandlerRegistration[],
    payload: EventPayload<T>,
    options: EmitOptions
  ): void {
    const continueOnError = options.continueOnError ?? true;

    // Execute all handlers without waiting
    for (const reg of handlers) {
      // Apply filter
      if (reg.options.filter && !reg.options.filter(payload)) {
        continue;
      }

      // Fire and forget
      Promise.resolve()
        .then(() => reg.handler(payload))
        .catch((error) => {
          log.error(
            { eventType: payload.type, error },
            "Error in async event handler"
          );
        });
    }
  }

  /**
   * Get all handlers matching an event type (including wildcards).
   */
  private getMatchingHandlers(eventType: string): HandlerRegistration[] {
    const matching: HandlerRegistration[] = [];

    // Exact matches
    const exact = this.handlers.get(eventType);
    if (exact) {
      matching.push(...exact);
    }

    // Wildcard matches
    for (const [pattern, handlers] of this.handlers) {
      if (pattern === eventType) continue; // Already added

      if (this.matchesPattern(eventType, pattern)) {
        matching.push(...handlers);
      }
    }

    return matching;
  }

  /**
   * Check if an event type matches a pattern.
   *
   * @description Supports wildcards:
   * - `*` matches everything
   * - `prefix:*` matches prefix:anything
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    // Global wildcard
    if (pattern === WILDCARD) {
      return true;
    }

    // Suffix wildcard (e.g., "user:*" matches "user:login")
    if (pattern.endsWith(`:${WILDCARD}`)) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ":");
    }

    // Prefix wildcard (e.g., "*:error" matches "api:error")
    if (pattern.startsWith(`${WILDCARD}:`)) {
      const suffix = pattern.slice(2);
      return eventType.endsWith(":" + suffix);
    }

    return false;
  }

  // =========================================================================
  // QUERY METHODS
  // =========================================================================

  /**
   * Get the number of subscribers for an event type.
   *
   * @description Counts only exact matches, not wildcard patterns.
   *
   * @param eventType - The event type
   * @returns Number of active subscriptions
   *
   * @example
   * ```typescript
   * const count = events.listenerCount("user:login");
   * console.log(`${count} handlers listening for user:login`);
   * ```
   */
  listenerCount(eventType: string): number {
    const handlers = this.handlers.get(eventType);
    return handlers ? handlers.size : 0;
  }

  /**
   * Get all event types with active subscribers.
   *
   * @description Returns unique event types that have handlers.
   * Useful for debugging and introspection.
   *
   * @returns Array of event type names
   *
   * @example
   * ```typescript
   * const types = events.eventTypes();
   * console.log("Active event types:", types);
   * // ["user:login", "user:logout", "message:*", ...]
   * ```
   */
  eventTypes(): string[] {
    return Array.from(this.handlers.keys()).filter(
      (type) => this.handlers.get(type)!.size > 0
    );
  }

  /**
   * Remove all subscribers for an event type.
   *
   * @description If no event type is specified, removes all subscribers.
   * Use with caution - this affects all modules!
   *
   * @param eventType - Optional event type to clear
   *
   * @example
   * ```typescript
   * // Remove all handlers for a specific event
   * events.removeAllListeners("deprecated:event");
   *
   * // Remove all handlers (for testing/shutdown)
   * events.removeAllListeners();
   * ```
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
      this.emitter.removeAllListeners(eventType);
      log.debug({ eventType }, "Removed all listeners for event type");
    } else {
      this.handlers.clear();
      this.emitter.removeAllListeners();
      log.debug("Removed all event listeners");
    }
  }

  // =========================================================================
  // HISTORY / DEBUGGING
  // =========================================================================

  /**
   * Get recent event history for debugging.
   *
   * @description Returns the most recent events, optionally filtered
   * by event type. Useful for debugging and testing.
   *
   * Note: History is limited to MAX_HISTORY_SIZE events.
   *
   * @param limit - Maximum number of events to return (default: 100)
   * @param eventType - Optional filter by event type
   * @returns Recent events, newest first
   *
   * @example
   * ```typescript
   * // Get last 10 events
   * const recent = events.getHistory(10);
   *
   * // Get last 50 message events
   * const messages = events.getHistory(50, "message:*");
   *
   * // Debug: log recent activity
   * events.getHistory(5).forEach((e) => {
   *   console.log(`${e.timestamp}: ${e.type}`, e.data);
   * });
   * ```
   */
  getHistory(limit: number = 100, eventType?: string): EventPayload[] {
    let events = this.history;

    // Filter by event type if specified
    if (eventType) {
      events = events.filter((e) => {
        if (eventType.includes(WILDCARD)) {
          return this.matchesPattern(e.type, eventType);
        }
        return e.type === eventType;
      });
    }

    // Return most recent first, limited
    return events.slice(-limit).reverse();
  }

  /**
   * Add an event to history.
   */
  private addToHistory(event: EventPayload): void {
    this.history.push(event);

    // Trim if over limit
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  /**
   * Clear event history.
   *
   * @description Removes all events from history.
   * Useful for testing or memory management.
   */
  clearHistory(): void {
    this.history = [];
    log.debug("Event history cleared");
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Dispose the event bus.
   *
   * @description Removes all handlers and clears history.
   * Called during system shutdown.
   */
  dispose(): void {
    this.removeAllListeners();
    this.clearHistory();
    this.disposed = true;
    log.info("Event bus disposed");
  }

  /**
   * Ensure the bus hasn't been disposed.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        "Cannot perform operations on a disposed event bus. " +
        "The event bus has been shut down."
      );
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new event bus.
 *
 * @description Factory function for creating event bus instances.
 *
 * @returns A new EventBus instance
 *
 * @example
 * ```typescript
 * import { createEventBus } from "./kernel/events";
 *
 * const events = createEventBus();
 * events.on("ready", () => console.log("System ready!"));
 * ```
 */
export function createEventBus(): IEventBus {
  return new EventBus();
}

// =============================================================================
// TYPED EVENT HELPERS
// =============================================================================

/**
 * Create a typed event emitter function.
 *
 * @description Helper for type-safe event emission. Creates a function
 * that emits events with the correct payload type.
 *
 * @example
 * ```typescript
 * interface UserLoginEvent {
 *   userId: string;
 *   email: string;
 *   timestamp: Date;
 * }
 *
 * const emitUserLogin = createTypedEmitter<UserLoginEvent>(
 *   events,
 *   "user:login"
 * );
 *
 * // Type-safe emission
 * emitUserLogin({
 *   userId: "123",
 *   email: "user@example.com",
 *   timestamp: new Date()
 * });
 * ```
 */
export function createTypedEmitter<T>(
  bus: IEventBus,
  eventType: string
): (data: T, options?: EmitOptions) => Promise<void> {
  return (data: T, options?: EmitOptions) => bus.emit(eventType, data, options);
}

/**
 * Create a typed event subscriber function.
 *
 * @description Helper for type-safe event subscription. Creates a function
 * that subscribes with the correct payload type.
 *
 * @example
 * ```typescript
 * interface MessageSentEvent {
 *   channelId: string;
 *   content: string;
 *   authorId: string;
 * }
 *
 * const onMessageSent = createTypedSubscriber<MessageSentEvent>(
 *   events,
 *   "message:sent"
 * );
 *
 * // Type-safe subscription
 * onMessageSent((event) => {
 *   // event.data is typed as MessageSentEvent
 *   console.log(`Message from ${event.data.authorId}: ${event.data.content}`);
 * });
 * ```
 */
export function createTypedSubscriber<T>(
  bus: IEventBus,
  eventType: string
): (handler: EventHandler<T>, options?: SubscriptionOptions) => EventSubscription {
  return (handler: EventHandler<T>, options?: SubscriptionOptions) =>
    bus.on(eventType, handler, options);
}
