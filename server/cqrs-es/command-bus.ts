/**
 * @file command-bus.ts
 * @description Command Bus implementation for CQRS pattern.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Command routing to handlers
 * - Validation pipeline
 * - Authorization checks
 * - Retry with exponential backoff
 * - Saga orchestration integration
 * - Dead letter queue for failed commands
 * - Metrics and tracing
 *
 * Inspired by:
 * - Axon Framework command bus
 * - MediatR pattern
 * - Temporal.io workflow execution
 */

import { randomUUID } from "crypto";
import type {
  Command,
  CommandMetadata,
  CommandResult,
  CommandError,
  Event,
} from "./types";
import { getEventStore, type IEventStore } from "./event-store";
import { createModuleLogger, getCorrelationId } from "../logger";

const log = createModuleLogger("command-bus");

// ==================== Command Handler Interface ====================

/**
 * Command handler function type.
 */
export type CommandHandler<TPayload = unknown, TResult = unknown> = (
  command: Command<TPayload>,
  context: CommandContext
) => Promise<CommandResult<TResult>>;

/**
 * Context provided to command handlers.
 */
export interface CommandContext {
  /** Event store for persisting events */
  eventStore: IEventStore;
  /** Correlation ID for tracing */
  correlationId: string;
  /** User context */
  user?: UserContext;
  /** Metrics recording */
  recordMetric: (name: string, value: number, labels?: Record<string, string>) => void;
}

/**
 * User context for authorization.
 */
export interface UserContext {
  userId: string;
  roles: string[];
  permissions: string[];
}

// ==================== Validation & Authorization ====================

/**
 * Validator function type.
 */
export type CommandValidator<T> = (
  command: Command<T>
) => ValidationResult;

/**
 * Validation result.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error detail.
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

/**
 * Authorization policy function type.
 */
export type AuthorizationPolicy<T> = (
  command: Command<T>,
  user?: UserContext
) => Promise<AuthorizationResult>;

/**
 * Authorization result.
 */
export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
}

// ==================== Middleware ====================

/**
 * Command middleware function type.
 */
export type CommandMiddleware = (
  command: Command,
  context: CommandContext,
  next: () => Promise<CommandResult>
) => Promise<CommandResult>;

// ==================== Command Bus Configuration ====================

/**
 * Command bus configuration.
 */
export interface CommandBusConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay cap (ms) */
  maxDelayMs: number;
  /** Command execution timeout (ms) */
  timeoutMs: number;
  /** Enable dead letter queue */
  enableDeadLetter: boolean;
  /** Maximum dead letter queue size */
  maxDeadLetterSize: number;
}

const DEFAULT_CONFIG: CommandBusConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  timeoutMs: 30000,
  enableDeadLetter: true,
  maxDeadLetterSize: 1000,
};

// ==================== Dead Letter Entry ====================

interface DeadLetterEntry {
  command: Command;
  error: CommandError;
  attempts: number;
  failedAt: Date;
  lastError: string;
}

// ==================== Command Bus Implementation ====================

/**
 * Command bus for routing and executing commands.
 */
export class CommandBus {
  private handlers: Map<string, CommandHandler> = new Map();
  private validators: Map<string, CommandValidator<unknown>[]> = new Map();
  private policies: Map<string, AuthorizationPolicy<unknown>[]> = new Map();
  private middleware: CommandMiddleware[] = [];
  private deadLetterQueue: DeadLetterEntry[] = [];
  private config: CommandBusConfig;
  private eventStore: IEventStore;
  private metricsCallback?: (name: string, value: number, labels?: Record<string, string>) => void;

  constructor(config: Partial<CommandBusConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventStore = getEventStore();
  }

  /**
   * Registers a command handler.
   */
  registerHandler<TPayload, TResult>(
    commandType: string,
    handler: CommandHandler<TPayload, TResult>
  ): void {
    if (this.handlers.has(commandType)) {
      log.warn({ commandType }, "Overwriting existing command handler");
    }
    this.handlers.set(commandType, handler as CommandHandler);
    log.debug({ commandType }, "Command handler registered");
  }

