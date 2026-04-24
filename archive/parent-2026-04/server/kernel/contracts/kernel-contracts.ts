/**
 * @file kernel-contracts.ts
 * @description Core Kernel Interface Contracts
 * @phase Enterprise Architecture Enhancement
 * @author Project Architect Agent
 * @created 2026-02-01
 *
 * These interfaces define the contracts for the microkernel core.
 * All subsystems MUST interact with the kernel through these interfaces.
 */

// =============================================================================
// VALUE OBJECTS & BRANDED TYPES
// =============================================================================

/**
 * Branded type for compile-time type safety.
 * Prevents accidentally using one ID type where another is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Unique identifier types */
export type CommandId = Brand<string, 'CommandId'>;
export type QueryId = Brand<string, 'QueryId'>;
export type EventId = Brand<string, 'EventId'>;
export type AggregateId = Brand<string, 'AggregateId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type CausationId = Brand<string, 'CausationId'>;
export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type PluginId = Brand<string, 'PluginId'>;

/**
 * Result type for operations that can fail.
 * Forces explicit error handling.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Result = {
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),
  isOk: <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok,
  isErr: <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok,
};

// =============================================================================
// DOMAIN-DRIVEN DESIGN CORE
// =============================================================================

/**
 * Value Object base - immutable, equality by value.
 */
export interface ValueObject<T> {
  readonly value: T;
  equals(other: ValueObject<T>): boolean;
  toString(): string;
}

/**
 * Entity base - identity and lifecycle.
 */
export interface Entity<TId extends ValueObject<unknown>> {
  readonly id: TId;
  equals(other: Entity<TId>): boolean;
}

/**
 * Aggregate Root - transactional boundary.
 * All changes go through the aggregate root.
 */
export interface AggregateRoot<TId extends ValueObject<unknown>> extends Entity<TId> {
  readonly version: number;
  readonly uncommittedEvents: readonly DomainEvent[];

  /**
   * Applies an event to the aggregate, updating state.
   * Called during both command handling and event replay.
   */
  apply(event: DomainEvent): void;

  /**
   * Clears uncommitted events after successful persistence.
   */
  clearUncommittedEvents(): void;
}

// =============================================================================
// COMMAND BUS (WRITE PATH - CQRS)
// =============================================================================

/**
 * Command metadata - tracking and context information.
 */
export interface CommandMetadata {
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly userId?: UserId;
  readonly tenantId?: TenantId;
  readonly timestamp: Date;
  readonly retryCount?: number;
  readonly deadline?: Date;
  readonly custom?: Record<string, unknown>;
}

/**
 * Command interface - intent to change state.
 * Commands are imperative ("CreateContent", "PublishArticle").
 */
export interface Command<TPayload = unknown> {
  readonly commandId: CommandId;
  readonly commandType: string;
  readonly aggregateId?: AggregateId;
  readonly payload: TPayload;
  readonly metadata: CommandMetadata;
}

/**
 * Command handler - processes a specific command type.
 */
export interface CommandHandler<TCommand extends Command> {
  readonly commandType: string;
  handle(command: TCommand): Promise<Result<void, CommandError>>;
}

/**
 * Command bus - routes commands to handlers.
 */
export interface CommandBus {
  /**
   * Registers a command handler.
   */
  register<TCommand extends Command>(handler: CommandHandler<TCommand>): void;

  /**
   * Dispatches a command to its handler.
   * Returns a Result indicating success or failure.
   */
  dispatch<TCommand extends Command>(command: TCommand): Promise<Result<void, CommandError>>;

  /**
   * Dispatches a command and waits for related events.
   * Useful for request-response patterns over CQRS.
   */
  dispatchAndWait<TCommand extends Command, TResult>(
    command: TCommand,
    eventPredicate: (event: DomainEvent) => boolean,
    timeout?: number
  ): Promise<Result<TResult, CommandError>>;
}

/**
 * Command error types.
 */
export type CommandError =
  | { type: 'VALIDATION_ERROR'; message: string; violations: ValidationViolation[] }
  | { type: 'AUTHORIZATION_ERROR'; message: string; requiredPermissions: string[] }
  | { type: 'CONCURRENCY_ERROR'; message: string; expectedVersion: number; actualVersion: number }
  | { type: 'AGGREGATE_NOT_FOUND'; message: string; aggregateId: AggregateId }
  | { type: 'BUSINESS_RULE_VIOLATION'; message: string; ruleCode: string }
  | { type: 'HANDLER_NOT_FOUND'; message: string; commandType: string }
  | { type: 'TIMEOUT'; message: string; deadline: Date }
  | { type: 'INTERNAL_ERROR'; message: string; cause?: unknown };

