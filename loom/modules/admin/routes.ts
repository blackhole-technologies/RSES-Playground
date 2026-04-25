/**
 * Admin module routes. Phase 2 commit 3 exposes /api/admin/settings
 * (GET + PATCH). Future commits will extend this router with /flags
 * and /invite-codes.
 *
 * The router applies [requireAuth, requireAdmin] at the top so every
 * sub-route gets the same gate without restating it. Order matters —
 * requireAuth populates req.user from the cookie, requireAdmin then
 * checks req.user.isAdmin. Mounting admin without that pair would
 * silently expose private endpoints.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth/middleware";
import {
  getSettings,
  updateSettings,
} from "./service";
import type { DbHandle } from "../../core/db";

export function createAdminRouter(handle: DbHandle): Router {
  const router = Router();

  router.use(requireAuth, requireAdmin);

  router.get("/settings", async (_req, res, next) => {
    try {
      const settings = await getSettings(handle);
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/settings", async (req, res, next) => {
    try {
      const updated = await updateSettings(handle, req.body);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: "invalid_request",
          issues: err.issues,
        });
        return;
      }
      next(err);
    }
  });

  return router;
}
