/**
 * @file automation.ts
 * @description REST API routes for the automation engine.
 * @phase Phase 10 - Remote Automation
 * @created 2026-02-05
 *
 * Provides endpoints for managing workflows, executions,
 * triggers, connectors, and monitoring.
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Previous auth pattern was mixed:
 *   - router.use(requireAuth)  → all routes require a session
 *   - requireAdmin on POST /workflows → only admins can register workflows
 *
 * The marker migration preserves both levels:
 *   - Read / execute routes use `authRoute(...)` (any authenticated user).
 *   - POST /workflows uses `protect("automation:create", ...)` so admins
 *     still bypass and the forward-referenced key denies non-admins.
 *
 * TODO: Define `automation:{read,create,update,delete}` permissions in
 * the RBAC seed migration. Once they exist, read/execute routes should
 * be upgraded from `authRoute()` to `protect("automation:read")` etc.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getUserId } from "../auth/session";
import { authRoute, protect } from "../middleware/rbac-protect";
import { createModuleLogger } from "../logger";
import { validateBody } from "../middleware/validate";
import { getWorkflowEngine } from "../services/automation/workflow-engine";
import { getTriggerRegistry } from "../services/automation/trigger-system";
import { getAutomationMonitor } from "../services/automation/monitoring";
import { getConnectorRegistry } from "../services/automation/integration-connectors";

const log = createModuleLogger("automation-api");
const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const executeWorkflowSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

const monitoringHistoryQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// =============================================================================
// WORKFLOWS
// =============================================================================

/**
 * GET /workflows
 * Lists all registered workflows.
 */
router.get(
  "/workflows",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getWorkflowEngine();
      if (!engine) {
        return res.status(503).json({ error: "Workflow engine not available" });
      }

      const workflows = engine.listWorkflows();
      return res.json({ workflows });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /workflows/:workflowId
 * Gets a single workflow by ID.
 */
router.get(
  "/workflows/:workflowId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getWorkflowEngine();
      if (!engine) {
        return res.status(503).json({ error: "Workflow engine not available" });
      }

      const workflow = engine.getWorkflow(String(req.params.workflowId));
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      return res.json({ workflow });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /workflows
 * Registers a new workflow. Admin-only (forward-referenced permission
 * `automation:create` denies non-admins; admins bypass via user.isAdmin).
 */
router.post(
  "/workflows",
  protect("automation:create", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getWorkflowEngine();
      if (!engine) {
        return res.status(503).json({ error: "Workflow engine not available" });
      }

      engine.registerWorkflow(req.body);
      return res.status(201).json({ success: true, workflowId: req.body.id });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /workflows/:workflowId/execute
 * Starts a manual workflow execution.
 */
router.post(
  "/workflows/:workflowId/execute",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getWorkflowEngine();
      if (!engine) {
        return res.status(503).json({ error: "Workflow engine not available" });
      }

      const userId = getUserId(req);
      const execution = await engine.startExecution(String(req.params.workflowId), {
        type: "manual" as any,
        payload: req.body,
        triggeredBy: userId,
      } as any);

      return res.status(202).json({ execution });
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// EXECUTIONS
// =============================================================================

/**
 * GET /executions/:executionId
 * Gets execution status by ID.
 */
router.get(
  "/executions/:executionId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const engine = getWorkflowEngine();
      if (!engine) {
        return res.status(503).json({ error: "Workflow engine not available" });
      }

      const execution = engine.getExecution(String(req.params.executionId));
      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      return res.json({ execution });
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// TRIGGERS
// =============================================================================

/**
 * GET /triggers
 * Lists triggers, optionally filtered by workflowId.
 */
router.get(
  "/triggers",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const registry = getTriggerRegistry();
      if (!registry) {
        return res.status(503).json({ error: "Trigger registry not available" });
      }

      const workflowId = req.query.workflowId as string | undefined;
      const triggers = workflowId
        ? registry.getWorkflowTriggers(workflowId)
        : [];

      return res.json({ triggers });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /triggers/:triggerId
 * Gets a single trigger by ID.
 */
router.get(
  "/triggers/:triggerId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const registry = getTriggerRegistry();
      if (!registry) {
        return res.status(503).json({ error: "Trigger registry not available" });
      }

      const trigger = registry.getTrigger(String(req.params.triggerId));
      if (!trigger) {
        return res.status(404).json({ error: "Trigger not found" });
      }

      return res.json({ trigger });
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// CONNECTORS
// =============================================================================

/**
 * GET /connectors
 * Lists all integration connectors.
 */
router.get(
  "/connectors",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectorRegistry = getConnectorRegistry();
      if (!connectorRegistry) {
        return res.status(503).json({ error: "Connector registry not available" });
      }

      const connectors = connectorRegistry.listConnectors();
      return res.json({ connectors });
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// MONITORING
// =============================================================================

/**
 * GET /monitoring/stats
 * Gets automation system statistics.
 */
router.get(
  "/monitoring/stats",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const monitor = getAutomationMonitor();
      if (!monitor) {
        return res.status(503).json({ error: "Automation monitor not available" });
      }

      const stats = monitor.getStats();
      return res.json({ stats });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /monitoring/alerts
 * Gets currently active alerts.
 */
router.get(
  "/monitoring/alerts",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const monitor = getAutomationMonitor();
      if (!monitor) {
        return res.status(503).json({ error: "Automation monitor not available" });
      }

      const alerts = monitor.getActiveAlerts();
      return res.json({ alerts });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /monitoring/history
 * Gets run history with pagination.
 * Query params: limit (1-100, default 20), offset (min 0, default 0)
 */
router.get(
  "/monitoring/history",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const monitor = getAutomationMonitor();
      if (!monitor) {
        return res.status(503).json({ error: "Automation monitor not available" });
      }

      const parsed = monitoringHistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid query parameters", details: parsed.error.format() });
      }

      const { limit, offset } = parsed.data;
      const history = monitor.getRunHistory(limit, offset);
      return res.json({ history, limit, offset });
    } catch (err) {
      next(err);
    }
  })
);

export default router;
