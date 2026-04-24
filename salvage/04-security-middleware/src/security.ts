/**
 * @file security.ts
 * @description Security middleware for RSES-Playground.
 *              Implements CSRF protection, path traversal blocking, input limits,
 *              rate limiting, and security headers.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * @security Implements multiple layers of defense:
 *           - Helmet for security headers (XSS, clickjacking, etc.)
 *           - Rate limiting to prevent DoS attacks
 *           - Input size limits to prevent memory exhaustion
 *           - Path traversal blocking for file operations
 *           - CSRF protection for state-changing operations
 */

import { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import crypto from "crypto";

/**
 * Security configuration options.
 */
export interface SecurityConfig {
  /** Maximum request body size in bytes (default: 1MB) */
  maxBodySize: number;
  /** Maximum config content size in bytes (default: 512KB) */
  maxConfigSize: number;
  /** Rate limit window in milliseconds (default: 15 minutes) */
  rateLimitWindowMs: number;
  /** Maximum requests per window (default: 100) */
  rateLimitMax: number;
  /** Enable CSRF protection (default: true in production) */
  enableCsrf: boolean;
  /** Paths exempt from rate limiting */
  rateLimitExemptPaths: string[];
}

const defaultConfig: SecurityConfig = {
  maxBodySize: 1024 * 1024, // 1MB
  maxConfigSize: 512 * 1024, // 512KB
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100,
  enableCsrf: process.env.NODE_ENV === "production",
  rateLimitExemptPaths: ["/health", "/ready"],
};

/**
 * Dangerous path patterns that indicate path traversal attempts.
 * These patterns are blocked to prevent unauthorized file access.
 */
const DANGEROUS_PATH_PATTERNS = [
  /\.\.\//g,          // ../
  /\.\.\\/g,          // ..\
  /\.\.$/,            // ends with ..
  /^\/etc\//,         // Linux system files
  /^\/var\//,         // Linux var directory
  /^\/usr\//,         // Linux usr directory
  /^\/root\//,        // Root home directory
  /^\/home\//,        // Home directories
  /^C:\\/i,           // Windows drive
  /^\/proc\//,        // Linux proc filesystem
  /^\/sys\//,         // Linux sys filesystem
  /~\//,              // Home directory expansion
];

/**
 * Validates that a path does not contain path traversal attempts.
 * Returns true if the path is safe, false if it contains dangerous patterns.
 *
 * @param path - The path to validate
 * @returns boolean - True if path is safe
 */
export function isPathSafe(path: string): boolean {
  if (!path || typeof path !== "string") {
    return false;
  }

  // Normalize the path to catch encoded attempts
  let normalizedPath: string;
  try {
    normalizedPath = decodeURIComponent(path);
  } catch {
    // If decoding fails, the path might be malformed
    return false;
  }

  // Check against all dangerous patterns
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Zod schema for validating input sizes.
 * Used to enforce limits on config content.
 */
export const configContentSchema = z.string().max(512 * 1024, {
  message: "Config content exceeds maximum size of 512KB",
});

/**
 * Creates the Helmet middleware with security headers.
 * Configures various security headers to protect against common attacks.
 */
export function createHelmetMiddleware() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "blob:"], // React dev + Monaco
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"], // Monaco CSS
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "data:"],
        connectSrc: ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net", "https://esm.sh"], // WebSocket + Monaco CDN
        workerSrc: ["'self'", "blob:"], // Monaco web workers
        childSrc: ["'self'", "blob:"], // Monaco iframe workers
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // Prevent clickjacking
    frameguard: { action: "deny" },
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // Prevent MIME type sniffing
    noSniff: true,
    // Enable XSS filter
    xssFilter: true,
    // Referrer Policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // HSTS disabled - should be handled by reverse proxy (nginx) in production
    // Setting HSTS at app level causes issues with local development
    hsts: false,
  });
}

/**
 * Creates rate limiting middleware.
 * Limits the number of requests from a single IP address.
 */
export function createRateLimiter(config: Partial<SecurityConfig> = {}) {
  const { rateLimitWindowMs, rateLimitMax, rateLimitExemptPaths } = {
    ...defaultConfig,
    ...config,
  };

  return rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    message: {
      error: "Too many requests",
      message: "You have exceeded the rate limit. Please try again later.",
      retryAfter: Math.ceil(rateLimitWindowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Don't count failed requests (4xx/5xx) against the rate limit.
    // Prevents attackers from exhausting a user's quota with invalid requests
    // and avoids penalizing users for validation errors.
    skipFailedRequests: true,
    skip: (req) => rateLimitExemptPaths.some((p) => req.path.startsWith(p)),
    // Use default keyGenerator which handles IPv6 properly
    // Trust proxy headers for X-Forwarded-For
    validate: { xForwardedForHeader: false },
  });
}

/**
 * Middleware to block path traversal attempts in request body and query params.
 * Inspects request body for paths that could escape the project directory.
 */
export function pathTraversalBlocker() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string" && !isPathSafe(value)) {
        return res.status(400).json({
          error: "Invalid request",
          message: `Path traversal detected in query parameter '${key}'`,
          code: "E_PATH_TRAVERSAL",
        });
      }
    }

    // Check request body for common path fields
    if (req.body && typeof req.body === "object") {
      const pathFields = ["path", "filepath", "filename", "directory", "result"];
      for (const field of pathFields) {
        const value = req.body[field];
        if (typeof value === "string" && !isPathSafe(value)) {
          return res.status(400).json({
            error: "Invalid request",
            message: `Path traversal detected in field '${field}'`,
            code: "E_PATH_TRAVERSAL",
          });
        }
      }

      // Deep check for nested path values in config content
      if (req.body.content && typeof req.body.content === "string") {
        // Check for path traversal patterns in RSES config content
        const content = req.body.content;
        if (content.includes("..") && /->.*\.\./.test(content)) {
          return res.status(400).json({
            error: "Invalid request",
            message: "Path traversal pattern detected in config rule results",
            code: "E_PATH_TRAVERSAL",
          });
        }
      }
    }

    next();
  };
}

