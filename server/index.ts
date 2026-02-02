import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import passport from "passport";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { createSecurityMiddleware, generateCsrfToken, csrfProtection } from "./middleware/security";
import { configurePassport } from "./auth/passport";
import { setupSession } from "./auth/session";
import authRoutes from "./auth/routes";
import { setupWebSocket } from "./ws";
import { registerHealthRoutes } from "./health";
import {
  logger,
  createModuleLogger,
  correlationMiddleware,
  requestLoggingMiddleware,
} from "./logger";
import { metricsMiddleware, registerMetricsRoute } from "./metrics";

// Kernel integration (optional - enable via ENABLE_KERNEL=true)
import { initializeKernel, getKernel } from "./kernel-integration";
import { createKernelWSBridge } from "./kernel";
import { getWSServer } from "./ws";

// Feature flags real-time updates
import { getFeatureFlagsService } from "./services/feature-flags";
import { createFeatureFlagsWSBridge } from "./services/feature-flags/ws-bridge";

// OpenAPI documentation
import openApiRoutes from "./openapi/routes";

const app = express();

// Check for SSL certificates
const certPath = path.resolve(process.cwd(), "certs/cert.pem");
const keyPath = path.resolve(process.cwd(), "certs/key.pem");
const useHttps = existsSync(certPath) && existsSync(keyPath);

const httpServer = useHttps
  ? createHttpsServer(
      {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      },
      app
    )
  : createHttpServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security middleware - applied first
// Higher rate limit in development for Vite HMR and chunk loading
const isDev = process.env.NODE_ENV !== "production";
const securityMiddleware = createSecurityMiddleware({
  maxBodySize: 1024 * 1024, // 1MB
  maxConfigSize: 512 * 1024, // 512KB
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: isDev ? 1000 : 100, // Higher limit for dev
  enableCsrf: process.env.NODE_ENV === "production",
  rateLimitExemptPaths: ["/health", "/ready", "/@", "/node_modules", "/src"],
});

// Apply security middleware (helmet, rate limiting, path traversal, input limits)
securityMiddleware.forEach((mw) => app.use(mw));

// Correlation ID middleware for request tracing
app.use(correlationMiddleware());

// Prometheus metrics collection
app.use(metricsMiddleware());

// Structured request logging
app.use(requestLoggingMiddleware());

// Parse cookies (required for CSRF)
app.use(cookieParser());

// Generate CSRF token on first request
app.use(generateCsrfToken());

// CSRF protection for state-changing requests
app.use(csrfProtection({ enableCsrf: process.env.NODE_ENV === "production" }));

// Body parsing with size limit
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Session and authentication setup
setupSession(app);
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Health check routes (early in the chain, minimal middleware)
registerHealthRoutes(app);

// Prometheus metrics endpoint
registerMetricsRoute(app);

// Auth routes (before other routes)
app.use("/api/auth", authRoutes);

// OpenAPI documentation (Swagger UI)
app.use("/api/docs", openApiRoutes);

// ==========================================================================
// PHASE 1 FOUNDATION - MULTI-SITE INFRASTRUCTURE
// ==========================================================================
// Site context middleware provides request-scoped site isolation via AsyncLocalStorage.
// Feature flags API provides LaunchDarkly-style flag management.
// ==========================================================================

import { createSiteContextMiddleware } from "./multisite/site/site-context";
import {
  createNetworkDbAdapter,
  createShardRouterAdapter,
  createCacheServiceAdapter,
  createFeatureServiceAdapter,
  createDomainRegistryAdapter,
  createDnsProviderAdapter,
} from "./services/adapters";
import featureFlagRoutes from "./services/feature-flags/routes";
import adminSitesRoutes from "./routes/admin-sites";
import adminUsersRoutes from "./routes/admin-users";
import { DomainRouter } from "./multisite/routing/domain-router";
import {
  createTenantIsolationMiddleware,
  enforceSiteIsolation,
} from "./middleware/tenant-isolation";

// Initialize adapters for site context
const networkDb = createNetworkDbAdapter();
const shardRouter = createShardRouterAdapter();
const cacheService = createCacheServiceAdapter();
const featureService = createFeatureServiceAdapter();

// Initialize domain router for domain-to-site resolution
const domainRegistry = createDomainRegistryAdapter();
const dnsProvider = createDnsProviderAdapter();
const domainRouter = new DomainRouter(
  domainRegistry,
  dnsProvider,
  createModuleLogger("domain-router")
);

// Tenant isolation middleware for cross-site security
const tenantIsolationMiddleware = createTenantIsolationMiddleware();
const siteIsolationEnforcer = enforceSiteIsolation();

// Site context middleware - applied to all /api routes (except auth which is above)
// Extracts site ID from X-Site-ID header or resolves from hostname
// Makes site context available via getSiteContext() anywhere in the request chain
const siteContextMiddleware = createSiteContextMiddleware({
  networkDb,
  shardRouter,
  featureService,
  cacheService,
  logger: createModuleLogger("site-context"),
});

