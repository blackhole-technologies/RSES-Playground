/**
 * @file types.ts
 * @description Core types for Event Sourcing and CQRS architecture.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Inspired by:
 * - Akka/Pekko: Actor model, event sourcing
 * - Axon Framework: CQRS, event sourcing patterns
 * - Temporal.io: Workflow orchestration
 * - Apache Kafka: Event streaming semantics
 */

import { z } from "zod";

// ==================== Event Sourcing Types ====================

/**
 * Event metadata for tracing and auditing.
 */
export interface EventMetadata {
  /** Correlation ID for distributed tracing */
  correlationId: string;
  /** Causation ID (ID of the command that caused this event) */
  causationId: string;
  /** User ID who triggered the event (if applicable) */
  userId?: string;
  /** Service/module that produced the event */
  source: string;
  /** Schema version for evolution */
  schemaVersion: number;
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Base event interface for all domain events.
 */
export interface Event<T = unknown> {
  /** Unique event identifier */
  id: string;
  /** ID of the aggregate this event belongs to */
  aggregateId: string;
  /** Type of aggregate (e.g., "Config", "Project") */
  aggregateType: string;
  /** Event type name (e.g., "ConfigCreated", "ProjectLinked") */
  eventType: string;
  /** Event payload containing the actual data */
  payload: T;
  /** Event metadata for tracing */
  metadata: EventMetadata;
  /** When the event occurred */
  timestamp: Date;
  /** Version number for optimistic concurrency */
  version: number;
}

/**
 * Zod schema for event validation.
 */
export const eventSchema = z.object({
  id: z.string().uuid(),
  aggregateId: z.string(),
  aggregateType: z.string(),
  eventType: z.string(),
  payload: z.unknown(),
  metadata: z.object({
    correlationId: z.string().uuid(),
    causationId: z.string().uuid(),
    userId: z.string().optional(),
    source: z.string(),
    schemaVersion: z.number().int().positive(),
    custom: z.record(z.unknown()).optional(),
  }),
  timestamp: z.date(),
  version: z.number().int().nonnegative(),
});

/**
 * Event envelope for storage and transport.
 */
export interface EventEnvelope<T = unknown> {
  event: Event<T>;
  /** Sequence number in the event store */
  sequence: bigint;
  /** Partition key for sharding */
  partitionKey: string;
  /** Headers for messaging systems */
  headers: Record<string, string>;
}

/**
 * Snapshot for aggregate state caching.
 */
export interface Snapshot<T = unknown> {
  aggregateId: string;
  aggregateType: string;
  state: T;
  version: number;
  timestamp: Date;
}

// ==================== Command Types ====================

/**
 * Base command interface.
 */
export interface Command<T = unknown> {
  /** Unique command identifier */
  id: string;
  /** Target aggregate ID */
  aggregateId: string;
  /** Command type name */
  commandType: string;
  /** Command payload */
  payload: T;
  /** Command metadata */
  metadata: CommandMetadata;
  /** When command was issued */
  timestamp: Date;
}

/**
 * Command metadata.
 */
export interface CommandMetadata {
  /** Correlation ID for tracing */
  correlationId: string;
  /** User ID who issued the command */
  userId?: string;
  /** Expected aggregate version (for optimistic locking) */
  expectedVersion?: number;
  /** Priority level (0-10) */
  priority: number;
  /** Retry attempt number */
  attempt: number;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Whether this is a compensating command */
  isCompensation: boolean;
  /** Saga ID if part of a saga */
  sagaId?: string;
  /** Deadline for command execution */
  deadline?: Date;
}

/**
 * Command result after execution.
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  commandId: string;
  aggregateId: string;
  newVersion?: number;
  events?: Event[];
  data?: T;
  error?: CommandError;
}

/**
 * Command execution error.
 */
export interface CommandError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retriable: boolean;
}

// ==================== Query Types ====================

/**
 * Base query interface.
 */
export interface Query<T = unknown> {
  /** Unique query identifier */
  id: string;
  /** Query type name */
  queryType: string;
  /** Query parameters */
  params: T;
  /** Query metadata */
  metadata: QueryMetadata;
}

/**
 * Query metadata.
 */
