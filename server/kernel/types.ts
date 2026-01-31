/**
 * @file types.ts
 * @description Core type definitions for the RSES CMS Module Kernel.
 *
 * This file defines the fundamental types that power the plug-and-play module
 * system. The kernel is the heart of the CMS - it provides:
 *
 * 1. **Module Lifecycle Management** - Loading, starting, stopping modules
 * 2. **Dependency Injection** - Service registration and resolution
 * 3. **Event Bus** - Cross-module communication
 * 4. **Hot-Loading** - Enable/disable modules without restart
 *
 * @module kernel/types
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 *
 * @architecture
 * The module system follows a four-tier hierarchy:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    MODULE HIERARCHY                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │  KERNEL (Immutable)     │ Cannot be disabled, core system   │
 * │  └─ DI Container        │                                   │
 * │  └─ Event Bus           │                                   │
 * │  └─ Module Registry     │                                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │  CORE (Limited Toggle)  │ Can disable with warnings         │
 * │  └─ Authentication      │                                   │
 * │  └─ Content Service     │                                   │
 * │  └─ Taxonomy Engine     │                                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │  OPTIONAL (Full Toggle) │ Can freely enable/disable         │
 * │  └─ Messaging           │                                   │
 * │  └─ AI Assistant        │                                   │
 * │  └─ Social Media        │                                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │  THIRD-PARTY (Sandboxed)│ Run in isolation, verified        │
 * │  └─ Custom Plugins      │                                   │
 * │  └─ Community Modules   │                                   │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */

import type { Logger } from "pino";
import type { Express, Router } from "express";
import type { z } from "zod";

// =============================================================================
// MODULE TYPES
// =============================================================================

/**
 * The four tiers of modules in the system.
 *
 * @description
 * - `kernel`: Core system components that cannot be disabled. The DI container,
 *   event bus, and module registry itself are kernel modules.
 *
 * - `core`: Essential CMS features that can be disabled but with warnings.
 *   Disabling these may break expected functionality. Examples: auth, content.
 *
 * - `optional`: Features that can be freely toggled. The system works fine
 *   without them. Examples: messaging, AI assistant, social media.
 *
 * - `third-party`: External modules that run in a sandbox with limited
 *   permissions. These are verified and signed before installation.
 */
export type ModuleTier = "kernel" | "core" | "optional" | "third-party";

/**
 * Current state of a module in the lifecycle.
 *
 * @description State transitions:
 * ```
 *   registered → initializing → ready → starting → running
 *                                   ↓              ↓
 *                                 failed ←── stopping → stopped
 *                                   ↓              ↓
 *                               unloaded ←────────┘
 * ```
 *
 * - `registered`: Module is known but not yet initialized
 * - `initializing`: Module is setting up (loading config, validating deps)
 * - `ready`: Module is initialized and ready to start
 * - `starting`: Module is in the process of starting
 * - `running`: Module is active and processing requests
 * - `stopping`: Module is shutting down gracefully
 * - `stopped`: Module has been stopped but can be restarted
 * - `failed`: Module encountered an error (check `error` field)
 * - `unloaded`: Module has been completely removed from memory
 */
export type ModuleState =
  | "registered"
  | "initializing"
  | "ready"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed"
  | "unloaded";

/**
 * Permission levels for module capabilities.
 *
 * @description Security model:
 * - `normal`: Standard operations - read content, emit events, call APIs
 * - `elevated`: Sensitive operations - write content, access other modules
 * - `dangerous`: System-level - file system access, exec commands, network
 *
 * Third-party modules are limited to `normal` permissions by default.
 * Only verified and admin-approved modules can request `elevated` or `dangerous`.
 */
export type PermissionLevel = "normal" | "elevated" | "dangerous";

// =============================================================================
// MODULE MANIFEST
// =============================================================================

/**
 * A dependency declaration in a module manifest.
 *
 * @description Uses semantic versioning (semver) for version constraints:
 * - `^1.0.0` - Compatible with 1.x.x (minor/patch updates OK)
 * - `~1.0.0` - Compatible with 1.0.x (patch updates only)
 * - `>=1.0.0 <2.0.0` - Range constraint
 * - `1.0.0` - Exact version match
 *
 * @example
 * ```typescript
 * const dependency: ModuleDependency = {
 *   moduleId: "auth",
 *   version: "^2.0.0",
 *   optional: false,
 *   reason: "Required for user authentication in messaging"
 * };
 * ```
 */
