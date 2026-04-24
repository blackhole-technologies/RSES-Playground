/**
 * @file container.ts
 * @description Dependency Injection (DI) Container for the RSES CMS Kernel.
 *
 * The DI container is a registry of services that can be resolved by their
 * token (identifier). It supports three service lifetimes:
 *
 * 1. **Singleton**: One instance for the application lifetime
 * 2. **Scoped**: One instance per scope (typically per HTTP request)
 * 3. **Transient**: New instance every resolution
 *
 * ## Why DI?
 *
 * Dependency Injection solves several problems:
 *
 * - **Loose Coupling**: Services don't create their dependencies directly.
 *   This makes them easier to test and swap implementations.
 *
 * - **Lifecycle Management**: The container manages when services are created
 *   and destroyed, ensuring proper cleanup.
 *
 * - **Configuration Centralization**: All wiring happens in one place,
 *   making the architecture easier to understand.
 *
 * ## Usage Pattern
 *
 * ```typescript
 * // 1. Create the container
 * const container = new Container();
 *
 * // 2. Register services
 * container.registerSingleton("Config", loadConfig());
 * container.registerFactory("Database", (c) =>
 *   new Database(c.resolve("Config"))
 * );
 * container.registerFactory("UserRepo", (c) =>
 *   new UserRepository(c.resolve("Database"))
 * );
 *
 * // 3. Resolve services
 * const userRepo = container.resolve<UserRepository>("UserRepo");
 *
 * // 4. Create request scope
 * app.use((req, res, next) => {
 *   req.scope = container.createScope();
 *   req.scope.registerScoped("CurrentUser", req.user);
 *   next();
 * });
 * ```
 *
 * @module kernel/container
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

import { createModuleLogger } from "../logger";
import type {
  IContainer,
  ServiceLifetime,
  ServiceFactory,
  ServiceRegistration,
  IDisposable,
  isDisposable,
} from "./types";

const log = createModuleLogger("di-container");

// =============================================================================
// CONTAINER IMPLEMENTATION
// =============================================================================

/**
 * Dependency Injection Container.
 *
 * @description Manages service registration, resolution, and lifecycle.
 *
 * ## Design Decisions
 *
 * 1. **Token-based identification**: Services are identified by strings or
 *    symbols, not by type. This allows for multiple implementations of the
 *    same interface.
 *
 * 2. **Lazy instantiation**: Factory-registered services are only created
 *    when first resolved. This improves startup time.
 *
 * 3. **Scope inheritance**: Child scopes inherit parent registrations but
 *    can override them. Singleton resolution always goes to root.
 *
 * 4. **Circular dependency detection**: The container tracks resolution
 *    chains and throws if a cycle is detected.
 *
 * @example
 * ```typescript
 * const container = new Container();
 *
 * // Register a database pool (singleton - shared across app)
 * container.registerSingleton("DatabasePool", new Pool({
 *   host: "localhost",
 *   database: "rses"
 * }));
 *
 * // Register a repository factory (transient - new instance each time)
 * container.registerFactory(
 *   "UserRepository",
 *   (c) => new UserRepository(c.resolve("DatabasePool")),
 *   "transient"
 * );
 *
 * // Later, in request handler...
 * const repo = container.resolve<UserRepository>("UserRepository");
 * const users = await repo.findAll();
 * ```
 */
export class Container implements IContainer {
  // =========================================================================
  // PRIVATE FIELDS
  // =========================================================================

  /**
   * Map of service token to registration info.
   * This is the "recipe book" for creating instances.
   */
  private registrations = new Map<string | symbol, ServiceRegistration>();

  /**
   * Cache of singleton instances.
   * Once a singleton is created, it's stored here forever.
   */
  private singletons = new Map<string | symbol, unknown>();

  /**
   * Cache of scoped instances.
   * Each scope has its own instance of scoped services.
   */
  private scopedInstances = new Map<string | symbol, unknown>();

  /**
   * Tokens currently being resolved.
   * Used to detect circular dependencies.
   */
  private resolutionChain = new Set<string | symbol>();

  /**
   * Parent container (if this is a scoped child).
   * Scopes inherit from their parent but can override.
   */
  private parent: Container | null;

  /**
   * Whether this container has been disposed.
   * Prevents further operations after cleanup.
   */
  private disposed = false;

  // =========================================================================
  // CONSTRUCTOR
  // =========================================================================

