/**
 * @file bridge.ts
 * @description Shell script bridge API for gradual migration.
 * @phase Phase 3 - File System Integration
 * @author ALK (Auto-Link Developer Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * This API provides endpoints that can be called from shell scripts,
 * allowing gradual migration from shell-based RSES implementation
 * to the TypeScript-based system.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { RsesParser } from "../lib/rses";
import { scanDirectory } from "../services/project-scanner";
import {
  getSymlinkExecutor,
  initSymlinkExecutor,
  type SymlinkOperation,
} from "../services/symlink-executor";
import { storage } from "../storage";
import { bridgeLogger as log } from "../logger";

const router = Router();

/**
 * POST /api/bridge/classify
 * Classifies a single project using RSES config.
 *
 * Body: { projectPath: string, projectName: string, configId?: number, configContent?: string, attributes?: object }
 * Returns: { sets: string[], topics: string[], types: string[] }
 */
router.post("/classify", async (req: Request, res: Response) => {
  const schema = z.object({
    projectPath: z.string(),
    projectName: z.string(),
    configId: z.number().optional(),
    configContent: z.string().optional(),
    attributes: z.record(z.string()).optional(),
  });

  try {
    const input = schema.parse(req.body);

    // Get config content
    let configContent: string;
    if (input.configContent) {
      configContent = input.configContent;
    } else if (input.configId) {
      const config = await storage.getConfig(input.configId);
      if (!config) {
        return res.status(404).json({ error: "Config not found" });
      }
      configContent = config.content;
    } else {
      return res.status(400).json({ error: "Either configId or configContent required" });
    }

    // Parse and test
    const parseResult = RsesParser.parse(configContent);
    if (!parseResult.valid || !parseResult.parsed) {
      return res.status(400).json({
        error: "Invalid config",
        errors: parseResult.errors,
      });
    }

    const result = RsesParser.test(
      parseResult.parsed,
      input.projectName,
      input.attributes || {}
    );

    res.json({
      projectPath: input.projectPath,
      projectName: input.projectName,
      sets: result.sets,
      topics: result.topics,
      types: result.types,
      filetypes: result.filetypes,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Classification failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /api/bridge/classify-batch
 * Classifies multiple projects at once.
 *
 * Body: { projects: Array<{ path, name, attributes? }>, configId?: number, configContent?: string }
 * Returns: { results: Array<{ path, name, sets, topics, types }> }
 */
router.post("/classify-batch", async (req: Request, res: Response) => {
  const schema = z.object({
    projects: z.array(
      z.object({
        path: z.string(),
        name: z.string(),
        attributes: z.record(z.string()).optional(),
      })
    ),
    configId: z.number().optional(),
    configContent: z.string().optional(),
  });

  try {
    const input = schema.parse(req.body);

    // Get config content
    let configContent: string;
    if (input.configContent) {
      configContent = input.configContent;
    } else if (input.configId) {
      const config = await storage.getConfig(input.configId);
      if (!config) {
        return res.status(404).json({ error: "Config not found" });
      }
      configContent = config.content;
    } else {
      return res.status(400).json({ error: "Either configId or configContent required" });
    }

    // Parse config once
    const parseResult = RsesParser.parse(configContent);
    if (!parseResult.valid || !parseResult.parsed) {
      return res.status(400).json({
        error: "Invalid config",
        errors: parseResult.errors,
      });
    }

    // Classify each project
    const results = input.projects.map((project) => {
      const result = RsesParser.test(
        parseResult.parsed!,
        project.name,
        project.attributes || {}
      );

      return {
        path: project.path,
        name: project.name,
        sets: result.sets,
        topics: result.topics,
        types: result.types,
      };
    });

    res.json({ results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Batch classification failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /api/bridge/scan
 * Scans a directory for projects.
 *
 * Body: { rootPath: string, maxDepth?: number, configId?: number }
 * Returns: { projects: Array<ScannedProject>, duration: number }
 */
router.post("/scan", async (req: Request, res: Response) => {
  const schema = z.object({
    rootPath: z.string(),
    maxDepth: z.number().min(1).max(10).optional(),
    configId: z.number().optional(),
  });

  try {
    const input = schema.parse(req.body);

    // Get RSES config if provided
    let rsesConfig;
    if (input.configId) {
      const config = await storage.getConfig(input.configId);
      if (!config) {
        return res.status(404).json({ error: "Config not found" });
      }
      const parseResult = RsesParser.parse(config.content);
      if (parseResult.valid && parseResult.parsed) {
        rsesConfig = parseResult.parsed;
      }
    }

    const result = await scanDirectory({
      rootPath: input.rootPath,
      maxDepth: input.maxDepth,
      rsesConfig,
    });

    res.json({
      projects: result.projects,
      directoriesScanned: result.directoriesScanned,
      duration: result.duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Scan failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /api/bridge/symlink
 * Creates symlinks for a project.
 *
 * Body: { projectPath: string, projectName: string, baseDir: string, topics: string[], types: string[] }
 * Returns: { success: boolean, created: Array<{ category, target }>, errors?: string[] }
 */
router.post("/symlink", async (req: Request, res: Response) => {
  const schema = z.object({
    projectPath: z.string(),
    projectName: z.string(),
    baseDir: z.string(),
    topics: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
  });

  try {
    const input = schema.parse(req.body);

    // Initialize executor if not already done
    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir: input.baseDir });
    }

    const operations: SymlinkOperation[] = [];

    // Add topic symlinks
    for (const topic of input.topics || []) {
      operations.push({
        source: input.projectPath,
        targetDir: `${input.baseDir}/by-topic/${topic}`,
        linkName: input.projectName,
        category: `by-topic/${topic}`,
      });
    }

    // Add type symlinks
    for (const type of input.types || []) {
      operations.push({
        source: input.projectPath,
        targetDir: `${input.baseDir}/by-type/${type}`,
        linkName: input.projectName,
        category: `by-type/${type}`,
      });
    }

    if (operations.length === 0) {
      return res.json({ success: true, created: [] });
    }

    const result = await executor.executeTransaction(operations);

    res.json({
      success: result.success,
      created: result.results
        .filter((r) => r.success)
        .map((r) => ({ category: r.category, target: r.target })),
      errors: result.results
        .filter((r) => !r.success)
        .map((r) => r.error),
      rolledBack: result.rolledBack,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Symlink operation failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /api/bridge/symlink-batch
 * Creates symlinks for multiple projects.
 *
 * Body: { baseDir: string, projects: Array<{ path, name, topics, types }> }
 * Returns: { success: boolean, summary: { created: number, failed: number } }
 */
router.post("/symlink-batch", async (req: Request, res: Response) => {
  const schema = z.object({
    baseDir: z.string(),
    projects: z.array(
      z.object({
        path: z.string(),
        name: z.string(),
        topics: z.array(z.string()).optional(),
        types: z.array(z.string()).optional(),
      })
    ),
  });

  try {
    const input = schema.parse(req.body);

    // Initialize executor
    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir: input.baseDir });
    }

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const project of input.projects) {
      const operations: SymlinkOperation[] = [];

      for (const topic of project.topics || []) {
        operations.push({
          source: project.path,
          targetDir: `${input.baseDir}/by-topic/${topic}`,
          linkName: project.name,
          category: `by-topic/${topic}`,
        });
      }

      for (const type of project.types || []) {
        operations.push({
          source: project.path,
          targetDir: `${input.baseDir}/by-type/${type}`,
          linkName: project.name,
          category: `by-type/${type}`,
        });
      }

      for (const op of operations) {
        const result = await executor.createSymlink(op);
        if (result.success) {
          created++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${project.name}: ${result.error}`);
          }
        }
      }
    }

    res.json({
      success: failed === 0,
      summary: { created, failed },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Batch symlink operation failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * DELETE /api/bridge/symlink
 * Removes a symlink.
 *
 * Body: { linkPath: string, baseDir: string }
 * Returns: { success: boolean, error?: string }
 */
router.delete("/symlink", async (req: Request, res: Response) => {
  const schema = z.object({
    linkPath: z.string(),
    baseDir: z.string(),
  });

  try {
    const input = schema.parse(req.body);

    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir: input.baseDir });
    }

    const result = await executor.removeSymlink(input.linkPath);

    res.json({
      success: result.success,
      error: result.error,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Remove symlink failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /api/bridge/cleanup
 * Cleans up broken symlinks.
 *
 * Body: { baseDir: string }
 * Returns: { removed: string[], count: number }
 */
router.post("/cleanup", async (req: Request, res: Response) => {
  const schema = z.object({
    baseDir: z.string(),
  });

  try {
    const input = schema.parse(req.body);

    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir: input.baseDir });
    }

    const removed = await executor.cleanupBroken();

    res.json({
      removed,
      count: removed.length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    log.error({ err }, "Cleanup failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