export interface ModuleDependency {
  /** The unique identifier of the required module */
  moduleId: string;

  /** Semver version constraint (e.g., "^1.0.0", ">=2.0.0 <3.0.0") */
  version: string;

  /**
   * If true, the module can function without this dependency.
   * The module should gracefully degrade when optional deps are missing.
   */
  optional?: boolean;

  /** Human-readable explanation of why this dependency is needed */
  reason?: string;
}

/**
 * A permission request in a module manifest.
 *
 * @description Modules must declare all permissions they need upfront.
 * The admin interface shows these permissions during module installation.
 * Users can reject modules that request excessive permissions.
 *
 * @example
 * ```typescript
 * const permission: ModulePermission = {
 *   capability: "file:read",
 *   level: "elevated",
 *   resources: ["/uploads/*", "/media/*"],
 *   reason: "Needs to read uploaded files for media processing"
 * };
 * ```
 */
export interface ModulePermission {
  /**
   * The capability being requested. Common capabilities:
   * - `content:read` / `content:write` - Content operations
   * - `user:read` / `user:write` - User data access
   * - `file:read` / `file:write` - File system operations
   * - `network:outbound` - External HTTP requests
   * - `exec:command` - Execute shell commands
   * - `module:communicate` - Cross-module messaging
   */
  capability: string;

  /** The permission level required for this capability */
  level: PermissionLevel;

  /**
   * Optional resource patterns this permission applies to.
   * Uses glob patterns for matching (e.g., "/api/v1/*").
   */
  resources?: string[];

  /** Human-readable explanation of why this permission is needed */
  reason: string;
}

/**
 * The module manifest - the "package.json" of a module.
 *
 * @description Every module must have a manifest that declares:
 * - What the module is and what it does
 * - What other modules it depends on
 * - What permissions it requires
 * - How to configure it
 * - What events it emits and listens to
 *
 * The manifest is validated by Zod schema before the module is loaded.
 * Invalid manifests are rejected with detailed error messages.
 *
 * @example
 * ```typescript
 * const manifest: ModuleManifest = {
 *   id: "messaging",
 *   name: "Real-Time Messaging",
 *   version: "1.0.0",
 *   description: "Slack-like messaging with channels, threads, and E2E encryption",
 *   tier: "optional",
 *   author: {
 *     name: "RSES Team",
 *     email: "team@rses.dev"
 *   },
 *   dependencies: [
 *     { moduleId: "auth", version: "^2.0.0" },
 *     { moduleId: "websocket", version: "^1.0.0" }
 *   ],
 *   permissions: [
 *     { capability: "user:read", level: "normal", reason: "Display user names" }
 *   ],
 *   configSchema: messagingConfigSchema,
 *   exports: ["MessagingService", "Channel", "Message"],
 *   events: {
 *     emits: ["message:sent", "message:received", "channel:created"],
 *     listens: ["user:online", "user:offline"]
 *   }
 * };
 * ```
 */
export interface ModuleManifest {
  /**
   * Unique identifier for the module.
   * Must be lowercase alphanumeric with hyphens (e.g., "ai-assistant").
   * This ID is used for dependency resolution and registry lookups.
   */
  id: string;

  /** Human-readable display name */
  name: string;

  /** Semantic version (e.g., "1.0.0", "2.1.3-beta.1") */
  version: string;

  /** Detailed description of what the module does */
  description: string;

  /** The tier this module belongs to */
  tier: ModuleTier;

  /** Author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /**
   * License identifier (SPDX format recommended).
   * Examples: "MIT", "Apache-2.0", "GPL-3.0-only"
   */
  license?: string;

  /** URL to the module's homepage or repository */
  homepage?: string;

  /** Modules this module depends on */
  dependencies: ModuleDependency[];

  /** Permissions this module requires */
  permissions: ModulePermission[];

  /**
   * Zod schema for module configuration.
   * Used to validate config before module initialization.
   */
  configSchema?: z.ZodType<unknown>;

  /**
   * Names of classes/functions this module exports.
   * Used for documentation and IDE autocomplete.
   */
  exports?: string[];

  /** Event declarations for the event bus */
  events?: {
    /** Events this module emits */
    emits?: string[];
    /** Events this module listens to */
    listens?: string[];
  };

