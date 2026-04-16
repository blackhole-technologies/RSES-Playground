/**
 * @file reactive-streams.ts
 * @description Reactive Streams implementation with backpressure.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Publisher/Subscriber pattern
 * - Backpressure handling
 * - Stream operators (map, filter, flatMap, etc.)
 * - Error handling with retry
 * - Batching and windowing
 * - Integration with event sourcing
 *
 * Inspired by:
 * - Reactive Streams specification
 * - RxJS observables
 * - Akka Streams
 * - Project Reactor
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
// BackpressureStrategy is an enum used at runtime; the rest are pure types.
import { BackpressureStrategy } from "./types";
import type {
  Publisher,
  Subscriber,
  Subscription,
  Processor,
  StreamConfig,
} from "./types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("reactive-streams");

// ==================== Default Configuration ====================

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  bufferSize: 256,
  strategy: BackpressureStrategy.BUFFER,
  parallelism: 4,
  batchSize: 100,
  maxRetries: 3,
  retryDelayMs: 1000,
};

// ==================== Base Subscription ====================

/**
 * Base subscription implementation.
 */
export class BaseSubscription implements Subscription {
  readonly id: string;
  protected requested: number = 0;
  protected cancelled: boolean = false;
  // onRequest/onCancel are settable by external publishers (see
  // IterablePublisher.subscribe and BufferedPublisher.subscribe). They were
  // marked `protected` originally but the publisher-and-subscription
  // collaboration pattern requires external assignment, so they are public.
  // Changed 2026-04-14 to satisfy strict access checks.
  public onRequest?: (n: number) => void;
  public onCancel?: () => void;

  constructor() {
    this.id = randomUUID();
  }

  request(n: number): void {
    if (this.cancelled) return;
    if (n <= 0) {
      throw new Error("Requested amount must be positive");
    }
    this.requested += n;
    this.onRequest?.(n);
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.onCancel?.();
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  get pendingRequests(): number {
    return this.requested;
  }

  decrementRequests(): void {
    if (this.requested > 0) {
      this.requested--;
    }
  }
}

// ==================== Simple Publisher ====================

/**
 * Creates a publisher from an iterable or generator.
 */
export class IterablePublisher<T> implements Publisher<T> {
  private items: T[];
  private subscribers: Set<Subscriber<T>> = new Set();

  constructor(items: Iterable<T>) {
    this.items = Array.from(items);
  }

  subscribe(subscriber: Subscriber<T>): void {
    this.subscribers.add(subscriber);

    let index = 0;
    const items = this.items;

    const subscription = new BaseSubscription();
    subscription.onRequest = (n) => {
      // Emit items up to the requested amount
      let count = n;
      while (count > 0 && index < items.length) {
        if (subscription.isCancelled) return;
        subscriber.onNext(items[index]);
        index++;
        count--;
        subscription.decrementRequests();
      }

      // Complete if all items emitted
      if (index >= items.length) {
        subscriber.onComplete();
      }
    };

    subscription.onCancel = () => {
      this.subscribers.delete(subscriber);
    };

    subscriber.onSubscribe(subscription);
  }
}

// ==================== Subject (Pub/Sub) ====================

/**
 * Subject that acts as both publisher and subscriber.
 * Useful for multicasting.
 */
export class Subject<T> implements Publisher<T>, Subscriber<T> {
  protected subscribers: Map<string, {
    subscriber: Subscriber<T>;
    subscription: BaseSubscription;
  }> = new Map();
  protected completed: boolean = false;
  protected error?: Error;
  protected subscription?: Subscription;

  subscribe(subscriber: Subscriber<T>): void {
    if (this.completed) {
      subscriber.onComplete();
      return;
    }
    if (this.error) {
      subscriber.onError(this.error);
      return;
    }

    const subscription = new BaseSubscription();
    const id = subscription.id;

    subscription.onCancel = () => {
      this.subscribers.delete(id);
    };

    this.subscribers.set(id, { subscriber, subscription });
    subscriber.onSubscribe(subscription);
  }