  /**
   * Registers a command validator.
   */
  registerValidator<TPayload>(
    commandType: string,
    validator: CommandValidator<TPayload>
  ): void {
    const validators = this.validators.get(commandType) || [];
    validators.push(validator as CommandValidator<unknown>);
    this.validators.set(commandType, validators);
    log.debug({ commandType, validatorCount: validators.length }, "Validator registered");
  }

  /**
   * Registers an authorization policy.
   */
  registerPolicy<TPayload>(
    commandType: string,
    policy: AuthorizationPolicy<TPayload>
  ): void {
    const policies = this.policies.get(commandType) || [];
    policies.push(policy as AuthorizationPolicy<unknown>);
    this.policies.set(commandType, policies);
    log.debug({ commandType, policyCount: policies.length }, "Policy registered");
  }

  /**
   * Adds middleware to the command pipeline.
   */
  use(middleware: CommandMiddleware): void {
    this.middleware.push(middleware);
    log.debug({ middlewareCount: this.middleware.length }, "Middleware added");
  }

  /**
   * Sets the metrics callback.
   */
  setMetricsCallback(
    callback: (name: string, value: number, labels?: Record<string, string>) => void
  ): void {
    this.metricsCallback = callback;
  }

  /**
   * Sends a command for execution.
   */
  async send<TPayload, TResult = unknown>(
    command: Command<TPayload>,
    user?: UserContext
  ): Promise<CommandResult<TResult>> {
    const startTime = Date.now();
    const correlationId = command.metadata.correlationId || getCorrelationId() || randomUUID();

    log.debug(
      {
        commandId: command.id,
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        correlationId,
      },
      "Processing command"
    );

    try {
      // Validate command
      const validationResult = await this.validate(command);
      if (!validationResult.valid) {
        return this.createErrorResult(command, {
          code: "VALIDATION_ERROR",
          message: "Command validation failed",
          details: { errors: validationResult.errors },
          retriable: false,
        });
      }

      // Authorize command
      const authResult = await this.authorize(command, user);
      if (!authResult.authorized) {
        return this.createErrorResult(command, {
          code: "AUTHORIZATION_ERROR",
          message: authResult.reason || "Unauthorized",
          retriable: false,
        });
      }

      // Create context
      const context: CommandContext = {
        eventStore: this.eventStore,
        correlationId,
        user,
        recordMetric: (name, value, labels) => {
          this.metricsCallback?.(name, value, labels);
        },
      };

      // Execute with retry logic
      const result = await this.executeWithRetry<TPayload, TResult>(
        command,
        context
      );

      // Record metrics
      const duration = Date.now() - startTime;
      this.recordMetrics(command.commandType, duration, result.success);

      return result;
    } catch (error) {
      const err = error as Error;
      log.error(
        {
          commandId: command.id,
          commandType: command.commandType,
          error: err.message,
        },
        "Command execution failed"
      );

      const result = this.createErrorResult<TResult>(command, {
        code: "EXECUTION_ERROR",
        message: err.message,
        retriable: true,
      });

      // Add to dead letter queue if enabled
      if (this.config.enableDeadLetter) {
        this.addToDeadLetter(command, result.error!);
      }

      return result;
    }
  }

  /**
   * Validates a command using registered validators.
   */
  private async validate<TPayload>(
    command: Command<TPayload>
  ): Promise<ValidationResult> {
    const validators = this.validators.get(command.commandType) || [];
    const errors: ValidationError[] = [];

    for (const validator of validators) {
      const result = validator(command);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Authorizes a command using registered policies.
   */
  private async authorize<TPayload>(
    command: Command<TPayload>,
    user?: UserContext
  ): Promise<AuthorizationResult> {
    const policies = this.policies.get(command.commandType) || [];

    // If no policies, allow by default
    if (policies.length === 0) {
      return { authorized: true };
    }

    for (const policy of policies) {
      const result = await policy(command, user);
      if (!result.authorized) {
        return result;
      }
    }

    return { authorized: true };
  }

  /**
   * Executes command with retry logic.
   */
  private async executeWithRetry<TPayload, TResult>(
    command: Command<TPayload>,
    context: CommandContext
  ): Promise<CommandResult<TResult>> {
    const maxAttempts = command.metadata.maxAttempts || this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Update attempt number
        command.metadata.attempt = attempt;

        // Execute through middleware chain
        const result = await this.executeWithMiddleware<TPayload, TResult>(
          command,
          context
        );

        if (result.success || !result.error?.retriable) {
          return result;
        }

        lastError = new Error(result.error.message);
      } catch (error) {
        lastError = error as Error;
      }

      // Don't retry on last attempt
      if (attempt < maxAttempts) {
        const delay = this.calculateBackoff(attempt);
        log.debug(
          {
            commandId: command.id,
            attempt,
            delay,
            error: lastError?.message,
          },
          "Retrying command"
        );
        await this.sleep(delay);
      }
    }

    throw lastError || new Error("Command execution failed");
  }

