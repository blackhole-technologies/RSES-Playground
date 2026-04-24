/**
 * @file observability.ts
 * @description Comprehensive observability stack with OpenTelemetry.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Distributed tracing (OpenTelemetry compatible)
 * - Structured logging with correlation IDs
 * - Metrics collection (Prometheus format)
 * - Alerting integration (PagerDuty)
 * - Health checks and readiness probes
 * - SLO/SLI tracking
 *
 * Inspired by:
 * - OpenTelemetry specification
 * - Prometheus metrics model
 * - Jaeger tracing
 * - DataDog APM
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { Span, SpanEvent, MetricPoint } from "./types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("observability");

// ==================== Trace Context ====================

/**
 * W3C Trace Context for distributed tracing.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Generates a new trace ID (32 hex chars).
 */
function generateTraceId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Generates a new span ID (16 hex chars).
 */
function generateSpanId(): string {
  return randomUUID().replace(/-/g, "").substring(0, 16);
}

// ==================== Span Implementation ====================

/**
 * Span builder for creating trace spans.
 */
export class SpanBuilder {
  private span: Partial<Span> = {
    attributes: {},
    events: [],
    baggage: {},
    status: "UNSET",
  };

  constructor(operationName: string, serviceName: string) {
    this.span.operationName = operationName;
    this.span.serviceName = serviceName;
    this.span.spanId = generateSpanId();
  }

  withTraceId(traceId: string): this {
    this.span.traceId = traceId;
    return this;
  }

  withParentSpanId(parentSpanId: string): this {
    this.span.parentSpanId = parentSpanId;
    return this;
  }

  withAttribute(key: string, value: string | number | boolean): this {
    this.span.attributes![key] = value;
    return this;
  }

  withBaggage(key: string, value: string): this {
    this.span.baggage![key] = value;
    return this;
  }

  start(): ActiveSpan {
    return new ActiveSpan({
      ...this.span,
      traceId: this.span.traceId || generateTraceId(),
      startTime: new Date(),
    } as Span);
  }
}

/**
 * Active span that can be modified and ended.
 */
export class ActiveSpan implements Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: "OK" | "ERROR" | "UNSET";
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  baggage: Record<string, string>;

  private ended: boolean = false;

  constructor(span: Span) {
    this.traceId = span.traceId;
    this.spanId = span.spanId;
    this.parentSpanId = span.parentSpanId;
    this.operationName = span.operationName;
    this.serviceName = span.serviceName;
    this.startTime = span.startTime;
    this.status = span.status;
    this.attributes = { ...span.attributes };
    this.events = [...span.events];
    this.baggage = { ...span.baggage };
  }

  /**
   * Sets a span attribute.
   */
  setAttribute(key: string, value: string | number | boolean): this {
    if (this.ended) return this;
    this.attributes[key] = value;
    return this;
  }

  /**
   * Adds an event to the span.
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    if (this.ended) return this;
    this.events.push({
      name,
      timestamp: new Date(),
      attributes,
    });
    return this;
  }

  /**
   * Sets the span status.
   */
  setStatus(status: "OK" | "ERROR"): this {
    if (this.ended) return this;
    this.status = status;
    return this;
  }

  /**
   * Records an exception.
   */
  recordException(error: Error): this {
    this.setStatus("ERROR");
    this.addEvent("exception", {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack || "",
    });
    return this;
  }

  /**
   * Ends the span.
   */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = new Date();
    this.duration = this.endTime.getTime() - this.startTime.getTime();

    // Report to tracer
    getTracer().reportSpan(this);
  }

  /**
   * Creates a child span.
   */
  createChild(operationName: string): SpanBuilder {
    return new SpanBuilder(operationName, this.serviceName)
      .withTraceId(this.traceId)
      .withParentSpanId(this.spanId);
  }
}

// ==================== Tracer ====================

/**
 * Tracer configuration.
 */
