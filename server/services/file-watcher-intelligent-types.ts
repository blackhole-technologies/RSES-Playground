/**
 * @file file-watcher-intelligent-types.ts
 * @description Type definitions for intelligent file watching system integration.
 * @phase Phase 10 - AI-Enhanced Infrastructure
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * This file provides WebSocket message types and API interfaces for
 * the intelligent file watcher system.
 */

import type {
  IntelligentChange,
  Prediction,
  Anomaly,
  HealingAction,
  DegradationLevel,
  WatcherNode,
  Partition,
  SemanticDiff,
  ImpactReport,
  BreakingChange,
  SuggestedAction,
  ContentAnalysis,
} from "./file-watcher-intelligent";

// =============================================================================
// WEBSOCKET MESSAGE TYPES - SERVER TO CLIENT
// =============================================================================

/**
 * Intelligent change notification
 */
export interface WSIntelligentChangeMessage {
  type: "intelligent:change";
  timestamp: number;
  data: {
    change: IntelligentChange;
    summary: {
      changeType: string;
      riskLevel: string;
      blastRadius: number;
      actionsCount: number;
      breakingChanges: number;
    };
  };
}

/**
 * Prediction notification
 */
export interface WSPredictionMessage {
  type: "intelligent:prediction";
  timestamp: number;
  data: {
    prediction: Prediction;
    urgency: "low" | "medium" | "high" | "critical";
  };
}

/**
 * Anomaly detection notification
 */
export interface WSAnomalyMessage {
  type: "intelligent:anomaly";
  timestamp: number;
  data: {
    anomaly: Anomaly;
    relatedPredictions: string[]; // Prediction IDs
  };
}

/**
 * Healing action notification
 */
export interface WSHealingActionMessage {
  type: "intelligent:healing";
  timestamp: number;
  data: {
    action: HealingAction;
    systemStatus: {
      degradationLevel: DegradationLevel;
      activeBreakers: number;
      pendingActions: number;
    };
  };
}

/**
 * Degradation level change notification
 */
export interface WSDegradationChangeMessage {
  type: "intelligent:degradation";
  timestamp: number;
  data: {
    previous: DegradationLevel;
    current: DegradationLevel;
    reason: string;
    affectedFeatures: string[];
  };
}

/**
 * Cluster status update
 */
export interface WSClusterStatusMessage {
  type: "intelligent:cluster";
  timestamp: number;
  data: {
    leader: string | null;
    term: number;
    healthyNodes: number;
    totalNodes: number;
    partitions: number;
    rebalancing: boolean;
  };
}

/**
 * Circuit breaker state change
 */
export interface WSCircuitBreakerMessage {
  type: "intelligent:circuit";
  timestamp: number;
  data: {
    path: string;
    previousState: string;
    currentState: string;
    failureCount: number;
    lastFailure: number | null;
  };
}

/**
 * Breaking change alert
 */
export interface WSBreakingChangeAlert {
  type: "intelligent:breaking";
  timestamp: number;
  data: {
    change: IntelligentChange;
    breakingChanges: BreakingChange[];
    affectedDependents: number;
    recommendedActions: SuggestedAction[];
  };
}

/**
 * Content analysis result
 */
export interface WSContentAnalysisMessage {
  type: "intelligent:analysis";
  timestamp: number;
  data: {
    path: string;
    analysis: ContentAnalysis;
    dependencies: number;
    configValues: number;
  };
}

/**
 * Impact report message
 */
export interface WSImpactReportMessage {
  type: "intelligent:impact";
  timestamp: number;
  data: {
    changeId: string;
    path: string;
    impact: ImpactReport;
    visualData: {
      affectedPaths: string[];
      riskHeatmap: Record<string, number>;
    };
  };
}

/**
 * Union of all intelligent watcher server messages
 */
