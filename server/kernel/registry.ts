/**
 * @file registry.ts
 * @description Module Registry for the RSES CMS Kernel.
 *
 * The Module Registry is responsible for:
 *
 * 1. **Module Registration** - Tracking all available modules
 * 2. **Dependency Resolution** - Ensuring modules load in correct order
 * 3. **Lifecycle Management** - Initializing, starting, stopping modules
 * 4. **Hot-Loading** - Enabling/disabling modules without restart
 * 5. **Health Monitoring** - Tracking module health status
 *
 * ## Module Loading Process
 *
 * ```
 * ┌──────────────┐
 * │   Register   │  Module manifest is registered
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Load      │  Dependencies resolved, topological sort
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │  Initialize  │  Module.initialize() called with context
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Start     │  Module.start() called after deps ready
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │   Running    │  Module is active and processing
 * └──────────────┘
 * ```
 *
 * ## Dependency Resolution
 *
 * The registry uses topological sorting to determine load order.
 * If module A depends on module B, B is loaded first.
 *
 * Circular dependencies are detected and rejected.
 *
 * @module kernel/registry
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

import { Router, Express } from "express";
import semver from "semver";
import { createModuleLogger } from "../logger";
import type {
  IModuleRegistry,
  IModule,
  ModuleEntry,
  ModuleState,
  ModuleTier,
  ModuleManifest,
  ModuleDependency,
  ModuleHealth,
  ModuleContext,
  LoadModuleOptions,
  LoadModuleResult,
  IContainer,
  IEventBus,
} from "./types";

const log = createModuleLogger("module-registry");

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default timeout for module operations (ms).
 */
const DEFAULT_OPERATION_TIMEOUT = 30000;

/**
 * Events emitted by the registry.
 */
export const REGISTRY_EVENTS = {
  MODULE_REGISTERED: "registry:module:registered",
  MODULE_LOADED: "registry:module:loaded",
  MODULE_STARTED: "registry:module:started",
  MODULE_STOPPED: "registry:module:stopped",
  MODULE_UNLOADED: "registry:module:unloaded",
  MODULE_ENABLED: "registry:module:enabled",
  MODULE_DISABLED: "registry:module:disabled",
  MODULE_FAILED: "registry:module:failed",
  MODULE_HEALTH_CHANGED: "registry:module:health-changed",
} as const;

// =============================================================================
// MODULE REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Module Registry - Manages module lifecycle and dependencies.
 *
 * @description The central authority for module management.
 * Handles registration, loading, dependency resolution, and hot-reloading.
 *
 * ## Key Responsibilities
 *
 * 1. **Track all modules**: Maintains a registry of available modules
 * 2. **Resolve dependencies**: Ensures correct load order
 * 3. **Manage lifecycle**: Coordinates initialize/start/stop/dispose
 * 4. **Hot-reload**: Enable/disable modules at runtime
 * 5. **Monitor health**: Track module status and health
 *
 * ## Usage
 *
 * ```typescript
 * const registry = new ModuleRegistry(container, events, app);
 *
 * // Register modules
 * registry.register(new AuthModule());
 * registry.register(new MessagingModule());
 *
 * // Load a module (auto-loads dependencies)
 * const result = await registry.load("messaging");
 * if (!result.success) {
 *   console.error("Failed to load:", result.error);
 * }
 *
 * // Hot-disable a module
 * await registry.disable("messaging");
 *
 * // Check health
 * const health = await registry.checkHealth();
 * ```
 */
export class ModuleRegistry implements IModuleRegistry {
  // =========================================================================
  // PRIVATE FIELDS
  // =========================================================================

  /**
   * Map of module ID to module entry.
   */
  private modules = new Map<string, ModuleEntry>();

  /**
   * DI container for service resolution.
   */
  private container: IContainer;

  /**
   * Event bus for module events.
   */
  private events: IEventBus;

  /**
   * Express app for route registration.
   */
  private app: Express;

  /**
   * Module routers by module ID.
   */
  private routers = new Map<string, Router>();

  // =========================================================================
  // CONSTRUCTOR
  // =========================================================================

