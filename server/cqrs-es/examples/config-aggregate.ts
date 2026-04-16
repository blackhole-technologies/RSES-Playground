/**
 * @file config-aggregate.ts
 * @description Example Config aggregate using event sourcing.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * This example shows how to implement the RSES Config domain
 * using event sourcing patterns.
 */

import {
  AggregateRoot,
  getEventStore,
  getCommandBus,
  getQueryBus,
  getSagaOrchestrator,
  CommandBuilder,
  QueryBuilder,
  SagaBuilder,
  type Event,
  type EventMetadata,
  type CommandHandler,
  type CommandContext,
  type QueryHandler,
  type QueryContext,
  type Projection,
} from "../index";

// ==================== Domain Events ====================

interface ConfigCreatedPayload {
  name: string;
  content: string;
  description?: string;
  userId?: string;
}

interface ConfigUpdatedPayload {
  content: string;
  description?: string;
}

interface ConfigValidatedPayload {
  valid: boolean;
  errors: Array<{ line: number; message: string; code: string }>;
  parsedRules?: number;
}

interface ConfigArchivedPayload {
  reason: string;
}

// ==================== Aggregate State ====================

interface ConfigState {
  name: string;
  content: string;
  description?: string;
  isValid: boolean;
  validationErrors: Array<{ line: number; message: string; code: string }>;
  parsedRules: number;
  isArchived: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== Config Aggregate ====================

/**
 * Config aggregate root implementing event sourcing.
 */
export class ConfigAggregate extends AggregateRoot<ConfigState> {
  constructor(id: string) {
    super(id, {
      name: "",
      content: "",
      isValid: false,
      validationErrors: [],
      parsedRules: 0,
      isArchived: false,
    });
  }

  /**
   * Creates a new config.
   */
  create(
    name: string,
    content: string,
    description: string | undefined,
    metadata: Omit<EventMetadata, "schemaVersion">
  ): void {
    if (this._version >= 0) {
      throw new Error("Config already exists");
    }

    this.raiseEvent<ConfigCreatedPayload>(
      "ConfigCreated",
      { name, content, description, userId: metadata.userId },
      metadata
    );
  }

  /**
   * Updates config content.
   */
  update(
    content: string,
    description: string | undefined,
    metadata: Omit<EventMetadata, "schemaVersion">
  ): void {
    if (this._version < 0) {
      throw new Error("Config does not exist");
    }
    if (this._state.isArchived) {
      throw new Error("Cannot update archived config");
    }

    this.raiseEvent<ConfigUpdatedPayload>(
      "ConfigUpdated",
      { content, description },
      metadata
    );
  }

  /**
   * Records validation result.
   */
  recordValidation(
    valid: boolean,
    errors: Array<{ line: number; message: string; code: string }>,
    parsedRules: number | undefined,
    metadata: Omit<EventMetadata, "schemaVersion">
  ): void {
    if (this._version < 0) {
      throw new Error("Config does not exist");
    }

    this.raiseEvent<ConfigValidatedPayload>(
      "ConfigValidated",
      { valid, errors, parsedRules },
      metadata
    );
  }

  /**
   * Archives the config.
   */
  archive(
    reason: string,
    metadata: Omit<EventMetadata, "schemaVersion">
  ): void {
    if (this._version < 0) {
      throw new Error("Config does not exist");
    }
    if (this._state.isArchived) {
      throw new Error("Config is already archived");
    }

    this.raiseEvent<ConfigArchivedPayload>(
      "ConfigArchived",
      { reason },
      metadata
    );
  }

