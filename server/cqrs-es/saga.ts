/**
 * @file saga.ts
 * @description Saga pattern implementation for distributed transactions.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Orchestration-based saga coordination
 * - Compensation for rollback
 * - State machine for saga lifecycle
 * - Timeout and retry handling
 * - Saga persistence for recovery
 * - Parallel step execution
 *
 * Inspired by:
 * - Temporal.io workflow orchestration
 * - Axon Framework saga management
 * - AWS Step Functions state machines
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  SagaInstance,
  SagaState,
  SagaStep,
  SagaStepResult,
  Command,
  CommandResult,
} from "./types";
import { getCommandBus, CommandBuilder, type CommandBus } from "./command-bus";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("saga");

// ==================== Saga Definition ====================

/**
 * Saga definition for reusable saga templates.
 */
export interface SagaDefinition<TContext = unknown> {
  /** Saga type name */
  type: string;
  /** Initial context factory */
  initialContext: () => TContext;
  /** Step definitions */
  steps: SagaStepDefinition<TContext>[];
  /** Timeout for entire saga (ms) */
  timeout: number;
  /** Whether to run steps in parallel when possible */
  parallelExecution?: boolean;
}

/**
 * Step definition within a saga.
 */
export interface SagaStepDefinition<TContext = unknown> {
  /** Step name */
  name: string;
  /** Dependencies on other steps (must complete first) */
  dependsOn?: string[];
  /** Create command from context */
  createCommand: (context: TContext) => Command;
  /** Create compensation command */
  createCompensation?: (context: TContext, result: CommandResult) => Command;
  /** Update context after step completion */
  onComplete?: (context: TContext, result: CommandResult) => TContext;
  /** Step timeout (ms) */
  timeout?: number;
  /** Whether step can be retried */
  retryable?: boolean;
  /** Max retries for this step */
  maxRetries?: number;
}

// ==================== Saga Instance Manager ====================

/**
 * Saga instance with execution state.
 */
interface SagaExecution<TContext = unknown> {
  instance: SagaInstance<TContext>;
  definition: SagaDefinition<TContext>;
  commandBus: CommandBus;
  emitter: EventEmitter;
  timeoutHandle?: NodeJS.Timeout;
  stepResults: Map<string, SagaStepResult>;
}

// ==================== Saga Orchestrator ====================

/**
 * Saga orchestrator for managing distributed transactions.
 */
export class SagaOrchestrator {
  private definitions: Map<string, SagaDefinition> = new Map();
  private executions: Map<string, SagaExecution> = new Map();
  private commandBus: CommandBus;
  private persistenceEnabled: boolean = false;
  private sagaStore: SagaStore;

  constructor(commandBus?: CommandBus) {
    this.commandBus = commandBus || getCommandBus();
    this.sagaStore = new InMemorySagaStore();
  }

  /**
   * Registers a saga definition.
   */
  registerSaga<TContext>(definition: SagaDefinition<TContext>): void {
    this.definitions.set(definition.type, definition as SagaDefinition);
    log.debug(
      { sagaType: definition.type, stepCount: definition.steps.length },
      "Saga definition registered"
    );
  }

  /**
   * Starts a new saga instance.
   */
  async startSaga<TContext>(
    sagaType: string,
    initialContext?: Partial<TContext>
  ): Promise<SagaInstance<TContext>> {
    const definition = this.definitions.get(sagaType) as SagaDefinition<TContext>;
    if (!definition) {
      throw new Error(`Saga definition not found: ${sagaType}`);
    }

    // Create instance
    const instance: SagaInstance<TContext> = {
      id: randomUUID(),
      sagaType,
      state: SagaState.PENDING,
      currentStep: 0,
      completedSteps: [],
      context: { ...definition.initialContext(), ...initialContext } as TContext,
      history: [],
      startedAt: new Date(),
    };

    // Create execution
    const execution: SagaExecution<TContext> = {
      instance,
      definition,
      commandBus: this.commandBus,
      emitter: new EventEmitter(),
      stepResults: new Map(),
    };

    this.executions.set(instance.id, execution as SagaExecution);

    // Save to store
    await this.sagaStore.save(instance as SagaInstance);

    log.info(
      { sagaId: instance.id, sagaType, stepCount: definition.steps.length },
      "Saga started"
    );

    // Start execution
    this.executeSaga(execution);

    return instance;
  }

