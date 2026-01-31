/**
 * @file aiops.ts
 * @description AI Operations (AIOps) layer for intelligent infrastructure.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Predictive scaling based on ML models
 * - Anomaly detection in metrics
 * - Auto-remediation workflows
 * - Capacity planning with forecasting
 * - Root cause analysis
 * - Intelligent alerting
 *
 * Inspired by:
 * - DataDog Watchdog
 * - New Relic AI
 * - AWS DevOps Guru
 * - Moogsoft AIOps
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  AnomalyDetection,
  ScalingRecommendation,
  RemediationAction,
  CapacityForecast,
  MetricPoint,
} from "./types";
import { getMetricsCollector, getAlertManager, AlertSeverity } from "./observability";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("aiops");

// ==================== Anomaly Detection ====================

/**
 * Statistical model for anomaly detection.
 */
interface StatisticalModel {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  samples: number;
  lastUpdated: Date;
}

/**
 * Anomaly detector using statistical methods.
 */
export class AnomalyDetector {
  private models: Map<string, StatisticalModel> = new Map();
  private history: Map<string, number[]> = new Map();
  private windowSize: number = 100;
  private zScoreThreshold: number = 3;
  private emitter: EventEmitter = new EventEmitter();

  constructor(config?: { windowSize?: number; zScoreThreshold?: number }) {
    if (config?.windowSize) this.windowSize = config.windowSize;
    if (config?.zScoreThreshold) this.zScoreThreshold = config.zScoreThreshold;
  }

  /**
   * Ingests a new metric value and checks for anomalies.
   */
  ingest(metric: string, value: number): AnomalyDetection | null {
    // Update history
    let history = this.history.get(metric);
    if (!history) {
      history = [];
      this.history.set(metric, history);
    }
    history.push(value);

    // Keep window size
    if (history.length > this.windowSize) {
      history.shift();
    }

    // Need minimum samples for detection
    if (history.length < 10) {
      return null;
    }

    // Update model
    const model = this.updateModel(metric, history);

    // Check for anomaly
    const zScore = Math.abs((value - model.mean) / (model.stdDev || 1));

    if (zScore > this.zScoreThreshold) {
      const anomaly = this.createAnomaly(metric, value, model, zScore);
      this.emitter.emit("anomaly", anomaly);

      // Trigger alert if critical
      if (anomaly.severity === "critical") {
        getAlertManager().registerRule({
          name: `anomaly_${metric}`,
          description: `Anomaly detected in ${metric}: ${anomaly.type}`,
          severity: AlertSeverity.WARNING,
          condition: () => true,
        });
      }

      return anomaly;
    }

    return null;
  }

  /**
   * Updates the statistical model.
   */
  private updateModel(metric: string, history: number[]): StatisticalModel {
    const n = history.length;
    const mean = history.reduce((a, b) => a + b, 0) / n;
    const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const model: StatisticalModel = {
      mean,
      stdDev,
      min: Math.min(...history),
      max: Math.max(...history),
      samples: n,
      lastUpdated: new Date(),
    };

    this.models.set(metric, model);
    return model;
  }

  /**
   * Creates an anomaly detection result.
   */
  private createAnomaly(
    metric: string,
    value: number,
    model: StatisticalModel,
    zScore: number
  ): AnomalyDetection {
    // Determine anomaly type
    let type: AnomalyDetection["type"];
    if (value > model.mean + model.stdDev * 2) {
      type = "spike";
    } else if (value < model.mean - model.stdDev * 2) {
      type = "dip";
    } else {
      type = "pattern";
    }

    // Determine severity
    let severity: AnomalyDetection["severity"];
    if (zScore > 5) {
      severity = "critical";
    } else if (zScore > 4) {
      severity = "high";
    } else if (zScore > 3.5) {
      severity = "medium";
    } else {
      severity = "low";
    }

    return {
      metric,
      score: Math.min(zScore / 5, 1),
      value,
      expected: model.mean,
      stdDev: model.stdDev,
      type,
      severity,
      detectedAt: new Date(),
      suggestion: this.generateSuggestion(metric, type, severity),
    };
  }

