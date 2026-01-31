/**
 * @file file-watcher-integration.ts
 * @description Integration layer connecting the intelligent watcher with the CMS file watcher.
 * @phase Phase 10 - AI-Enhanced Infrastructure
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * This module bridges the basic CMS file watcher with the intelligent watcher,
 * providing:
 * - Automatic event forwarding from CMS watcher to intelligent analyzer
 * - Combined health monitoring
 * - Unified metrics collection
 * - WebSocket event broadcasting
 * - Graceful fallback when intelligent features fail
 */

import { EventEmitter } from "events";
import {
  getCMSFileWatcher,
  CMSFileWatcherService,
  FileWatcherEventBus,
  type FileEvent,
  type BatchedFileEvents,
  type WatcherHealthStatus,
} from "./file-watcher-cms";
import {
  getIntelligentFileWatcher,
  IntelligentFileWatcherService,
  type IntelligentChange,
  type Prediction,
  type Anomaly,
  type HealingAction,
  type DegradationLevel,
} from "./file-watcher-intelligent";
import {
  recordFileEvent,
  recordBatch,
  recordSecurityAnomaly,
  updateHealthMetrics,
} from "./file-watcher-metrics";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("watcher-integration");

// =============================================================================
// INTEGRATED WATCHER SERVICE
// =============================================================================

/**
 * Configuration for the integrated watcher
 */
export interface IntegratedWatcherConfig {
  /** Enable intelligent analysis */
  enableIntelligentAnalysis: boolean;

  /** Enable predictive monitoring */
  enablePredictions: boolean;

  /** Enable self-healing */
  enableSelfHealing: boolean;

  /** Broadcast intelligent events via WebSocket */
  broadcastIntelligentEvents: boolean;

  /** Fallback behavior when intelligent watcher fails */
  fallbackBehavior: "continue" | "degrade" | "stop";

  /** Maximum processing time for intelligent analysis before timeout (ms) */
  intelligentTimeout: number;

  /** Events to skip intelligent analysis (by type) */
  skipIntelligentAnalysis: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: IntegratedWatcherConfig = {
  enableIntelligentAnalysis: true,
  enablePredictions: true,
  enableSelfHealing: true,
  broadcastIntelligentEvents: true,
  fallbackBehavior: "continue",
  intelligentTimeout: 5000,
  skipIntelligentAnalysis: ["unlinkDir", "addDir"], // Skip directory events
};

/**
 * Integrated file watcher combining CMS and intelligent capabilities
 */
export class IntegratedFileWatcherService {
  private config: IntegratedWatcherConfig;
  private cmsWatcher: CMSFileWatcherService | null = null;
  private intelligentWatcher: IntelligentFileWatcherService | null = null;
  private eventBus: EventEmitter;
  private isRunning = false;
  private intelligentFailed = false;
  private processedEvents = 0;
  private intelligentAnalysisCount = 0;
  private intelligentFailures = 0;

  constructor(config: Partial<IntegratedWatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(100);
  }

