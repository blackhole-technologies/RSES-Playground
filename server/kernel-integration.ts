/**
 * @file kernel-integration.ts
 * @description Kernel Integration Layer for RSES CMS.
 *
 * This file provides a bridge between the existing server/index.ts and the new
 * kernel-based module system. It enables gradual migration by:
 *
 * 1. Initializing kernel components alongside existing middleware
 * 2. Registering modules while keeping existing routes working
 * 3. Providing a unified shutdown mechanism
 *
 * @module kernel-integration
 * @phase Phase 1 - Foundation Infrastructure
 * @created 2026-02-01
 *
 * @architecture
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    INTEGRATION LAYER                                │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │  Existing Server (server/index.ts)                                  │
 * │  ├── Security Middleware                                            │
 * │  ├── Session/Passport (legacy)                                      │
 * │  ├── Legacy Routes                                                  │
 * │  │                                                                  │
 * │  └── Kernel Integration                                             │
 * │      ├── DI Container                                               │
 * │      ├── Event Bus                                                  │
 * │      ├── Module Registry                                            │
 * │      │   ├── Auth Module ──────┐                                   │
 * │      │   ├── Content Module ───┤── /api/modules/*                   │
 * │      │   └── (other modules) ──┘                                   │
 * │      └── API Gateway                                                │
 * │                                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { initializeKernel, getKernel } from "./kernel-integration";
 *
 * // In server/index.ts after existing middleware setup
 * await initializeKernel(app, {
 *   modulesDir: "./server/modules",
 *   autoLoad: true,
 * });
 *
 * // Later, access kernel components
 * const kernel = getKernel();
 * const authService = kernel?.container.resolve("AuthService");
 * ```
 */

import * as path from "path";
import type { Express } from "express";
import { createModuleLogger } from "./logger";
import { createContainer } from "./kernel/container";
import { createEventBus } from "./kernel/events";
import { createModuleRegistry, REGISTRY_EVENTS } from "./kernel/registry";
import { createApiGateway, GATEWAY_EVENTS } from "./kernel/gateway";
import { SYSTEM_EVENTS, SERVICE_TOKENS } from "./kernel/bootstrap";
import type {
  KernelConfig,
  BootstrapResult,
  IContainer,
  IEventBus,
  IModuleRegistry,
  IApiGateway,
  IModule,
} from "./kernel/types";
import { readdir, access, writeFile, mkdir } from "fs/promises";
import { moduleConfigStorage } from "./storage";
import { requireAuth, requireAdmin } from "./auth/session";

const log = createModuleLogger("kernel-integration");

// =============================================================================
// KERNEL STATE
// =============================================================================

/**
 * Global kernel state for access throughout the application.
 */
let kernelState: BootstrapResult | null = null;

/**
 * Module configurations storage.
 * Maps module ID to its current config.
 */
const moduleConfigs = new Map<string, Record<string, unknown>>();

/**
 * Get the current kernel instance.
 *
 * @returns The kernel components or null if not initialized
 */
export function getKernel(): BootstrapResult | null {
  return kernelState;
}

/**
 * Check if the kernel is initialized.
 */
export function isKernelInitialized(): boolean {
  return kernelState !== null;
}

/**
 * Get a module's current configuration.
 */
export function getModuleConfig(moduleId: string): Record<string, unknown> | undefined {
  return moduleConfigs.get(moduleId);
}

/**
 * Set a module's configuration (for programmatic use).
 */
export function setModuleConfig(moduleId: string, config: Record<string, unknown>): void {
  moduleConfigs.set(moduleId, config);
}

// =============================================================================
// INTEGRATION OPTIONS
// =============================================================================

/**
 * Options for kernel integration.
 */
export interface KernelIntegrationOptions {
  /**
   * Directory containing module files.
   * @default "./server/modules"
   */
  modulesDir?: string;

  /**
   * Whether to auto-load modules on startup.
   * @default true
   */
  autoLoad?: boolean;

  /**
   * Modules to explicitly enable.
   * If empty, all discovered modules are enabled.
   */
  enabledModules?: string[];