  /**
   * Executes a saga through its steps.
   */
  private async executeSaga<TContext>(execution: SagaExecution<TContext>): Promise<void> {
    const { instance, definition } = execution;

    try {
      // Set timeout
      if (definition.timeout) {
        execution.timeoutHandle = setTimeout(() => {
          this.handleTimeout(execution);
        }, definition.timeout);
      }

      // Update state
      instance.state = SagaState.RUNNING;
      await this.sagaStore.save(instance as SagaInstance);

      // Execute steps
      if (definition.parallelExecution) {
        await this.executeStepsParallel(execution);
      } else {
        await this.executeStepsSequential(execution);
      }

      // Complete saga
      instance.state = SagaState.COMPLETED;
      instance.completedAt = new Date();
      await this.sagaStore.save(instance as SagaInstance);

      log.info(
        {
          sagaId: instance.id,
          duration: instance.completedAt.getTime() - instance.startedAt.getTime(),
        },
        "Saga completed successfully"
      );
    } catch (error) {
      await this.handleFailure(execution, error as Error);
    } finally {
      // Clear timeout
      if (execution.timeoutHandle) {
        clearTimeout(execution.timeoutHandle);
      }
    }
  }

  /**
   * Executes steps sequentially.
   */
  private async executeStepsSequential<TContext>(
    execution: SagaExecution<TContext>
  ): Promise<void> {
    const { instance, definition } = execution;

    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i];
      instance.currentStep = i;

      const result = await this.executeStep(execution, step);

      if (!result.success) {
        throw new Error(`Step ${step.name} failed: ${result.error}`);
      }