  /**
   * Initializes and starts the integrated watcher
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("Integrated watcher already running");
      return;
    }

    log.info("Starting integrated file watcher");

    try {
      // Initialize CMS watcher
      this.cmsWatcher = getCMSFileWatcher();
      await this.setupCMSWatcher();

      // Initialize intelligent watcher if enabled
      if (this.config.enableIntelligentAnalysis) {
        try {
          this.intelligentWatcher = getIntelligentFileWatcher();
          await this.setupIntelligentWatcher();
          await this.intelligentWatcher.start();
          log.info("Intelligent watcher initialized");
        } catch (err) {
          log.error({ err }, "Failed to initialize intelligent watcher");
          this.handleIntelligentFailure(err as Error);
        }
      }

      // Start CMS watcher
      await this.cmsWatcher.start();

      this.isRunning = true;
      log.info("Integrated file watcher started");
    } catch (err) {
      log.error({ err }, "Failed to start integrated watcher");
      throw err;
    }
  }

  /**
   * Stops the integrated watcher
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping integrated file watcher");

    try {
      // Stop intelligent watcher
      if (this.intelligentWatcher) {
        await this.intelligentWatcher.stop();
      }

      // Stop CMS watcher
      if (this.cmsWatcher) {
        await this.cmsWatcher.stop();
      }

      this.isRunning = false;
      log.info("Integrated file watcher stopped");
    } catch (err) {
      log.error({ err }, "Error stopping integrated watcher");
      throw err;
    }
  }

  /**
   * Sets up event handlers for CMS watcher
   */
  private async setupCMSWatcher(): Promise<void> {
    if (!this.cmsWatcher) return;

    const cmsEventBus = this.cmsWatcher.getEventBus();

    // Forward individual file events
    cmsEventBus.onFileEvent(async (event) => {
      this.processedEvents++;
      await this.handleFileEvent(event);
    });

    // Forward batch events
    cmsEventBus.onBatchEvent(async (batch) => {
      await this.handleBatchEvent(batch);
    });

    // Forward health updates
    cmsEventBus.onHealthUpdate((health) => {
      this.handleHealthUpdate(health);
    });

    // Forward security anomalies
    cmsEventBus.onSecurityAnomaly((anomaly) => {
      recordSecurityAnomaly(anomaly.type, anomaly.severity, anomaly.blocked);
      this.eventBus.emit("security", anomaly);
    });

    log.debug("CMS watcher event handlers set up");
  }

  /**
   * Sets up event handlers for intelligent watcher
   */
  private async setupIntelligentWatcher(): Promise<void> {
    if (!this.intelligentWatcher) return;

    const intelligentEventBus = this.intelligentWatcher.getEventBus();

    // Forward intelligent change events
    intelligentEventBus.on("intelligent_change", (change: IntelligentChange) => {
      this.intelligentAnalysisCount++;
      this.eventBus.emit("intelligent_change", change);

      if (this.config.broadcastIntelligentEvents) {
        this.broadcastIntelligentChange(change);
      }
    });

    // Forward predictions
    intelligentEventBus.on("prediction", (prediction: Prediction) => {
      this.eventBus.emit("prediction", prediction);

      if (this.config.broadcastIntelligentEvents) {
        this.broadcastPrediction(prediction);
      }
    });

    // Forward anomalies
    intelligentEventBus.on("anomaly", (anomaly: Anomaly) => {
      this.eventBus.emit("anomaly", anomaly);

      if (this.config.broadcastIntelligentEvents) {
        this.broadcastAnomaly(anomaly);
      }
    });

    // Handle errors
    intelligentEventBus.on("error", (err: Error) => {
      this.intelligentFailures++;
      this.handleIntelligentFailure(err);
    });

    log.debug("Intelligent watcher event handlers set up");
  }

  /**
   * Handles a file event from the CMS watcher
   */
  private async handleFileEvent(event: FileEvent): Promise<void> {
    const startTime = Date.now();

    // Record basic metrics
    recordFileEvent(event.type, event.directoryType, event.watchRoot, 0);

    // Forward to standard event bus
    this.eventBus.emit("file", event);

    // Skip intelligent analysis if disabled or for certain event types
    if (!this.shouldAnalyzeIntelligently(event)) {
      return;
    }

    // Perform intelligent analysis with timeout
    if (this.intelligentWatcher && !this.intelligentFailed) {
      try {
        const analysisPromise = this.intelligentWatcher.processEvent(event);
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error("Intelligent analysis timeout")), this.config.intelligentTimeout);
        });

        const result = await Promise.race([analysisPromise, timeoutPromise]);