export interface ValidationViolation {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

// =============================================================================
// QUERY BUS (READ PATH - CQRS)
// =============================================================================

/**
 * Query metadata - tracking and optimization hints.
 */
export interface QueryMetadata {
  readonly correlationId: CorrelationId;
  readonly userId?: UserId;
  readonly tenantId?: TenantId;
  readonly timestamp: Date;
  readonly cacheControl?: CacheControl;
  readonly custom?: Record<string, unknown>;
}

export interface CacheControl {
  readonly maxAge?: number;
  readonly staleWhileRevalidate?: number;
  readonly noCache?: boolean;
  readonly noStore?: boolean;
}

/**
 * Query interface - request for data.
 * Queries are interrogative ("GetContent", "ListArticles").
 */
export interface Query<TResult = unknown> {
  readonly queryId: QueryId;
  readonly queryType: string;
  readonly metadata: QueryMetadata;
}

/**
 * Query handler - processes a specific query type.
 */
export interface QueryHandler<TQuery extends Query, TResult> {
  readonly queryType: string;
  handle(query: TQuery): Promise<Result<TResult, QueryError>>;
}

/**
 * Query bus - routes queries to handlers.
 */
export interface QueryBus {
  /**
   * Registers a query handler.
   */
  register<TQuery extends Query, TResult>(handler: QueryHandler<TQuery, TResult>): void;

  /**
   * Dispatches a query to its handler.
   */
  dispatch<TQuery extends Query, TResult>(query: TQuery): Promise<Result<TResult, QueryError>>;

  /**
   * Dispatches a query with caching support.
   */
  dispatchCached<TQuery extends Query, TResult>(
    query: TQuery,
    cacheKey: string,
    ttl?: number
  ): Promise<Result<TResult, QueryError>>;
}

/**
 * Query error types.
 */
export type QueryError =
  | { type: 'VALIDATION_ERROR'; message: string; violations: ValidationViolation[] }
  | { type: 'AUTHORIZATION_ERROR'; message: string; requiredPermissions: string[] }
  | { type: 'NOT_FOUND'; message: string; resourceType: string; resourceId: string }
  | { type: 'HANDLER_NOT_FOUND'; message: string; queryType: string }
  | { type: 'TIMEOUT'; message: string; deadline: Date }
  | { type: 'INTERNAL_ERROR'; message: string; cause?: unknown };

// =============================================================================
// EVENT BUS (DOMAIN EVENTS)
// =============================================================================

/**
 * Event metadata - tracking and context.
 */
export interface EventMetadata {
  readonly correlationId: CorrelationId;
  readonly causationId: CausationId;
  readonly userId?: UserId;
  readonly tenantId?: TenantId;
  readonly timestamp: Date;
  readonly custom?: Record<string, unknown>;
}

/**
 * Domain event interface - something that happened.
 * Events are past tense ("ContentCreated", "ArticlePublished").
 */
export interface DomainEvent<TPayload = unknown> {
  readonly eventId: EventId;
  readonly eventType: string;
  readonly aggregateId: AggregateId;
  readonly aggregateType: string;
  readonly version: number;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}

/**
 * Event handler - reacts to domain events.
 */
export interface EventHandler<TEvent extends DomainEvent> {
  readonly eventType: string;
  handle(event: TEvent): Promise<void>;
}

/**
 * Event bus - publishes and subscribes to domain events.
 */
export interface EventBus {
  /**
   * Publishes an event to all subscribers.
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publishes multiple events in order.
   */
  publishAll(events: DomainEvent[]): Promise<void>;

  /**
   * Subscribes to events of a specific type.
   */
  subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>
  ): Subscription;

  /**
   * Subscribes to all events.
   */
  subscribeAll(handler: (event: DomainEvent) => Promise<void>): Subscription;
}

export interface Subscription {
  unsubscribe(): void;
}

// =============================================================================
// SAGA ORCHESTRATOR (DISTRIBUTED TRANSACTIONS)
// =============================================================================

/**
 * Saga step - a single step in a distributed transaction.
 */
export interface SagaStep<TContext> {
  readonly name: string;

  /**
   * Executes the forward action.
   */
  execute(context: TContext): Promise<Result<TContext, SagaError>>;

  /**
   * Compensates (rolls back) the action.
   */
  compensate(context: TContext): Promise<Result<TContext, SagaError>>;
}

/**
 * Saga definition - a sequence of steps forming a distributed transaction.
 */
export interface SagaDefinition<TContext> {
  readonly name: string;
  readonly steps: readonly SagaStep<TContext>[];
  readonly timeout?: number;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Saga orchestrator - manages saga execution and compensation.
 */
export interface SagaOrchestrator {
  /**
   * Registers a saga definition.
   */
  register<TContext>(saga: SagaDefinition<TContext>): void;

