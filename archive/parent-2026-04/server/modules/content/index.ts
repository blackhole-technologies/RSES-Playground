/**
 * @file index.ts
 * @description Content Module for RSES CMS Kernel.
 *
 * This is a CORE tier module that provides content management services.
 * It handles RSES configurations storage, versioning, and retrieval.
 *
 * Routes mounted at: /api/modules/content/*
 *
 * @module modules/content
 * @tier core
 * @phase Phase 3 - Route Migration
 * @created 2026-02-01
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type {
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
  IEventBus,
  IContainer,
} from "../../kernel/types";
import {
  storage,
  versionStorage,
  activityStorage,
  type PaginationOptions,
} from "../../storage";
import { api, versionsApi, activityApi, batchApi } from "@shared/routes";

// =============================================================================
// CONTENT SERVICE
// =============================================================================

/**
 * Content service providing RSES configuration management.
 */
export class ContentService {
  private events: IEventBus;
  private container: IContainer;

  constructor(events: IEventBus, container: IContainer) {
    this.events = events;
    this.container = container;
  }

  // === Config CRUD ===

  async listConfigs(options?: PaginationOptions & { paginated?: boolean }) {
    if (options?.paginated || options?.page || options?.limit) {
      return storage.getConfigsPaginated(options);
    }
    return storage.getConfigs();
  }

  async getConfig(id: number) {
    return storage.getConfig(id);
  }

  async createConfig(input: { name: string; content: string; description?: string }, userId?: number) {
    const config = await storage.createConfig(input);

    // Create initial version
    await versionStorage.createVersion({
      configId: config.id,
      content: config.content,
      description: "Initial version",
    });

    // Log activity
    await activityStorage.logActivity({
      action: "config.created",
      entityType: "config",
      entityId: config.id,
      userId,
      metadata: { name: config.name },
    });

    // Emit event
    await this.events.emit("content:created", {
      configId: config.id,
      name: config.name,
      userId,
      timestamp: new Date(),
    });

    return config;
  }

  async updateConfig(
    id: number,
    input: { name?: string; content?: string; description?: string },
    userId?: number
  ) {
    const existing = await storage.getConfig(id);
    if (!existing) return null;

    const config = await storage.updateConfig(id, input);
    if (!config) return null;

    // Create new version if content changed
    if (input.content && input.content !== existing.content) {
      await versionStorage.createVersion({
        configId: config.id,
        content: config.content,
        description: input.description || undefined,
      });
    }

    // Log activity
    await activityStorage.logActivity({
      action: "config.updated",
      entityType: "config",
      entityId: config.id,
      userId,
      metadata: { updates: Object.keys(input) },
    });

    // Emit event
    await this.events.emit("content:updated", {
      configId: config.id,
      name: config.name,
      userId,
      timestamp: new Date(),
    });

    return config;
  }

  async deleteConfig(id: number, userId?: number) {
    const config = await storage.getConfig(id);

    // Log activity before deletion
    await activityStorage.logActivity({
      action: "config.deleted",
      entityType: "config",
      entityId: id,
      userId,
    });

    await storage.deleteConfig(id);

    // Emit event
    if (config) {
      await this.events.emit("content:deleted", {
        configId: id,
        name: config.name,
        userId,
        timestamp: new Date(),
      });
    }
  }

  // === Version Operations ===

  async getVersions(configId: number) {
    return versionStorage.getVersions(configId);
  }

  async getVersion(configId: number, version: number) {
    return versionStorage.getVersion(configId, version);
  }

  async restoreVersion(configId: number, versionNum: number, userId?: number) {
    const version = await versionStorage.getVersion(configId, versionNum);
    if (!version) return null;

    // Update config with version content
    const config = await storage.updateConfig(configId, {
      content: version.content,
    });

    // Create new version for restore action
    await versionStorage.createVersion({
      configId,
      content: version.content,
      description: `Restored from version ${versionNum}`,
    });

    // Log activity
    await activityStorage.logActivity({
      action: "config.restored",
      entityType: "config",
      entityId: configId,
      userId,
      metadata: { fromVersion: versionNum },
    });

    return config;
  }

  // === Activity Operations ===

