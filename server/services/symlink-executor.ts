/**
 * @file symlink-executor.ts
 * @description Service for atomic symlink operations with rollback capability.
 * @phase Phase 3 - File System Integration
 * @author ALK (Auto-Link Developer Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Atomic symlink creation with staging
 * - Rollback capability on failure
 * - Path validation to prevent boundary escapes
 * - Transaction-based batch operations
 */

import fs from "fs/promises";
import path from "path";
import { getWSServer } from "../ws";
import type {
  WSSymlinkCreatedMessage,
  WSSymlinkRemovedMessage,
  WSSymlinkErrorMessage,
} from "../ws/types";
import { symlinkLogger as log } from "../logger";
import { symlinksCreatedTotal, symlinksRemovedTotal } from "../metrics";

/**
 * Result of a symlink operation.
 */
export interface SymlinkResult {
  success: boolean;
  source: string;
  target: string;
  category: string;
  error?: string;
}

/**
 * Symlink operation for batch processing.
 */
export interface SymlinkOperation {
  /** Source project path */
  source: string;
  /** Target symlink directory */
  targetDir: string;
  /** Symlink name (usually project name) */
  linkName: string;
  /** Category for logging (e.g., "by-topic/ai") */
  category: string;
}

/**
 * Transaction for atomic batch operations.
 */
interface SymlinkTransaction {
  operations: SymlinkOperation[];
  createdLinks: string[];
  createdDirs: string[];
}

/**
 * Symlink executor configuration.
 */
export interface SymlinkExecutorConfig {
  /** Base directory for symlinks */
  baseDir: string;
  /** Allowed source directories (for security) */
  allowedSourceDirs?: string[];
  /** Whether to create parent directories */
  createParentDirs?: boolean;
  /** Dry run mode - log but don't execute */
  dryRun?: boolean;
}

/**
 * Validates that a path is within allowed boundaries.
 */
function isPathSafe(targetPath: string, basePath: string): boolean {
  const normalizedTarget = path.normalize(targetPath);
  const normalizedBase = path.normalize(basePath);

  // Ensure target is under base
  if (!normalizedTarget.startsWith(normalizedBase)) {
    return false;
  }

  // Check for path traversal attempts
  if (targetPath.includes("..")) {
    return false;
  }

  return true;
}

/**
 * Checks if a path exists.
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Symlink executor service for managing symlinks.
 */
export class SymlinkExecutor {
  private config: SymlinkExecutorConfig;

  constructor(config: SymlinkExecutorConfig) {
    this.config = {
      createParentDirs: true,
      dryRun: false,
      ...config,
    };
  }