  /**
   * Create a new container.
   *
   * @param parent - Parent container for scope inheritance (optional)
   *
   * @example
   * ```typescript
   * // Root container
   * const root = new Container();
   *
   * // Child scope (used internally by createScope)
   * const child = new Container(root);
   * ```
   */
  constructor(parent: Container | null = null) {
    this.parent = parent;

    if (!parent) {
      log.debug("Created root DI container");
    }
  }

  // =========================================================================
  // REGISTRATION METHODS
  // =========================================================================

  /**
   * Register a singleton instance.
   *
   * @description Singletons are shared across the entire application.
   * The same instance is returned for every resolution, regardless of scope.
   *
   * Use singletons for:
   * - Database connection pools
   * - Configuration objects
   * - Caches
   * - Logger instances
   *
   * Do NOT use singletons for:
   * - Request-specific data (use scoped)
   * - Stateless utilities (use transient)
   *
   * @param token - Unique identifier for the service
   * @param instance - The singleton instance to register
   * @param registeredBy - Optional module ID for tracking/debugging
   *
   * @example
   * ```typescript
   * // Register a configuration singleton
   * container.registerSingleton("Config", {
   *   database: { host: "localhost", port: 5432 },
   *   redis: { host: "localhost", port: 6379 }
   * });
   *
   * // Register with tracking
   * container.registerSingleton(
   *   "MessagingService",
   *   new MessagingService(),
   *   "messaging"  // Module that registered this
   * );
   * ```
   */
  registerSingleton<T>(
    token: string | symbol,
    instance: T,
    registeredBy?: string
  ): void {
    this.ensureNotDisposed();

    // Store both the registration info and the actual instance
    this.registrations.set(token, {
      token,
      lifetime: "singleton",
      implementation: instance,
      isFactory: false,
      registeredBy,
    });

    // Directly cache the singleton (no factory needed)
    this.singletons.set(token, instance);

    log.debug(
      { token: String(token), registeredBy },
      "Registered singleton service"
    );
  }

  /**
   * Register a factory function that creates service instances.
   *
   * @description Factories are called when the service is first resolved
   * (for singleton/scoped) or every time (for transient).
   *
   * The factory receives the container itself, allowing it to resolve
   * dependencies. This enables constructor injection pattern.
   *
   * @param token - Unique identifier for the service
   * @param factory - Function that creates the service instance
   * @param lifetime - How to manage created instances (default: "singleton")
   * @param registeredBy - Optional module ID for tracking/debugging
   *
   * @example
   * ```typescript
   * // Register a singleton factory (created once, cached)
   * container.registerFactory(
   *   "Database",
   *   (c) => new Database(c.resolve("Config").database),
   *   "singleton"
   * );
   *
   * // Register a transient factory (new instance each time)
   * container.registerFactory(
   *   "RequestLogger",
   *   (c) => new Logger(c.resolve("Config").logLevel),
   *   "transient"
   * );
   *
   * // Register a scoped factory (one per request)
   * container.registerFactory(
   *   "UnitOfWork",
   *   (c) => new UnitOfWork(c.resolve("Database")),
   *   "scoped"
   * );
   * ```
   */
  registerFactory<T>(
    token: string | symbol,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime = "singleton",
    registeredBy?: string
  ): void {
    this.ensureNotDisposed();

    this.registrations.set(token, {
      token,
      lifetime,
      implementation: factory,
      isFactory: true,
      registeredBy,
    });

    log.debug(
      { token: String(token), lifetime, registeredBy },
      "Registered factory service"
    );
  }

  /**
   * Register a scoped service instance directly.
   *
   * @description This is a convenience method for registering request-specific
   * instances in a scoped container. Typically used for things like:
   * - Current user
   * - Request context
   * - Transaction scope
   *
   * @param token - Unique identifier for the service
   * @param instance - The scoped instance
   *
   * @example
   * ```typescript
   * // In middleware, create request scope
   * app.use((req, res, next) => {
   *   const scope = container.createScope();
   *   scope.registerScoped("CurrentUser", req.user);
   *   scope.registerScoped("RequestId", req.id);
   *   req.scope = scope;
   *   next();
   * });
   *
   * // In handler, resolve from scope
   * const handler = (req, res) => {
   *   const user = req.scope.resolve("CurrentUser");
   *   // ...
   * };
   * ```
   */
  registerScoped<T>(token: string | symbol, instance: T): void {
    this.ensureNotDisposed();

    // Register as scoped
    this.registrations.set(token, {
      token,
      lifetime: "scoped",
      implementation: instance,
      isFactory: false,
      registeredBy: undefined,
    });

    // Cache in scoped instances
    this.scopedInstances.set(token, instance);

    log.debug({ token: String(token) }, "Registered scoped instance");
  }

