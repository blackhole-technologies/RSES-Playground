/**
 * @file project-scanner.ts
 * @description Service for scanning directories to discover projects.
 * @phase Phase 3 - File System Integration
 * @author ALK (Auto-Link Developer Agent)
 * @validated ARC (Project Architect Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Recursive directory scanning with depth limits
 * - Skip pattern support
 * - Project marker detection (package.json, etc.)
 * - RSES classification integration
 * - Progress reporting via WebSocket
 */

import fs from "fs/promises";
import path from "path";
import { getWSServer } from "../ws";
import { RsesParser, deriveAttributesFromPath, type RsesConfig } from "../lib/rses";
import { DEFAULT_SKIP_PATTERNS } from "./file-watcher";
import type {
  WSScanStartedMessage,
  WSScanProgressMessage,
  WSScanCompletedMessage,
} from "../ws/types";
import { createModuleLogger } from "../logger";
import { projectsScannedTotal, projectScanDuration } from "../metrics";

const log = createModuleLogger("scanner");

/**
 * Project marker files that indicate a project root.
 */
const PROJECT_MARKERS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "CMakeLists.txt",
  "Makefile",
  ".git",
];

/**
 * Scanned project information.
 */
export interface ScannedProject {
  /** Absolute path to project */
  path: string;
  /** Project name (directory name) */
  name: string;
  /** Project markers found */
  markers: string[];
  /** Classification from RSES if config provided */
  classification?: {
    sets: string[];
    topics: string[];
    types: string[];
  };
  /** Derived attributes from path */
  attributes?: Record<string, string>;
  /** Last modified time */
  mtime?: Date;
}

/**
 * Scanner configuration.
 */
export interface ScannerConfig {
  /** Root directory to scan */
  rootPath: string;
  /** Maximum depth to traverse (default: 3) */
  maxDepth?: number;
  /** Patterns to skip */
  skipPatterns?: string[];
  /** RSES config for classification */
  rsesConfig?: RsesConfig;
  /** Progress callback */
  onProgress?: (scanned: number, current: string) => void;
}

/**
 * Scan result.
 */
export interface ScanResult {
  /** Scanned projects */
  projects: ScannedProject[];
  /** Total directories scanned */
  directoriesScanned: number;
  /** Scan duration in ms */
  duration: number;
  /** Any errors encountered */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Checks if a path matches any skip pattern.
 */
function shouldSkip(targetPath: string, skipPatterns: string[]): boolean {
  const segments = targetPath.split(path.sep);

  for (const pattern of skipPatterns) {
    // Simple pattern matching for common cases
    // Full glob matching would require a library like minimatch
    const patternParts = pattern.replace(/\*\*/g, "").replace(/\*/g, "").split("/").filter(Boolean);

    for (const part of patternParts) {
      if (segments.includes(part)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a directory is a project by looking for markers.
 */
async function detectProjectMarkers(dirPath: string): Promise<string[]> {
  const markers: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const entryNames = new Set(entries.map((e) => e.name));

    for (const marker of PROJECT_MARKERS) {
      if (entryNames.has(marker)) {
        markers.push(marker);
      }
    }
  } catch {
    // Directory may not be readable
  }

  return markers;
}

/**
 * Scans a directory for projects.
 */
export async function scanDirectory(config: ScannerConfig): Promise<ScanResult> {
  const startTime = Date.now();
  const projects: ScannedProject[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  const maxDepth = config.maxDepth ?? 3;
  const skipPatterns = config.skipPatterns ?? DEFAULT_SKIP_PATTERNS;

  let directoriesScanned = 0;

  // Emit scan started
  const wsServer = getWSServer();
  if (wsServer) {
    const startMsg: WSScanStartedMessage = {
      type: "scan:started",
      timestamp: Date.now(),
      data: { rootPath: config.rootPath },
    };
    wsServer.broadcast(startMsg, "scanner");
  }

  /**
   * Recursively scans a directory.
   */
  async function scan(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    if (shouldSkip(currentPath, skipPatterns)) {
      return;
    }

    directoriesScanned++;

    // Report progress
    if (config.onProgress) {
      config.onProgress(directoriesScanned, currentPath);
    }

    // Emit progress via WebSocket every 50 directories
    if (wsServer && directoriesScanned % 50 === 0) {
      const progressMsg: WSScanProgressMessage = {
        type: "scan:progress",
        timestamp: Date.now(),
        data: {
          scannedCount: directoriesScanned,
          currentPath: path.relative(config.rootPath, currentPath),
        },
      };
      wsServer.broadcast(progressMsg, "scanner");
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Check for project markers at this level
      const markers = await detectProjectMarkers(currentPath);

      if (markers.length > 0 && currentPath !== config.rootPath) {
        // This is a project
        const projectName = path.basename(currentPath);

        const project: ScannedProject = {
          path: currentPath,
          name: projectName,
          markers,
        };

        // Derive attributes from path
        const relativePath = path.relative(config.rootPath, currentPath);
        project.attributes = deriveAttributesFromPath(relativePath);

        // Classify using RSES if config provided
        if (config.rsesConfig) {
          const testResult = RsesParser.test(
            config.rsesConfig,
            projectName,
            project.attributes
          );
          project.classification = {
            sets: testResult.sets,
            topics: testResult.topics,
            types: testResult.types,
          };
        }

        // Get modification time
        try {
          const stats = await fs.stat(currentPath);
          project.mtime = stats.mtime;
        } catch {
          // Ignore stat errors
        }

        projects.push(project);

        // Don't recurse into project directories
        return;
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(currentPath, entry.name);

          // Skip hidden directories
          if (entry.name.startsWith(".")) {
            continue;
          }

          await scan(subPath, depth + 1);
        }
      }
    } catch (err) {
      errors.push({
        path: currentPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Start scanning from root
  await scan(config.rootPath, 0);

  const duration = Date.now() - startTime;

  // Emit scan completed
  if (wsServer) {
    const completeMsg: WSScanCompletedMessage = {
      type: "scan:completed",
      timestamp: Date.now(),
      data: {
        projectCount: projects.length,
        duration,
      },
    };
    wsServer.broadcast(completeMsg, "scanner");
  }

  log.info(
    { projectCount: projects.length, directoriesScanned, duration },
    "Scan completed"
  );

  // Track metrics
  projectsScannedTotal.inc(projects.length);
  projectScanDuration.observe(duration / 1000); // Convert to seconds

  return {
    projects,
    directoriesScanned,
    duration,
    errors,
  };
}

/**
 * Scans and classifies projects using a stored config.
 */
export async function scanWithConfig(
  rootPath: string,
  configContent: string
): Promise<ScanResult> {
  const parseResult = RsesParser.parse(configContent);

  if (!parseResult.valid || !parseResult.parsed) {
    throw new Error("Invalid RSES configuration");
  }

  return scanDirectory({
    rootPath,
    rsesConfig: parseResult.parsed,
  });
}

/**
 * Quickly counts projects without full scanning.
 */
export async function countProjects(
  rootPath: string,
  maxDepth: number = 3
): Promise<number> {
  let count = 0;

  async function scan(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const markers = await detectProjectMarkers(currentPath);

      if (markers.length > 0 && currentPath !== rootPath) {
        count++;
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          if (shouldSkip(entry.name, DEFAULT_SKIP_PATTERNS.map((p) => p.split("/")[0]))) {
            continue;
          }
          await scan(path.join(currentPath, entry.name), depth + 1);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await scan(rootPath, 0);
  return count;
}

// Re-export RsesConfig type
export type { RsesConfig };