  /**
   * Generates a remediation suggestion.
   */
  private generateSuggestion(
    metric: string,
    type: AnomalyDetection["type"],
    severity: AnomalyDetection["severity"]
  ): string {
    if (metric.includes("latency") && type === "spike") {
      return "Consider scaling up compute resources or investigating slow queries";
    }
    if (metric.includes("memory") && type === "spike") {
      return "Check for memory leaks or increase memory allocation";
    }
    if (metric.includes("error") && type === "spike") {
      return "Review recent deployments and check downstream dependencies";
    }
    if (metric.includes("cpu") && type === "spike") {
      return "Enable auto-scaling or optimize CPU-intensive operations";
    }
    return `Investigate ${metric} ${type} - ${severity} priority`;
  }

  /**
   * Subscribes to anomaly events.
   */
  onAnomaly(callback: (anomaly: AnomalyDetection) => void): () => void {
    this.emitter.on("anomaly", callback);
    return () => this.emitter.off("anomaly", callback);
  }

  /**
   * Gets model statistics.
   */
  getModels(): Map<string, StatisticalModel> {
    return new Map(this.models);
  }
}

// ==================== Predictive Scaling ====================

/**
 * Time series forecasting for predictive scaling.
 */
export class PredictiveScaler {
  private metrics: Map<string, { timestamp: number; value: number }[]> = new Map();
  private windowSize: number = 1000;
  private forecastHorizon: number = 60 * 60 * 1000; // 1 hour
  private emitter: EventEmitter = new EventEmitter();

  constructor(config?: { windowSize?: number; forecastHorizonMs?: number }) {
    if (config?.windowSize) this.windowSize = config.windowSize;
    if (config?.forecastHorizonMs) this.forecastHorizon = config.forecastHorizonMs;
  }

  /**
   * Ingests a metric value.
   */
  ingest(resource: string, value: number, timestamp: Date = new Date()): void {
    let data = this.metrics.get(resource);
    if (!data) {
      data = [];
      this.metrics.set(resource, data);
    }

    data.push({ timestamp: timestamp.getTime(), value });

    // Keep window size
    if (data.length > this.windowSize) {
      data.shift();
    }
  }

  /**
   * Generates a scaling recommendation.
   */
  recommend(resource: string, currentCapacity: number): ScalingRecommendation | null {
    const data = this.metrics.get(resource);
    if (!data || data.length < 50) {
      return null;
    }

    // Simple linear regression for trend prediction
    const { slope, intercept, r2 } = this.linearRegression(data);

    // Forecast load at horizon
    const now = Date.now();
    const horizonTimestamp = now + this.forecastHorizon;
    const forecastedLoad = slope * horizonTimestamp + intercept;

    // Generate prediction points
    const predictedLoad: Array<{ timestamp: Date; value: number }> = [];
    const step = this.forecastHorizon / 10;
    for (let t = now; t <= horizonTimestamp; t += step) {
      predictedLoad.push({
        timestamp: new Date(t),
        value: slope * t + intercept,
      });
    }

    // Determine if scaling is needed
    const currentLoad = data[data.length - 1].value;
    const loadRatio = forecastedLoad / currentCapacity;

    let recommendedCapacity = currentCapacity;
    let reason = "Current capacity is adequate";

    if (loadRatio > 0.8) {
      // Scale up
      recommendedCapacity = Math.ceil(forecastedLoad * 1.3); // 30% headroom
      reason = `Predicted load (${forecastedLoad.toFixed(0)}) will exceed 80% of capacity`;
    } else if (loadRatio < 0.3 && currentCapacity > 1) {
      // Scale down
      recommendedCapacity = Math.max(1, Math.ceil(forecastedLoad * 1.5));
      reason = `Current capacity is underutilized (${(loadRatio * 100).toFixed(0)}%)`;
    }

    const recommendation: ScalingRecommendation = {
      resource,
      currentCapacity,
      recommendedCapacity,
      confidence: Math.min(r2, 0.95), // R-squared as confidence
      horizon: this.forecastHorizon,
      reason,
      predictedLoad,
    };

    if (recommendedCapacity !== currentCapacity) {
      this.emitter.emit("recommendation", recommendation);
    }

    return recommendation;
  }