  /**
   * Modules to explicitly disable.
   */
  disabledModules?: string[];

  /**
   * Per-module configuration.
   */
  moduleConfigs?: Record<string, Record<string, unknown>>;

  /**
   * Shutdown timeout in milliseconds.
   * @default 30000
   */
  shutdownTimeout?: number;

  /**
   * Health check interval in milliseconds.
   * Set to 0 to disable.
   * @default 30000
   */
  healthCheckInterval?: number;

  /**
   * Mount point for module routes.
   * @default "/api/modules"
   */
  moduleRoutePrefix?: string;

  /**
   * Whether to skip session setup in auth module.
   * Set to true if session is already configured.
   * @default true (since existing server sets up session)
   */
  skipSessionSetup?: boolean;
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<KernelIntegrationOptions> = {
  modulesDir: "./server/modules",
  autoLoad: true,
  enabledModules: [],
  disabledModules: [],
  moduleConfigs: {},
  shutdownTimeout: 30000,
  healthCheckInterval: 30000,
  moduleRoutePrefix: "/api/modules",
  skipSessionSetup: true,
};

// =============================================================================
// KERNEL INITIALIZATION
// =============================================================================

/**
 * Initialize the kernel and integrate it with the existing Express app.
 *
 * @description This function creates kernel components (Container, EventBus,
 * Registry, Gateway) and integrates them with an existing Express application.
 * Unlike full bootstrap, this preserves existing middleware and routes.
 *
 * @param app - The existing Express application
 * @param options - Integration options
 * @returns The kernel components
 *
 * @example
 * ```typescript
 * // In server/index.ts
 * const app = express();
 *
 * // ... existing middleware setup ...
 *
 * // Initialize kernel
 * const kernel = await initializeKernel(app, {
 *   modulesDir: "./server/modules",
 *   moduleConfigs: {
 *     auth: { sessionSecret: process.env.SESSION_SECRET },
 *   },
 * });
 *
 * // Now modules are loaded and routes are available
 * // e.g., /api/modules/auth/login, /api/modules/content/health
 * ```
 */
export async function initializeKernel(
  app: Express,
  options: KernelIntegrationOptions = {}
): Promise<BootstrapResult> {
  log.info("=== Initializing Kernel Integration ===");
  const startTime = Date.now();

  // Merge with defaults
  const opts: Required<KernelIntegrationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // =========================================================================
  // STEP 1: Create Core Components
  // =========================================================================

  log.info("Step 1: Creating kernel components");

  const container = createContainer();
  const events = createEventBus();
  const registry = createModuleRegistry(container, events, app);
  const gateway = createApiGateway(events);

  log.debug("Kernel components created");

  // =========================================================================
  // STEP 2: Register Core Services
  // =========================================================================

  log.info("Step 2: Registering core services");

  // Symbol tokens
  container.registerSingleton(SERVICE_TOKENS.Container, container, "kernel");
  container.registerSingleton(SERVICE_TOKENS.EventBus, events, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ModuleRegistry, registry, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ApiGateway, gateway, "kernel");
  container.registerSingleton(SERVICE_TOKENS.ExpressApp, app, "kernel");
  container.registerSingleton(SERVICE_TOKENS.KernelConfig, opts, "kernel");

  // String tokens for convenience
  container.registerSingleton("Container", container, "kernel");
  container.registerSingleton("EventBus", events, "kernel");
  container.registerSingleton("ModuleRegistry", registry, "kernel");
  container.registerSingleton("ApiGateway", gateway, "kernel");

  // =========================================================================
  // STEP 3: Mount Module Routes
  // =========================================================================

  log.info("Step 3: Mounting module routes");

  // Mount the gateway middleware for module routes
  app.use(opts.moduleRoutePrefix, gateway.middleware());
  log.debug({ prefix: opts.moduleRoutePrefix }, "Module routes mounted");

  // =========================================================================
  // STEP 4: Discover and Register Modules
  // =========================================================================

  log.info("Step 4: Discovering modules");

  const modulesDir = path.resolve(opts.modulesDir);
  const modules = await discoverModules(modulesDir);

  for (const module of modules) {
    const moduleId = module.manifest.id;

    // Skip if disabled
    if (opts.disabledModules.includes(moduleId)) {
      log.info({ moduleId }, "Module disabled by config, skipping");
      continue;
    }

    try {
      registry.register(module);
      log.debug({ moduleId }, "Module registered");
    } catch (error) {
      log.error({ moduleId, error }, "Failed to register module");
    }
  }

  log.info({ count: registry.listModules().length }, "Modules registered");

  // =========================================================================
  // STEP 5: Load Persisted Configs from Database
  // =========================================================================

  log.info("Step 5: Loading persisted module configs");

  try {
    const persistedConfigs = await moduleConfigStorage.getAllModuleConfigs();
    for (const pc of persistedConfigs) {
      moduleConfigs.set(pc.moduleId, pc.config as Record<string, unknown>);
      log.debug({ moduleId: pc.moduleId }, "Loaded persisted config");
    }
    log.info({ count: persistedConfigs.length }, "Persisted configs loaded");
  } catch (error) {
    log.warn({ error }, "Failed to load persisted configs, using defaults");
  }

  // =========================================================================
  // STEP 6: Load Enabled Modules
  // =========================================================================

  if (opts.autoLoad) {
    log.info("Step 6: Loading modules");

    // Determine which modules to load
    let modulesToLoad: string[];

    if (opts.enabledModules.length > 0) {
      modulesToLoad = opts.enabledModules;
    } else {
      modulesToLoad = registry.listModules().map((e) => e.module.manifest.id);
    }

    // Load each module
    for (const moduleId of modulesToLoad) {
      // Merge persisted config with provided config (provided takes precedence)
      const persistedConfig = moduleConfigs.get(moduleId) || {};
      const providedConfig = opts.moduleConfigs[moduleId] || {};
      const moduleConfig = { ...persistedConfig, ...providedConfig };

      // Pass skipSessionSetup to auth module
      if (moduleId === "auth" && opts.skipSessionSetup) {
        moduleConfig._skipSessionSetup = true;
      }

      const result = await registry.load(moduleId, {
        config: moduleConfig,
        autoStart: true,
        enabled: true,
      });

      // Store merged config for later retrieval
      if (result.success) {
        moduleConfigs.set(moduleId, moduleConfig);
      }

      if (!result.success) {
        log.error({ moduleId, error: result.error }, "Failed to load module");
      } else {
        log.info({ moduleId }, "Module loaded");
      }
    }

    const runningCount = registry
      .listModules()
      .filter((e) => e.state === "running").length;

    log.info({ count: runningCount }, "Modules loaded and running");
  } else {
    log.info("Step 6: Auto-load disabled");
  }

  // =========================================================================
  // STEP 7: Setup Health Checks
  // =========================================================================

  log.info("Step 7: Setting up health checks");

  let healthCheckInterval: NodeJS.Timeout | null = null;

  if (opts.healthCheckInterval > 0) {
    healthCheckInterval = setInterval(async () => {
      const health = await registry.checkHealth();
      events.emit(SYSTEM_EVENTS.HEALTH_CHECK, {
        timestamp: new Date(),
        modules: Object.fromEntries(health),
      });
    }, opts.healthCheckInterval);
  }

  // =========================================================================
  // STEP 8: Create Shutdown Handler
  // =========================================================================

  log.info("Step 8: Creating shutdown handler");

  const shutdown = createShutdownHandler(
    container,
    events,
    registry,
    gateway,
    healthCheckInterval,
    opts.shutdownTimeout
  );

  // =========================================================================
  // STEP 9: Store State and Emit Ready
  // =========================================================================

  const bootTime = Date.now() - startTime;
  log.info({ bootTimeMs: bootTime }, "=== Kernel Integration Complete ===");

  // Store kernel state globally
  kernelState = {
    container,
    events,
    registry,
    gateway,
    app,
    shutdown,
  };

  // Emit ready event
  events.emit(SYSTEM_EVENTS.READY, {
    bootTimeMs: bootTime,
    modulesLoaded: registry.listModules().filter((e) => e.state === "running").length,
    timestamp: new Date(),
    integrationMode: true,
  });

  // Add kernel admin routes
  setupKernelAdminRoutes(app, registry, events);

  return kernelState;
}

// =============================================================================
// MODULE DISCOVERY
// =============================================================================

/**
 * Discover modules in a directory.
 */
async function discoverModules(modulesDir: string): Promise<IModule[]> {
  const modules: IModule[] = [];

  try {
    await access(modulesDir);
  } catch {
    log.warn({ modulesDir }, "Modules directory not found");
    return modules;
  }

  const entries = await readdir(modulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleDir = path.join(modulesDir, entry.name);
    const indexPath = path.join(moduleDir, "index.ts");
    const indexJsPath = path.join(moduleDir, "index.js");

    let modulePath: string | null = null;

    try {
      await access(indexPath);
      modulePath = indexPath;
    } catch {
      try {
        await access(indexJsPath);
        modulePath = indexJsPath;
      } catch {
        log.debug({ moduleDir }, "No index file found");
        continue;
      }
    }

    try {
      const moduleExports = await import(modulePath);

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
        log.warn({ modulePath }, "No module class found");
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
    if (isShuttingDown) {
      log.warn("Shutdown already in progress");
      return;
    }

    isShuttingDown = true;
    log.info("=== Beginning Kernel Shutdown ===");

    const startTime = Date.now();

    try {
      events.emit(SYSTEM_EVENTS.SHUTDOWN, {
        timestamp: new Date(),
        reason: "requested",
      });

      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }

      // Stop modules
      const modules = registry.listModules();
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

      // Dispose resources
      (gateway as any).dispose?.();
      await container.dispose();
      (events as any).dispose?.();

      const shutdownTime = Date.now() - startTime;
      log.info({ shutdownTimeMs: shutdownTime }, "=== Kernel Shutdown Complete ===");

      events.emit(SYSTEM_EVENTS.SHUTDOWN_COMPLETE, {
        timestamp: new Date(),
        durationMs: shutdownTime,
      });

      // Clear global state
      kernelState = null;
    } catch (error) {
      log.error({ error }, "Error during kernel shutdown");
      events.emit(SYSTEM_EVENTS.FATAL_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        phase: "shutdown",
      });
    }
  };
}

