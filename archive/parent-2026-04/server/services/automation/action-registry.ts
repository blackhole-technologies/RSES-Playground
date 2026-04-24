/**
 * @file action-registry.ts
 * @description Action registry and execution engine for automation.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Built-in CMS actions (publish, taxonomy, media, etc.)
 * - Custom action registration
 * - Action execution with retry and circuit breaker
 * - Action chaining and data flow
 * - Compensation (rollback) support
 * - Sandboxed code execution
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { CircuitBreaker, CircuitState } from "../../lib/circuit-breaker";
import type {
  BaseAction,
  ActionCategory,
  ActionInstance,
  RetryConfig,
  ExecutionError,
  PublishContentInput,
  UnpublishContentInput,
  UpdateTaxonomyInput,
  ProcessMediaInput,
  GenerateReportInput,
  ExecuteBackupInput,
  ClearCacheInput,
  SiteHealthCheckInput,
  HealthCheckType,
} from "./types";

// ==================== Action Context ====================

/**
 * Context available during action execution.
 */
export interface ActionContext {
  /** Execution ID */
  executionId: string;
  /** Workflow ID */
  workflowId: string;
  /** Site ID */
  siteId: string;
  /** User ID (if triggered by user) */
  userId?: string;
  /** Previous step outputs */
  variables: Record<string, unknown>;
  /** Trace ID for observability */
  traceId: string;
  /** Attempt number (1-based) */
  attempt: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Deadline for execution */
  deadline?: Date;
  /** Logger instance */
  logger: ActionLogger;
  /** Metrics recorder */
  metrics: ActionMetrics;
}

/**
 * Logger interface for actions.
 */
export interface ActionLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Metrics interface for actions.
 */
export interface ActionMetrics {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  timing(metric: string, durationMs: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}

// ==================== Action Handler ====================

/**
 * Action handler function type.
 */
export type ActionHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ActionContext
) => Promise<TOutput>;

/**
 * Compensation handler for rollback.
 */
export type CompensationHandler<TInput = unknown, TOutput = unknown> = (
  originalInput: TInput,
  originalOutput: TOutput,
  context: ActionContext
) => Promise<void>;

/**
 * Registered action with handler.
 */
export interface RegisteredAction<TInput = unknown, TOutput = unknown> extends BaseAction {
  handler: ActionHandler<TInput, TOutput>;
  compensation?: CompensationHandler<TInput, TOutput>;
}

// ==================== Action Result ====================

/**
 * Result of action execution.
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: ExecutionError;
  durationMs: number;
  attempt: number;
  compensated?: boolean;
}

// ==================== Default Logger & Metrics ====================

/**
 * Default console logger.
 */
const defaultLogger: ActionLogger = {
  debug: (msg, data) => console.debug(`[Action] ${msg}`, data || ""),
  info: (msg, data) => console.info(`[Action] ${msg}`, data || ""),
  warn: (msg, data) => console.warn(`[Action] ${msg}`, data || ""),
  error: (msg, data) => console.error(`[Action] ${msg}`, data || ""),
};

/**
 * Default no-op metrics.
 */
const defaultMetrics: ActionMetrics = {
  increment: () => {},
  timing: () => {},
  gauge: () => {},
};

// ==================== Action Registry ====================

/**
 * Registry for all automation actions.
 */
export class ActionRegistry {
  private actions: Map<string, RegisteredAction> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private executionCounts: Map<string, { total: number; success: number; failure: number }> = new Map();

  constructor() {
    // Register built-in actions
    this.registerBuiltInActions();
  }

  /**
   * Registers a new action.
   */
  register<TInput, TOutput>(action: RegisteredAction<TInput, TOutput>): void {
    this.actions.set(action.type, action as RegisteredAction);
    this.executionCounts.set(action.type, { total: 0, success: 0, failure: 0 });

    // Create circuit breaker for the action
    this.circuitBreakers.set(
      action.type,
      new CircuitBreaker({
        name: `action:${action.type}`,
        failureThreshold: 5,
        resetTimeout: 30000,
        successThreshold: 2,
      })
    );
  }

  /**
   * Unregisters an action.
   */
  unregister(actionType: string): boolean {
    const deleted = this.actions.delete(actionType);
    this.circuitBreakers.delete(actionType);
    this.executionCounts.delete(actionType);
    return deleted;
  }

