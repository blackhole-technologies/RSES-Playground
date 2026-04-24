/**
 * @file gateway.ts
 * @description API Gateway for the RSES CMS Kernel.
 *
 * The API Gateway is the single entry point for all HTTP requests to the CMS.
 * It provides:
 *
 * 1. **Route Management** - Central registry of all API routes
 * 2. **Authentication** - Enforces auth requirements per route
 * 3. **Rate Limiting** - Protects against abuse
 * 4. **API Versioning** - Supports multiple API versions
 * 5. **Documentation** - Generates OpenAPI specifications
 *
 * ## Architecture
 *
 * ```
 *                 ┌────────────────────────────────────────┐
 *                 │              API Gateway               │
 *                 ├────────────────────────────────────────┤
 *                 │                                        │
 *   Request ──────►  Rate Limiter ──► Auth ──► Router ────► Module
 *                 │                                        │
 *                 │  ┌──────────────────────────────────┐  │
 *                 │  │         Route Registry           │  │
 *                 │  │  /v1/messages → messaging        │  │
 *                 │  │  /v1/users → auth                │  │
 *                 │  │  /v1/content → content           │  │
 *                 │  └──────────────────────────────────┘  │
 *                 │                                        │
 *                 └────────────────────────────────────────┘
 * ```
 *
 * ## Route Registration
 *
 * Modules register their routes through the gateway:
 *
 * ```typescript
 * gateway.registerRoute({
 *   method: "GET",
 *   path: "/v1/messages/:channelId",
 *   moduleId: "messaging",
 *   auth: { required: true },
 *   rateLimit: { maxRequests: 100, windowSeconds: 60 }
 * });
 * ```
 *
 * @module kernel/gateway
 * @phase Phase 1 - Foundation Infrastructure
 * @author Systems Analyst Agent
 * @created 2026-02-01
 */

import express, { Express, Request, Response, NextFunction, Router } from "express";
import { createModuleLogger } from "../logger";
import type {
  IApiGateway,
  GatewayRoute,
  RateLimitConfig,
  AuthRequirement,
  IEventBus,
} from "./types";

const log = createModuleLogger("api-gateway");

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default rate limit configuration.
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  perUser: false,
};

/**
 * Events emitted by the gateway.
 */
export const GATEWAY_EVENTS = {
  ROUTE_REGISTERED: "gateway:route:registered",
  ROUTE_UNREGISTERED: "gateway:route:unregistered",
  RATE_LIMITED: "gateway:rate-limited",
  AUTH_FAILED: "gateway:auth-failed",
} as const;

// =============================================================================
// RATE LIMITER
// =============================================================================
//
// The rate limiter implementation lives in ./rate-limiter.ts as a swappable
// backend. The gateway picks in-memory (default) or Redis-backed (when
// REDIS_URL is set) at construction time via createRateLimiter().
//
// See server/kernel/rate-limiter.ts for the backend interface, the two
// implementations, and the factory's degradation rules.

import {
  createRateLimiter,
  InMemoryRateLimiter,
  type RateLimiterBackend,
} from "./rate-limiter";

// =============================================================================
// API GATEWAY IMPLEMENTATION
// =============================================================================

/**
 * API Gateway - Central routing and request handling.
 *
 * @description Manages all API routes, enforces authentication,
 * and applies rate limiting.
 *
 * ## Features
 *
 * 1. **Route Registry**: Central list of all routes for documentation
 * 2. **Auth Enforcement**: Validates tokens and permissions
 * 3. **Rate Limiting**: Protects against abuse
 * 4. **OpenAPI Generation**: Auto-generates API documentation
 * 5. **Module Isolation**: Routes are namespaced by module
 *
 * ## Usage
 *
 * ```typescript
 * const gateway = new ApiGateway(events);
 *
 * // Register a route
 * gateway.registerRoute({
 *   method: "GET",
 *   path: "/v1/users/:id",
 *   moduleId: "auth",
 *   auth: { required: true, roles: ["admin"] },
 *   description: "Get user by ID"
 * });
 *
 * // Get Express middleware
 * app.use(gateway.middleware());
 *
 * // Generate OpenAPI spec
 * const spec = gateway.generateOpenApiSpec();
 * ```
 */