        if (result) {
          // Update processing time metric
          recordFileEvent(event.type, event.directoryType, event.watchRoot, Date.now() - startTime);
        }
      } catch (err) {
        this.intelligentFailures++;
        log.warn({ err, eventId: event.id }, "Intelligent analysis failed for event");

        // Don't fail the whole event - continue with basic processing
        if (this.intelligentFailures > 10) {
          this.handleIntelligentFailure(err as Error);
        }
      }
    }
  }

  /**
   * Handles a batch event from the CMS watcher
   */
  private async handleBatchEvent(batch: BatchedFileEvents): Promise<void> {
    // Record batch metrics
    recordBatch(batch.directoryType, batch.events.length, batch.events.length - 1);

    // Forward to standard event bus
    this.eventBus.emit("batch", batch);

    // Process each event in batch for intelligent analysis
    if (this.intelligentWatcher && !this.intelligentFailed) {
      for (const event of batch.events) {
        if (this.shouldAnalyzeIntelligently(event)) {
          try {
            await this.intelligentWatcher.processEvent(event);
          } catch {
            // Silently continue on individual failures
          }
        }
      }
    }
  }

  /**
   * Handles health updates
   */
  private handleHealthUpdate(health: WatcherHealthStatus): void {
    updateHealthMetrics(health);
    this.eventBus.emit("health", health);

    // Check if self-healing should be triggered
    if (this.config.enableSelfHealing && health.status === "unhealthy") {
      this.triggerSelfHealing(health);
    }
  }

  /**
   * Determines if an event should be analyzed intelligently
   */
  private shouldAnalyzeIntelligently(event: FileEvent): boolean {
    if (!this.config.enableIntelligentAnalysis) {
      return false;
    }

    if (this.intelligentFailed && this.config.fallbackBehavior === "stop") {
      return false;
    }

    if (this.config.skipIntelligentAnalysis.includes(event.type)) {
      return false;
    }

    return true;
  }

  /**
   * Handles failures in the intelligent watcher
   */
  private handleIntelligentFailure(err: Error): void {
    log.error({ err }, "Intelligent watcher failure");

    switch (this.config.fallbackBehavior) {
      case "stop":
        this.intelligentFailed = true;
        log.warn("Intelligent analysis disabled due to failure");
        break;

      case "degrade":
        this.intelligentFailed = true;
        if (this.intelligentWatcher) {
          this.intelligentWatcher.setDegradationLevel("reduced");
        }
        log.warn("Intelligent watcher degraded");
        break;

      case "continue":
      default:
        // Reset failure flag after some time
        setTimeout(() => {
          this.intelligentFailed = false;
          this.intelligentFailures = 0;
          log.info("Intelligent analysis re-enabled");
        }, 60000);
        break;
    }

    this.eventBus.emit("intelligent_failure", err);
  }

  /**
   * Triggers self-healing based on health status
   */
  private triggerSelfHealing(health: WatcherHealthStatus): void {
    if (!this.intelligentWatcher) {
      return;
    }

    // The intelligent watcher's self-healing engine will handle this
    // Just emit the event for it to react
    this.intelligentWatcher.getEventBus().emit("health", health);
  }

  /**
   * Broadcasts intelligent change to WebSocket clients
   */
  private broadcastIntelligentChange(change: IntelligentChange): void {
    // Would integrate with WebSocket server
    const message = {
      type: "intelligent:change",
      timestamp: Date.now(),
      data: {
        change,
        summary: {
          changeType: change.changeType,
          riskLevel: change.impactAnalysis.riskLevel,
          blastRadius: change.impactAnalysis.blastRadius,
          actionsCount: change.suggestedActions.length,
          breakingChanges: change.semanticDiff.breakingChanges.length,
        },
      },
    };

    this.eventBus.emit("broadcast", message);
  }

  /**
   * Broadcasts prediction to WebSocket clients
   */
  private broadcastPrediction(prediction: Prediction): void {
    const message = {
      type: "intelligent:prediction",
      timestamp: Date.now(),
      data: {
        prediction,
        urgency: prediction.probability > 0.9 ? "critical" :
                 prediction.probability > 0.7 ? "high" :
                 prediction.probability > 0.5 ? "medium" : "low",
      },
    };

    this.eventBus.emit("broadcast", message);
  }

  /**
   * Broadcasts anomaly to WebSocket clients
   */
  private broadcastAnomaly(anomaly: Anomaly): void {
    const message = {
      type: "intelligent:anomaly",
      timestamp: Date.now(),
      data: {
        anomaly,
        relatedPredictions: [],
      },
    };

    this.eventBus.emit("broadcast", message);
  }

  /**
   * Gets the event bus for external subscriptions
   */
  getEventBus(): EventEmitter {
    return this.eventBus;
  }

  /**
   * Gets the CMS watcher instance
   */
  getCMSWatcher(): CMSFileWatcherService | null {
    return this.cmsWatcher;
  }

  /**
   * Gets the intelligent watcher instance
   */
  getIntelligentWatcher(): IntelligentFileWatcherService | null {
    return this.intelligentWatcher;
  }

  /**
   * Gets integration statistics
   */
  getStats(): IntegrationStats {
    return {
      isRunning: this.isRunning,
      processedEvents: this.processedEvents,
      intelligentAnalysisCount: this.intelligentAnalysisCount,
      intelligentFailures: this.intelligentFailures,
      intelligentEnabled: this.config.enableIntelligentAnalysis && !this.intelligentFailed,
      degradationLevel: this.intelligentWatcher?.getDegradationLevel() || "suspended",
      cmsHealth: this.cmsWatcher?.getHealthStatus().status || "unhealthy",
    };
  }
}