export type WSIntelligentWatcherServerMessage =
  | WSIntelligentChangeMessage
  | WSPredictionMessage
  | WSAnomalyMessage
  | WSHealingActionMessage
  | WSDegradationChangeMessage
  | WSClusterStatusMessage
  | WSCircuitBreakerMessage
  | WSBreakingChangeAlert
  | WSContentAnalysisMessage
  | WSImpactReportMessage;

// =============================================================================
// WEBSOCKET MESSAGE TYPES - CLIENT TO SERVER
// =============================================================================

/**
 * Request intelligent analysis for a path
 */
export interface WSAnalyzePathRequest {
  type: "intelligent:analyze";
  data: {
    path: string;
    deep?: boolean;
    includeDependencies?: boolean;
  };
}

/**
 * Request impact analysis
 */
export interface WSImpactAnalysisRequest {
  type: "intelligent:impact:request";
  data: {
    path: string;
    changeType?: string;
  };
}

/**
 * Request predictions
 */
export interface WSPredictionsRequest {
  type: "intelligent:predictions:request";
  data: {
    types?: string[];
    minProbability?: number;
  };
}

/**
 * Request anomalies
 */
export interface WSAnomaliesRequest {
  type: "intelligent:anomalies:request";
  data: {
    severity?: string[];
    since?: number;
  };
}

/**
 * Request healing history
 */
export interface WSHealingHistoryRequest {
  type: "intelligent:healing:request";
  data: {
    status?: string[];
    since?: number;
    limit?: number;
  };
}

/**
 * Set degradation level
 */
export interface WSSetDegradationRequest {
  type: "intelligent:degradation:set";
  data: {
    level: DegradationLevel;
    reason?: string;
  };
}

/**
 * Request cluster status
 */
export interface WSClusterStatusRequest {
  type: "intelligent:cluster:request";
}

/**
 * Register node in cluster
 */
export interface WSRegisterNodeRequest {
  type: "intelligent:node:register";
  data: {
    node: Omit<WatcherNode, "lastHeartbeat" | "startedAt">;
  };
}

/**
 * Remove node from cluster
 */
export interface WSRemoveNodeRequest {
  type: "intelligent:node:remove";
  data: {
    nodeId: string;
  };
}

/**
 * Subscribe to intelligent channels
 */
export interface WSIntelligentSubscribe {
  type: "intelligent:subscribe";
  channels: IntelligentChannel[];
}

/**
 * Unsubscribe from intelligent channels
 */
export interface WSIntelligentUnsubscribe {
  type: "intelligent:unsubscribe";
  channels: IntelligentChannel[];
}

/**
 * Union of all intelligent watcher client messages
 */
export type WSIntelligentWatcherClientMessage =
  | WSAnalyzePathRequest
  | WSImpactAnalysisRequest
  | WSPredictionsRequest
  | WSAnomaliesRequest
  | WSHealingHistoryRequest
  | WSSetDegradationRequest
  | WSClusterStatusRequest
  | WSRegisterNodeRequest
  | WSRemoveNodeRequest
  | WSIntelligentSubscribe
  | WSIntelligentUnsubscribe;

// =============================================================================
// CHANNELS
// =============================================================================

/**
 * Available intelligent watcher subscription channels
 */
export type IntelligentChannel =
  | "changes"      // All intelligent change events
  | "predictions"  // Prediction events
  | "anomalies"    // Anomaly detection events
  | "healing"      // Healing action events
  | "cluster"      // Cluster status updates
  | "circuits"     // Circuit breaker events
  | "breaking"     // Breaking change alerts
  | "analysis"     // Content analysis results
  | "impact";      // Impact reports

/**
 * Default channels by alert level
 */
export const DEFAULT_CHANNELS_BY_ALERT_LEVEL: Record<string, IntelligentChannel[]> = {
  all: ["changes", "predictions", "anomalies", "healing", "cluster", "circuits", "breaking", "analysis", "impact"],
  critical: ["breaking", "anomalies", "healing", "circuits"],
  standard: ["changes", "predictions", "breaking"],
  minimal: ["breaking"],
};

