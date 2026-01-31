/**
 * @file intelligent-watcher-admin.ts
 * @description Admin API routes for intelligent file watcher management.
 * @phase Phase 10 - AI-Enhanced Infrastructure
 * @author FW (File Watcher Specialist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * Provides REST API endpoints for:
 * - Intelligent change analysis
 * - Predictive monitoring
 * - Self-healing management
 * - Distributed cluster control
 * - Impact analysis and visualization
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getIntelligentFileWatcher,
  IntelligentFileWatcherService,
} from "../services/file-watcher-intelligent";
import type {
  IntelligentChangeListResponse,
  PredictionListResponse,
  AnomalyListResponse,
  HealingHistoryResponse,
  IntelligentSystemStatusResponse,
  ImpactAnalysisRequest,
  ImpactAnalysisResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  ClusterManagementResponse,
  NodeRegistrationRequest,
  NodeRegistrationResponse,
  IntelligentWatcherMetrics,
  DependencyGraph,
  ImpactVisualization,
  TimelineEvent,
} from "../services/file-watcher-intelligent-types";
import type { DegradationLevel, WatcherNode } from "../services/file-watcher-intelligent";
import { createModuleLogger } from "../logger";
import { randomUUID } from "crypto";

const log = createModuleLogger("intelligent-watcher-admin");
const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const impactAnalysisSchema = z.object({
  path: z.string().min(1),
  changeType: z.string().optional(),
  includeTransitive: z.boolean().default(true),
  maxDepth: z.number().int().min(1).max(10).default(5),
});

const contentAnalysisSchema = z.object({
  path: z.string().min(1),
  deep: z.boolean().default(false),
  extractDependencies: z.boolean().default(true),
  extractConfig: z.boolean().default(true),
});

const nodeRegistrationSchema = z.object({
  hostname: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  maxLoad: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
});

const degradationSchema = z.object({
  level: z.enum(["full", "reduced", "minimal", "suspended"]),
  reason: z.string().optional(),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Ensures intelligent watcher is available
 */
function requireIntelligentWatcher(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const watcher = getIntelligentFileWatcher();
    (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher = watcher;
    next();
  } catch (err) {
    res.status(503).json({
      error: "Intelligent watcher service not available",
      code: "INTELLIGENT_WATCHER_UNAVAILABLE",
    });
  }
}

// =============================================================================
// SYSTEM STATUS ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/status
 * Get comprehensive system status
 */
