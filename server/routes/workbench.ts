/**
 * @file workbench.ts
 * @description Workbench API routes for interactive RSES testing and symlink creation.
 * @phase Phase 8 - Backend to Frontend Connection
 * @author Claude (Auto-generated)
 * @created 2026-02-01
 *
 * This API provides endpoints for the Workbench UI to:
 * - Classify projects using RSES config
 * - Create symlinks based on classification
 * - Scan directories for projects
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { RsesParser, deriveAttributesFromPath } from "../lib/rses";
import {
  getSymlinkExecutor,
  initSymlinkExecutor,
  type SymlinkOperation,
} from "../services/symlink-executor";
import { scanDirectory } from "../services/project-scanner";
import { workbenchApi } from "@shared/routes";
import { workbenchLogger as log } from "../logger";
import { activityStorage } from "../storage";
import path from "path";
import os from "os";

const router = Router();

/**
 * Gets the default base directory for symlinks.
 * Uses ~/search-results as the default location.
 */
function getDefaultBaseDir(): string {
  return path.join(os.homedir(), "search-results");
}

/**
 * POST /api/workbench/autolink
 * Classifies a project and creates symlinks based on RSES config.
 *
 * This is the main endpoint used by the Workbench UI's "Autolink" button.
 */
router.post("/autolink", async (req: Request, res: Response) => {
  try {
    const input = workbenchApi.autolink.input.parse(req.body);

    // Extract project name from path
    const projectName = input.projectPath.split("/").filter(Boolean).pop() || input.projectPath;

    log.info({ projectPath: input.projectPath, projectName }, "Autolink started");

    // Parse the RSES config
    const parseResult = RsesParser.parse(input.configContent);
    if (!parseResult.valid || !parseResult.parsed) {
      log.warn({ errors: parseResult.errors }, "Invalid config");
      return res.status(400).json({
        message: "Invalid RSES configuration",
        errors: parseResult.errors,
      });
    }

    // Derive attributes from path
    const derivedAttributes = deriveAttributesFromPath(input.projectPath);

    // Classify the project
    const classification = RsesParser.test(
      parseResult.parsed,
      projectName,
      derivedAttributes
    );

    log.debug({ classification }, "Project classified");

    // Determine base directory
    const baseDir = input.baseDir || getDefaultBaseDir();

    // Build symlink operations
    const operations: SymlinkOperation[] = [];

    for (const topic of classification.topics) {
      operations.push({
        source: input.projectPath,
        targetDir: path.join(baseDir, "by-topic", topic),
        linkName: projectName,
        category: `by-topic/${topic}`,
      });
    }

    for (const type of classification.types) {
      operations.push({
        source: input.projectPath,
        targetDir: path.join(baseDir, "by-type", type),
        linkName: projectName,
        category: `by-type/${type}`,
      });
    }

    // If dry run, return what would be created
    if (input.dryRun) {
      const symlinks = operations.map((op) => ({
        category: op.category,
        target: path.join(op.targetDir, op.linkName),
        created: false,
        error: undefined,
      }));

      log.info({ projectName, symlinkCount: symlinks.length, dryRun: true }, "Autolink dry run complete");

      return res.json({
        success: true,
        projectName,
        classification: {
          sets: classification.sets,
          topics: classification.topics,
          types: classification.types,
          filetypes: classification.filetypes,
        },
        symlinks,
      });
    }

    // Initialize or get symlink executor
    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir });
    }

    // Execute symlink operations
    const symlinks: Array<{
      category: string;
      target: string;
      created: boolean;
      error?: string;
    }> = [];
    const errors: string[] = [];

    for (const op of operations) {
      const result = await executor.createSymlink(op);
      symlinks.push({
        category: op.category,
        target: result.target,
        created: result.success,
        error: result.error,
      });

      if (!result.success && result.error) {
        errors.push(`${op.category}: ${result.error}`);
      }
    }

    // Log activity
    await activityStorage.logActivity({
      action: "workbench.autolink",
      entityType: "project",
      metadata: {
        projectPath: input.projectPath,
        projectName,
        symlinksCreated: symlinks.filter((s) => s.created).length,
        symlinksTotal: symlinks.length,
      },
    });

    const success = errors.length === 0;
    log.info(
      {
        projectName,
        success,
        symlinksCreated: symlinks.filter((s) => s.created).length,
        symlinksTotal: symlinks.length,
      },
      "Autolink complete"
    );

    res.json({
      success,
      projectName,
      classification: {
        sets: classification.sets,
        topics: classification.topics,
        types: classification.types,
        filetypes: classification.filetypes,
      },
      symlinks,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      log.warn({ errors: err.errors }, "Validation error");
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Autolink failed");
    res.status(500).json({ message: "Internal error during autolink" });
  }
});

