/**
 * @file audit.ts
 * @description Audit logging middleware for automatic request logging
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 */

import type { Request, Response, NextFunction } from "express";
import { auditService, type AuditContext, type AuditEventOptions } from "../services/audit/audit-service";
import type { EventCategory, AuditOutcome } from "../../shared/rbac-schema";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface AuditMiddlewareOptions {
  /** Event category for this route group */
  category?: EventCategory;

  /** Skip logging for certain paths */
  skipPaths?: string[];

  /** Skip logging for certain methods */
  skipMethods?: string[];

  /** Include request body in metadata (be careful with sensitive data) */
  includeBody?: boolean;

  /** Include response body in metadata */
  includeResponse?: boolean;

  /** Custom event type generator */
  getEventType?: (req: Request, res: Response) => string;

  /** Custom resource extractor */
  getResource?: (req: Request) => { type?: string; id?: string; name?: string };
}

// ============================================================================
// Request ID Middleware
// ============================================================================

/**
 * Attach unique request ID to each request.
 * Used for correlating logs and audit events.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.get("x-request-id") || randomUUID();
  (req as any).requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

// ============================================================================
// Audit Middleware
// ============================================================================

/**
 * Create audit logging middleware.
 *
 * @example
 * // Log all admin API calls
 * app.use("/api/admin", auditMiddleware({ category: "admin" }));
 *
 * @example
 * // Log with custom resource extraction
 * router.use(auditMiddleware({
 *   category: "data",
 *   getResource: (req) => ({
 *     type: "feature_flag",
 *     id: req.params.key,
 *   }),
 * }));
 */
export function auditMiddleware(options: AuditMiddlewareOptions = {}) {
  const skipPaths = new Set(options.skipPaths || ["/health", "/api/health", "/api/auth/status"]);
  const skipMethods = new Set(options.skipMethods || ["OPTIONS", "HEAD"]);

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip certain paths/methods
    if (skipPaths.has(req.path) || skipMethods.has(req.method)) {
      return next();
    }

    const startTime = Date.now();
    const context = auditService.contextFromRequest(req);
    context.requestId = (req as any).requestId || randomUUID();

    // Capture original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseBody: any;

    // Override response methods to capture body
    if (options.includeResponse) {
      res.json = function (body: any) {
        responseBody = body;
        return originalJson(body);
      };

      res.send = function (body: any) {
        if (typeof body === "string") {
          try {
            responseBody = JSON.parse(body);
          } catch {
            responseBody = body;
          }
        } else {
          responseBody = body;
        }
        return originalSend(body);
      };
    }

    // Log on response finish
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const outcome = getOutcome(res.statusCode);

      // Determine event type
      const eventType =
        options.getEventType?.(req, res) || generateEventType(req);

      // Extract resource info
      const resource = options.getResource?.(req) || extractResource(req);

      // Build metadata
      const metadata: Record<string, unknown> = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
      };

      if (options.includeBody && req.body && Object.keys(req.body).length > 0) {
        metadata.requestBody = sanitizeBody(req.body);
      }

      if (options.includeResponse && responseBody) {
        metadata.responseBody = sanitizeBody(responseBody);
      }

      // Log asynchronously
      auditService.log(context, {
        eventType,
        eventCategory: options.category || inferCategory(req.path),
        action: inferAction(req.method),
        outcome,
        resourceType: resource.type,
        resourceId: resource.id,
        resourceName: resource.name,
        metadata,
        errorCode: outcome !== "success" ? `HTTP_${res.statusCode}` : undefined,
        errorMessage:
          outcome !== "success" && responseBody?.error
            ? responseBody.error
            : undefined,
      });
    });

    next();
  };
}

// ============================================================================
// Declarative Audit Decorator
// ============================================================================

/**
 * Create a route handler wrapper that logs specific audit events.
 *
 * @example
 * router.post("/", withAudit({
 *   eventType: "feature_flag.create",
 *   category: "data",
 *   getResource: (req) => ({ type: "feature_flag", id: req.body.key }),
 * }), async (req, res) => {
 *   // handler
 * });
 */
export function withAudit(options: {
  eventType: string;
  category: EventCategory;
  action?: string;
  getResource?: (req: Request, body?: any) => { type?: string; id?: string; name?: string };
  getPreviousState?: (req: Request) => Promise<Record<string, unknown> | undefined>;
}) {
  return (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<any>
  ) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const context = auditService.contextFromRequest(req);
      const previousState = await options.getPreviousState?.(req);

      try {
        const result = await handler(req, res, next);

        // Only log if handler completed successfully (didn't throw)
        if (!res.headersSent) {
          const resource = options.getResource?.(req, result) || {};

          await auditService.log(context, {
            eventType: options.eventType,
            eventCategory: options.category,
            action: options.action || inferAction(req.method),
            outcome: "success",
            resourceType: resource.type,
            resourceId: resource.id,
            resourceName: resource.name,
            previousState,
            newState: result,
          });
        }

        return result;
      } catch (error: any) {
        const resource = options.getResource?.(req) || {};

        await auditService.log(context, {
          eventType: options.eventType,
          eventCategory: options.category,
          action: options.action || inferAction(req.method),
          outcome: "failure",
          resourceType: resource.type,
          resourceId: resource.id,
          errorCode: error.code || "UNKNOWN",
          errorMessage: error.message,
        });

        throw error;
      }
    };
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getOutcome(statusCode: number): AuditOutcome {
  if (statusCode >= 200 && statusCode < 300) return "success";
  if (statusCode === 403) return "denied";
  return "failure";
}

function generateEventType(req: Request): string {
  // Extract resource from path: /api/admin/users/:id -> admin.users
  const pathParts = req.path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((p) => p && !p.startsWith(":") && !/^\d+$/.test(p) && !/^[0-9a-f-]{36}$/i.test(p));

  const resource = pathParts.join(".");
  const action = inferAction(req.method);

  return `${resource}.${action}`;
}

function extractResource(req: Request): { type?: string; id?: string; name?: string } {
  const pathParts = req.path.split("/").filter(Boolean);
  const apiIndex = pathParts.indexOf("api");

  // Find resource type and ID from path
  let type: string | undefined;
  let id: string | undefined;

  for (let i = apiIndex + 1; i < pathParts.length; i++) {
    const part = pathParts[i];

    // Check if it looks like an ID (number or UUID)
    if (/^\d+$/.test(part) || /^[0-9a-f-]{36}$/i.test(part)) {
      id = part;
    } else if (!["admin", "site"].includes(part)) {
      type = part;
    }
  }

  return { type, id };
}

function inferCategory(path: string): EventCategory {
  if (path.includes("/auth")) return "auth";
  if (path.includes("/admin")) return "admin";
  if (path.includes("/security")) return "security";
  return "data";
}

function inferAction(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "read";
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== "object") return body;

  const sensitiveFields = [
    "password",
    "passwordHash",
    "secret",
    "token",
    "apiKey",
    "accessToken",
    "refreshToken",
    "authorization",
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}