  /**
   * Performs linear regression.
   */
  private linearRegression(data: { timestamp: number; value: number }[]): {
    slope: number;
    intercept: number;
    r2: number;
  } {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const point of data) {
      sumX += point.timestamp;
      sumY += point.value;
      sumXY += point.timestamp * point.value;
      sumX2 += point.timestamp * point.timestamp;
      sumY2 += point.value * point.value;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;
    for (const point of data) {
      const predicted = slope * point.timestamp + intercept;
      ssRes += Math.pow(point.value - predicted, 2);
      ssTot += Math.pow(point.value - meanY, 2);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
  }

  /**
   * Subscribes to recommendations.
   */
  onRecommendation(callback: (rec: ScalingRecommendation) => void): () => void {
    this.emitter.on("recommendation", callback);
    return () => this.emitter.off("recommendation", callback);
  }
}

// ==================== Auto-Remediation ====================

/**
 * Remediation rule.
 */
export interface RemediationRule {
  name: string;
  trigger: {
    metric: string;
    condition: "above" | "below";
    threshold: number;
    duration: number; // ms
  };
  action: RemediationAction;
  cooldown: number; // ms before rule can fire again
  enabled: boolean;
}

/**
 * Auto-remediation engine.
 */
export class AutoRemediator {
  private rules: Map<string, RemediationRule> = new Map();
  private lastExecution: Map<string, Date> = new Map();
  private pendingTriggers: Map<string, Date> = new Map();
  private executionHistory: RemediationAction[] = [];
  private emitter: EventEmitter = new EventEmitter();

  /**
   * Registers a remediation rule.
   */
  registerRule(rule: RemediationRule): void {
    this.rules.set(rule.name, rule);
    log.debug({ ruleName: rule.name }, "Remediation rule registered");
  }

  /**
   * Evaluates rules against current metrics.
   */
  evaluate(metric: string, value: number): RemediationAction | null {
    const now = Date.now();

    for (const [name, rule] of this.rules) {
      if (!rule.enabled || rule.trigger.metric !== metric) {
        continue;
      }

      // Check cooldown
      const lastExec = this.lastExecution.get(name);
      if (lastExec && now - lastExec.getTime() < rule.cooldown) {
        continue;
      }

      // Check condition
      const conditionMet =
        (rule.trigger.condition === "above" && value > rule.trigger.threshold) ||
        (rule.trigger.condition === "below" && value < rule.trigger.threshold);

      if (conditionMet) {
        // Check if already pending
        if (!this.pendingTriggers.has(name)) {
          this.pendingTriggers.set(name, new Date());
        }

        // Check duration
        const pending = this.pendingTriggers.get(name)!;
        if (now - pending.getTime() >= rule.trigger.duration) {
          return this.executeRemediation(rule);
        }
      } else {
        // Reset pending
        this.pendingTriggers.delete(name);
      }
    }

    return null;
  }

  /**
   * Executes a remediation action.
   */
  private executeRemediation(rule: RemediationRule): RemediationAction {
    const action = { ...rule.action, id: randomUUID(), status: "executing" as const };

    log.info(
      {
        rule: rule.name,
        actionType: action.type,
        target: action.target,
      },
      "Executing remediation"
    );

    // Record execution
    this.lastExecution.set(rule.name, new Date());
    this.pendingTriggers.delete(rule.name);
    this.executionHistory.push(action);

    // Emit event
    this.emitter.emit("execute", action);

    // Execute based on type
    this.performAction(action)
      .then(() => {
        action.status = "completed";
        this.emitter.emit("complete", action);
        log.info({ actionId: action.id }, "Remediation completed");
      })
      .catch((error) => {
        action.status = "failed";
        this.emitter.emit("failed", action, error);
        log.error(
          { actionId: action.id, error: (error as Error).message },
          "Remediation failed"
        );
      });

    return action;
  }