/**
 * POST /api/workbench/scan
 * Scans a directory and classifies all projects found.
 */
router.post("/scan", async (req: Request, res: Response) => {
  try {
    const input = workbenchApi.scan.input.parse(req.body);

    log.info({ rootPath: input.rootPath }, "Workbench scan started");

    // Parse the RSES config
    const parseResult = RsesParser.parse(input.configContent);
    if (!parseResult.valid || !parseResult.parsed) {
      return res.status(400).json({
        message: "Invalid RSES configuration",
        errors: parseResult.errors,
      });
    }

    // Scan the directory
    const scanResult = await scanDirectory({
      rootPath: input.rootPath,
      maxDepth: input.maxDepth,
      rsesConfig: parseResult.parsed,
    });

    // Map projects to include classification
    const projects = scanResult.projects.map((p) => ({
      path: p.path,
      name: p.name,
      classification: p.classification || {
        sets: [],
        topics: [],
        types: [],
      },
    }));

    log.info(
      {
        projectCount: projects.length,
        directoriesScanned: scanResult.directoriesScanned,
        duration: scanResult.duration,
      },
      "Workbench scan complete"
    );

    res.json({
      projects,
      directoriesScanned: scanResult.directoriesScanned,
      duration: scanResult.duration,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Workbench scan failed");
    res.status(500).json({ message: "Internal error during scan" });
  }
});

/**
 * POST /api/workbench/bulk-autolink
 * Creates symlinks for multiple projects at once.
 */
router.post("/bulk-autolink", async (req: Request, res: Response) => {
  try {
    const input = workbenchApi.bulkAutolink.input.parse(req.body);

    log.info({ projectCount: input.projectPaths.length }, "Bulk autolink started");

    // Parse the RSES config
    const parseResult = RsesParser.parse(input.configContent);
    if (!parseResult.valid || !parseResult.parsed) {
      return res.status(400).json({
        message: "Invalid RSES configuration",
        errors: parseResult.errors,
      });
    }

    const baseDir = input.baseDir || getDefaultBaseDir();

    // Initialize executor
    let executor = getSymlinkExecutor();
    if (!executor) {
      executor = initSymlinkExecutor({ baseDir });
    }

    const results: Array<{
      projectPath: string;
      projectName: string;
      symlinksCreated: number;
      errors?: string[];
    }> = [];

    let totalSymlinksCreated = 0;
    let succeeded = 0;
    let failed = 0;

    for (const projectPath of input.projectPaths) {
      const projectName = projectPath.split("/").filter(Boolean).pop() || projectPath;
      const derivedAttributes = deriveAttributesFromPath(projectPath);
      const classification = RsesParser.test(
        parseResult.parsed,
        projectName,
        derivedAttributes
      );

      const operations: SymlinkOperation[] = [];

      for (const topic of classification.topics) {
        operations.push({
          source: projectPath,
          targetDir: path.join(baseDir, "by-topic", topic),
          linkName: projectName,
          category: `by-topic/${topic}`,
        });
      }

      for (const type of classification.types) {
        operations.push({
          source: projectPath,
          targetDir: path.join(baseDir, "by-type", type),
          linkName: projectName,
          category: `by-type/${type}`,
        });
      }

      const projectErrors: string[] = [];
      let symlinksCreated = 0;

      if (!input.dryRun) {
        for (const op of operations) {
          const result = await executor.createSymlink(op);
          if (result.success) {
            symlinksCreated++;
          } else if (result.error) {
            projectErrors.push(`${op.category}: ${result.error}`);
          }
        }
      } else {
        symlinksCreated = operations.length;
      }

      results.push({
        projectPath,
        projectName,
        symlinksCreated,
        errors: projectErrors.length > 0 ? projectErrors : undefined,
      });

      totalSymlinksCreated += symlinksCreated;
      if (projectErrors.length === 0 && operations.length > 0) {
        succeeded++;
      } else if (projectErrors.length > 0) {
        failed++;
      } else {
        succeeded++; // No operations needed
      }
    }

    // Log activity
    await activityStorage.logActivity({
      action: "workbench.bulk-autolink",
      entityType: "project",
      metadata: {
        projectCount: input.projectPaths.length,
        symlinksCreated: totalSymlinksCreated,
        succeeded,
        failed,
      },
    });

    log.info(
      {
        total: input.projectPaths.length,
        succeeded,
        failed,
        symlinksCreated: totalSymlinksCreated,
      },
      "Bulk autolink complete"
    );

    res.json({
      success: failed === 0,
      results,
      summary: {
        total: input.projectPaths.length,
        succeeded,
        failed,
        symlinksCreated: totalSymlinksCreated,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Bulk autolink failed");
    res.status(500).json({ message: "Internal error during bulk autolink" });
  }
});

export default router;
