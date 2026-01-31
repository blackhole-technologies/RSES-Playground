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
const securityMiddleware = createSecurityMiddleware({
  maxBodySize: 1024 * 1024, // 1MB
  maxConfigSize: 512 * 1024, // 512KB
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100,
  enableCsrf: process.env.NODE_ENV === "production",
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

      // Register kernel shutdown with process signals
      const originalShutdown = () => {
        serverLog.info("Shutting down kernel...");
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