  // =========================================================================
  // RESOLUTION METHODS
  // =========================================================================

  /**
   * Resolve a service by its token.
   *
   * @description Looks up the service registration and returns an instance.
   * The behavior depends on the service lifetime:
   *
   * - **Singleton**: Returns cached instance or creates one from factory
   * - **Scoped**: Returns scope-cached instance or creates one
   * - **Transient**: Always creates a new instance
   *
   * If the service isn't registered in this container, it checks the parent
   * chain (for scoped containers).
   *
   * @param token - The service identifier
   * @returns The resolved service instance
   * @throws Error if service is not registered
   * @throws Error if circular dependency detected
   *
   * @example
   * ```typescript
   * // Resolve with type hint
   * const db = container.resolve<Database>("Database");
   * await db.query("SELECT * FROM users");
   *
   * // Resolve in factory (dependency injection)
   * container.registerFactory("UserService", (c) => {
   *   return new UserService(
   *     c.resolve<Database>("Database"),
   *     c.resolve<Logger>("Logger")
   *   );
   * });
   * ```
   */
  resolve<T>(token: string | symbol): T {
    this.ensureNotDisposed();

    const instance = this.tryResolve<T>(token);

    if (instance === undefined) {
      const tokenStr = String(token);
      log.error({ token: tokenStr }, "Service not registered");
      throw new Error(
        `Service '${tokenStr}' is not registered in the container. ` +
        `Did you forget to register it, or is there a typo in the token?`
      );
    }

    return instance;
  }

  /**
   * Try to resolve a service, returning undefined if not found.
   *
   * @description Like resolve(), but returns undefined instead of throwing
   * when the service isn't registered. Useful for optional dependencies.
   *
   * @param token - The service identifier
   * @returns The service instance or undefined
   *
   * @example
   * ```typescript
   * // Check for optional dependency
   * const cache = container.tryResolve<Cache>("Cache");
   * if (cache) {
   *   const cached = await cache.get(key);
   *   if (cached) return cached;
   * }
   *
   * // Fallback logic when service not available
   * const result = await computeExpensive();
   * cache?.set(key, result);
   * return result;
   * ```
   */
  tryResolve<T>(token: string | symbol): T | undefined {
    this.ensureNotDisposed();

    // Check for circular dependency
    if (this.resolutionChain.has(token)) {
      const chain = Array.from(this.resolutionChain).map(String).join(" -> ");
      throw new Error(
        `Circular dependency detected: ${chain} -> ${String(token)}`
      );
    }

    // Get registration (check this container first, then parent)
    const registration = this.getRegistration(token);
    if (!registration) {
      return undefined;
    }

    // Handle based on lifetime
    switch (registration.lifetime) {
      case "singleton":
        return this.resolveSingleton<T>(token, registration);

      case "scoped":
        return this.resolveScoped<T>(token, registration);

      case "transient":
        return this.resolveTransient<T>(token, registration);

      default:
        throw new Error(`Unknown lifetime: ${registration.lifetime}`);
    }
  }

  /**
   * Resolve a singleton service.
   *
   * @description Singletons are cached at the root container level.
   * If this is a scoped container, we delegate to the root.
   */
  private resolveSingleton<T>(
    token: string | symbol,
    registration: ServiceRegistration
  ): T {
    // Get the root container (singletons live there)
    const root = this.getRoot();

    // Check cache first
    if (root.singletons.has(token)) {
      return root.singletons.get(token) as T;
    }

    // Create instance from factory
    if (registration.isFactory) {
      try {
        this.resolutionChain.add(token);
        const factory = registration.implementation as ServiceFactory<T>;
        const instance = factory(this);
        root.singletons.set(token, instance);
        return instance;
      } finally {
        this.resolutionChain.delete(token);
      }
    }

    // Direct instance (already cached in registerSingleton)
    return registration.implementation as T;
  }