  async getActivity(filter?: {
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
  }, options?: PaginationOptions) {
    return activityStorage.getActivity(filter, options);
  }

  async getRecentActivity(limit?: number) {
    return activityStorage.getRecentActivity(limit);
  }

  // === Batch Operations ===

  async bulkDeleteConfigs(ids: number[], userId?: number) {
    let deleted = 0;
    for (const id of ids) {
      try {
        await storage.deleteConfig(id);
        deleted++;
      } catch {
        // Continue with other deletions
      }
    }

    await activityStorage.logActivity({
      action: "configs.bulk-deleted",
      entityType: "config",
      userId,
      metadata: { ids, deleted },
    });

    return { deleted };
  }

  async bulkUpdateConfigs(ids: number[], updates: { name?: string; content?: string; description?: string }, userId?: number) {
    let updated = 0;
    for (const id of ids) {
      try {
        await storage.updateConfig(id, updates);
        updated++;
      } catch {
        // Continue with other updates
      }
    }

    await activityStorage.logActivity({
      action: "configs.bulk-updated",
      entityType: "config",
      userId,
      metadata: { ids, updated, updates: Object.keys(updates) },
    });

    return { updated };
  }

  // === Event Notifications (for external use) ===

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
      listens: ["auth:login"],
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
      // event.data is unknown until validated; narrow once for the log.
      const data = event.data as { userId?: string } | undefined;
      logger.debug({ userId: data?.userId }, "User logged in - content module notified");
    });

    logger.info("Content module initialized");
  }

  /**
   * Set up content routes.
   * Routes are mounted at /api/modules/content/*
   */
  private setupRoutes(router: Router, logger: any): void {
    const service = this.contentService!;

    // === Health & Stats ===

    router.get("/health", (req: Request, res: Response) => {
      res.json({
        module: "content",
        status: "operational",
        timestamp: new Date().toISOString(),
      });
    });

    router.get("/stats", async (req: Request, res: Response) => {
      try {
        const total = await storage.countConfigs();
        res.json({
          totalConfigs: total,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Failed to get stats");
        res.status(500).json({ message: "Failed to get stats" });
      }
    });

    // === Config CRUD ===

    // GET /configs - List configs
    router.get("/configs", async (req: Request, res: Response) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const paginated = req.query.paginated === "true";

        const result = await service.listConfigs({ page, limit, paginated });
        res.json(result);
      } catch (err) {
        logger.error({ err }, "Failed to list configs");
        res.status(500).json({ message: "Failed to list configs" });
      }
    });

    // GET /configs/:id - Get single config
    router.get("/configs/:id", async (req: Request, res: Response) => {
      try {
        const config = await service.getConfig(Number(req.params.id));
        if (!config) {
          return res.status(404).json({ message: "Config not found" });
        }
        res.json(config);
      } catch (err) {
        logger.error({ err }, "Failed to get config");
        res.status(500).json({ message: "Failed to get config" });
      }
    });

    // POST /configs - Create config (requires auth via middleware)
    router.post("/configs", async (req: Request, res: Response) => {
      try {
        const parsed = api.configs.create.input.parse(req.body);
        const userId = (req as any).user?.id;
        // The Zod insert schema includes optional fields like userId and
        // a nullable description; the service expects a narrower shape.
        // Strip userId and coerce nulls to undefined.
        const input = {
          name: parsed.name,
          content: parsed.content,
          description: parsed.description ?? undefined,
        };
        const config = await service.createConfig(input, userId);
        res.status(201).json(config);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join("."),
          });
        }
        logger.error({ err }, "Failed to create config");
        res.status(500).json({ message: "Failed to create config" });
      }
    });

    // PUT /configs/:id - Update config (requires auth via middleware)
    router.put("/configs/:id", async (req: Request, res: Response) => {
      try {
        const parsed = api.configs.update.input.parse(req.body);
        const userId = (req as any).user?.id;
        // Same narrowing as POST /configs above.
        const input = {
          name: parsed.name,
          content: parsed.content,
          description: parsed.description ?? undefined,
        };
        const config = await service.updateConfig(Number(req.params.id), input, userId);
        if (!config) {
          return res.status(404).json({ message: "Config not found" });
        }
        res.json(config);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join("."),
          });
        }
        logger.error({ err }, "Failed to update config");
        res.status(500).json({ message: "Failed to update config" });
      }
    });

    // DELETE /configs/:id - Delete config (requires auth via middleware)
    router.delete("/configs/:id", async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        await service.deleteConfig(Number(req.params.id), userId);
        res.status(204).send();
      } catch (err) {
        logger.error({ err }, "Failed to delete config");
        res.status(500).json({ message: "Failed to delete config" });
      }
    });

    // === Version Routes ===

    // GET /configs/:id/versions - List versions
    router.get("/configs/:id/versions", async (req: Request, res: Response) => {
      try {
        const configId = Number(req.params.id);
        const config = await service.getConfig(configId);
        if (!config) {
          return res.status(404).json({ message: "Config not found" });
        }
        const versions = await service.getVersions(configId);
        res.json(versions);
      } catch (err) {
        logger.error({ err }, "Failed to list versions");
        res.status(500).json({ message: "Failed to list versions" });
      }
    });

    // GET /configs/:id/versions/:version - Get specific version
    router.get("/configs/:id/versions/:version", async (req: Request, res: Response) => {
      try {
        const configId = Number(req.params.id);
        const versionNum = Number(req.params.version);
        const version = await service.getVersion(configId, versionNum);
        if (!version) {
          return res.status(404).json({ message: "Version not found" });
        }
        res.json(version);
      } catch (err) {
        logger.error({ err }, "Failed to get version");
        res.status(500).json({ message: "Failed to get version" });
      }
    });

    // POST /configs/:id/versions/:version/restore - Restore version
    router.post("/configs/:id/versions/:version/restore", async (req: Request, res: Response) => {
      try {
        const configId = Number(req.params.id);
        const versionNum = Number(req.params.version);
        const userId = (req as any).user?.id;
        const config = await service.restoreVersion(configId, versionNum, userId);
        if (!config) {
          return res.status(404).json({ message: "Version not found" });
        }
        res.json(config);
      } catch (err) {
        logger.error({ err }, "Failed to restore version");
        res.status(500).json({ message: "Failed to restore version" });
      }
    });

    // === Activity Routes ===

    // GET /activity - List activity
    router.get("/activity", async (req: Request, res: Response) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const entityType = req.query.entityType as string | undefined;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const result = await service.getActivity(
          { entityType, startDate, endDate },
          { page, limit }
        );
        res.json(result);
      } catch (err) {
        logger.error({ err }, "Failed to list activity");
        res.status(500).json({ message: "Failed to list activity" });
      }
    });

    // GET /activity/recent - Recent activity
    router.get("/activity/recent", async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const activity = await service.getRecentActivity(limit);
        res.json(activity);
      } catch (err) {
        logger.error({ err }, "Failed to get recent activity");
        res.status(500).json({ message: "Failed to get recent activity" });
      }
    });

    // === Batch Routes ===

    // POST /configs/bulk-delete
    router.post("/configs/bulk-delete", async (req: Request, res: Response) => {
      try {
        const input = batchApi.deleteConfigs.input.parse(req.body);
        const userId = (req as any).user?.id;
        const result = await service.bulkDeleteConfigs(input.ids, userId);
        res.json(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join("."),
          });
        }
        logger.error({ err }, "Failed to bulk delete configs");
        res.status(500).json({ message: "Failed to bulk delete configs" });
      }
    });

    // POST /configs/bulk-update
    router.post("/configs/bulk-update", async (req: Request, res: Response) => {
      try {
        const input = batchApi.updateConfigs.input.parse(req.body);
        const userId = (req as any).user?.id;
        // bulkUpdateConfigs expects narrow updates; cast to strip nullable
        // descriptions and any extra fields the Zod schema includes.
        const updates = {
          name: input.updates.name,
          content: input.updates.content,
          description: input.updates.description ?? undefined,
        };
        const result = await service.bulkUpdateConfigs(input.ids, updates, userId);
        res.json(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join("."),
          });
        }
        logger.error({ err }, "Failed to bulk update configs");
        res.status(500).json({ message: "Failed to bulk update configs" });
      }
    });

    logger.info("Content module routes registered");
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

      // Quick DB check
      await storage.countConfigs();

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