export interface TracerConfig {
  serviceName: string;
  sampleRate: number; // 0.0 - 1.0
  exportEndpoint?: string;
  exportIntervalMs: number;
  maxSpansPerBatch: number;
}

const DEFAULT_TRACER_CONFIG: TracerConfig = {
  serviceName: "rses-playground",
  sampleRate: 1.0,
  exportIntervalMs: 5000,
  maxSpansPerBatch: 100,
};

/**
 * Tracer for distributed tracing.
 */
export class Tracer {
  private config: TracerConfig;
  private spanBuffer: Span[] = [];
  private exportTimer?: NodeJS.Timeout;
  private emitter: EventEmitter = new EventEmitter();

  constructor(config: Partial<TracerConfig> = {}) {
    this.config = { ...DEFAULT_TRACER_CONFIG, ...config };
    this.startExporter();
  }

  /**
   * Creates a new span.
   */
  startSpan(operationName: string): SpanBuilder {
    return new SpanBuilder(operationName, this.config.serviceName);
  }

  /**
   * Reports a completed span.
   */
  reportSpan(span: Span): void {
    // Sample based on sample rate
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    this.spanBuffer.push(span);
    this.emitter.emit("span", span);

    if (this.spanBuffer.length >= this.config.maxSpansPerBatch) {
      this.flush();
    }
  }

  /**
   * Flushes buffered spans to the export endpoint.
   */
  async flush(): Promise<void> {
    if (this.spanBuffer.length === 0) return;

    const spans = [...this.spanBuffer];
    this.spanBuffer = [];

    if (this.config.exportEndpoint) {
      try {
        await fetch(this.config.exportEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spans }),
        });
      } catch (error) {
        log.error(
          { error: (error as Error).message, spanCount: spans.length },
          "Failed to export spans"
        );
        // Re-add to buffer for retry
        this.spanBuffer.unshift(...spans);
      }
    } else {
      // Log spans in development
      for (const span of spans) {
        log.debug(
          {
            traceId: span.traceId,
            spanId: span.spanId,
            operation: span.operationName,
            duration: span.duration,
            status: span.status,
          },
          "Span completed"
        );
      }
    }
  }

  /**
   * Starts the export timer.
   */
  private startExporter(): void {
    this.exportTimer = setInterval(() => {
      this.flush();
    }, this.config.exportIntervalMs);
  }

  /**
   * Stops the tracer.
   */
  async stop(): Promise<void> {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
    }
    await this.flush();
  }

  /**
   * Subscribes to span events.
   */
  onSpan(callback: (span: Span) => void): () => void {
    this.emitter.on("span", callback);
    return () => this.emitter.off("span", callback);
  }

  /**
   * Gets tracer statistics.
   */
  getStats(): { bufferedSpans: number; sampleRate: number } {
    return {
      bufferedSpans: this.spanBuffer.length,
      sampleRate: this.config.sampleRate,
    };
  }
}

// ==================== Metrics Collector ====================

/**
 * Metrics collector configuration.
 */
export interface MetricsConfig {
  prefix: string;
  defaultLabels: Record<string, string>;
  histogramBuckets: number[];
  summaryQuantiles: number[];
}

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  prefix: "rses_",
  defaultLabels: {},
  histogramBuckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  summaryQuantiles: [0.5, 0.9, 0.95, 0.99],
};

/**
 * Counter metric.
 */
export class Counter {
  private value: number = 0;

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labels: string[] = []
  ) {}

  inc(labels?: Record<string, string>, value: number = 1): void {
    this.value += value;
    getMetricsCollector().record({
      name: this.name,
      type: "counter",
      value: this.value,
      labels: labels || {},
      timestamp: new Date(),
    });
  }

  get(): number {
    return this.value;
  }
}

/**
 * Gauge metric.
 */
