/**
 * @file index.ts
 * @description Event-Sourced CQRS Architecture - Main Entry Point
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * This module provides a complete event-sourced CQRS architecture with:
 *
 * 1. EVENT SOURCING
 *    - Immutable event log
 *    - Aggregate roots with event replay
 *    - Snapshots for performance
 *    - Event subscriptions
 *
 * 2. CQRS (Command Query Responsibility Segregation)
 *    - Command bus with validation and authorization
 *    - Query bus with caching and projections
 *    - Retry with exponential backoff
 *    - Dead letter queues
 *
 * 3. SAGA PATTERN
 *    - Distributed transaction coordination
 *    - Compensation logic
 *    - Saga persistence
 *    - Timeout handling
 *
 * 4. ACTOR MODEL
 *    - Isolated concurrent processing
 *    - Message passing with mailboxes
 *    - Supervision strategies
 *    - Actor hierarchy
 *
 * 5. REACTIVE STREAMS
 *    - Backpressure handling
 *    - Stream operators
 *    - Event stream integration
 *    - Batch processing
 *
 * 6. OBSERVABILITY
 *    - Distributed tracing (OpenTelemetry)
 *    - Metrics (Prometheus)
 *    - Alerting (PagerDuty)
 *    - Health checks
 *
 * 7. AI OPERATIONS
 *    - Anomaly detection
 *    - Predictive scaling
 *    - Auto-remediation
 *    - Capacity planning
 *
 * Usage Example:
 * ```typescript
 * import {
 *   getEventStore,
 *   getCommandBus,
 *   getQueryBus,
 *   CommandBuilder,
 *   QueryBuilder,
 *   AggregateRoot,
 * } from "./cqrs-es";
 *
 * // Define an aggregate
 * class ConfigAggregate extends AggregateRoot<ConfigState> {
 *   create(name: string, content: string, metadata: EventMetadata) {
 *     this.raiseEvent("ConfigCreated", { name, content }, metadata);
 *   }
 *
 *   protected applyEvent(event: Event): void {
 *     switch (event.eventType) {
 *       case "ConfigCreated":
 *         this._state = { ...event.payload };
 *         break;
 *     }
 *   }
 * }
 *
 * // Register command handler
 * const commandBus = getCommandBus();
 * commandBus.registerHandler("CreateConfig", async (command, context) => {
 *   const aggregate = new ConfigAggregate(command.aggregateId, {});
 *   aggregate.create(command.payload.name, command.payload.content, {
 *     correlationId: context.correlationId,
 *     causationId: command.id,
 *     source: "config-service",
 *     schemaVersion: 1,
 *   });
 *
 *   const events = aggregate.uncommittedEvents;
 *   await context.eventStore.append(
 *     command.aggregateId,
 *     "Config",
 *     events
 *   );
 *
 *   return { success: true, commandId: command.id, events };
 * });
 *
 * // Send a command
 * const command = CommandBuilder.create<CreateConfigPayload>()
 *   .forAggregate("config-123")
 *   .ofType("CreateConfig")
 *   .withPayload({ name: "test", content: "..." })
 *   .build();
 *
 * const result = await commandBus.send(command);
 * ```
 */

// ==================== Core Types ====================
export type {
  Event,
  EventMetadata,
  EventEnvelope,
  Snapshot,
  Command,
  CommandMetadata,
  CommandResult,
  CommandError,
  Query,
  QueryMetadata,
  QueryResult,
  QueryResultMetadata,
  QueryError,
  SagaState,
  SagaStep,
  SagaInstance,
  SagaStepResult,
  ActorRef,
  ActorMessage,
  ActorState,
  SupervisionStrategy,
  Publisher,
  Subscriber,
  Subscription,
  Processor,
  BackpressureStrategy,
  StreamConfig,
  Span,
  SpanEvent,
  MetricPoint,
  AnomalyDetection,
  ScalingRecommendation,
  RemediationAction,
  CapacityForecast,
} from "./types";

// ==================== Event Store ====================
export {
  InMemoryEventStore,
  AggregateRoot,
  getEventStore,
  resetEventStore,
  ConcurrencyError,
  StreamNotFoundError,
} from "./event-store";

export type {
  IEventStore,
  AppendOptions,
  ReadOptions,
  StreamPosition,
  EventStream,
} from "./event-store";

// ==================== Command Bus ====================
export {
  CommandBus,
  CommandBuilder,
  getCommandBus,
  resetCommandBus,
  loggingMiddleware,
  transactionMiddleware,
} from "./command-bus";

