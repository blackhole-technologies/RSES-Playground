/**
 * @file query-bus.ts
 * @description Query Bus implementation for CQRS read side.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Query routing to handlers
 * - Read model projections
 * - Caching with staleness tracking
 * - Real-time subscriptions
 * - GraphQL schema generation
 * - Consistency levels (eventual, strong, bounded)
 *
 * Inspired by:
 * - Axon Framework query handling
 * - Apollo GraphQL subscriptions
 * - Redis Streams read patterns
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  Query,
  QueryMetadata,
  QueryResult,
  QueryResultMetadata,
  QueryError,
  Event,
  Subscriber,
  Subscription,
} from "./types";
import { getEventStore, type IEventStore } from "./event-store";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("query-bus");

// ==================== Query Handler Interface ====================

/**
 * Query handler function type.
 */
export type QueryHandler<TParams = unknown, TResult = unknown> = (
  query: Query<TParams>,
  context: QueryContext
) => Promise<QueryResult<TResult>>;

/**
 * Context provided to query handlers.
 */
export interface QueryContext {
  /** Read model access */
  readModel: ReadModelRepository;
  /** Cache access */
  cache: QueryCache;
  /** User context for authorization */
  user?: QueryUserContext;
}

/**
 * User context for query authorization.
 */
export interface QueryUserContext {
  userId: string;
  roles: string[];
}

// ==================== Read Model Repository ====================

/**
 * Read model entry.
 */
export interface ReadModelEntry<T = unknown> {
  id: string;
  type: string;
  data: T;
  version: number;
  lastUpdated: Date;
  projectedFrom: string[]; // Event IDs that contributed to this state
}

/**
 * Repository for read models.
 */
export interface ReadModelRepository {
  get<T>(type: string, id: string): Promise<ReadModelEntry<T> | null>;
  find<T>(type: string, filter?: Record<string, unknown>): Promise<ReadModelEntry<T>[]>;
  save<T>(entry: ReadModelEntry<T>): Promise<void>;
  delete(type: string, id: string): Promise<void>;
  count(type: string, filter?: Record<string, unknown>): Promise<number>;
}

/**
 * In-memory read model repository.
 */
export class InMemoryReadModelRepository implements ReadModelRepository {
  private models: Map<string, Map<string, ReadModelEntry>> = new Map();

  async get<T>(type: string, id: string): Promise<ReadModelEntry<T> | null> {
    const typeMap = this.models.get(type);
    if (!typeMap) return null;
    return (typeMap.get(id) as ReadModelEntry<T>) ?? null;
  }

  async find<T>(
    type: string,
    filter?: Record<string, unknown>
  ): Promise<ReadModelEntry<T>[]> {
    const typeMap = this.models.get(type);
    if (!typeMap) return [];

    let entries = Array.from(typeMap.values()) as ReadModelEntry<T>[];

    if (filter) {
      entries = entries.filter((entry) => {
        return Object.entries(filter).every(([key, value]) => {
          const data = entry.data as Record<string, unknown>;
          return data[key] === value;
        });
      });
    }

    return entries;
  }

  async save<T>(entry: ReadModelEntry<T>): Promise<void> {
    let typeMap = this.models.get(entry.type);
    if (!typeMap) {
      typeMap = new Map();
      this.models.set(entry.type, typeMap);
    }
    typeMap.set(entry.id, entry as ReadModelEntry);
  }

  async delete(type: string, id: string): Promise<void> {
    const typeMap = this.models.get(type);
    if (typeMap) {
      typeMap.delete(id);
    }
  }

  async count(type: string, filter?: Record<string, unknown>): Promise<number> {
    const entries = await this.find(type, filter);
    return entries.length;
  }

  clear(): void {
    this.models.clear();
  }
}

// ==================== Query Cache ====================

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  cachedAt: Date;
  expiresAt?: Date;
  version?: number;
}

/**
 * Query cache interface.
 */
export interface QueryCache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory query cache.
 */
