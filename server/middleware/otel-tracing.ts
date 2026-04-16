/**
 * @file otel-tracing.ts
 * @version 1.0.0
 * @description OpenTelemetry Tracing Middleware for Express
 *
 * Features:
 * 1. Extract trace context from incoming headers
 * 2. Create span for each request with standard attributes
 * 3. Record errors with stack traces
 * 4. Propagate context to downstream services
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

// =============================================================================
// TYPES - OpenTelemetry API interfaces (mocked if @opentelemetry/api unavailable)
// =============================================================================

/**
 * Span interface matching @opentelemetry/api
 */
export interface Span {
  setAttribute(key: string, value: string | number | boolean): Span;
  setAttributes(attributes: Record<string, string | number | boolean>): Span;
  setStatus(status: { code: SpanStatusCode; message?: string }): Span;
  recordException(exception: Error): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): Span;
  end(): void;
  spanContext(): SpanContext;
  isRecording(): boolean;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

interface Context {
  getValue(key: symbol): unknown;
  setValue(key: symbol, value: unknown): Context;
}

interface Tracer {
  startSpan(name: string, options?: SpanOptions, context?: Context): Span;
  startActiveSpan<T>(
    name: string,
    options: SpanOptions,
    fn: (span: Span) => T
  ): T;
  startActiveSpan<T>(
    name: string,
    options: SpanOptions,
    context: Context,
    fn: (span: Span) => T
  ): T;
}

interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

interface TextMapGetter<Carrier> {
  get(carrier: Carrier, key: string): string | string[] | undefined;
  keys(carrier: Carrier): string[];
}

interface TextMapSetter<Carrier> {
  set(carrier: Carrier, key: string, value: string): void;
}

interface Propagator {
  extract<Carrier>(
    context: Context,
    carrier: Carrier,
    getter: TextMapGetter<Carrier>
  ): Context;
  inject<Carrier>(
    context: Context,
    carrier: Carrier,
    setter: TextMapSetter<Carrier>
  ): void;
}

// =============================================================================
// OTEL API - Dynamic import with mock fallback
// =============================================================================

interface OTelAPI {
  trace: {
    getTracer(name: string, version?: string): Tracer;
    getActiveSpan(): Span | undefined;
    setSpan(context: Context, span: Span): Context;
  };
  context: {
    active(): Context;
    with<T>(ctx: Context, fn: () => T): T;
  };
  propagation: Propagator;
  SpanStatusCode: typeof SpanStatusCode;
  SpanKind: typeof SpanKind;
}

let otelApi: OTelAPI | null = null;
let otelInitialized = false;

/**
 * Lazily load OpenTelemetry API or return mock
 */
async function getOTelAPI(): Promise<OTelAPI | null> {
  if (otelInitialized) return otelApi;
  otelInitialized = true;

  try {
    const api = await import("@opentelemetry/api");
    otelApi = {
      trace: api.trace as unknown as OTelAPI["trace"],
      context: api.context as unknown as OTelAPI["context"],
      propagation: api.propagation as unknown as Propagator,
      SpanStatusCode: api.SpanStatusCode as unknown as typeof SpanStatusCode,
      SpanKind: api.SpanKind as unknown as typeof SpanKind,
    };
    return otelApi;
  } catch {
    // @opentelemetry/api not available - tracing disabled
    return null;
  }
}

/**
 * Synchronous getter for already-loaded API
 */
function getOTelAPISync(): OTelAPI | null {
  return otelApi;
}

// =============================================================================
// HEADER GETTER/SETTER for W3C Trace Context propagation
// =============================================================================

const headerGetter: TextMapGetter<Request["headers"]> = {
  get(carrier, key) {
    const value = carrier[key.toLowerCase()];
    if (Array.isArray(value)) return value;
    return value;
  },
  keys(carrier) {
    return Object.keys(carrier);
  },
};

const headerSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

export interface OTelTracingConfig {
  /**
   * Service name for span naming
   * @default "http-server"
   */
  serviceName?: string;

  /**
   * Skip tracing for these paths (exact match or regex)
   */
  skipPaths?: (string | RegExp)[];

  /**
   * Extract custom attributes from request
   */
  extractAttributes?: (req: Request) => Record<string, string>;

  /**
   * Whether to record request body (be careful with sensitive data)
   * @default false
   */
  recordRequestBody?: boolean;

  /**
   * Maximum body size to record
   * @default 1024
   */
  maxBodySize?: number;
}