export type {
  CommandHandler,
  CommandContext,
  UserContext,
  CommandValidator,
  ValidationResult,
  ValidationError,
  AuthorizationPolicy,
  AuthorizationResult,
  CommandMiddleware,
  CommandBusConfig,
} from "./command-bus";

// ==================== Query Bus ====================
export {
  QueryBus,
  QueryBuilder,
  InMemoryReadModelRepository,
  InMemoryQueryCache,
  ProjectionRunner,
  SubscriptionManager,
  getQueryBus,
  resetQueryBus,
} from "./query-bus";

export type {
  QueryHandler,
  QueryContext,
  QueryUserContext,
  ReadModelRepository,
  ReadModelEntry,
  QueryCache,
  CacheEntry,
  Projection,
  QueryBusConfig,
} from "./query-bus";

// ==================== Saga ====================
export {
  SagaOrchestrator,
  SagaBuilder,
  InMemorySagaStore,
  getSagaOrchestrator,
  resetSagaOrchestrator,
} from "./saga";

export type {
  SagaDefinition,
  SagaStepDefinition,
  SagaStore,
} from "./saga";

// ==================== Actor Model ====================
export {
  ActorSystem,
  Mailbox,
  ActorPropsBuilder,
  getActorSystem,
  resetActorSystem,
} from "./actor";

export type {
  ActorContext,
  ActorProps,
  ActorSystemConfig,
} from "./actor";

// ==================== Reactive Streams ====================
export {
  Stream,
  Subject,
  ReplaySubject,
  BufferedPublisher,
  IterablePublisher,
  BaseSubscription,
  MapProcessor,
  FilterProcessor,
  BatchProcessor,
  WindowProcessor,
  RetryProcessor,
  eventStream,
  createPublisher,
  createSubject,
  createReplaySubject,
} from "./reactive-streams";

// ==================== Observability ====================
export {
  Tracer,
  SpanBuilder,
  ActiveSpan,
  MetricsCollector,
  Counter,
  Gauge,
  Histogram,
  AlertManager,
  HealthChecker,
  SLOTracker,
  getTracer,
  getMetricsCollector,
  getAlertManager,
  getHealthChecker,
  resetObservability,
  AlertSeverity,
} from "./observability";

export type {
  TraceContext,
  TracerConfig,
  MetricsConfig,
  Alert,
  AlertRule,
  HealthCheckResult,
  HealthCheck,
  SLIDefinition,
  SLIMeasurement,
} from "./observability";

// ==================== AI Operations ====================
export {
  AIOpsEngine,
  AnomalyDetector,
  PredictiveScaler,
  AutoRemediator,
  CapacityPlanner,
  RootCauseAnalyzer,
  getAIOpsEngine,
  resetAIOpsEngine,
} from "./aiops";

export type {
  RemediationRule,
} from "./aiops";

// ==================== Initialization ====================

import { createModuleLogger } from "../logger";
const log = createModuleLogger("cqrs-es");

/**
 * Initializes the complete CQRS/ES architecture.
 */
export function initializeCQRSES(options?: {
  enableAIOps?: boolean;
  enableTracing?: boolean;
  enableHealthChecks?: boolean;
  pagerDutyKey?: string;
}): void {
  const opts = {
    enableAIOps: true,
    enableTracing: true,
    enableHealthChecks: true,
    ...options,
  };

  log.info("Initializing CQRS/ES architecture");

  // Initialize core components
  getEventStore();
  getCommandBus();
  getQueryBus();
  getSagaOrchestrator();
  getActorSystem();

  // Initialize observability
  if (opts.enableTracing) {
    getTracer();
  }
  getMetricsCollector();

  if (opts.enableHealthChecks) {
    const healthChecker = getHealthChecker();

    // Register default health checks
    healthChecker.register("event-store", async () => {
      const store = getEventStore();
      const position = await store.getGlobalPosition();
      return {
        name: "event-store",
        status: "healthy",
        message: `Global position: ${position.sequence}`,
        lastCheck: new Date(),
      };
    });

    healthChecker.register("command-bus", async () => {
      const bus = getCommandBus();
      const stats = bus.getStats();
      return {
        name: "command-bus",
        status: stats.deadLetterCount > 10 ? "degraded" : "healthy",
        message: `Handlers: ${stats.handlerCount}, Dead letters: ${stats.deadLetterCount}`,
        lastCheck: new Date(),
      };
    });

    healthChecker.start();
  }

  if (opts.pagerDutyKey) {
    const alertManager = getAlertManager(opts.pagerDutyKey);
    alertManager.start();
  }

  if (opts.enableAIOps) {
    const aiops = getAIOpsEngine();
    aiops.start();
  }

  log.info("CQRS/ES architecture initialized successfully");
}