  /**
   * Executes command through middleware chain.
   */
  private async executeWithMiddleware<TPayload, TResult>(
    command: Command<TPayload>,
    context: CommandContext
  ): Promise<CommandResult<TResult>> {
    // Build middleware chain
    let index = 0;

    const next = async (): Promise<CommandResult> => {
      if (index < this.middleware.length) {
        const mw = this.middleware[index++];
        return mw(command as Command, context, next);
      }
      return this.executeHandler<TPayload, TResult>(command, context);
    };

    return next() as Promise<CommandResult<TResult>>;
  }

  /**
   * Executes the command handler.
   */
  private async executeHandler<TPayload, TResult>(
    command: Command<TPayload>,
    context: CommandContext
  ): Promise<CommandResult<TResult>> {
    const handler = this.handlers.get(command.commandType);

    if (!handler) {
      return this.createErrorResult(command, {
        code: "HANDLER_NOT_FOUND",
        message: `No handler registered for command type: ${command.commandType}`,
        retriable: false,
      });
    }

    // Execute with timeout
    const timeoutPromise = new Promise<CommandResult<TResult>>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command execution timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });

    const executionPromise = handler(command, context) as Promise<CommandResult<TResult>>;

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Calculates exponential backoff delay.
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
    // Add jitter (10-20% random)
    const jitter = delay * (0.1 + Math.random() * 0.1);
    return Math.min(delay + jitter, this.config.maxDelayMs);
  }

  /**
   * Creates an error result.
   */
  private createErrorResult<TResult>(
    command: Command,
    error: CommandError
  ): CommandResult<TResult> {
    return {
      success: false,
      commandId: command.id,
      aggregateId: command.aggregateId,
      error,
    };
  }

  /**
   * Adds a failed command to the dead letter queue.
   */
  private addToDeadLetter(command: Command, error: CommandError): void {
    if (this.deadLetterQueue.length >= this.config.maxDeadLetterSize) {
      // Remove oldest entry
      this.deadLetterQueue.shift();
    }

    this.deadLetterQueue.push({
      command,
      error,
      attempts: command.metadata.attempt,
      failedAt: new Date(),
      lastError: error.message,
    });

    log.warn(
      {
        commandId: command.id,
        commandType: command.commandType,
        error: error.message,
        deadLetterSize: this.deadLetterQueue.length,
      },
      "Command added to dead letter queue"
    );
  }

  /**
   * Records command metrics.
   */
  private recordMetrics(commandType: string, duration: number, success: boolean): void {
    this.metricsCallback?.("command_duration_ms", duration, {
      command_type: commandType,
      success: String(success),
    });
    this.metricsCallback?.("command_total", 1, {
      command_type: commandType,
      success: String(success),
    });
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== Dead Letter Queue Operations ====================

  /**
   * Gets dead letter queue entries.
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retries a command from the dead letter queue.
   */
  async retryDeadLetter(commandId: string, user?: UserContext): Promise<CommandResult | null> {
    const index = this.deadLetterQueue.findIndex((e) => e.command.id === commandId);
    if (index === -1) {
      return null;
    }

    const entry = this.deadLetterQueue[index];
    this.deadLetterQueue.splice(index, 1);

    // Reset attempt counter
    entry.command.metadata.attempt = 0;

    return this.send(entry.command, user);
  }

  /**
   * Clears the dead letter queue.
   */
  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    return count;
  }

  // ==================== Utility Methods ====================

  /**
   * Gets command bus statistics.
   */
  getStats(): {
    handlerCount: number;
    middlewareCount: number;
    deadLetterCount: number;
  } {
    return {
      handlerCount: this.handlers.size,
      middlewareCount: this.middleware.length,
      deadLetterCount: this.deadLetterQueue.length,
    };
  }
}