  /**
   * Performs the remediation action.
   */
  private async performAction(action: RemediationAction): Promise<void> {
    switch (action.type) {
      case "restart":
        log.info({ target: action.target }, "Simulating restart");
        // In production: await restartService(action.target);
        break;

      case "scale":
        log.info(
          { target: action.target, replicas: action.params.replicas },
          "Simulating scale"
        );
        // In production: await scaleService(action.target, action.params.replicas);
        break;

      case "failover":
        log.info({ target: action.target }, "Simulating failover");
        // In production: await triggerFailover(action.target);
        break;

      case "throttle":
        log.info(
          { target: action.target, rate: action.params.rate },
          "Simulating throttle"
        );
        // In production: await applyThrottle(action.target, action.params.rate);
        break;

      case "circuit-break":
        log.info({ target: action.target }, "Simulating circuit break");
        // In production: await openCircuitBreaker(action.target);
        break;

      default:
        log.warn({ type: action.type }, "Unknown remediation type");
    }
  }

  /**
   * Gets execution history.
   */
  getHistory(): RemediationAction[] {
    return [...this.executionHistory];
  }

  /**
   * Subscribes to execution events.
   */
  onExecute(callback: (action: RemediationAction) => void): () => void {
    this.emitter.on("execute", callback);
    return () => this.emitter.off("execute", callback);
  }
}

// ==================== Capacity Planning ====================

/**
 * Capacity planner with ML-based forecasting.
 */
export class CapacityPlanner {
  private resourceData: Map<string, { date: Date; usage: number }[]> = new Map();
  private forecasts: Map<string, CapacityForecast> = new Map();

  /**
   * Records daily resource usage.
   */
  recordUsage(resource: string, usage: number, date: Date = new Date()): void {
    let data = this.resourceData.get(resource);
    if (!data) {
      data = [];
      this.resourceData.set(resource, data);
    }

    // Keep 365 days of data
    data.push({ date, usage });
    if (data.length > 365) {
      data.shift();
    }
  }

  /**
   * Generates a capacity forecast.
   */
  forecast(resource: string, horizonDays: number = 90, capacity: number = 100): CapacityForecast {
    const data = this.resourceData.get(resource);

    if (!data || data.length < 14) {
      return {
        resource,
        horizonDays,
        trend: "stable",
        dailyGrowthRate: 0,
        forecast: [],
        recommendations: ["Insufficient data for forecasting"],
      };
    }

    // Calculate trend
    const { slope, r2 } = this.calculateTrend(data);
    const dailyGrowthRate = (slope / data[0].usage) * 100;

    // Determine trend direction
    let trend: CapacityForecast["trend"];
    if (dailyGrowthRate > 0.5) trend = "increasing";
    else if (dailyGrowthRate < -0.5) trend = "decreasing";
    else trend = "stable";

    // Generate forecast points
    const forecast: CapacityForecast["forecast"] = [];
    const now = Date.now();
    const lastUsage = data[data.length - 1].usage;

    for (let day = 1; day <= horizonDays; day++) {
      const date = new Date(now + day * 24 * 60 * 60 * 1000);
      const predicted = lastUsage + slope * day;
      const uncertainty = Math.sqrt(1 - r2) * predicted * 0.1 * Math.sqrt(day);

      forecast.push({
        date,
        predicted: Math.max(0, predicted),
        lowerBound: Math.max(0, predicted - uncertainty * 2),
        upperBound: predicted + uncertainty * 2,
      });
    }

    // Find warning and exhaustion dates
    let warningDate: Date | undefined;
    let exhaustionDate: Date | undefined;

    for (const point of forecast) {
      if (!warningDate && point.predicted > capacity * 0.8) {
        warningDate = point.date;
      }
      if (!exhaustionDate && point.predicted > capacity) {
        exhaustionDate = point.date;
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (exhaustionDate) {
      const daysUntilExhaustion = Math.floor(
        (exhaustionDate.getTime() - now) / (24 * 60 * 60 * 1000)
      );
      recommendations.push(
        `Capacity will be exhausted in ~${daysUntilExhaustion} days`
      );
      recommendations.push(`Consider scaling up by ${Math.ceil(dailyGrowthRate * daysUntilExhaustion)}%`);
    } else if (warningDate) {
      recommendations.push("Approaching capacity threshold within forecast period");
    }

    if (trend === "decreasing") {
      recommendations.push("Consider scaling down to reduce costs");
    }

    if (recommendations.length === 0) {
      recommendations.push("Current capacity is adequate for the forecast period");
    }

    const result: CapacityForecast = {
      resource,
      horizonDays,
      trend,
      dailyGrowthRate,
      forecast,
      warningDate,
      exhaustionDate,
      recommendations,
    };

    this.forecasts.set(resource, result);
    return result;
  }

  /**
   * Calculates trend using linear regression.
   */
  private calculateTrend(data: { date: Date; usage: number }[]): {
    slope: number;
    r2: number;
  } {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i; // Day index
      const y = data[i].usage;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // R-squared
    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + (sumY - slope * sumX) / n;
      ssRes += Math.pow(data[i].usage - predicted, 2);
      ssTot += Math.pow(data[i].usage - meanY, 2);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, r2 };
  }

  /**
   * Gets cached forecasts.
   */
  getForecasts(): Map<string, CapacityForecast> {
    return new Map(this.forecasts);
  }
}

// ==================== Root Cause Analysis ====================

/**
 * Correlation between metrics.
 */
interface MetricCorrelation {
  metric1: string;
  metric2: string;
  correlation: number;
  lagMs: number;
}

/**
 * Root cause analyzer.
 */
export class RootCauseAnalyzer {
  private metrics: Map<string, { timestamp: number; value: number }[]> = new Map();
  private correlations: MetricCorrelation[] = [];

