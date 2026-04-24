/**
 * @file logger.ts
 * @description Structured logging with pino for production readiness.
 *              Provides correlation IDs, sensitive field redaction, and
 *              environment-aware formatting.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * @security Sensitive fields are automatically redacted from logs.
 *           Correlation IDs enable request tracing without exposing user data.
 */

import pino, { Logger, LoggerOptions } from "pino";
import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Async local storage for correlation ID propagation
const correlationStore = new AsyncLocalStorage<{ correlationId: string }>();

/**
 * List of fields to redact from logs (case-insensitive matching).
 * Values are replaced with "[REDACTED]".
 */
const REDACTED_FIELDS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "authorization",
  "cookie",
  "sessionId",
  "creditCard",
  "ssn",
];

/**
 * Recursively redacts sensitive fields from an object.
 */
function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveFields(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Creates pino logger configuration based on environment.
 */
function createLoggerOptions(): LoggerOptions {
  const isProduction = process.env.NODE_ENV === "production";
  const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

  const baseOptions: LoggerOptions = {
    level: logLevel,
    // Add correlation ID to every log if available
    mixin() {
      const store = correlationStore.getStore();
      return store ? { correlationId: store.correlationId } : {};
    },
    // Custom timestamp format
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Format error objects properly
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: "rses-playground",
      }),
    },
    // Redact sensitive paths
    redact: {
      paths: REDACTED_FIELDS.map((f) => `*.${f}`),
      censor: "[REDACTED]",
    },
  };

  if (!isProduction) {
    // Pretty printing for development
    return {
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    };
  }

  return baseOptions;
}

// Create the main logger instance
export const logger: Logger = pino(createLoggerOptions());

/**
 * Creates a child logger with a specific module context.
 *
 * @param module - Module name for log context (e.g., "ws", "routes", "auth")
 * @returns Child logger with module context
 *
 * @example
 * const log = createModuleLogger("ws");
 * log.info("Client connected");
 */
export function createModuleLogger(module: string): Logger {
  return logger.child({ module });
}

/**
 * Gets the current correlation ID from async local storage.
 * Returns undefined if not in a request context.
 */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore()?.correlationId;
}

/**
 * Runs a function within a correlation ID context.
 * Used for background jobs or non-HTTP operations that need tracing.
 *
 * @param correlationId - The correlation ID to use
 * @param fn - Function to run within the context
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStore.run({ correlationId }, fn);
}

/**
 * Express middleware that adds correlation ID to each request.
 * Uses X-Correlation-ID header if provided, otherwise generates a new one.
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers["x-correlation-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      randomUUID();

    // Add to response headers for client tracing
    res.setHeader("X-Correlation-ID", correlationId);

    // Store in request for easy access
    (req as Request & { correlationId: string }).correlationId = correlationId;

    // Run the rest of the request in correlation context
    correlationStore.run({ correlationId }, () => next());
  };
}

/**
 * Express middleware for request logging.
 * Logs request start and completion with timing.
 */
export function requestLoggingMiddleware() {
  const log = createModuleLogger("http");

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    // Log request start (debug level)
    log.debug(
      {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        userAgent: req.get("user-agent"),
      },
      "Request started"
    );

    res.on("finish", () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get("content-length"),
      };

      // Log at appropriate level based on status code
      if (res.statusCode >= 500) {
        log.error(logData, "Request failed");
      } else if (res.statusCode >= 400) {
        log.warn(logData, "Request client error");
      } else {
        log.info(logData, "Request completed");
      }
    });

    next();
  };
}

/**
 * Utility to log and redact an object.
 * Use this when logging user-provided data that might contain sensitive info.
 *
 * @param data - Data to redact
 * @returns Redacted data safe for logging
 */
export function redact(data: unknown): unknown {
  return redactSensitiveFields(data);
}

// Pre-configured module loggers for common use cases
export const wsLogger = createModuleLogger("ws");
export const routesLogger = createModuleLogger("routes");
export const authLogger = createModuleLogger("auth");
export const dbLogger = createModuleLogger("db");
export const projectsLogger = createModuleLogger("projects");
export const bridgeLogger = createModuleLogger("bridge");
export const symlinkLogger = createModuleLogger("symlink");
export const fileWatcherLogger = createModuleLogger("file-watcher");
export const engineLogger = createModuleLogger("engine");
export const workbenchLogger = createModuleLogger("workbench");

// Type augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}
