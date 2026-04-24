/**
 * @file incidents.ts
 * @description REST API routes for incident management
 * @phase Phase 4 - Intelligence Layer
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Previous pattern was `router.use(requireAuth); router.use(requireAdmin)`
 * — strict admin-only. The marker migration preserves that exactly by
 * using forward-referenced permission keys in the `incidents:*` family.
 *
 * No `incidents` resource exists in shared/rbac-schema.ts yet. That's
 * intentional: `rbacService.hasPermission` fails closed on unknown keys
 * (see rbac-service.ts:516), so `protect("incidents:read", ...)` denies
 * every non-admin user today. Admins bypass via `user.isAdmin`, matching
 * the previous `requireAdmin` behavior.
 *
 * TODO: Define the `incidents:{read,create,update,delete}` permissions
 * in the DB migration that seeds default RBAC content so operations
 * teams without global-admin can triage incidents via delegated roles.
 */

import { Router } from "express";
import { z } from "zod";
import { protect } from "../middleware/rbac-protect";
import {
  getIncidentManager,
  type IncidentSeverity,
  type IncidentStatus,
} from "../cqrs-es/incident-manager";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  severity: z.enum(["P1", "P2", "P3", "P4"]),
  service: z.string().min(1).max(100),
  alertIds: z.array(z.string()).optional(),
  escalationPolicyId: z.string().optional(),
  impactStartedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  severity: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  status: z.enum(["triggered", "acknowledged", "investigating", "identified", "monitoring", "resolved"]).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const querySchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  severity: z.union([z.string(), z.array(z.string())]).optional(),
  service: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const acknowledgeSchema = z.object({
  responderId: z.string().min(1),
  responderName: z.string().min(1),
});

const addNoteSchema = z.object({
  message: z.string().min(1).max(5000),
  actor: z.string().optional(),
});

const resolveSchema = z.object({
  resolution: z.string().optional(),
  actor: z.string().optional(),
});

const addResponderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["primary", "secondary", "observer"]),
});

const postmortemSchema = z.object({
  summary: z.string().optional(),
  impact: z.string().optional(),
  rootCause: z.string().optional(),
  timeline: z.string().optional(),
  lessonsLearned: z.array(z.string()).optional(),
  actionItems: z.array(z.object({
    id: z.string(),
    description: z.string(),
    owner: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    status: z.enum(["open", "in_progress", "completed"]),
  })).optional(),
  status: z.enum(["draft", "review", "published"]).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/incidents
 * List incidents with optional filters
 */
router.get(
  "/",
  protect("incidents:read", async (req, res) => {
    try {
      const params = querySchema.parse(req.query);
      const manager = getIncidentManager();

      const status = params.status
        ? (Array.isArray(params.status) ? params.status : [params.status]) as IncidentStatus[]
        : undefined;
      const severity = params.severity
        ? (Array.isArray(params.severity) ? params.severity : [params.severity]) as IncidentSeverity[]
        : undefined;

      const result = manager.queryIncidents({
        status,
        severity,
        service: params.service,
        startDate: params.startDate ? new Date(params.startDate) : undefined,
        endDate: params.endDate ? new Date(params.endDate) : undefined,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      });

      res.json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents
 * Create a new incident
 */
router.post(
  "/",
  protect("incidents:create", async (req, res) => {
    try {
      const data = createIncidentSchema.parse(req.body);
      const manager = getIncidentManager();

      const incident = manager.createIncident({
        ...data,
        impactStartedAt: data.impactStartedAt ? new Date(data.impactStartedAt) : undefined,
      });

      res.status(201).json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/incidents/metrics
 * Get incident metrics
 *
 * Registered before /:id so the literal /metrics path matches first.
 */
router.get(
  "/metrics",
  protect("incidents:read", async (_req, res) => {
    try {
      const manager = getIncidentManager();
      const metrics = manager.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/incidents/:id
 * Get a specific incident
 */
router.get(
  "/:id",
  protect("incidents:read", async (req, res) => {
    try {
      const manager = getIncidentManager();
      const incident = manager.getIncident(String(req.params.id));

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * PATCH /api/incidents/:id
 * Update an incident
 */
router.patch(
  "/:id",
  protect("incidents:update", async (req, res) => {
    try {
      const data = updateIncidentSchema.parse(req.body);
      const manager = getIncidentManager();
      const actor = (req as any).user?.id?.toString();

      const incident = manager.updateIncident(String(req.params.id), data, actor);

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents/:id/acknowledge
 * Acknowledge an incident
 */
router.post(
  "/:id/acknowledge",
  protect("incidents:update", async (req, res) => {
    try {
      const data = acknowledgeSchema.parse(req.body);
      const manager = getIncidentManager();

      const incident = manager.acknowledge(String(req.params.id), data.responderId, data.responderName);

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents/:id/resolve
 * Resolve an incident
 */
router.post(
  "/:id/resolve",
  protect("incidents:update", async (req, res) => {
    try {
      const data = resolveSchema.parse(req.body);
      const manager = getIncidentManager();
      const actor = data.actor ?? (req as any).user?.id?.toString();

      const incident = manager.resolve(String(req.params.id), actor, data.resolution);

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents/:id/notes
 * Add a note to an incident
 */
router.post(
  "/:id/notes",
  protect("incidents:update", async (req, res) => {
    try {
      const data = addNoteSchema.parse(req.body);
      const manager = getIncidentManager();
      const actor = data.actor ?? (req as any).user?.id?.toString();

      const incident = manager.addNote(String(req.params.id), data.message, actor);

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents/:id/responders
 * Add a responder to an incident
 */
router.post(
  "/:id/responders",
  protect("incidents:update", async (req, res) => {
    try {
      const data = addResponderSchema.parse(req.body);
      const manager = getIncidentManager();

      const incident = manager.addResponder(String(req.params.id), data);

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * POST /api/incidents/:id/postmortem
 * Create or update postmortem
 */
router.post(
  "/:id/postmortem",
  protect("incidents:update", async (req, res) => {
    try {
      const manager = getIncidentManager();
      const incident = manager.getIncident(String(req.params.id));

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      let postmortem;
      if (!incident.postmortem) {
        postmortem = manager.createPostmortem(String(req.params.id));
      } else {
        postmortem = incident.postmortem;
      }

      if (Object.keys(req.body).length > 0) {
        const data = postmortemSchema.parse(req.body);
        postmortem = manager.updatePostmortem(String(req.params.id), {
          ...data,
          actionItems: data.actionItems?.map((a) => ({
            ...a,
            dueDate: a.dueDate ? new Date(a.dueDate) : undefined,
          })),
        });
      }

      res.json(postmortem);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  })
);

/**
 * GET /api/incidents/:id/postmortem
 * Get postmortem for an incident
 */
router.get(
  "/:id/postmortem",
  protect("incidents:read", async (req, res) => {
    try {
      const manager = getIncidentManager();
      const incident = manager.getIncident(String(req.params.id));

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      if (!incident.postmortem) {
        return res.status(404).json({ error: "No postmortem exists for this incident" });
      }

      res.json(incident.postmortem);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

export default router;
