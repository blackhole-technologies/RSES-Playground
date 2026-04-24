/**
 * @file index.ts
 * @description Authentication Module for RSES CMS Kernel.
 *
 * This is a CORE tier module that provides user authentication services.
 * It wraps the existing Passport.js-based authentication system and exposes
 * it through the kernel's module interface.
 *
 * @module modules/auth
 * @tier core
 * @phase Phase 1 - Foundation Infrastructure
 * @created 2026-02-01
 *
 * @architecture
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                      AUTH MODULE                                     │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
 * │  │  AuthService     │  │  Session Mgmt    │  │   Middleware    │   │
 * │  │  - login         │  │  - createSession │  │   - requireAuth │   │
 * │  │  - logout        │  │  - destroySession│  │   - requireAdmin│   │
 * │  │  - register      │  │  - validateSession│ │   - optionalAuth│   │
 * │  │  - validateUser  │  └──────────────────┘  └─────────────────┘   │
 * │  └──────────────────┘                                               │
 * │                                                                      │
 * │  Events Emitted:                                                     │
 * │  - auth:login       - User logged in                                │
 * │  - auth:logout      - User logged out                               │
 * │  - auth:register    - New user registered                           │
 * │  - auth:failed      - Authentication attempt failed                 │
 * │                                                                      │
 * │  Services Registered:                                                │
 * │  - AuthService      - Main authentication service                   │
 * │  - AuthMiddleware   - Express middleware functions                  │
 * │                                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 */

import { Router, type Request, type Response, type NextFunction, type Express } from "express";
import passport from "passport";
import { z } from "zod";
import type {
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
  IEventBus,
} from "../../kernel/types";

// Import existing auth implementations
import {
  hashPassword,
  verifyPassword,
  createUser,
  findUserByUsername,
  findUserById,
  toSafeUser,
  configurePassport,
  updateLastLogin,
} from "../../auth/passport";
import {
  createSessionMiddleware,
  requireAuth,
  requireAdmin,
  optionalAuth,
  type SessionConfig,
} from "../../auth/session";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and dashes"
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
  email: z.string().email("Invalid email address").optional(),
  displayName: z
    .string()
    .max(100, "Display name must be less than 100 characters")
    .optional(),
});

// =============================================================================
// AUTH SERVICE
// =============================================================================

/**
 * Authentication service providing user management and auth operations.
 *
 * This service is registered in the DI container and can be resolved by
 * other modules that need to perform authentication operations.
 */
export class AuthService {
  private events: IEventBus;
  private loginAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();

  constructor(events: IEventBus) {
    this.events = events;
  }

  /**
   * Hash a password for storage.
   */
  async hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  /**
   * Verify a password against a stored hash.
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return verifyPassword(password, storedHash);
  }

  /**
   * Find a user by username.
   */
  async findUserByUsername(username: string) {
    return findUserByUsername(username);
  }

  /**
   * Find a user by ID.
   */
  async findUserById(id: number) {
    return findUserById(id);
  }

  /**
   * Create a new user.
   */
  async createUser(
    username: string,
    password: string,
    email?: string,
    displayName?: string
  ) {
    const user = await createUser(username, password, email, displayName);

    // Emit registration event
    await this.events.emit("auth:register", {
      userId: user.id,
      username: user.username,
    });

    return user;
  }

  /**
   * Convert a user object to a safe representation (without password).
   */
  toSafeUser(user: any) {
    return toSafeUser(user);
  }

  /**
   * Update user's last login timestamp.
   */
  async updateLastLogin(userId: number) {
    return updateLastLogin(userId);
  }

  /**
   * Record a login event.
   */
  async recordLogin(userId: number, username: string) {
    await this.events.emit("auth:login", {
      userId,
      username,
      timestamp: new Date(),
    });
  }

  /**
   * Record a logout event.
   */
  async recordLogout(userId: number, username: string) {
    await this.events.emit("auth:logout", {
      userId,
      username,
      timestamp: new Date(),
    });
  }

  /**
   * Record a failed authentication attempt.
   */
  async recordFailedAttempt(username: string, reason: string) {
    await this.events.emit("auth:failed", {
      username,
      reason,
      timestamp: new Date(),
    });

    // Track failed attempts for rate limiting
    const key = username.toLowerCase();
    const existing = this.loginAttempts.get(key);
    if (existing) {
      existing.count++;
      existing.lastAttempt = new Date();
    } else {
      this.loginAttempts.set(key, { count: 1, lastAttempt: new Date() });
    }
  }

