/**
 * @file file-watcher.ts
 * @description File system watcher service using chokidar.
 * @tier Tier 1 — Editor project tracking. See docs/architecture/FILE-WATCHERS.md.
 * @phase Phase 3 - File System Integration
 * @author FW (File Watcher Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Debounced file events (2s window)
 * - Skip pattern support
 * - Project boundary detection
 * - WebSocket integration for real-time updates
 */

import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import { getWSServer } from "../ws";
import type {
  WSProjectAddedMessage,
  WSProjectChangedMessage,
  WSProjectRemovedMessage,
} from "../ws/types";
import { fileWatcherLogger as log } from "../logger";

const DEFAULT_DEBOUNCE_MS = 2000;

/**
 * Configuration for the file watcher.
 */
export interface FileWatcherConfig {
  /** Root directory to watch */
  rootPath: string;
  /** Patterns to skip (glob format) */
  skipPatterns?: string[];
  /** Debounce window in milliseconds */
  debounceMs?: number;
  /** Maximum depth to traverse */
  depth?: number;
  /** Whether to follow symlinks */
  followSymlinks?: boolean;
  /** Callback for project detection */
  onProjectDetected?: (projectPath: string) => void;
}

/**
 * Default skip patterns for common non-project directories.
 */
export const DEFAULT_SKIP_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.svn/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/venv/**",
  "**/.venv/**",
  "**/env/**",
  "**/.env/**",
  "**/target/**", // Rust
  "**/vendor/**", // Go, PHP
  "**/.idea/**",
  "**/.vscode/**",
  "**/Pods/**", // iOS
  "**/*.egg-info/**",
];

/**
 * Pending change tracking for debouncing.
 */
interface PendingChange {
  type: "add" | "change" | "unlink";
  path: string;
  timer: NodeJS.Timeout;
}

/**
 * File watcher service for monitoring project directories.
 */
export class FileWatcherService {
  private watcher: FSWatcher | null = null;
  private config: FileWatcherConfig;
  private isReady: boolean = false;
  private pendingChanges: Map<string, PendingChange> = new Map();
  private projectPaths: Set<string> = new Set();

  constructor(config: FileWatcherConfig) {
    this.config = {
      skipPatterns: DEFAULT_SKIP_PATTERNS,
      debounceMs: DEFAULT_DEBOUNCE_MS,
      depth: 3,
      followSymlinks: false,
      ...config,
    };
  }