  /**
   * Create a new ModuleRegistry.
   *
   * @param container - DI container for dependency injection
   * @param events - Event bus for module events
   * @param app - Express app for route registration
   *
   * @example
   * ```typescript
   * const container = createContainer();
   * const events = createEventBus();
   * const app = express();
   *
   * const registry = new ModuleRegistry(container, events, app);
   * ```
   */
  constructor(container: IContainer, events: IEventBus, app: Express) {
    this.container = container;
    this.events = events;
    this.app = app;

    log.info("Module registry initialized");
  }

  // =========================================================================
  // REGISTRATION
  // =========================================================================

  /**
   * Register a module with the registry.
   *
   * @description Adds a module to the registry so it can be loaded later.
   * The module is not initialized at this point - just registered.
   *
   * ## Validation
   *
   * The manifest is validated:
   * - ID must be unique
   * - ID must be lowercase alphanumeric with hyphens
   * - Version must be valid semver
   * - Dependencies must reference valid module IDs
   *
   * @param module - The module to register
   * @throws Error if module with same ID already exists
   * @throws Error if manifest is invalid
   *
   * @example
   * ```typescript
   * // Register a module
   * registry.register(new MessagingModule());
   *
   * // The module is now known but not loaded
   * console.log(registry.has("messaging")); // true
   * console.log(registry.get("messaging")?.state); // "registered"
   * ```
   */
  register(module: IModule): void {
    const { manifest } = module;

    // Validate manifest
    this.validateManifest(manifest);

    // Check for duplicates
    if (this.modules.has(manifest.id)) {
      throw new Error(
        `Module '${manifest.id}' is already registered. ` +
        `Unregister it first if you want to replace it.`
      );
    }

    // Create entry
    const entry: ModuleEntry = {
      module,
      state: "registered",
      registeredAt: new Date(),
      lastStateChange: new Date(),
      enabled: true, // Can be changed via admin
    };

    this.modules.set(manifest.id, entry);

    // Emit event
    this.events.emit(REGISTRY_EVENTS.MODULE_REGISTERED, {
      moduleId: manifest.id,
      version: manifest.version,
      tier: manifest.tier,
    });

    log.info(
      { moduleId: manifest.id, version: manifest.version, tier: manifest.tier },
      "Module registered"
    );
  }

  /**
   * Validate a module manifest.
   */
  private validateManifest(manifest: ModuleManifest): void {
    // Check required fields
    if (!manifest.id) {
      throw new Error("Module manifest must have an 'id' field");
    }

    if (!manifest.version) {
      throw new Error(`Module '${manifest.id}' must have a 'version' field`);
    }

    // Validate ID format (lowercase alphanumeric with hyphens)
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error(
        `Module ID '${manifest.id}' is invalid. ` +
        `Must be lowercase alphanumeric with hyphens (e.g., 'my-module').`
      );
    }

    // Validate version is semver
    if (!semver.valid(manifest.version)) {
      throw new Error(
        `Module '${manifest.id}' version '${manifest.version}' is not valid semver. ` +
        `Use format like '1.0.0' or '2.1.3-beta.1'.`
      );
    }