  /**
   * Ingests metric data.
   */
  ingest(metric: string, value: number, timestamp: Date = new Date()): void {
    let data = this.metrics.get(metric);
    if (!data) {
      data = [];
      this.metrics.set(metric, data);
    }

    data.push({ timestamp: timestamp.getTime(), value });

    // Keep last 1000 points
    if (data.length > 1000) {
      data.shift();
    }
  }

  /**
   * Analyzes correlations between metrics.
   */
  analyzeCorrelations(): MetricCorrelation[] {
    const metricNames = Array.from(this.metrics.keys());
    this.correlations = [];

    for (let i = 0; i < metricNames.length; i++) {
      for (let j = i + 1; j < metricNames.length; j++) {
        const correlation = this.calculateCorrelation(
          metricNames[i],
          metricNames[j]
        );
        if (correlation && Math.abs(correlation.correlation) > 0.5) {
          this.correlations.push(correlation);
        }
      }
    }

    // Sort by correlation strength
    this.correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
    );

    return this.correlations;
  }

  /**
   * Calculates correlation between two metrics.
   */
  private calculateCorrelation(
    metric1: string,
    metric2: string
  ): MetricCorrelation | null {
    const data1 = this.metrics.get(metric1);
    const data2 = this.metrics.get(metric2);

    if (!data1 || !data2 || data1.length < 10 || data2.length < 10) {
      return null;
    }

    // Align timestamps and calculate Pearson correlation
    const aligned = this.alignTimeSeries(data1, data2);
    if (aligned.length < 10) return null;

    const n = aligned.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const { v1, v2 } of aligned) {
      sumX += v1;
      sumY += v2;
      sumXY += v1 * v2;
      sumX2 += v1 * v1;
      sumY2 += v2 * v2;
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) return null;

    const correlation = numerator / denominator;

    return {
      metric1,
      metric2,
      correlation,
      lagMs: 0, // Simplified - could calculate lag correlation
    };
  }

  /**
   * Aligns two time series by timestamp.
   */
  private alignTimeSeries(
    data1: { timestamp: number; value: number }[],
    data2: { timestamp: number; value: number }[]
  ): Array<{ v1: number; v2: number }> {
    const result: Array<{ v1: number; v2: number }> = [];
    const tolerance = 60000; // 1 minute tolerance

    for (const p1 of data1) {
      const match = data2.find(
        (p2) => Math.abs(p2.timestamp - p1.timestamp) < tolerance
      );
      if (match) {
        result.push({ v1: p1.value, v2: match.value });
      }
    }

    return result;
  }