router.get("/status", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    const predictions = watcher.getPredictions();
    const anomalies = watcher.getAnomalies();
    const healingHistory = watcher.getHealingHistory();
    const clusterStatus = watcher.getClusterStatus();

    const response: IntelligentSystemStatusResponse = {
      degradationLevel: watcher.getDegradationLevel(),
      predictions: {
        total: predictions.length,
        urgent: predictions.filter((p) => p.probability > 0.7).length,
        types: [...new Set(predictions.map((p) => p.type))],
      },
      anomalies: {
        total: anomalies.length,
        critical: anomalies.filter((a) => a.severity === "critical").length,
        recent: anomalies.filter((a) => Date.now() - a.timestamp < 3600000).length,
      },
      healing: {
        pending: healingHistory.filter((h) => h.status === "pending").length,
        executing: healingHistory.filter((h) => h.status === "executing").length,
        recentFailures: healingHistory.filter(
          (h) => h.status === "failed" && Date.now() - h.startTime < 3600000
        ).length,
      },
      circuits: {
        total: 0, // Would need to access circuit breakers
        open: 0,
        halfOpen: 0,
      },
      cluster: {
        leader: clusterStatus.leader,
        nodes: clusterStatus.nodes.length,
        healthy: clusterStatus.nodes.filter((n) => n.status === "healthy").length,
        partitions: clusterStatus.partitions.length,
      },
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error getting intelligent status");
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * GET /api/admin/intelligent/metrics
 * Get detailed metrics
 */
router.get("/metrics", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    const changeHistory = watcher.getChangeHistory();
    const predictions = watcher.getPredictions();
    const anomalies = watcher.getAnomalies();
    const healingHistory = watcher.getHealingHistory();

    // Calculate metrics
    const successfulHealing = healingHistory.filter((h) => h.status === "completed");
    const failedHealing = healingHistory.filter((h) => h.status === "failed");

    const metrics: IntelligentWatcherMetrics = {
      changesAnalyzed: changeHistory.length,
      avgAnalysisTime: changeHistory.length > 0
        ? changeHistory.reduce((sum, c) => sum + c.processingDurationMs, 0) / changeHistory.length
        : 0,
      breakingChangesDetected: changeHistory.filter(
        (c) => c.semanticDiff.breakingChanges.length > 0
      ).length,

      predictionsGenerated: predictions.length,
      predictionsAccurate: 0, // Would need tracking
      predictionAccuracy: 0,

      anomaliesDetected: anomalies.length,
      anomaliesByType: anomalies.reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),

      healingActionsExecuted: healingHistory.length,
      healingSuccessRate: healingHistory.length > 0
        ? successfulHealing.length / healingHistory.length
        : 0,
      avgHealingTime: successfulHealing.length > 0
        ? successfulHealing.reduce(
            (sum, h) => sum + ((h.endTime || h.startTime) - h.startTime),
            0
          ) / successfulHealing.length
        : 0,

      clusterSize: watcher.getClusterStatus().nodes.length,
      partitionCount: watcher.getClusterStatus().partitions.length,
      leaderChanges: 0, // Would need tracking

      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: 0, // Would need process monitoring
      cacheHitRate: 0, // Would need tracking

      uptimeMs: 0, // Would need start time tracking
      startTime: Date.now(),
    };

    res.json(metrics);
  } catch (err) {
    log.error({ err }, "Error getting metrics");
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

// =============================================================================
// INTELLIGENT CHANGES ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/changes
 * List recent intelligent changes
 */
router.get("/changes", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const limit = parseInt(req.query.limit as string) || 100;
    const riskFilter = req.query.risk as string;
    const typeFilter = req.query.type as string;

    let changes = watcher.getChangeHistory(limit);

    // Apply filters
    if (riskFilter) {
      changes = changes.filter((c) => c.impactAnalysis.riskLevel === riskFilter);
    }
    if (typeFilter) {
      changes = changes.filter((c) => c.changeType === typeFilter);
    }

    // Calculate summaries
    const byType = changes.reduce((acc, c) => {
      acc[c.changeType] = (acc[c.changeType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byRisk = changes.reduce((acc, c) => {
      acc[c.impactAnalysis.riskLevel] = (acc[c.impactAnalysis.riskLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const response: IntelligentChangeListResponse = {
      changes,
      total: changes.length,
      byType,
      byRisk,
      timeRange: {
        start: changes.length > 0 ? changes[0].processedAt : Date.now(),
        end: changes.length > 0 ? changes[changes.length - 1].processedAt : Date.now(),
      },
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing changes");
    res.status(500).json({ error: "Failed to list changes" });
  }
});

/**
 * GET /api/admin/intelligent/changes/:id
 * Get specific change details
 */
router.get("/changes/:id", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const changes = watcher.getChangeHistory();
    const change = changes.find((c) => c.id === req.params.id);

    if (!change) {
      res.status(404).json({ error: "Change not found" });
      return;
    }

    res.json(change);
  } catch (err) {
    log.error({ err }, "Error getting change");
    res.status(500).json({ error: "Failed to get change" });
  }
});

// =============================================================================
// PREDICTIONS ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/predictions
 * List predictions
 */
router.get("/predictions", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const minProbability = parseFloat(req.query.minProbability as string) || 0;
    const typeFilter = req.query.type as string;

    let predictions = watcher.getPredictions();

    // Apply filters
    if (minProbability > 0) {
      predictions = predictions.filter((p) => p.probability >= minProbability);
    }
    if (typeFilter) {
      predictions = predictions.filter((p) => p.type === typeFilter);
    }

    const byType = predictions.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const response: PredictionListResponse = {
      predictions,
      total: predictions.length,
      byType,
      avgProbability: predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length
        : 0,
      urgentCount: predictions.filter((p) => p.probability > 0.7).length,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing predictions");
    res.status(500).json({ error: "Failed to list predictions" });
  }
});

// =============================================================================
// ANOMALIES ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/anomalies
 * List anomalies
 */
router.get("/anomalies", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const severityFilter = req.query.severity as string;
    const since = parseInt(req.query.since as string) || 0;

    let anomalies = watcher.getAnomalies();

    // Apply filters
    if (severityFilter) {
      anomalies = anomalies.filter((a) => a.severity === severityFilter);
    }
    if (since > 0) {
      anomalies = anomalies.filter((a) => a.timestamp >= since);
    }

    const bySeverity = anomalies.reduce((acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = anomalies.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const response: AnomalyListResponse = {
      anomalies,
      total: anomalies.length,
      bySeverity,
      byType,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing anomalies");
    res.status(500).json({ error: "Failed to list anomalies" });
  }
});

// =============================================================================
// HEALING ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/healing
 * List healing history
 */
router.get("/healing", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const statusFilter = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 100;

    let actions = watcher.getHealingHistory();

    // Apply filters
    if (statusFilter) {
      actions = actions.filter((a) => a.status === statusFilter);
    }

    actions = actions.slice(-limit);

    const successful = actions.filter((a) => a.status === "completed");
    const failed = actions.filter((a) => a.status === "failed");
    const pending = actions.filter((a) => a.status === "pending" || a.status === "executing");

    const response: HealingHistoryResponse = {
      actions,
      total: actions.length,
      successful: successful.length,
      failed: failed.length,
      pending: pending.length,
      avgDuration: successful.length > 0
        ? successful.reduce(
            (sum, a) => sum + ((a.endTime || a.startTime) - a.startTime),
            0
          ) / successful.length
        : 0,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error listing healing history");
    res.status(500).json({ error: "Failed to list healing history" });
  }
});

// =============================================================================
// DEGRADATION ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/degradation
 * Get current degradation level
 */
router.get("/degradation", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    res.json({
      level: watcher.getDegradationLevel(),
      features: getDegradationFeatures(watcher.getDegradationLevel()),
    });
  } catch (err) {
    log.error({ err }, "Error getting degradation level");
    res.status(500).json({ error: "Failed to get degradation level" });
  }
});

/**
 * PUT /api/admin/intelligent/degradation
 * Set degradation level
 */
router.put("/degradation", requireIntelligentWatcher, async (req, res) => {
  try {
    const validation = degradationSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const { level, reason } = validation.data;
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    const previousLevel = watcher.getDegradationLevel();
    watcher.setDegradationLevel(level);

    log.info({ from: previousLevel, to: level, reason }, "Degradation level changed via API");

    res.json({
      previous: previousLevel,
      current: level,
      features: getDegradationFeatures(level),
    });
  } catch (err) {
    log.error({ err }, "Error setting degradation level");
    res.status(500).json({ error: "Failed to set degradation level" });
  }
});

/**
 * Gets available features for a degradation level
 */
function getDegradationFeatures(level: DegradationLevel): string[] {
  const features: Record<DegradationLevel, string[]> = {
    full: [
      "Predictive monitoring",
      "Semantic analysis",
      "Impact analysis",
      "Self-healing",
      "Distributed coordination",
      "Content analysis",
    ],
    reduced: [
      "Basic monitoring",
      "Self-healing",
      "Content analysis",
    ],
    minimal: [
      "Basic file watching",
      "Essential self-healing",
    ],
    suspended: [],
  };
  return features[level];
}

// =============================================================================
// CLUSTER ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/cluster
 * Get cluster status
 */
router.get("/cluster", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const status = watcher.getClusterStatus();

    const response: ClusterManagementResponse = {
      leader: status.leader,
      term: status.term,
      nodes: status.nodes,
      partitions: status.partitions,
      recentRebalances: 0, // Would need tracking
      lastRebalance: null,
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error getting cluster status");
    res.status(500).json({ error: "Failed to get cluster status" });
  }
});

/**
 * POST /api/admin/intelligent/cluster/nodes
 * Register a new node
 */
router.post("/cluster/nodes", requireIntelligentWatcher, async (req, res) => {
  try {
    const validation = nodeRegistrationSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const { hostname, port, maxLoad, tags } = validation.data;
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    const nodeId = randomUUID();
    const node: WatcherNode = {
      id: nodeId,
      hostname,
      port,
      role: "follower",
      lastHeartbeat: Date.now(),
      load: 0,
      assignedPaths: [],
      status: "healthy",
      version: "1.0.0",
      startedAt: Date.now(),
    };

    watcher.registerNode(node);

    const status = watcher.getClusterStatus();

    const response: NodeRegistrationResponse = {
      nodeId,
      role: node.role,
      assignedPartitions: status.partitions
        .filter((p) => p.assignedNode === nodeId)
        .map((p) => p.id),
      leader: status.leader,
    };

    log.info({ nodeId, hostname, port }, "Node registered via API");

    res.status(201).json(response);
  } catch (err) {
    log.error({ err }, "Error registering node");
    res.status(500).json({ error: "Failed to register node" });
  }
});

/**
 * DELETE /api/admin/intelligent/cluster/nodes/:nodeId
 * Remove a node
 */
router.delete("/cluster/nodes/:nodeId", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const { nodeId } = req.params;

    watcher.removeNode(nodeId);

    log.info({ nodeId }, "Node removed via API");

    res.json({
      message: "Node removed",
      nodeId,
    });
  } catch (err) {
    log.error({ err }, "Error removing node");
    res.status(500).json({ error: "Failed to remove node" });
  }
});

// =============================================================================
// ANALYSIS ROUTES
// =============================================================================

/**
 * POST /api/admin/intelligent/analyze/impact
 * Perform impact analysis
 */
router.post("/analyze/impact", requireIntelligentWatcher, async (req, res) => {
  try {
    const validation = impactAnalysisSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const _data: ImpactAnalysisRequest = validation.data;

    // For now, return a mock response
    // Full implementation would perform actual analysis
    const response: ImpactAnalysisResponse = {
      path: _data.path,
      semanticDiff: {
        linesAdded: 0,
        linesRemoved: 0,
        linesModified: 0,
        functionsAdded: [],
        functionsRemoved: [],
        functionsModified: [],
        dependenciesAdded: [],
        dependenciesRemoved: [],
        dependenciesModified: [],
        configKeysAdded: [],
        configKeysRemoved: [],
        configKeysModified: [],
        breakingChanges: [],
        confidence: 0,
      },
      impact: {
        directlyAffected: [],
        transitivelyAffected: [],
        riskLevel: "low",
        riskFactors: [],
        recommendedTests: [],
        deploymentRecommendations: [],
        blastRadius: 0,
        confidence: 0,
      },
      visualGraph: {
        nodes: [{ id: _data.path, type: "file", risk: 0 }],
        edges: [],
      },
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error performing impact analysis");
    res.status(500).json({ error: "Failed to perform impact analysis" });
  }
});

/**
 * POST /api/admin/intelligent/analyze/content
 * Perform content analysis
 */
router.post("/analyze/content", requireIntelligentWatcher, async (req, res) => {
  try {
    const validation = contentAnalysisSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: validation.error.errors,
      });
      return;
    }

    const _data: ContentAnalysisRequest = validation.data;

    // For now, return a mock response
    const response: ContentAnalysisResponse = {
      path: _data.path,
      analysis: {
        detectedType: "unknown",
        mimeType: "application/octet-stream",
        encoding: "utf-8",
        structure: {
          type: "unknown",
          sections: [],
          complexity: 0,
          lineCount: 0,
          characterCount: 0,
        },
        dependencies: [],
        configValues: [],
        quality: {
          syntaxValid: true,
          wellFormed: true,
          hasDocumentation: false,
          complexityScore: 0,
          maintainabilityIndex: 100,
        },
        confidence: 0,
      },
      relatedFiles: [],
      suggestions: [],
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, "Error performing content analysis");
    res.status(500).json({ error: "Failed to perform content analysis" });
  }
});