  /**
   * Starts a saga execution.
   */
  start<TContext>(
    sagaName: string,
    initialContext: TContext
  ): Promise<Result<TContext, SagaError>>;

  /**
   * Gets the status of a running saga.
   */
  getStatus(sagaInstanceId: string): Promise<SagaStatus>;

  /**
   * Manually compensates a failed saga.
   */
  compensate(sagaInstanceId: string): Promise<Result<void, SagaError>>;
}

export type SagaError =
  | { type: 'STEP_FAILED'; message: string; stepName: string; cause?: unknown }
  | { type: 'COMPENSATION_FAILED'; message: string; stepName: string; cause?: unknown }
  | { type: 'TIMEOUT'; message: string; deadline: Date }
  | { type: 'SAGA_NOT_FOUND'; message: string; sagaName: string };

export interface SagaStatus {
  readonly sagaInstanceId: string;
  readonly sagaName: string;
  readonly state: 'RUNNING' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED' | 'FAILED';
  readonly currentStep: number;
  readonly completedSteps: string[];
  readonly failedStep?: string;
  readonly error?: SagaError;
  readonly startedAt: Date;
  readonly completedAt?: Date;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialDelay: number;
  readonly maxDelay: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors?: string[];
}

// =============================================================================
// PLUGIN MANAGER (VS CODE-STYLE)
// =============================================================================

/**
 * Plugin manifest - describes a plugin.
 */
export interface PluginManifest {
  readonly id: PluginId;
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly publisher: string;
  readonly description: string;
  readonly license: string;
  readonly main: string;
  readonly activationEvents: readonly string[];
  readonly contributes: PluginContributions;
  readonly dependencies: Record<string, string>;
  readonly capabilities: readonly PluginCapability[];
  readonly engines: {
    readonly rsesCms: string;  // Semver range
  };
}

/**
 * Plugin contributions - what the plugin adds to the system.
 */
export interface PluginContributions {
  readonly commands?: readonly CommandContribution[];
  readonly menus?: readonly MenuContribution[];
  readonly widgets?: readonly WidgetContribution[];
  readonly fieldTypes?: readonly FieldTypeContribution[];
  readonly formatters?: readonly FormatterContribution[];
  readonly themes?: readonly ThemeContribution[];
  readonly languages?: readonly LanguageContribution[];
  readonly aiModels?: readonly AIModelContribution[];
  readonly quantumCircuits?: readonly QuantumCircuitContribution[];
}

/**
 * Plugin capability - security permissions the plugin requires.
 */
export type PluginCapability =
  | 'network'           // Can make network requests
  | 'filesystem'        // Can access filesystem
  | 'database'          // Can access database
  | 'subprocess'        // Can spawn subprocesses
  | 'native'            // Can load native modules
  | 'ai-inference'      // Can run AI inference
  | 'quantum-execute';  // Can execute quantum circuits

/**
 * Plugin context - runtime context for a plugin.
 */
export interface PluginContext {
  readonly pluginId: PluginId;
  readonly storagePath: string;
  readonly globalStoragePath: string;
  readonly extensionPath: string;
  readonly subscriptions: Subscription[];

  // Services available to the plugin
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
  readonly eventBus: EventBus;
  readonly logger: Logger;
}

/**
 * Plugin activation function signature.
 */
export type PluginActivationFunction = (context: PluginContext) => Promise<void>;

/**
 * Plugin deactivation function signature.
 */
export type PluginDeactivationFunction = () => Promise<void>;

/**
 * Plugin manager - manages plugin lifecycle.
 */
export interface PluginManager {
  /**
   * Discovers plugins in the configured directories.
   */
  discover(): Promise<PluginManifest[]>;

  /**
   * Installs a plugin from a URL or local path.
   */
  install(source: string): Promise<Result<PluginManifest, PluginError>>;

  /**
   * Uninstalls a plugin.
   */
  uninstall(pluginId: PluginId): Promise<Result<void, PluginError>>;

  /**
   * Activates a plugin.
   */
  activate(pluginId: PluginId): Promise<Result<PluginContext, PluginError>>;

  /**
   * Deactivates a plugin.
   */
  deactivate(pluginId: PluginId): Promise<Result<void, PluginError>>;

  /**
   * Hot-reloads a plugin without downtime.
   */
  hotReload(pluginId: PluginId): Promise<Result<void, PluginError>>;

  /**
   * Gets the state of a plugin.
   */
  getState(pluginId: PluginId): PluginState;