  onSubscribe(subscription: Subscription): void {
    this.subscription = subscription;
    // Request unbounded for subjects
    subscription.request(Number.MAX_SAFE_INTEGER);
  }

  onNext(value: T): void {
    if (this.completed) return;

    for (const { subscriber, subscription } of this.subscribers.values()) {
      if (!subscription.isCancelled && subscription.pendingRequests > 0) {
        subscriber.onNext(value);
        subscription.decrementRequests();
      }
    }
  }

  onError(error: Error): void {
    if (this.completed) return;
    this.error = error;
    this.completed = true;

    for (const { subscriber } of this.subscribers.values()) {
      subscriber.onError(error);
    }
    this.subscribers.clear();
  }

  onComplete(): void {
    if (this.completed) return;
    this.completed = true;

    for (const { subscriber } of this.subscribers.values()) {
      subscriber.onComplete();
    }
    this.subscribers.clear();
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

// ==================== Replay Subject ====================

/**
 * Subject that replays the last N values to new subscribers.
 */
export class ReplaySubject<T> extends Subject<T> {
  private buffer: T[] = [];
  private bufferSize: number;

  constructor(bufferSize: number = 10) {
    super();
    this.bufferSize = bufferSize;
  }

  subscribe(subscriber: Subscriber<T>): void {
    if (this.completed) {
      // Replay buffer then complete
      const subscription = new BaseSubscription();
      subscriber.onSubscribe(subscription);

      subscription.onRequest = (n) => {
        let count = Math.min(n, this.buffer.length);
        for (let i = 0; i < count; i++) {
          if (subscription.isCancelled) return;
          subscriber.onNext(this.buffer[i]);
        }
        if (this.error) {
          subscriber.onError(this.error);
        } else {
          subscriber.onComplete();
        }
      };

      return;
    }

    super.subscribe(subscriber);

    // Replay buffer to new subscriber
    const entry = Array.from(this.subscribers.values()).find(
      (e) => e.subscriber === subscriber
    );
    if (entry && this.buffer.length > 0) {
      for (const item of this.buffer) {
        if (entry.subscription.isCancelled) break;
        if (entry.subscription.pendingRequests > 0) {
          subscriber.onNext(item);
          entry.subscription.decrementRequests();
        }
      }
    }
  }

  onNext(value: T): void {
    // Add to buffer
    this.buffer.push(value);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    super.onNext(value);
  }
}

// ==================== Buffered Publisher ====================

/**
 * Publisher with buffering and backpressure handling.
 */
export class BufferedPublisher<T> implements Publisher<T> {
  private buffer: T[] = [];
  private subscribers: Map<string, {
    subscriber: Subscriber<T>;
    subscription: BaseSubscription;
  }> = new Map();
  private config: StreamConfig;
  private completed: boolean = false;
  private error?: Error;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
  }

  /**
   * Publishes a value to all subscribers.
   */
  publish(value: T): boolean {
    if (this.completed) {
      throw new Error("Cannot publish to completed publisher");
    }

    // Check buffer capacity
    if (this.buffer.length >= this.config.bufferSize) {
      return this.handleBackpressure(value);
    }

    this.buffer.push(value);
    this.drain();
    return true;
  }

  /**
   * Handles backpressure based on strategy.
   */
  private handleBackpressure(value: T): boolean {
    switch (this.config.strategy) {
      case BackpressureStrategy.DROP_OLDEST:
        this.buffer.shift();
        this.buffer.push(value);
        return true;

      case BackpressureStrategy.DROP_NEWEST:
        // Don't add new value
        return false;

      case BackpressureStrategy.ERROR:
        throw new Error("Buffer overflow - backpressure limit reached");

      case BackpressureStrategy.BUFFER:
        // Allow buffer to grow
        this.buffer.push(value);
        return true;

      case BackpressureStrategy.BLOCK:
        // Would need async handling
        log.warn("BLOCK strategy not fully implemented, dropping");
        return false;

      default:
        return false;
    }
  }

  /**
   * Drains the buffer to subscribers.
   */
  private drain(): void {
    if (this.buffer.length === 0) return;

    for (const { subscriber, subscription } of this.subscribers.values()) {
      while (
        this.buffer.length > 0 &&
        !subscription.isCancelled &&
        subscription.pendingRequests > 0
      ) {
        const value = this.buffer.shift()!;
        subscriber.onNext(value);
        subscription.decrementRequests();
      }
    }
  }

  subscribe(subscriber: Subscriber<T>): void {
    if (this.completed) {
      subscriber.onComplete();
      return;
    }
    if (this.error) {
      subscriber.onError(this.error);
      return;
    }

    const subscription = new BaseSubscription();
    const id = subscription.id;

    subscription.onRequest = () => this.drain();
    subscription.onCancel = () => this.subscribers.delete(id);

    this.subscribers.set(id, { subscriber, subscription });
    subscriber.onSubscribe(subscription);
  }

  /**
   * Completes the publisher.
   */
  complete(): void {
    if (this.completed) return;

    // Drain remaining buffer
    this.drain();
    this.completed = true;

    for (const { subscriber } of this.subscribers.values()) {
      subscriber.onComplete();
    }
    this.subscribers.clear();
  }

  /**
   * Errors the publisher.
   */
  fail(error: Error): void {
    if (this.completed) return;

    this.error = error;
    this.completed = true;

    for (const { subscriber } of this.subscribers.values()) {
      subscriber.onError(error);
    }
    this.subscribers.clear();
  }

  get bufferLevel(): number {
    return this.buffer.length;
  }
}

// ==================== Stream Operators ====================

/**
 * Base processor for creating stream operators.
 */
export abstract class BaseProcessor<T, R> implements Processor<T, R> {
  protected upstream?: Subscription;
  protected downstream: Map<string, {
    subscriber: Subscriber<R>;
    subscription: BaseSubscription;
  }> = new Map();
  protected completed: boolean = false;