// =============================================================================
// VISUALIZATION ROUTES
// =============================================================================

/**
 * GET /api/admin/intelligent/visualize/dependencies
 * Get dependency graph for visualization
 */
router.get("/visualize/dependencies", requireIntelligentWatcher, async (req, res) => {
  try {
    const _watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;

    // Would generate actual dependency graph
    const graph: DependencyGraph = {
      nodes: [],
      edges: [],
      clusters: [],
    };

    res.json(graph);
  } catch (err) {
    log.error({ err }, "Error getting dependency graph");
    res.status(500).json({ error: "Failed to get dependency graph" });
  }
});

/**
 * GET /api/admin/intelligent/visualize/impact/:changeId
 * Get impact visualization for a change
 */
router.get("/visualize/impact/:changeId", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const changes = watcher.getChangeHistory();
    const change = changes.find((c) => c.id === req.params.changeId);

    if (!change) {
      res.status(404).json({ error: "Change not found" });
      return;
    }

    const visualization: ImpactVisualization = {
      centerNode: change.path,
      affectedNodes: [
        ...change.impactAnalysis.directlyAffected.map((a) => ({
          id: a.path,
          distance: 1,
          impact: "direct" as const,
          risk: a.confidence,
        })),
        ...change.impactAnalysis.transitivelyAffected.map((a, i) => ({
          id: a.path,
          distance: i + 2,
          impact: "transitive" as const,
          risk: a.confidence,
        })),
      ],
      connections: [],
      riskGradient: [],
    };

    res.json(visualization);
  } catch (err) {
    log.error({ err }, "Error getting impact visualization");
    res.status(500).json({ error: "Failed to get impact visualization" });
  }
});