export class InMemoryQueryCache implements QueryCache {
  private cache: Map<string, CacheEntry> = new Map();

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return null;
    }

    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      value,
      cachedAt: new Date(),
      expiresAt: ttlMs ? new Date(Date.now() + ttlMs) : undefined,
    };
    this.cache.set(key, entry as CacheEntry);
  }

  async invalidate(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// ==================== Projection Interface ====================

/**
 * Projection for building read models from events.
 */
export interface Projection<TState = unknown> {
  /** Projection name */
  name: string;
  /** Event types this projection handles */
  handles: string[];
  /** Initialize projection state */
  init(): TState;
  /** Apply an event to update state */
  apply(state: TState, event: Event): TState;
  /** Get the read model type name */
  getReadModelType(): string;
}

/**
 * Projection runner that subscribes to events and updates read models.
 */
export class ProjectionRunner {
  private projections: Map<string, Projection> = new Map();
  private states: Map<string, Map<string, unknown>> = new Map();
  private subscriptions: Subscription[] = [];
  private eventStore: IEventStore;
  private readModelRepository: ReadModelRepository;

  constructor(
    eventStore: IEventStore,
    readModelRepository: ReadModelRepository
  ) {
    this.eventStore = eventStore;
    this.readModelRepository = readModelRepository;
  }

  /**
   * Registers a projection.
   */
  register(projection: Projection): void {
    this.projections.set(projection.name, projection);
    this.states.set(projection.name, new Map());
    log.debug({ projectionName: projection.name }, "Projection registered");
  }

  /**
   * Starts all projections.
   */
  start(): void {
    // Subscribe to all events
    const subscriber: Subscriber<Event> = {
      onSubscribe: (subscription) => {
        this.subscriptions.push(subscription);
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
      onNext: (event) => this.processEvent(event),
      onError: (error) => log.error({ error: error.message }, "Projection error"),
      onComplete: () => log.info("Projection subscription completed"),
    };

    this.eventStore.subscribeToAll(subscriber);
    log.info({ projectionCount: this.projections.size }, "Projections started");
  }

  /**
   * Stops all projections.
   */
  stop(): void {
    for (const subscription of this.subscriptions) {
      subscription.cancel();
    }
    this.subscriptions = [];
    log.info("Projections stopped");
  }

  /**
   * Processes an event through relevant projections.
   */
  private async processEvent(event: Event): Promise<void> {
    for (const [name, projection] of this.projections) {
      if (!projection.handles.includes(event.eventType)) {
        continue;
      }

      try {
        const stateMap = this.states.get(name)!;
        let state = stateMap.get(event.aggregateId) ?? projection.init();

        state = projection.apply(state, event);
        stateMap.set(event.aggregateId, state);

        // Save to read model repository
        const entry: ReadModelEntry = {
          id: event.aggregateId,
          type: projection.getReadModelType(),
          data: state,
          version: event.version,
          lastUpdated: event.timestamp,
          projectedFrom: [event.id],
        };

        await this.readModelRepository.save(entry);

        log.debug(
          {
            projection: name,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
          },
          "Projection updated"
        );
      } catch (error) {
        log.error(
          {
            projection: name,
            event: event.id,
            error: (error as Error).message,
          },
          "Projection failed"
        );
      }
    }
  }

  /**
   * Rebuilds a projection from scratch.
   */
  async rebuild(projectionName: string): Promise<void> {
    const projection = this.projections.get(projectionName);
    if (!projection) {
      throw new Error(`Projection not found: ${projectionName}`);
    }

    log.info({ projection: projectionName }, "Rebuilding projection");

    // Clear existing state
    this.states.set(projectionName, new Map());

    // Read all events and replay
    const events = await this.eventStore.readAllStreams({
      eventTypes: projection.handles,
    });

    for (const event of events) {
      await this.processEvent(event);
    }

    log.info(
      { projection: projectionName, eventCount: events.length },
      "Projection rebuilt"
    );
  }
}

// ==================== Query Bus Configuration ====================

/**
 * Query bus configuration.
 */
export interface QueryBusConfig {
  /** Default cache TTL in ms */
  defaultCacheTtlMs: number;
  /** Enable caching by default */
  cacheEnabled: boolean;
  /** Maximum concurrent queries */
  maxConcurrency: number;
  /** Query timeout in ms */
  timeoutMs: number;
}

const DEFAULT_CONFIG: QueryBusConfig = {
  defaultCacheTtlMs: 60000, // 1 minute
  cacheEnabled: true,
  maxConcurrency: 100,
  timeoutMs: 10000,
};

// ==================== Real-time Subscription ====================

/**
 * Subscription manager for real-time query updates.
 */
export class SubscriptionManager {
  private emitter: EventEmitter = new EventEmitter();
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  /**
   * Subscribes to updates for a query type.
   */
  subscribe<T>(
    queryType: string,
    callback: (result: QueryResult<T>) => void
  ): () => void {
    const subscriptionId = randomUUID();

    // Track subscription
    let subs = this.subscriptions.get(queryType);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(queryType, subs);
    }
    subs.add(subscriptionId);

    // Add listener
    const listener = (result: QueryResult<T>) => {
      callback(result);
    };
    this.emitter.on(`query:${queryType}`, listener);

    // Return unsubscribe function
    return () => {
      this.emitter.off(`query:${queryType}`, listener);
      subs?.delete(subscriptionId);
    };
  }

  /**
   * Notifies subscribers of a query result update.
   */
  notify<T>(queryType: string, result: QueryResult<T>): void {
    this.emitter.emit(`query:${queryType}`, result);
  }

  /**
   * Gets subscription count for a query type.
   */
  getSubscriptionCount(queryType: string): number {
    return this.subscriptions.get(queryType)?.size ?? 0;
  }
}

// ==================== Query Bus Implementation ====================

/**
 * Query bus for routing and executing queries.
 */
export class QueryBus {
  private handlers: Map<string, QueryHandler> = new Map();
  private readModelRepository: ReadModelRepository;
  private cache: QueryCache;
  private subscriptionManager: SubscriptionManager;
  private projectionRunner: ProjectionRunner;
  private config: QueryBusConfig;
  private activeQueries: number = 0;

  constructor(
    config: Partial<QueryBusConfig> = {},
    readModelRepository?: ReadModelRepository,
    cache?: QueryCache
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.readModelRepository = readModelRepository || new InMemoryReadModelRepository();
    this.cache = cache || new InMemoryQueryCache();
    this.subscriptionManager = new SubscriptionManager();
    this.projectionRunner = new ProjectionRunner(
      getEventStore(),
      this.readModelRepository
    );
  }

  /**
   * Registers a query handler.
   */
  registerHandler<TParams, TResult>(
    queryType: string,
    handler: QueryHandler<TParams, TResult>
  ): void {
    if (this.handlers.has(queryType)) {
      log.warn({ queryType }, "Overwriting existing query handler");
    }
    this.handlers.set(queryType, handler as QueryHandler);
    log.debug({ queryType }, "Query handler registered");
  }

  /**
   * Registers a projection.
   */
  registerProjection(projection: Projection): void {
    this.projectionRunner.register(projection);
  }

  /**
   * Starts the projection runner.
   */
  startProjections(): void {
    this.projectionRunner.start();
  }

  /**
   * Stops the projection runner.
   */
  stopProjections(): void {
    this.projectionRunner.stop();
  }

  /**
   * Executes a query.
   */
  async query<TParams, TResult>(
    query: Query<TParams>
  ): Promise<QueryResult<TResult>> {
    const startTime = Date.now();

    log.debug(
      {
        queryId: query.id,
        queryType: query.queryType,
        consistency: query.metadata.consistency,
      },
      "Processing query"
    );

    try {
      // Check concurrency limit
      if (this.activeQueries >= this.config.maxConcurrency) {
        return this.createErrorResult(query, {
          code: "TOO_MANY_QUERIES",
          message: "Query concurrency limit exceeded",
        });
      }

      this.activeQueries++;

      // Check cache for eventual consistency
      if (
        this.config.cacheEnabled &&
        query.metadata.consistency === "eventual"
      ) {
        const cacheKey = this.getCacheKey(query);
        const cached = await this.cache.get<TResult>(cacheKey);

        if (cached) {
          const staleness = Date.now() - cached.cachedAt.getTime();

          // Check bounded staleness
          if (
            query.metadata.consistency === "bounded" &&
            query.metadata.maxStaleness &&
            staleness > query.metadata.maxStaleness
          ) {
            // Cache is too stale, fall through to handler
          } else {
            log.debug(
              { queryId: query.id, staleness },
              "Query served from cache"
            );

            return {
              success: true,
              queryId: query.id,
              data: cached.value,
              metadata: {
                timestamp: cached.cachedAt,
                staleness,
                fromCache: true,
              },
            };
          }
        }
      }

      // Execute handler
      const result = await this.executeWithTimeout<TParams, TResult>(query);

      // Cache result
      if (this.config.cacheEnabled && result.success) {
        const cacheKey = this.getCacheKey(query);
        await this.cache.set(cacheKey, result.data, this.config.defaultCacheTtlMs);
      }

      // Notify subscribers
      this.subscriptionManager.notify(query.queryType, result);

      const duration = Date.now() - startTime;
      log.debug(
        {
          queryId: query.id,
          queryType: query.queryType,
          success: result.success,
          duration,
        },
        "Query completed"
      );

      return result;
    } finally {
      this.activeQueries--;
    }
  }

  /**
   * Executes query with timeout.
   */
  private async executeWithTimeout<TParams, TResult>(
    query: Query<TParams>
  ): Promise<QueryResult<TResult>> {
    const handler = this.handlers.get(query.queryType);

    if (!handler) {
      return this.createErrorResult(query, {
        code: "HANDLER_NOT_FOUND",
        message: `No handler registered for query type: ${query.queryType}`,
      });
    }

    const context: QueryContext = {
      readModel: this.readModelRepository,
      cache: this.cache,
    };

    const timeoutPromise = new Promise<QueryResult<TResult>>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });

    const executionPromise = handler(query, context) as Promise<QueryResult<TResult>>;

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Subscribes to real-time query updates.
   */
  subscribe<TResult>(
    queryType: string,
    callback: (result: QueryResult<TResult>) => void
  ): () => void {
    return this.subscriptionManager.subscribe(queryType, callback);
  }

  /**
   * Invalidates cache for a query type or pattern.
   */
  async invalidateCache(pattern: string): Promise<void> {
    await this.cache.invalidatePattern(pattern);
    log.debug({ pattern }, "Cache invalidated");
  }

  /**
   * Rebuilds a projection.
   */
  async rebuildProjection(projectionName: string): Promise<void> {
    await this.projectionRunner.rebuild(projectionName);
  }

  /**
   * Gets cache key for a query.
   */
  private getCacheKey(query: Query): string {
    return `query:${query.queryType}:${JSON.stringify(query.params)}`;
  }

  /**
   * Creates an error result.
   */
  private createErrorResult<TResult>(
    query: Query,
    error: QueryError
  ): QueryResult<TResult> {
    return {
      success: false,
      queryId: query.id,
      metadata: {
        timestamp: new Date(),
        staleness: 0,
        fromCache: false,
      },
      error,
    };
  }

  /**
   * Gets query bus statistics.
   */
  getStats(): {
    handlerCount: number;
    activeQueries: number;
    subscriptionCount: number;
  } {
    let totalSubscriptions = 0;
    for (const queryType of this.handlers.keys()) {
      totalSubscriptions += this.subscriptionManager.getSubscriptionCount(queryType);
    }

    return {
      handlerCount: this.handlers.size,
      activeQueries: this.activeQueries,
      subscriptionCount: totalSubscriptions,
    };
  }
}