  /**
   * Check if a user is rate limited due to failed attempts.
   */
  isRateLimited(username: string): boolean {
    const key = username.toLowerCase();
    const attempts = this.loginAttempts.get(key);
    if (!attempts) return false;

    // Reset after 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (attempts.lastAttempt < fifteenMinutesAgo) {
      this.loginAttempts.delete(key);
      return false;
    }

    // Rate limit after 5 failed attempts
    return attempts.count >= 5;
  }

  /**
   * Clear rate limiting for a user (e.g., after successful login).
   */
  clearRateLimit(username: string): void {
    this.loginAttempts.delete(username.toLowerCase());
  }
}

// =============================================================================
// AUTH MIDDLEWARE SERVICE
// =============================================================================

/**
 * Collection of auth middleware functions for use by other modules.
 */
export class AuthMiddleware {
  /**
   * Middleware to require authentication.
   */
  requireAuth = requireAuth;

  /**
   * Middleware to require admin privileges.
   */
  requireAdmin = requireAdmin;

  /**
   * Optional auth middleware - processes auth but doesn't require it.
   */
  optionalAuth = optionalAuth;
}

// =============================================================================
// AUTH MODULE
// =============================================================================

/**
 * Authentication Module - Core tier module for user authentication.
 *
 * This module provides:
 * - User registration and login
 * - Session management
 * - Authentication middleware
 * - Password hashing and verification
 *
 * @example
 * ```typescript
 * // Other modules can resolve auth services
 * const authService = container.resolve<AuthService>("AuthService");
 * const user = await authService.findUserById(123);
 *
 * // Use middleware on routes
 * const authMiddleware = container.resolve<AuthMiddleware>("AuthMiddleware");
 * router.get("/protected", authMiddleware.requireAuth, handler);
 * ```
 */
export class AuthModule implements IModule {
  public readonly manifest: ModuleManifest = {
    id: "auth",
    name: "Authentication",
    version: "1.0.0",
    description:
      "Core authentication module providing user login, registration, and session management",
    tier: "core",
    author: {
      name: "RSES Team",
      email: "team@rses.dev",
    },
    license: "MIT",
    dependencies: [], // No dependencies - this is a foundational module
    permissions: [
      {
        capability: "user:read",
        level: "elevated",
        reason: "Read user data for authentication",
      },
      {
        capability: "user:write",
        level: "elevated",
        reason: "Create and update user accounts",
      },
      {
        capability: "session:manage",
        level: "elevated",
        reason: "Manage user sessions",
      },
    ],
    configSchema: z.object({
      sessionSecret: z.string().optional(),
      sessionMaxAge: z.number().optional(),
      secureCookies: z.boolean().optional(),
    }),
    exports: ["AuthService", "AuthMiddleware"],
    events: {
      emits: ["auth:login", "auth:logout", "auth:register", "auth:failed"],
      listens: [],
    },
    tags: ["authentication", "security", "core"],
  };

  private context: ModuleContext | null = null;
  private authService: AuthService | null = null;
  private authMiddleware: AuthMiddleware | null = null;
  private sessionConfigured = false;

  /**
   * Initialize the auth module.
   *
   * Sets up Passport, session middleware, and registers services.
   */
  async initialize(context: ModuleContext): Promise<void> {
    this.context = context;
    const { logger, container, events, router, app, config } = context;

    logger.info("Initializing auth module");

    // Create services
    this.authService = new AuthService(events);
    this.authMiddleware = new AuthMiddleware();

    // Register services in DI container
    container.registerSingleton("AuthService", this.authService, "auth");
    container.registerSingleton("AuthMiddleware", this.authMiddleware, "auth");

    // Configure Passport (only once)
    configurePassport();

    // Check if session is already configured by the main server
    // (when running in integration mode with existing server/index.ts)
    const skipSessionSetup = config._skipSessionSetup === true;

    if (!skipSessionSetup && !this.sessionConfigured) {
      // Set up session middleware on the main app
      const sessionConfig: Partial<SessionConfig> = {};
      if (config.sessionSecret) {
        sessionConfig.secret = config.sessionSecret as string;
      }
      if (config.sessionMaxAge) {
        sessionConfig.maxAge = config.sessionMaxAge as number;
      }
      if (config.secureCookies !== undefined) {
        sessionConfig.secure = config.secureCookies as boolean;
      }

      this.setupSessionOnApp(app, sessionConfig);
      this.sessionConfigured = true;
      logger.debug("Session middleware configured by auth module");
    } else {
      logger.debug("Session middleware already configured, skipping setup");
    }

    // Mount auth routes on the module router
    // These will be available at /api/modules/auth/*
    this.setupRoutes(router, logger);

    logger.info("Auth module initialized");
  }