  /**
   * Finds likely root cause for an anomaly.
   */
  findRootCause(affectedMetric: string): {
    likelyCauses: Array<{ metric: string; correlation: number; confidence: number }>;
    explanation: string;
  } {
    const causes: Array<{ metric: string; correlation: number; confidence: number }> = [];

    for (const corr of this.correlations) {
      if (corr.metric1 === affectedMetric || corr.metric2 === affectedMetric) {
        const otherMetric =
          corr.metric1 === affectedMetric ? corr.metric2 : corr.metric1;
        causes.push({
          metric: otherMetric,
          correlation: corr.correlation,
          confidence: Math.abs(corr.correlation),
        });
      }
    }

    // Sort by confidence
    causes.sort((a, b) => b.confidence - a.confidence);

    let explanation = `Analysis for ${affectedMetric}:\n`;
    if (causes.length === 0) {
      explanation += "No correlated metrics found.";
    } else {
      explanation += `Found ${causes.length} potentially related metrics:\n`;
      for (const cause of causes.slice(0, 3)) {
        const direction = cause.correlation > 0 ? "positively" : "negatively";
        explanation += `- ${cause.metric} (${direction} correlated, ${(cause.confidence * 100).toFixed(0)}% confidence)\n`;
      }
    }

    return {
      likelyCauses: causes.slice(0, 5),
      explanation,
    };
  }
}

// ==================== AIOps Engine ====================

/**
 * Unified AIOps engine combining all capabilities.
 */
export class AIOpsEngine {
  readonly anomalyDetector: AnomalyDetector;
  readonly predictiveScaler: PredictiveScaler;
  readonly autoRemediator: AutoRemediator;
  readonly capacityPlanner: CapacityPlanner;
  readonly rootCauseAnalyzer: RootCauseAnalyzer;

  private running: boolean = false;
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    this.anomalyDetector = new AnomalyDetector();
    this.predictiveScaler = new PredictiveScaler();
    this.autoRemediator = new AutoRemediator();
    this.capacityPlanner = new CapacityPlanner();
    this.rootCauseAnalyzer = new RootCauseAnalyzer();

    // Wire up anomaly -> remediation
    this.anomalyDetector.onAnomaly((anomaly) => {
      if (anomaly.severity === "critical" || anomaly.severity === "high") {
        this.autoRemediator.evaluate(anomaly.metric, anomaly.value);
      }
    });
  }

  /**
   * Ingests a metric point.
   */
  ingestMetric(point: MetricPoint): void {
    // Feed all components
    this.anomalyDetector.ingest(point.name, point.value);
    this.predictiveScaler.ingest(point.name, point.value, point.timestamp);
    this.rootCauseAnalyzer.ingest(point.name, point.value, point.timestamp);

    // Daily aggregation for capacity planning
    // In production, this would be more sophisticated
    if (point.timestamp.getHours() === 0 && point.timestamp.getMinutes() === 0) {
      this.capacityPlanner.recordUsage(point.name, point.value, point.timestamp);
    }
  }

  /**
   * Starts the AIOps engine.
   */
  start(intervalMs: number = 60000): void {
    if (this.running) return;
    this.running = true;

    this.checkInterval = setInterval(() => {
      // Periodic analysis
      this.rootCauseAnalyzer.analyzeCorrelations();
    }, intervalMs);

    log.info("AIOps engine started");
  }

  /**
   * Stops the AIOps engine.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    log.info("AIOps engine stopped");
  }

  /**
   * Gets comprehensive status.
   */
  getStatus(): {
    running: boolean;
    anomalyModels: number;
    correlations: number;
    remediationRules: number;
  } {
    return {
      running: this.running,
      anomalyModels: this.anomalyDetector.getModels().size,
      correlations: this.rootCauseAnalyzer.analyzeCorrelations().length,
      remediationRules: 0, // Would need to expose from remediator
    };
  }
}

// ==================== Factory Function ====================

let aiopsEngineInstance: AIOpsEngine | null = null;

/**
 * Gets or creates the AIOps engine instance.
 */
export function getAIOpsEngine(): AIOpsEngine {
  if (!aiopsEngineInstance) {
    aiopsEngineInstance = new AIOpsEngine();
    log.info("AIOps engine initialized");
  }
  return aiopsEngineInstance;
}

/**
 * Resets the AIOps engine (for testing).
 */
export function resetAIOpsEngine(): void {
  if (aiopsEngineInstance) {
    aiopsEngineInstance.stop();
    aiopsEngineInstance = null;
  }
}