  onSubscribe(subscription: Subscription): void {
    this.upstream = subscription;
    // Request items based on downstream demand
    this.requestUpstream();
  }

  protected requestUpstream(): void {
    if (!this.upstream) return;

    // Calculate demand from all downstream subscribers
    let demand = 0;
    for (const { subscription } of this.downstream.values()) {
      if (!subscription.isCancelled) {
        demand += subscription.pendingRequests;
      }
    }

    if (demand > 0) {
      this.upstream.request(demand);
    }
  }

  abstract onNext(value: T): void;

  onError(error: Error): void {
    for (const { subscriber } of this.downstream.values()) {
      subscriber.onError(error);
    }
    this.downstream.clear();
  }

  onComplete(): void {
    this.completed = true;
    for (const { subscriber } of this.downstream.values()) {
      subscriber.onComplete();
    }
    this.downstream.clear();
  }

  subscribe(subscriber: Subscriber<R>): void {
    const subscription = new BaseSubscription();
    const id = subscription.id;

    subscription.onRequest = () => this.requestUpstream();
    subscription.onCancel = () => {
      this.downstream.delete(id);
      if (this.downstream.size === 0 && this.upstream) {
        this.upstream.cancel();
      }
    };

    this.downstream.set(id, { subscriber, subscription });
    subscriber.onSubscribe(subscription);
  }

  protected emit(value: R): void {
    for (const { subscriber, subscription } of this.downstream.values()) {
      if (!subscription.isCancelled && subscription.pendingRequests > 0) {
        subscriber.onNext(value);
        subscription.decrementRequests();
      }
    }
  }
}

/**
 * Map operator.
 */
export class MapProcessor<T, R> extends BaseProcessor<T, R> {
  constructor(private mapper: (value: T) => R) {
    super();
  }