/**
 * GET /api/admin/intelligent/visualize/timeline
 * Get timeline events for visualization
 */
router.get("/visualize/timeline", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    const limit = parseInt(req.query.limit as string) || 50;

    const changes = watcher.getChangeHistory(limit);
    const predictions = watcher.getPredictions();
    const anomalies = watcher.getAnomalies();
    const healing = watcher.getHealingHistory();

    const events: TimelineEvent[] = [
      ...changes.map((c) => ({
        id: c.id,
        timestamp: c.processedAt,
        type: "change" as const,
        title: `File changed: ${c.path.split("/").pop()}`,
        description: `${c.changeType} - Risk: ${c.impactAnalysis.riskLevel}`,
        severity: riskToSeverity(c.impactAnalysis.riskLevel),
        metadata: { changeType: c.changeType, blastRadius: c.impactAnalysis.blastRadius },
      })),
      ...predictions.map((p) => ({
        id: p.id,
        timestamp: p.timestamp,
        type: "prediction" as const,
        title: `Prediction: ${p.type}`,
        description: p.description,
        severity: probabilityToSeverity(p.probability),
        metadata: { probability: p.probability, timeToEvent: p.timeToEvent },
      })),
      ...anomalies.map((a) => ({
        id: a.id,
        timestamp: a.timestamp,
        type: "anomaly" as const,
        title: `Anomaly: ${a.type}`,
        description: a.description,
        severity: a.severity === "critical" ? "critical" as const : a.severity === "high" ? "error" as const : "warning" as const,
        metadata: { deviation: a.deviation },
      })),
      ...healing.map((h) => ({
        id: h.id,
        timestamp: h.startTime,
        type: "healing" as const,
        title: `Healing: ${h.type}`,
        description: h.description,
        severity: h.status === "failed" ? "error" as const : "info" as const,
        metadata: { status: h.status, duration: h.endTime ? h.endTime - h.startTime : undefined },
      })),
    ];

    // Sort by timestamp
    events.sort((a, b) => b.timestamp - a.timestamp);

    res.json(events.slice(0, limit));
  } catch (err) {
    log.error({ err }, "Error getting timeline");
    res.status(500).json({ error: "Failed to get timeline" });
  }
});