  /**
   * Resolve a scoped service.
   *
   * @description Scoped services are cached per-scope.
   * Each HTTP request typically gets its own scope.
   */
  private resolveScoped<T>(
    token: string | symbol,
    registration: ServiceRegistration
  ): T {
    // Check this scope's cache
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Create instance from factory
    if (registration.isFactory) {
      try {
        this.resolutionChain.add(token);
        const factory = registration.implementation as ServiceFactory<T>;
        const instance = factory(this);
        this.scopedInstances.set(token, instance);
        return instance;
      } finally {
        this.resolutionChain.delete(token);
      }
    }

    // Direct instance registration (already in scopedInstances)
    return registration.implementation as T;
  }

  /**
   * Resolve a transient service.
   *
   * @description Transient services are never cached.
   * A new instance is created for every resolution.
   */
  private resolveTransient<T>(
    token: string | symbol,
    registration: ServiceRegistration
  ): T {
    if (!registration.isFactory) {
      // Transient with direct instance doesn't make sense,
      // but we handle it anyway
      log.warn(
        { token: String(token) },
        "Transient service registered with instance instead of factory"
      );
      return registration.implementation as T;
    }

    try {
      this.resolutionChain.add(token);
      const factory = registration.implementation as ServiceFactory<T>;
      return factory(this);
    } finally {
      this.resolutionChain.delete(token);
    }
  }

  // =========================================================================
  // QUERY METHODS
  // =========================================================================

  /**
   * Check if a service is registered.
   *
   * @description Checks this container and all parent containers.
   *
   * @param token - The service identifier
   * @returns true if the service can be resolved
   *
   * @example
   * ```typescript
   * if (container.has("Cache")) {
   *   // Use caching strategy
   * } else {
   *   // Use direct database access
   * }
   * ```
   */
  has(token: string | symbol): boolean {
    return this.getRegistration(token) !== undefined;
  }

  /**
   * Get all registered service tokens.
   *
   * @description Returns tokens from this container and all parents.
   * Useful for debugging and reflection.
   *
   * @returns Array of registered tokens
   *
   * @example
   * ```typescript
   * const tokens = container.getRegisteredTokens();
   * console.log("Registered services:", tokens);
   * // ["Config", "Database", "UserRepository", ...]
   * ```
   */
  getRegisteredTokens(): (string | symbol)[] {
    const tokens = new Set<string | symbol>();

    // Collect from this container
    for (const token of this.registrations.keys()) {
      tokens.add(token);
    }

    // Collect from parent chain
    let parent = this.parent;
    while (parent) {
      for (const token of parent.registrations.keys()) {
        tokens.add(token);
      }
      parent = parent.parent;
    }

    return Array.from(tokens);
  }

  // =========================================================================
  // SCOPE MANAGEMENT
  // =========================================================================

  /**
   * Create a child scope.
   *
   * @description Scopes inherit all registrations from their parent.
   * They can register additional services or override parent registrations.
   *
   * Scoped services are cached per-scope, so each scope gets its own
   * instances of scoped services.
   *
   * Common pattern: Create a scope per HTTP request.
   *
   * @returns A new scoped container
   *
   * @example
   * ```typescript
   * // Middleware to create request scope
   * app.use((req, res, next) => {
   *   // Create scope for this request
   *   const scope = container.createScope();
   *
   *   // Register request-specific services
   *   scope.registerScoped("Request", req);
   *   scope.registerScoped("Response", res);
   *   scope.registerScoped("CurrentUser", req.user);
   *
   *   // Attach to request for later use
   *   req.scope = scope;
   *
   *   // Clean up scope when response finishes
   *   res.on("finish", () => scope.dispose());
   *
   *   next();
   * });
   *
   * // Handler uses scoped services
   * app.get("/profile", (req, res) => {
   *   const user = req.scope.resolve("CurrentUser");
   *   const repo = req.scope.resolve("UserRepository");
   *   // ...
   * });
   * ```
   */
  createScope(): IContainer {
    this.ensureNotDisposed();
    return new Container(this);
  }

  // =========================================================================
  // LIFECYCLE MANAGEMENT
  // =========================================================================

  /**
   * Unregister a service.
   *
   * @description Removes the service registration. If the service has
   * a cached instance (singleton or scoped), it's also removed.
   *
   * Note: This does NOT dispose the instance. Call dispose() on the
   * instance manually if needed.
   *
   * @param token - The service identifier
   * @returns true if the service was removed
   *
   * @example
   * ```typescript
   * // Remove a service during hot-reload
   * const oldService = container.resolve("MyService");
   * await oldService.dispose();
   * container.unregister("MyService");
   * container.registerSingleton("MyService", newService);
   * ```
   */
  unregister(token: string | symbol): boolean {
    this.ensureNotDisposed();

    const existed = this.registrations.has(token);

    this.registrations.delete(token);
    this.singletons.delete(token);
    this.scopedInstances.delete(token);

    if (existed) {
      log.debug({ token: String(token) }, "Unregistered service");
    }

    return existed;
  }