  onNext(value: T): void {
    try {
      const mapped = this.mapper(value);
      this.emit(mapped);
    } catch (error) {
      this.onError(error as Error);
    }
  }
}

/**
 * Filter operator.
 */
export class FilterProcessor<T> extends BaseProcessor<T, T> {
  constructor(private predicate: (value: T) => boolean) {
    super();
  }

  onNext(value: T): void {
    try {
      if (this.predicate(value)) {
        this.emit(value);
      } else {
        // Request more since we filtered this one
        this.requestUpstream();
      }
    } catch (error) {
      this.onError(error as Error);
    }
  }
}

/**
 * Batch operator.
 */
export class BatchProcessor<T> extends BaseProcessor<T, T[]> {
  private batch: T[] = [];

  constructor(private batchSize: number) {
    super();
  }

  onNext(value: T): void {
    this.batch.push(value);

    if (this.batch.length >= this.batchSize) {
      this.emit([...this.batch]);
      this.batch = [];
    }
  }

  onComplete(): void {
    // Emit remaining items
    if (this.batch.length > 0) {
      this.emit([...this.batch]);
      this.batch = [];
    }
    super.onComplete();
  }
}

/**
 * Window operator (time-based batching).
 */
export class WindowProcessor<T> extends BaseProcessor<T, T[]> {
  private window: T[] = [];
  private timer?: NodeJS.Timeout;

  constructor(private windowMs: number) {
    super();
  }

  onSubscribe(subscription: Subscription): void {
    super.onSubscribe(subscription);

    // Start window timer
    this.timer = setInterval(() => {
      if (this.window.length > 0) {
        this.emit([...this.window]);
        this.window = [];
      }
    }, this.windowMs);
  }

  onNext(value: T): void {
    this.window.push(value);
  }

  onComplete(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.window.length > 0) {
      this.emit([...this.window]);
    }
    super.onComplete();
  }

  onError(error: Error): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    super.onError(error);
  }
}

/**
 * Retry operator.
 */
export class RetryProcessor<T> extends BaseProcessor<T, T> {
  private attempts: number = 0;
  private sourceFactory: () => Publisher<T>;

  constructor(
    private maxRetries: number,
    private delayMs: number,
    sourceFactory: () => Publisher<T>
  ) {
    super();
    this.sourceFactory = sourceFactory;
  }

  onNext(value: T): void {
    this.emit(value);
    this.attempts = 0; // Reset on success
  }

  onError(error: Error): void {
    if (this.attempts < this.maxRetries) {
      this.attempts++;
      log.debug(
        { attempt: this.attempts, maxRetries: this.maxRetries },
        "Retrying stream"
      );

      setTimeout(() => {
        const source = this.sourceFactory();
        source.subscribe(this);
      }, this.delayMs * this.attempts);
    } else {
      super.onError(error);
    }
  }
}

// ==================== Stream Builder ====================

/**
 * Fluent API for building reactive streams.
 */
export class Stream<T> {
  constructor(private publisher: Publisher<T>) {}

  /**
   * Creates a stream from an array.
   */
  static from<T>(items: T[]): Stream<T> {
    return new Stream(new IterablePublisher(items));
  }

  /**
   * Creates a stream from a subject.
   */
  static subject<T>(): { stream: Stream<T>; subject: Subject<T> } {
    const subject = new Subject<T>();
    return { stream: new Stream(subject), subject };
  }

  /**
   * Creates a buffered stream.
   */
  static buffered<T>(config?: Partial<StreamConfig>): {
    stream: Stream<T>;
    publisher: BufferedPublisher<T>;
  } {
    const publisher = new BufferedPublisher<T>(config);
    return { stream: new Stream(publisher), publisher };
  }

