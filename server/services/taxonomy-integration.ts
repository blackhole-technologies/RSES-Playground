/**
 * @file taxonomy-integration.ts
 * @description Integration layer connecting the Taxonomy Engine with:
 *              - File watcher for auto-classification
 *              - Symlink executor for physical manifestation
 *              - WebSocket for real-time updates
 *              - Project scanner for batch operations
 *
 * @phase CMS Transformation - Auto-Link Integration
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 */

import { EventEmitter } from "events";
import path from "path";
import {
  TaxonomyEngine,
  ContentItem,
  ClassificationResult,
  Term,
  Vocabulary,
  ClassificationConflict,
  BatchClassificationResult,
  ReclassificationPlan,
  getTaxonomyEngine,
  initTaxonomyEngine,
  ClassificationEngineConfig,
} from "./taxonomy-engine";
import { FileWatcherService, getFileWatcher, FileWatcherConfig } from "./file-watcher";
import { SymlinkExecutor, getSymlinkExecutor, SymlinkOperation, SymlinkResult } from "./symlink-executor";
import { scanDirectory, ScannedProject } from "./project-scanner";
import { RsesParser, RsesConfig } from "../lib/rses";
import { getWSServer } from "../ws";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("taxonomy-integration");

// ============================================================================
// INTEGRATION EVENTS
// ============================================================================

/**
 * Events emitted by the taxonomy integration layer.
 */
export interface TaxonomyIntegrationEvents {
  /** Project detected and queued for classification */
  "project:detected": (projectPath: string) => void;
  /** Project classified */
  "project:classified": (project: ScannedProject, result: ClassificationResult) => void;
  /** Symlinks created for project */
  "project:linked": (project: ScannedProject, symlinks: SymlinkResult[]) => void;
  /** Classification conflict detected */
  "conflict:detected": (project: ScannedProject, conflict: ClassificationConflict) => void;
  /** Batch operation started */
  "batch:started": (operation: string, total: number) => void;
  /** Batch operation progress */
  "batch:progress": (operation: string, processed: number, total: number) => void;
  /** Batch operation completed */
  "batch:completed": (operation: string, result: BatchClassificationResult) => void;
  /** Config changed, re-classification needed */
  "config:changed": (plan: ReclassificationPlan) => void;
  /** Error occurred */
  "error": (error: Error, context?: string) => void;
}

// ============================================================================
// WEBSOCKET MESSAGE TYPES
// ============================================================================

export interface WSTermCreatedMessage {
  type: "term:created";
  timestamp: number;
  data: {
    vocabularyId: string;
    term: {
      id: string;
      value: string;
      label: string;
      contentCount: number;
    };
  };
}

export interface WSTermUpdatedMessage {
  type: "term:updated";
  timestamp: number;
  data: {
    vocabularyId: string;
    termId: string;
    changes: Partial<Term>;
  };
}

export interface WSClassificationMessage {
  type: "content:classified";
  timestamp: number;
  data: {
    contentId: string;
    contentName: string;
    termAssignments: Array<{
      vocabularyId: string;
      termValue: string;
    }>;
    hasConflicts: boolean;
  };
}

export interface WSConflictMessage {
  type: "classification:conflict";
  timestamp: number;
  data: {
    contentId: string;
    contentName: string;
    conflictType: string;
    conflictingTerms: string[];
    resolution: string;
  };
}

export interface WSReclassificationProgressMessage {
  type: "reclassification:progress";
  timestamp: number;
  data: {
    processed: number;
    total: number;
    percentComplete: number;
  };
}

// ============================================================================
// CLASSIFICATION QUEUE
// ============================================================================

/**
 * Queue item for classification.
 */
interface ClassificationQueueItem {
  contentPath: string;
  contentName: string;
  priority: number;
  addedAt: Date;
  attributes?: Record<string, string>;
}

/**
 * Priority queue for classification tasks.
 */
class ClassificationQueue {
  private queue: ClassificationQueueItem[] = [];
  private processing: boolean = false;
  private processCallback?: (item: ClassificationQueueItem) => Promise<void>;

  constructor() {}

  /**
   * Sets the callback for processing items.
   */
  setProcessor(callback: (item: ClassificationQueueItem) => Promise<void>): void {
    this.processCallback = callback;
  }

  /**
   * Adds an item to the queue.
   */
  enqueue(item: ClassificationQueueItem): void {
    // Check for duplicates
    const existing = this.queue.findIndex((q) => q.contentPath === item.contentPath);
    if (existing !== -1) {
      // Update priority if higher
      if (item.priority > this.queue[existing].priority) {
        this.queue[existing].priority = item.priority;
      }
      return;
    }

    this.queue.push(item);
    // Sort by priority (higher first)
    this.queue.sort((a, b) => b.priority - a.priority);

    // Start processing if not already
    if (!this.processing && this.processCallback) {
      this.processNext();
    }
  }