  /**
   * Applies events to update state.
   */
  protected applyEvent(event: Event): void {
    switch (event.eventType) {
      case "ConfigCreated": {
        const payload = event.payload as ConfigCreatedPayload;
        this._state = {
          ...this._state,
          name: payload.name,
          content: payload.content,
          description: payload.description,
          createdBy: payload.userId,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
        break;
      }

      case "ConfigUpdated": {
        const payload = event.payload as ConfigUpdatedPayload;
        this._state = {
          ...this._state,
          content: payload.content,
          description: payload.description ?? this._state.description,
          updatedAt: event.timestamp,
        };
        break;
      }

      case "ConfigValidated": {
        const payload = event.payload as ConfigValidatedPayload;
        this._state = {
          ...this._state,
          isValid: payload.valid,
          validationErrors: payload.errors,
          parsedRules: payload.parsedRules ?? 0,
        };
        break;
      }

      case "ConfigArchived": {
        this._state = {
          ...this._state,
          isArchived: true,
        };
        break;
      }
    }
  }
}

// ==================== Command Handlers ====================

interface CreateConfigCommand {
  name: string;
  content: string;
  description?: string;
}

interface UpdateConfigCommand {
  content: string;
  description?: string;
}

interface ValidateConfigCommand {
  // No payload - validates current content
}

interface ArchiveConfigCommand {
  reason: string;
}

/**
 * Handler for CreateConfig command.
 */
const createConfigHandler: CommandHandler<CreateConfigCommand> = async (
  command,
  context
) => {
  const aggregate = new ConfigAggregate(command.aggregateId);

  try {
    aggregate.create(
      command.payload.name,
      command.payload.content,
      command.payload.description,
      {
        correlationId: context.correlationId,
        causationId: command.id,
        source: "config-service",
        userId: context.user?.userId,
      }
    );

    // Persist events
    const events = await context.eventStore.append(
      command.aggregateId,
      "Config",
      aggregate.uncommittedEvents
    );

    aggregate.clearUncommittedEvents();

    return {
      success: true,
      commandId: command.id,
      aggregateId: command.aggregateId,
      newVersion: aggregate.version,
      events,
      data: { configId: command.aggregateId },
    };
  } catch (error) {
    return {
      success: false,
      commandId: command.id,
      aggregateId: command.aggregateId,
      error: {
        code: "CREATE_FAILED",
        message: (error as Error).message,
        retriable: false,
      },
    };
  }
};

/**
 * Handler for UpdateConfig command.
 */
const updateConfigHandler: CommandHandler<UpdateConfigCommand> = async (
  command,
  context
) => {
  // Load aggregate from history
  const existingEvents = await context.eventStore.readStream(command.aggregateId);
  const aggregate = new ConfigAggregate(command.aggregateId);
  aggregate.loadFromHistory(existingEvents);

  try {
    aggregate.update(
      command.payload.content,
      command.payload.description,
      {
        correlationId: context.correlationId,
        causationId: command.id,
        source: "config-service",
        userId: context.user?.userId,
      }
    );

    // Persist with optimistic concurrency
    const events = await context.eventStore.append(
      command.aggregateId,
      "Config",
      aggregate.uncommittedEvents,
      { expectedVersion: command.metadata.expectedVersion }
    );

    aggregate.clearUncommittedEvents();

    return {
      success: true,
      commandId: command.id,
      aggregateId: command.aggregateId,
      newVersion: aggregate.version,
      events,
    };
  } catch (error) {
    return {
      success: false,
      commandId: command.id,
      aggregateId: command.aggregateId,
      error: {
        code: "UPDATE_FAILED",
        message: (error as Error).message,
        retriable: (error as Error).name === "ConcurrencyError",
      },
    };
  }
};

// ==================== Read Model / Projection ====================

interface ConfigReadModel {
  id: string;
  name: string;
  content: string;
  description?: string;
  isValid: boolean;
  errorCount: number;
  ruleCount: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Projection that builds the config read model.
 */
export const configProjection: Projection<ConfigReadModel> = {
  name: "ConfigProjection",
  handles: ["ConfigCreated", "ConfigUpdated", "ConfigValidated", "ConfigArchived"],

  init(): ConfigReadModel {
    return {
      id: "",
      name: "",
      content: "",
      isValid: false,
      errorCount: 0,
      ruleCount: 0,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  apply(state: ConfigReadModel, event: Event): ConfigReadModel {
    switch (event.eventType) {
      case "ConfigCreated": {
        const payload = event.payload as ConfigCreatedPayload;
        return {
          ...state,
          id: event.aggregateId,
          name: payload.name,
          content: payload.content,
          description: payload.description,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
      }

      case "ConfigUpdated": {
        const payload = event.payload as ConfigUpdatedPayload;
        return {
          ...state,
          content: payload.content,
          description: payload.description ?? state.description,
          updatedAt: event.timestamp,
        };
      }

      case "ConfigValidated": {
        const payload = event.payload as ConfigValidatedPayload;
        return {
          ...state,
          isValid: payload.valid,
          errorCount: payload.errors.length,
          ruleCount: payload.parsedRules ?? 0,
        };
      }

      case "ConfigArchived":
        return {
          ...state,
          isArchived: true,
        };

      default:
        return state;
    }
  },

  getReadModelType(): string {
    return "Config";
  },
};

// ==================== Query Handlers ====================

interface GetConfigByIdParams {
  id: string;
}

interface ListConfigsParams {
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Handler for GetConfigById query.
 */
const getConfigByIdHandler: QueryHandler<GetConfigByIdParams, ConfigReadModel | null> = async (
  query,
  context
) => {
  const entry = await context.readModel.get<ConfigReadModel>("Config", query.params.id);

  return {
    success: true,
    queryId: query.id,
    data: entry?.data ?? null,
    metadata: {
      timestamp: new Date(),
      staleness: entry ? Date.now() - entry.lastUpdated.getTime() : 0,
      fromCache: false,
    },
  };
};

/**
 * Handler for ListConfigs query.
 */
const listConfigsHandler: QueryHandler<ListConfigsParams, ConfigReadModel[]> = async (
  query,
  context
) => {
  const filter = query.params.includeArchived
    ? undefined
    : { isArchived: false };

  const entries = await context.readModel.find<ConfigReadModel>("Config", filter);
  const configs = entries.map((e) => e.data);

  // Apply pagination
  const page = query.params.page ?? 1;
  const limit = query.params.limit ?? 50;
  const start = (page - 1) * limit;
  const paginated = configs.slice(start, start + limit);

  return {
    success: true,
    queryId: query.id,
    data: paginated,
    metadata: {
      timestamp: new Date(),
      staleness: 0,
      fromCache: false,
      totalCount: configs.length,
    },
  };
};

// ==================== Saga Example ====================

interface ConfigWorkflowContext {
  configId: string;
  content: string;
  validated: boolean;
  deployedTo?: string;
}

/**
 * Saga for config validation and deployment workflow.
 */
export const configDeploySaga = SagaBuilder.create<ConfigWorkflowContext>()
  .withType("ConfigDeploySaga")
  .withInitialContext(() => ({
    configId: "",
    content: "",
    validated: false,
  }))
  .addStep({
    name: "ValidateConfig",
    createCommand: (ctx) =>
      CommandBuilder.create<ValidateConfigCommand>()
        .forAggregate(ctx.configId)
        .ofType("ValidateConfig")
        .build(),
    onComplete: (ctx, result) => ({
      ...ctx,
      validated: result.success,
    }),
  })
  .addStep({
    name: "DeployConfig",
    dependsOn: ["ValidateConfig"],
    createCommand: (ctx) =>
      CommandBuilder.create()
        .forAggregate(ctx.configId)
        .ofType("DeployConfig")
        .withPayload({ environment: "production" })
        .build(),
    createCompensation: (ctx) =>
      CommandBuilder.create()
        .forAggregate(ctx.configId)
        .ofType("RollbackDeploy")
        .asCompensation()
        .build(),
    onComplete: (ctx, result) => ({
      ...ctx,
      // result.data is unknown by default; narrow to read environment.
      deployedTo: (result.data as { environment?: string } | undefined)?.environment,
    }),
  })
  .addStep({
    name: "NotifySuccess",
    dependsOn: ["DeployConfig"],
    createCommand: (ctx) =>
      CommandBuilder.create()
        .forAggregate(ctx.configId)
        .ofType("SendNotification")
        .withPayload({
          type: "config_deployed",
          configId: ctx.configId,
          environment: ctx.deployedTo,
        })
        .build(),
  })
  .withTimeout(60000)
  .build();

// ==================== Registration ====================

/**
 * Registers all config-related handlers with the CQRS infrastructure.
 */
export function registerConfigHandlers(): void {
  const commandBus = getCommandBus();
  const queryBus = getQueryBus();
  const sagaOrchestrator = getSagaOrchestrator();

  // Register command handlers
  commandBus.registerHandler("CreateConfig", createConfigHandler);
  commandBus.registerHandler("UpdateConfig", updateConfigHandler);

  // Register validators
  commandBus.registerValidator<CreateConfigCommand>("CreateConfig", (command) => {
    const errors = [];

    if (!command.payload.name || command.payload.name.trim().length === 0) {
      errors.push({
        field: "name",
        code: "REQUIRED",
        message: "Name is required",
      });
    }

    if (!command.payload.content) {
      errors.push({
        field: "content",
        code: "REQUIRED",
        message: "Content is required",
      });
    }

    return { valid: errors.length === 0, errors };
  });

  // Register query handlers
  queryBus.registerHandler("GetConfigById", getConfigByIdHandler);
  queryBus.registerHandler("ListConfigs", listConfigsHandler);

  // Register projection
  queryBus.registerProjection(configProjection);

  // Register saga
  sagaOrchestrator.registerSaga(configDeploySaga);

  console.log("Config handlers registered");
}

// ==================== Usage Example ====================

/**
 * Example of using the event-sourced config system.
 */
export async function exampleUsage(): Promise<void> {
  // Register handlers
  registerConfigHandlers();

  // Start projections
  const queryBus = getQueryBus();
  queryBus.startProjections();

  const commandBus = getCommandBus();

  // Create a new config
  const createCommand = CommandBuilder.create<CreateConfigCommand>()
    .forAggregate("config-001")
    .ofType("CreateConfig")
    .withPayload({
      name: "My RSES Config",
      content: `
@set("images")
  :match("**/*.{png,jpg,gif}")

@set("documents")
  :match("**/*.{pdf,docx}")
`,
      description: "Example config for images and documents",
    })
    .withCorrelationId("user-session-123")
    .build();

  const createResult = await commandBus.send(createCommand);
  console.log("Create result:", createResult);

  // Query the config
  const getQuery = QueryBuilder.create<GetConfigByIdParams>()
    .ofType("GetConfigById")
    .withParams({ id: "config-001" })
    .withConsistency("eventual")
    .build();

  const queryResult = await queryBus.query(getQuery);
  console.log("Query result:", queryResult);

  // Update the config
  const updateCommand = CommandBuilder.create<UpdateConfigCommand>()
    .forAggregate("config-001")
    .ofType("UpdateConfig")
    .withPayload({
      content: `
@set("images")
  :match("**/*.{png,jpg,gif,webp}")

@set("documents")
  :match("**/*.{pdf,docx,md}")
`,
    })
    .withExpectedVersion(0) // Optimistic concurrency
    .build();

  const updateResult = await commandBus.send(updateCommand);
  console.log("Update result:", updateResult);

  // Start a deployment saga
  const sagaOrchestrator = getSagaOrchestrator();
  const saga = await sagaOrchestrator.startSaga("ConfigDeploySaga", {
    configId: "config-001",
    content: "...",
    validated: false,
  });
  console.log("Saga started:", saga.id);
}
