/**
 * @file event-store.ts
 * @description Event Store implementation for event sourcing.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Append-only event log
 * - Optimistic concurrency control
 * - Event streaming with backpressure
 * - Snapshot support for performance
 * - Event replay capabilities
 * - Partition support for horizontal scaling
 *
 * Inspired by:
 * - Apache Kafka event log semantics
 * - EventStoreDB append model
 * - Axon Framework event sourcing
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  Event,
  EventEnvelope,
  EventMetadata,
  Snapshot,
  Subscription,
  Subscriber,
  Publisher,
  BackpressureStrategy,
} from "./types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("event-store");

// ==================== Event Store Interface ====================

/**
 * Options for appending events.
 */
export interface AppendOptions {
  /** Expected version for optimistic concurrency */
  expectedVersion?: number;
  /** Partition key for sharding */
  partitionKey?: string;
  /** Transaction ID for multi-aggregate transactions */
  transactionId?: string;
}

/**
 * Options for reading events.
 */
export interface ReadOptions {
  /** Start from this version (inclusive) */
  fromVersion?: number;
  /** Read up to this version (inclusive) */
  toVersion?: number;
  /** Maximum number of events to read */
  maxCount?: number;
  /** Direction of reading */
  direction?: "forward" | "backward";
  /** Filter by event types */
  eventTypes?: string[];
}

/**
 * Stream position for subscriptions.
 */