  /**
   * Processes the next item in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0 || !this.processCallback) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;

    try {
      await this.processCallback(item);
    } catch (error) {
      log.error({ error, contentPath: item.contentPath }, "Queue processing error");
    }

    // Continue processing
    setImmediate(() => this.processNext());
  }

  /**
   * Gets the current queue length.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Checks if processing is active.
   */
  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Clears the queue.
   */
  clear(): void {
    this.queue = [];
  }
}

// ============================================================================
// MAIN INTEGRATION CLASS
// ============================================================================

/**
 * Configuration for the taxonomy integration layer.
 */
export interface TaxonomyIntegrationConfig {
  /** RSES config content */
  rsesConfigContent: string;
  /** Base directory for symlinks */
  symlinkBaseDir: string;
  /** Root directory for file watching */
  watchRootPath?: string;
  /** Enable file watcher integration */
  enableFileWatcher: boolean;
  /** Enable auto-symlink creation */
  enableAutoSymlinks: boolean;
  /** Classification queue settings */
  queueSettings?: {
    maxConcurrent?: number;
    debounceMs?: number;
  };
  /** Conflict resolution strategy. "most_specific" is excluded because
   * the auto-resolution config (ConfigConflictResolutionStrategy) doesn't
   * support it — it's an internal-only strategy used by the engine. */
  conflictResolution?: "first_match" | "all_matches" | "highest_priority" | "manual";
}

/**
 * Main integration class that coordinates taxonomy engine with file system.
 */
export class TaxonomyIntegration extends EventEmitter {
  private config: TaxonomyIntegrationConfig;
  private engine: TaxonomyEngine | null = null;
  private rsesConfig: RsesConfig | null = null;
  private classificationQueue: ClassificationQueue;
  private initialized: boolean = false;

  constructor(config: TaxonomyIntegrationConfig) {
    super();
    this.config = config;
    this.classificationQueue = new ClassificationQueue();
  }

  /**
   * Initializes the integration layer.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn("Already initialized");
      return;
    }

    log.info("Initializing taxonomy integration");

    // Parse RSES config
    const parseResult = RsesParser.parse(this.config.rsesConfigContent);
    if (!parseResult.valid || !parseResult.parsed) {
      throw new Error(`Invalid RSES config: ${parseResult.errors.map((e) => e.message).join(", ")}`);
    }
    this.rsesConfig = parseResult.parsed;

    // Initialize taxonomy engine
    this.engine = await initTaxonomyEngine(this.rsesConfig, {
      symlinkBaseDir: this.config.symlinkBaseDir,
      conflictResolution: this.config.conflictResolution || "all_matches",
      enableHierarchy: true,
      hierarchyDelimiter: "/",
    });

    // Set up engine event handlers
    this.setupEngineEvents();

    // Set up classification queue processor
    this.classificationQueue.setProcessor(async (item) => {
      await this.processClassificationItem(item);
    });

    // Set up file watcher integration
    if (this.config.enableFileWatcher && this.config.watchRootPath) {
      await this.setupFileWatcherIntegration();
    }

    this.initialized = true;
    log.info("Taxonomy integration initialized");
  }

  /**
   * Sets up event handlers for the taxonomy engine.
   */
  private setupEngineEvents(): void {
    if (!this.engine) return;

    this.engine.on("term:created", (term: Term) => {
      this.broadcastWSMessage<WSTermCreatedMessage>({
        type: "term:created",
        timestamp: Date.now(),
        data: {
          vocabularyId: term.vocabularyId,
          term: {
            id: term.id,
            value: term.value,
            label: term.label,
            contentCount: term.contentCount,
          },
        },
      });
    });

    this.engine.on("term:updated", (term: Term) => {
      this.broadcastWSMessage<WSTermUpdatedMessage>({
        type: "term:updated",
        timestamp: Date.now(),
        data: {
          vocabularyId: term.vocabularyId,
          termId: term.id,
          changes: {
            contentCount: term.contentCount,
            weight: term.weight,
            lastClassifiedAt: term.lastClassifiedAt,
          },
        },
      });
    });

    this.engine.on("content:classified", (result: ClassificationResult) => {
      this.broadcastWSMessage<WSClassificationMessage>({
        type: "content:classified",
        timestamp: Date.now(),
        data: {
          contentId: result.contentId,
          contentName: result.contentId.split("/").pop() || result.contentId,
          termAssignments: result.termAssignments.map((a) => ({
            vocabularyId: a.vocabularyId,
            termValue: a.termValue,
          })),
          hasConflicts: result.conflicts.length > 0,
        },
      });
    });

    this.engine.on("conflict:detected", (conflict: ClassificationConflict) => {
      this.broadcastWSMessage<WSConflictMessage>({
        type: "classification:conflict",
        timestamp: Date.now(),
        data: {
          contentId: "", // Would need to track this
          contentName: "",
          conflictType: conflict.type,
          conflictingTerms: conflict.conflictingTerms,
          resolution: conflict.resolution,
        },
      });
    });

    this.engine.on("reclassification:progress", (processed: number, total: number) => {
      this.broadcastWSMessage<WSReclassificationProgressMessage>({
        type: "reclassification:progress",
        timestamp: Date.now(),
        data: {
          processed,
          total,
          percentComplete: Math.round((processed / total) * 100),
        },
      });
    });

    this.engine.on("error", (error: Error, context?: string) => {
      log.error({ error: error.message, context }, "Taxonomy engine error");
      this.emit("error", error, context);
    });
  }

