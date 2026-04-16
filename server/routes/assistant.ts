/**
 * @file assistant.ts
 * @description REST API routes for the AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 *
 * Provides endpoints for conversation sessions, task creation,
 * meeting scheduling, proactive suggestions, and assistant stats.
 *
 * # 2026-04-14: Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * All assistant routes require authentication but no specific RBAC —
 * each user operates on their own assistant state. The previous
 * `router.use(requireAuth)` is replaced by `authRoute(...)` on every
 * handler. The prior `validateBody(schema)` middleware chain was
 * folded into the handlers as inline `schema.parse(req.body)` calls so
 * the marker is the outermost callable and the lint accepts it.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { getUserId } from "../auth/session";
import { authRoute } from "../middleware/rbac-protect";
import { createModuleLogger } from "../logger";
import { getPersonalAssistant } from "../services/assistant";

const log = createModuleLogger("assistant-routes");
const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const startSessionSchema = z.object({
  context: z.record(z.unknown()).optional(),
});

const sendMessageSchema = z.object({
  text: z.string().min(1).max(10000),
});

const createTaskSchema = z.object({
  text: z.string().min(1).max(2000),
});

const scheduleMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  startTime: z.coerce.date(),
  duration: z.number().int().min(5).max(480),
  attendees: z.array(z.string()).optional(),
});

/**
 * Format a ZodError the same way the shared `validateBody` middleware
 * did, so clients see the exact same 400-response shape post-migration.
 */
function zodErrorResponse(err: ZodError) {
  return {
    error: "Validation Error",
    code: "E_VALIDATION",
    details: err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    })),
  };
}

// =============================================================================
// SESSIONS
// =============================================================================

/**
 * POST /sessions
 * Start a new conversation session.
 */
router.post(
  "/sessions",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = startSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const conversation = assistant.getConversation();
      if (!conversation) {
        return res
          .status(503)
          .json({ error: "Conversation engine not available" });
      }

      const userId = getUserId(req);
      const { context } = parsed.data;

      const session = await conversation.startSession(userId, context);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /sessions/:sessionId/messages
 * Send a message within an existing session.
 */
router.post(
  "/sessions/:sessionId/messages",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const sessionId = String(req.params.sessionId);
      const { text } = parsed.data;

      const result = await assistant.processMessage(sessionId, text);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /sessions/:sessionId
 * End a conversation session.
 */
router.delete(
  "/sessions/:sessionId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const conversation = assistant.getConversation();
      if (!conversation) {
        return res
          .status(503)
          .json({ error: "Conversation engine not available" });
      }

      const sessionId = String(req.params.sessionId);
      await conversation.endSession(sessionId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// TASKS
// =============================================================================

/**
 * POST /tasks
 * Create a task from natural language text.
 */
router.post(
  "/tasks",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const userId = getUserId(req);
      const { text } = parsed.data;

      const result = await assistant.createTask(userId, text);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// MEETINGS
// =============================================================================

/**
 * POST /meetings
 * Schedule a meeting via the calendar service.
 */
router.post(
  "/meetings",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = scheduleMeetingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const userId = getUserId(req);
      const { title, startTime, duration, attendees } = parsed.data;

      const result = await assistant.scheduleMeeting(
        userId,
        title,
        startTime,
        duration,
        attendees
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// SUGGESTIONS
// =============================================================================

/**
 * GET /suggestions
 * Retrieve proactive suggestions for the authenticated user.
 */
router.get(
  "/suggestions",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const userId = getUserId(req);
      const suggestions = await assistant.getSuggestions(userId);
      res.status(200).json(suggestions);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// STATS
// =============================================================================

/**
 * GET /stats
 * Retrieve assistant service statistics.
 */
router.get(
  "/stats",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assistant = getPersonalAssistant();
      if (!assistant) {
        return res.status(503).json({ error: "Assistant not available" });
      }

      const stats = assistant.getStats();
      res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  })
);

export default router;