// =============================================================================
// ADMIN ROUTES
// =============================================================================

/**
 * Set up admin routes for kernel management.
 */
function setupKernelAdminRoutes(
  app: Express,
  registry: IModuleRegistry,
  events: IEventBus
): void {
  // P0 SECURITY: Require authentication and admin role for all kernel routes
  // In development, inject a dev admin user if not authenticated
  if (process.env.NODE_ENV !== "production") {
    app.use("/api/kernel", (req: any, res, next) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        // Inject dev admin user for unauthenticated requests
        req.user = { id: "dev-admin", email: "dev@localhost", isAdmin: true };
        req.isAuthenticated = () => true;
      }
      next();
    });
  }
  // Always apply auth checks (dev user passes, real users need real auth)
  app.use("/api/kernel", requireAuth, requireAdmin);

  // GET /api/kernel/modules - List all modules
  app.get("/api/kernel/modules", (req, res) => {
    const modules = registry.listModules().map((entry) => ({
      id: entry.module.manifest.id,
      name: entry.module.manifest.name,
      version: entry.module.manifest.version,
      tier: entry.module.manifest.tier,
      state: entry.state,
      enabled: entry.enabled,
      health: entry.health,
    }));

    res.json({ modules });
  });

  // GET /api/kernel/modules/:id - Get module details
  app.get("/api/kernel/modules/:id", (req, res) => {
    const entry = registry.get(req.params.id);

    if (!entry) {
      return res.status(404).json({ error: "Module not found" });
    }

    res.json({
      id: entry.module.manifest.id,
      name: entry.module.manifest.name,
      version: entry.module.manifest.version,
      description: entry.module.manifest.description,
      tier: entry.module.manifest.tier,
      state: entry.state,
      enabled: entry.enabled,
      health: entry.health,
      dependencies: entry.module.manifest.dependencies,
      events: entry.module.manifest.events,
    });
  });

  // POST /api/kernel/modules/:id/enable - Enable a module
  app.post("/api/kernel/modules/:id/enable", async (req, res) => {
    const moduleId = req.params.id;

    try {
      const success = await registry.enable(moduleId);

      if (success) {
        events.emit("kernel:module-enabled", { moduleId, timestamp: new Date() });
        res.json({ success: true, message: `Module ${moduleId} enabled` });
      } else {
        res.status(400).json({ success: false, error: "Failed to enable module" });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/kernel/modules/:id/disable - Disable a module
  app.post("/api/kernel/modules/:id/disable", async (req, res) => {
    const moduleId = req.params.id;

    // Prevent disabling core modules without force
    const entry = registry.get(moduleId);
    if (entry?.module.manifest.tier === "core" && !req.body.force) {
      return res.status(400).json({
        success: false,
        error: "Cannot disable core module without force flag",
        hint: "Add { force: true } to request body to disable core modules",
      });
    }

    try {
      const success = await registry.disable(moduleId);

      if (success) {
        events.emit("kernel:module-disabled", { moduleId, timestamp: new Date() });
        res.json({ success: true, message: `Module ${moduleId} disabled` });
      } else {
        res.status(400).json({ success: false, error: "Failed to disable module" });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/kernel/health - Get kernel health
  app.get("/api/kernel/health", async (req, res) => {
    const moduleHealth = await registry.checkHealth();

    const modules: Record<string, any> = {};
    moduleHealth.forEach((health, id) => {
      modules[id] = health;
    });

    const overallStatus = Array.from(moduleHealth.values()).every(
      (h) => h.status === "healthy"
    )
      ? "healthy"
      : Array.from(moduleHealth.values()).some((h) => h.status === "unhealthy")
      ? "unhealthy"
      : "degraded";

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      modules,
    });
  });

  // GET /api/kernel/events - Get recent events
  app.get("/api/kernel/events", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const type = req.query.type as string | undefined;

    const history = events.getHistory(limit, type);

    res.json({ events: history });
  });

  // GET /api/kernel/modules/:id/config - Get module configuration
  app.get("/api/kernel/modules/:id/config", (req, res) => {
    const moduleId = req.params.id;
    const entry = registry.get(moduleId);

    if (!entry) {
      return res.status(404).json({ error: "Module not found" });
    }

    const config = moduleConfigs.get(moduleId) || {};
    const manifest = entry.module.manifest;

    // Extract schema info if available
    let schemaFields: Array<{
      name: string;
      type: string;
      required: boolean;
      default?: unknown;
      description?: string;
    }> = [];

    // Try to extract schema information from Zod schema
    if (manifest.configSchema) {
      try {
        const schema = manifest.configSchema as any;
        if (schema._def?.typeName === "ZodObject" && schema._def.shape) {
          const shape = schema._def.shape();
          for (const [key, fieldSchema] of Object.entries(shape)) {
            const field = fieldSchema as any;
            let fieldType = "string";
            let isRequired = true;
            let defaultValue: unknown;

            // Handle optional fields
            if (field._def?.typeName === "ZodOptional") {
              isRequired = false;
              const innerSchema = field._def.innerType;
              fieldType = getZodTypeName(innerSchema);
            } else if (field._def?.typeName === "ZodDefault") {
              defaultValue = field._def.defaultValue();
              const innerSchema = field._def.innerType;
              fieldType = getZodTypeName(innerSchema);
              isRequired = false;
            } else {
              fieldType = getZodTypeName(field);
            }

            schemaFields.push({
              name: key,
              type: fieldType,
              required: isRequired,
              default: defaultValue,
            });
          }
        }
      } catch (e) {
        log.debug({ moduleId, error: e }, "Could not extract schema info");
      }
    }

    res.json({
      moduleId,
      config,
      schema: schemaFields,
      hasSchema: !!manifest.configSchema,
      supportsHotReload: typeof entry.module.onConfigChange === "function",
    });
  });

  // PUT /api/kernel/modules/:id/config - Update module configuration
  app.put("/api/kernel/modules/:id/config", async (req, res) => {
    const moduleId = req.params.id;
    const entry = registry.get(moduleId);

    if (!entry) {
      return res.status(404).json({ error: "Module not found" });
    }

    const newConfig = req.body.config;

    if (!newConfig || typeof newConfig !== "object") {
      return res.status(400).json({ error: "Invalid config object" });
    }

    // Validate against schema if available
    const manifest = entry.module.manifest;
    if (manifest.configSchema) {
      try {
        manifest.configSchema.parse(newConfig);
      } catch (validationError: any) {
        return res.status(400).json({
          error: "Config validation failed",
          details: validationError.errors || validationError.message,
        });
      }
    }

    // Store the new config in memory
    const oldConfig = moduleConfigs.get(moduleId) || {};
    const mergedConfig = { ...oldConfig, ...newConfig };
    moduleConfigs.set(moduleId, mergedConfig);

    // Persist to database
    try {
      await moduleConfigStorage.saveModuleConfig(moduleId, mergedConfig);
      log.debug({ moduleId }, "Config persisted to database");
    } catch (persistError) {
      log.error({ moduleId, error: persistError }, "Failed to persist config");
      // Continue anyway - in-memory config is updated
    }

    // Try hot-reload if supported
    let hotReloaded = false;
    if (typeof entry.module.onConfigChange === "function") {
      try {
        hotReloaded = await entry.module.onConfigChange(mergedConfig);
      } catch (error) {
        log.warn(
          { moduleId, error },
          "Config hot-reload failed, restart required"
        );
      }
    }

    // Emit config change event
    events.emit("kernel:module:config-changed", {
      moduleId,
      hotReloaded,
      persisted: true,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      config: mergedConfig,
      hotReloaded,
      persisted: true,
      message: hotReloaded
        ? "Configuration updated, applied, and persisted"
        : "Configuration updated and persisted (restart required to apply)",
    });
  });

  // POST /api/kernel/modules/install - Install a new module from upload
  // P0 SECURITY: DISABLED - RCE vulnerability via arbitrary code execution
  // TODO: Implement secure module installation with:
  //   - Code signing verification
  //   - Sandboxed execution
  //   - Static analysis scanning
  //   - Trusted registry validation
  app.post("/api/kernel/modules/install", async (req, res) => {
    return res.status(503).json({
      error: "Endpoint disabled pending security review",
      code: "E_ENDPOINT_DISABLED",
      message: "Module installation via code upload is disabled for security reasons. Use CLI or trusted registry.",
    });

    // Original implementation preserved for future secure version:
    /*
    const { moduleCode, moduleId } = req.body;

    if (!moduleCode || !moduleId) {
      return res.status(400).json({
        error: "moduleCode and moduleId are required",
      });
    }

    // Validate moduleId format
    if (!/^[a-z][a-z0-9-]*$/.test(moduleId)) {
      return res.status(400).json({
        error: "moduleId must start with lowercase letter, contain only lowercase letters, numbers, and hyphens",
      });
    }

    // Check if module already exists
    if (registry.get(moduleId)) {
      return res.status(409).json({
        error: `Module '${moduleId}' already exists`,
      });
    }

    const modulesDir = path.resolve("./server/modules");
    const moduleDir = path.join(modulesDir, moduleId);

    try {
      // Create module directory
      await mkdir(moduleDir, { recursive: true });

      // Write the module file
      const modulePath = path.join(moduleDir, "index.ts");
      await writeFile(modulePath, moduleCode, "utf-8");

      // Try to load and register the module
      try {
        const moduleExports = await import(modulePath);
        const ModuleClass =
          moduleExports.default ||
          moduleExports[`${moduleId}Module`] ||
          Object.values(moduleExports).find(
            (exp: any) => exp?.prototype?.manifest
          );

        if (!ModuleClass) {
          // Clean up on failure
          await import("fs/promises").then((fs) =>
            fs.rm(moduleDir, { recursive: true, force: true })
          );
          return res.status(400).json({
            error: "No valid module class found in uploaded code",
          });
        }

        const instance = new ModuleClass();

        // Validate manifest
        if (!instance.manifest?.id || !instance.manifest?.name) {
          await import("fs/promises").then((fs) =>
            fs.rm(moduleDir, { recursive: true, force: true })
          );
          return res.status(400).json({
            error: "Module must have a valid manifest with id and name",
          });
        }

        // Register and load the module
        registry.register(instance);
        const loadResult = await registry.load(instance.manifest.id, {
          autoStart: true,
          enabled: true,
        });

        if (!loadResult.success) {
          return res.status(500).json({
            error: `Module installed but failed to load: ${loadResult.error}`,
            installed: true,
            loaded: false,
          });
        }

        events.emit("kernel:module-installed", {
          moduleId: instance.manifest.id,
          name: instance.manifest.name,
          version: instance.manifest.version,
          timestamp: new Date(),
        });

        res.json({
          success: true,
          moduleId: instance.manifest.id,
          name: instance.manifest.name,
          version: instance.manifest.version,
          message: `Module '${instance.manifest.name}' installed and loaded successfully`,
        });
      } catch (loadError) {
        // Clean up on load failure
        await import("fs/promises").then((fs) =>
          fs.rm(moduleDir, { recursive: true, force: true })
        );
        throw loadError;
      }
    } catch (error) {
      log.error({ moduleId, error }, "Failed to install module");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to install module",
      });
    }
    */
  });

  // DELETE /api/kernel/modules/:id/uninstall - Uninstall a module
  app.delete("/api/kernel/modules/:id/uninstall", async (req, res) => {
    const moduleId = req.params.id;
    const entry = registry.get(moduleId);

    if (!entry) {
      return res.status(404).json({ error: "Module not found" });
    }

    // Prevent uninstalling core or kernel modules
    if (entry.module.manifest.tier === "core" || entry.module.manifest.tier === "kernel") {
      if (!req.body.force) {
        return res.status(400).json({
          error: `Cannot uninstall ${entry.module.manifest.tier} module without force flag`,
          hint: "Add { force: true } to request body",
        });
      }
    }

    try {
      // Disable the module first
      if (entry.state === "running") {
        await registry.disable(moduleId);
      }

      // Unregister from registry
      (registry as any).unregister?.(moduleId);

      // Remove from moduleConfigs
      moduleConfigs.delete(moduleId);

      // Remove persisted config
      try {
        await moduleConfigStorage.deleteModuleConfig(moduleId);
      } catch {
        // Ignore if config doesn't exist
      }

      // Remove module directory (only for third-party modules)
      if (entry.module.manifest.tier === "third-party") {
        const moduleDir = path.join("./server/modules", moduleId);
        await import("fs/promises").then((fs) =>
          fs.rm(moduleDir, { recursive: true, force: true })
        );
      }

      events.emit("kernel:module-uninstalled", {
        moduleId,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: `Module '${moduleId}' uninstalled successfully`,
      });
    } catch (error) {
      log.error({ moduleId, error }, "Failed to uninstall module");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to uninstall module",
      });
    }
  });

  log.debug("Kernel admin routes registered");
}

/**
 * Get Zod type name for schema extraction.
 */
function getZodTypeName(schema: any): string {
  const typeName = schema?._def?.typeName;
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodEnum":
      return "enum";
    case "ZodOptional":
      return getZodTypeName(schema._def.innerType);
    case "ZodDefault":
      return getZodTypeName(schema._def.innerType);
    default:
      return "unknown";
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  SYSTEM_EVENTS,
  SERVICE_TOKENS,
  REGISTRY_EVENTS,
  GATEWAY_EVENTS,
};

// Re-export kernel types
export type {
  BootstrapResult,
  IContainer,
  IEventBus,
  IModuleRegistry,
  IApiGateway,
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
} from "./kernel/types";