  /**
   * Sets up file watcher integration for auto-classification.
   */
  private async setupFileWatcherIntegration(): Promise<void> {
    const fileWatcher = getFileWatcher();
    if (!fileWatcher) {
      log.warn("File watcher not available");
      return;
    }

    // Listen for project additions
    fileWatcher.addPath(this.config.watchRootPath!);

    // Note: In production, we'd set up proper event handlers
    // This is a simplified integration point
    log.info({ rootPath: this.config.watchRootPath }, "File watcher integration configured");
  }

  /**
   * Processes a classification queue item.
   */
  private async processClassificationItem(item: ClassificationQueueItem): Promise<void> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    const content: ContentItem = {
      id: item.contentPath,
      name: item.contentName,
      path: item.contentPath,
      attributes: item.attributes || {},
    };

    try {
      const result = await this.engine.classify(content);

      // Create symlinks if enabled
      if (this.config.enableAutoSymlinks) {
        await this.createSymlinksForClassification(content, result);
      }

      this.emit("project:classified", { path: content.path, name: content.name } as ScannedProject, result);
    } catch (error) {
      log.error({ error, contentPath: item.contentPath }, "Classification failed");
      this.emit("error", error instanceof Error ? error : new Error(String(error)), item.contentPath);
    }
  }

  /**
   * Creates symlinks based on classification result.
   */
  private async createSymlinksForClassification(
    content: ContentItem,
    result: ClassificationResult
  ): Promise<SymlinkResult[]> {
    const executor = getSymlinkExecutor();
    if (!executor) {
      log.warn("Symlink executor not available");
      return [];
    }

    const operations: SymlinkOperation[] = [];

    for (const assignment of result.termAssignments) {
      // Convert vocabulary ID to directory structure
      // e.g., "by-topic" + "ai/claude" -> "/organized/by-topic/ai/claude"
      const targetDir = path.join(
        this.config.symlinkBaseDir,
        assignment.vocabularyId,
        assignment.termValue
      );

      operations.push({
        source: content.path,
        targetDir,
        linkName: content.name,
        category: `${assignment.vocabularyId}/${assignment.termValue}`,
      });
    }

    if (operations.length === 0) {
      return [];
    }

    const { results } = await executor.executeTransaction(operations);

    // Emit event
    this.emit("project:linked", { path: content.path, name: content.name } as ScannedProject, results);

    return results;
  }

  /**
   * Queues a project for classification.
   */
  queueClassification(
    projectPath: string,
    priority: number = 1,
    attributes?: Record<string, string>
  ): void {
    this.classificationQueue.enqueue({
      contentPath: projectPath,
      contentName: path.basename(projectPath),
      priority,
      addedAt: new Date(),
      attributes,
    });

    this.emit("project:detected", projectPath);
  }

  /**
   * Classifies a single project immediately.
   */
  async classifyProject(
    projectPath: string,
    attributes?: Record<string, string>
  ): Promise<ClassificationResult> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    const content: ContentItem = {
      id: projectPath,
      name: path.basename(projectPath),
      path: projectPath,
      attributes: attributes || {},
    };

    const result = await this.engine.classify(content);

    // Create symlinks if enabled
    if (this.config.enableAutoSymlinks) {
      await this.createSymlinksForClassification(content, result);
    }

    return result;
  }

  /**
   * Scans and classifies a directory of projects.
   */
  async scanAndClassify(
    rootPath: string,
    options: { maxDepth?: number; dryRun?: boolean } = {}
  ): Promise<BatchClassificationResult> {
    if (!this.engine || !this.rsesConfig) {
      throw new Error("Engine not initialized");
    }

    log.info({ rootPath }, "Starting scan and classify");
    this.emit("batch:started", "scanAndClassify", 0);

    // Scan for projects
    const scanResult = await scanDirectory({
      rootPath,
      maxDepth: options.maxDepth,
      rsesConfig: this.rsesConfig,
    });

    this.emit("batch:started", "scanAndClassify", scanResult.projects.length);

    // Convert to content items
    const contents: ContentItem[] = scanResult.projects.map((p) => ({
      id: p.path,
      name: p.name,
      path: p.path,
      attributes: p.attributes || {},
      markers: p.markers,
    }));

    // Batch classify
    const result = await this.engine.classifyBatch(contents, {
      dryRun: options.dryRun,
    });

    // Create symlinks if enabled and not dry run
    if (this.config.enableAutoSymlinks && !options.dryRun) {
      for (const classification of result.results) {
        const content = contents.find((c) => c.id === classification.contentId);
        if (content) {
          await this.createSymlinksForClassification(content, classification);
        }
      }
    }

    this.emit("batch:completed", "scanAndClassify", result);

    return result;
  }

  /**
   * Updates the RSES configuration.
   */
  async updateConfig(newConfigContent: string, autoReclassify: boolean = false): Promise<ReclassificationPlan | null> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    // Parse new config
    const parseResult = RsesParser.parse(newConfigContent);
    if (!parseResult.valid || !parseResult.parsed) {
      throw new Error(`Invalid RSES config: ${parseResult.errors.map((e) => e.message).join(", ")}`);
    }

    const newRsesConfig = parseResult.parsed;

    // Create plan and optionally execute
    const plan = await this.engine.updateConfig(newRsesConfig, autoReclassify);

    if (plan && plan.affectedContent.length > 0) {
      this.emit("config:changed", plan);
      this.broadcastWSMessage({
        type: "config:changed",
        timestamp: Date.now(),
        data: {
          affectedContent: plan.affectedContent.length,
          affectedVocabularies: plan.affectedVocabularies,
          mode: plan.mode,
        },
      });
    }

    this.rsesConfig = newRsesConfig;
    this.config.rsesConfigContent = newConfigContent;

    return plan;
  }

  /**
   * Gets vocabulary statistics.
   */
  async getVocabularyStats(): Promise<Array<{
    id: string;
    name: string;
    termCount: number;
    contentCount: number;
  }>> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    const stats: Array<{ id: string; name: string; termCount: number; contentCount: number }> = [];

    for (const [id, vocab] of this.engine.getVocabularies()) {
      const terms = await this.engine.getTerms(id);
      const contentCount = terms.reduce((sum, t) => sum + t.contentCount, 0);

      stats.push({
        id,
        name: vocab.name,
        termCount: terms.length,
        contentCount,
      });
    }

    return stats;
  }

  /**
   * Gets all terms for a vocabulary with their content counts.
   */
  async getVocabularyTerms(vocabularyId: string): Promise<Array<{
    id: string;
    value: string;
    label: string;
    contentCount: number;
    parentId?: string;
    childCount: number;
  }>> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    const terms = await this.engine.getTerms(vocabularyId);

    return terms.map((t) => ({
      id: t.id,
      value: t.value,
      label: t.label,
      contentCount: t.contentCount,
      parentId: t.parentId,
      childCount: t.childIds.length,
    }));
  }

  /**
   * Broadcasts a WebSocket message.
   */
  private broadcastWSMessage<T extends { type: string }>(message: T): void {
    const wsServer = getWSServer();
    if (wsServer) {
      wsServer.broadcast(message as any, "taxonomy");
    }
  }

  /**
   * Gets the taxonomy engine.
   */
  getEngine(): TaxonomyEngine | null {
    return this.engine;
  }

  /**
   * Gets the current RSES config.
   */
  getRsesConfig(): RsesConfig | null {
    return this.rsesConfig;
  }

  /**
   * Gets the classification queue length.
   */
  getQueueLength(): number {
    return this.classificationQueue.length;
  }

  /**
   * Checks if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shuts down the integration.
   */
  async shutdown(): Promise<void> {
    if (this.engine) {
      await this.engine.shutdown();
    }
    this.classificationQueue.clear();
    this.initialized = false;
    log.info("Taxonomy integration shut down");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let integrationInstance: TaxonomyIntegration | null = null;

/**
 * Gets the singleton integration instance.
 */
export function getTaxonomyIntegration(): TaxonomyIntegration | null {
  return integrationInstance;
}

/**
 * Initializes the singleton integration.
 */
export async function initTaxonomyIntegration(
  config: TaxonomyIntegrationConfig
): Promise<TaxonomyIntegration> {
  if (integrationInstance) {
    await integrationInstance.shutdown();
  }

  integrationInstance = new TaxonomyIntegration(config);
  await integrationInstance.initialize();
  return integrationInstance;
}

/**
 * Shuts down the singleton integration.
 */
export async function shutdownTaxonomyIntegration(): Promise<void> {
  if (integrationInstance) {
    await integrationInstance.shutdown();
    integrationInstance = null;
  }
}
