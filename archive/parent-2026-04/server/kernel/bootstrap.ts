/**
 * @file bootstrap.ts
 * @description System Bootstrap for the RSES CMS Kernel.
 *
 * The bootstrap module is the entry point for initializing the entire CMS.
 * It orchestrates the startup sequence:
 *
 * 1. **Create Core Components** - Container, Event Bus, Registry, Gateway
 * 2. **Discover Modules** - Scan modules directory
 * 3. **Load Modules** - Initialize in dependency order
 * 4. **Start Services** - Begin processing requests
 *
 * ## Startup Sequence
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      BOOTSTRAP SEQUENCE                          │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  1. Create DI Container                                          │
 * │     └─ Register core services                                    │
 * │                                                                  │
 * │  2. Create Event Bus                                             │
 * │     └─ Register in container                                     │
 * │                                                                  │
 * │  3. Create Module Registry                                       │
 * │     └─ Register in container                                     │
 * │                                                                  │
 * │  4. Create API Gateway                                           │
 * │     └─ Mount on Express app                                      │
 * │                                                                  │
 * │  5. Discover Modules                                             │
 * │     └─ Scan modules directory                                    │
 * │     └─ Register each module                                      │
 * │                                                                  │
 * │  6. Load Enabled Modules                                         │
 * │     └─ Resolve dependencies                                      │
 * │     └─ Initialize in order                                       │
 * │     └─ Start services                                            │
 * │                                                                  │
 * │  7. Emit 'system:ready' event                                    │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Shutdown Sequence
 *
 * The bootstrap also provides a graceful shutdown handler:
 *
 * 1. Stop accepting new requests
 * 2. Wait for in-flight requests to complete
 * 3. Stop modules in reverse dependency order
 * 4. Dispose all resources
 * 5. Exit process
 *
 * @module kernel/bootstrap
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

import * as path from "path";
import { readdir, access } from "fs/promises";
import express, { Express } from "express";
import { createModuleLogger, correlationMiddleware, requestLoggingMiddleware } from "../logger";
import { createContainer } from "./container";
import { createEventBus } from "./events";
import { createModuleRegistry, REGISTRY_EVENTS } from "./registry";
import { createApiGateway, GATEWAY_EVENTS } from "./gateway";
import type {
  KernelConfig,
  BootstrapResult,
  IContainer,
  IEventBus,
  IModuleRegistry,
  IApiGateway,
  IModule,
} from "./types";

const log = createModuleLogger("kernel");

// =============================================================================
// SYSTEM EVENTS
// =============================================================================

/**
 * System-level events emitted by the kernel.
 */
export const SYSTEM_EVENTS = {
  /** System has finished initializing and is ready */
  READY: "system:ready",

  /** System is beginning shutdown */
  SHUTDOWN: "system:shutdown",

  /** System has completed shutdown */
  SHUTDOWN_COMPLETE: "system:shutdown-complete",

  /** A fatal error occurred */
  FATAL_ERROR: "system:fatal-error",

  /** Health check completed */
  HEALTH_CHECK: "system:health-check",
} as const;

// =============================================================================
// SERVICE TOKENS
// =============================================================================

/**
 * Well-known service tokens for DI container.
 *
 * @description These tokens are used to register and resolve
 * core kernel services. Modules can depend on these.
 *
 * @example
 * ```typescript
 * // In a module
 * const events = context.container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
 * const registry = context.container.resolve<IModuleRegistry>(SERVICE_TOKENS.ModuleRegistry);
 * ```
 */
export const SERVICE_TOKENS = {
  /** DI Container itself */
  Container: Symbol("Container"),

  /** Event Bus */
  EventBus: Symbol("EventBus"),

  /** Module Registry */
  ModuleRegistry: Symbol("ModuleRegistry"),

  /** API Gateway */
  ApiGateway: Symbol("ApiGateway"),

  /** Express App */
  ExpressApp: Symbol("ExpressApp"),

  /** Kernel Config */
  KernelConfig: Symbol("KernelConfig"),
} as const;

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default kernel configuration.
 */
const DEFAULT_CONFIG: Required<Omit<KernelConfig, "app">> = {
  modulesDir: "./modules",
  autoLoad: true,
  enabledModules: [],
  disabledModules: [],
  moduleConfigs: {},
  shutdownTimeout: 30000,
  healthCheckInterval: 30000,
};

// =============================================================================
// BOOTSTRAP FUNCTION
// =============================================================================

