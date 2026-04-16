/**
 * @file index.ts
 * @description CQRS/Event Sourcing Module for RSES CMS Kernel.
 *
 * This is a CORE tier module that provides Command Query Responsibility
 * Segregation and Event Sourcing infrastructure. It wraps the CommandBus,
 * QueryBus, and EventStore subsystems and exposes them through the kernel's
 * module interface and DI container.
 *
 * @module modules/cqrs
 * @tier core
 * @phase Phase 9 - Industry-Leading Scalability
 * @created 2026-02-04
 *
 * @architecture
 * ```
 * +---------------------------------------------------------------------+
 * |                       CQRS MODULE                                    |
 * +---------------------------------------------------------------------+
 * |                                                                      |
 * |  +------------------+  +------------------+  +-----------------+    |
 * |  |  CommandBus      |  |  QueryBus        |  |  EventStore     |    |
 * |  |  - send          |  |  - query         |  |  - append       |    |
 * |  |  - registerHdlr  |  |  - subscribe     |  |  - readStream   |    |
 * |  |  - middleware     |  |  - projections   |  |  - snapshots    |    |
 * |  +------------------+  +------------------+  +-----------------+    |
 * |                                                                      |
 * |  Events Emitted:                                                     |
 * |  - cqrs:initialized  - Module ready                                 |
 * |  - cqrs:error         - Infrastructure error occurred               |
 * |                                                                      |
 * |  Services Registered:                                                |
 * |  - CommandBus         - Command routing and execution               |
 * |  - QueryBus           - Query routing, caching, projections         |
 * |  - EventStore         - Append-only event log                       |
 * |                                                                      |
 * +---------------------------------------------------------------------+
 * ```
 */

import { z } from "zod";
import type {
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
} from "../../kernel/types";
import { CommandBus, getCommandBus } from "../../cqrs-es/command-bus";
import { QueryBus, getQueryBus } from "../../cqrs-es/query-bus";
import { type IEventStore, getEventStore, InMemoryEventStore } from "../../cqrs-es/event-store";

// =============================================================================
// CQRS MODULE
// =============================================================================

/**
 * CQRS/Event Sourcing Module - Core tier infrastructure module.
 *
 * Provides the foundational CQRS and Event Sourcing services that other
 * modules depend on for command handling, query processing, and event
 * persistence. This module has no dependencies on other modules and should
 * be loaded early in the boot sequence.
 *
 * @example
 * ```typescript
 * // Other modules can resolve CQRS services from the DI container
 * const commandBus = container.resolve<CommandBus>("CommandBus");
 * const queryBus = container.resolve<QueryBus>("QueryBus");
 * const eventStore = container.resolve<IEventStore>("EventStore");
 *
 * // Send a command
 * const result = await commandBus.send(command, userContext);
 *
 * // Execute a query
 * const queryResult = await queryBus.query(query);
 *
 * // Append events directly
 * await eventStore.append(aggregateId, aggregateType, events);
 * ```
 */
export class CqrsModule implements IModule {
  public readonly manifest: ModuleManifest = {
    id: "cqrs",
    name: "CQRS/Event Sourcing",
    version: "1.0.0",
    description:
      "Core CQRS and Event Sourcing infrastructure providing CommandBus, QueryBus, and EventStore services",
    tier: "core",
    author: {
      name: "RSES Team",
      email: "team@rses.dev",
    },
    license: "MIT",
    dependencies: [], // No dependencies - this is a foundational module
    permissions: [
      {
        capability: "event:write",
        level: "elevated",
        reason: "Append events to the event store",
      },
      {
        capability: "event:read",
        level: "normal",
        reason: "Read event streams and projections",
      },
    ],
    configSchema: z.object({
      maxRetries: z.number().optional(),
      commandTimeoutMs: z.number().optional(),
      queryTimeoutMs: z.number().optional(),
      cacheTtlMs: z.number().optional(),
      enableDeadLetter: z.boolean().optional(),
    }),
    exports: ["CommandBus", "QueryBus", "EventStore"],
    events: {
      emits: ["cqrs:initialized", "cqrs:error"],
      listens: [],
    },
    tags: ["cqrs", "event-sourcing", "infrastructure", "core"],
  };