  /**
   * Lists all plugins with their states.
   */
  listPlugins(): Promise<Array<{ manifest: PluginManifest; state: PluginState }>>;
}

export type PluginState =
  | 'INSTALLED'
  | 'ACTIVATING'
  | 'ACTIVE'
  | 'DEACTIVATING'
  | 'INACTIVE'
  | 'ERROR';

export type PluginError =
  | { type: 'INSTALLATION_FAILED'; message: string; cause?: unknown }
  | { type: 'ACTIVATION_FAILED'; message: string; cause?: unknown }
  | { type: 'DEACTIVATION_FAILED'; message: string; cause?: unknown }
  | { type: 'NOT_FOUND'; message: string; pluginId: PluginId }
  | { type: 'INCOMPATIBLE'; message: string; requiredVersion: string; actualVersion: string }
  | { type: 'CAPABILITY_DENIED'; message: string; capability: PluginCapability }
  | { type: 'SANDBOX_VIOLATION'; message: string; violation: string };

// =============================================================================
// SECURITY (ZERO-TRUST)
// =============================================================================

/**
 * Identity - verified user or service identity.
 */
export interface Identity {
  readonly id: UserId;
  readonly type: 'USER' | 'SERVICE' | 'SYSTEM';
  readonly tenantId?: TenantId;
  readonly roles: readonly string[];
  readonly attributes: Record<string, unknown>;
  readonly verifiedAt: Date;
  readonly expiresAt?: Date;
}

/**
 * Policy decision - result of policy evaluation.
 */
export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly obligations?: PolicyObligation[];
}

export interface PolicyObligation {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * Policy engine - evaluates access policies.
 */
export interface PolicyEngine {
  /**
   * Evaluates whether an action is allowed.
   */
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;

  /**
   * Registers a policy.
   */
  registerPolicy(policy: Policy): void;

  /**
   * Lists all policies.
   */
  listPolicies(): Policy[];
}

export interface PolicyRequest {
  readonly subject: Identity;
  readonly action: string;
  readonly resource: ResourceDescriptor;
  readonly context?: Record<string, unknown>;
}

export interface ResourceDescriptor {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}

export interface Policy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly effect: 'ALLOW' | 'DENY';
  readonly subjects: PolicySubject[];
  readonly actions: string[];
  readonly resources: PolicyResource[];
  readonly conditions?: PolicyCondition[];
  readonly obligations?: PolicyObligation[];
}

export interface PolicySubject {
  readonly type: 'ANY' | 'USER' | 'ROLE' | 'GROUP' | 'SERVICE';
  readonly id?: string;
  readonly attributes?: Record<string, unknown>;
}

export interface PolicyResource {
  readonly type: string;
  readonly id?: string;
  readonly attributes?: Record<string, unknown>;
}

export interface PolicyCondition {
  readonly attribute: string;
  readonly operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'MATCHES' | 'GREATER_THAN' | 'LESS_THAN';
  readonly value: unknown;
}

// =============================================================================
// LOGGING & TELEMETRY
// =============================================================================

/**
 * Logger interface - structured logging.
 */
export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void;

  /**
   * Creates a child logger with additional context.
   */
  child(context: Record<string, unknown>): Logger;
}

/**
 * Metrics interface - application metrics.
 */
export interface Metrics {
  counter(name: string, labels?: Record<string, string>): Counter;
  gauge(name: string, labels?: Record<string, string>): Gauge;
  histogram(name: string, buckets: number[], labels?: Record<string, string>): Histogram;
  summary(name: string, quantiles: number[], labels?: Record<string, string>): Summary;
}

export interface Counter {
  inc(value?: number, labels?: Record<string, string>): void;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(value?: number, labels?: Record<string, string>): void;
  dec(value?: number, labels?: Record<string, string>): void;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  startTimer(labels?: Record<string, string>): () => number;
}

export interface Summary {
  observe(value: number, labels?: Record<string, string>): void;
}

// =============================================================================
// CONTRIBUTION TYPES (FOR PLUGINS)
// =============================================================================

export interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
  readonly icon?: string;
}

export interface MenuContribution {
  readonly command: string;
  readonly menu: string;
  readonly group?: string;
  readonly when?: string;
}

export interface WidgetContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fieldTypes: readonly string[];
}

export interface FieldTypeContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultWidget: string;
  readonly defaultFormatter: string;
}

export interface FormatterContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fieldTypes: readonly string[];
}

export interface ThemeContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: 'light' | 'dark' | 'high-contrast';
}

export interface LanguageContribution {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
}

export interface AIModelContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly provider: string;
}

export interface QuantumCircuitContribution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly qubits: number;
  readonly gates: readonly string[];
}
