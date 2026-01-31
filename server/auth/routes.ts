/**
 * @file routes.ts
 * @description Authentication routes for login, logout, register, and user info.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { z } from "zod";
import { createUser, findUserByUsername, toSafeUser } from "./passport";
import { requireAuth } from "./session";
import { authLogger as log } from "../logger";

const router = Router();

// Input validation schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and dashes"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
  email: z.string().email("Invalid email address").optional(),
  displayName: z.string().max(100, "Display name must be less than 100 characters").optional(),
});

/**
 * POST /api/auth/login
 * Authenticates user with username and password.
 */
router.post("/login", (req: Request, res: Response, next: NextFunction) => {
  // Validate input
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      message: validation.error.errors[0].message,
      code: "E_VALIDATION",
    });
  }

  passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
    if (err) {
      return next(err);
    }

    if (!user) {
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

      return res.json({
        success: true,
        user,
        message: "Login successful",
      });
    });
  })(req, res, next);
});

/**
 * POST /api/auth/logout
 * Logs out the current user.
 */
router.post("/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    // Clear session
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.error({ err: destroyErr }, "Session destruction failed");
      }

      // Clear cookie
      res.clearCookie("rses.sid");

      return res.json({
        success: true,
        message: "Logout successful",
      });
    });
  });
});

/**
 * POST /api/auth/register
 * Creates a new user account.
 */
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
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
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        error: "Conflict",
        message: "Username already exists",
        code: "E_USER_EXISTS",
      });
    }

    // Create user
    const user = await createUser(username, password, email, displayName);

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

/**
 * GET /api/auth/me
 * Returns the current authenticated user.
 */
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

/**
 * GET /api/auth/status
 * Returns authentication status (useful for frontend).
 */
router.get("/status", (req: Request, res: Response) => {
  return res.json({
    authenticated: req.isAuthenticated?.() || false,
    user: req.user || null,
  });
});

export default router;
