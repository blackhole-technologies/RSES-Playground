/**
 * @file opentelemetry-setup.ts
 * @description OpenTelemetry SDK initialization and configuration
 * @phase Phase 4 - Intelligence Layer
 *
 * Features:
 * - NodeSDK initialization with auto-instrumentation
 * - OTLP HTTP exporter for traces
 * - Resource attributes for service identification
 * - Configurable sampling and export
 * - Graceful fallback when packages not installed
 */

import { createModuleLogger } from "../logger";

const log = createModuleLogger("opentelemetry");

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface OpenTelemetryConfig {
  /** Service name for resource attributes */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment (production, staging, development) */
  environment?: string;
  /** OTLP endpoint for trace export */
  otlpEndpoint?: string;
  /** Sampling ratio (0.0 to 1.0) */
  samplingRatio?: number;
  /** Enable console exporter for debugging */
  enableConsoleExporter?: boolean;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
  /** Instrumentation options */
  instrumentations?: {
    http?: boolean;
    express?: boolean;
    pg?: boolean;
    redis?: boolean;
    dns?: boolean;
    net?: boolean;
  };
}

const DEFAULT_CONFIG: OpenTelemetryConfig = {
  serviceName: "rses-cms",
  serviceVersion: "1.0.0",
  environment: process.env.NODE_ENV || "development",
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318",
  samplingRatio: 1.0,
  enableConsoleExporter: process.env.NODE_ENV === "development",
  instrumentations: {
    http: true,
    express: true,
    pg: true,
    redis: true,
    dns: false,
    net: false,
  },
};

// =============================================================================
// SDK STATE
// =============================================================================

let sdk: unknown = null;
let isInitialized = false;
let otelAvailable = false;

// =============================================================================
// OPTIONAL IMPORTS HELPER
// =============================================================================

/**
 * Safely import an OpenTelemetry module, returning null if not available
 */
async function tryImport<T>(moduleName: string): Promise<T | null> {
  try {
    return await import(/* @vite-ignore */ moduleName) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize OpenTelemetry SDK
 * Must be called before any other imports that need instrumentation
 * Returns false if OTel packages are not installed (graceful degradation)
 */
export async function initializeOpenTelemetry(
  config: Partial<OpenTelemetryConfig> = {}
): Promise<boolean> {
  if (isInitialized) {
    log.warn("OpenTelemetry already initialized");
    return otelAvailable;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Attempt to load all required OTel modules
  const [
    sdkNode,
    autoInstrumentations,
    otlpExporter,
    resources,
    semanticConventions,
    traceBase,
  ] = await Promise.all([
    // The @opentelemetry/* packages are intentionally NOT in package.json
    // — this file exists as a graceful no-op until an operator opts in by
    // installing them. The `typeof import(...)` type parameters used to
    // require the packages be installed at type-check time even though
    // the runtime tryImport handled the missing-module case. Switching to
    // `any` keeps the runtime behavior identical and lets the file compile
    // without the packages installed. The destructured fields below cast
    // through their expected shapes when used.
    tryImport<any>("@opentelemetry/sdk-node"),
    tryImport<any>("@opentelemetry/auto-instrumentations-node"),
    tryImport<any>("@opentelemetry/exporter-trace-otlp-http"),
    tryImport<any>("@opentelemetry/resources"),
    tryImport<any>("@opentelemetry/semantic-conventions"),
    tryImport<any>("@opentelemetry/sdk-trace-base"),
  ]);

  // Check if all required modules are available
  if (!sdkNode || !autoInstrumentations || !otlpExporter || !resources || !semanticConventions || !traceBase) {
    log.warn("OpenTelemetry packages not installed - tracing disabled");
    isInitialized = true;
    otelAvailable = false;
    return false;
  }

  try {
    const { NodeSDK } = sdkNode;
    const { getNodeAutoInstrumentations } = autoInstrumentations;
    const { OTLPTraceExporter } = otlpExporter;
    const { Resource } = resources;
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } = semanticConventions;
    const { TraceIdRatioBasedSampler, ParentBasedSampler, ConsoleSpanExporter, SimpleSpanProcessor, BatchSpanProcessor } = traceBase;

    // Build resource attributes
    const resourceAttributes: Record<string, string> = {
      [SEMRESATTRS_SERVICE_NAME]: cfg.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: cfg.serviceVersion || "unknown",
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: cfg.environment || "unknown",
      ...cfg.resourceAttributes,
    };

    // Create resource
    const resource = new Resource(resourceAttributes);

    // Configure sampler
    const sampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(cfg.samplingRatio ?? 1.0),
    });

    // Configure exporters
    const spanProcessors: unknown[] = [];

    // OTLP exporter for production
    if (cfg.otlpEndpoint) {
      const exporter = new OTLPTraceExporter({
        url: `${cfg.otlpEndpoint}/v1/traces`,
        headers: {},
      });
      spanProcessors.push(new BatchSpanProcessor(exporter));
    }

    // Console exporter for debugging
    if (cfg.enableConsoleExporter) {
      spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    // Configure instrumentations
    const instrumentationConfig: Record<string, { enabled: boolean }> = {};

    if (!cfg.instrumentations?.http) {
      instrumentationConfig["@opentelemetry/instrumentation-http"] = { enabled: false };
    }
    if (!cfg.instrumentations?.express) {
      instrumentationConfig["@opentelemetry/instrumentation-express"] = { enabled: false };
    }
    if (!cfg.instrumentations?.pg) {
      instrumentationConfig["@opentelemetry/instrumentation-pg"] = { enabled: false };
    }
    if (!cfg.instrumentations?.redis) {
      instrumentationConfig["@opentelemetry/instrumentation-redis"] = { enabled: false };
    }
    if (!cfg.instrumentations?.dns) {
      instrumentationConfig["@opentelemetry/instrumentation-dns"] = { enabled: false };
    }
    if (!cfg.instrumentations?.net) {
      instrumentationConfig["@opentelemetry/instrumentation-net"] = { enabled: false };
    }

    // Create SDK
    sdk = new NodeSDK({
      resource,
      sampler,
      instrumentations: [
        getNodeAutoInstrumentations(instrumentationConfig),
      ],
      spanProcessors,
    });

    // Start SDK
    await (sdk as { start: () => Promise<void> }).start();

    isInitialized = true;
    otelAvailable = true;
    log.info({
      serviceName: cfg.serviceName,
      environment: cfg.environment,
      otlpEndpoint: cfg.otlpEndpoint,
      samplingRatio: cfg.samplingRatio,
    }, "OpenTelemetry SDK initialized");

    // Graceful shutdown
    process.on("SIGTERM", () => shutdownOpenTelemetry());
    process.on("SIGINT", () => shutdownOpenTelemetry());

    return true;
  } catch (error) {
    log.error({ error }, "Failed to initialize OpenTelemetry");
    isInitialized = true;
    otelAvailable = false;
    return false;
  }
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk || !otelAvailable) return;

  try {
    await (sdk as { shutdown: () => Promise<void> }).shutdown();
    isInitialized = false;
    otelAvailable = false;
    log.info("OpenTelemetry SDK shut down");
  } catch (error) {
    log.error({ error }, "Error shutting down OpenTelemetry");
  }
}