  /**
   * Categories/tags for module discovery.
   * Examples: ["communication", "ai", "media", "analytics"]
   */
  tags?: string[];

  /**
   * Minimum Node.js version required.
   * Uses semver (e.g., ">=18.0.0", "^20.0.0").
   */
  engines?: {
    node?: string;
  };
}

// =============================================================================
// MODULE INSTANCE
// =============================================================================

/**
 * Context provided to modules during initialization.
 *
 * @description The kernel passes this context to every module's `initialize()`
 * method. It provides everything a module needs to integrate with the system:
 *
 * - **Logger**: Pre-configured with module name for structured logging
 * - **Config**: Validated configuration from admin/environment
 * - **Container**: DI container for accessing other services
 * - **Events**: Event bus for publishing and subscribing to events
 * - **Express**: Router for registering HTTP endpoints
 *
 * @example
 * ```typescript
 * class MessagingModule implements IModule {
 *   async initialize(context: ModuleContext): Promise<void> {
 *     context.logger.info("Initializing messaging module");
 *
 *     // Register routes
 *     context.router.get("/channels", this.listChannels);
 *
 *     // Subscribe to events
 *     context.events.on("user:online", this.handleUserOnline);
 *
 *     // Access other services
 *     this.auth = context.container.resolve("AuthService");
 *   }
 * }
 * ```
 */
export interface ModuleContext {
  /**
   * Pre-configured logger with module name.
   * All logs automatically include the module context.
   */
  logger: Logger;

  /**
   * Validated module configuration.
   * Type matches the module's configSchema if provided.
   */
  config: Record<string, unknown>;

  /**
   * DI container for resolving dependencies.
   * Use this to get instances of other services.
   */
  container: IContainer;

  /**
   * Event bus for cross-module communication.
   * Subscribe to events or publish your own.
   */
  events: IEventBus;

  /**
   * Express router scoped to this module.
   * Routes are automatically prefixed with `/api/modules/{moduleId}/`.
   */
  router: Router;

  /**
   * Reference to the main Express app.
   * Use sparingly - prefer the scoped router for most cases.
   */
  app: Express;

  /**
   * The module's own manifest for self-reference.
   */
  manifest: ModuleManifest;

  /**
   * Site context for multi-site deployments.
   * Contains current site ID, domain, and tenant information.
   */
  siteContext?: ISiteContext;
}

/**
 * Interface that all modules must implement.
 *
 * @description Modules follow a strict lifecycle:
 *
 * 1. **Constructor**: Create instance with manifest
 * 2. **initialize()**: Set up resources, register routes, subscribe to events
 * 3. **start()**: Begin processing (called after all deps are ready)
 * 4. **stop()**: Gracefully shut down
 * 5. **dispose()**: Clean up all resources
 *
 * The kernel orchestrates this lifecycle, ensuring dependencies are
 * initialized before dependents and disposed in reverse order.
 *
 * @example
 * ```typescript
 * export class MessagingModule implements IModule {
 *   public readonly manifest: ModuleManifest = {
 *     id: "messaging",
 *     name: "Real-Time Messaging",
 *     version: "1.0.0",
 *     // ... rest of manifest
 *   };
 *
 *   private service: MessagingService | null = null;
 *
 *   async initialize(context: ModuleContext): Promise<void> {
 *     this.service = new MessagingService(context);
 *     context.container.register("MessagingService", this.service);
 *     context.router.use("/", this.service.createRouter());
 *   }
 *
 *   async start(): Promise<void> {
 *     await this.service?.connect();
 *   }
 *
 *   async stop(): Promise<void> {
 *     await this.service?.disconnect();
 *   }
 *
 *   async dispose(): Promise<void> {
 *     this.service = null;
 *   }
 *
 *   async healthCheck(): Promise<ModuleHealth> {
 *     return {
 *       status: this.service?.isConnected ? "healthy" : "degraded",
 *       message: "Messaging service operational"
 *     };
 *   }
 * }
 * ```
 */
export interface IModule {
  /** The module's manifest */
  readonly manifest: ModuleManifest;

  /**
   * Initialize the module with the provided context.
   *
   * @description This is where modules should:
   * - Set up internal state
   * - Register services with the DI container
   * - Mount routes on the router
   * - Subscribe to events
   * - Load configuration
   *
   * Do NOT start background processes here - that's for `start()`.
   *
   * @param context - The module context from the kernel
   * @throws Error if initialization fails (module enters "failed" state)
   */
  initialize(context: ModuleContext): Promise<void>;