// Apply site context to API routes that need multi-site isolation
// Skip for auth routes (already mounted above) and health routes (mounted early)
app.use("/api/projects", siteContextMiddleware, tenantIsolationMiddleware, siteIsolationEnforcer);
app.use("/api/content", siteContextMiddleware, tenantIsolationMiddleware, siteIsolationEnforcer);
app.use("/api/taxonomy", siteContextMiddleware, tenantIsolationMiddleware, siteIsolationEnforcer);
app.use("/api/media", siteContextMiddleware, tenantIsolationMiddleware, siteIsolationEnforcer);
app.use("/api/rses", siteContextMiddleware, tenantIsolationMiddleware, siteIsolationEnforcer);

// Feature flags admin API routes
// Provides CRUD operations, evaluation, statistics, and rollout history
app.use("/api/admin", featureFlagRoutes);

// Sites admin API routes
// Provides multi-site management, health monitoring, and bulk operations
app.use("/api/admin/sites", adminSitesRoutes);

// Users admin API routes
// Provides user CRUD, role management, and session management
app.use("/api/admin/users", adminUsersRoutes);

// Export domain router for use by other services
export { domainRouter };

// Module logger for server operations
const serverLog = createModuleLogger("server");

/**
 * Legacy log function for backward compatibility.
 * @deprecated Use the structured logger instead: createModuleLogger(module).info(message)
 */
export function log(message: string, source = "express") {
  const moduleLogger = createModuleLogger(source);
  moduleLogger.info(message);
}

(async () => {
  // Set up WebSocket server
  setupWebSocket(httpServer, "/ws");

  // ==========================================================================
  // FEATURE FLAGS REAL-TIME UPDATES
  // ==========================================================================
  // Set up WebSocket bridge for feature flag events.
  // Clients subscribing to "feature-flags" channel will receive live updates
  // when flags are created, updated, enabled, disabled, or deleted.
  // ==========================================================================
  const wsServer = getWSServer();
  let cleanupFeatureFlagsBridge: (() => void) | null = null;
  if (wsServer) {
    const featureFlagsService = getFeatureFlagsService();
    cleanupFeatureFlagsBridge = createFeatureFlagsWSBridge(featureFlagsService, wsServer);
    serverLog.info("Feature flags WebSocket bridge activated");
  }

  await registerRoutes(httpServer, app);

  // ==========================================================================
  // KERNEL INTEGRATION (Optional)
  // ==========================================================================
  // Enable kernel-based module system via ENABLE_KERNEL=true
  // This provides:
  // - Module hot-loading and toggling
  // - Event-driven architecture
  // - Dependency injection
  // - Admin API for module management
  //
  // Module routes are mounted at /api/modules/*
  // Admin API is available at /api/kernel/*
  // ==========================================================================
  if (process.env.ENABLE_KERNEL === "true") {
    try {
      const kernel = await initializeKernel(app, {
        modulesDir: "./server/modules",
        autoLoad: true,
        skipSessionSetup: true, // Session already configured above
        moduleConfigs: {
          auth: {
            sessionSecret: process.env.SESSION_SECRET,
          },
        },
      });

      serverLog.info(
        { modulesLoaded: kernel.registry.listModules().length },
        "Kernel initialized with modules"
      );

      // Setup WebSocket bridge for real-time kernel events
      let cleanupBridge: (() => void) | null = null;
      if (wsServer) {
        cleanupBridge = createKernelWSBridge(kernel.events, wsServer);
        serverLog.info("Kernel WebSocket bridge activated");
      }

      // Register kernel shutdown with process signals
      const originalShutdown = () => {
        serverLog.info("Shutting down kernel...");
        if (cleanupBridge) {
          cleanupBridge();
        }
        if (cleanupFeatureFlagsBridge) {
          cleanupFeatureFlagsBridge();
        }
        return kernel.shutdown();
      };

      process.on("SIGTERM", async () => {
        await originalShutdown();
        process.exit(0);
      });

      process.on("SIGINT", async () => {
        await originalShutdown();
        process.exit(0);
      });
    } catch (error) {
      serverLog.error({ error }, "Failed to initialize kernel");
    }
  } else {
    // No kernel, but still register shutdown handlers for feature flags bridge
    const handleShutdown = async () => {
      serverLog.info("Shutting down...");
      if (cleanupFeatureFlagsBridge) {
        cleanupFeatureFlagsBridge();
      }
      process.exit(0);
    };

    process.on("SIGTERM", handleShutdown);
    process.on("SIGINT", handleShutdown);
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    serverLog.error(
      {
        err,
        method: req.method,
        path: req.path,
        statusCode: status,
      },
      "Unhandled error"
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const protocol = useHttps ? "https" : "http";
  httpServer.listen(port, "0.0.0.0", () => {
    serverLog.info({ port, protocol, environment: process.env.NODE_ENV || "development" }, "Server started");
  });
})();