const DEFAULT_CONFIG: Required<OTelTracingConfig> = {
  serviceName: "http-server",
  skipPaths: ["/health", "/healthz", "/ready", "/metrics", /^\/favicon/],
  extractAttributes: () => ({}),
  recordRequestBody: false,
  maxBodySize: 1024,
};

// =============================================================================
// REQUEST EXTENSION
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      /** Current OpenTelemetry span for this request */
      otelSpan?: Span;
      /** Trace ID for this request */
      traceId?: string;
      /** Span ID for this request */
      spanId?: string;
    }
    interface Response {
      locals: {
        /** Custom attributes to add to span before response completes */
        otelAttributes?: Record<string, string>;
        [key: string]: unknown;
      };
    }
  }
}

// =============================================================================
// MAIN MIDDLEWARE
// =============================================================================

/**
 * Creates Express middleware for OpenTelemetry tracing
 *
 * Features:
 * - Extracts W3C trace context from incoming headers (traceparent, tracestate)
 * - Creates a span for each request with standard HTTP attributes
 * - Records errors with full stack traces
 * - Propagates context for downstream service calls
 *
 * @param config - Optional configuration
 * @returns Express RequestHandler middleware
 *
 * @example
 * ```typescript
 * import express from "express";
 * import { otelTracingMiddleware } from "./middleware/otel-tracing";
 *
 * const app = express();
 * app.use(otelTracingMiddleware({
 *   serviceName: "my-api",
 *   skipPaths: ["/health"]
 * }));
 * ```
 */