// =============================================================================
// REST API TYPES
// =============================================================================

/**
 * Intelligent change list response
 */
export interface IntelligentChangeListResponse {
  changes: IntelligentChange[];
  total: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  timeRange: {
    start: number;
    end: number;
  };
}

/**
 * Prediction list response
 */
export interface PredictionListResponse {
  predictions: Prediction[];
  total: number;
  byType: Record<string, number>;
  avgProbability: number;
  urgentCount: number;
}

/**
 * Anomaly list response
 */
export interface AnomalyListResponse {
  anomalies: Anomaly[];
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

/**
 * Healing history response
 */
export interface HealingHistoryResponse {
  actions: HealingAction[];
  total: number;
  successful: number;
  failed: number;
  pending: number;
  avgDuration: number;
}

/**
 * System status response
 */
export interface IntelligentSystemStatusResponse {
  degradationLevel: DegradationLevel;
  predictions: {
    total: number;
    urgent: number;
    types: string[];
  };
  anomalies: {
    total: number;
    critical: number;
    recent: number;
  };
  healing: {
    pending: number;
    executing: number;
    recentFailures: number;
  };
  circuits: {
    total: number;
    open: number;
    halfOpen: number;
  };
  cluster: {
    leader: string | null;
    nodes: number;
    healthy: number;
    partitions: number;
  };
}

/**
 * Impact analysis request
 */
export interface ImpactAnalysisRequest {
  path: string;
  changeType?: string;
  includeTransitive?: boolean;
  maxDepth?: number;
}

/**
 * Impact analysis response
 */
export interface ImpactAnalysisResponse {
  path: string;
  semanticDiff: SemanticDiff;
  impact: ImpactReport;
  visualGraph: {
    nodes: Array<{ id: string; type: string; risk: number }>;
    edges: Array<{ from: string; to: string; type: string }>;
  };
}

/**
 * Content analysis request
 */
export interface ContentAnalysisRequest {
  path: string;
  deep?: boolean;
  extractDependencies?: boolean;
  extractConfig?: boolean;
}

/**
 * Content analysis response
 */
export interface ContentAnalysisResponse {
  path: string;
  analysis: ContentAnalysis;
  relatedFiles: string[];
  suggestions: string[];
}

/**
 * Cluster management response
 */
export interface ClusterManagementResponse {
  leader: string | null;
  term: number;
  nodes: WatcherNode[];
  partitions: Partition[];
  recentRebalances: number;
  lastRebalance: number | null;
}

/**
 * Node registration request
 */
export interface NodeRegistrationRequest {
  hostname: string;
  port: number;
  maxLoad?: number;
  tags?: string[];
}

/**
 * Node registration response
 */
export interface NodeRegistrationResponse {
  nodeId: string;
  role: string;
  assignedPartitions: number[];
  leader: string | null;
}

// =============================================================================
// EVENT HANDLER TYPES
// =============================================================================

/**
 * Intelligent change handler
 */
export type IntelligentChangeHandler = (change: IntelligentChange) => Promise<void>;

/**
 * Prediction handler
 */
export type PredictionHandler = (prediction: Prediction) => Promise<void>;

/**
 * Anomaly handler
 */
export type AnomalyHandler = (anomaly: Anomaly) => Promise<void>;

/**
 * Healing action handler
 */
export type HealingActionHandler = (action: HealingAction) => Promise<void>;

/**
 * Breaking change handler
 */
export type BreakingChangeHandler = (
  change: IntelligentChange,
  breakingChanges: BreakingChange[]
) => Promise<void>;

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Intelligent watcher configuration
 */
export interface IntelligentWatcherConfig {
  /** Enable predictive monitoring */
  enablePrediction: boolean;

  /** Enable self-healing */
  enableSelfHealing: boolean;

  /** Enable distributed coordination */
  enableDistributed: boolean;