  /**
   * Starts watching the configured directory.
   */
  async start(): Promise<void> {
    if (this.watcher) {
      log.warn("Already watching");
      return;
    }

    log.info({ rootPath: this.config.rootPath }, "Starting file watcher");

    this.watcher = chokidar.watch(this.config.rootPath, {
      ignored: this.config.skipPatterns,
      persistent: true,
      ignoreInitial: false,
      followSymlinks: this.config.followSymlinks,
      depth: this.config.depth,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    this.watcher.on("ready", () => {
      this.isReady = true;
      log.info({ projectCount: this.projectPaths.size }, "File watcher ready");
    });

    this.watcher.on("addDir", (dirPath) => this.handleDirectoryAdd(dirPath));
    this.watcher.on("unlinkDir", (dirPath) => this.handleDirectoryRemove(dirPath));
    this.watcher.on("add", (filePath) => this.handleFileChange("add", filePath));
    this.watcher.on("change", (filePath) => this.handleFileChange("change", filePath));
    this.watcher.on("unlink", (filePath) => this.handleFileChange("unlink", filePath));
    this.watcher.on("error", (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
    });
  }

  /**
   * Stops the file watcher.
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    log.info("Stopping file watcher");

    // Clear pending changes
    this.pendingChanges.forEach((change) => {
      clearTimeout(change.timer);
    });
    this.pendingChanges.clear();

    await this.watcher.close();
    this.watcher = null;
    this.isReady = false;
    this.projectPaths.clear();

    log.info("File watcher stopped");
  }

  /**
   * Adds a path to watch.
   */
  addPath(watchPath: string): void {
    if (this.watcher) {
      this.watcher.add(watchPath);
      log.debug({ watchPath }, "Added path to watcher");
    }
  }

  /**
   * Removes a path from watching.
   */
  removePath(watchPath: string): void {
    if (this.watcher) {
      this.watcher.unwatch(watchPath);
      log.debug({ watchPath }, "Removed path from watcher");
    }
  }

  /**
   * Handles directory addition (potential new project).
   */
  private handleDirectoryAdd(dirPath: string): void {
    // Check if this looks like a project directory
    if (this.isProjectDirectory(dirPath)) {
      this.projectPaths.add(dirPath);

      if (this.isReady) {
        this.emitProjectAdded(dirPath);
      }

      if (this.config.onProjectDetected) {
        this.config.onProjectDetected(dirPath);
      }
    }
  }

  /**
   * Handles directory removal.
   */
  private handleDirectoryRemove(dirPath: string): void {
    if (this.projectPaths.has(dirPath)) {
      this.projectPaths.delete(dirPath);

      if (this.isReady) {
        this.emitProjectRemoved(dirPath);
      }
    }
  }

  /**
   * Handles file changes with debouncing.
   */
  private handleFileChange(type: "add" | "change" | "unlink", filePath: string): void {
    if (!this.isReady) {
      return;
    }

    // Get the project directory this file belongs to
    const projectDir = this.getProjectDirectory(filePath);
    if (!projectDir) {
      return;
    }

    // Cancel any pending change for this project
    const existing = this.pendingChanges.get(projectDir);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // Set up debounced emit
    const timer = setTimeout(() => {
      this.pendingChanges.delete(projectDir);
      this.emitProjectChanged(projectDir);
    }, this.config.debounceMs);

    this.pendingChanges.set(projectDir, {
      type,
      path: filePath,
      timer,
    });
  }

  /**
   * Handles watcher errors.
   */
  private handleError(err: Error): void {
    log.error({ error: err.message }, "File watcher error");

    const wsServer = getWSServer();
    if (wsServer) {
      wsServer.broadcast({
        type: "error",
        timestamp: Date.now(),
        code: "WATCHER_ERROR",
        message: err.message,
      });
    }
  }

  /**
   * Determines if a directory is a project directory.
   * A project is identified by common project markers.
   */
  private isProjectDirectory(dirPath: string): boolean {
    const dirName = path.basename(dirPath);
    const parentDir = path.dirname(dirPath);

    // Skip if this is too deep or is the root
    if (dirPath === this.config.rootPath) {
      return false;
    }

    // Check depth from root
    const relPath = path.relative(this.config.rootPath, dirPath);
    const depth = relPath.split(path.sep).length;

    // Projects are typically at depth 1-2 from the watch root
    // e.g., /projects/my-project or /projects/category/my-project
    if (depth > 2) {
      return false;
    }

    // Skip hidden directories
    if (dirName.startsWith(".")) {
      return false;
    }

    // Skip common non-project directories
    const skipNames = [
      "node_modules",
      "dist",
      "build",
      "coverage",
      "__pycache__",
      "venv",
      ".venv",
      "target",
      "vendor",
    ];
    if (skipNames.includes(dirName.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Gets the project directory for a given file path.
   */
  private getProjectDirectory(filePath: string): string | null {
    for (const projectPath of this.projectPaths) {
      if (filePath.startsWith(projectPath + path.sep) || filePath === projectPath) {
        return projectPath;
      }
    }
    return null;
  }

  /**
   * Emits a project added event.
   */
  private emitProjectAdded(projectPath: string): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSProjectAddedMessage = {
      type: "project:added",
      timestamp: Date.now(),
      data: {
        path: projectPath,
        name: path.basename(projectPath),
      },
    };

    wsServer.broadcast(message, "projects");
    log.info({ project: path.basename(projectPath), projectPath }, "Project added");
  }

  /**
   * Emits a project changed event.
   */
  private emitProjectChanged(projectPath: string): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSProjectChangedMessage = {
      type: "project:changed",
      timestamp: Date.now(),
      data: {
        path: projectPath,
        name: path.basename(projectPath),
      },
    };

    wsServer.broadcast(message, "projects");
    log.debug({ project: path.basename(projectPath), projectPath }, "Project changed");
  }

  /**
   * Emits a project removed event.
   */
  private emitProjectRemoved(projectPath: string): void {
    const wsServer = getWSServer();
    if (!wsServer) return;

    const message: WSProjectRemovedMessage = {
      type: "project:removed",
      timestamp: Date.now(),
      data: {
        path: projectPath,
        name: path.basename(projectPath),
      },
    };

    wsServer.broadcast(message, "projects");
    log.info({ project: path.basename(projectPath), projectPath }, "Project removed");
  }

  /**
   * Gets the list of detected project paths.
   */
  getProjectPaths(): string[] {
    return Array.from(this.projectPaths);
  }

  /**
   * Checks if the watcher is ready.
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Gets the number of watched projects.
   */
  get projectCount(): number {
    return this.projectPaths.size;
  }
}

// Singleton instance
let fileWatcherInstance: FileWatcherService | null = null;

/**
 * Creates and starts the file watcher service.
 */
export async function startFileWatcher(config: FileWatcherConfig): Promise<FileWatcherService> {
  if (fileWatcherInstance) {
    log.warn("Already started, stopping existing instance");
    await fileWatcherInstance.stop();
  }

  fileWatcherInstance = new FileWatcherService(config);
  await fileWatcherInstance.start();
  return fileWatcherInstance;
}

/**
 * Gets the file watcher instance.
 */
export function getFileWatcher(): FileWatcherService | null {
  return fileWatcherInstance;
}

/**
 * Stops and resets the file watcher.
 */
export async function stopFileWatcher(): Promise<void> {
  if (fileWatcherInstance) {
    await fileWatcherInstance.stop();
    fileWatcherInstance = null;
  }
}