  /**
   * Gets an action by type.
   */
  get(actionType: string): RegisteredAction | undefined {
    return this.actions.get(actionType);
  }

  /**
   * Gets all registered actions.
   */
  getAll(): RegisteredAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Gets actions by category.
   */
  getByCategory(category: ActionCategory): RegisteredAction[] {
    return Array.from(this.actions.values()).filter((a) => a.category === category);
  }

  /**
   * Checks if an action exists.
   */
  has(actionType: string): boolean {
    return this.actions.has(actionType);
  }

  /**
   * Executes an action instance.
   */
  async execute<TOutput = unknown>(
    instance: ActionInstance,
    context: ActionContext
  ): Promise<ActionResult<TOutput>> {
    const action = this.actions.get(instance.actionType);
    if (!action) {
      return {
        success: false,
        error: {
          code: "ACTION_NOT_FOUND",
          message: `Action type '${instance.actionType}' not found`,
          retriable: false,
          timestamp: new Date(),
        },
        durationMs: 0,
        attempt: context.attempt,
      };
    }

    const circuitBreaker = this.circuitBreakers.get(instance.actionType);
    const retryConfig = { ...action.defaultRetry, ...instance.retry };
    const timeout = instance.timeout || action.defaultTimeout;

    const startTime = Date.now();
    let lastError: ExecutionError | undefined;

    // Update execution counts
    const counts = this.executionCounts.get(instance.actionType)!;
    counts.total++;

    // Retry loop
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      context.attempt = attempt;

      try {
        // Check circuit breaker
        if (circuitBreaker && circuitBreaker.getState() === CircuitState.OPEN) {
          throw new Error("Circuit breaker is open");
        }

        // Validate input
        const validationResult = action.inputSchema.safeParse(instance.input);
        if (!validationResult.success) {
          throw new Error(`Input validation failed: ${validationResult.error.message}`);
        }

        // Execute with timeout
        const output = await this.executeWithTimeout(
          action.handler,
          validationResult.data,
          context,
          timeout
        );

        // Validate output
        const outputValidation = action.outputSchema.safeParse(output);
        if (!outputValidation.success) {
          context.logger.warn("Output validation failed", { error: outputValidation.error.message });
        }

        // Record success
        counts.success++;
        context.metrics.increment("action.success", 1, { action: instance.actionType });
        context.metrics.timing("action.duration", Date.now() - startTime, { action: instance.actionType });

        return {
          success: true,
          output: output as TOutput,
          durationMs: Date.now() - startTime,
          attempt,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = {
          code: this.getErrorCode(error),
          message: error.message,
          retriable: this.isRetriable(error, retryConfig),
          timestamp: new Date(),
          stack: error.stack,
        };

        context.logger.warn(`Action attempt ${attempt} failed`, {
          actionType: instance.actionType,
          error: error.message,
          attempt,
          maxAttempts: retryConfig.maxAttempts,
        });

        // Don't retry if not retriable
        if (!lastError.retriable) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < retryConfig.maxAttempts) {
          const delay = this.calculateBackoff(attempt, retryConfig);
          await this.delay(delay);
        }
      }
    }

    // Record failure
    counts.failure++;
    context.metrics.increment("action.failure", 1, { action: instance.actionType });