/**
 * Bootstrap the RSES CMS kernel.
 *
 * @description Initializes all core components and starts the system.
 * This is the main entry point for the CMS.
 *
 * ## What it does:
 *
 * 1. Creates the DI container
 * 2. Creates the event bus
 * 3. Creates the module registry
 * 4. Creates the API gateway
 * 5. Discovers and loads modules
 * 6. Sets up shutdown handlers
 *
 * ## Usage
 *
 * ```typescript
 * import { bootstrap } from "./kernel";
 *
 * async function main() {
 *   const kernel = await bootstrap({
 *     modulesDir: "./server/modules",
 *     autoLoad: true,
 *     moduleConfigs: {
 *       messaging: { maxChannels: 100 },
 *       ai: { provider: "openai" }
 *     }
 *   });
 *
 *   // Start HTTP server
 *   kernel.app.listen(3000, () => {
 *     console.log("Server running on port 3000");
 *   });
 *
 *   // Handle shutdown
 *   process.on("SIGTERM", kernel.shutdown);
 * }
 * ```
 *
 * @param config - Kernel configuration
 * @returns Bootstrap result with kernel components
 */
export async function bootstrap(
  config: Partial<KernelConfig> = {}
): Promise<BootstrapResult> {
  log.info("=== RSES CMS Kernel Bootstrap ===");
  const startTime = Date.now();

  // Merge with defaults
  const fullConfig: Required<KernelConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    app: config.app || express(),
  };

  // =========================================================================
  // STEP 1: Create Core Components
  // =========================================================================

  log.info("Step 1: Creating core components");

  // Create DI container
  const container = createContainer();
  log.debug("DI Container created");

  // Create event bus
  const events = createEventBus();
  log.debug("Event Bus created");

  // Create Express app
  const app = fullConfig.app;
  setupExpressApp(app);
  log.debug("Express app configured");

  // Create module registry
  const registry = createModuleRegistry(container, events, app);
  log.debug("Module Registry created");

  // Create API gateway
  const gateway = createApiGateway(events);
  log.debug("API Gateway created");

  // =========================================================================
  // STEP 2: Register Core Services in Container
  // =========================================================================

  log.info("Step 2: Registering core services");

  container.registerSingleton(SERVICE_TOKENS.Container, container, "kernel");
  container.registerSingleton(SERVICE_TOKENS.EventBus, events, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ModuleRegistry, registry, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ApiGateway, gateway, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ExpressApp, app, "kernel");
  container.registerSingleton(SERVICE_TOKENS.KernelConfig, fullConfig, "kernel");

  // Also register with string tokens for convenience
  container.registerSingleton("Container", container, "kernel");
  container.registerSingleton("EventBus", events, "kernel");
  container.registerSingleton("ModuleRegistry", registry, "kernel");
  container.registerSingleton("ApiGateway", gateway, "kernel");

  log.debug("Core services registered in container");

  // =========================================================================
  // STEP 3: Mount API Gateway
  // =========================================================================

  log.info("Step 3: Mounting API Gateway");

  app.use("/api", gateway.middleware());
  log.debug("API Gateway mounted at /api");

  // =========================================================================
  // STEP 4: Discover and Register Modules
  // =========================================================================

  log.info("Step 4: Discovering modules");

  const modulesDir = path.resolve(fullConfig.modulesDir);
  const modules = await discoverModules(modulesDir);

  for (const module of modules) {
    // Skip if in disabled list
    if (fullConfig.disabledModules.includes(module.manifest.id)) {
      log.info({ moduleId: module.manifest.id }, "Module disabled by config, skipping");
      continue;
    }

    try {
      registry.register(module);
    } catch (error) {
      log.error(
        { moduleId: module.manifest.id, error },
        "Failed to register module"
      );
    }
  }

  log.info({ count: registry.listModules().length }, "Modules registered");

  // =========================================================================
  // STEP 5: Load Enabled Modules
  // =========================================================================

  if (fullConfig.autoLoad) {
    log.info("Step 5: Loading enabled modules");

    // Determine which modules to load
    let modulesToLoad: string[];

    if (fullConfig.enabledModules.length > 0) {
      // Load only specified modules
      modulesToLoad = fullConfig.enabledModules;
    } else {
      // Load all registered modules
      modulesToLoad = registry.listModules().map((e) => e.module.manifest.id);
    }

    // Load each module
    for (const moduleId of modulesToLoad) {
      const moduleConfig = fullConfig.moduleConfigs[moduleId];

      const result = await registry.load(moduleId, {
        config: moduleConfig,
        autoStart: true,
        enabled: true,
      });

      if (!result.success) {
        log.error(
          { moduleId, error: result.error },
          "Failed to load module"
        );
      }
    }

    const runningCount = registry
      .listModules()
      .filter((e) => e.state === "running").length;

    log.info({ count: runningCount }, "Modules loaded and running");
  } else {
    log.info("Step 5: Auto-load disabled, modules not loaded");
  }

  // =========================================================================
  // STEP 6: Setup Health Checks
  // =========================================================================

  log.info("Step 6: Setting up health checks");

  let healthCheckInterval: NodeJS.Timeout | null = null;

  if (fullConfig.healthCheckInterval > 0) {
    healthCheckInterval = setInterval(async () => {
      const health = await registry.checkHealth();

      events.emit(SYSTEM_EVENTS.HEALTH_CHECK, {
        timestamp: new Date(),
        modules: Object.fromEntries(health),
      });
    }, fullConfig.healthCheckInterval);
  }

  // =========================================================================
  // STEP 7: Create Shutdown Handler
  // =========================================================================

  log.info("Step 7: Creating shutdown handler");

  const shutdown = createShutdownHandler(
    container,
    events,
    registry,
    gateway,
    healthCheckInterval,
    fullConfig.shutdownTimeout
  );

  // =========================================================================
  // STEP 8: Emit Ready Event
  // =========================================================================

  const bootTime = Date.now() - startTime;
  log.info({ bootTimeMs: bootTime }, "=== Kernel Bootstrap Complete ===");

  events.emit(SYSTEM_EVENTS.READY, {
    bootTimeMs: bootTime,
    modulesLoaded: registry.listModules().filter((e) => e.state === "running").length,
    timestamp: new Date(),
  });

  // =========================================================================
  // Return Bootstrap Result
  // =========================================================================

  return {
    container,
    events,
    registry,
    gateway,
    app,
    shutdown,
  };
}