  private context: ModuleContext | null = null;
  private commandBus: CommandBus | null = null;
  private queryBus: QueryBus | null = null;
  private eventStore: IEventStore | null = null;

  /**
   * Initialize the CQRS module.
   *
   * Creates or retrieves singleton instances of CommandBus, QueryBus, and
   * EventStore, then registers them in the DI container for other modules
   * to consume.
   */
  async initialize(context: ModuleContext): Promise<void> {
    this.context = context;
    const { logger, container, events, config } = context;

    logger.info("Initializing CQRS module");

    // Build configuration from module config, falling back to defaults
    const commandBusConfig: Record<string, unknown> = {};
    if (config.maxRetries !== undefined) {
      commandBusConfig.maxRetries = config.maxRetries;
    }
    if (config.commandTimeoutMs !== undefined) {
      commandBusConfig.timeoutMs = config.commandTimeoutMs;
    }
    if (config.enableDeadLetter !== undefined) {
      commandBusConfig.enableDeadLetter = config.enableDeadLetter;
    }

    const queryBusConfig: Record<string, unknown> = {};
    if (config.queryTimeoutMs !== undefined) {
      queryBusConfig.timeoutMs = config.queryTimeoutMs;
    }
    if (config.cacheTtlMs !== undefined) {
      queryBusConfig.defaultCacheTtlMs = config.cacheTtlMs;
    }

    // Create or retrieve singleton instances
    this.commandBus = getCommandBus(commandBusConfig);
    this.queryBus = getQueryBus(queryBusConfig);
    this.eventStore = getEventStore();

    // Register services in DI container so other modules can resolve them
    container.registerSingleton("CommandBus", this.commandBus, "cqrs");
    container.registerSingleton("QueryBus", this.queryBus, "cqrs");
    container.registerSingleton("EventStore", this.eventStore, "cqrs");

    // Emit initialization event
    await events.emit("cqrs:initialized", {
      commandBusStats: this.commandBus.getStats(),
      queryBusStats: this.queryBus.getStats(),
      eventStoreStats: (this.eventStore as InMemoryEventStore).getStats?.() ?? {},
      timestamp: new Date(),
    });

    logger.info("CQRS module initialized");
  }

  /**
   * Start the module.
   *
   * Starts query bus projections so read models stay up to date
   * with incoming events.
   */
  async start(): Promise<void> {
    if (this.queryBus) {
      this.queryBus.startProjections();
    }
    this.context?.logger.info("CQRS module started");
  }

  /**
   * Stop the module.
   *
   * Stops query bus projections to prevent further read model updates.
   */
  async stop(): Promise<void> {
    if (this.queryBus) {
      this.queryBus.stopProjections();
    }
    this.context?.logger.info("CQRS module stopped");
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this.commandBus = null;
    this.queryBus = null;
    this.eventStore = null;
    this.context = null;
  }

  /**
   * Health check for the CQRS module.
   *
   * Verifies that all three core services (CommandBus, QueryBus, EventStore)
   * are initialized and operational. Reports aggregate stats as metrics.
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.commandBus || !this.queryBus || !this.eventStore) {
        return {
          status: "unhealthy",
          message: "One or more CQRS services not initialized",
        };
      }

      // Gather stats from each subsystem for the health report
      const commandBusStats = this.commandBus.getStats();
      const queryBusStats = this.queryBus.getStats();
      const eventStoreStats = (this.eventStore as InMemoryEventStore).getStats?.() ?? {};

      return {
        status: "healthy",
        message: "CQRS module operational",
        metrics: {
          commandBus: commandBusStats,
          queryBus: queryBusStats,
          eventStore: eventStoreStats,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      };
    }
  }
}

// Default export for module auto-loading
export default CqrsModule;