  /**
   * Start the module's runtime operations.
   *
   * @description Called after all dependencies have been initialized.
   * This is where modules should:
   * - Start background workers
   * - Open database connections
   * - Begin listening for events
   * - Start timers/intervals
   */
  start(): Promise<void>;

  /**
   * Gracefully stop the module.
   *
   * @description Called during shutdown or when the module is disabled.
   * Modules should:
   * - Stop accepting new requests
   * - Complete in-flight operations (with timeout)
   * - Close connections
   * - Stop timers/intervals
   *
   * @param timeoutMs - Maximum time to wait for graceful shutdown
   */
  stop(timeoutMs?: number): Promise<void>;

  /**
   * Clean up all resources.
   *
   * @description Called after stop() when the module is being unloaded.
   * Release all references to allow garbage collection.
   * This is the final lifecycle method called.
   */
  dispose(): Promise<void>;

  /**
   * Report the module's health status.
   *
   * @description Called periodically by the kernel's health check system.
   * Return current status and any relevant metrics.
   *
   * @returns Health status with optional details
   */
  healthCheck?(): Promise<ModuleHealth>;

  /**
   * Handle configuration updates at runtime.
   *
   * @description Called when an admin updates the module's configuration.
   * The new config has already been validated against the schema.
   *
   * @param newConfig - The updated configuration
   * @returns true if hot-reload succeeded, false to require restart
   */
  onConfigChange?(newConfig: Record<string, unknown>): Promise<boolean>;
}

/**
 * Health status reported by a module.
 */
export interface ModuleHealth {
  /**
   * Current health state:
   * - `healthy`: Operating normally
   * - `degraded`: Working but with issues (e.g., high latency)
   * - `unhealthy`: Not functioning properly
   */
  status: "healthy" | "degraded" | "unhealthy";

  /** Human-readable status message */
  message?: string;

  /** Optional metrics (latency, queue size, etc.) */
  metrics?: Record<string, number>;

  /** Timestamp of this health check */
  timestamp?: Date;

  /** Details about any issues */
  issues?: string[];
}

/**
 * Runtime state of a registered module.
 *
 * @description The registry maintains this state for each module.
 * It tracks the module instance, current state, and metadata.
 */
export interface ModuleEntry {
  /** The module instance */
  module: IModule;

  /** Current lifecycle state */
  state: ModuleState;

  /** When the module was registered */
  registeredAt: Date;

  /** When the module last changed state */
  lastStateChange: Date;

  /** Error information if state is "failed" */
  error?: Error;

  /** Last health check result */
  health?: ModuleHealth;

  /** Whether the module is currently enabled in admin settings */
  enabled: boolean;

  /** The context passed to initialize() */
  context?: ModuleContext;
}

// =============================================================================
// DEPENDENCY INJECTION CONTAINER
// =============================================================================

/**
 * Lifetime of a registered service.
 *
 * @description Controls how instances are created and shared:
 *
 * - `singleton`: One instance for the entire application lifetime.
 *   Use for stateful services like database connections.
 *
 * - `scoped`: One instance per scope (typically per request).
 *   Use for request-specific services like user context.
 *
 * - `transient`: New instance every time it's resolved.
 *   Use for stateless utilities or factories.
 */
export type ServiceLifetime = "singleton" | "scoped" | "transient";

/**
 * A factory function that creates service instances.
 *
 * @description The container calls this when resolving a transient
 * or first-time singleton/scoped service.
 *
 * @param container - The container for resolving dependencies
 * @returns The service instance
 */
export type ServiceFactory<T> = (container: IContainer) => T;

/**
 * Registration options for a service.
 */
export interface ServiceRegistration<T = unknown> {
  /** Token/key used to identify this service */
  token: string | symbol;

  /** How instances are managed */
  lifetime: ServiceLifetime;

  /** Either a concrete instance or a factory function */
  implementation: T | ServiceFactory<T>;

  /** Whether this is a factory (vs concrete instance) */
  isFactory: boolean;

  /** Module that registered this service (for tracking) */
  registeredBy?: string;
}