  /**
   * Maps values.
   */
  map<R>(mapper: (value: T) => R): Stream<R> {
    const processor = new MapProcessor(mapper);
    this.publisher.subscribe(processor);
    return new Stream(processor);
  }

  /**
   * Filters values.
   */
  filter(predicate: (value: T) => boolean): Stream<T> {
    const processor = new FilterProcessor(predicate);
    this.publisher.subscribe(processor);
    return new Stream(processor);
  }

  /**
   * Batches values.
   */
  batch(size: number): Stream<T[]> {
    const processor = new BatchProcessor<T>(size);
    this.publisher.subscribe(processor);
    return new Stream(processor);
  }

  /**
   * Windows values by time.
   */
  window(windowMs: number): Stream<T[]> {
    const processor = new WindowProcessor<T>(windowMs);
    this.publisher.subscribe(processor);
    return new Stream(processor);
  }

  /**
   * Subscribes to the stream.
   */
  subscribe(handlers: {
    onNext?: (value: T) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
    requestSize?: number;
  }): Subscription {
    let subscription: Subscription;

    const subscriber: Subscriber<T> = {
      onSubscribe: (sub) => {
        subscription = sub;
        sub.request(handlers.requestSize ?? 100);
      },
      onNext: (value) => {
        handlers.onNext?.(value);
        subscription?.request(1);
      },
      onError: (error) => handlers.onError?.(error),
      onComplete: () => handlers.onComplete?.(),
    };

    this.publisher.subscribe(subscriber);
    return subscription!;
  }

  /**
   * Collects all values into an array.
   */
  toArray(): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const values: T[] = [];

      this.subscribe({
        onNext: (value) => values.push(value),
        onError: (error) => reject(error),
        onComplete: () => resolve(values),
        requestSize: Number.MAX_SAFE_INTEGER,
      });
    });
  }

  /**
   * Takes only first N values.
   */
  take(n: number): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const values: T[] = [];

      // Stream.subscribe returns the Subscription directly; capture it
      // before the first onNext runs so cancel() is callable from inside.
      const subscription = this.subscribe({
        onNext: (value) => {
          values.push(value);
          if (values.length >= n) {
            subscription.cancel();
            resolve(values);
          }
        },
        onError: (error) => reject(error),
        onComplete: () => resolve(values),
        requestSize: n,
      });
    });
  }

  /**
   * Executes an action for each value.
   */
  forEach(action: (value: T) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.subscribe({
        onNext: action,
        onError: reject,
        onComplete: resolve,
        requestSize: 100,
      });
    });
  }
}

// ==================== Event Stream Integration ====================

import { getEventStore, type IEventStore } from "./event-store";
import type { Event } from "./types";

/**
 * Creates a reactive stream from the event store.
 */
export function eventStream(
  aggregateId?: string,
  eventTypes?: string[]
): Stream<Event> {
  const eventStore = getEventStore();

  const publisher: Publisher<Event> = {
    subscribe: (subscriber: Subscriber<Event>) => {
      const subscription = aggregateId
        ? eventStore.subscribeToStream(aggregateId, subscriber)
        : eventStore.subscribeToAll(subscriber);

      // The event store subscription already handles backpressure
      subscriber.onSubscribe(subscription);
    },
  };

  let stream = new Stream(publisher);

  if (eventTypes && eventTypes.length > 0) {
    stream = stream.filter((event) => eventTypes.includes(event.eventType));
  }

  return stream;
}

// ==================== Factory Functions ====================

/**
 * Creates a new buffered publisher.
 */
export function createPublisher<T>(
  config?: Partial<StreamConfig>
): BufferedPublisher<T> {
  return new BufferedPublisher<T>(config);
}

/**
 * Creates a new subject.
 */
export function createSubject<T>(): Subject<T> {
  return new Subject<T>();
}

/**
 * Creates a new replay subject.
 */
export function createReplaySubject<T>(bufferSize?: number): ReplaySubject<T> {
  return new ReplaySubject<T>(bufferSize);
}