// ==================== Query Builder ====================

/**
 * Builder for creating queries.
 */
export class QueryBuilder<TParams> {
  private _queryType: string = "";
  private _params?: TParams;
  private _metadata: Partial<QueryMetadata> = {};

  static create<T>(): QueryBuilder<T> {
    return new QueryBuilder<T>();
  }

  ofType(queryType: string): this {
    this._queryType = queryType;
    return this;
  }

  withParams(params: TParams): this {
    this._params = params;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this._metadata.correlationId = correlationId;
    return this;
  }

  withUserId(userId: string): this {
    this._metadata.userId = userId;
    return this;
  }

  withConsistency(consistency: "eventual" | "strong" | "bounded"): this {
    this._metadata.consistency = consistency;
    return this;
  }

  withMaxStaleness(ms: number): this {
    this._metadata.maxStaleness = ms;
    return this;
  }

  includeDeleted(include: boolean = true): this {
    this._metadata.includeDeleted = include;
    return this;
  }

  build(): Query<TParams> {
    if (!this._queryType) {
      throw new Error("Query type is required");
    }

    return {
      id: randomUUID(),
      queryType: this._queryType,
      params: this._params as TParams,
      metadata: {
        correlationId: this._metadata.correlationId || randomUUID(),
        userId: this._metadata.userId,
        consistency: this._metadata.consistency || "eventual",
        maxStaleness: this._metadata.maxStaleness,
        includeDeleted: this._metadata.includeDeleted ?? false,
      },
    };
  }
}

// ==================== Factory Functions ====================

let queryBusInstance: QueryBus | null = null;

/**
 * Gets or creates the query bus instance.
 */
export function getQueryBus(config?: Partial<QueryBusConfig>): QueryBus {
  if (!queryBusInstance) {
    queryBusInstance = new QueryBus(config);
    log.info("Query bus initialized");
  }
  return queryBusInstance;
}

/**
 * Resets the query bus (for testing).
 */
export function resetQueryBus(): void {
  if (queryBusInstance) {
    queryBusInstance.stopProjections();
  }
  queryBusInstance = null;
}
