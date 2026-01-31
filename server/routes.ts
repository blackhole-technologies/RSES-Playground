import type { Express } from "express";
import type { Server } from "http";
import { storage, versionStorage, activityStorage } from "./storage";
import { api, versionsApi, activityApi, batchApi } from "@shared/routes";
import { z } from "zod";
import { RsesParser, deriveAttributesFromPath } from "./lib/rses";
import { createExtendedResult } from "./lib/suggestion-engine";
import { requireAuth, optionalAuth } from "./auth/session";
import bridgeRoutes from "./routes/bridge";
import projectsRoutes from "./routes/projects";
import workbenchRoutes from "./routes/workbench";
import taxonomyRoutes from "./routes/taxonomy";
import { routesLogger as log, engineLogger } from "./logger";
import { rsesParseTime, rsesTestTime, rsesOperationsTotal } from "./metrics";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === Configs CRUD ===

  /**
   * GET /api/configs - List configs with optional pagination
   * Query params:
   *   - page: Page number (default: 1)
   *   - limit: Items per page (default: 50, max: 100)
   *   - paginated: If "true", returns paginated response format
   */
  app.get(api.configs.list.path, async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const paginated = req.query.paginated === "true";

    if (paginated || req.query.page || req.query.limit) {
      // Return paginated response
      const result = await storage.getConfigsPaginated({ page, limit });
      res.json(result);
    } else {
      // Legacy: return simple array for backward compatibility
      const configs = await storage.getConfigs();
      res.json(configs);
    }
  });

  app.get(api.configs.get.path, async (req, res) => {
    const config = await storage.getConfig(Number(req.params.id));
    if (!config) {
      return res.status(404).json({ message: 'Config not found' });
    }
    res.json(config);
  });

  // Protected route - requires authentication
  app.post(api.configs.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.configs.create.input.parse(req.body);
      const config = await storage.createConfig(input);

      // Create initial version (Phase 6)
      await versionStorage.createVersion({
        configId: config.id,
        content: config.content,
        description: "Initial version",
      });

      // Log activity (Phase 6)
      await activityStorage.logActivity({
        action: "config.created",
        entityType: "config",
        entityId: config.id,
        metadata: { name: config.name },
      });

      res.status(201).json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Protected route - requires authentication
  app.put(api.configs.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.configs.update.input.parse(req.body);
      const configId = Number(req.params.id);

      // Get current config to check for content changes
      const existing = await storage.getConfig(configId);
      if (!existing) {
        return res.status(404).json({ message: 'Config not found' });
      }

      const config = await storage.updateConfig(configId, input);
      if (!config) {
        return res.status(404).json({ message: 'Config not found' });
      }

      // Create new version if content changed (Phase 6)
      if (input.content && input.content !== existing.content) {
        await versionStorage.createVersion({
          configId: config.id,
          content: config.content,
          description: input.description || undefined,
        });
      }

      // Log activity (Phase 6)
      await activityStorage.logActivity({
        action: "config.updated",
        entityType: "config",
        entityId: config.id,
        metadata: { updates: Object.keys(input) },
      });

      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Protected route - requires authentication
  app.delete(api.configs.delete.path, requireAuth, async (req, res) => {
    const configId = Number(req.params.id);

    // Log activity before deletion (Phase 6)
    await activityStorage.logActivity({
      action: "config.deleted",
      entityType: "config",
      entityId: configId,
    });

    await storage.deleteConfig(configId);
    res.status(204).send();
  });

  // === Engine Routes ===

  app.post(api.engine.validate.path, (req, res) => {
    try {
      const { content } = api.engine.validate.input.parse(req.body);
      const endTimer = rsesParseTime.startTimer();
      const result = RsesParser.parse(content);
      endTimer();
      rsesOperationsTotal.inc({ operation: "parse", status: result.valid ? "success" : "error" });
      res.json(result);
    } catch (err) {
      rsesOperationsTotal.inc({ operation: "parse", status: "error" });
      engineLogger.error({ err }, "Parser error");
      res.status(500).json({ message: "Internal parser error" });
    }
  });

  app.post(api.engine.test.path, (req, res) => {
    try {
      const { configContent, filename, attributes } = api.engine.test.input.parse(req.body);
      const parseResult = RsesParser.parse(configContent);

      if (!parseResult.valid || !parseResult.parsed) {
        return res.status(400).json({ message: "Config is invalid, cannot test" });
      }

      const endTimer = rsesTestTime.startTimer();
      const basicResult = RsesParser.test(parseResult.parsed, filename, attributes);
      endTimer();
      rsesOperationsTotal.inc({ operation: "test", status: "success" });
      // Extend result with suggestions for unmatched filenames
      const result = createExtendedResult(filename, parseResult.parsed, basicResult);
      res.json(result);
    } catch (err) {
      rsesOperationsTotal.inc({ operation: "test", status: "error" });
      engineLogger.error({ err }, "Engine test error");
      res.status(500).json({ message: "Internal engine error" });
    }
  });

  // Preview endpoint - shows live symlink visualization
  app.post(api.engine.preview.path, (req, res) => {
    try {
      const { configContent, testPath, manualAttributes = {} } = api.engine.preview.input.parse(req.body);

      const parseResult = RsesParser.parse(configContent);
      if (!parseResult.valid || !parseResult.parsed) {
        return res.status(400).json({
          message: "Config is invalid",
          errors: parseResult.errors
        });
      }

      // Derive attributes from path and merge with manual attributes
      const derived = deriveAttributesFromPath(testPath);
      const combined = { ...derived, ...manualAttributes };

      // Extract project name from path
      const projectName = testPath.split('/').filter(Boolean).pop() || testPath;

      // Run the test with combined attributes
      const testResult = RsesParser.test(parseResult.parsed, projectName, combined);

      // Generate symlink preview
      const symlinks: Array<{type: 'topic' | 'type', name: string, target: string, category: string}> = [];

      for (const topic of testResult.topics) {
        symlinks.push({
          type: 'topic',
          name: projectName,
          target: testPath,
          category: `by-topic/${topic}`
        });
      }

      for (const type of testResult.types) {
        symlinks.push({
          type: 'type',
          name: projectName,
          target: testPath,
          category: `by-type/${type}`
        });
      }

      res.json({
        derivedAttributes: derived,
        combinedAttributes: combined,
        matchedSets: testResult.sets,
        symlinks,
        parsed: parseResult.parsed
      });
    } catch (err) {
      engineLogger.error({ err }, "Preview error");
      res.status(500).json({ message: "Internal preview error" });
    }
  });

  // Bridge API for shell script integration
  app.use("/api/bridge", bridgeRoutes);

  // Projects API (Phase 6)
  app.use("/api/projects", projectsRoutes);

  // Workbench API (Phase 8 - Backend to Frontend Connection)
  app.use("/api/workbench", workbenchRoutes);

  // Taxonomy API (CMS Transformation - Auto-Link Integration)
  app.use("/api/taxonomy", taxonomyRoutes);

  // === Config Versions API (Phase 6) ===

  app.get(versionsApi.list.path, async (req, res) => {
    try {
      const configId = Number(req.params.id);
      const config = await storage.getConfig(configId);
      if (!config) {
        return res.status(404).json({ message: "Config not found" });
      }
      const versions = await versionStorage.getVersions(configId);
      res.json(versions);
    } catch (err) {
      log.error({ err, configId: Number(req.params.id) }, "Failed to list versions");
      res.status(500).json({ message: "Failed to list versions" });
    }
  });

  app.get(versionsApi.get.path, async (req, res) => {
    try {
      const configId = Number(req.params.id);
      const versionNum = Number(req.params.version);
      const version = await versionStorage.getVersion(configId, versionNum);
      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }
      res.json(version);
    } catch (err) {
      log.error({ err, configId: Number(req.params.id), version: Number(req.params.version) }, "Failed to get version");
      res.status(500).json({ message: "Failed to get version" });
    }
  });

  app.post(versionsApi.restore.path, requireAuth, async (req, res) => {
    try {
      const configId = Number(req.params.id);
      const versionNum = Number(req.params.version);

      const version = await versionStorage.getVersion(configId, versionNum);
      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }

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
        metadata: { fromVersion: versionNum },
      });

      res.json(config);
    } catch (err) {
      log.error({ err, configId: Number(req.params.id), version: Number(req.params.version) }, "Failed to restore version");
      res.status(500).json({ message: "Failed to restore version" });
    }
  });

  // === Activity Log API (Phase 6) ===

  app.get(activityApi.list.path, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const entityType = req.query.entityType as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await activityStorage.getActivity(
        { entityType, startDate, endDate },
        { page, limit }
      );
      res.json(result);
    } catch (err) {
      log.error({ err }, "Failed to list activity");
      res.status(500).json({ message: "Failed to list activity" });
    }
  });

  app.get(activityApi.recent.path, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await activityStorage.getRecentActivity(limit);
      res.json(activity);
    } catch (err) {
      log.error({ err }, "Failed to get recent activity");
      res.status(500).json({ message: "Failed to get recent activity" });
    }
  });

  // === Batch Operations API (Phase 6) ===

  app.post(batchApi.deleteConfigs.path, requireAuth, async (req, res) => {
    try {
      const input = batchApi.deleteConfigs.input.parse(req.body);

      let deleted = 0;
      for (const id of input.ids) {
        try {
          await storage.deleteConfig(id);
          deleted++;
        } catch {
          // Continue with other deletions
        }
      }

      // Log activity
      await activityStorage.logActivity({
        action: "configs.bulk-deleted",
        entityType: "config",
        metadata: { ids: input.ids, deleted },
      });

      res.json({ deleted });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to bulk delete configs");
      res.status(500).json({ message: "Failed to bulk delete configs" });
    }
  });

  app.post(batchApi.updateConfigs.path, requireAuth, async (req, res) => {
    try {
      const input = batchApi.updateConfigs.input.parse(req.body);

      let updated = 0;
      for (const id of input.ids) {
        try {
          await storage.updateConfig(id, input.updates);
          updated++;
        } catch {
          // Continue with other updates
        }
      }

      // Log activity
      await activityStorage.logActivity({
        action: "configs.bulk-updated",
        entityType: "config",
        metadata: { ids: input.ids, updated, updates: Object.keys(input.updates) },
      });

      res.json({ updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to bulk update configs");
      res.status(500).json({ message: "Failed to bulk update configs" });
    }
  });

  // Seed default config if empty
  await seedConfigs();

  return httpServer;
}

async function seedConfigs() {
  const existing = await storage.getConfigs();
  if (existing.length === 0) {
    const exampleConfig = `# RSES Configuration with Auto-Derived Attributes
# Test with: by-ai/claude/quantum-app

[defaults]
auto_topic = prefix
auto_type = suffix
delimiter = -

[overrides.topic]
util = tools-and-utilities
viz = visualizations

[overrides.type]
lib = library
app = application

[sets]
quantum = quantum-*
web     = web-* | webapp-*
tools   = tool-*

[sets.attributes]
# Match specific AI source
claude  = {source = claude}
chatgpt = {source = chatgpt}
# Match any AI source (wildcard)
any-ai  = {source = *}

[sets.compound]
claude-quantum = $quantum & $claude

[rules.topic]
# Compound set rules
$quantum & $claude -> quantum/claude
$quantum -> quantum

# Attribute-based rules with variable substitution
{source = *} -> ai/$source

[rules.type]
*-app -> application
*-lib -> library
*-viz -> visualization

[rules.filetype]
*.py  -> code/python
*.js  -> code/javascript
*.ts  -> code/typescript
`;
    await storage.createConfig({
      name: "Default Example",
      content: exampleConfig,
      description: "Demonstrates auto-derived attributes and variable substitution. Test with: by-ai/claude/quantum-app"
    });
  }
}
