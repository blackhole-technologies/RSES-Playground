/**
 * @file admin-users.ts
 * @description Admin routes for user management
 * @phase Phase 2 - User Management UI
 * @version 0.7.0
 * @created 2026-02-02
 * @modified 2026-02-03 - Added password complexity validation (MEDIUM-004)
 * @modified 2026-04-14 - Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Previous `router.use(requireAdmin)` is replaced by per-route
 * `protect("users:...", handler)`. Admins still bypass the permission
 * check via `user.isAdmin` in rbac-protect.ts, preserving behavior for
 * admin-only usage while enabling delegated user management via the
 * `users:*` permission set.
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { users, type SafeUser } from "@shared/schema";
import { eq, desc, ilike, or, sql, count } from "drizzle-orm";
import { hashPassword, toSafeUser } from "../auth/passport";
import { protect } from "../middleware/rbac-protect";
import { createModuleLogger } from "../logger";
import { passwordComplexitySchema, optionalPasswordComplexitySchema } from "../auth/password-validation";

const log = createModuleLogger("admin-users");
const router = Router();

// =============================================================================
// LIST USERS
// =============================================================================

/**
 * GET /api/admin/users - List all users with pagination
 */
router.get(
  "/",
  protect("users:read", async (req, res) => {
    try {
      const {
        search,
        limit = "50",
        offset = "0",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const offsetNum = parseInt(offset as string, 10);

      let query = db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      }).from(users);

      if (search && typeof search === "string") {
        query = query.where(
          or(
            ilike(users.username, `%${search}%`),
            ilike(users.email, `%${search}%`),
            ilike(users.displayName, `%${search}%`)
          )
        ) as typeof query;
      }

      const countResult = await db.select({ count: count() }).from(users);
      const total = countResult[0]?.count || 0;

      const orderDirection = sortOrder === "asc" ? sql`ASC` : sql`DESC`;
      const sortColumn = sortBy === "username" ? users.username :
                         sortBy === "email" ? users.email :
                         sortBy === "lastLoginAt" ? users.lastLoginAt :
                         users.createdAt;

      const userList = await query
        .orderBy(desc(sortColumn))
        .limit(limitNum)
        .offset(offsetNum);

      res.json({
        data: userList,
        total,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (err) {
      log.error({ err }, "Failed to list users");
      res.status(500).json({ message: "Failed to list users" });
    }
  })
);

// =============================================================================
// STATS
// =============================================================================

/**
 * GET /api/admin/users/stats/summary - Get user statistics
 *
 * Registered before the `/:id` handler so the literal path does not
 * collide with the :id param.
 */
router.get(
  "/stats/summary",
  protect("users:read", async (req, res) => {
    try {
      const totalResult = await db.select({ count: count() }).from(users);
      const adminResult = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.isAdmin, true));

      const recentResult = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.lastLoginAt} > NOW() - INTERVAL '24 hours'`);

      const weeklyResult = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.lastLoginAt} > NOW() - INTERVAL '7 days'`);

      res.json({
        totalUsers: totalResult[0]?.count || 0,
        adminUsers: adminResult[0]?.count || 0,
        activeToday: recentResult[0]?.count || 0,
        activeThisWeek: weeklyResult[0]?.count || 0,
      });
    } catch (err) {
      log.error({ err }, "Failed to get user stats");
      res.status(500).json({ message: "Failed to get user stats" });
    }
  })
);

// =============================================================================
// GET USER
// =============================================================================

/**
 * GET /api/admin/users/:id - Get a single user
 */
router.get(
  "/:id",
  protect("users:read", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const result = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          displayName: users.displayName,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(result[0]);
    } catch (err) {
      log.error({ err, id: String(req.params.id) }, "Failed to get user");
      res.status(500).json({ message: "Failed to get user" });
    }
  })
);

// =============================================================================
// CREATE USER
// =============================================================================

const createUserSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and dashes"),
  password: passwordComplexitySchema,
  email: z.string().email("Invalid email address").optional().nullable(),
  displayName: z.string().max(100, "Display name must be less than 100 characters").optional().nullable(),
  isAdmin: z.boolean().optional().default(false),
});

/**
 * POST /api/admin/users - Create a new user
 */