/**
 * Check if OpenTelemetry is initialized and available
 */
export function isOpenTelemetryInitialized(): boolean {
  return isInitialized && otelAvailable;
}

// =============================================================================
// TRACING UTILITIES
// =============================================================================

/**
 * Get the current active span (if tracing is enabled)
 */
export async function getCurrentSpan(): Promise<unknown | null> {
  if (!otelAvailable) return null;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return null;

  return api.trace.getActiveSpan();
}

/**
 * Create a new span for manual instrumentation
 */
export async function createSpan(
  name: string,
  fn: (span: unknown) => Promise<unknown>
): Promise<unknown> {
  if (!otelAvailable) {
    return fn(null);
  }

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) {
    return fn(null);
  }

  const tracer = api.trace.getTracer("rses-cms");

  return tracer.startActiveSpan(name, { kind: api.SpanKind.INTERNAL }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add attributes to the current span
 */
export async function setSpanAttributes(attributes: Record<string, string | number | boolean>): Promise<void> {
  if (!otelAvailable) return;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return;

  const span = api.trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an exception on the current span
 */
export async function recordException(error: Error): Promise<void> {
  if (!otelAvailable) return;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return;

  const span = api.trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  }
}

/**
 * Add an event to the current span
 */
export async function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): Promise<void> {
  if (!otelAvailable) return;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return;

  const span = api.trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// =============================================================================
// CONTEXT PROPAGATION
// =============================================================================

/**
 * Extract trace context from headers
 */
export async function extractContext(headers: Record<string, string | string[] | undefined>): Promise<unknown> {
  if (!otelAvailable) return null;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return null;

  return api.propagation.extract(api.context.active(), headers);
}

/**
 * Inject trace context into headers
 */
export async function injectContext(headers: Record<string, string>): Promise<void> {
  if (!otelAvailable) return;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return;

  api.propagation.inject(api.context.active(), headers);
}

/**
 * Get trace ID and span ID from current context
 */
export async function getTraceInfo(): Promise<{ traceId: string; spanId: string } | null> {
  if (!otelAvailable) return null;

  const api = await tryImport<typeof import("@opentelemetry/api")>("@opentelemetry/api");
  if (!api) return null;

  const span = api.trace.getActiveSpan();
  if (!span) return null;

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}
