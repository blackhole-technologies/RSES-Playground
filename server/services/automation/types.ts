/**
 * @file types.ts
 * @description Core types for Remote Automation Engine.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Inspired by:
 * - Zapier: Trigger-action model, app connections
 * - n8n: Visual workflow builder, node-based
 * - GitHub Actions: YAML workflows, matrix builds
 * - Temporal.io: Durable execution, saga patterns
 * - Jenkins: Build pipelines, agents
 */

import { z } from "zod";

// ==================== Core Identifiers ====================

/**
 * Unique identifiers for automation entities.
 */
export type WorkflowId = string;
export type TriggerId = string;
export type ActionId = string;
export type ExecutionId = string;
export type StepId = string;
export type ConnectorId = string;
export type SiteId = string;

// ==================== Workflow Definition ====================

/**
 * Workflow status states.
 */
export enum WorkflowStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  ARCHIVED = "archived",
  ERROR = "error",
}

/**
 * Workflow metadata.
 */
export interface WorkflowMetadata {
  /** Workflow display name */
  name: string;
  /** Detailed description */
  description?: string;
  /** Tags for organization */
  tags: string[];
  /** Creator user ID */
  createdBy: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
  /** Version number */
  version: number;
  /** Site ID for multi-site support */
  siteId?: SiteId;
  /** Whether this workflow can run across sites */
  crossSiteEnabled: boolean;
  /** Maximum concurrent executions */
  maxConcurrency: number;
  /** Timeout for entire workflow (ms) */
  timeout: number;
  /** Retry configuration */
  retry: RetryConfig;
  /** Error handling strategy */
  errorStrategy: ErrorStrategy;
}

/**
 * Retry configuration for workflows and actions.
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay between retries (ms) */
  baseDelay: number;
  /** Maximum delay cap (ms) */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to use jitter */
  useJitter: boolean;
  /** Retryable error codes */
  retryableErrors: string[];
}

/**
 * Error handling strategy.
 */
export enum ErrorStrategy {
  /** Stop workflow on first error */
  FAIL_FAST = "fail_fast",
  /** Continue with next step on error */
  CONTINUE = "continue",
  /** Execute compensation actions */
  COMPENSATE = "compensate",
  /** Pause and wait for manual intervention */
  PAUSE = "pause",
}

/**
 * Complete workflow definition.
 */
export interface Workflow {
  /** Unique workflow identifier */
  id: WorkflowId;
  /** Workflow metadata */
  metadata: WorkflowMetadata;
  /** Current status */
  status: WorkflowStatus;
  /** Triggers that can start this workflow */
  triggers: Trigger[];
  /** Steps in the workflow */
  steps: WorkflowStep[];
  /** Global variables accessible to all steps */
  variables: Record<string, unknown>;
  /** Input schema for workflow parameters */
  inputSchema?: z.ZodType;
  /** Output schema for workflow results */
  outputSchema?: z.ZodType;
  /** Notification settings */
  notifications: NotificationConfig;
}

/**
 * Notification configuration.
 */
export interface NotificationConfig {
  /** Notify on success */
  onSuccess: NotificationChannel[];
  /** Notify on failure */
  onFailure: NotificationChannel[];
  /** Notify on timeout */
  onTimeout: NotificationChannel[];
  /** Notify on pause */
  onPause: NotificationChannel[];
}

/**
 * Notification channel types.
 */
export interface NotificationChannel {
  type: "email" | "webhook" | "slack" | "teams" | "sms";
  target: string;
  template?: string;
}

// ==================== Trigger Types ====================

/**
 * Trigger type enumeration.
 */
export enum TriggerType {
  /** Cron-based schedule */
  CRON = "cron",
  /** Fixed interval */
  INTERVAL = "interval",
  /** Webhook HTTP request */
  WEBHOOK = "webhook",
  /** CMS event */
  EVENT = "event",
  /** API call */
  API = "api",
  /** Manual trigger */
  MANUAL = "manual",
  /** File system change */
  FILE_CHANGE = "file_change",
  /** Cross-site event */
  CROSS_SITE = "cross_site",
  /** Conditional (polling) */
  CONDITION = "condition",
}