router.post(
  "/",
  protect("users:create", async (req, res) => {
    try {
      const validation = createUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0].message,
          field: validation.error.errors[0].path.join("."),
        });
      }

      const { username, password, email, displayName, isAdmin } = validation.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ message: "Username already exists" });
      }

      if (email) {
        const existingEmail = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingEmail.length > 0) {
          return res.status(409).json({ message: "Email already in use" });
        }
      }

      const passwordHash = await hashPassword(password);
      const result = await db
        .insert(users)
        .values({
          username,
          passwordHash,
          email: email || null,
          displayName: displayName || null,
          isAdmin,
        })
        .returning();

      const user = result[0];
      log.info({ userId: user.id, username }, "User created by admin");

      res.status(201).json(toSafeUser(user));
    } catch (err) {
      log.error({ err }, "Failed to create user");
      res.status(500).json({ message: "Failed to create user" });
    }
  })
);

// =============================================================================
// UPDATE USER
// =============================================================================

const updateUserSchema = z.object({
  email: z.string().email("Invalid email address").optional().nullable(),
  displayName: z.string().max(100, "Display name must be less than 100 characters").optional().nullable(),
  isAdmin: z.boolean().optional(),
  password: optionalPasswordComplexitySchema,
});

/**
 * PATCH /api/admin/users/:id - Update a user
 */
router.patch(
  "/:id",
  protect("users:update", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const validation = updateUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0].message,
          field: validation.error.errors[0].path.join("."),
        });
      }

      const { email, displayName, isAdmin, password } = validation.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check email uniqueness if changing. Drizzle's eq() doesn't accept
      // a nullable RHS for nullable columns; narrow to non-null first.
      if (email !== undefined && email !== null) {
        const existingEmail = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingEmail.length > 0 && existingEmail[0].id !== id) {
          return res.status(409).json({ message: "Email already in use" });
        }
      }

      const updates: Record<string, any> = {};
      if (email !== undefined) updates.email = email;
      if (displayName !== undefined) updates.displayName = displayName;
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;
      if (password) updates.passwordHash = await hashPassword(password);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const result = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();

      log.info({ userId: id }, "User updated by admin");

      res.json(toSafeUser(result[0]));
    } catch (err) {
      log.error({ err, id: String(req.params.id) }, "Failed to update user");
      res.status(500).json({ message: "Failed to update user" });
    }
  })
);

// =============================================================================
// DELETE USER
// =============================================================================

/**
 * DELETE /api/admin/users/:id - Delete a user
 */
router.delete(
  "/:id",
  protect("users:delete", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Prevent self-deletion
      const currentUserId = (req as any).user?.id;
      if (currentUserId === id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const existing = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      await db.delete(users).where(eq(users.id, id));

      log.info({ userId: id, username: existing[0].username }, "User deleted by admin");

      res.json({ message: "User deleted" });
    } catch (err) {
      log.error({ err, id: String(req.params.id) }, "Failed to delete user");
      res.status(500).json({ message: "Failed to delete user" });
    }
  })
);

// =============================================================================
// TOGGLE ADMIN STATUS
// =============================================================================

/**
 * POST /api/admin/users/:id/toggle-admin - Toggle admin status
 */
router.post(
  "/:id/toggle-admin",
  protect("users:manage", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Prevent self-demotion
      const currentUserId = (req as any).user?.id;
      if (currentUserId === id) {
        return res.status(400).json({ message: "Cannot change your own admin status" });
      }

      const existing = await db
        .select({ id: users.id, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const newStatus = !existing[0].isAdmin;

      const result = await db
        .update(users)
        .set({ isAdmin: newStatus })
        .where(eq(users.id, id))
        .returning();

      log.info({ userId: id, isAdmin: newStatus }, "User admin status toggled");

      res.json(toSafeUser(result[0]));
    } catch (err) {
      log.error({ err, id: String(req.params.id) }, "Failed to toggle admin status");
      res.status(500).json({ message: "Failed to toggle admin status" });
    }
  })
);

// =============================================================================
// RESET PASSWORD
// =============================================================================

const resetPasswordSchema = z.object({
  password: passwordComplexitySchema,
});

/**
 * POST /api/admin/users/:id/reset-password - Reset user password
 */
router.post(
  "/:id/reset-password",
  protect("users:manage", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0].message,
        });
      }

      const { password } = validation.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const passwordHash = await hashPassword(password);
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, id));

      log.info({ userId: id }, "User password reset by admin");

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      log.error({ err, id: String(req.params.id) }, "Failed to reset password");
      res.status(500).json({ message: "Failed to reset password" });
    }
  })
);

export default router;