export interface StreamPosition {
  /** Global sequence number */
  sequence: bigint;
  /** Aggregate version */
  version: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event stream for a specific aggregate.
 */
export interface EventStream {
  aggregateId: string;
  aggregateType: string;
  currentVersion: number;
  events: Event[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Core Event Store interface.
 */
export interface IEventStore {
  // Write operations
  append(
    aggregateId: string,
    aggregateType: string,
    events: Omit<Event, "id" | "timestamp" | "version">[],
    options?: AppendOptions
  ): Promise<Event[]>;

  // Read operations
  readStream(aggregateId: string, options?: ReadOptions): Promise<Event[]>;
  readAllStreams(options?: ReadOptions): Promise<Event[]>;
  getStreamMetadata(aggregateId: string): Promise<EventStream | null>;

  // Subscription operations
  subscribeToStream(
    aggregateId: string,
    subscriber: Subscriber<Event>,
    fromPosition?: StreamPosition
  ): Subscription;
  subscribeToAll(
    subscriber: Subscriber<Event>,
    fromPosition?: StreamPosition
  ): Subscription;

  // Snapshot operations
  saveSnapshot<T>(snapshot: Snapshot<T>): Promise<void>;
  getSnapshot<T>(aggregateId: string): Promise<Snapshot<T> | null>;

  // Utility operations
  getGlobalPosition(): Promise<StreamPosition>;
  truncateStream(aggregateId: string, beforeVersion: number): Promise<void>;
}

// ==================== Concurrency Errors ====================

export class ConcurrencyError extends Error {
  constructor(
    public aggregateId: string,
    public expectedVersion: number,
    public actualVersion: number
  ) {
    super(
      `Concurrency conflict for aggregate ${aggregateId}: expected version ${expectedVersion}, actual ${actualVersion}`
    );
    this.name = "ConcurrencyError";
  }
}

export class StreamNotFoundError extends Error {
  constructor(public aggregateId: string) {
    super(`Stream not found for aggregate: ${aggregateId}`);
    this.name = "StreamNotFoundError";
  }
}

// ==================== In-Memory Event Store ====================

/**
 * In-memory Event Store implementation for development and testing.
 * For production, replace with EventStoreDB, Kafka, or PostgreSQL-backed implementation.
 */
export class InMemoryEventStore implements IEventStore {
  private streams: Map<string, EventStream> = new Map();
  private globalLog: EventEnvelope[] = [];
  private snapshots: Map<string, Snapshot> = new Map();
  private globalSequence: bigint = BigInt(0);
  private eventEmitter: EventEmitter = new EventEmitter();
  private subscriptions: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    // Set max listeners to avoid warnings with many subscriptions
    this.eventEmitter.setMaxListeners(1000);
  }

  /**
   * Appends events to a stream with optimistic concurrency control.
   */
  async append(
    aggregateId: string,
    aggregateType: string,
    events: Omit<Event, "id" | "timestamp" | "version">[],
    options?: AppendOptions
  ): Promise<Event[]> {
    const stream = this.streams.get(aggregateId);
    const currentVersion = stream?.currentVersion ?? -1;

    // Optimistic concurrency check
    if (
      options?.expectedVersion !== undefined &&
      options.expectedVersion !== currentVersion
    ) {
      throw new ConcurrencyError(
        aggregateId,
        options.expectedVersion,
        currentVersion
      );
    }

    const timestamp = new Date();
    const appendedEvents: Event[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const version = currentVersion + i + 1;

      const fullEvent: Event = {
        ...event,
        id: randomUUID(),
        timestamp,
        version,
      };

      appendedEvents.push(fullEvent);

      // Add to global log
      this.globalSequence++;
      const envelope: EventEnvelope = {
        event: fullEvent,
        sequence: this.globalSequence,
        partitionKey: options?.partitionKey ?? aggregateId,
        headers: {
          "x-transaction-id": options?.transactionId ?? randomUUID(),
        },
      };
      this.globalLog.push(envelope);
    }

    // Update or create stream
    if (stream) {
      stream.events.push(...appendedEvents);
      stream.currentVersion = currentVersion + events.length;
      stream.updatedAt = timestamp;
    } else {
      this.streams.set(aggregateId, {
        aggregateId,
        aggregateType,
        currentVersion: events.length - 1,
        events: appendedEvents,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    // Emit events for subscribers
    for (const event of appendedEvents) {
      this.eventEmitter.emit("event", event);
      this.eventEmitter.emit(`stream:${aggregateId}`, event);
    }

    log.debug(
      {
        aggregateId,
        aggregateType,
        eventCount: appendedEvents.length,
        newVersion: currentVersion + events.length,
      },
      "Events appended to stream"
    );

    return appendedEvents;
  }

  /**
   * Reads events from a specific aggregate stream.
   */
  async readStream(aggregateId: string, options?: ReadOptions): Promise<Event[]> {
    const stream = this.streams.get(aggregateId);
    if (!stream) {
      return [];
    }

    let events = [...stream.events];

    // Apply version filters
    if (options?.fromVersion !== undefined) {
      events = events.filter((e) => e.version >= options.fromVersion!);
    }
    if (options?.toVersion !== undefined) {
      events = events.filter((e) => e.version <= options.toVersion!);
    }

    // Apply event type filter
    if (options?.eventTypes && options.eventTypes.length > 0) {
      events = events.filter((e) => options.eventTypes!.includes(e.eventType));
    }

    // Apply direction
    if (options?.direction === "backward") {
      events = events.reverse();
    }

    // Apply limit
    if (options?.maxCount !== undefined) {
      events = events.slice(0, options.maxCount);
    }

    return events;
  }

  /**
   * Reads all events across all streams.
   */
  async readAllStreams(options?: ReadOptions): Promise<Event[]> {
    let events = this.globalLog.map((env) => env.event);

    // Apply version filters (using global sequence)
    if (options?.fromVersion !== undefined) {
      const fromSeq = BigInt(options.fromVersion);
      events = this.globalLog
        .filter((env) => env.sequence >= fromSeq)
        .map((env) => env.event);
    }

    // Apply event type filter
    if (options?.eventTypes && options.eventTypes.length > 0) {
      events = events.filter((e) => options.eventTypes!.includes(e.eventType));
    }

    // Apply direction
    if (options?.direction === "backward") {
      events = events.reverse();
    }

    // Apply limit
    if (options?.maxCount !== undefined) {
      events = events.slice(0, options.maxCount);
    }

    return events;
  }

  /**
   * Gets stream metadata without loading all events.
   */
  async getStreamMetadata(aggregateId: string): Promise<EventStream | null> {
    const stream = this.streams.get(aggregateId);
    if (!stream) return null;

    // Return metadata without events for performance
    return {
      ...stream,
      events: [], // Don't include events in metadata
    };
  }

  /**
   * Subscribes to events from a specific stream.
   */
  subscribeToStream(
    aggregateId: string,
    subscriber: Subscriber<Event>,
    fromPosition?: StreamPosition
  ): Subscription {
    const subscriptionId = randomUUID();
    let requested = 0;
    let cancelled = false;
    // Capture the event emitter in the closure so the cancel callback
    // can clean up listeners. Inside an object-literal method, `this`
    // refers to the literal itself, not the surrounding class instance.
    const eventEmitter = this.eventEmitter;

    const subscription: Subscription = {
      id: subscriptionId,
      request(n: number) {
        requested += n;
      },
      cancel() {
        cancelled = true;
        eventEmitter.removeAllListeners(`stream:${aggregateId}`);
        log.debug({ subscriptionId, aggregateId }, "Stream subscription cancelled");
      },
    };

    // Notify subscriber of subscription
    subscriber.onSubscribe(subscription);

    // Catch up from position if specified
    if (fromPosition) {
      const stream = this.streams.get(aggregateId);
      if (stream) {
        const catchUpEvents = stream.events.filter(
          (e) => e.version > fromPosition.version
        );
        for (const event of catchUpEvents) {
          if (cancelled) break;
          if (requested > 0) {
            subscriber.onNext(event);
            requested--;
          }
        }
      }
    }

    // Subscribe to new events
    const listener = (event: Event) => {
      if (cancelled) return;
      if (requested > 0) {
        subscriber.onNext(event);
        requested--;
      }
    };

    this.eventEmitter.on(`stream:${aggregateId}`, listener);

    log.debug({ subscriptionId, aggregateId }, "Stream subscription created");

    return subscription;
  }

  /**
   * Subscribes to all events across all streams.
   */
  subscribeToAll(
    subscriber: Subscriber<Event>,
    fromPosition?: StreamPosition
  ): Subscription {
    const subscriptionId = randomUUID();
    let requested = 0;
    let cancelled = false;
    // See note in subscribeToStream: closure-capture the event emitter
    // because `this` inside an object-literal method refers to the literal.
    const eventEmitter = this.eventEmitter;

    const subscription: Subscription = {
      id: subscriptionId,
      request(n: number) {
        requested += n;
      },
      cancel() {
        cancelled = true;
        eventEmitter.removeAllListeners("event");
        log.debug({ subscriptionId }, "Global subscription cancelled");
      },
    };

    // Notify subscriber of subscription
    subscriber.onSubscribe(subscription);

    // Catch up from position if specified
    if (fromPosition) {
      const catchUpEvents = this.globalLog
        .filter((env) => env.sequence > fromPosition.sequence)
        .map((env) => env.event);

      for (const event of catchUpEvents) {
        if (cancelled) break;
        if (requested > 0) {
          subscriber.onNext(event);
          requested--;
        }
      }
    }

    // Subscribe to new events
    const listener = (event: Event) => {
      if (cancelled) return;
      if (requested > 0) {
        subscriber.onNext(event);
        requested--;
      }
    };

    this.eventEmitter.on("event", listener);

    log.debug({ subscriptionId }, "Global subscription created");

    return subscription;
  }

  /**
   * Saves a snapshot for an aggregate.
   */
  async saveSnapshot<T>(snapshot: Snapshot<T>): Promise<void> {
    this.snapshots.set(snapshot.aggregateId, snapshot as Snapshot);
    log.debug(
      { aggregateId: snapshot.aggregateId, version: snapshot.version },
      "Snapshot saved"
    );
  }

  /**
   * Gets the latest snapshot for an aggregate.
   */
  async getSnapshot<T>(aggregateId: string): Promise<Snapshot<T> | null> {
    const snapshot = this.snapshots.get(aggregateId);
    return (snapshot as Snapshot<T>) ?? null;
  }

  /**
   * Gets the current global position.
   */
  async getGlobalPosition(): Promise<StreamPosition> {
    const lastEnvelope = this.globalLog[this.globalLog.length - 1];
    if (!lastEnvelope) {
      return {
        sequence: BigInt(0),
        version: 0,
        timestamp: new Date(),
      };
    }

    return {
      sequence: lastEnvelope.sequence,
      version: lastEnvelope.event.version,
      timestamp: lastEnvelope.event.timestamp,
    };
  }

  /**
   * Truncates events before a version (for cleanup).
   */
  async truncateStream(aggregateId: string, beforeVersion: number): Promise<void> {
    const stream = this.streams.get(aggregateId);
    if (!stream) {
      throw new StreamNotFoundError(aggregateId);
    }

    stream.events = stream.events.filter((e) => e.version >= beforeVersion);

    log.info(
      { aggregateId, beforeVersion, remainingEvents: stream.events.length },
      "Stream truncated"
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Gets statistics about the event store.
   */
  getStats(): {
    streamCount: number;
    totalEvents: number;
    snapshotCount: number;
    globalSequence: string;
  } {
    return {
      streamCount: this.streams.size,
      totalEvents: this.globalLog.length,
      snapshotCount: this.snapshots.size,
      globalSequence: this.globalSequence.toString(),
    };
  }

  /**
   * Clears all data (for testing).
   */
  clear(): void {
    this.streams.clear();
    this.globalLog = [];
    this.snapshots.clear();
    this.globalSequence = BigInt(0);
    this.eventEmitter.removeAllListeners();
    log.debug("Event store cleared");
  }
}

// ==================== Aggregate Root Base Class ====================

/**
 * Base class for aggregate roots using event sourcing.
 */
export abstract class AggregateRoot<TState> {
  protected _id: string;
  protected _version: number = -1;
  protected _state: TState;
  protected _uncommittedEvents: Event[] = [];

  constructor(id: string, initialState: TState) {
    this._id = id;
    this._state = initialState;
  }

  get id(): string {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get state(): TState {
    return this._state;
  }

  get uncommittedEvents(): Event[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Clears uncommitted events after persistence.
   */
  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Applies an event to update state.
   * Override in concrete aggregates.
   */
  protected abstract applyEvent(event: Event): void;

  /**
   * Records a new domain event.
   */
  protected raiseEvent<T>(
    eventType: string,
    payload: T,
    metadata: Omit<EventMetadata, "schemaVersion">
  ): void {
    const event: Event<T> = {
      id: randomUUID(),
      aggregateId: this._id,
      aggregateType: this.constructor.name,
      eventType,
      payload,
      metadata: {
        ...metadata,
        schemaVersion: 1,
      },
      timestamp: new Date(),
      version: this._version + this._uncommittedEvents.length + 1,
    };

    this._uncommittedEvents.push(event as Event);
    this.applyEvent(event as Event);
  }

  /**
   * Hydrates the aggregate from a list of events.
   */
  loadFromHistory(events: Event[]): void {
    for (const event of events) {
      this.applyEvent(event);
      this._version = event.version;
    }
  }

  /**
   * Hydrates from a snapshot and subsequent events.
   */
  loadFromSnapshot(snapshot: Snapshot<TState>, events: Event[]): void {
    this._state = snapshot.state;
    this._version = snapshot.version;
    this.loadFromHistory(events);
  }

  /**
   * Creates a snapshot of current state.
   */
  createSnapshot(): Snapshot<TState> {
    return {
      aggregateId: this._id,
      aggregateType: this.constructor.name,
      state: this._state,
      version: this._version,
      timestamp: new Date(),
    };
  }
}

// ==================== Factory Function ====================

let eventStoreInstance: IEventStore | null = null;

/**
 * Gets or creates the event store instance.
 */
export function getEventStore(): IEventStore {
  if (!eventStoreInstance) {
    eventStoreInstance = new InMemoryEventStore();
    log.info("Event store initialized (in-memory)");
  }
  return eventStoreInstance;
}

/**
 * Resets the event store (for testing).
 */
export function resetEventStore(): void {
  if (eventStoreInstance instanceof InMemoryEventStore) {
    eventStoreInstance.clear();
  }
  eventStoreInstance = null;
}