/**
 * Base trigger interface.
 */
export interface BaseTrigger {
  /** Unique trigger identifier */
  id: TriggerId;
  /** Trigger type */
  type: TriggerType;
  /** Display name */
  name: string;
  /** Whether trigger is enabled */
  enabled: boolean;
  /** Conditions that must be met */
  conditions?: TriggerCondition[];
  /** Rate limiting */
  rateLimit?: RateLimitConfig;
  /** Debounce configuration (ms) */
  debounce?: number;
}

/**
 * Cron trigger configuration.
 */
export interface CronTrigger extends BaseTrigger {
  type: TriggerType.CRON;
  /** Cron expression (5 or 6 fields) */
  expression: string;
  /** Timezone for schedule */
  timezone: string;
  /** Whether to catch up missed executions */
  catchUp: boolean;
  /** Maximum catch-up executions */
  maxCatchUp: number;
}

/**
 * Interval trigger configuration.
 */
export interface IntervalTrigger extends BaseTrigger {
  type: TriggerType.INTERVAL;
  /** Interval in milliseconds */
  intervalMs: number;
  /** Whether to run immediately on start */
  runOnStart: boolean;
}

/**
 * Webhook trigger configuration.
 */
export interface WebhookTrigger extends BaseTrigger {
  type: TriggerType.WEBHOOK;
  /** Unique webhook path */
  path: string;
  /** HTTP methods to accept */
  methods: ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[];
  /** Secret for HMAC validation */
  secret?: string;
  /** HMAC algorithm */
  hmacAlgorithm?: "sha256" | "sha512";
  /** Header containing HMAC signature */
  signatureHeader?: string;
  /** IP whitelist */
  ipWhitelist?: string[];
  /** Request schema validation */
  requestSchema?: z.ZodType;
}

/**
 * Event trigger configuration.
 */
export interface EventTrigger extends BaseTrigger {
  type: TriggerType.EVENT;
  /** Event types to listen for */
  eventTypes: string[];
  /** Entity types to filter */
  entityTypes?: string[];
  /** Entity ID filter (supports wildcards) */
  entityIdPattern?: string;
}

/**
 * API trigger configuration.
 */
export interface ApiTrigger extends BaseTrigger {
  type: TriggerType.API;
  /** API endpoint path */
  endpoint: string;
  /** Required authentication */
  authentication: "none" | "api_key" | "bearer" | "oauth2";
  /** Required permissions */
  requiredPermissions?: string[];
}

/**
 * Manual trigger configuration.
 */
export interface ManualTrigger extends BaseTrigger {
  type: TriggerType.MANUAL;
  /** Required confirmation */
  requireConfirmation: boolean;
  /** Required permissions to trigger */
  requiredPermissions?: string[];
  /** Input form schema */
  inputForm?: FormFieldDefinition[];
}

/**
 * File change trigger configuration.
 */
export interface FileChangeTrigger extends BaseTrigger {
  type: TriggerType.FILE_CHANGE;
  /** Paths to watch (glob patterns) */
  paths: string[];
  /** Events to trigger on */
  events: ("add" | "change" | "unlink")[];
  /** Ignore patterns */
  ignorePatterns?: string[];
}

/**
 * Cross-site trigger configuration.
 */
export interface CrossSiteTrigger extends BaseTrigger {
  type: TriggerType.CROSS_SITE;
  /** Source site ID */
  sourceSiteId: SiteId;
  /** Event types from source site */
  eventTypes: string[];
  /** Trust level required */
  trustLevel: "verified" | "federated" | "any";
}

/**
 * Condition-based trigger (polling).
 */
export interface ConditionTrigger extends BaseTrigger {
  type: TriggerType.CONDITION;
  /** Condition expression */
  condition: ConditionExpression;
  /** Polling interval (ms) */
  pollInterval: number;
  /** Data source to poll */
  dataSource: DataSourceConfig;
}

/**
 * Union type for all triggers.
 */
