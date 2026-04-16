/**
 * @file messaging.ts
 * @description REST API routes for the messaging and meeting system.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @created 2026-02-05
 * @modified 2026-04-14 - Migrated to fail-closed RBAC marker pattern (ROADMAP M1.7)
 *
 * Provides endpoints for channels, messages, threads, pins, reactions,
 * search, DMs, and video meetings.
 *
 * # Auth model
 *
 * Messaging is a per-user collaboration surface: every authenticated
 * user needs access to participate. There is no admin gate. The
 * previous `router.use(requireAuth)` is replaced by per-handler
 * `authRoute(...)` markers — the same auth posture, expressed as a
 * fail-closed lint-checkable marker.
 *
 * The prior `validateBody(schema)` middleware layer was folded into
 * each handler as an inline `safeParse(req.body)` because the marker
 * must be the outermost callable in the route signature. The 400
 * response shape is preserved exactly via the local `zodErrorResponse`
 * helper — this is behavior-preserving.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { getUserId, getUserName } from "../auth/session";
import { authRoute } from "../middleware/rbac-protect";
import {
  createChannelSchema,
  updateChannelSchema,
  sendMessageSchema,
  updateMessageSchema,
  messageReactionSchema,
  messageSearchFiltersSchema,
  scheduleMeetingSchema,
  updateMeetingSchema,
} from "@shared/messaging/schemas";
import { getMessagingService, getMeetingService } from "../services/messaging";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("messaging-api");
const router = Router();

/**
 * Format a ZodError the same way the shared `validateBody` middleware
 * did — behavior-preserving so existing clients see the same error
 * shape.
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
// CHANNEL ROUTES
// =============================================================================

/**
 * POST /channels
 * Create a new channel
 */