/**
 * Interface for the Dependency Injection container.
 *
 * @description The DI container is the central service registry.
 * Modules register their services here, and other modules resolve them.
 *
 * Key features:
 * - Type-safe resolution with generics
 * - Lifetime management (singleton, scoped, transient)
 * - Circular dependency detection
 * - Scoped containers for request isolation
 *
 * @example
 * ```typescript
 * // Registration
 * container.registerSingleton("DatabasePool", new Pool(config));
 * container.registerFactory("UserRepository", (c) =>
 *   new UserRepository(c.resolve("DatabasePool"))
 * );
 *
 * // Resolution
 * const repo = container.resolve<UserRepository>("UserRepository");
 *
 * // Scoped resolution (per-request)
 * const scoped = container.createScope();
 * scoped.registerScoped("CurrentUser", user);
 * ```
 */
export interface IContainer {
  /**
   * Register a singleton instance.
   * The same instance is returned for all resolutions.
   *
   * @param token - Unique identifier for the service
   * @param instance - The singleton instance
   * @param registeredBy - Optional module ID for tracking
   */
  registerSingleton<T>(token: string | symbol, instance: T, registeredBy?: string): void;

  /**
   * Register a factory that creates new instances.
   *
   * @param token - Unique identifier for the service
   * @param factory - Function that creates instances
   * @param lifetime - How to manage created instances
   * @param registeredBy - Optional module ID for tracking
   */
  registerFactory<T>(
    token: string | symbol,
    factory: ServiceFactory<T>,
    lifetime?: ServiceLifetime,
    registeredBy?: string
  ): void;

  /**
   * Resolve a service by token.
   *
   * @param token - The service identifier
   * @returns The service instance
   * @throws Error if service is not registered
   */
  resolve<T>(token: string | symbol): T;

  /**
   * Try to resolve a service, returning undefined if not found.
   *
   * @param token - The service identifier
   * @returns The service instance or undefined
   */
  tryResolve<T>(token: string | symbol): T | undefined;

  /**
   * Check if a service is registered.
   *
   * @param token - The service identifier
   * @returns true if registered
   */
  has(token: string | symbol): boolean;

  /**
   * Create a child scope for request-isolated services.
   *
   * @description Scoped services are unique within each scope.
   * Child scopes inherit parent registrations but can override them.
   *
   * @returns A new scoped container
   */
  createScope(): IContainer;

  /**
   * Unregister a service.
   *
   * @param token - The service identifier
   * @returns true if the service was removed
   */
  unregister(token: string | symbol): boolean;

  /**
   * Get all registered service tokens.
   *
   * @returns Array of registered tokens
   */
  getRegisteredTokens(): (string | symbol)[];

  /**
   * Dispose all services that implement IDisposable.
   * Called during shutdown.
   */
  dispose(): Promise<void>;
}

// =============================================================================
// EVENT BUS
// =============================================================================

/**
 * Payload structure for events.
 *
 * @description All events have a standard envelope with:
 * - Type information for routing
 * - Timestamp for ordering
 * - Optional source and correlation ID for tracing
 * - The actual data payload
 */
export interface EventPayload<T = unknown> {
  /** The event type/name (e.g., "message:sent") */
  type: string;

  /** The event data */
  data: T;

  /** When the event was created */
  timestamp: Date;

  /** Module that emitted the event */
  source?: string;

  /** Correlation ID for request tracing */
  correlationId?: string;

  /** Site ID for multi-site deployments */
  siteId?: string;
}

/**
 * Event handler function signature.
 */
export type EventHandler<T = unknown> = (event: EventPayload<T>) => void | Promise<void>;

/**
 * Subscription handle for unsubscribing from events.
 */
export interface EventSubscription {
  /** Unsubscribe from the event */
  unsubscribe(): void;

  /** The event type this subscription is for */
  eventType: string;

  /** When the subscription was created */
  subscribedAt: Date;
}

/**
 * Options for event subscription.
 */
export interface SubscriptionOptions {
  /**
   * If true, handler is called once then automatically unsubscribed.
   */
  once?: boolean;

  /**
   * Priority for handler ordering (higher = earlier).
   * Default is 0.
   */
  priority?: number;

  /**
   * Filter function to selectively handle events.
   * Return true to handle, false to skip.
   */
  filter?: (event: EventPayload) => boolean;
}

/**
 * Options for emitting events.
 */
