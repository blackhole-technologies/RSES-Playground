/**
 * @file projects.ts
 * @description API routes for project management
 * @phase Phase 6 - CMS Features
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Previous auth pattern: reads had NO authentication, writes used
 * `requireAuth`. The marker migration tightens reads to require the
 * `projects:read` permission. `projects` is already declared as a
 * ResourceType in shared/rbac-schema.ts; the DB-side permission seed
 * is tracked under M1.7-seed.
 *
 * `rbacService.hasPermission` fails closed on unknown keys, so until
 * the seed ships, admins bypass via `user.isAdmin` and non-admins are
 * denied. That is acceptable because the admin UI is the only current
 * consumer of /api/projects.
 */

import { Router } from "express";
import { z } from "zod";
import { projectStorage, activityStorage, storage } from "../storage";
import { projectsApi } from "@shared/routes";
import { scanDirectory, type ScannedProject } from "../services/project-scanner";
import { RsesParser } from "../lib/rses";
import { protect } from "../middleware/rbac-protect";
import { projectsLogger as log } from "../logger";

const router = Router();

/**
 * GET /api/projects - List all projects with pagination
 */
router.get(
  "/",
  protect("projects:read", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await projectStorage.getProjects({ page, limit });
      res.json(result);
    } catch (err) {
      log.error({ err }, "Failed to list projects");
      res.status(500).json({ message: "Failed to list projects" });
    }
  })
);

/**
 * POST /api/projects/scan - Scan directory for projects
 *
 * Registered before /:id to avoid any ambiguity on POST — although
 * Express distinguishes by method, explicit ordering keeps the
 * intent visible when reading the file top-down.
 */
router.post(
  "/scan",
  protect("projects:create", async (req, res) => {
    try {
      const input = projectsApi.scan.input.parse(req.body);

      let rsesConfig;
      if (input.configId) {
        const config = await storage.getConfig(input.configId);
        if (config) {
          const parseResult = RsesParser.parse(config.content);
          if (parseResult.valid && parseResult.parsed) {
            rsesConfig = parseResult.parsed;
          }
        }
      }

      const scanResult = await scanDirectory({
        rootPath: input.rootPath,
        maxDepth: input.maxDepth,
        rsesConfig,
      });

      const projectsToUpsert = scanResult.projects.map((p: ScannedProject) => ({
        path: p.path,
        name: p.name,
        markers: p.markers,
        classification: p.classification,
        attributes: p.attributes,
        status: "pending" as const,
        configId: input.configId,
      }));

      const savedProjects = await projectStorage.upsertProjects(projectsToUpsert);

      await activityStorage.logActivity({
        action: "projects.scanned",
        entityType: "project",
        metadata: {
          rootPath: input.rootPath,
          projectCount: savedProjects.length,
          duration: scanResult.duration,
        },
      });

      res.json({
        projects: savedProjects,
        directoriesScanned: scanResult.directoriesScanned,
        duration: scanResult.duration,
        errors: scanResult.errors,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to scan for projects");
      res.status(500).json({ message: "Failed to scan for projects" });
    }
  })
);

/**
 * POST /api/projects/bulk-link - Bulk link projects
 *
 * Registered before /:id/link so one-segment `/bulk-link` is never
 * confused with the two-segment `/:id/link` pattern.
 */
router.post(
  "/bulk-link",
  protect("projects:update", async (req, res) => {
    try {
      const input = projectsApi.bulkLink.input.parse(req.body);

      await projectStorage.bulkUpdateStatus(input.ids, "linked");

      await activityStorage.logActivity({
        action: "projects.bulk-linked",
        entityType: "project",
        metadata: { ids: input.ids, count: input.ids.length },
      });

      res.json({ updated: input.ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to bulk link projects");
      res.status(500).json({ message: "Failed to bulk link projects" });
    }
  })
);

/**
 * POST /api/projects/bulk-unlink - Bulk unlink projects
 */
router.post(
  "/bulk-unlink",
  protect("projects:update", async (req, res) => {
    try {
      const input = projectsApi.bulkUnlink.input.parse(req.body);

      await projectStorage.bulkUpdateStatus(input.ids, "unlinked");

      await activityStorage.logActivity({
        action: "projects.bulk-unlinked",
        entityType: "project",
        metadata: { ids: input.ids, count: input.ids.length },
      });

      res.json({ updated: input.ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err }, "Failed to bulk unlink projects");
      res.status(500).json({ message: "Failed to bulk unlink projects" });
    }
  })
);

/**
 * GET /api/projects/:id - Get a single project
 */
router.get(
  "/:id",
  protect("projects:read", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await projectStorage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      res.json(project);
    } catch (err) {
      log.error({ err, projectId: String(req.params.id) }, "Failed to get project");
      res.status(500).json({ message: "Failed to get project" });
    }
  })
);

/**
 * PATCH /api/projects/:id - Update a project
 */
router.patch(
  "/:id",
  protect("projects:update", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const input = projectsApi.update.input.parse(req.body);
      const project = await projectStorage.updateProject(id, input);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await activityStorage.logActivity({
        action: "project.updated",
        entityType: "project",
        entityId: id,
        metadata: { updates: Object.keys(input) },
      });

      res.json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err, projectId: String(req.params.id) }, "Failed to update project");
      res.status(500).json({ message: "Failed to update project" });
    }
  })
);

/**
 * POST /api/projects/:id/link - Link a project
 */
router.post(
  "/:id/link",
  protect("projects:update", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const input = projectsApi.link.input.parse(req.body);

      const existing = await projectStorage.getProject(id);
      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      const project = await projectStorage.updateProject(id, {
        status: "linked",
        linkPath: input.linkPath,
        linkedAt: new Date(),
      });

      await activityStorage.logActivity({
        action: "project.linked",
        entityType: "project",
        entityId: id,
        metadata: { linkPath: input.linkPath },
      });

      res.json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      log.error({ err, projectId: String(req.params.id) }, "Failed to link project");
      res.status(500).json({ message: "Failed to link project" });
    }
  })
);

/**
 * DELETE /api/projects/:id/link - Unlink a project
 */
router.delete(
  "/:id/link",
  protect("projects:update", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const existing = await projectStorage.getProject(id);
      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      const project = await projectStorage.updateProject(id, {
        status: "unlinked",
        linkPath: null,
      });

      await activityStorage.logActivity({
        action: "project.unlinked",
        entityType: "project",
        entityId: id,
      });

      res.json(project);
    } catch (err) {
      log.error({ err, projectId: String(req.params.id) }, "Failed to unlink project");
      res.status(500).json({ message: "Failed to unlink project" });
    }
  })
);

export default router;