export class ApiGateway implements IApiGateway {
  // =========================================================================
  // PRIVATE FIELDS
  // =========================================================================

  /**
   * Registered routes by path and method.
   */
  private routes = new Map<string, GatewayRoute>();

  /**
   * Event bus for gateway events.
   */
  private events: IEventBus;

  /**
   * Rate limiter backend. Starts as in-memory, can be upgraded to a
   * distributed Redis backend by calling enableRedisRateLimiter() during
   * bootstrap before the gateway starts handling traffic.
   */
  private rateLimiter: RateLimiterBackend = new InMemoryRateLimiter();

  /**
   * Express app for the gateway.
   */
  private app: Express;

  /**
   * Cleanup interval for rate limiter.
   */
  private cleanupInterval: NodeJS.Timeout | null = null;

  // =========================================================================
  // CONSTRUCTOR
  // =========================================================================

  /**
   * Create a new ApiGateway.
   *
   * @param events - Event bus for gateway events
   *
   * @example
   * ```typescript
   * const gateway = new ApiGateway(events);
   * app.use(gateway.middleware());
   * ```
   */
  constructor(events: IEventBus) {
    this.events = events;
    this.app = express();

    // Setup middleware
    this.setupMiddleware();

    // Start cleanup interval. Only the in-memory backend needs periodic
    // pruning; Redis handles its own expiration. The cleanup() call is a
    // no-op when the backend doesn't implement it.
    this.cleanupInterval = setInterval(
      () => this.rateLimiter.cleanup?.(),
      60000 // Every minute
    );

    log.info("API Gateway initialized");
  }

  /**
   * Setup gateway middleware.
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: "10mb" }));

    // CORS headers - explicit origins only
    const allowedOrigins = this.getAllowedOrigins();
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;

      // Only set CORS headers if origin is in allowed list
      if (origin && allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
      }

      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Site-ID"
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );

      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }

      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      log.debug(
        { method: req.method, path: req.path },
        "Gateway request"
      );
      next();
    });
  }

  /**
   * Get allowed CORS origins from environment.
   *
   * @returns Array of allowed origin URLs
   *
   * In production: requires explicit ALLOWED_ORIGINS env var
   * In development: defaults to localhost on common ports
   */
  private getAllowedOrigins(): string[] {
    const envOrigins = process.env.ALLOWED_ORIGINS;

    if (envOrigins) {
      // Parse comma-separated list from env
      return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
    }

    // Development defaults - localhost only
    if (process.env.NODE_ENV !== "production") {
      return [
        "https://localhost:5000",
        "https://localhost:5173",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://localhost:3000",
      ];
    }

    // Production with no ALLOWED_ORIGINS = no CORS (same-origin only)
    log.warn("No ALLOWED_ORIGINS configured - CORS disabled for cross-origin requests");
    return [];
  }

  // =========================================================================
  // ROUTE REGISTRATION
  // =========================================================================

  /**
   * Register a route with the gateway.
   *
   * @description Adds a route to the registry. The route configuration
   * includes metadata for authentication, rate limiting, and documentation.
   *
   * Routes are identified by the combination of method and path.
   * Registering the same route twice will overwrite the previous one.
   *
   * @param route - Route configuration
   *
   * @example
   * ```typescript
   * // Public read endpoint
   * gateway.registerRoute({
   *   method: "GET",
   *   path: "/v1/content/:id",
   *   moduleId: "content",
   *   auth: { required: false },
   *   description: "Get content by ID",
   *   tags: ["content"]
   * });
   *
   * // Protected write endpoint with rate limiting
   * gateway.registerRoute({
   *   method: "POST",
   *   path: "/v1/messages",
   *   moduleId: "messaging",
   *   auth: {
   *     required: true,
   *     roles: ["user"],
   *     permissions: ["messaging:send"]
   *   },
   *   rateLimit: {
   *     maxRequests: 30,
   *     windowSeconds: 60,
   *     perUser: true
   *   },
   *   description: "Send a message",
   *   tags: ["messaging"]
   * });
   * ```
   */
  registerRoute(route: GatewayRoute): void {
    const key = this.routeKey(route.method, route.path);

    // Store route metadata
    this.routes.set(key, route);

    // Emit event
    this.events.emit(GATEWAY_EVENTS.ROUTE_REGISTERED, {
      method: route.method,
      path: route.path,
      moduleId: route.moduleId,
    });

    log.debug(
      { method: route.method, path: route.path, moduleId: route.moduleId },
      "Route registered"
    );
  }