// =============================================================================
// EXPRESS SETUP
// =============================================================================

/**
 * Configure the Express app with standard middleware.
 */
function setupExpressApp(app: Express): void {
  // Trust proxy for correct IP detection behind reverse proxy
  app.set("trust proxy", 1);

  // Correlation ID middleware
  app.use(correlationMiddleware());

  // Request logging
  app.use(requestLoggingMiddleware());

  // Health check endpoint (before auth)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Readiness check endpoint
  app.get("/ready", (req, res) => {
    res.json({ status: "ready", timestamp: new Date().toISOString() });
  });
}

// =============================================================================
// MODULE DISCOVERY
// =============================================================================

/**
 * Discover modules in a directory.
 *
 * @description Scans a directory for module files and loads them.
 * Modules are expected to export a class implementing IModule.
 *
 * Directory structure:
 * ```
 * modules/
 * ├── auth/
 * │   └── index.ts  <- exports AuthModule
 * ├── messaging/
 * │   └── index.ts  <- exports MessagingModule
 * └── ai/
 *     └── index.ts  <- exports AIModule
 * ```
 *
 * @param modulesDir - Path to modules directory
 * @returns Array of discovered modules
 */
async function discoverModules(modulesDir: string): Promise<IModule[]> {
  const modules: IModule[] = [];

  try {
    // Check if directory exists
    await access(modulesDir);
  } catch {
    log.warn({ modulesDir }, "Modules directory not found, skipping discovery");
    return modules;
  }

  // Read directory contents
  const entries = await readdir(modulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleDir = path.join(modulesDir, entry.name);
    const indexPath = path.join(moduleDir, "index.ts");
    const indexJsPath = path.join(moduleDir, "index.js");

    // Check for index file
    let modulePath: string | null = null;

    try {
      await access(indexPath);
      modulePath = indexPath;
    } catch {
      try {
        await access(indexJsPath);
        modulePath = indexJsPath;
      } catch {
        log.debug({ moduleDir }, "No index file found, skipping");
        continue;
      }
    }

    try {
      // Dynamic import
      const moduleExports = await import(modulePath);

      // Look for default export or named export
      const ModuleClass =
        moduleExports.default ||
        moduleExports[`${entry.name}Module`] ||
        Object.values(moduleExports).find(
          (exp: any) => exp?.prototype?.manifest
        );

      if (ModuleClass) {
        const instance = new ModuleClass();
        modules.push(instance);
        log.debug({ moduleId: instance.manifest?.id }, "Module discovered");
      } else {
        log.warn({ modulePath }, "No module class found in file");
      }
    } catch (error) {
      log.error({ modulePath, error }, "Failed to load module");
    }
  }

  return modules;
}