export type Trigger =
  | CronTrigger
  | IntervalTrigger
  | WebhookTrigger
  | EventTrigger
  | ApiTrigger
  | ManualTrigger
  | FileChangeTrigger
  | CrossSiteTrigger
  | ConditionTrigger;

/**
 * Trigger condition for filtering.
 */
export interface TriggerCondition {
  /** Field path in trigger data */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare */
  value: unknown;
  /** Whether condition is case-sensitive */
  caseSensitive?: boolean;
}

/**
 * Condition operators.
 */
export enum ConditionOperator {
  EQUALS = "eq",
  NOT_EQUALS = "neq",
  GREATER_THAN = "gt",
  GREATER_THAN_OR_EQUALS = "gte",
  LESS_THAN = "lt",
  LESS_THAN_OR_EQUALS = "lte",
  CONTAINS = "contains",
  NOT_CONTAINS = "not_contains",
  STARTS_WITH = "starts_with",
  ENDS_WITH = "ends_with",
  MATCHES = "matches",
  IN = "in",
  NOT_IN = "not_in",
  IS_NULL = "is_null",
  IS_NOT_NULL = "is_not_null",
  IS_EMPTY = "is_empty",
  IS_NOT_EMPTY = "is_not_empty",
}

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum requests */
  maxRequests: number;
  /** Time window (ms) */
  windowMs: number;
  /** Strategy when limit exceeded */
  strategy: "reject" | "queue" | "throttle";
}

/**
 * Form field definition for manual triggers.
 */
export interface FormFieldDefinition {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "multiselect" | "date" | "datetime" | "json";
  required: boolean;
  default?: unknown;
  options?: { value: unknown; label: string }[];
  validation?: z.ZodType;
  helpText?: string;
}

// ==================== Action Types ====================

/**
 * Action categories for organization.
 */
export enum ActionCategory {
  CONTENT = "content",
  TAXONOMY = "taxonomy",
  MEDIA = "media",
  REPORT = "report",
  BACKUP = "backup",
  CACHE = "cache",
  HEALTH = "health",
  INTEGRATION = "integration",
  NOTIFICATION = "notification",
  UTILITY = "utility",
  CUSTOM = "custom",
}

/**
 * Base action interface.
 */
export interface BaseAction {
  /** Unique action type identifier */
  type: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category for organization */
  category: ActionCategory;
  /** Input schema */
  inputSchema: z.ZodType;
  /** Output schema */
  outputSchema: z.ZodType;
  /** Whether action is idempotent */
  idempotent: boolean;
  /** Whether action supports compensation */
  compensatable: boolean;
  /** Default timeout (ms) */
  defaultTimeout: number;
  /** Default retry configuration */
  defaultRetry: RetryConfig;
}

/**
 * Action instance in a workflow step.
 */
export interface ActionInstance {
  /** Reference to action type */
  actionType: string;
  /** Input configuration with variable references */
  input: Record<string, unknown>;
  /** Override timeout */
  timeout?: number;
  /** Override retry config */
  retry?: Partial<RetryConfig>;
  /** Compensation action configuration */
  compensation?: ActionInstance;
}

// ==================== Workflow Steps ====================

/**
 * Step type enumeration.
 */
export enum StepType {
  /** Execute an action */
  ACTION = "action",
  /** Conditional branching */
  CONDITION = "condition",
  /** Loop over items */
  LOOP = "loop",
  /** Parallel execution */
  PARALLEL = "parallel",
  /** Wait/delay */
  WAIT = "wait",
  /** Transform data */
  TRANSFORM = "transform",
  /** Call sub-workflow */
  SUBWORKFLOW = "subworkflow",
  /** Cross-site action */
  CROSS_SITE = "cross_site",
  /** Human approval step */
  APPROVAL = "approval",
  /** Error handler */
  ERROR_HANDLER = "error_handler",
}

/**
 * Base step interface.
 */
export interface BaseStep {
  /** Unique step identifier */
  id: StepId;
  /** Step type */
  type: StepType;
  /** Display name */
  name: string;
  /** Step description */
  description?: string;
  /** IDs of steps that must complete before this one */
  dependsOn: StepId[];
  /** Condition to execute this step */
  runCondition?: ConditionExpression;
  /** Whether step is enabled */
  enabled: boolean;
  /** Step timeout (ms) */
  timeout?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Error handling for this step */
  onError?: ErrorHandlerConfig;
}