export interface EmitOptions {
  /**
   * If true, wait for all handlers to complete before returning.
   * Default is false (fire-and-forget).
   */
  sync?: boolean;

  /**
   * If true, continue executing handlers even if one throws.
   * Default is true.
   */
  continueOnError?: boolean;

  /**
   * Timeout in ms for sync execution.
   */
  timeout?: number;
}

/**
 * Interface for the Event Bus.
 *
 * @description The event bus enables loose coupling between modules.
 * Modules emit events when things happen, and other modules subscribe
 * to react to those events.
 *
 * Pattern: Publish/Subscribe (Pub/Sub)
 *
 * Key features:
 * - Type-safe events with generics
 * - Async handlers with error isolation
 * - Event history for debugging
 * - Wildcard subscriptions
 *
 * @example
 * ```typescript
 * // Publishing events
 * events.emit("message:sent", {
 *   channelId: "general",
 *   content: "Hello, world!",
 *   authorId: "user-123"
 * });
 *
 * // Subscribing to events
 * const sub = events.on("message:sent", async (event) => {
 *   console.log(`New message: ${event.data.content}`);
 *   await notifySubscribers(event.data.channelId);
 * });
 *
 * // Cleanup
 * sub.unsubscribe();
 *
 * // Wildcard subscription (all message events)
 * events.on("message:*", (event) => {
 *   metrics.increment(`messages.${event.type}`);
 * });
 * ```
 */
export interface IEventBus {
  /**
   * Subscribe to an event type.
   *
   * @param eventType - The event type to listen for (supports wildcards)
   * @param handler - Function to call when event is emitted
   * @param options - Subscription options
   * @returns Subscription handle for unsubscribing
   */
  on<T = unknown>(
    eventType: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription;

  /**
   * Subscribe to an event type for one occurrence only.
   *
   * @param eventType - The event type to listen for
   * @param handler - Function to call when event is emitted
   * @returns Subscription handle
   */
  once<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): EventSubscription;

  /**
   * Unsubscribe a handler from an event type.
   *
   * @param eventType - The event type
   * @param handler - The handler to remove
   * @returns true if handler was removed
   */
  off<T = unknown>(eventType: string, handler: EventHandler<T>): boolean;

  /**
   * Emit an event to all subscribers.
   *
   * @param eventType - The event type
   * @param data - The event payload
   * @param options - Emit options
   * @returns Promise that resolves when all handlers complete (if sync)
   */
  emit<T = unknown>(eventType: string, data: T, options?: EmitOptions): Promise<void>;

  /**
   * Get the number of subscribers for an event type.
   *
   * @param eventType - The event type
   * @returns Number of active subscriptions
   */
  listenerCount(eventType: string): number;

  /**
   * Get all event types with active subscribers.
   *
   * @returns Array of event type names
   */
  eventTypes(): string[];

  /**
   * Remove all subscribers for an event type.
   *
   * @param eventType - The event type to clear
   */
  removeAllListeners(eventType?: string): void;

  /**
   * Get recent event history for debugging.
   *
   * @param limit - Maximum number of events to return
   * @param eventType - Optional filter by event type
   * @returns Recent events
   */
  getHistory(limit?: number, eventType?: string): EventPayload[];
}

// =============================================================================
// MODULE REGISTRY
// =============================================================================

/**
 * Options for loading a module.
 */
export interface LoadModuleOptions {
  /** Module configuration to pass to initialize() */
  config?: Record<string, unknown>;

  /** Whether to auto-start after initialization */
  autoStart?: boolean;

  /** Whether this module is enabled (can be disabled in admin) */
  enabled?: boolean;
}

/**
 * Result of attempting to load a module.
 */
export interface LoadModuleResult {
  /** Whether the load succeeded */
  success: boolean;

  /** The module ID */
  moduleId: string;

  /** Error message if failed */
  error?: string;

  /** Missing dependencies if any */
  missingDependencies?: ModuleDependency[];

  /** Dependency resolution order */
  loadOrder?: string[];
}

/**
 * Interface for the Module Registry.
 *
 * @description The registry tracks all modules and their states.
 * It handles:
 * - Module registration and discovery
 * - Dependency resolution (topological sort)
 * - Hot-loading (enable/disable without restart)
 * - Health monitoring
 *
 * @example
 * ```typescript
 * // Register a module
 * registry.register(new MessagingModule());
 *
 * // Load with dependencies
 * const result = await registry.load("messaging", { autoStart: true });
 * if (!result.success) {
 *   console.error(`Failed to load: ${result.error}`);
 * }
 *
 * // Hot-disable
 * await registry.disable("messaging");
 *
 * // List all modules
 * const modules = registry.listModules();
 * ```
 */