  /**
   * Dispose all services that implement IDisposable.
   *
   * @description Called during shutdown to clean up resources.
   * Iterates through all cached instances (singletons and scoped)
   * and calls dispose() on those that implement IDisposable.
   *
   * After calling this method, the container is marked as disposed
   * and further operations will throw.
   *
   * @example
   * ```typescript
   * // During graceful shutdown
   * process.on("SIGTERM", async () => {
   *   console.log("Shutting down...");
   *
   *   // Stop accepting new requests
   *   server.close();
   *
   *   // Dispose all container services
   *   await container.dispose();
   *
   *   console.log("Cleanup complete");
   *   process.exit(0);
   * });
   * ```
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    log.info("Disposing container services");

    // Dispose scoped instances
    for (const [token, instance] of this.scopedInstances) {
      await this.disposeInstance(token, instance);
    }
    this.scopedInstances.clear();

    // Dispose singletons (only from root)
    if (!this.parent) {
      for (const [token, instance] of this.singletons) {
        await this.disposeInstance(token, instance);
      }
      this.singletons.clear();
    }

    this.registrations.clear();
    this.disposed = true;

    log.info("Container disposed");
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Get the root container (for singleton storage).
   */
  private getRoot(): Container {
    let current: Container = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  /**
   * Get a service registration from this container or parents.
   */
  private getRegistration(
    token: string | symbol
  ): ServiceRegistration | undefined {
    // Check this container first
    const local = this.registrations.get(token);
    if (local) {
      return local;
    }

    // Check parent chain
    return this.parent?.getRegistration(token);
  }

  /**
   * Dispose a single instance if it's disposable.
   */
  private async disposeInstance(
    token: string | symbol,
    instance: unknown
  ): Promise<void> {
    if (this.isDisposableInstance(instance)) {
      try {
        await instance.dispose();
        log.debug({ token: String(token) }, "Disposed service");
      } catch (error) {
        log.error(
          { token: String(token), error },
          "Error disposing service"
        );
      }
    }
  }

  /**
   * Type guard for IDisposable.
   */
  private isDisposableInstance(
    obj: unknown
  ): obj is { dispose(): Promise<void> } {
    return (
      typeof obj === "object" &&
      obj !== null &&
      "dispose" in obj &&
      typeof (obj as Record<string, unknown>).dispose === "function"
    );
  }

  /**
   * Ensure the container hasn't been disposed.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        "Cannot perform operations on a disposed container. " +
        "The container has been shut down."
      );
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new DI container.
 *
 * @description Factory function for creating container instances.
 * Prefer this over direct constructor for consistency.
 *
 * @returns A new Container instance
 *
 * @example
 * ```typescript
 * import { createContainer } from "./kernel/container";
 *
 * const container = createContainer();
 * container.registerSingleton("Config", config);
 * ```
 */
export function createContainer(): IContainer {
  return new Container();
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Token type for type-safe service resolution.
 *
 * @description Use this to create typed tokens that carry the service type.
 * This enables better IDE autocomplete and type checking.
 *
 * @example
 * ```typescript
 * // Define typed tokens
 * const TOKENS = {
 *   Database: Symbol("Database") as ServiceToken<Database>,
 *   UserRepo: "UserRepository" as ServiceToken<UserRepository>,
 * };
 *
 * // Registration is the same
 * container.registerSingleton(TOKENS.Database, new Database());
 *
 * // Resolution automatically infers the type
 * const db = container.resolve(TOKENS.Database);
 * // db is typed as Database, not unknown
 * ```
 */
export type ServiceToken<T> = string | symbol;

/**
 * Decorator for marking a class as injectable.
 *
 * @description This is a marker decorator for documentation purposes.
 * It doesn't change runtime behavior but signals that a class is
 * designed to be used with DI.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class UserService {
 *   constructor(
 *     private db: Database,
 *     private cache: Cache
 *   ) {}
 * }
 * ```
 */
export function Injectable(): ClassDecorator {
  return (_target: object) => {
    // No-op, just a marker decorator
    // Metadata storage not needed for current implementation
  };
}