/**
 * Action step configuration.
 */
export interface ActionStep extends BaseStep {
  type: StepType.ACTION;
  /** Action to execute */
  action: ActionInstance;
  /** Output variable name */
  outputVariable?: string;
}

/**
 * Condition step configuration.
 */
export interface ConditionStep extends BaseStep {
  type: StepType.CONDITION;
  /** Condition expression */
  condition: ConditionExpression;
  /** Steps to execute if condition is true */
  thenSteps: StepId[];
  /** Steps to execute if condition is false */
  elseSteps?: StepId[];
}

/**
 * Loop step configuration.
 */
export interface LoopStep extends BaseStep {
  type: StepType.LOOP;
  /** Variable containing items to iterate */
  itemsVariable: string;
  /** Variable name for current item */
  itemVariable: string;
  /** Variable name for current index */
  indexVariable: string;
  /** Steps to execute for each item */
  bodySteps: StepId[];
  /** Maximum iterations (safety limit) */
  maxIterations: number;
  /** Whether to run iterations in parallel */
  parallel: boolean;
  /** Concurrency limit if parallel */
  concurrency?: number;
  /** Whether to continue on item error */
  continueOnError: boolean;
}

/**
 * Parallel step configuration.
 */
export interface ParallelStep extends BaseStep {
  type: StepType.PARALLEL;
  /** Branches to execute in parallel */
  branches: {
    name: string;
    steps: StepId[];
  }[];
  /** Wait strategy */
  waitFor: "all" | "any" | "none";
  /** Concurrency limit */
  concurrency?: number;
}

/**
 * Wait step configuration.
 */
export interface WaitStep extends BaseStep {
  type: StepType.WAIT;
  /** Duration to wait (ms) */
  duration?: number;
  /** Wait until specific time */
  until?: Date;
  /** Wait for external event */
  waitForEvent?: {
    eventType: string;
    timeout: number;
    condition?: ConditionExpression;
  };
}

/**
 * Transform step configuration.
 */
export interface TransformStep extends BaseStep {
  type: StepType.TRANSFORM;
  /** Input variable */
  inputVariable: string;
  /** Output variable */
  outputVariable: string;
  /** Transform expression */
  transform: TransformExpression;
}

/**
 * Subworkflow step configuration.
 */
export interface SubworkflowStep extends BaseStep {
  type: StepType.SUBWORKFLOW;
  /** Workflow ID to execute */
  workflowId: WorkflowId;
  /** Input mapping */
  input: Record<string, string>;
  /** Output variable */
  outputVariable?: string;
  /** Wait for completion */
  waitForCompletion: boolean;
}

/**
 * Cross-site step configuration.
 */
export interface CrossSiteStep extends BaseStep {
  type: StepType.CROSS_SITE;
  /** Target site ID */
  targetSiteId: SiteId;
  /** Action to execute on remote site */
  action: ActionInstance;
  /** Wait for completion */
  waitForCompletion: boolean;
  /** Timeout for remote execution */
  remoteTimeout: number;
}

/**
 * Approval step configuration.
 */
export interface ApprovalStep extends BaseStep {
  type: StepType.APPROVAL;
  /** Users who can approve */
  approvers: string[];
  /** Minimum approvals required */
  minApprovals: number;
  /** Approval timeout (ms) */
  approvalTimeout: number;
  /** Message to display */
  message: string;
  /** Data to show for approval */
  displayData?: Record<string, string>;
  /** Action on timeout */
  onTimeout: "approve" | "reject" | "escalate";
  /** Escalation targets */
  escalateTo?: string[];
}

/**
 * Error handler step configuration.
 */
export interface ErrorHandlerStep extends BaseStep {
  type: StepType.ERROR_HANDLER;
  /** Error types to handle */
  errorTypes: string[];
  /** Handler steps */
  handlerSteps: StepId[];
  /** Whether to continue workflow after handling */
  continueAfter: boolean;
}