export interface IModuleRegistry {
  /**
   * Register a module with the registry.
   *
   * @param module - The module to register
   * @throws Error if module with same ID already exists
   */
  register(module: IModule): void;

  /**
   * Unregister a module from the registry.
   * Module must be stopped first.
   *
   * @param moduleId - The module to unregister
   * @returns true if module was removed
   */
  unregister(moduleId: string): Promise<boolean>;

  /**
   * Load and initialize a module with its dependencies.
   *
   * @param moduleId - The module to load
   * @param options - Load options
   * @returns Result indicating success or failure
   */
  load(moduleId: string, options?: LoadModuleOptions): Promise<LoadModuleResult>;

  /**
   * Unload a module and its dependents.
   *
   * @param moduleId - The module to unload
   * @param force - If true, force unload even with active dependents
   * @returns Array of unloaded module IDs
   */
  unload(moduleId: string, force?: boolean): Promise<string[]>;

  /**
   * Enable a disabled module.
   *
   * @param moduleId - The module to enable
   * @returns true if module was enabled
   */
  enable(moduleId: string): Promise<boolean>;

  /**
   * Disable an enabled module (hot-unload).
   *
   * @param moduleId - The module to disable
   * @returns true if module was disabled
   */
  disable(moduleId: string): Promise<boolean>;

  /**
   * Get a module by ID.
   *
   * @param moduleId - The module ID
   * @returns The module entry or undefined
   */
  get(moduleId: string): ModuleEntry | undefined;

  /**
   * Check if a module is registered.
   *
   * @param moduleId - The module ID
   * @returns true if registered
   */
  has(moduleId: string): boolean;

  /**
   * List all registered modules.
   *
   * @returns Array of module entries
   */
  listModules(): ModuleEntry[];

  /**
   * List modules by tier.
   *
   * @param tier - The tier to filter by
   * @returns Array of module entries in that tier
   */
  listByTier(tier: ModuleTier): ModuleEntry[];

  /**
   * Get modules that depend on a given module.
   *
   * @param moduleId - The module ID
   * @returns Array of dependent module IDs
   */
  getDependents(moduleId: string): string[];

  /**
   * Get a module's dependencies.
   *
   * @param moduleId - The module ID
   * @returns Array of dependency info
   */
  getDependencies(moduleId: string): ModuleDependency[];

  /**
   * Resolve the load order for a module and its dependencies.
   * Uses topological sort to ensure correct ordering.
   *
   * @param moduleId - The module to resolve
   * @returns Ordered array of module IDs to load
   * @throws Error if circular dependency detected
   */
  resolveLoadOrder(moduleId: string): string[];

  /**
   * Check health of all modules.
   *
   * @returns Map of module ID to health status
   */
  checkHealth(): Promise<Map<string, ModuleHealth>>;
}

// =============================================================================
// API GATEWAY
// =============================================================================

/**
 * Rate limit configuration for an endpoint.
 */
export interface RateLimitConfig {
  /** Maximum requests allowed */
  maxRequests: number;

  /** Time window in seconds */
  windowSeconds: number;

  /** Whether to apply per-user (vs global) */
  perUser?: boolean;
}

/**
 * Authentication requirements for an endpoint.
 */
export interface AuthRequirement {
  /** Whether authentication is required */
  required: boolean;

  /** Required roles (any of these) */
  roles?: string[];

  /** Required permissions (all of these) */
  permissions?: string[];

  /** Required scopes for OAuth */
  scopes?: string[];
}

/**
 * Registered route in the gateway.
 */
export interface GatewayRoute {
  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Route path pattern */
  path: string;

  /** Module that registered this route */
  moduleId: string;

  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;

  /** Authentication requirements */
  auth?: AuthRequirement;

  /** Route description for documentation */
  description?: string;

  /** Tags for API documentation */
  tags?: string[];
}