  /** Enable content analysis */
  enableContentAnalysis: boolean;

  /** Prediction settings */
  prediction: {
    checkInterval: number;
    minConfidence: number;
    alertThreshold: number;
  };

  /** Self-healing settings */
  selfHealing: {
    maxRetries: number;
    cooldownPeriod: number;
    degradationThreshold: number;
  };

  /** Distributed settings */
  distributed: {
    heartbeatInterval: number;
    electionTimeout: number;
    maxPartitions: number;
  };

  /** Analysis settings */
  analysis: {
    maxFileSize: number;
    cacheSize: number;
    dependencyDepth: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_INTELLIGENT_CONFIG: IntelligentWatcherConfig = {
  enablePrediction: true,
  enableSelfHealing: true,
  enableDistributed: false, // Single node by default
  enableContentAnalysis: true,
  prediction: {
    checkInterval: 30000,
    minConfidence: 0.5,
    alertThreshold: 0.7,
  },
  selfHealing: {
    maxRetries: 3,
    cooldownPeriod: 60000,
    degradationThreshold: 0.5,
  },
  distributed: {
    heartbeatInterval: 1000,
    electionTimeout: 5000,
    maxPartitions: 1000,
  },
  analysis: {
    maxFileSize: 1024 * 1024, // 1MB
    cacheSize: 1000,
    dependencyDepth: 5,
  },
};

// =============================================================================
// METRICS TYPES
// =============================================================================

/**
 * Intelligent watcher metrics
 */
export interface IntelligentWatcherMetrics {
  /** Change analysis metrics */
  changesAnalyzed: number;
  avgAnalysisTime: number;
  breakingChangesDetected: number;

  /** Prediction metrics */
  predictionsGenerated: number;
  predictionsAccurate: number;
  predictionAccuracy: number;

  /** Anomaly metrics */
  anomaliesDetected: number;
  anomaliesByType: Record<string, number>;

  /** Healing metrics */
  healingActionsExecuted: number;
  healingSuccessRate: number;
  avgHealingTime: number;

  /** Cluster metrics */
  clusterSize: number;
  partitionCount: number;
  leaderChanges: number;

  /** Resource metrics */
  memoryUsage: number;
  cpuUsage: number;
  cacheHitRate: number;

  /** Uptime */
  uptimeMs: number;
  startTime: number;
}

// =============================================================================
// VISUALIZATION TYPES
// =============================================================================

/**
 * Dependency graph for visualization
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  clusters: DependencyCluster[];
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  id: string;
  path: string;
  type: string;
  size: number;
  risk: number;
  lastModified: number;
}

/**
 * Dependency graph edge
 */
export interface DependencyEdge {
  source: string;
  target: string;
  type: "import" | "require" | "reference";
  weight: number;
}

/**
 * Dependency cluster
 */
export interface DependencyCluster {
  id: string;
  name: string;
  nodes: string[];
  type: string;
}

/**
 * Impact visualization
 */
export interface ImpactVisualization {
  centerNode: string;
  affectedNodes: Array<{
    id: string;
    distance: number;
    impact: "direct" | "transitive";
    risk: number;
  }>;
  connections: Array<{
    from: string;
    to: string;
    strength: number;
  }>;
  riskGradient: Array<{
    nodeId: string;
    color: string;
    intensity: number;
  }>;
}

/**
 * Timeline event for visualization
 */
export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: "change" | "prediction" | "anomaly" | "healing" | "cluster";
  title: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
  metadata: Record<string, unknown>;
}

// =============================================================================
// EXPORT AGGREGATION
// =============================================================================

export type {
  IntelligentChange,
  Prediction,
  Anomaly,
  HealingAction,
  DegradationLevel,
  WatcherNode,
  Partition,
  SemanticDiff,
  ImpactReport,
  BreakingChange,
  SuggestedAction,
  ContentAnalysis,
} from "./file-watcher-intelligent";
