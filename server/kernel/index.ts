/**
 * @file index.ts
 * @description Main entry point for the RSES CMS Module Kernel.
 *
 * The kernel is the foundation of the plug-and-play module architecture.
 * It provides:
 *
 * - **Dependency Injection Container** - Service registration and resolution
 * - **Event Bus** - Cross-module pub/sub communication
 * - **Module Registry** - Module lifecycle and hot-loading
 * - **API Gateway** - Unified routing with auth and rate limiting
 * - **Bootstrap** - System initialization and shutdown
 *
 * ## Quick Start
 *
 * ```typescript
 * import { bootstrap, setupSignalHandlers } from "./kernel";
 *
 * async function main() {
 *   // Bootstrap the kernel
 *   const kernel = await bootstrap({
 *     modulesDir: "./server/modules",
 *     autoLoad: true
 *   });
 *
 *   // Setup graceful shutdown
 *   setupSignalHandlers(kernel.shutdown);
 *
 *   // Start server
 *   kernel.app.listen(3000, () => {
 *     console.log("RSES CMS running on port 3000");
 *   });
 * }
 *
 * main().catch(console.error);
 * ```
 *
 * ## Creating a Module
 *
 * Modules implement the IModule interface:
 *
 * ```typescript
 * import { IModule, ModuleManifest, ModuleContext } from "./kernel";
 *
 * export class MessagingModule implements IModule {
 *   public readonly manifest: ModuleManifest = {
 *     id: "messaging",
 *     name: "Real-Time Messaging",
 *     version: "1.0.0",
 *     description: "Slack-like messaging with channels and threads",
 *     tier: "optional",
 *     author: { name: "RSES Team" },
 *     dependencies: [
 *       { moduleId: "auth", version: "^1.0.0" }
 *     ],
 *     permissions: [],
 *     events: {
 *       emits: ["message:sent", "message:received"],
 *       listens: ["user:online", "user:offline"]
 *     }
 *   };
 *
 *   async initialize(context: ModuleContext): Promise<void> {
 *     // Setup routes, services, event handlers
 *     context.router.get("/channels", this.listChannels);
 *     context.events.on("user:online", this.handleUserOnline);
 *   }
 *
 *   async start(): Promise<void> {
 *     // Start background processes
 *   }
 *
 *   async stop(): Promise<void> {
 *     // Stop gracefully
 *   }
 *
 *   async dispose(): Promise<void> {
 *     // Clean up resources
 *   }
 * }
 * ```
 *
 * ## Using the DI Container
 *
 * ```typescript
 * // Register services
 * container.registerSingleton("Database", new Database(config));
 * container.registerFactory("UserRepo", (c) =>
 *   new UserRepository(c.resolve("Database"))
 * );
 *
 * // Resolve services
 * const repo = container.resolve<UserRepository>("UserRepo");
 * ```
 *
 * ## Using the Event Bus
 *
 * ```typescript
 * // Subscribe to events
 * events.on("user:login", async (event) => {
 *   console.log(`User ${event.data.userId} logged in`);
 * });
 *
 * // Emit events
 * events.emit("user:login", { userId: "123", email: "user@example.com" });
 * ```
 *
 * @module kernel
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

// =============================================================================
// CORE EXPORTS
// =============================================================================

/**
 * Bootstrap and lifecycle management
 */
export {
  bootstrap,
  setupSignalHandlers,
  SYSTEM_EVENTS,
  SERVICE_TOKENS,
} from "./bootstrap";

/**
 * Dependency Injection Container
 */
export {
  Container,
  createContainer,
  type ServiceToken,
  Injectable,
} from "./container";

/**
 * Event Bus for pub/sub
 */
export {
  EventBus,
  createEventBus,
  createTypedEmitter,
  createTypedSubscriber,
} from "./events";

/**
 * Module Registry for lifecycle management
 */
export {
  ModuleRegistry,
  createModuleRegistry,
  REGISTRY_EVENTS,
} from "./registry";

/**
 * API Gateway for routing
 */
export {
  ApiGateway,
  createApiGateway,
  GATEWAY_EVENTS,
} from "./gateway";

/**
 * Type definitions
 */
export type {
  // Module types
  ModuleTier,
  ModuleState,
  PermissionLevel,
  ModuleDependency,
  ModulePermission,
  ModuleManifest,
  ModuleContext,
  IModule,
  ModuleHealth,
  ModuleEntry,
  LoadModuleOptions,
  LoadModuleResult,

  // Container types
  ServiceLifetime,
  ServiceFactory,
  ServiceRegistration,
  IContainer,

  // Event types
  EventPayload,
  EventHandler,
  EventSubscription,
  SubscriptionOptions,
  EmitOptions,
  IEventBus,

  // Registry types
  IModuleRegistry,

  // Gateway types
  RateLimitConfig,
  AuthRequirement,
  GatewayRoute,
  IApiGateway,

  // Site context
  ISiteContext,

  // Bootstrap types
  KernelConfig,
  BootstrapResult,

  // Utilities
  IDisposable,
} from "./types";

export { isDisposable } from "./types";

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

import { createContainer as _createContainer } from "./container";
import { createEventBus as _createEventBus } from "./events";
import type { IContainer, IEventBus } from "./types";

/**
 * Create kernel components without full bootstrap.
 *
 * @description Useful for testing or custom initialization.
 * Creates standalone container and event bus instances.
 *
 * @returns Object with container and events
 *
 * @example
 * ```typescript
 * // For unit testing
 * const { container, events } = createKernelComponents();
 *
 * container.registerSingleton("MockService", mockService);
 * events.on("test", handler);
 * ```
 */
export function createKernelComponents(): {
  container: IContainer;
  events: IEventBus;
} {
  return {
    container: _createContainer(),
    events: _createEventBus(),
  };
}

// =============================================================================
// VERSION INFO
// =============================================================================

/**
 * Kernel version information.
 */
export const KERNEL_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  prerelease: null as string | null,
  toString(): string {
    const version = `${this.major}.${this.minor}.${this.patch}`;
    return this.prerelease ? `${version}-${this.prerelease}` : version;
  },
} as const;

/**
 * Get kernel version string.
 *
 * @returns Version string (e.g., "1.0.0")
 */
export function getKernelVersion(): string {
  return KERNEL_VERSION.toString();
}
