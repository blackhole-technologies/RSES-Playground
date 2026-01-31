/**
 * @file session.ts
 * @description Session management configuration for Express.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * @security Uses secure session cookies with proper flags for production.
 */

import session from "express-session";
import MemoryStore from "memorystore";
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
}

/**
 * Creates and configures session middleware.
 *
 * @param config - Session configuration
 * @returns Express session middleware
 */
export function createSessionMiddleware(config: SessionConfig) {
  const isProduction = process.env.NODE_ENV === "production";

  // Session store - use memory store for development, consider Redis for production
  const store = new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
  });

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
  // Get session secret from environment or use a default for development
  const secret = process.env.SESSION_SECRET || config?.secret;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    // Use a default for development (not secure, but convenient)
    log.warn("Using default session secret - set SESSION_SECRET in production");
  }

  const sessionMiddleware = createSessionMiddleware({
    secret: secret || "rses-dev-secret-change-in-production",
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