/**
 * Converts risk level to severity
 */
function riskToSeverity(risk: string): "info" | "warning" | "error" | "critical" {
  switch (risk) {
    case "critical":
      return "critical";
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "info";
  }
}

/**
 * Converts probability to severity
 */
function probabilityToSeverity(probability: number): "info" | "warning" | "error" | "critical" {
  if (probability >= 0.9) return "critical";
  if (probability >= 0.7) return "error";
  if (probability >= 0.5) return "warning";
  return "info";
}

// =============================================================================
// SERVICE CONTROL
// =============================================================================

/**
 * POST /api/admin/intelligent/start
 * Start the intelligent watcher
 */
router.post("/start", async (req, res) => {
  try {
    const watcher = getIntelligentFileWatcher();
    await watcher.start();

    log.info("Intelligent watcher started via API");

    res.json({
      message: "Intelligent watcher started",
      status: "running",
    });
  } catch (err) {
    log.error({ err }, "Error starting intelligent watcher");
    res.status(500).json({ error: "Failed to start intelligent watcher" });
  }
});

/**
 * POST /api/admin/intelligent/stop
 * Stop the intelligent watcher
 */
router.post("/stop", requireIntelligentWatcher, async (req, res) => {
  try {
    const watcher = (req as Request & { intelligentWatcher: IntelligentFileWatcherService }).intelligentWatcher;
    await watcher.stop();

    log.info("Intelligent watcher stopped via API");

    res.json({
      message: "Intelligent watcher stopped",
      status: "stopped",
    });
  } catch (err) {
    log.error({ err }, "Error stopping intelligent watcher");
    res.status(500).json({ error: "Failed to stop intelligent watcher" });
  }
});

export default router;