    // Validate tier
    const validTiers: ModuleTier[] = ["kernel", "core", "optional", "third-party"];
    if (!validTiers.includes(manifest.tier)) {
      throw new Error(
        `Module '${manifest.id}' has invalid tier '${manifest.tier}'. ` +
        `Must be one of: ${validTiers.join(", ")}`
      );
    }
  }

  /**
   * Unregister a module from the registry.
   *
   * @description Removes a module completely from the registry.
   * The module must be stopped first.
   *
   * @param moduleId - The module to unregister
   * @returns true if module was removed
   *
   * @example
   * ```typescript
   * // Stop and unregister
   * await registry.disable("old-module");
   * await registry.unregister("old-module");
   * ```
   */
  async unregister(moduleId: string): Promise<boolean> {
    const entry = this.modules.get(moduleId);
    if (!entry) {
      return false;
    }

    // Must be stopped first
    if (entry.state === "running" || entry.state === "starting") {
      throw new Error(
        `Cannot unregister running module '${moduleId}'. ` +
        `Stop it first with disable().`
      );
    }

    // Remove from registry
    this.modules.delete(moduleId);
    this.routers.delete(moduleId);

    log.info({ moduleId }, "Module unregistered");
    return true;
  }

  // =========================================================================
  // LOADING
  // =========================================================================

  /**
   * Load and initialize a module with its dependencies.
   *
   * @description Loads a module and all its dependencies in the correct order.
   * Uses topological sort to ensure dependencies are loaded first.
   *
   * ## Process
   *
   * 1. Resolve dependency graph
   * 2. Check for circular dependencies
   * 3. Check for missing dependencies
   * 4. Initialize dependencies (if not already)
   * 5. Initialize the target module
   * 6. Start if autoStart is true
   *
   * @param moduleId - The module to load
   * @param options - Load options (config, autoStart)
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * // Load with default options
   * const result = await registry.load("messaging");
   *
   * // Load with config and auto-start
   * const result = await registry.load("messaging", {
   *   config: { maxChannels: 100 },
   *   autoStart: true
   * });
   *
   * if (!result.success) {
   *   console.error("Load failed:", result.error);
   *   if (result.missingDependencies) {
   *     console.error("Missing:", result.missingDependencies);
   *   }
   * }
   * ```
   */
  async load(
    moduleId: string,
    options: LoadModuleOptions = {}
  ): Promise<LoadModuleResult> {
    const entry = this.modules.get(moduleId);

    if (!entry) {
      return {
        success: false,
        moduleId,
        error: `Module '${moduleId}' is not registered`,
      };
    }

    // Already loaded?
    if (entry.state === "running" || entry.state === "ready") {
      log.debug({ moduleId }, "Module already loaded");
      return { success: true, moduleId };
    }

    // Disabled?
    if (options.enabled === false || !entry.enabled) {
      log.debug({ moduleId }, "Module is disabled, skipping load");
      return {
        success: false,
        moduleId,
        error: "Module is disabled",
      };
    }

    try {
      // Resolve load order
      const loadOrder = this.resolveLoadOrder(moduleId);

      // Check for missing dependencies
      const missing = this.checkMissingDependencies(moduleId);
      if (missing.length > 0) {
        return {
          success: false,
          moduleId,
          error: `Missing required dependencies: ${missing.map((d) => d.moduleId).join(", ")}`,
          missingDependencies: missing,
        };
      }

      // Initialize each module in order
      for (const depId of loadOrder) {
        const depEntry = this.modules.get(depId);
        if (!depEntry) continue;

        // Skip if already initialized
        if (
          depEntry.state === "ready" ||
          depEntry.state === "running" ||
          depEntry.state === "starting"
        ) {
          continue;
        }

        await this.initializeModule(depId, options.config);
      }

      // Start if requested
      if (options.autoStart) {
        for (const depId of loadOrder) {
          await this.startModule(depId);
        }
      }

      return {
        success: true,
        moduleId,
        loadOrder,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.setModuleState(moduleId, "failed", error as Error);

      return {
        success: false,
        moduleId,
        error: errorMessage,
      };
    }
  }

  /**
   * Initialize a single module.
   */
  private async initializeModule(
    moduleId: string,
    config?: Record<string, unknown>
  ): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry) return;

    log.info({ moduleId }, "Initializing module");
    this.setModuleState(moduleId, "initializing");

    try {
      // Create module context
      const context = this.createModuleContext(entry.module, config);
      entry.context = context;

      // Initialize the module
      await entry.module.initialize(context);

      this.setModuleState(moduleId, "ready");

      this.events.emit(REGISTRY_EVENTS.MODULE_LOADED, {
        moduleId,
        version: entry.module.manifest.version,
      });

      log.info({ moduleId }, "Module initialized successfully");
    } catch (error) {
      log.error({ moduleId, error }, "Module initialization failed");
      this.setModuleState(moduleId, "failed", error as Error);
      throw error;
    }
  }

  /**
   * Start a single module.
   */
  private async startModule(moduleId: string): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry) return;

    // Must be in ready state
    if (entry.state !== "ready") {
      if (entry.state === "running") return; // Already running
      throw new Error(
        `Cannot start module '${moduleId}' in state '${entry.state}'`
      );
    }

    log.info({ moduleId }, "Starting module");
    this.setModuleState(moduleId, "starting");

    try {
      await entry.module.start();

      this.setModuleState(moduleId, "running");

      this.events.emit(REGISTRY_EVENTS.MODULE_STARTED, {
        moduleId,
        version: entry.module.manifest.version,
      });

      log.info({ moduleId }, "Module started successfully");
    } catch (error) {
      log.error({ moduleId, error }, "Module start failed");
      this.setModuleState(moduleId, "failed", error as Error);
      throw error;
    }
  }

  /**
   * Create the context object passed to module.initialize().
   */
  private createModuleContext(
    module: IModule,
    config?: Record<string, unknown>
  ): ModuleContext {
    const moduleId = module.manifest.id;

    // Create a scoped router for this module
    const router = Router();
    this.routers.set(moduleId, router);

    // Mount router at /api/modules/{moduleId}/
    this.app.use(`/api/modules/${moduleId}`, router);

    return {
      logger: createModuleLogger(moduleId),
      config: config || {},
      container: this.container,
      events: this.events,
      router,
      app: this.app,
      manifest: module.manifest,
      // siteContext is added per-request by middleware
    };
  }

  /**
   * Unload a module and its dependents.
   *
   * @description Stops and disposes a module. If force is false,
   * also unloads modules that depend on this one.
   *
   * @param moduleId - The module to unload
   * @param force - If true, ignore dependents
   * @returns Array of unloaded module IDs
   *
   * @example
   * ```typescript
   * // Unload with dependents
   * const unloaded = await registry.unload("core-service");
   * console.log("Unloaded:", unloaded);
   * // ["dependent-1", "dependent-2", "core-service"]
   *
   * // Force unload (ignore dependents)
   * const unloaded = await registry.unload("core-service", true);
   * ```
   */
  async unload(moduleId: string, force: boolean = false): Promise<string[]> {
    const entry = this.modules.get(moduleId);
    if (!entry) {
      return [];
    }

    // Get dependents
    const dependents = this.getDependents(moduleId);

    // Check for active dependents
    if (!force && dependents.length > 0) {
      const activeDependents = dependents.filter((id) => {
        const dep = this.modules.get(id);
        return dep && dep.state === "running";
      });

      if (activeDependents.length > 0) {
        // Unload dependents first
        for (const depId of activeDependents) {
          await this.unload(depId, false);
        }
      }
    }

    // Stop the module
    await this.stopModule(moduleId);

    // Dispose the module
    await this.disposeModule(moduleId);

    // Return all unloaded modules
    return [...dependents, moduleId];
  }

  /**
   * Stop a single module.
   */
  private async stopModule(
    moduleId: string,
    timeoutMs: number = DEFAULT_OPERATION_TIMEOUT
  ): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry) return;

    // Only stop if running
    if (entry.state !== "running" && entry.state !== "starting") {
      return;
    }

    log.info({ moduleId }, "Stopping module");
    this.setModuleState(moduleId, "stopping");

    try {
      await entry.module.stop(timeoutMs);

      this.setModuleState(moduleId, "stopped");

      this.events.emit(REGISTRY_EVENTS.MODULE_STOPPED, {
        moduleId,
        version: entry.module.manifest.version,
      });

      log.info({ moduleId }, "Module stopped successfully");
    } catch (error) {
      log.error({ moduleId, error }, "Module stop failed");
      this.setModuleState(moduleId, "failed", error as Error);
      throw error;
    }
  }

  /**
   * Dispose a single module.
   */
  private async disposeModule(moduleId: string): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry) return;

    log.info({ moduleId }, "Disposing module");

    try {
      await entry.module.dispose();

      this.setModuleState(moduleId, "unloaded");

      // Remove router
      this.routers.delete(moduleId);

      this.events.emit(REGISTRY_EVENTS.MODULE_UNLOADED, {
        moduleId,
      });

      log.info({ moduleId }, "Module disposed successfully");
    } catch (error) {
      log.error({ moduleId, error }, "Module dispose failed");
      throw error;
    }
  }

  // =========================================================================
  // HOT-LOADING
  // =========================================================================

  /**
   * Enable a disabled module.
   *
   * @description Enables a module that was previously disabled.
   * The module is loaded and started.
   *
   * @param moduleId - The module to enable
   * @returns true if module was enabled
   *
   * @example
   * ```typescript
   * await registry.enable("messaging");
   * // Module is now running
   * ```
   */
  async enable(moduleId: string): Promise<boolean> {
    const entry = this.modules.get(moduleId);
    if (!entry) {
      log.warn({ moduleId }, "Cannot enable: module not registered");
      return false;
    }

    if (entry.enabled && entry.state === "running") {
      log.debug({ moduleId }, "Module already enabled and running");
      return true;
    }

    entry.enabled = true;

    // Load and start the module
    const result = await this.load(moduleId, { autoStart: true });

    if (result.success) {
      this.events.emit(REGISTRY_EVENTS.MODULE_ENABLED, { moduleId });
      log.info({ moduleId }, "Module enabled");
      return true;
    }

    return false;
  }

  /**
   * Disable an enabled module (hot-unload).
   *
   * @description Disables a module at runtime. The module is stopped
   * and its dependents are also disabled.
   *
   * @param moduleId - The module to disable
   * @returns true if module was disabled
   *
   * @example
   * ```typescript
   * // Disable messaging (and any modules that depend on it)
   * await registry.disable("messaging");
   * // Module is now stopped but still registered
   * ```
   */
  async disable(moduleId: string): Promise<boolean> {
    const entry = this.modules.get(moduleId);
    if (!entry) {
      log.warn({ moduleId }, "Cannot disable: module not registered");
      return false;
    }

    // Check tier - kernel modules cannot be disabled
    if (entry.module.manifest.tier === "kernel") {
      throw new Error(
        `Cannot disable kernel module '${moduleId}'. ` +
        `Kernel modules are required for system operation.`
      );
    }

    // Warn for core modules
    if (entry.module.manifest.tier === "core") {
      log.warn(
        { moduleId },
        "Disabling core module - this may affect system functionality"
      );
    }

    entry.enabled = false;

    // Unload the module (this also handles dependents)
    await this.unload(moduleId, false);

    this.events.emit(REGISTRY_EVENTS.MODULE_DISABLED, { moduleId });
    log.info({ moduleId }, "Module disabled");

    return true;
  }

  // =========================================================================
  // DEPENDENCY RESOLUTION
  // =========================================================================

  /**
   * Resolve the load order for a module and its dependencies.
   *
   * @description Uses Kahn's algorithm for topological sorting.
   * Ensures dependencies are loaded before dependents.
   *
   * @param moduleId - The module to resolve
   * @returns Ordered array of module IDs to load
   * @throws Error if circular dependency detected
   *
   * @example
   * ```typescript
   * const order = registry.resolveLoadOrder("messaging");
   * // ["auth", "websocket", "messaging"]
   * ```
   */
  resolveLoadOrder(moduleId: string): string[] {
    const entry = this.modules.get(moduleId);
    if (!entry) {
      throw new Error(`Module '${moduleId}' is not registered`);
    }

    // Build dependency graph
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    const queue: string[] = [];
    const result: string[] = [];

    // Helper to collect all dependencies recursively
    const collectDeps = (id: string, visited: Set<string>) => {
      if (visited.has(id)) return;
      visited.add(id);

      const mod = this.modules.get(id);
      if (!mod) return;

      const deps = mod.module.manifest.dependencies
        .filter((d) => !d.optional) // Only required deps
        .map((d) => d.moduleId);

      if (!graph.has(id)) {
        graph.set(id, []);
      }

      for (const dep of deps) {
        graph.get(id)!.push(dep);
        collectDeps(dep, visited);
      }
    };

    // Collect the graph
    collectDeps(moduleId, new Set());

    // Initialize in-degrees
    for (const id of graph.keys()) {
      if (!inDegree.has(id)) {
        inDegree.set(id, 0);
      }
    }

    for (const [, deps] of graph) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Find nodes with no incoming edges
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const deps = graph.get(current) || [];
      for (const dep of deps) {
        const newDegree = inDegree.get(dep)! - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }

    // Check for cycles
    if (result.length !== graph.size) {
      const remaining = Array.from(graph.keys()).filter(
        (id) => !result.includes(id)
      );
      throw new Error(
        `Circular dependency detected involving: ${remaining.join(", ")}`
      );
    }

    // Reverse to get load order (dependencies first)
    return result.reverse();
  }

  /**
   * Check for missing dependencies.
   */
  private checkMissingDependencies(moduleId: string): ModuleDependency[] {
    const entry = this.modules.get(moduleId);
    if (!entry) return [];

    const missing: ModuleDependency[] = [];

    for (const dep of entry.module.manifest.dependencies) {
      if (dep.optional) continue; // Skip optional deps

      const depEntry = this.modules.get(dep.moduleId);
      if (!depEntry) {
        missing.push(dep);
        continue;
      }

      // Check version compatibility
      if (!semver.satisfies(depEntry.module.manifest.version, dep.version)) {
        missing.push({
          ...dep,
          reason: `Version mismatch: requires ${dep.version}, found ${depEntry.module.manifest.version}`,
        });
      }
    }

    return missing;
  }

  /**
   * Get modules that depend on a given module.
   *
   * @param moduleId - The module ID
   * @returns Array of dependent module IDs
   */
  getDependents(moduleId: string): string[] {
    const dependents: string[] = [];

    for (const [id, entry] of this.modules) {
      if (id === moduleId) continue;

      const deps = entry.module.manifest.dependencies;
      if (deps.some((d) => d.moduleId === moduleId && !d.optional)) {
        dependents.push(id);
      }
    }

    return dependents;
  }

  /**
   * Get a module's dependencies.
   */
  getDependencies(moduleId: string): ModuleDependency[] {
    const entry = this.modules.get(moduleId);
    if (!entry) return [];
    return entry.module.manifest.dependencies;
  }

  // =========================================================================
  // QUERY METHODS
  // =========================================================================

  /**
   * Get a module by ID.
   */
  get(moduleId: string): ModuleEntry | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Check if a module is registered.
   */
  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * List all registered modules.
   */
  listModules(): ModuleEntry[] {
    return Array.from(this.modules.values());
  }

  /**
   * List modules by tier.
   */
  listByTier(tier: ModuleTier): ModuleEntry[] {
    return Array.from(this.modules.values()).filter(
      (entry) => entry.module.manifest.tier === tier
    );
  }

  // =========================================================================
  // HEALTH MONITORING
  // =========================================================================

  /**
   * Check health of all modules.
   *
   * @returns Map of module ID to health status
   */
  async checkHealth(): Promise<Map<string, ModuleHealth>> {
    const results = new Map<string, ModuleHealth>();

    for (const [id, entry] of this.modules) {
      if (entry.state !== "running") {
        results.set(id, {
          status: entry.state === "failed" ? "unhealthy" : "degraded",
          message: `Module is in state: ${entry.state}`,
          timestamp: new Date(),
        });
        continue;
      }

      if (entry.module.healthCheck) {
        try {
          const health = await entry.module.healthCheck();
          results.set(id, health);
          entry.health = health;

          // Emit event if health changed
          if (
            entry.health?.status !== health.status
          ) {
            this.events.emit(REGISTRY_EVENTS.MODULE_HEALTH_CHANGED, {
              moduleId: id,
              previousStatus: entry.health?.status,
              currentStatus: health.status,
            });
          }
        } catch (error) {
          results.set(id, {
            status: "unhealthy",
            message: `Health check failed: ${error}`,
            timestamp: new Date(),
          });
        }
      } else {
        results.set(id, {
          status: "healthy",
          message: "No health check defined",
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Update a module's state.
   */
  private setModuleState(
    moduleId: string,
    state: ModuleState,
    error?: Error
  ): void {
    const entry = this.modules.get(moduleId);
    if (!entry) return;

    entry.state = state;
    entry.lastStateChange = new Date();

    if (error) {
      entry.error = error;
      this.events.emit(REGISTRY_EVENTS.MODULE_FAILED, {
        moduleId,
        error: error.message,
      });
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new module registry.
 *
 * @param container - DI container
 * @param events - Event bus
 * @param app - Express app
 * @returns A new ModuleRegistry instance
 */
export function createModuleRegistry(
  container: IContainer,
  events: IEventBus,
  app: Express
): IModuleRegistry {
  return new ModuleRegistry(container, events, app);
}