  /**
   * Unregister all routes for a module.
   *
   * @description Removes all routes that were registered by a specific module.
   * Called when a module is disabled or unloaded.
   *
   * @param moduleId - The module whose routes to remove
   *
   * @example
   * ```typescript
   * // When disabling a module
   * gateway.unregisterModuleRoutes("messaging");
   * ```
   */
  unregisterModuleRoutes(moduleId: string): void {
    const toRemove: string[] = [];

    for (const [key, route] of this.routes) {
      if (route.moduleId === moduleId) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.routes.delete(key);
      this.events.emit(GATEWAY_EVENTS.ROUTE_UNREGISTERED, {
        key,
        moduleId,
      });
    }

    log.info(
      { moduleId, count: toRemove.length },
      "Module routes unregistered"
    );
  }

  /**
   * Generate a unique key for a route.
   */
  private routeKey(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }

  // =========================================================================
  // ROUTE QUERIES
  // =========================================================================

  /**
   * Get all registered routes.
   *
   * @returns Array of route configurations
   *
   * @example
   * ```typescript
   * const routes = gateway.getRoutes();
   * console.log(`${routes.length} routes registered`);
   * ```
   */
  getRoutes(): GatewayRoute[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get routes for a specific module.
   *
   * @param moduleId - The module ID
   * @returns Array of routes for that module
   *
   * @example
   * ```typescript
   * const messagingRoutes = gateway.getModuleRoutes("messaging");
   * ```
   */
  getModuleRoutes(moduleId: string): GatewayRoute[] {
    return Array.from(this.routes.values()).filter(
      (route) => route.moduleId === moduleId
    );
  }

  /**
   * Find a route by method and path.
   *
   * @description Matches exact paths and patterns (e.g., /users/:id).
   *
   * @param method - HTTP method
   * @param path - Request path
   * @returns The matching route or undefined
   */
  findRoute(method: string, path: string): GatewayRoute | undefined {
    // Try exact match first
    const exactKey = this.routeKey(method, path);
    const exact = this.routes.get(exactKey);
    if (exact) return exact;

    // Try pattern matching
    for (const route of this.routes.values()) {
      if (route.method.toUpperCase() !== method.toUpperCase()) continue;

      if (this.matchPath(path, route.path)) {
        return route;
      }
    }

    return undefined;
  }

  /**
   * Check if a request path matches a route pattern.
   *
   * @description Handles Express-style patterns like /users/:id
   */
  private matchPath(requestPath: string, routePattern: string): boolean {
    // Convert pattern to regex
    // /users/:id -> /users/[^/]+
    const regexPattern = routePattern
      .replace(/:[^/]+/g, "[^/]+")
      .replace(/\//g, "\\/");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(requestPath);
  }

  // =========================================================================
  // MIDDLEWARE
  // =========================================================================

  /**
   * Get gateway middleware for Express.
   *
   * @description Returns an Express app that handles:
   * - Rate limiting
   * - Authentication
   * - Request routing
   *
   * Mount this middleware in your main Express app.
   *
   * @returns Express app configured as middleware
   *
   * @example
   * ```typescript
   * const app = express();
   * const gateway = new ApiGateway(events);
   *
   * // Mount gateway at /api
   * app.use("/api", gateway.middleware());
   * ```
   */
  middleware(): Express {
    // Add rate limiting middleware. handleRateLimit is async (the Redis
    // backend's check() is a real network call); we forward any
    // unexpected rejection to express's error pipeline via next(err).
    // The backend itself never throws on transport errors — it fails
    // open — so this catch is purely a defense against bugs in the
    // limiter implementation.
    this.app.use((req, res, next) => {
      this.handleRateLimit(req, res, next).catch(next);
    });

    // Add auth middleware
    this.app.use((req, res, next) => {
      this.handleAuth(req, res, next);
    });

    return this.app;
  }

  /**
   * Handle rate limiting. Async because the Redis backend's check() is
   * a real network call. Express handles async handlers natively as long
   * as we either await or call next(err) on rejection.
   */
  private async handleRateLimit(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const route = this.findRoute(req.method, req.path);
    if (!route || !route.rateLimit) {
      return next();
    }

    // Get rate limit key
    const config = route.rateLimit;
    let key: string;

    if (config.perUser && (req as any).user?.id) {
      key = `user:${(req as any).user.id}:${route.path}`;
    } else {
      key = `ip:${req.ip}:${route.path}`;
    }

    // Check rate limit. The backend's check() never throws — it fails open
    // on Redis errors and returns allowed:true so a Redis outage does not
    // take down the API surface. See rate-limiter.ts for the rationale.
    const result = await this.rateLimiter.check(key, config);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", result.resetAt.toISOString());

    if (!result.allowed) {
      this.events.emit(GATEWAY_EVENTS.RATE_LIMITED, {
        key,
        path: route.path,
        resetAt: result.resetAt,
        backend: this.rateLimiter.backendName,
      });

      log.warn(
        { key, path: route.path, backend: this.rateLimiter.backendName },
        "Rate limit exceeded"
      );

      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil(
          (result.resetAt.getTime() - Date.now()) / 1000
        ),
      });
      return;
    }

    next();
  }