/**
 * Interface for the API Gateway.
 *
 * @description The gateway is the single entry point for all API requests.
 * It provides:
 * - Route registration and versioning
 * - Authentication enforcement
 * - Rate limiting
 * - Request/response transformation
 * - API documentation generation
 *
 * Modules register their routes through the gateway, which ensures
 * consistent behavior across all endpoints.
 *
 * @example
 * ```typescript
 * // Register a route
 * gateway.registerRoute({
 *   method: "GET",
 *   path: "/v1/messages/:channelId",
 *   moduleId: "messaging",
 *   auth: { required: true, roles: ["user"] },
 *   rateLimit: { maxRequests: 100, windowSeconds: 60 }
 * });
 *
 * // Generate OpenAPI spec
 * const spec = gateway.generateOpenApiSpec();
 * ```
 */
export interface IApiGateway {
  /**
   * Register a route with the gateway.
   *
   * @param route - Route configuration
   */
  registerRoute(route: GatewayRoute): void;

  /**
   * Unregister all routes for a module.
   *
   * @param moduleId - The module whose routes to remove
   */
  unregisterModuleRoutes(moduleId: string): void;

  /**
   * Get all registered routes.
   *
   * @returns Array of route configurations
   */
  getRoutes(): GatewayRoute[];

  /**
   * Get routes for a specific module.
   *
   * @param moduleId - The module ID
   * @returns Array of routes for that module
   */
  getModuleRoutes(moduleId: string): GatewayRoute[];

  /**
   * Generate OpenAPI 3.0 specification.
   *
   * @returns OpenAPI spec as JSON object
   */
  generateOpenApiSpec(): Record<string, unknown>;

  /**
   * Get gateway middleware for Express.
   *
   * @returns Express middleware that handles routing
   */
  middleware(): Express;
}

// =============================================================================
// SITE CONTEXT (MULTI-SITE)
// =============================================================================

/**
 * Site context for multi-site deployments.
 *
 * @description In multi-site mode, each request is associated with a site.
 * The site context provides information about the current site and is
 * available throughout the request lifecycle via AsyncLocalStorage.
 */
export interface ISiteContext {
  /** Unique site identifier */
  siteId: string;

  /** Site domain (e.g., "example.com") */
  domain: string;

  /** Display name of the site */
  name: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId: string;

  /** Site-specific configuration */
  config: Record<string, unknown>;

  /** Site's timezone */
  timezone: string;

  /** Site's locale */
  locale: string;

  /** Whether site is in maintenance mode */
  maintenanceMode: boolean;
}

// =============================================================================
// BOOTSTRAP / KERNEL
// =============================================================================

/**
 * Kernel configuration options.
 */
export interface KernelConfig {
  /**
   * Directory containing module files.
   * Modules are auto-discovered from this directory.
   */
  modulesDir: string;

  /**
   * Whether to auto-load modules on startup.
   * If false, modules must be explicitly loaded.
   */
  autoLoad?: boolean;

  /**
   * Modules to load on startup (if autoLoad is true).
   * If not specified, all discovered modules are loaded.
   */
  enabledModules?: string[];

  /**
   * Modules to never load.
   * Useful for disabling problematic third-party modules.
   */
  disabledModules?: string[];

  /**
   * Global module configuration.
   * Keys are module IDs, values are config objects.
   */
  moduleConfigs?: Record<string, Record<string, unknown>>;

  /**
   * Express app instance.
   * If not provided, a new app is created.
   */
  app?: Express;

  /**
   * Shutdown timeout in milliseconds.
   * Default is 30000 (30 seconds).
   */
  shutdownTimeout?: number;

  /**
   * Health check interval in milliseconds.
   * Default is 30000 (30 seconds).
   */
  healthCheckInterval?: number;
}

/**
 * Bootstrap result containing initialized kernel components.
 */
export interface BootstrapResult {
  /** The DI container */
  container: IContainer;

  /** The event bus */
  events: IEventBus;

  /** The module registry */
  registry: IModuleRegistry;

  /** The API gateway */
  gateway: IApiGateway;

  /** The Express app */
  app: Express;

  /** Shutdown function for graceful termination */
  shutdown: () => Promise<void>;
}

/**
 * Interface that disposable resources should implement.
 */
export interface IDisposable {
  dispose(): Promise<void>;
}

/**
 * Type guard to check if an object is disposable.
 */
export function isDisposable(obj: unknown): obj is IDisposable {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "dispose" in obj &&
    typeof (obj as IDisposable).dispose === "function"
  );
}