/**
 * Integration statistics
 */
export interface IntegrationStats {
  isRunning: boolean;
  processedEvents: number;
  intelligentAnalysisCount: number;
  intelligentFailures: number;
  intelligentEnabled: boolean;
  degradationLevel: DegradationLevel;
  cmsHealth: string;
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let integratedWatcherInstance: IntegratedFileWatcherService | null = null;

/**
 * Gets or creates the integrated file watcher
 */
export function getIntegratedFileWatcher(
  config?: Partial<IntegratedWatcherConfig>
): IntegratedFileWatcherService {
  if (!integratedWatcherInstance) {
    integratedWatcherInstance = new IntegratedFileWatcherService(config);
  }
  return integratedWatcherInstance;
}

/**
 * Resets the integrated file watcher instance
 */
export async function resetIntegratedFileWatcher(): Promise<void> {
  if (integratedWatcherInstance) {
    await integratedWatcherInstance.stop();
    integratedWatcherInstance = null;
  }
}

// =============================================================================
// WEBSOCKET INTEGRATION HELPER
// =============================================================================

/**
 * Sets up WebSocket integration for the integrated watcher
 */
export function setupIntegratedWatcherWebSocket(
  watcher: IntegratedFileWatcherService,
  broadcast: (message: unknown, channel?: string) => void
): void {
  const eventBus = watcher.getEventBus();

  // Forward file events
  eventBus.on("file", (event: FileEvent) => {
    broadcast(
      {
        type: "file:event",
        timestamp: Date.now(),
        data: event,
      },
      "files"
    );
  });

  // Forward batch events
  eventBus.on("batch", (batch: BatchedFileEvents) => {
    broadcast(
      {
        type: "file:batch",
        timestamp: Date.now(),
        data: batch,
      },
      "files"
    );
  });

  // Forward health updates
  eventBus.on("health", (health: WatcherHealthStatus) => {
    broadcast(
      {
        type: "watcher:health",
        timestamp: Date.now(),
        data: health,
      },
      "admin"
    );
  });

  // Forward intelligent events
  eventBus.on("intelligent_change", (change: IntelligentChange) => {
    broadcast(
      {
        type: "intelligent:change",
        timestamp: Date.now(),
        data: {
          change,
          summary: {
            changeType: change.changeType,
            riskLevel: change.impactAnalysis.riskLevel,
            blastRadius: change.impactAnalysis.blastRadius,
            actionsCount: change.suggestedActions.length,
            breakingChanges: change.semanticDiff.breakingChanges.length,
          },
        },
      },
      "intelligent"
    );
  });

  eventBus.on("prediction", (prediction: Prediction) => {
    broadcast(
      {
        type: "intelligent:prediction",
        timestamp: Date.now(),
        data: { prediction },
      },
      "intelligent"
    );
  });

  eventBus.on("anomaly", (anomaly: Anomaly) => {
    broadcast(
      {
        type: "intelligent:anomaly",
        timestamp: Date.now(),
        data: { anomaly },
      },
      "intelligent"
    );
  });

  eventBus.on("security", (anomaly) => {
    broadcast(
      {
        type: "watcher:security",
        timestamp: Date.now(),
        data: anomaly,
      },
      "security"
    );
  });

  log.info("WebSocket integration set up for integrated watcher");
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  IntegratedFileWatcherService as default,
  IntegratedWatcherConfig,
};