export function otelTracingMiddleware(
  config: OTelTracingConfig = {}
): RequestHandler {
  const cfg: Required<OTelTracingConfig> = { ...DEFAULT_CONFIG, ...config };

  // Pre-load OTel API
  getOTelAPI().catch(() => {
    // Ignore - will use mock
  });

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Check if path should be skipped
    const path = req.path;
    const shouldSkip = cfg.skipPaths.some((p) =>
      typeof p === "string" ? path === p : p.test(path)
    );
    if (shouldSkip) {
      next();
      return;
    }

    const api = getOTelAPISync() || (await getOTelAPI());
    if (!api) {
      // OTel not available - pass through
      next();
      return;
    }

    // Extract trace context from incoming headers
    const parentContext = api.propagation.extract(
      api.context.active(),
      req.headers,
      headerGetter
    );

    // Create span for this request
    const tracer = api.trace.getTracer(cfg.serviceName, "1.0.0");
    const spanName = `${req.method} ${req.route?.path || req.path}`;

    const span = tracer.startSpan(
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": req.method,
          "http.url": req.originalUrl || req.url,
          "http.target": req.path,
          "http.host": req.get("host") || "unknown",
          "http.scheme": req.protocol,
          "http.user_agent": req.get("user-agent") || "unknown",
          "net.peer.ip": req.ip || req.socket.remoteAddress || "unknown",
        },
      },
      parentContext
    );

    // Attach span info to request for downstream use
    req.otelSpan = span;
    const spanCtx = span.spanContext();
    req.traceId = spanCtx.traceId;
    req.spanId = spanCtx.spanId;

    // Set trace ID header for response debugging
    res.setHeader("X-Trace-ID", spanCtx.traceId);

    // Add user ID if authenticated (common pattern)
    const user = (req as unknown as Record<string, unknown>).user as
      | { id?: string | number }
      | undefined;
    if (user?.id) {
      span.setAttribute("user.id", String(user.id));
    }

    // Add custom attributes from config extractor
    try {
      const customAttrs = cfg.extractAttributes(req);
      span.setAttributes(customAttrs);
    } catch {
      // Ignore extraction errors
    }

    // Record request body if configured
    if (cfg.recordRequestBody && req.body) {
      try {
        const bodyStr = JSON.stringify(req.body);
        span.setAttribute(
          "http.request.body",
          bodyStr.substring(0, cfg.maxBodySize)
        );
      } catch {
        // Body not serializable
      }
    }

    const startTime = Date.now();

    // Wrap response end to capture status code and add custom attributes
    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      ...args: Parameters<Response["end"]>
    ): Response {
      // Add any custom attributes from res.locals
      if (res.locals.otelAttributes) {
        span.setAttributes(res.locals.otelAttributes);
      }

      // Set response attributes
      span.setAttribute("http.status_code", res.statusCode);
      span.setAttribute("http.response_time_ms", Date.now() - startTime);

      const contentLength = res.get("content-length");
      if (contentLength) {
        span.setAttribute(
          "http.response_content_length",
          parseInt(contentLength, 10)
        );
      }

      // Set span status based on HTTP status code
      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // End the span
      span.end();

      return originalEnd(...args);
    } as Response["end"];

    // Handle errors
    res.on("error", (err: Error) => {
      recordError(span, err);
    });

    // Execute in context
    api.context.with(api.trace.setSpan(parentContext, span), () => {
      next();
    });
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Records an error on a span with full stack trace
 *
 * @param span - The span to record the error on
 * @param error - The error to record
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   recordError(req.otelSpan, err);
 *   throw err;
 * }
 * ```
 */
export function recordError(span: Span, error: Error): void {
  if (!span || !span.isRecording()) return;

  // Record exception with stack trace
  span.recordException(error);

  // Add error attributes
  span.setAttributes({
    "error": true,
    "error.type": error.name,
    "error.message": error.message,
  });

  if (error.stack) {
    span.setAttribute("error.stack", error.stack);
  }

  // Set span status to error
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
}

/**
 * Adds custom attributes to a span
 *
 * Useful for adding business-specific context to traces
 *
 * @param span - The span to add attributes to
 * @param attrs - Key-value pairs to add as attributes
 *
 * @example
 * ```typescript
 * addCustomAttributes(req.otelSpan, {
 *   "order.id": orderId,
 *   "customer.tier": "premium"
 * });
 * ```
 */
export function addCustomAttributes(
  span: Span,
  attrs: Record<string, string>
): void {
  if (!span || !span.isRecording()) return;

  span.setAttributes(attrs);
}

// =============================================================================
// CONTEXT PROPAGATION UTILITIES
// =============================================================================

/**
 * Injects trace context into outgoing headers for downstream propagation
 *
 * Call this before making HTTP requests to other services to propagate
 * the trace context.
 *
 * @param headers - Headers object to inject context into
 * @returns The modified headers object
 *
 * @example
 * ```typescript
 * const headers: Record<string, string> = { "Content-Type": "application/json" };
 * injectTraceContext(headers);
 * await fetch("http://downstream-service/api", { headers });
 * ```
 */
export async function injectTraceContext(
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const api = getOTelAPISync() || (await getOTelAPI());
  if (!api) return headers;

  api.propagation.inject(api.context.active(), headers, headerSetter);
  return headers;
}

/**
 * Gets the current trace ID from active context
 *
 * @returns Trace ID string or null if no active span
 */
export async function getCurrentTraceId(): Promise<string | null> {
  const api = getOTelAPISync() || (await getOTelAPI());
  if (!api) return null;

  const span = api.trace.getActiveSpan();
  if (!span) return null;

  return span.spanContext().traceId;
}

/**
 * Gets the current span from active context
 *
 * @returns Active span or null
 */
export async function getCurrentSpan(): Promise<Span | null> {
  const api = getOTelAPISync() || (await getOTelAPI());
  if (!api) return null;

  return api.trace.getActiveSpan() || null;
}

// =============================================================================
// ERROR MIDDLEWARE
// =============================================================================

/**
 * Express error middleware that records errors to OpenTelemetry
 *
 * Place this after your routes to capture unhandled errors.
 *
 * @example
 * ```typescript
 * app.use(otelTracingMiddleware());
 * app.use("/api", apiRoutes);
 * app.use(otelErrorMiddleware());
 * ```
 */
export function otelErrorMiddleware(): (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (req.otelSpan) {
      recordError(req.otelSpan, err);
    }
    next(err);
  };
}

// =============================================================================
// MANUAL SPAN CREATION
// =============================================================================

/**
 * Creates a child span for manual instrumentation
 *
 * @param name - Span name
 * @param fn - Function to execute within the span context
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const result = await withSpan("process-order", async (span) => {
 *   span.setAttribute("order.items", items.length);
 *   return processOrder(items);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const api = getOTelAPISync() || (await getOTelAPI());

  if (!api) {
    // Create a no-op span for when OTel is not available
    const noopSpan: Span = {
      setAttribute: () => noopSpan,
      setAttributes: () => noopSpan,
      setStatus: () => noopSpan,
      recordException: () => {},
      addEvent: () => noopSpan,
      end: () => {},
      spanContext: () => ({
        traceId: "00000000000000000000000000000000",
        spanId: "0000000000000000",
        traceFlags: 0,
      }),
      isRecording: () => false,
    };
    return fn(noopSpan);
  }

  const tracer = api.trace.getTracer("manual-instrumentation");

  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL },
    async (span: Span): Promise<T> => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        recordError(span, error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