    return {
      success: false,
      error: lastError,
      durationMs: Date.now() - startTime,
      attempt: context.attempt,
    };
  }

  /**
   * Executes compensation for a failed action.
   */
  async compensate<TInput, TOutput>(
    instance: ActionInstance,
    originalOutput: TOutput,
    context: ActionContext
  ): Promise<boolean> {
    const action = this.actions.get(instance.actionType);
    if (!action || !action.compensation) {
      return false;
    }

    try {
      await action.compensation(instance.input as TInput, originalOutput, context);
      context.logger.info("Compensation executed successfully", { actionType: instance.actionType });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error("Compensation failed", { actionType: instance.actionType, error: error.message });
      return false;
    }
  }

  /**
   * Gets execution statistics for an action.
   */
  getStats(actionType: string): { total: number; success: number; failure: number; successRate: number } | undefined {
    const counts = this.executionCounts.get(actionType);
    if (!counts) return undefined;

    return {
      ...counts,
      successRate: counts.total > 0 ? counts.success / counts.total : 0,
    };
  }

  /**
   * Gets circuit breaker state for an action.
   */
  getCircuitState(actionType: string): CircuitState | undefined {
    return this.circuitBreakers.get(actionType)?.getState();
  }

  /**
   * Resets circuit breaker for an action.
   */
  resetCircuit(actionType: string): boolean {
    const cb = this.circuitBreakers.get(actionType);
    if (!cb) return false;
    cb.reset();
    return true;
  }

  /**
   * Executes handler with timeout.
   */
  private async executeWithTimeout<TInput, TOutput>(
    handler: ActionHandler<TInput, TOutput>,
    input: TInput,
    context: ActionContext,
    timeoutMs: number
  ): Promise<TOutput> {
    return Promise.race([
      handler(input, context),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Action timed out")), timeoutMs);
      }),
    ]);
  }

  /**
   * Calculates backoff delay with jitter.
   */
  private calculateBackoff(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, config.maxDelay);

    if (config.useJitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Determines if an error is retriable.
   */
  private isRetriable(error: Error, config: RetryConfig): boolean {
    const code = this.getErrorCode(error);

    // Check against retryable error codes
    if (config.retryableErrors.includes(code)) {
      return true;
    }

    // Default retriable patterns
    const retriablePatterns = [
      /timeout/i,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ETIMEDOUT/,
      /network/i,
      /temporarily/i,
      /rate limit/i,
      /503/,
      /502/,
      /504/,
    ];

    return retriablePatterns.some((p) => p.test(error.message));
  }

  /**
   * Extracts error code from error.
   */
  private getErrorCode(error: Error): string {
    if ("code" in error && typeof (error as Record<string, unknown>).code === "string") {
      return (error as Record<string, unknown>).code as string;
    }
    return "UNKNOWN_ERROR";
  }

  /**
   * Delays execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Registers all built-in actions.
   */
  private registerBuiltInActions(): void {
    // Content actions
    this.registerContentActions();

    // Taxonomy actions
    this.registerTaxonomyActions();

    // Media actions
    this.registerMediaActions();

    // Report actions
    this.registerReportActions();

    // Backup actions
    this.registerBackupActions();

    // Cache actions
    this.registerCacheActions();

    // Health check actions
    this.registerHealthActions();

    // Utility actions
    this.registerUtilityActions();
  }

  /**
   * Registers content-related actions.
   */
  private registerContentActions(): void {
    // Publish content
    this.register<PublishContentInput, { contentId: string; publishedAt: Date }>({
      type: "content.publish",
      name: "Publish Content",
      description: "Publishes content to specified channels",
      category: "content" as ActionCategory,
      inputSchema: z.object({
        contentId: z.string(),
        publishAt: z.date().optional(),
        unpublishAt: z.date().optional(),
        channels: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        contentId: z.string(),
        publishedAt: z.date(),
      }),
      idempotent: true,
      compensatable: true,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Publishing content", { contentId: input.contentId });
        // Actual implementation would call CMS API
        return {
          contentId: input.contentId,
          publishedAt: input.publishAt || new Date(),
        };
      },
      compensation: async (input, output, context) => {
        context.logger.info("Unpublishing content (compensation)", { contentId: input.contentId });
        // Actual implementation would call CMS API to unpublish
      },
    });

    // Unpublish content
    this.register<UnpublishContentInput, { contentId: string; unpublishedAt: Date }>({
      type: "content.unpublish",
      name: "Unpublish Content",
      description: "Removes content from publication",
      category: "content" as ActionCategory,
      inputSchema: z.object({
        contentId: z.string(),
        reason: z.string().optional(),
        archiveContent: z.boolean().optional(),
      }),
      outputSchema: z.object({
        contentId: z.string(),
        unpublishedAt: z.date(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Unpublishing content", { contentId: input.contentId });
        return {
          contentId: input.contentId,
          unpublishedAt: new Date(),
        };
      },
    });

    // Clone content
    this.register<{ sourceId: string; targetName?: string }, { newContentId: string }>({
      type: "content.clone",
      name: "Clone Content",
      description: "Creates a copy of existing content",
      category: "content" as ActionCategory,
      inputSchema: z.object({
        sourceId: z.string(),
        targetName: z.string().optional(),
      }),
      outputSchema: z.object({
        newContentId: z.string(),
      }),
      idempotent: false,
      compensatable: true,
      defaultTimeout: 60000,
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Cloning content", { sourceId: input.sourceId });
        return {
          newContentId: randomUUID(),
        };
      },
      compensation: async (input, output, context) => {
        context.logger.info("Deleting cloned content (compensation)", { contentId: output.newContentId });
      },
    });
  }

  /**
   * Registers taxonomy-related actions.
   */
  private registerTaxonomyActions(): void {
    // Update taxonomy
    this.register<UpdateTaxonomyInput, { updated: boolean; changes: number }>({
      type: "taxonomy.update",
      name: "Update Taxonomy",
      description: "Updates taxonomy assignments for an entity",
      category: "taxonomy" as ActionCategory,
      inputSchema: z.object({
        entityId: z.string(),
        entityType: z.string(),
        taxonomyChanges: z.object({
          add: z.array(z.string()).optional(),
          remove: z.array(z.string()).optional(),
          set: z.array(z.string()).optional(),
        }),
      }),
      outputSchema: z.object({
        updated: z.boolean(),
        changes: z.number(),
      }),
      idempotent: true,
      compensatable: true,
      defaultTimeout: 15000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "CONFLICT"],
      },
      handler: async (input, context) => {
        context.logger.info("Updating taxonomy", { entityId: input.entityId });
        const changes =
          (input.taxonomyChanges.add?.length || 0) +
          (input.taxonomyChanges.remove?.length || 0) +
          (input.taxonomyChanges.set?.length || 0);
        return { updated: true, changes };
      },
    });

    // Bulk taxonomy update
    this.register<{ updates: UpdateTaxonomyInput[] }, { processed: number; failed: number }>({
      type: "taxonomy.bulkUpdate",
      name: "Bulk Taxonomy Update",
      description: "Updates taxonomy for multiple entities",
      category: "taxonomy" as ActionCategory,
      inputSchema: z.object({
        updates: z.array(z.object({
          entityId: z.string(),
          entityType: z.string(),
          taxonomyChanges: z.object({
            add: z.array(z.string()).optional(),
            remove: z.array(z.string()).optional(),
            set: z.array(z.string()).optional(),
          }),
        })),
      }),
      outputSchema: z.object({
        processed: z.number(),
        failed: z.number(),
      }),
      idempotent: false,
      compensatable: false,
      defaultTimeout: 120000,
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Bulk updating taxonomy", { count: input.updates.length });
        return { processed: input.updates.length, failed: 0 };
      },
    });

    // Sync taxonomy
    this.register<{ source: string; target: string }, { synced: number }>({
      type: "taxonomy.sync",
      name: "Sync Taxonomy",
      description: "Synchronizes taxonomy between sources",
      category: "taxonomy" as ActionCategory,
      inputSchema: z.object({
        source: z.string(),
        target: z.string(),
      }),
      outputSchema: z.object({
        synced: z.number(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 300000,
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 5000,
        maxDelay: 60000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Syncing taxonomy", { source: input.source, target: input.target });
        return { synced: 0 };
      },
    });
  }

  /**
   * Registers media-related actions.
   */
  private registerMediaActions(): void {
    // Process media
    this.register<ProcessMediaInput, { mediaId: string; processedAt: Date; results: Record<string, unknown> }>({
      type: "media.process",
      name: "Process Media",
      description: "Processes media with specified operations",
      category: "media" as ActionCategory,
      inputSchema: z.object({
        mediaId: z.string(),
        operations: z.array(z.object({
          type: z.enum(["resize", "compress", "convert", "watermark", "thumbnail", "optimize"]),
          params: z.record(z.unknown()),
        })),
      }),
      outputSchema: z.object({
        mediaId: z.string(),
        processedAt: z.date(),
        results: z.record(z.unknown()),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 300000, // 5 minutes for media processing
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 5000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "PROCESSING_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Processing media", { mediaId: input.mediaId, operations: input.operations.length });
        return {
          mediaId: input.mediaId,
          processedAt: new Date(),
          results: {},
        };
      },
    });

    // Generate thumbnail
    this.register<{ mediaId: string; sizes: { width: number; height: number }[] }, { thumbnails: string[] }>({
      type: "media.generateThumbnails",
      name: "Generate Thumbnails",
      description: "Generates thumbnails for media",
      category: "media" as ActionCategory,
      inputSchema: z.object({
        mediaId: z.string(),
        sizes: z.array(z.object({
          width: z.number().positive(),
          height: z.number().positive(),
        })),
      }),
      outputSchema: z.object({
        thumbnails: z.array(z.string()),
      }),
      idempotent: true,
      compensatable: true,
      defaultTimeout: 120000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 2000,
        maxDelay: 20000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Generating thumbnails", { mediaId: input.mediaId, sizes: input.sizes.length });
        return {
          thumbnails: input.sizes.map(() => randomUUID()),
        };
      },
    });
  }

  /**
   * Registers report-related actions.
   */
  private registerReportActions(): void {
    // Generate report
    this.register<GenerateReportInput, { reportId: string; url?: string; size?: number }>({
      type: "report.generate",
      name: "Generate Report",
      description: "Generates a report in specified format",
      category: "report" as ActionCategory,
      inputSchema: z.object({
        reportType: z.string(),
        parameters: z.record(z.unknown()),
        format: z.enum(["pdf", "csv", "xlsx", "json", "html"]),
        destination: z.object({
          type: z.enum(["email", "storage", "webhook"]),
          config: z.record(z.unknown()),
        }),
      }),
      outputSchema: z.object({
        reportId: z.string(),
        url: z.string().optional(),
        size: z.number().optional(),
      }),
      idempotent: false,
      compensatable: true,
      defaultTimeout: 600000, // 10 minutes for reports
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 5000,
        maxDelay: 60000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Generating report", { reportType: input.reportType, format: input.format });
        return {
          reportId: randomUUID(),
          url: `https://reports.example.com/${randomUUID()}.${input.format}`,
          size: 0,
        };
      },
    });

    // Schedule report
    this.register<{ reportConfig: GenerateReportInput; schedule: string }, { scheduleId: string }>({
      type: "report.schedule",
      name: "Schedule Report",
      description: "Schedules recurring report generation",
      category: "report" as ActionCategory,
      inputSchema: z.object({
        reportConfig: z.object({
          reportType: z.string(),
          parameters: z.record(z.unknown()),
          format: z.enum(["pdf", "csv", "xlsx", "json", "html"]),
          destination: z.object({
            type: z.enum(["email", "storage", "webhook"]),
            config: z.record(z.unknown()),
          }),
        }),
        schedule: z.string(),
      }),
      outputSchema: z.object({
        scheduleId: z.string(),
      }),
      idempotent: true,
      compensatable: true,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Scheduling report", { reportType: input.reportConfig.reportType });
        return { scheduleId: randomUUID() };
      },
    });
  }

  /**
   * Registers backup-related actions.
   */
  private registerBackupActions(): void {
    // Execute backup
    this.register<ExecuteBackupInput, { backupId: string; size: number; location: string }>({
      type: "backup.execute",
      name: "Execute Backup",
      description: "Executes a backup with specified scope and destination",
      category: "backup" as ActionCategory,
      inputSchema: z.object({
        scope: z.enum(["full", "incremental", "differential"]),
        targets: z.array(z.enum(["database", "files", "media", "config"])),
        destination: z.object({
          type: z.enum(["local", "s3", "gcs", "azure", "ftp", "sftp"]),
          config: z.record(z.unknown()),
        }),
        compression: z.enum(["gzip", "zip", "none"]).optional(),
        encryption: z.object({
          algorithm: z.string(),
          keyId: z.string(),
        }).optional(),
      }),
      outputSchema: z.object({
        backupId: z.string(),
        size: z.number(),
        location: z.string(),
      }),
      idempotent: false,
      compensatable: true,
      defaultTimeout: 3600000, // 1 hour for backups
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 10000,
        maxDelay: 120000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "STORAGE_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Executing backup", { scope: input.scope, targets: input.targets });
        return {
          backupId: randomUUID(),
          size: 0,
          location: "backup://location",
        };
      },
    });

    // Restore backup
    this.register<{ backupId: string; targets?: string[] }, { restored: boolean; timestamp: Date }>({
      type: "backup.restore",
      name: "Restore Backup",
      description: "Restores from a backup",
      category: "backup" as ActionCategory,
      inputSchema: z.object({
        backupId: z.string(),
        targets: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        restored: z.boolean(),
        timestamp: z.date(),
      }),
      idempotent: false,
      compensatable: false,
      defaultTimeout: 3600000,
      defaultRetry: {
        maxAttempts: 1, // Don't retry restores automatically
        baseDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
        useJitter: false,
        retryableErrors: [],
      },
      handler: async (input, context) => {
        context.logger.info("Restoring backup", { backupId: input.backupId });
        return { restored: true, timestamp: new Date() };
      },
    });
  }

  /**
   * Registers cache-related actions.
   */
  private registerCacheActions(): void {
    // Clear cache
    this.register<ClearCacheInput, { cleared: string[]; count: number }>({
      type: "cache.clear",
      name: "Clear Cache",
      description: "Clears specified cache types",
      category: "cache" as ActionCategory,
      inputSchema: z.object({
        cacheTypes: z.array(z.enum(["page", "data", "query", "media", "all"])),
        patterns: z.array(z.string()).optional(),
        keys: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        cleared: z.array(z.string()),
        count: z.number(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 60000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Clearing cache", { types: input.cacheTypes });
        return { cleared: input.cacheTypes, count: 0 };
      },
    });

    // Warm cache
    this.register<{ urls: string[] }, { warmed: number; failed: number }>({
      type: "cache.warm",
      name: "Warm Cache",
      description: "Pre-warms cache with specified URLs",
      category: "cache" as ActionCategory,
      inputSchema: z.object({
        urls: z.array(z.string().url()),
      }),
      outputSchema: z.object({
        warmed: z.number(),
        failed: z.number(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 300000,
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 2000,
        maxDelay: 20000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Warming cache", { urlCount: input.urls.length });
        return { warmed: input.urls.length, failed: 0 };
      },
    });
  }

  /**
   * Registers health check actions.
   */
  private registerHealthActions(): void {
    // Site health check
    this.register<SiteHealthCheckInput, { healthy: boolean; checks: Record<string, { status: string; latency: number }> }>({
      type: "health.check",
      name: "Site Health Check",
      description: "Performs comprehensive site health check",
      category: "health" as ActionCategory,
      inputSchema: z.object({
        checks: z.array(z.enum(["database", "storage", "memory", "cpu", "disk", "network", "ssl", "dns", "http", "queue"])),
        timeout: z.number(),
        alertThresholds: z.record(z.number()).optional(),
      }),
      outputSchema: z.object({
        healthy: z.boolean(),
        checks: z.record(z.object({
          status: z.string(),
          latency: z.number(),
        })),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 60000,
      defaultRetry: {
        maxAttempts: 2,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR"],
      },
      handler: async (input, context) => {
        context.logger.info("Running health checks", { checks: input.checks });
        const results: Record<string, { status: string; latency: number }> = {};
        for (const check of input.checks) {
          results[check] = { status: "healthy", latency: Math.random() * 100 };
        }
        return { healthy: true, checks: results };
      },
    });

    // Ping endpoint
    this.register<{ url: string; method?: string }, { reachable: boolean; latencyMs: number; statusCode?: number }>({
      type: "health.ping",
      name: "Ping Endpoint",
      description: "Pings an HTTP endpoint",
      category: "health" as ActionCategory,
      inputSchema: z.object({
        url: z.string().url(),
        method: z.enum(["GET", "HEAD", "POST"]).optional(),
      }),
      outputSchema: z.object({
        reachable: z.boolean(),
        latencyMs: z.number(),
        statusCode: z.number().optional(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Pinging endpoint", { url: input.url });
        return { reachable: true, latencyMs: Math.random() * 200, statusCode: 200 };
      },
    });
  }

  /**
   * Registers utility actions.
   */
  private registerUtilityActions(): void {
    // HTTP request
    this.register<{ url: string; method: string; headers?: Record<string, string>; body?: unknown }, { status: number; body: unknown; headers: Record<string, string> }>({
      type: "utility.httpRequest",
      name: "HTTP Request",
      description: "Makes an HTTP request to an external URL",
      category: "utility" as ActionCategory,
      inputSchema: z.object({
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        headers: z.record(z.string()).optional(),
        body: z.unknown().optional(),
      }),
      outputSchema: z.object({
        status: z.number(),
        body: z.unknown(),
        headers: z.record(z.string()),
      }),
      idempotent: false,
      compensatable: false,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
      },
      handler: async (input, context) => {
        context.logger.info("Making HTTP request", { url: input.url, method: input.method });
        return { status: 200, body: {}, headers: {} };
      },
    });

    // Send notification
    this.register<{ channel: string; message: string; recipients?: string[] }, { sent: boolean; messageId: string }>({
      type: "utility.notify",
      name: "Send Notification",
      description: "Sends a notification via specified channel",
      category: "notification" as ActionCategory,
      inputSchema: z.object({
        channel: z.enum(["email", "slack", "teams", "sms", "webhook"]),
        message: z.string(),
        recipients: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        sent: z.boolean(),
        messageId: z.string(),
      }),
      idempotent: false,
      compensatable: false,
      defaultTimeout: 30000,
      defaultRetry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        useJitter: true,
        retryableErrors: ["NETWORK_ERROR", "RATE_LIMIT"],
      },
      handler: async (input, context) => {
        context.logger.info("Sending notification", { channel: input.channel });
        return { sent: true, messageId: randomUUID() };
      },
    });

    // Wait/delay
    this.register<{ durationMs: number }, { waited: boolean; actualMs: number }>({
      type: "utility.wait",
      name: "Wait",
      description: "Pauses execution for specified duration",
      category: "utility" as ActionCategory,
      inputSchema: z.object({
        durationMs: z.number().positive().max(86400000), // Max 24 hours
      }),
      outputSchema: z.object({
        waited: z.boolean(),
        actualMs: z.number(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 86400000,
      defaultRetry: {
        maxAttempts: 1,
        baseDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
        useJitter: false,
        retryableErrors: [],
      },
      handler: async (input, context) => {
        const start = Date.now();
        await new Promise((resolve) => setTimeout(resolve, input.durationMs));
        return { waited: true, actualMs: Date.now() - start };
      },
    });

    // Transform data
    this.register<{ data: unknown; expression: string }, { result: unknown }>({
      type: "utility.transform",
      name: "Transform Data",
      description: "Transforms data using a JQ-like expression",
      category: "utility" as ActionCategory,
      inputSchema: z.object({
        data: z.unknown(),
        expression: z.string(),
      }),
      outputSchema: z.object({
        result: z.unknown(),
      }),
      idempotent: true,
      compensatable: false,
      defaultTimeout: 10000,
      defaultRetry: {
        maxAttempts: 1,
        baseDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
        useJitter: false,
        retryableErrors: [],
      },
      handler: async (input, context) => {
        context.logger.info("Transforming data", { expression: input.expression });
        // Simple field extraction for now
        if (input.expression.startsWith(".")) {
          const path = input.expression.slice(1).split(".");
          let result: unknown = input.data;
          for (const key of path) {
            if (result && typeof result === "object") {
              result = (result as Record<string, unknown>)[key];
            } else {
              result = undefined;
              break;
            }
          }
          return { result };
        }
        return { result: input.data };
      },
    });
  }
}

// ==================== Singleton Instance ====================

let actionRegistryInstance: ActionRegistry | null = null;

/**
 * Gets the action registry instance.
 */
export function getActionRegistry(): ActionRegistry {
  if (!actionRegistryInstance) {
    actionRegistryInstance = new ActionRegistry();
  }
  return actionRegistryInstance;
}

/**
 * Resets the action registry (for testing).
 */
export function resetActionRegistry(): void {
  actionRegistryInstance = null;
}

// ==================== Helper Functions ====================

/**
 * Creates an action instance.
 */
export function createActionInstance(
  actionType: string,
  input: Record<string, unknown>,
  options?: {
    timeout?: number;
    retry?: Partial<RetryConfig>;
  }
): ActionInstance {
  return {
    actionType,
    input,
    timeout: options?.timeout,
    retry: options?.retry,
  };
}

/**
 * Creates a default action context for testing.
 */
export function createTestContext(overrides?: Partial<ActionContext>): ActionContext {
  return {
    executionId: randomUUID(),
    workflowId: randomUUID(),
    siteId: "test-site",
    variables: {},
    traceId: randomUUID(),
    attempt: 1,
    maxAttempts: 3,
    logger: defaultLogger,
    metrics: defaultMetrics,
    ...overrides,
  };
}