/**
 * Union type for all steps.
 */
export type WorkflowStep =
  | ActionStep
  | ConditionStep
  | LoopStep
  | ParallelStep
  | WaitStep
  | TransformStep
  | SubworkflowStep
  | CrossSiteStep
  | ApprovalStep
  | ErrorHandlerStep;

/**
 * Error handler configuration.
 */
export interface ErrorHandlerConfig {
  /** Retry before error handling */
  retryFirst: boolean;
  /** Steps to execute on error */
  handlerSteps?: StepId[];
  /** Fallback value if error */
  fallbackValue?: unknown;
  /** Whether to continue workflow */
  continueWorkflow: boolean;
}

// ==================== Expressions ====================

/**
 * Condition expression types.
 */
export type ConditionExpression =
  | SimpleCondition
  | CompoundCondition
  | ExpressionCondition;

/**
 * Simple condition.
 */
export interface SimpleCondition {
  type: "simple";
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

/**
 * Compound condition (AND/OR).
 */
export interface CompoundCondition {
  type: "compound";
  operator: "and" | "or";
  conditions: ConditionExpression[];
}

/**
 * Expression-based condition.
 */
export interface ExpressionCondition {
  type: "expression";
  /** JavaScript expression returning boolean */
  expression: string;
}

/**
 * Transform expression types.
 */
export type TransformExpression =
  | MapTransform
  | FilterTransform
  | ReduceTransform
  | JqTransform
  | TemplateTransform
  | CodeTransform;

/**
 * Map transform.
 */
export interface MapTransform {
  type: "map";
  /** Field mappings */
  mappings: Record<string, string>;
}

/**
 * Filter transform.
 */
export interface FilterTransform {
  type: "filter";
  condition: ConditionExpression;
}

/**
 * Reduce transform.
 */
export interface ReduceTransform {
  type: "reduce";
  /** Reduce expression */
  expression: string;
  /** Initial value */
  initialValue: unknown;
}

/**
 * JQ-style transform.
 */
export interface JqTransform {
  type: "jq";
  /** JQ query expression */
  query: string;
}

/**
 * Template transform.
 */
export interface TemplateTransform {
  type: "template";
  /** Template string with {{variable}} placeholders */
  template: string;
}

/**
 * Code transform (sandboxed).
 */
export interface CodeTransform {
  type: "code";
  /** JavaScript code (sandboxed execution) */
  code: string;
  /** Allowed globals */
  allowedGlobals?: string[];
}

// ==================== Data Source ====================

/**
 * Data source configuration for condition triggers.
 */
export type DataSourceConfig =
  | HttpDataSource
  | DatabaseDataSource
  | FileDataSource
  | MetricDataSource;

/**
 * HTTP data source.
 */
export interface HttpDataSource {
  type: "http";
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** JSON path to extract value */
  valuePath: string;
}

/**
 * Database data source.
 */
export interface DatabaseDataSource {
  type: "database";
  /** Query to execute */
  query: string;
  /** Connection name */
  connection: string;
}

/**
 * File data source.
 */
export interface FileDataSource {
  type: "file";
  path: string;
  /** How to parse file */
  format: "json" | "yaml" | "text" | "csv";
  /** Path to extract value */
  valuePath?: string;
}

/**
 * Metric data source.
 */
export interface MetricDataSource {
  type: "metric";
  /** Metric name */
  metric: string;
  /** Aggregation */
  aggregation: "avg" | "sum" | "min" | "max" | "count";
  /** Time window (ms) */
  window: number;
}

// ==================== Execution Types ====================

/**
 * Execution status.
 */
export enum ExecutionStatus {
  PENDING = "pending",
  QUEUED = "queued",
  RUNNING = "running",
  PAUSED = "paused",
  WAITING_APPROVAL = "waiting_approval",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  TIMED_OUT = "timed_out",
  COMPENSATING = "compensating",
}

/**
 * Workflow execution instance.
 */
export interface WorkflowExecution {
  /** Unique execution identifier */
  id: ExecutionId;
  /** Workflow being executed */
  workflowId: WorkflowId;
  /** Workflow version at execution time */
  workflowVersion: number;
  /** Trigger that started execution */
  triggerId: TriggerId;
  /** Trigger data */
  triggerData: unknown;
  /** Current status */
  status: ExecutionStatus;
  /** Current step being executed */
  currentStepId?: StepId;
  /** Step execution states */
  stepStates: Map<StepId, StepExecutionState>;
  /** Workflow variables */
  variables: Record<string, unknown>;
  /** Execution input */
  input: unknown;
  /** Execution output */
  output?: unknown;
  /** Error if failed */
  error?: ExecutionError;
  /** Started timestamp */
  startedAt: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** User who triggered (if manual) */
  triggeredBy?: string;
  /** Parent execution (for subworkflows) */
  parentExecutionId?: ExecutionId;
  /** Retry count */
  retryCount: number;
  /** Site where execution runs */
  siteId: SiteId;
  /** Trace ID for observability */
  traceId: string;
}

/**
 * Step execution state.
 */
export interface StepExecutionState {
  stepId: StepId;
  status: ExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: ExecutionError;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  /** Loop iteration (for loop steps) */
  iteration?: number;
  /** Branch name (for parallel steps) */
  branch?: string;
}

/**
 * Execution error.
 */
export interface ExecutionError {
  code: string;
  message: string;
  stepId?: StepId;
  details?: Record<string, unknown>;
  stack?: string;
  retriable: boolean;
  timestamp: Date;
}

// ==================== Built-in Actions ====================

/**
 * Content publishing action input.
 */
export interface PublishContentInput {
  contentId: string;
  publishAt?: Date;
  unpublishAt?: Date;
  channels?: string[];
}

/**
 * Content unpublishing action input.
 */
export interface UnpublishContentInput {
  contentId: string;
  reason?: string;
  archiveContent?: boolean;
}

/**
 * Taxonomy update action input.
 */
export interface UpdateTaxonomyInput {
  entityId: string;
  entityType: string;
  taxonomyChanges: {
    add?: string[];
    remove?: string[];
    set?: string[];
  };
}

/**
 * Media processing action input.
 */
export interface ProcessMediaInput {
  mediaId: string;
  operations: MediaOperation[];
}

/**
 * Media operation.
 */
export interface MediaOperation {
  type: "resize" | "compress" | "convert" | "watermark" | "thumbnail" | "optimize";
  params: Record<string, unknown>;
}

/**
 * Report generation action input.
 */
export interface GenerateReportInput {
  reportType: string;
  parameters: Record<string, unknown>;
  format: "pdf" | "csv" | "xlsx" | "json" | "html";
  destination: ReportDestination;
}

/**
 * Report destination.
 */
export interface ReportDestination {
  type: "email" | "storage" | "webhook";
  config: Record<string, unknown>;
}

/**
 * Backup execution action input.
 */
export interface ExecuteBackupInput {
  scope: "full" | "incremental" | "differential";
  targets: ("database" | "files" | "media" | "config")[];
  destination: BackupDestination;
  compression?: "gzip" | "zip" | "none";
  encryption?: {
    algorithm: string;
    keyId: string;
  };
}

/**
 * Backup destination.
 */
export interface BackupDestination {
  type: "local" | "s3" | "gcs" | "azure" | "ftp" | "sftp";
  config: Record<string, unknown>;
}

/**
 * Cache clearing action input.
 */
export interface ClearCacheInput {
  cacheTypes: ("page" | "data" | "query" | "media" | "all")[];
  patterns?: string[];
  keys?: string[];
}

/**
 * Site health check action input.
 */
export interface SiteHealthCheckInput {
  checks: HealthCheckType[];
  timeout: number;
  alertThresholds?: Record<string, number>;
}

/**
 * Health check types.
 */
export type HealthCheckType =
  | "database"
  | "storage"
  | "memory"
  | "cpu"
  | "disk"
  | "network"
  | "ssl"
  | "dns"
  | "http"
  | "queue";

// ==================== Integration Types ====================

/**
 * Integration connector definition.
 */
export interface IntegrationConnector {
  /** Unique connector identifier */
  id: ConnectorId;
  /** Connector name */
  name: string;
  /** Connector description */
  description: string;
  /** Icon URL */
  iconUrl?: string;
  /** Connector version */
  version: string;
  /** Authentication type required */
  authType: ConnectorAuthType;
  /** Authentication configuration schema */
  authConfigSchema: z.ZodType;
  /** Available actions */
  actions: ConnectorAction[];
  /** Available triggers */
  triggers: ConnectorTrigger[];
  /** Rate limits */
  rateLimit?: RateLimitConfig;
  /** Connector status */
  status: "active" | "deprecated" | "beta";
}

/**
 * Connector authentication types.
 */
export enum ConnectorAuthType {
  NONE = "none",
  API_KEY = "api_key",
  BASIC = "basic",
  BEARER = "bearer",
  OAUTH2 = "oauth2",
  CUSTOM = "custom",
}

/**
 * Connector action definition.
 */
export interface ConnectorAction {
  /** Action identifier within connector */
  id: string;
  /** Action name */
  name: string;
  /** Action description */
  description: string;
  /** Input schema */
  inputSchema: z.ZodType;
  /** Output schema */
  outputSchema: z.ZodType;
  /** Whether action is premium */
  premium?: boolean;
}

/**
 * Connector trigger definition.
 */
export interface ConnectorTrigger {
  /** Trigger identifier within connector */
  id: string;
  /** Trigger name */
  name: string;
  /** Trigger description */
  description: string;
  /** Trigger type */
  type: "webhook" | "polling";
  /** Polling interval (for polling triggers) */
  pollingInterval?: number;
  /** Output schema */
  outputSchema: z.ZodType;
}

/**
 * Connection instance (user's connected account).
 */
export interface Connection {
  /** Connection identifier */
  id: string;
  /** User who created connection */
  userId: string;
  /** Connector ID */
  connectorId: ConnectorId;
  /** Connection name (user-defined) */
  name: string;
  /** Encrypted credentials */
  credentials: string;
  /** Credential metadata (non-sensitive) */
  credentialMetadata?: Record<string, unknown>;
  /** Whether connection is active */
  active: boolean;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Creation timestamp */
  createdAt: Date;
  /** Last refresh timestamp */
  refreshedAt?: Date;
  /** Error if connection failed */
  error?: string;
}

// ==================== Cross-Site Types ====================

/**
 * Site federation configuration.
 */
export interface SiteFederation {
  /** Site identifier */
  siteId: SiteId;
  /** Site name */
  name: string;
  /** Site URL */
  url: string;
  /** Public key for verification */
  publicKey: string;
  /** Trust level */
  trustLevel: "full" | "limited" | "none";
  /** Allowed actions from this site */
  allowedActions: string[];
  /** Allowed events to receive */
  allowedEvents: string[];
  /** Last sync timestamp */
  lastSyncAt?: Date;
  /** Status */
  status: "active" | "inactive" | "pending" | "blocked";
}

/**
 * Cross-site message.
 */
export interface CrossSiteMessage {
  /** Message identifier */
  id: string;
  /** Source site */
  sourceSiteId: SiteId;
  /** Target site */
  targetSiteId: SiteId;
  /** Message type */
  type: "event" | "action" | "result" | "health";
  /** Message payload */
  payload: unknown;
  /** Digital signature */
  signature: string;
  /** Timestamp */
  timestamp: Date;
  /** Expiration */
  expiresAt: Date;
  /** Reply-to message ID */
  replyTo?: string;
}

// ==================== Monitoring Types ====================

/**
 * Automation run record.
 */
export interface AutomationRun {
  /** Run identifier */
  id: string;
  /** Execution ID */
  executionId: ExecutionId;
  /** Workflow ID */
  workflowId: WorkflowId;
  /** Workflow name (snapshot) */
  workflowName: string;
  /** Trigger type */
  triggerType: TriggerType;
  /** Status */
  status: ExecutionStatus;
  /** Started timestamp */
  startedAt: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Duration (ms) */
  durationMs?: number;
  /** Steps executed */
  stepsExecuted: number;
  /** Steps succeeded */
  stepsSucceeded: number;
  /** Steps failed */
  stepsFailed: number;
  /** Error summary */
  errorSummary?: string;
  /** Site ID */
  siteId: SiteId;
  /** User who triggered (if manual) */
  triggeredBy?: string;
  /** Resource usage */
  resourceUsage?: ResourceUsage;
}

/**
 * Resource usage metrics.
 */
export interface ResourceUsage {
  /** CPU time (ms) */
  cpuTimeMs: number;
  /** Memory peak (bytes) */
  memoryPeakBytes: number;
  /** Network bytes in */
  networkBytesIn: number;
  /** Network bytes out */
  networkBytesOut: number;
  /** Database queries */
  dbQueries: number;
  /** External API calls */
  externalApiCalls: number;
}

/**
 * Automation metrics.
 */
export interface AutomationMetrics {
  /** Total executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Average duration (ms) */
  averageDurationMs: number;
  /** 95th percentile duration (ms) */
  p95DurationMs: number;
  /** Executions per hour */
  executionsPerHour: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Most common errors */
  topErrors: { code: string; count: number; message: string }[];
  /** Active workflows */
  activeWorkflows: number;
  /** Queued executions */
  queuedExecutions: number;
  /** Resource usage trends */
  resourceTrends: {
    period: string;
    cpuUsage: number;
    memoryUsage: number;
  }[];
}

/**
 * Alert configuration.
 */
export interface AlertConfig {
  /** Alert identifier */
  id: string;
  /** Alert name */
  name: string;
  /** Condition to trigger alert */
  condition: AlertCondition;
  /** Notification channels */
  channels: NotificationChannel[];
  /** Cooldown period (ms) */
  cooldownMs: number;
  /** Whether alert is enabled */
  enabled: boolean;
}

/**
 * Alert condition.
 */
export interface AlertCondition {
  /** Metric to monitor */
  metric: "error_rate" | "duration" | "queue_size" | "failure_count";
  /** Comparison operator */
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  /** Threshold value */
  threshold: number;
  /** Time window for aggregation (ms) */
  windowMs: number;
  /** Minimum samples required */
  minSamples: number;
}

// ==================== Zod Schemas ====================

/**
 * Workflow metadata schema.
 */
export const workflowMetadataSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().positive(),
  siteId: z.string().optional(),
  crossSiteEnabled: z.boolean(),
  maxConcurrency: z.number().int().positive().max(100),
  timeout: z.number().int().positive().max(86400000), // Max 24 hours
  retry: z.object({
    maxAttempts: z.number().int().min(0).max(10),
    baseDelay: z.number().int().positive().max(60000),
    maxDelay: z.number().int().positive().max(3600000),
    backoffMultiplier: z.number().positive().max(10),
    useJitter: z.boolean(),
    retryableErrors: z.array(z.string()),
  }),
  errorStrategy: z.nativeEnum(ErrorStrategy),
});

/**
 * Cron trigger schema.
 */
export const cronTriggerSchema = z.object({
  id: z.string(),
  type: z.literal(TriggerType.CRON),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  expression: z.string().regex(/^(\S+\s+){4,5}\S+$/), // Basic cron validation
  timezone: z.string(),
  catchUp: z.boolean(),
  maxCatchUp: z.number().int().min(0).max(100),
});

/**
 * Webhook trigger schema.
 */
export const webhookTriggerSchema = z.object({
  id: z.string(),
  type: z.literal(TriggerType.WEBHOOK),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  path: z.string().regex(/^\/[a-zA-Z0-9\-_\/]+$/),
  methods: z.array(z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"])),
  secret: z.string().min(32).optional(),
  hmacAlgorithm: z.enum(["sha256", "sha512"]).optional(),
  signatureHeader: z.string().optional(),
  ipWhitelist: z.array(z.string().ip()).optional(),
});

/**
 * Execution error schema.
 */
export const executionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  stack: z.string().optional(),
  retriable: z.boolean(),
  timestamp: z.date(),
});