export interface QueryMetadata {
  /** Correlation ID for tracing */
  correlationId: string;
  /** User ID for authorization */
  userId?: string;
  /** Requested consistency level */
  consistency: "eventual" | "strong" | "bounded";
  /** Maximum staleness for bounded consistency (ms) */
  maxStaleness?: number;
  /** Include deleted/archived items */
  includeDeleted?: boolean;
}

/**
 * Query result.
 */
export interface QueryResult<T = unknown> {
  success: boolean;
  queryId: string;
  data?: T;
  metadata: QueryResultMetadata;
  error?: QueryError;
}

/**
 * Query result metadata.
 */
export interface QueryResultMetadata {
  /** When the result was generated */
  timestamp: Date;
  /** Data freshness (ms since last update) */
  staleness: number;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Total count for paginated results */
  totalCount?: number;
  /** Cursor for pagination */
  nextCursor?: string;
}

/**
 * Query execution error.
 */
export interface QueryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ==================== Saga Types ====================

/**
 * Saga state for distributed transactions.
 */
export enum SagaState {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPENSATING = "COMPENSATING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ABORTED = "ABORTED",
}

/**
 * Saga step definition.
 */
export interface SagaStep<T = unknown> {
  /** Step name */
  name: string;
  /** Order in the saga */
  order: number;
  /** Command to execute */
  command: Command<T>;
  /** Compensation command if this step needs to be rolled back */
  compensation?: Command<unknown>;
  /** Timeout for this step (ms) */
  timeout: number;
  /** Whether to retry on failure */
  retryable: boolean;
}

/**
 * Saga instance tracking execution state.
 */
export interface SagaInstance<T = unknown> {
  /** Unique saga instance ID */
  id: string;
  /** Saga type name */
  sagaType: string;
  /** Current state */
  state: SagaState;
  /** Current step index */
  currentStep: number;
  /** Completed steps */
  completedSteps: string[];
  /** Saga context/data */
  context: T;
  /** Step execution history */
  history: SagaStepResult[];
  /** When saga started */
  startedAt: Date;
  /** When saga completed/failed */
  completedAt?: Date;
  /** Last error if failed */
  error?: string;
}

/**
 * Result of a saga step execution.
 */
export interface SagaStepResult {
  stepName: string;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  error?: string;
  commandResult?: CommandResult;
}

// ==================== Actor Types ====================

/**
 * Actor reference for location transparency.
 */
export interface ActorRef {
  /** Actor unique identifier */
  id: string;
  /** Actor type/class name */
  type: string;
  /** Path in the actor hierarchy */
  path: string;
  /** Node where actor is located (for distributed actors) */
  node?: string;
}

/**
 * Message envelope for actor communication.
 */
export interface ActorMessage<T = unknown> {
  /** Message ID */
  id: string;
  /** Sender actor reference */
  sender?: ActorRef;
  /** Recipient actor reference */
  recipient: ActorRef;
  /** Message type */
  type: string;
  /** Message payload */
  payload: T;
  /** When message was sent */
  timestamp: Date;
  /** Reply-to actor reference */
  replyTo?: ActorRef;
  /** Message priority */
  priority: number;
  /** Time-to-live in ms (0 = infinite) */
  ttl: number;
}

/**
 * Actor supervision strategy.
 */
export enum SupervisionStrategy {
  /** Restart the failed actor */
  RESTART = "RESTART",
  /** Resume processing after failure */
  RESUME = "RESUME",
  /** Stop the failed actor */
  STOP = "STOP",
  /** Escalate to parent supervisor */
  ESCALATE = "ESCALATE",
}

/**
 * Actor state for persistence.
 */
export interface ActorState<T = unknown> {
  actorRef: ActorRef;
  state: T;
  version: number;
  lastMessageId?: string;
  lastUpdated: Date;
}

// ==================== Reactive Stream Types ====================

/**
 * Subscription for reactive streams.
 */
export interface Subscription {
  /** Subscription ID */
  id: string;
  /** Request more elements */
  request(n: number): void;
  /** Cancel the subscription */
  cancel(): void;
}

/**
 * Publisher interface for reactive streams.
 */
export interface Publisher<T> {
  subscribe(subscriber: Subscriber<T>): void;
}

/**
 * Subscriber interface for reactive streams.
 */
export interface Subscriber<T> {
  onSubscribe(subscription: Subscription): void;
  onNext(value: T): void;
  onError(error: Error): void;
  onComplete(): void;
}