/**
 * Shuts down the CQRS/ES architecture gracefully.
 */
export async function shutdownCQRSES(): Promise<void> {
  log.info("Shutting down CQRS/ES architecture");

  await resetActorSystem();
  resetSagaOrchestrator();
  resetQueryBus();
  resetCommandBus();
  resetEventStore();
  await resetObservability();
  resetAIOpsEngine();

  log.info("CQRS/ES architecture shut down");
}

// ==================== Example Usage Documentation ====================

/**
 * Example: Creating a Config Aggregate with Event Sourcing
 *
 * ```typescript
 * interface ConfigState {
 *   name: string;
 *   content: string;
 *   version: number;
 * }
 *
 * class ConfigAggregate extends AggregateRoot<ConfigState> {
 *   create(name: string, content: string, metadata: EventMetadata) {
 *     if (this._version >= 0) {
 *       throw new Error("Config already exists");
 *     }
 *     this.raiseEvent("ConfigCreated", { name, content }, metadata);
 *   }
 *
 *   update(content: string, metadata: EventMetadata) {
 *     if (this._version < 0) {
 *       throw new Error("Config does not exist");
 *     }
 *     this.raiseEvent("ConfigUpdated", { content }, metadata);
 *   }
 *
 *   protected applyEvent(event: Event): void {
 *     switch (event.eventType) {
 *       case "ConfigCreated":
 *         this._state = {
 *           name: event.payload.name,
 *           content: event.payload.content,
 *           version: 1,
 *         };
 *         break;
 *       case "ConfigUpdated":
 *         this._state = {
 *           ...this._state,
 *           content: event.payload.content,
 *           version: this._state.version + 1,
 *         };
 *         break;
 *     }
 *   }
 * }
 * ```
 *
 * Example: Saga for Project Linking
 *
 * ```typescript
 * const projectLinkSaga = SagaBuilder.create<ProjectLinkContext>()
 *   .withType("ProjectLinkSaga")
 *   .withInitialContext(() => ({ projectId: "", configId: "", linkPath: "" }))
 *   .addStep({
 *     name: "ValidateProject",
 *     createCommand: (ctx) => CommandBuilder.create()
 *       .forAggregate(ctx.projectId)
 *       .ofType("ValidateProject")
 *       .build(),
 *   })
 *   .addStep({
 *     name: "CreateSymlink",
 *     createCommand: (ctx) => CommandBuilder.create()
 *       .forAggregate(ctx.projectId)
 *       .ofType("CreateSymlink")
 *       .withPayload({ linkPath: ctx.linkPath })
 *       .build(),
 *     createCompensation: (ctx) => CommandBuilder.create()
 *       .forAggregate(ctx.projectId)
 *       .ofType("RemoveSymlink")
 *       .asCompensation()
 *       .build(),
 *   })
 *   .addStep({
 *     name: "UpdateProjectStatus",
 *     createCommand: (ctx) => CommandBuilder.create()
 *       .forAggregate(ctx.projectId)
 *       .ofType("UpdateStatus")
 *       .withPayload({ status: "linked" })
 *       .build(),
 *   })
 *   .withTimeout(30000)
 *   .build();
 *
 * sagaOrchestrator.registerSaga(projectLinkSaga);
 * await sagaOrchestrator.startSaga("ProjectLinkSaga", {
 *   projectId: "proj-123",
 *   configId: "config-456",
 *   linkPath: "/target/path",
 * });
 * ```
 *
 * Example: Actor for Real-time Processing
 *
 * ```typescript
 * interface ProcessorState {
 *   processed: number;
 *   errors: number;
 * }
 *
 * interface ProcessorMessage {
 *   type: "process" | "status";
 *   data?: unknown;
 * }
 *
 * const processorProps = ActorPropsBuilder
 *   .create<ProcessorState, ProcessorMessage>()
 *   .withInitialState({ processed: 0, errors: 0 })
 *   .withReceive((state, message, context) => {
 *     switch (message.type) {
 *       case "process":
 *         return { ...state, processed: state.processed + 1 };
 *       case "status":
 *         context.send(message.replyTo!, { ...state });
 *         return state;
 *       default:
 *         return state;
 *     }
 *   })
 *   .build();
 *
 * const actorSystem = getActorSystem();
 * const processorRef = actorSystem.spawn("Processor", processorProps);
 * actorSystem.send(processorRef, { type: "process", data: { ... } });
 * ```
 */