/**
 * Middleware to enforce input size limits.
 * Prevents oversized payloads from consuming server resources.
 */
export function inputSizeLimiter(config: Partial<SecurityConfig> = {}) {
  const { maxConfigSize } = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip non-JSON requests
    if (!req.is("application/json")) {
      return next();
    }

    // Check for config content field specifically
    if (req.body?.content && typeof req.body.content === "string") {
      const contentSize = Buffer.byteLength(req.body.content, "utf8");
      if (contentSize > maxConfigSize) {
        return res.status(413).json({
          error: "Payload too large",
          message: `Config content exceeds maximum size of ${maxConfigSize / 1024}KB`,
          code: "E_PAYLOAD_TOO_LARGE",
          limit: maxConfigSize,
          received: contentSize,
        });
      }
    }

    next();
  };
}

/**
 * Simple CSRF protection using double-submit cookie pattern.
 * Validates that the X-CSRF-Token header matches the csrf cookie.
 *
 * Note: This is a simplified implementation. For production with
 * authentication, consider using csurf or similar packages.
 */
export function csrfProtection(config: Partial<SecurityConfig> = {}) {
  const { enableCsrf } = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if CSRF is disabled
    if (!enableCsrf) {
      return next();
    }

    // Skip safe methods (GET, HEAD, OPTIONS)
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Skip API routes that don't modify state
    const readOnlyPaths = ["/api/engine/validate", "/api/engine/test", "/api/engine/preview"];
    if (readOnlyPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    // Check for CSRF token
    const csrfHeader = req.headers["x-csrf-token"];
    const csrfCookie = req.cookies?.csrf;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return res.status(403).json({
        error: "CSRF validation failed",
        message: "Invalid or missing CSRF token",
        code: "E_CSRF_INVALID",
      });
    }

    next();
  };
}

/**
 * Generates a CSRF token and sets it as an httpOnly cookie.
 * The token is also attached to res.locals for the initial page response
 * to deliver to the frontend (e.g., in a meta tag or JSON endpoint).
 *
 * The frontend stores the token in memory and sends it via X-CSRF-Token header.
 * The cookie is httpOnly so XSS cannot steal the token from the cookie itself.
 */
export function generateCsrfToken() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.cookies?.csrf) {
      const token = generateSecureToken(32);
      res.cookie("csrf", token, {
        httpOnly: true, // Protected from XSS - token delivered via response body instead
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      // Make token available for initial page response delivery
      res.locals.csrfToken = token;
    } else {
      res.locals.csrfToken = req.cookies.csrf;
    }
    next();
  };
}

/**
 * Endpoint handler to fetch the current CSRF token.
 * Frontend calls this once at startup to get the token for X-CSRF-Token headers.
 */
export function csrfTokenEndpoint() {
  return (req: Request, res: Response) => {
    const token = res.locals.csrfToken || req.cookies?.csrf;
    if (!token) {
      return res.status(500).json({ error: "CSRF token not available" });
    }
    res.json({ csrfToken: token });
  };
}

/**
 * Generates a cryptographically secure random token.
 *
 * @param length - Length of the token in bytes
 * @returns Hex-encoded token string
 */
function generateSecureToken(length: number): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Creates a comprehensive security middleware stack.
 * Applies all security measures in the correct order.
 *
 * @param config - Optional security configuration
 * @returns Array of middleware functions
 */
export function createSecurityMiddleware(config: Partial<SecurityConfig> = {}) {
  const mergedConfig = { ...defaultConfig, ...config };

  return [
    createHelmetMiddleware(),
    createRateLimiter(mergedConfig),
    pathTraversalBlocker(),
    inputSizeLimiter(mergedConfig),
  ];
}

/**
 * Security validation result interface.
 */
export interface SecurityValidation {
  valid: boolean;
  errors: Array<{ field: string; message: string; code: string }>;
}

/**
 * Validates a request body for security issues.
 * Returns validation result with detailed error information.
 *
 * @param body - Request body to validate
 * @returns SecurityValidation result
 */
export function validateRequestSecurity(body: unknown): SecurityValidation {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  if (!body || typeof body !== "object") {
    return { valid: true, errors: [] };
  }

  const obj = body as Record<string, unknown>;

  // Check for path traversal in common fields
  const pathFields = ["path", "filepath", "filename", "directory", "result"];
  for (const field of pathFields) {
    if (typeof obj[field] === "string" && !isPathSafe(obj[field] as string)) {
      errors.push({
        field,
        message: `Path traversal detected in ${field}`,
        code: "E_PATH_TRAVERSAL",
      });
    }
  }

  // Check config content size
  if (typeof obj.content === "string") {
    const contentSize = Buffer.byteLength(obj.content as string, "utf8");
    if (contentSize > defaultConfig.maxConfigSize) {
      errors.push({
        field: "content",
        message: `Content size ${contentSize} exceeds limit ${defaultConfig.maxConfigSize}`,
        code: "E_PAYLOAD_TOO_LARGE",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export { defaultConfig as securityDefaults };
