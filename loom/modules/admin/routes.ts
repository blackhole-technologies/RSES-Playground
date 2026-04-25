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
  createInviteCode,
  deleteInviteCode,
  getSettings,
  listInviteCodes,
  updateSettings,
} from "./service";
import { createDrizzleFeatureFlagStorage } from "../../engines/feature-flags/storage";
import type { FeatureFlag } from "../../vendor/02-feature-flags/src/shared-types";
import type { DbHandle } from "../../core/db";

/**
 * PATCH /flags/:key body. Mirror of the subset of vendor's
 * FeatureFlag fields admins can edit. Loose validation on the JSONB
 * blobs (percentageRollout / targetingRules / dependencies) — vendor's
 * evaluator normalizes them at read time, so junk entries surface as
 * runtime errors rather than DB corruption. Tighten when admin UI
 * grows form-side editors that need stronger feedback.
 */
const UpdateFlagInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    category: z.string().min(1).optional(),
    globallyEnabled: z.boolean().optional(),
    toggleable: z.boolean().optional(),
    defaultState: z.boolean().optional(),
    percentageRollout: z.unknown().optional(),
    targetingRules: z.unknown().optional(),
    dependencies: z.unknown().optional(),
    tags: z.array(z.string()).optional(),
    owner: z.string().optional(),
    sunsetDate: z.string().optional(),
  })
  .refine(
    (input) => Object.values(input).some((v) => v !== undefined),
    { message: "at least one field must be provided" },
  );

export function createAdminRouter(handle: DbHandle): Router {
  const flagStorage = createDrizzleFeatureFlagStorage(handle);
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

  router.get("/flags", async (_req, res, next) => {
    try {
      const flags = await flagStorage.getAll();
      res.json({ flags });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/flags/:key", async (req, res, next) => {
    try {
      const parsed = UpdateFlagInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          issues: parsed.error.issues,
        });
        return;
      }
      // The Zod schema validates shape; the cast lets storage.update
      // accept the validated object as Partial<FeatureFlag>. Vendor's
      // unknown-typed JSONB fields make a perfect type alignment hard
      // here; the validation has already paid the safety cost.
      const updated = await flagStorage.update(
        req.params.key,
        parsed.data as Partial<FeatureFlag>,
      );
      if (!updated) {
        res.status(404).json({ error: "flag_not_found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get("/invite-codes", async (_req, res, next) => {
    try {
      const codes = await listInviteCodes(handle);
      res.json({ inviteCodes: codes });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invite-codes", async (req, res, next) => {
    try {
      // requireAuth guarantees req.user is set; the admin's id is the
      // creator on record. created_by FK cascades on user delete.
      const code = await createInviteCode(handle, req.user!.id, req.body);
      res.status(201).json(code);
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

  router.delete("/invite-codes/:code", async (req, res, next) => {
    try {
      const removed = await deleteInviteCode(handle, req.params.code);
      if (!removed) {
        res.status(404).json({ error: "invite_code_not_found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