export class Gauge {
  private value: number = 0;

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labels: string[] = []
  ) {}

  set(value: number, labels?: Record<string, string>): void {
    this.value = value;
    getMetricsCollector().record({
      name: this.name,
      type: "gauge",
      value: this.value,
      labels: labels || {},
      timestamp: new Date(),
    });
  }

  inc(labels?: Record<string, string>, value: number = 1): void {
    this.set(this.value + value, labels);
  }

  dec(labels?: Record<string, string>, value: number = 1): void {
    this.set(this.value - value, labels);
  }

  get(): number {
    return this.value;
  }
}

/**
 * Histogram metric.
 */
export class Histogram {
  private buckets: Map<number, number> = new Map();
  private sum: number = 0;
  private count: number = 0;

  constructor(
    readonly name: string,
    readonly help: string,
    readonly bucketBoundaries: number[],
    readonly labels: string[] = []
  ) {
    // Initialize buckets
    for (const boundary of bucketBoundaries) {
      this.buckets.set(boundary, 0);
    }
    this.buckets.set(Infinity, 0);
  }

  observe(value: number, labels?: Record<string, string>): void {
    this.sum += value;
    this.count++;

    // Increment appropriate buckets
    for (const boundary of this.buckets.keys()) {
      if (value <= boundary) {
        this.buckets.set(boundary, this.buckets.get(boundary)! + 1);
      }
    }

    getMetricsCollector().record({
      name: this.name,
      type: "histogram",
      value,
      labels: labels || {},
      timestamp: new Date(),
    });
  }

  startTimer(labels?: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      this.observe(duration, labels);
    };
  }

  getStats(): { count: number; sum: number; buckets: Map<number, number> } {
    return {
      count: this.count,
      sum: this.sum,
      buckets: new Map(this.buckets),
    };
  }
}

/**
 * Metrics collector.
 */