  /**
   * Set up session middleware on the Express app.
   */
  private setupSessionOnApp(app: Express, config: Partial<SessionConfig>): void {
    const secret = process.env.SESSION_SECRET || config.secret;

    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }

    const sessionMiddleware = createSessionMiddleware({
      secret: secret || "rses-dev-secret-change-in-production",
      ...config,
    });

    app.use(sessionMiddleware);
    app.use(passport.initialize());
    app.use(passport.session());
  }

  /**
   * Set up authentication routes.
   */
  private setupRoutes(router: Router, logger: any): void {
    // POST /login
    router.post("/login", (req: Request, res: Response, next: NextFunction) => {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation failed",
          message: validation.error.errors[0].message,
          code: "E_VALIDATION",
        });
      }

      const { username } = validation.data;

      // Check rate limiting
      if (this.authService?.isRateLimited(username)) {
        return res.status(429).json({
          error: "Too many attempts",
          message: "Too many failed login attempts. Please try again later.",
          code: "E_RATE_LIMITED",
        });
      }

      passport.authenticate(
        "local",
        (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
          if (err) {
            return next(err);
          }

          if (!user) {
            this.authService?.recordFailedAttempt(username, info?.message || "Invalid credentials");
            return res.status(401).json({
              error: "Authentication failed",
              message: info?.message || "Invalid credentials",
              code: "E_AUTH_FAILED",
            });
          }

          req.logIn(user, (loginErr) => {
            if (loginErr) {
              return next(loginErr);
            }

            // Clear rate limiting on successful login
            this.authService?.clearRateLimit(username);

            // Record login event
            this.authService?.recordLogin((user as any).id, (user as any).username);

            return res.json({
              success: true,
              user,
              message: "Login successful",
            });
          });
        }
      )(req, res, next);
    });

    // POST /logout
    router.post("/logout", (req: Request, res: Response, next: NextFunction) => {
      const user = req.user as any;

      req.logout((err) => {
        if (err) {
          return next(err);
        }

        // Record logout event
        if (user) {
          this.authService?.recordLogout(user.id, user.username);
        }

        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            logger.error({ err: destroyErr }, "Session destruction failed");
          }

          res.clearCookie("rses.sid");

          return res.json({
            success: true,
            message: "Logout successful",
          });
        });
      });
    });

    // POST /register
    router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
      try {
        const validation = registerSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Validation failed",
            message: validation.error.errors[0].message,
            code: "E_VALIDATION",
          });
        }

        const { username, password, email, displayName } = validation.data;

        // Check if username already exists
        const existingUser = await this.authService?.findUserByUsername(username);
        if (existingUser) {
          return res.status(409).json({
            error: "Conflict",
            message: "Username already exists",
            code: "E_USER_EXISTS",
          });
        }

        // Create user
        const user = await this.authService?.createUser(username, password, email, displayName);

        // Auto-login after registration
        req.logIn(user as Express.User, (loginErr) => {
          if (loginErr) {
            return next(loginErr);
          }

          return res.status(201).json({
            success: true,
            user,
            message: "Registration successful",
          });
        });
      } catch (error) {
        next(error);
      }
    });

    // GET /me
    router.get("/me", (req: Request, res: Response) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({
          error: "Not authenticated",
          message: "Please log in to access this resource",
          code: "E_NOT_AUTHENTICATED",
        });
      }

      return res.json({
        authenticated: true,
        user: req.user,
      });
    });

    // GET /status
    router.get("/status", (req: Request, res: Response) => {
      return res.json({
        authenticated: req.isAuthenticated?.() || false,
        user: req.user || null,
      });
    });
  }

  /**
   * Start the module (no background processes needed).
   */
  async start(): Promise<void> {
    this.context?.logger.info("Auth module started");
  }

  /**
   * Stop the module.
   */
  async stop(): Promise<void> {
    this.context?.logger.info("Auth module stopped");
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this.authService = null;
    this.authMiddleware = null;
    this.context = null;
  }

  /**
   * Health check for the auth module.
   */
  async healthCheck(): Promise<ModuleHealth> {
    // Basic health check - verify we can access the database
    try {
      // Just verify the service exists
      if (!this.authService) {
        return {
          status: "unhealthy",
          message: "AuthService not initialized",
        };
      }

      return {
        status: "healthy",
        message: "Authentication module operational",
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      };
    }
  }
}

// Default export for module auto-loading
export default AuthModule;