  /**
   * Upgrade the rate limiter from in-memory to a Redis-backed backend.
   * Call once during bootstrap before the gateway starts handling traffic.
   * Idempotent — calling twice closes the previous backend first.
   *
   * @example
   *   await gateway.enableRedisRateLimiter({ redisUrl: process.env.REDIS_URL });
   */
  async enableRedisRateLimiter(options: {
    redisUrl?: string;
    redisKeyPrefix?: string;
  }): Promise<void> {
    if (!options.redisUrl) {
      log.info("enableRedisRateLimiter called without a redisUrl; keeping in-memory backend");
      return;
    }
    const next = await createRateLimiter(options);
    if (next.backendName === this.rateLimiter.backendName) return;
    const previous = this.rateLimiter;
    this.rateLimiter = next;
    await previous.close().catch((err) => {
      log.warn({ err }, "Failed to close previous rate limiter backend");
    });
    log.info({ backend: next.backendName }, "Rate limiter backend swapped");
  }

  /**
   * Handle authentication.
   */
  private handleAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const route = this.findRoute(req.method, req.path);
    if (!route || !route.auth || !route.auth.required) {
      return next();
    }

    const auth = route.auth;
    const user = (req as any).user;

    // Check if authenticated
    if (!user) {
      this.emitAuthFailed(req, route, "No user in request");
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    // Check roles
    if (auth.roles && auth.roles.length > 0) {
      const hasRole = auth.roles.some((role) =>
        user.roles?.includes(role)
      );

      if (!hasRole) {
        this.emitAuthFailed(req, route, "Missing required role");
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this resource",
        });
        return;
      }
    }

    // Check permissions
    if (auth.permissions && auth.permissions.length > 0) {
      const hasAllPermissions = auth.permissions.every((perm) =>
        user.permissions?.includes(perm)
      );

      if (!hasAllPermissions) {
        this.emitAuthFailed(req, route, "Missing required permission");
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this resource",
        });
        return;
      }
    }

    // Check OAuth scopes
    if (auth.scopes && auth.scopes.length > 0) {
      const hasAllScopes = auth.scopes.every((scope) =>
        user.scopes?.includes(scope)
      );

      if (!hasAllScopes) {
        this.emitAuthFailed(req, route, "Missing required OAuth scope");
        res.status(403).json({
          error: "Forbidden",
          message: "Insufficient OAuth scope",
        });
        return;
      }
    }

    next();
  }

  /**
   * Emit auth failed event.
   */
  private emitAuthFailed(
    req: Request,
    route: GatewayRoute,
    reason: string
  ): void {
    this.events.emit(GATEWAY_EVENTS.AUTH_FAILED, {
      method: req.method,
      path: req.path,
      userId: (req as any).user?.id,
      reason,
    });

    log.warn(
      { method: req.method, path: req.path, reason },
      "Authentication failed"
    );
  }

  // =========================================================================
  // OPENAPI GENERATION
  // =========================================================================

  /**
   * Generate OpenAPI 3.0 specification.
   *
   * @description Creates a complete OpenAPI spec from registered routes.
   * Useful for API documentation, client generation, and testing.
   *
   * @returns OpenAPI 3.0 spec as JSON object
   *
   * @example
   * ```typescript
   * const spec = gateway.generateOpenApiSpec();
   *
   * // Serve as JSON
   * app.get("/openapi.json", (req, res) => {
   *   res.json(spec);
   * });
   *
   * // Use with Swagger UI
   * app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
   * ```
   */
  generateOpenApiSpec(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const route of this.routes.values()) {
      const pathItem = paths[route.path] || {};
      const method = route.method.toLowerCase();

      // Build operation
      const operation: Record<string, unknown> = {
        summary: route.description || `${route.method} ${route.path}`,
        tags: route.tags || [route.moduleId],
        operationId: this.generateOperationId(route),
        responses: {
          "200": {
            description: "Successful response",
          },
          "400": {
            description: "Bad request",
          },
          "401": {
            description: "Unauthorized",
          },
          "403": {
            description: "Forbidden",
          },
          "404": {
            description: "Not found",
          },
          "429": {
            description: "Too many requests",
          },
          "500": {
            description: "Internal server error",
          },
        },
      };

      // Add security if auth required
      if (route.auth?.required) {
        operation.security = [{ bearerAuth: [] }];
      }

      // Add path parameters
      const params = this.extractPathParams(route.path);
      if (params.length > 0) {
        operation.parameters = params.map((name) => ({
          name,
          in: "path",
          required: true,
          schema: { type: "string" },
        }));
      }

      pathItem[method] = operation;
      paths[route.path] = pathItem;
    }

    return {
      openapi: "3.0.0",
      info: {
        title: "RSES CMS API",
        version: "1.0.0",
        description:
          "API for the RSES Content Management System. " +
          "This API provides access to content, messaging, and system management.",
      },
      servers: [
        {
          url: "/api",
          description: "API server",
        },
      ],
      paths,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: this.generateTags(),
    };
  }

  /**
   * Generate operation ID from route.
   */
  private generateOperationId(route: GatewayRoute): string {
    const method = route.method.toLowerCase();
    const path = route.path
      .replace(/^\/v[0-9]+/, "") // Remove version prefix
      .replace(/\/:([^/]+)/g, "By$1") // :id -> ById
      .replace(/\//g, "_") // / -> _
      .replace(/^_/, ""); // Remove leading _

    return `${method}_${route.moduleId}_${path}`;
  }

  /**
   * Extract path parameter names.
   */
  private extractPathParams(path: string): string[] {
    const params: string[] = [];
    const regex = /:([^/]+)/g;
    let match;

    while ((match = regex.exec(path)) !== null) {
      params.push(match[1]);
    }

    return params;
  }

  /**
   * Generate tags from registered routes.
   */
  private generateTags(): Array<{ name: string; description: string }> {
    const moduleIds = new Set<string>();

    for (const route of this.routes.values()) {
      moduleIds.add(route.moduleId);
    }

    return Array.from(moduleIds).map((id) => ({
      name: id,
      description: `Operations for the ${id} module`,
    }));
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Dispose the gateway.
   *
   * @description Cleans up resources. Call during shutdown.
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.routes.clear();
    log.info("API Gateway disposed");
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new API gateway.
 *
 * @param events - Event bus for gateway events
 * @returns A new ApiGateway instance
 *
 * @example
 * ```typescript
 * import { createApiGateway } from "./kernel/gateway";
 *
 * const gateway = createApiGateway(events);
 * app.use("/api", gateway.middleware());
 * ```
 */
export function createApiGateway(events: IEventBus): IApiGateway {
  return new ApiGateway(events);
}