// =============================================================================
// SHUTDOWN HANDLER
// =============================================================================

/**
 * Create a graceful shutdown handler.
 *
 * @description Returns a function that cleanly shuts down the system.
 * The handler:
 * 1. Emits shutdown event
 * 2. Stops health checks
 * 3. Stops all modules
 * 4. Disposes the gateway
 * 5. Disposes the container
 * 6. Emits shutdown complete event
 */
function createShutdownHandler(
  container: IContainer,
  events: IEventBus,
  registry: IModuleRegistry,
  gateway: IApiGateway,
  healthCheckInterval: NodeJS.Timeout | null,
  timeoutMs: number
): () => Promise<void> {
  let isShuttingDown = false;

  return async () => {
    // Prevent double shutdown
    if (isShuttingDown) {
      log.warn("Shutdown already in progress");
      return;
    }

    isShuttingDown = true;
    log.info("=== Beginning Graceful Shutdown ===");

    const startTime = Date.now();

    try {
      // Emit shutdown event
      events.emit(SYSTEM_EVENTS.SHUTDOWN, {
        timestamp: new Date(),
        reason: "requested",
      });

      // Stop health checks
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        log.debug("Health checks stopped");
      }

      // Stop all modules in reverse order
      log.info("Stopping modules");
      const modules = registry.listModules();

      // Sort by dependencies (stop dependents first)
      const stopOrder = modules
        .filter((e) => e.state === "running")
        .map((e) => e.module.manifest.id)
        .reverse();

      for (const moduleId of stopOrder) {
        try {
          await registry.disable(moduleId);
        } catch (error) {
          log.error({ moduleId, error }, "Error stopping module");
        }
      }

      log.debug("All modules stopped");

      // Dispose gateway
      (gateway as any).dispose?.();
      log.debug("API Gateway disposed");

      // Dispose container (disposes all services)
      await container.dispose();
      log.debug("Container disposed");

      // Dispose event bus
      (events as any).dispose?.();
      log.debug("Event bus disposed");

      const shutdownTime = Date.now() - startTime;
      log.info({ shutdownTimeMs: shutdownTime }, "=== Shutdown Complete ===");

      // Emit completion event (if anyone is still listening)
      events.emit(SYSTEM_EVENTS.SHUTDOWN_COMPLETE, {
        timestamp: new Date(),
        durationMs: shutdownTime,
      });
    } catch (error) {
      log.error({ error }, "Error during shutdown");

      events.emit(SYSTEM_EVENTS.FATAL_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        phase: "shutdown",
      });
    }
  };
}

// =============================================================================
// PROCESS SIGNAL HANDLERS
// =============================================================================

/**
 * Setup process signal handlers for graceful shutdown.
 *
 * @description Call this after bootstrap to handle SIGTERM, SIGINT, etc.
 * The handlers will call the shutdown function and exit.
 *
 * @param shutdown - The shutdown function from bootstrap result
 *
 * @example
 * ```typescript
 * const kernel = await bootstrap(config);
 * setupSignalHandlers(kernel.shutdown);
 * ```
 */
export function setupSignalHandlers(shutdown: () => Promise<void>): void {
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];

  for (const signal of signals) {
    process.on(signal, async () => {
      log.info({ signal }, "Received signal, initiating shutdown");

      try {
        await shutdown();
        process.exit(0);
      } catch (error) {
        log.error({ error }, "Shutdown failed");
        process.exit(1);
      }
    });
  }

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    log.fatal({ error }, "Uncaught exception");
    shutdown()
      .finally(() => process.exit(1));
  });

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason) => {
    log.fatal({ reason }, "Unhandled rejection");
    shutdown()
      .finally(() => process.exit(1));
  });

  log.debug("Signal handlers registered");
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Export all kernel components for convenience
export { createContainer, Container } from "./container";
export { createEventBus, EventBus } from "./events";
export { createModuleRegistry, ModuleRegistry, REGISTRY_EVENTS } from "./registry";
export { createApiGateway, ApiGateway, GATEWAY_EVENTS } from "./gateway";
export * from "./types";