// ==================== Command Builder ====================

/**
 * Builder for creating commands with proper metadata.
 */
export class CommandBuilder<TPayload> {
  private _aggregateId: string = "";
  private _commandType: string = "";
  private _payload?: TPayload;
  private _metadata: Partial<CommandMetadata> = {};

  static create<T>(): CommandBuilder<T> {
    return new CommandBuilder<T>();
  }

  forAggregate(aggregateId: string): this {
    this._aggregateId = aggregateId;
    return this;
  }

  ofType(commandType: string): this {
    this._commandType = commandType;
    return this;
  }

  withPayload(payload: TPayload): this {
    this._payload = payload;
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

  withExpectedVersion(version: number): this {
    this._metadata.expectedVersion = version;
    return this;
  }

  withPriority(priority: number): this {
    this._metadata.priority = priority;
    return this;
  }

  forSaga(sagaId: string): this {
    this._metadata.sagaId = sagaId;
    return this;
  }

  asCompensation(): this {
    this._metadata.isCompensation = true;
    return this;
  }

  withDeadline(deadline: Date): this {
    this._metadata.deadline = deadline;
    return this;
  }

  build(): Command<TPayload> {
    if (!this._aggregateId) {
      throw new Error("Aggregate ID is required");
    }
    if (!this._commandType) {
      throw new Error("Command type is required");
    }

    return {
      id: randomUUID(),
      aggregateId: this._aggregateId,
      commandType: this._commandType,
      payload: this._payload as TPayload,
      metadata: {
        correlationId: this._metadata.correlationId || randomUUID(),
        userId: this._metadata.userId,
        expectedVersion: this._metadata.expectedVersion,
        priority: this._metadata.priority ?? 5,
        attempt: 0,
        maxAttempts: 3,
        isCompensation: this._metadata.isCompensation ?? false,
        sagaId: this._metadata.sagaId,
        deadline: this._metadata.deadline,
      },
      timestamp: new Date(),
    };
  }
}

// ==================== Standard Middleware ====================

/**
 * Logging middleware.
 */
export const loggingMiddleware: CommandMiddleware = async (command, context, next) => {
  const startTime = Date.now();
  log.info(
    {
      commandId: command.id,
      commandType: command.commandType,
      aggregateId: command.aggregateId,
      correlationId: context.correlationId,
    },
    "Command started"
  );

  try {
    const result = await next();

    log.info(
      {
        commandId: command.id,
        commandType: command.commandType,
        success: result.success,
        duration: Date.now() - startTime,
      },
      "Command completed"
    );

    return result;
  } catch (error) {
    log.error(
      {
        commandId: command.id,
        commandType: command.commandType,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      },
      "Command failed"
    );
    throw error;
  }
};

/**
 * Transaction ID middleware.
 */
export const transactionMiddleware: CommandMiddleware = async (command, context, next) => {
  // Add transaction ID to command metadata for event correlation
  const transactionId = randomUUID();
  (command.metadata as Record<string, unknown>).transactionId = transactionId;

  return next();
};

// ==================== Factory Function ====================

let commandBusInstance: CommandBus | null = null;

/**
 * Gets or creates the command bus instance.
 */
export function getCommandBus(config?: Partial<CommandBusConfig>): CommandBus {
  if (!commandBusInstance) {
    commandBusInstance = new CommandBus(config);
    commandBusInstance.use(loggingMiddleware);
    commandBusInstance.use(transactionMiddleware);
    log.info("Command bus initialized");
  }
  return commandBusInstance;
}

/**
 * Resets the command bus (for testing).
 */
export function resetCommandBus(): void {
  commandBusInstance = null;
}