      instance.completedSteps.push(step.name);
      await this.sagaStore.save(instance as SagaInstance);
    }
  }

  /**
   * Executes steps in parallel when dependencies allow.
   */
  private async executeStepsParallel<TContext>(
    execution: SagaExecution<TContext>
  ): Promise<void> {
    const { instance, definition } = execution;
    const pending = new Set(definition.steps.map((s) => s.name));
    const completed = new Set<string>();

    while (pending.size > 0) {
      // Find steps that can be executed (dependencies satisfied)
      const readySteps = definition.steps.filter((step) => {
        if (!pending.has(step.name)) return false;
        if (!step.dependsOn) return true;
        return step.dependsOn.every((dep) => completed.has(dep));
      });

      if (readySteps.length === 0 && pending.size > 0) {
        throw new Error("Circular dependency detected in saga steps");
      }

      // Execute ready steps in parallel
      const results = await Promise.all(
        readySteps.map((step) => this.executeStep(execution, step))
      );

      // Check results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const step = readySteps[i];

        if (!result.success) {
          throw new Error(`Step ${step.name} failed: ${result.error}`);
        }

        pending.delete(step.name);
        completed.add(step.name);
        instance.completedSteps.push(step.name);
      }

      await this.sagaStore.save(instance as SagaInstance);
    }
  }

  /**
   * Executes a single saga step.
   */
  private async executeStep<TContext>(
    execution: SagaExecution<TContext>,
    step: SagaStepDefinition<TContext>
  ): Promise<SagaStepResult> {
    const { instance, commandBus } = execution;
    const startedAt = new Date();

    log.debug(
      { sagaId: instance.id, step: step.name },
      "Executing saga step"
    );

    try {
      // Create and execute command
      const command = step.createCommand(instance.context);

      // Add saga ID to command metadata
      (command.metadata as Record<string, unknown>).sagaId = instance.id;

      const commandResult = await commandBus.send(command);

      // Record result
      const stepResult: SagaStepResult = {
        stepName: step.name,
        success: commandResult.success,
        startedAt,
        completedAt: new Date(),
        commandResult,
        error: commandResult.error?.message,
      };

      instance.history.push(stepResult);
      execution.stepResults.set(step.name, stepResult);

      // Update context if handler provided
      if (commandResult.success && step.onComplete) {
        instance.context = step.onComplete(instance.context, commandResult);
      }

      log.debug(
        {
          sagaId: instance.id,
          step: step.name,
          success: stepResult.success,
          duration: stepResult.completedAt.getTime() - stepResult.startedAt.getTime(),
        },
        "Saga step completed"
      );

      return stepResult;
    } catch (error) {
      const stepResult: SagaStepResult = {
        stepName: step.name,
        success: false,
        startedAt,
        completedAt: new Date(),
        error: (error as Error).message,
      };

      instance.history.push(stepResult);
      execution.stepResults.set(step.name, stepResult);

      return stepResult;
    }
  }

  /**
   * Handles saga failure and initiates compensation.
   */
  private async handleFailure<TContext>(
    execution: SagaExecution<TContext>,
    error: Error
  ): Promise<void> {
    const { instance, definition } = execution;

    log.warn(
      { sagaId: instance.id, error: error.message },
      "Saga failed, starting compensation"
    );

    instance.state = SagaState.COMPENSATING;
    instance.error = error.message;
    await this.sagaStore.save(instance as SagaInstance);

    try {
      // Compensate in reverse order
      const stepsToCompensate = [...instance.completedSteps].reverse();

      for (const stepName of stepsToCompensate) {
        const stepDef = definition.steps.find((s) => s.name === stepName);
        if (!stepDef?.createCompensation) continue;

        const stepResult = execution.stepResults.get(stepName);
        if (!stepResult?.commandResult) continue;

        try {
          const compensationCommand = stepDef.createCompensation(
            instance.context,
            stepResult.commandResult
          );

          // Mark as compensation command
          compensationCommand.metadata.isCompensation = true;
          (compensationCommand.metadata as Record<string, unknown>).sagaId = instance.id;

          const result = await execution.commandBus.send(compensationCommand);

          log.debug(
            {
              sagaId: instance.id,
              step: stepName,
              success: result.success,
            },
            "Compensation step completed"
          );
        } catch (compError) {
          log.error(
            {
              sagaId: instance.id,
              step: stepName,
              error: (compError as Error).message,
            },
            "Compensation step failed"
          );
        }
      }

      instance.state = SagaState.ABORTED;
      instance.completedAt = new Date();
      await this.sagaStore.save(instance as SagaInstance);

      log.info({ sagaId: instance.id }, "Saga compensation completed");
    } catch (compError) {
      instance.state = SagaState.FAILED;
      instance.completedAt = new Date();
      await this.sagaStore.save(instance as SagaInstance);

      log.error(
        { sagaId: instance.id, error: (compError as Error).message },
        "Saga compensation failed"
      );
    }
  }

  /**
   * Handles saga timeout.
   */
  private async handleTimeout<TContext>(execution: SagaExecution<TContext>): Promise<void> {
    const { instance } = execution;

    log.warn({ sagaId: instance.id }, "Saga timed out");

    const timeoutError = new Error(
      `Saga timed out after ${execution.definition.timeout}ms`
    );
    await this.handleFailure(execution, timeoutError);
  }

  /**
   * Gets a saga instance by ID.
   */
  async getSaga(sagaId: string): Promise<SagaInstance | null> {
    return this.sagaStore.get(sagaId);
  }

  /**
   * Gets sagas by state.
   */
  async getSagasByState(state: SagaState): Promise<SagaInstance[]> {
    return this.sagaStore.findByState(state);
  }

  /**
   * Retries a failed saga.
   */
  async retrySaga(sagaId: string): Promise<boolean> {
    const instance = await this.sagaStore.get(sagaId);
    if (!instance) return false;

    if (instance.state !== SagaState.FAILED && instance.state !== SagaState.ABORTED) {
      throw new Error(`Cannot retry saga in state: ${instance.state}`);
    }

    const definition = this.definitions.get(instance.sagaType);
    if (!definition) {
      throw new Error(`Saga definition not found: ${instance.sagaType}`);
    }

    // Reset state
    instance.state = SagaState.PENDING;
    instance.completedSteps = [];
    instance.currentStep = 0;
    instance.history = [];
    instance.error = undefined;
    instance.completedAt = undefined;

    // Create new execution
    const execution: SagaExecution = {
      instance,
      definition,
      commandBus: this.commandBus,
      emitter: new EventEmitter(),
      stepResults: new Map(),
    };

    this.executions.set(instance.id, execution);
    await this.sagaStore.save(instance);

    // Start execution
    this.executeSaga(execution);

    return true;
  }

  /**
   * Gets orchestrator statistics.
   */
  getStats(): {
    definitionCount: number;
    activeExecutions: number;
    pendingSagas: Promise<number>;
    runningSagas: Promise<number>;
    completedSagas: Promise<number>;
    failedSagas: Promise<number>;
  } {
    return {
      definitionCount: this.definitions.size,
      activeExecutions: this.executions.size,
      pendingSagas: this.sagaStore.countByState(SagaState.PENDING),
      runningSagas: this.sagaStore.countByState(SagaState.RUNNING),
      completedSagas: this.sagaStore.countByState(SagaState.COMPLETED),
      failedSagas: this.sagaStore.countByState(SagaState.FAILED),
    };
  }
}