export class MetricsCollector {
  private config: MetricsConfig;
  private metrics: Map<string, MetricPoint[]> = new Map();
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
  }

  /**
   * Creates or gets a counter.
   */
  counter(name: string, help: string, labels?: string[]): Counter {
    const fullName = this.config.prefix + name;
    if (!this.counters.has(fullName)) {
      this.counters.set(fullName, new Counter(fullName, help, labels));
    }
    return this.counters.get(fullName)!;
  }

  /**
   * Creates or gets a gauge.
   */
  gauge(name: string, help: string, labels?: string[]): Gauge {
    const fullName = this.config.prefix + name;
    if (!this.gauges.has(fullName)) {
      this.gauges.set(fullName, new Gauge(fullName, help, labels));
    }
    return this.gauges.get(fullName)!;
  }

  /**
   * Creates or gets a histogram.
   */
  histogram(
    name: string,
    help: string,
    buckets?: number[],
    labels?: string[]
  ): Histogram {
    const fullName = this.config.prefix + name;
    if (!this.histograms.has(fullName)) {
      this.histograms.set(
        fullName,
        new Histogram(fullName, help, buckets || this.config.histogramBuckets, labels)
      );
    }
    return this.histograms.get(fullName)!;
  }

  /**
   * Records a metric point.
   */
  record(point: MetricPoint): void {
    // Add default labels
    point.labels = { ...this.config.defaultLabels, ...point.labels };

    // Store metric
    let points = this.metrics.get(point.name);
    if (!points) {
      points = [];
      this.metrics.set(point.name, points);
    }
    points.push(point);

    // Limit stored points
    if (points.length > 1000) {
      points.shift();
    }
  }

  /**
   * Gets metrics in Prometheus format.
   */
  getPrometheusFormat(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counter] of this.counters) {
      lines.push(`# HELP ${name} ${counter.help}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${counter.get()}`);
    }

    // Gauges
    for (const [name, gauge] of this.gauges) {
      lines.push(`# HELP ${name} ${gauge.help}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${gauge.get()}`);
    }

    // Histograms
    for (const [name, histogram] of this.histograms) {
      const stats = histogram.getStats();
      lines.push(`# HELP ${name} ${histogram.help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [boundary, count] of stats.buckets) {
        const le = boundary === Infinity ? "+Inf" : String(boundary);
        lines.push(`${name}_bucket{le="${le}"} ${count}`);
      }
      lines.push(`${name}_sum ${stats.sum}`);
      lines.push(`${name}_count ${stats.count}`);
    }

    return lines.join("\n");
  }

  /**
   * Clears all metrics.
   */
  clear(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// ==================== Alerting ====================

/**
 * Alert severity levels.
 */
export enum AlertSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

/**
 * Alert definition.
 */
export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  source: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: Date;
  endsAt?: Date;
  fingerprint: string;
}

/**
 * Alert rule for automatic alerting.
 */
export interface AlertRule {
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: () => boolean;
  labels?: Record<string, string>;
  forDuration?: number; // ms before firing
}

/**
 * Alert manager.
 */
export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private pendingAlerts: Map<string, { rule: AlertRule; since: Date }> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private pagerDutyKey?: string;
  private emitter: EventEmitter = new EventEmitter();

  constructor(pagerDutyKey?: string) {
    this.pagerDutyKey = pagerDutyKey;
  }

  /**
   * Registers an alert rule.
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.name, rule);
    log.debug({ ruleName: rule.name }, "Alert rule registered");
  }

  /**
   * Starts checking alert rules.
   */
  start(checkIntervalMs: number = 10000): void {
    this.checkInterval = setInterval(() => {
      this.checkRules();
    }, checkIntervalMs);
    log.info("Alert manager started");
  }

  /**
   * Stops the alert manager.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    log.info("Alert manager stopped");
  }

  /**
   * Checks all alert rules.
   */
  private checkRules(): void {
    for (const [name, rule] of this.rules) {
      try {
        const isFiring = rule.condition();

        if (isFiring) {
          if (!this.pendingAlerts.has(name) && !this.activeAlerts.has(name)) {
            // Start pending
            this.pendingAlerts.set(name, { rule, since: new Date() });
          } else if (this.pendingAlerts.has(name)) {
            // Check if should fire
            const pending = this.pendingAlerts.get(name)!;
            const duration = Date.now() - pending.since.getTime();

            if (!rule.forDuration || duration >= rule.forDuration) {
              this.fireAlert(rule);
              this.pendingAlerts.delete(name);
            }
          }
        } else {
          // Resolve if active
          if (this.activeAlerts.has(name)) {
            this.resolveAlert(name);
          }
          this.pendingAlerts.delete(name);
        }
      } catch (error) {
        log.error(
          { rule: name, error: (error as Error).message },
          "Error checking alert rule"
        );
      }
    }
  }

  /**
   * Fires an alert.
   */
  private fireAlert(rule: AlertRule): void {
    const alert: Alert = {
      id: randomUUID(),
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      source: "rses-playground",
      labels: rule.labels || {},
      annotations: {},
      startsAt: new Date(),
      fingerprint: this.generateFingerprint(rule),
    };

    this.activeAlerts.set(rule.name, alert);
    this.emitter.emit("alert", alert);

    log.warn(
      { alert: rule.name, severity: rule.severity },
      "Alert fired"
    );

    // Send to PagerDuty if configured
    if (this.pagerDutyKey && rule.severity === AlertSeverity.CRITICAL) {
      this.sendToPagerDuty(alert);
    }
  }

  /**
   * Resolves an alert.
   */
  private resolveAlert(name: string): void {
    const alert = this.activeAlerts.get(name);
    if (!alert) return;

    alert.endsAt = new Date();
    this.activeAlerts.delete(name);
    this.emitter.emit("resolve", alert);

    log.info({ alert: name }, "Alert resolved");
  }

  /**
   * Generates a fingerprint for deduplication.
   */
  private generateFingerprint(rule: AlertRule): string {
    const data = JSON.stringify({
      name: rule.name,
      labels: rule.labels,
    });
    // Simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
    }
    return hash.toString(16);
  }

  /**
   * Sends alert to PagerDuty.
   */
  private async sendToPagerDuty(alert: Alert): Promise<void> {
    if (!this.pagerDutyKey) return;

    try {
      await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: this.pagerDutyKey,
          event_action: "trigger",
          dedup_key: alert.fingerprint,
          payload: {
            summary: `[${alert.severity.toUpperCase()}] ${alert.name}: ${alert.description}`,
            source: alert.source,
            severity: alert.severity === AlertSeverity.CRITICAL ? "critical" : "error",
            timestamp: alert.startsAt.toISOString(),
            custom_details: alert.labels,
          },
        }),
      });
    } catch (error) {
      log.error(
        { alert: alert.name, error: (error as Error).message },
        "Failed to send to PagerDuty"
      );
    }
  }

  /**
   * Gets active alerts.
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Subscribes to alert events.
   */
  onAlert(callback: (alert: Alert) => void): () => void {
    this.emitter.on("alert", callback);
    return () => this.emitter.off("alert", callback);
  }

  /**
   * Subscribes to resolve events.
   */
  onResolve(callback: (alert: Alert) => void): () => void {
    this.emitter.on("resolve", callback);
    return () => this.emitter.off("resolve", callback);
  }
}

// ==================== Health Checks ====================

/**
 * Health check result.
 */
export interface HealthCheckResult {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  latency?: number;
  lastCheck: Date;
}

/**
 * Health check function.
 */
export type HealthCheck = () => Promise<HealthCheckResult>;

/**
 * Health checker.
 */
export class HealthChecker {
  private checks: Map<string, HealthCheck> = new Map();
  private results: Map<string, HealthCheckResult> = new Map();
  private checkInterval?: NodeJS.Timeout;

  /**
   * Registers a health check.
   */
  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
    log.debug({ check: name }, "Health check registered");
  }

  /**
   * Starts periodic health checks.
   */
  start(intervalMs: number = 30000): void {
    this.runChecks();
    this.checkInterval = setInterval(() => {
      this.runChecks();
    }, intervalMs);
  }

  /**
   * Stops health checks.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Runs all health checks.
   */
  async runChecks(): Promise<void> {
    for (const [name, check] of this.checks) {
      const start = Date.now();
      try {
        const result = await check();
        result.latency = Date.now() - start;
        this.results.set(name, result);
      } catch (error) {
        this.results.set(name, {
          name,
          status: "unhealthy",
          message: (error as Error).message,
          latency: Date.now() - start,
          lastCheck: new Date(),
        });
      }
    }
  }

  /**
   * Gets overall health status.
   */
  getStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    checks: HealthCheckResult[];
  } {
    const checks = Array.from(this.results.values());

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    for (const check of checks) {
      if (check.status === "unhealthy") {
        status = "unhealthy";
        break;
      }
      if (check.status === "degraded" && status === "healthy") {
        status = "degraded";
      }
    }

    return { status, checks };
  }

  /**
   * Checks if the service is ready.
   */
  async isReady(): Promise<boolean> {
    await this.runChecks();
    const { status } = this.getStatus();
    return status !== "unhealthy";
  }
}

// ==================== SLO/SLI Tracking ====================

/**
 * Service Level Indicator definition.
 */
export interface SLIDefinition {
  name: string;
  description: string;
  type: "latency" | "availability" | "error_rate" | "throughput";
  target: number;
  window: "hourly" | "daily" | "weekly" | "monthly";
}

/**
 * SLI measurement.
 */
export interface SLIMeasurement {
  sliName: string;
  value: number;
  target: number;
  met: boolean;
  timestamp: Date;
}

/**
 * SLO tracker.
 */
export class SLOTracker {
  private slis: Map<string, SLIDefinition> = new Map();
  private measurements: Map<string, SLIMeasurement[]> = new Map();

  /**
   * Registers an SLI.
   */
  registerSLI(sli: SLIDefinition): void {
    this.slis.set(sli.name, sli);
    this.measurements.set(sli.name, []);
  }

  /**
   * Records an SLI measurement.
   */
  record(sliName: string, value: number): void {
    const sli = this.slis.get(sliName);
    if (!sli) return;

    const measurement: SLIMeasurement = {
      sliName,
      value,
      target: sli.target,
      met: this.checkTarget(sli, value),
      timestamp: new Date(),
    };

    const measurements = this.measurements.get(sliName)!;
    measurements.push(measurement);

    // Limit stored measurements
    if (measurements.length > 10000) {
      measurements.shift();
    }
  }

  /**
   * Checks if value meets target.
   */
  private checkTarget(sli: SLIDefinition, value: number): boolean {
    switch (sli.type) {
      case "latency":
        return value <= sli.target;
      case "availability":
        return value >= sli.target;
      case "error_rate":
        return value <= sli.target;
      case "throughput":
        return value >= sli.target;
      default:
        return true;
    }
  }

  /**
   * Gets SLO status for all SLIs.
   */
  getStatus(): Map<string, { compliance: number; burnRate: number }> {
    const status = new Map<string, { compliance: number; burnRate: number }>();

    for (const [name, sli] of this.slis) {
      const measurements = this.measurements.get(name) || [];
      const windowMs = this.getWindowMs(sli.window);
      const now = Date.now();

      const windowMeasurements = measurements.filter(
        (m) => now - m.timestamp.getTime() < windowMs
      );

      if (windowMeasurements.length === 0) {
        status.set(name, { compliance: 1.0, burnRate: 0 });
        continue;
      }

      const met = windowMeasurements.filter((m) => m.met).length;
      const compliance = met / windowMeasurements.length;

      // Burn rate: how fast we're consuming error budget
      const errorBudget = 1 - sli.target;
      const errorsUsed = 1 - compliance;
      const burnRate = errorBudget > 0 ? errorsUsed / errorBudget : 0;

      status.set(name, { compliance, burnRate });
    }

    return status;
  }

  /**
   * Gets window duration in milliseconds.
   */
  private getWindowMs(window: SLIDefinition["window"]): number {
    switch (window) {
      case "hourly":
        return 60 * 60 * 1000;
      case "daily":
        return 24 * 60 * 60 * 1000;
      case "weekly":
        return 7 * 24 * 60 * 60 * 1000;
      case "monthly":
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}

// ==================== Factory Functions ====================

let tracerInstance: Tracer | null = null;
let metricsInstance: MetricsCollector | null = null;
let alertManagerInstance: AlertManager | null = null;
let healthCheckerInstance: HealthChecker | null = null;

export function getTracer(config?: Partial<TracerConfig>): Tracer {
  if (!tracerInstance) {
    tracerInstance = new Tracer(config);
    log.info("Tracer initialized");
  }
  return tracerInstance;
}

export function getMetricsCollector(config?: Partial<MetricsConfig>): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector(config);
    log.info("Metrics collector initialized");
  }
  return metricsInstance;
}

export function getAlertManager(pagerDutyKey?: string): AlertManager {
  if (!alertManagerInstance) {
    alertManagerInstance = new AlertManager(pagerDutyKey);
    log.info("Alert manager initialized");
  }
  return alertManagerInstance;
}

export function getHealthChecker(): HealthChecker {
  if (!healthCheckerInstance) {
    healthCheckerInstance = new HealthChecker();
    log.info("Health checker initialized");
  }
  return healthCheckerInstance;
}

/**
 * Resets all observability instances (for testing).
 */
export async function resetObservability(): Promise<void> {
  if (tracerInstance) {
    await tracerInstance.stop();
    tracerInstance = null;
  }
  if (alertManagerInstance) {
    alertManagerInstance.stop();
    alertManagerInstance = null;
  }
  if (healthCheckerInstance) {
    healthCheckerInstance.stop();
    healthCheckerInstance = null;
  }
  if (metricsInstance) {
    metricsInstance.clear();
    metricsInstance = null;
  }
}
