/**
 * @file index.ts
 * @description Content Module for RSES CMS Kernel.
 *
 * This is a CORE tier module that provides content management services.
 * It handles RSES configurations storage, versioning, and retrieval.
 *
 * @module modules/content
 * @tier core
 * @phase Phase 1 - Foundation Infrastructure
 * @created 2026-02-01
 *
 * @architecture
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                     CONTENT MODULE                                   │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
 * │  │  ConfigService   │  │  VersionService  │  │   Validation    │   │
 * │  │  - create        │  │  - getVersions   │  │   - validate    │   │
 * │  │  - update        │  │  - restore       │  │   - test        │   │
 * │  │  - delete        │  │  - compare       │  │   - preview     │   │
 * │  │  - list/get      │  └──────────────────┘  └─────────────────┘   │
 * │  └──────────────────┘                                               │
 * │                                                                      │
 * │  Events Emitted:                                                     │
 * │  - content:created    - New config created                          │
 * │  - content:updated    - Config updated                              │
 * │  - content:deleted    - Config deleted                              │
 * │  - content:validated  - Config validation performed                 │
 * │                                                                      │
 * │  Services Registered:                                                │
 * │  - ContentService     - Main content management service             │
 * │                                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type {
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
  IEventBus,
  IContainer,
} from "../../kernel/types";

// =============================================================================
// CONTENT SERVICE
// =============================================================================

/**
 * Content service providing RSES configuration management.
 *
 * This is a placeholder implementation that will be expanded to wrap
 * the existing routes.ts functionality.
 */
export class ContentService {
  private events: IEventBus;
  private container: IContainer;

  constructor(events: IEventBus, container: IContainer) {
    this.events = events;
    this.container = container;
  }

  /**
   * Emit a content creation event.
   */
  async notifyCreated(configId: number, name: string, userId?: number) {
    await this.events.emit("content:created", {
      configId,
      name,
      userId,
      timestamp: new Date(),
    });
  }

  /**
   * Emit a content update event.
   */
  async notifyUpdated(configId: number, name: string, userId?: number) {
    await this.events.emit("content:updated", {
      configId,
      name,
      userId,
      timestamp: new Date(),
    });
  }

  /**
   * Emit a content deletion event.
   */
  async notifyDeleted(configId: number, name: string, userId?: number) {
    await this.events.emit("content:deleted", {
      configId,
      name,
      userId,
      timestamp: new Date(),
    });
  }

  /**
   * Emit a validation event.
   */
  async notifyValidated(configId: number | null, isValid: boolean, errorCount: number) {
    await this.events.emit("content:validated", {
      configId,
      isValid,
      errorCount,
      timestamp: new Date(),
    });
  }
}

// =============================================================================
// CONTENT MODULE
// =============================================================================

/**
 * Content Module - Core tier module for RSES configuration management.
 *
 * This module provides:
 * - RSES configuration CRUD operations
 * - Version history and restoration
 * - Configuration validation and testing
 *
 * @example
 * ```typescript
 * // Other modules can resolve content services
 * const contentService = container.resolve<ContentService>("ContentService");
 * await contentService.notifyUpdated(123, "my-config", userId);
 * ```
 */
export class ContentModule implements IModule {
  public readonly manifest: ModuleManifest = {
    id: "content",
    name: "Content Management",
    version: "1.0.0",
    description:
      "Core content module providing RSES configuration storage, versioning, and validation",
    tier: "core",
    author: {
      name: "RSES Team",
      email: "team@rses.dev",
    },
    license: "MIT",
    dependencies: [
      {
        moduleId: "auth",
        version: "^1.0.0",
        optional: true,
        reason: "Required for protected write operations",
      },
    ],
    permissions: [
      {
        capability: "content:read",
        level: "normal",
        reason: "Read RSES configurations",
      },
      {
        capability: "content:write",
        level: "elevated",
        reason: "Create, update, and delete configurations",
      },
    ],
    configSchema: z.object({
      maxConfigSize: z.number().optional(),
      enableVersioning: z.boolean().optional(),
      maxVersionsPerConfig: z.number().optional(),
    }),
    exports: ["ContentService"],
    events: {
      emits: ["content:created", "content:updated", "content:deleted", "content:validated"],
      listens: ["auth:login"], // Could use this to track user activity
    },
    tags: ["content", "rses", "core"],
  };

  private context: ModuleContext | null = null;
  private contentService: ContentService | null = null;

  /**
   * Initialize the content module.
   */
  async initialize(context: ModuleContext): Promise<void> {
    this.context = context;
    const { logger, container, events, router } = context;

    logger.info("Initializing content module");

    // Create services
    this.contentService = new ContentService(events, container);

    // Register services in DI container
    container.registerSingleton("ContentService", this.contentService, "content");

    // Set up routes
    this.setupRoutes(router, logger);

    // Listen for auth events (optional integration)
    events.on("auth:login", async (event) => {
      logger.debug({ userId: event.data.userId }, "User logged in - content module notified");
    });

    logger.info("Content module initialized");
  }

  /**
   * Set up content routes.
   *
   * Note: The actual content routes are still in server/routes.ts.
   * This module provides the event emission and service layer.
   * Full migration will move routes here.
   */
  private setupRoutes(router: Router, logger: any): void {
    // GET /health - Module health endpoint
    router.get("/health", (req: Request, res: Response) => {
      res.json({
        module: "content",
        status: "operational",
        timestamp: new Date().toISOString(),
      });
    });

    // GET /stats - Content statistics (placeholder)
    router.get("/stats", async (req: Request, res: Response) => {
      // This would query the database for stats
      res.json({
        totalConfigs: 0,
        totalVersions: 0,
        lastUpdated: null,
      });
    });
  }

  /**
   * Start the module.
   */
  async start(): Promise<void> {
    this.context?.logger.info("Content module started");
  }

  /**
   * Stop the module.
   */
  async stop(): Promise<void> {
    this.context?.logger.info("Content module stopped");
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this.contentService = null;
    this.context = null;
  }

  /**
   * Health check for the content module.
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.contentService) {
        return {
          status: "unhealthy",
          message: "ContentService not initialized",
        };
      }

      return {
        status: "healthy",
        message: "Content module operational",
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
export default ContentModule;