router.post(
  "/channels",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createChannelSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.createChannel(parsed.data, getUserId(req));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /channels
 * List channels for a workspace
 */
router.get(
  "/channels",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const query = z.object({
        workspaceId: z.string().uuid(),
      }).parse(req.query);

      const userId = getUserId(req);
      const result = await service.getWorkspaceChannels(query.workspaceId, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /channels/:channelId
 * Get a single channel
 */
router.get(
  "/channels/:channelId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.getChannel(String(req.params.channelId));
      if (!result) return res.status(404).json({ error: "Channel not found" });

      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * PATCH /channels/:channelId
 * Update a channel
 */
router.patch(
  "/channels/:channelId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateChannelSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));
      // Preserve the original validateBody behavior of replacing req.body
      // so service call-sites retain their `any` parameter typing.
      req.body = parsed.data;

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      const result = await service.updateChannel(String(req.params.channelId), req.body, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /channels/:channelId
 * Delete a channel
 */
router.delete(
  "/channels/:channelId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      await service.deleteChannel(String(req.params.channelId), userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /channels/:channelId/archive
 * Archive a channel
 */
router.post(
  "/channels/:channelId/archive",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      const result = await service.archiveChannel(String(req.params.channelId), userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// CHANNEL MEMBER ROUTES
// =============================================================================

/**
 * GET /channels/:channelId/members
 * List members of a channel
 */
router.get(
  "/channels/:channelId/members",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.getChannelMembers(String(req.params.channelId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /channels/:channelId/members
 * Add a member to a channel
 */
router.post(
  "/channels/:channelId/members",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ userId: z.string().uuid(), role: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));
      req.body = parsed.data;

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.addChannelMember(
        String(req.params.channelId),
        req.body.userId,
        (req.body.role || "member") as any,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /channels/:channelId/members/:userId
 * Remove a member from a channel
 */
router.delete(
  "/channels/:channelId/members/:userId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const requestingUserId = getUserId(req);
      await service.removeChannelMember(String(req.params.channelId), String(req.params.userId), requestingUserId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// MESSAGE ROUTES
// =============================================================================

/**
 * POST /messages
 * Send a new message
 */
router.post(
  "/messages",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.sendMessage(parsed.data, getUserId(req), getUserName(req));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /channels/:channelId/messages
 * Get messages for a channel with cursor-based pagination
 */
router.get(
  "/channels/:channelId/messages",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const query = z.object({
        before: z.string().optional(),
        after: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
      }).parse(req.query);

      const result = await service.getChannelMessages(
        String(req.params.channelId),
        {
          limit: query.limit,
          before: query.before,
          after: query.after,
        },
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /messages/:messageId
 * Get a single message
 */
router.get(
  "/messages/:messageId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.getMessage(String(req.params.messageId));
      if (!result) return res.status(404).json({ error: "Message not found" });

      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * PATCH /messages/:messageId
 * Update (edit) a message
 */
router.patch(
  "/messages/:messageId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      const result = await service.updateMessage(String(req.params.messageId), parsed.data, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /messages/:messageId
 * Delete a message
 */
router.delete(
  "/messages/:messageId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      await service.deleteMessage(String(req.params.messageId), userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// THREAD ROUTES
// =============================================================================

/**
 * GET /messages/:messageId/replies
 * Get replies in a thread
 */
router.get(
  "/messages/:messageId/replies",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const query = z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
      }).parse(req.query);

      const result = await service.getThreadReplies(String(req.params.messageId), query.limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /channels/:channelId/threads
 * Get active threads in a channel
 */
router.get(
  "/channels/:channelId/threads",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      const result = await service.getChannelThreads(String(req.params.channelId), userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// PIN ROUTES
// =============================================================================

/**
 * POST /messages/:messageId/pin
 * Pin a message
 */
router.post(
  "/messages/:messageId/pin",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      await service.pinMessage(String(req.params.messageId), userId);
      res.json({ pinned: true });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /messages/:messageId/pin
 * Unpin a message
 */
router.delete(
  "/messages/:messageId/pin",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      await service.unpinMessage(String(req.params.messageId), userId);
      res.json({ pinned: false });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /channels/:channelId/pins
 * Get pinned messages in a channel
 */
router.get(
  "/channels/:channelId/pins",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.getPinnedMessages(String(req.params.channelId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// REACTION ROUTES
// =============================================================================

/**
 * POST /messages/:messageId/reactions
 * Add a reaction to a message
 */
router.post(
  "/messages/:messageId/reactions",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = messageReactionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      const result = await service.addReaction(String(req.params.messageId), parsed.data.emoji, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /messages/:messageId/reactions/:emoji
 * Remove a reaction from a message
 */
router.delete(
  "/messages/:messageId/reactions/:emoji",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      await service.removeReaction(String(req.params.messageId), String(req.params.emoji), userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// SEARCH ROUTES
// =============================================================================

/**
 * POST /search
 * Search messages
 */
router.post(
  "/search",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = messageSearchFiltersSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const userId = getUserId(req);
      // searchMessages takes (workspaceId, userId, filters). The workspaceId
      // must come from the request body's filters; if absent, the search
      // is workspace-wide for the user's default workspace (handled upstream).
      const workspaceId = String((parsed.data as any)?.workspaceId ?? "");
      const result = await service.searchMessages(workspaceId, userId, parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// DM ROUTES
// =============================================================================

/**
 * POST /dm
 * Get or create a DM channel between two users
 */
router.post(
  "/dm",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMessagingService();
      if (!service) return res.status(503).json({ error: "Messaging not available" });

      const result = await service.getOrCreateDMChannel(
        parsed.data.workspaceId,
        getUserId(req),
        parsed.data.userId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

// =============================================================================
// MEETING ROUTES
// =============================================================================

/**
 * POST /meetings
 * Schedule a new meeting
 */
router.post(
  "/meetings",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = scheduleMeetingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.scheduleMeeting(parsed.data, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /meetings
 * List meetings for a workspace
 *
 * Registered before /meetings/:meetingId so the collection path is
 * matched first.
 */
router.get(
  "/meetings",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      // Restrict status to the MeetingStatus union so the parsed value is
      // assignable to the filter type.
      const query = z.object({
        workspaceId: z.string().uuid(),
        status: z
          .enum(["scheduled", "in_progress", "ended", "cancelled"])
          .optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0),
      }).parse(req.query);

      // The service signature accepts status/fromDate/toDate/hostId but
      // not limit/offset; paginate the result here instead.
      const allMeetings = await service.getWorkspaceMeetings(query.workspaceId, {
        status: query.status,
      });
      const result = allMeetings.slice(query.offset, query.offset + query.limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /meetings/:meetingId
 * Get a single meeting
 */
router.get(
  "/meetings/:meetingId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const result = await service.getMeeting(String(req.params.meetingId));
      if (!result) return res.status(404).json({ error: "Meeting not found" });

      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * PATCH /meetings/:meetingId
 * Update a meeting
 */
router.patch(
  "/meetings/:meetingId",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateMeetingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));
      req.body = parsed.data;

      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.updateMeeting(String(req.params.meetingId), req.body, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /meetings/:meetingId/cancel
 * Cancel a meeting
 */
router.post(
  "/meetings/:meetingId/cancel",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ reason: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.cancelMeeting(String(req.params.meetingId), userId, parsed.data.reason);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /meetings/:meetingId/start
 * Start a meeting
 */
router.post(
  "/meetings/:meetingId/start",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.startMeeting(String(req.params.meetingId), userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /meetings/:meetingId/end
 * End a meeting
 */
router.post(
  "/meetings/:meetingId/end",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.endMeeting(String(req.params.meetingId), userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /meetings/:meetingId/join
 * Join a meeting
 */
router.post(
  "/meetings/:meetingId/join",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ name: z.string().max(100), password: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));

      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      const result = await service.joinMeeting(String(req.params.meetingId), userId, parsed.data.name);
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /meetings/:meetingId/leave
 * Leave a meeting
 */
router.post(
  "/meetings/:meetingId/leave",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const userId = getUserId(req);
      await service.leaveMeeting(String(req.params.meetingId), userId);
      res.json({ left: true });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /meetings/:meetingId/summary
 * Get AI-generated meeting summary
 */
router.get(
  "/meetings/:meetingId/summary",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const result = await service.getMeetingSummary(String(req.params.meetingId));
      if (!result) return res.status(404).json({ error: "Meeting summary not found" });

      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /meetings/:meetingId/action-items
 * Get action items from a meeting
 */
router.get(
  "/meetings/:meetingId/action-items",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const result = await service.getMeetingActionItems(String(req.params.meetingId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /meetings/:meetingId/recordings
 * Get recordings for a meeting
 */
router.get(
  "/meetings/:meetingId/recordings",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const result = await service.getMeetingRecordings(String(req.params.meetingId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /ice-servers
 * Get ICE server configuration for WebRTC
 */
router.get(
  "/ice-servers",
  authRoute(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = getMeetingService();
      if (!service) return res.status(503).json({ error: "Meeting service not available" });

      const result = await service.getIceServers();
      res.json(result);
    } catch (err) {
      next(err);
    }
  })
);

export default router;