/**
 * Processor interface (Publisher + Subscriber).
 */
export interface Processor<T, R> extends Subscriber<T>, Publisher<R> {}

/**
 * Backpressure strategy for reactive streams.
 */
export enum BackpressureStrategy {
  /** Drop oldest elements when buffer is full */
  DROP_OLDEST = "DROP_OLDEST",
  /** Drop newest elements when buffer is full */
  DROP_NEWEST = "DROP_NEWEST",
  /** Block producer until buffer has space */
  BLOCK = "BLOCK",
  /** Throw error when buffer is full */
  ERROR = "ERROR",
  /** Sample elements at a rate */
  SAMPLE = "SAMPLE",
  /** Buffer with dynamic growth */
  BUFFER = "BUFFER",
}

/**
 * Stream configuration.
 */
export interface StreamConfig {
  /** Buffer size for backpressure */
  bufferSize: number;
  /** Backpressure strategy */
  strategy: BackpressureStrategy;
  /** Processing parallelism */
  parallelism: number;
  /** Batch size for processing */
  batchSize: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay base (ms) */
  retryDelayMs: number;
}

// ==================== Observability Types ====================

/**
 * Span for distributed tracing.
 */
export interface Span {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Operation name */
  operationName: string;
  /** Service name */
  serviceName: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Duration in ms */
  duration?: number;
  /** Span status */
  status: "OK" | "ERROR" | "UNSET";
  /** Tags/attributes */
  attributes: Record<string, string | number | boolean>;
  /** Log events */
  events: SpanEvent[];
  /** Baggage items (propagated across services) */
  baggage: Record<string, string>;
}

/**
 * Event within a span.
 */
export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Metrics point.
 */
export interface MetricPoint {
  /** Metric name */
  name: string;
  /** Metric type */
  type: "counter" | "gauge" | "histogram" | "summary";
  /** Value */
  value: number;
  /** Labels */
  labels: Record<string, string>;
  /** Timestamp */
  timestamp: Date;
  /** Unit (e.g., "ms", "bytes") */
  unit?: string;
}

// ==================== AIOps Types ====================

/**
 * Anomaly detection result.
 */
export interface AnomalyDetection {
  /** Metric that showed anomaly */
  metric: string;
  /** Anomaly score (0-1) */
  score: number;
  /** Detected value */
  value: number;
  /** Expected value */
  expected: number;
  /** Standard deviation */
  stdDev: number;
  /** Anomaly type */
  type: "spike" | "dip" | "trend" | "pattern";
  /** Severity level */
  severity: "low" | "medium" | "high" | "critical";
  /** When detected */
  detectedAt: Date;
  /** Suggested action */
  suggestion?: string;
}

/**
 * Predictive scaling recommendation.
 */
export interface ScalingRecommendation {
  /** Resource type */
  resource: string;
  /** Current capacity */
  currentCapacity: number;
  /** Recommended capacity */
  recommendedCapacity: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Prediction horizon (ms) */
  horizon: number;
  /** Reason for recommendation */
  reason: string;
  /** Predicted load values */
  predictedLoad: Array<{ timestamp: Date; value: number }>;
}

/**
 * Auto-remediation action.
 */
export interface RemediationAction {
  /** Action ID */
  id: string;
  /** Action type */
  type: "restart" | "scale" | "failover" | "throttle" | "circuit-break";
  /** Target resource */
  target: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Trigger condition */
  trigger: string;
  /** Status */
  status: "pending" | "executing" | "completed" | "failed";
  /** Rollback action if needed */
  rollback?: RemediationAction;
}

/**
 * Capacity planning forecast.
 */
export interface CapacityForecast {
  /** Resource type */
  resource: string;
  /** Forecast horizon (days) */
  horizonDays: number;
  /** Current usage trend */
  trend: "increasing" | "stable" | "decreasing";
  /** Growth rate per day (%) */
  dailyGrowthRate: number;
  /** Forecasted values */
  forecast: Array<{
    date: Date;
    predicted: number;
    lowerBound: number;
    upperBound: number;
  }>;
  /** Capacity warning threshold date */
  warningDate?: Date;
  /** Capacity exhaustion date */
  exhaustionDate?: Date;
  /** Recommendations */
  recommendations: string[];
}