// ==================== Saga Store ====================

/**
 * Saga persistence store interface.
 */
export interface SagaStore {
  save(saga: SagaInstance): Promise<void>;
  get(sagaId: string): Promise<SagaInstance | null>;
  findByState(state: SagaState): Promise<SagaInstance[]>;
  countByState(state: SagaState): Promise<number>;
  delete(sagaId: string): Promise<void>;
}

/**
 * In-memory saga store.
 */
export class InMemorySagaStore implements SagaStore {
  private sagas: Map<string, SagaInstance> = new Map();

  async save(saga: SagaInstance): Promise<void> {
    this.sagas.set(saga.id, saga);
  }

  async get(sagaId: string): Promise<SagaInstance | null> {
    return this.sagas.get(sagaId) ?? null;
  }

  async findByState(state: SagaState): Promise<SagaInstance[]> {
    return Array.from(this.sagas.values()).filter((s) => s.state === state);
  }

  async countByState(state: SagaState): Promise<number> {
    return (await this.findByState(state)).length;
  }

  async delete(sagaId: string): Promise<void> {
    this.sagas.delete(sagaId);
  }

  clear(): void {
    this.sagas.clear();
  }
}

// ==================== Saga Builder ====================

/**
 * Builder for creating saga definitions.
 */
export class SagaBuilder<TContext> {
  private _type: string = "";
  private _initialContext: () => TContext = () => ({} as TContext);
  private _steps: SagaStepDefinition<TContext>[] = [];
  private _timeout: number = 300000; // 5 minutes default
  private _parallelExecution: boolean = false;

  static create<T>(): SagaBuilder<T> {
    return new SagaBuilder<T>();
  }

  withType(type: string): this {
    this._type = type;
    return this;
  }

  withInitialContext(factory: () => TContext): this {
    this._initialContext = factory;
    return this;
  }

  addStep(step: SagaStepDefinition<TContext>): this {
    this._steps.push(step);
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this._timeout = timeoutMs;
    return this;
  }

  enableParallelExecution(): this {
    this._parallelExecution = true;
    return this;
  }

  build(): SagaDefinition<TContext> {
    if (!this._type) {
      throw new Error("Saga type is required");
    }
    if (this._steps.length === 0) {
      throw new Error("At least one step is required");
    }

    return {
      type: this._type,
      initialContext: this._initialContext,
      steps: this._steps,
      timeout: this._timeout,
      parallelExecution: this._parallelExecution,
    };
  }
}

// ==================== Factory Function ====================

let sagaOrchestratorInstance: SagaOrchestrator | null = null;

/**
 * Gets or creates the saga orchestrator instance.
 */
export function getSagaOrchestrator(commandBus?: CommandBus): SagaOrchestrator {
  if (!sagaOrchestratorInstance) {
    sagaOrchestratorInstance = new SagaOrchestrator(commandBus);
    log.info("Saga orchestrator initialized");
  }
  return sagaOrchestratorInstance;
}

/**
 * Resets the saga orchestrator (for testing).
 */
export function resetSagaOrchestrator(): void {
  sagaOrchestratorInstance = null;
}
