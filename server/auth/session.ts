/**
 * @file session.ts
 * @description Session management configuration for Express.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 * @updated 2026-02-02 - Added Redis session store support
 *
 * @security Uses secure session cookies with proper flags for production.
 * @security Redis store for production scalability and persistence.
 */

import session from "express-session";
import MemoryStore from "memorystore";
import RedisStore from "connect-redis";
import { Redis } from "ioredis";
import type { Express } from "express";
import { authLogger as log } from "../logger";

const MemoryStoreSession = MemoryStore(session);

/**
 * Session configuration options.
 */
export interface SessionConfig {
  /** Session secret (required for signing cookies) */
  secret: string;
  /** Session cookie name (default: "rses.sid") */
  cookieName?: string;
  /** Session max age in milliseconds (default: 24 hours) */
  maxAge?: number;
  /** Enable secure cookie (default: true in production) */
  secure?: boolean;
  /** Redis URL for session store (optional, uses memory store if not set) */
  redisUrl?: string;
}

/**
 * Minimum session secret length for security.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Validates the session secret meets security requirements.
 */
function validateSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters long`
    );
  }

  // Check for common insecure patterns
  const insecurePatterns = [
    "password",
    "secret",
    "123456",
    "change-me",
    "default",
    "dev-secret",
  ];

  const lowerSecret = secret.toLowerCase();
  for (const pattern of insecurePatterns) {
    if (lowerSecret.includes(pattern)) {
      throw new Error(
        `SESSION_SECRET contains insecure pattern "${pattern}". Use a cryptographically secure random string.`
      );
    }
  }
}

/**
 * Creates a Redis client with error handling.
 */
function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true,
  });

  client.on("error", (err) => {
    log.error({ err }, "Redis session store error");
  });

  client.on("connect", () => {
    log.info("Connected to Redis session store");
  });

  client.on("reconnecting", () => {
    log.warn("Reconnecting to Redis session store");
  });

  return client;
}

/**
 * Creates and configures session middleware.
 *
 * @param config - Session configuration
 * @returns Express session middleware
 */
export function createSessionMiddleware(config: SessionConfig) {
  const isProduction = process.env.NODE_ENV === "production";

  // Validate secret in production
  if (isProduction) {
    validateSecret(config.secret);
  }

  // Select session store based on Redis availability
  let store: session.Store;

  if (config.redisUrl) {
    // Use Redis store for production/scalability
    const redisClient = createRedisClient(config.redisUrl);
    store = new RedisStore({
      client: redisClient,
      prefix: "rses:session:",
      ttl: Math.floor((config.maxAge || 24 * 60 * 60 * 1000) / 1000), // TTL in seconds
    });
    log.info("Using Redis session store");
  } else {
    // Use memory store for development
    store = new MemoryStoreSession({
      checkPeriod: 86400000, // prune expired entries every 24h
    });

    if (isProduction) {
      log.warn(
        "Using in-memory session store in production. Set REDIS_URL for persistence and scalability."
      );
    } else {
      log.info("Using in-memory session store (development mode)");
    }
  }

  return session({
    name: config.cookieName || "rses.sid",
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true, // Prevent XSS access to cookie
      secure: config.secure ?? isProduction, // HTTPS only in production
      sameSite: "strict", // CSRF protection
      maxAge: config.maxAge || 24 * 60 * 60 * 1000, // 24 hours default
    },
  });
}

/**
 * Sets up session middleware on Express app.
 *
 * @param app - Express application
 * @param config - Optional session configuration
 */
export function setupSession(app: Express, config?: Partial<SessionConfig>): void {
  const isProduction = process.env.NODE_ENV === "production";

  // Get session secret from environment or config
  const secret = process.env.SESSION_SECRET || config?.secret;

  if (!secret) {
    if (isProduction) {
      throw new Error(
        "SESSION_SECRET environment variable is required in production. " +
          `Use a cryptographically secure random string of at least ${MIN_SECRET_LENGTH} characters. ` +
          "Generate one with: openssl rand -base64 48"
      );
    }
    // Use a default for development (not secure, but convenient)
    log.warn(
      "Using default session secret - set SESSION_SECRET environment variable for production"
    );
  }

  // Get Redis URL from environment
  const redisUrl = process.env.REDIS_URL || config?.redisUrl;

  const sessionMiddleware = createSessionMiddleware({
    secret: secret || "rses-development-only-secret-not-for-production-use",
    redisUrl,
    ...config,
  });

  app.use(sessionMiddleware);
}

/**
 * Middleware to require authentication.
 * Use this on routes that need protection.
 */
export function requireAuth(req: any, res: any, next: any): void {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // Return 401 for API routes
  if (req.path.startsWith("/api")) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please log in to access this resource",
      code: "E_AUTH_REQUIRED",
    });
  }

  // Redirect to login for non-API routes
  res.redirect("/login");
}

/**
 * Middleware to require admin privileges.
 * Use this on routes that need admin access.
 */
export function requireAdmin(req: any, res: any, next: any): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    if (req.path.startsWith("/api")) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource",
        code: "E_AUTH_REQUIRED",
      });
    }
    return res.redirect("/login");
  }

  if (!req.user?.isAdmin) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Admin privileges required",
      code: "E_ADMIN_REQUIRED",
    });
  }

  next();
}

/**
 * Optional auth middleware - attaches user to request if authenticated,
 * but doesn't require it. Use for routes that behave differently for
 * authenticated vs anonymous users.
 */
export function optionalAuth(req: any, res: any, next: any): void {
  // User is already attached by passport if authenticated
  next();
}