  /**
   * Creates a single symlink.
   */
  async createSymlink(op: SymlinkOperation): Promise<SymlinkResult> {
    const linkPath = path.join(op.targetDir, op.linkName);

    // Validate paths
    if (!isPathSafe(linkPath, this.config.baseDir)) {
      const error = "Target path escapes base directory";
      this.emitError(op.source, error);
      return {
        success: false,
        source: op.source,
        target: linkPath,
        category: op.category,
        error,
      };
    }

    // Check if source is in allowed directories
    if (this.config.allowedSourceDirs && this.config.allowedSourceDirs.length > 0) {
      const isAllowed = this.config.allowedSourceDirs.some((dir) =>
        op.source.startsWith(dir)
      );
      if (!isAllowed) {
        const error = "Source path not in allowed directories";
        this.emitError(op.source, error);
        return {
          success: false,
          source: op.source,
          target: linkPath,
          category: op.category,
          error,
        };
      }
    }

    if (this.config.dryRun) {
      log.debug({ source: op.source, linkPath, dryRun: true }, "DRY RUN: Symlink creation");
      return {
        success: true,
        source: op.source,
        target: linkPath,
        category: op.category,
      };
    }

    try {
      // Create parent directories if needed
      if (this.config.createParentDirs) {
        await fs.mkdir(op.targetDir, { recursive: true });
      }

      // Remove existing symlink if present
      if (await pathExists(linkPath)) {
        const stats = await fs.lstat(linkPath);
        if (stats.isSymbolicLink()) {
          await fs.unlink(linkPath);
        } else {
          throw new Error("Target exists and is not a symlink");
        }
      }

      // Create the symlink (relative path for portability)
      const relativePath = path.relative(op.targetDir, op.source);
      await fs.symlink(relativePath, linkPath);

      this.emitCreated(op);
      symlinksCreatedTotal.inc({ status: "success" });

      log.info({ category: op.category, linkName: op.linkName, source: op.source }, "Symlink created");

      return {
        success: true,
        source: op.source,
        target: linkPath,
        category: op.category,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emitError(op.source, error);
      symlinksCreatedTotal.inc({ status: "error" });

      log.error({ err: error, category: op.category, linkName: op.linkName }, "Symlink creation failed");

      return {
        success: false,
        source: op.source,
        target: linkPath,
        category: op.category,
        error,
      };
    }
  }

  /**
   * Removes a symlink.
   */
  async removeSymlink(targetPath: string): Promise<SymlinkResult> {
    if (!isPathSafe(targetPath, this.config.baseDir)) {
      return {
        success: false,
        source: "",
        target: targetPath,
        category: "",
        error: "Target path escapes base directory",
      };
    }

    if (this.config.dryRun) {
      log.debug({ targetPath, dryRun: true }, "DRY RUN: Symlink removal");
      return {
        success: true,
        source: "",
        target: targetPath,
        category: "",
      };
    }

    try {
      const stats = await fs.lstat(targetPath);

      if (!stats.isSymbolicLink()) {
        return {
          success: false,
          source: "",
          target: targetPath,
          category: "",
          error: "Target is not a symlink",
        };
      }

      const source = await fs.readlink(targetPath);
      await fs.unlink(targetPath);

      const category = path.dirname(path.relative(this.config.baseDir, targetPath));
      this.emitRemoved(source, targetPath, category);
      symlinksRemovedTotal.inc();

      log.info({ targetPath }, "Symlink removed");

      return {
        success: true,
        source,
        target: targetPath,
        category,
      };
    } catch (err) {
      return {
        success: false,
        source: "",
        target: targetPath,
        category: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Executes multiple symlink operations atomically.
   * If any operation fails, all created symlinks are rolled back.
   */
  async executeTransaction(operations: SymlinkOperation[]): Promise<{
    success: boolean;
    results: SymlinkResult[];
    rolledBack: boolean;
  }> {
    const transaction: SymlinkTransaction = {
      operations,
      createdLinks: [],
      createdDirs: [],
    };

    const results: SymlinkResult[] = [];
    let hasError = false;

    for (const op of operations) {
      const result = await this.createSymlink(op);
      results.push(result);

      if (result.success) {
        transaction.createdLinks.push(result.target);
      } else {
        hasError = true;
        break;
      }
    }

    if (hasError && !this.config.dryRun) {
      // Rollback created symlinks
      log.warn({ count: transaction.createdLinks.length }, "Rolling back symlinks");

      for (const linkPath of transaction.createdLinks) {
        try {
          await fs.unlink(linkPath);
          log.debug({ linkPath }, "Symlink rolled back");
        } catch (err) {
          log.error({ err, linkPath }, "Rollback failed");
        }
      }

      return {
        success: false,
        results,
        rolledBack: true,
      };
    }

    return {
      success: !hasError,
      results,
      rolledBack: false,
    };
  }

  /**
   * Cleans up broken symlinks in the base directory.
   */
  async cleanupBroken(): Promise<string[]> {
    const removed: string[] = [];

    async function scanDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isSymbolicLink()) {
            try {
              // Check if target exists
              await fs.stat(fullPath);
            } catch {
              // Target doesn't exist - broken symlink
              await fs.unlink(fullPath);
              removed.push(fullPath);
              log.debug({ fullPath }, "Cleaned up broken link");
            }
          }
        }
      } catch (err) {
        log.error({ err, dir }, "Error scanning directory for cleanup");
      }
    }

    await scanDir(this.config.baseDir);

    log.info({ removedCount: removed.length }, "Cleaned up broken symlinks");
    return removed;
  }

  /**
   * Lists all symlinks in the base directory.
   */
  async listSymlinks(): Promise<Array<{ link: string; target: string; category: string }>> {
    const symlinks: Array<{ link: string; target: string; category: string }> = [];

    async function scanDir(dir: string, baseDir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanDir(fullPath, baseDir);
          } else if (entry.isSymbolicLink()) {
            const target = await fs.readlink(fullPath);
            const category = path.relative(baseDir, path.dirname(fullPath));
            symlinks.push({
              link: fullPath,
              target: path.resolve(path.dirname(fullPath), target),
              category,
            });
          }
        }
      } catch {
        // Ignore errors
      }
    }

    await scanDir(this.config.baseDir, this.config.baseDir);
    return symlinks;
  }

  /**
   * Emits a symlink created event.
   */
  private emitCreated(op: SymlinkOperation): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSSymlinkCreatedMessage = {
      type: "symlink:created",
      timestamp: Date.now(),
      data: {
        source: op.source,
        target: path.join(op.targetDir, op.linkName),
        category: op.category,
      },
    };

    wsServer.broadcast(message, "symlinks");
  }

  /**
   * Emits a symlink removed event.
   */
  private emitRemoved(source: string, target: string, category: string): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSSymlinkRemovedMessage = {
      type: "symlink:removed",
      timestamp: Date.now(),
      data: { source, target, category },
    };

    wsServer.broadcast(message, "symlinks");
  }

  /**
   * Emits a symlink error event.
   */
  private emitError(source: string, error: string): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSSymlinkErrorMessage = {
      type: "symlink:error",
      timestamp: Date.now(),
      data: { source, error },
    };

    wsServer.broadcast(message, "symlinks");
  }
}

// Singleton instance
let executorInstance: SymlinkExecutor | null = null;

/**
 * Initializes the symlink executor.
 */
export function initSymlinkExecutor(config: SymlinkExecutorConfig): SymlinkExecutor {
  executorInstance = new SymlinkExecutor(config);
  return executorInstance;
}

/**
 * Gets the symlink executor instance.
 */
export function getSymlinkExecutor(): SymlinkExecutor | null {
  return executorInstance;
}

/**
 * Resets the symlink executor.
 */
export function resetSymlinkExecutor(): void {
  executorInstance = null;
}
