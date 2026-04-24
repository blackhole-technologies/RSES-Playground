/**
 * @file schemas.ts
 * @description Zod validation schemas for messaging system.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 */

import { z } from "zod";

// =============================================================================
// PRESENCE SCHEMAS
// =============================================================================

export const presenceStatusSchema = z.enum([
  "online",
  "away",
  "busy",
  "dnd",
  "offline",
]);

export const activityTypeSchema = z.enum([
  "typing",
  "viewing",
  "in_call",
  "screen_sharing",
  "recording",
  "idle",
]);

export const customStatusSchema = z.object({
  emoji: z.string().optional(),
  text: z.string().max(100).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const userPresenceInfoSchema = z.object({
  userId: z.string().uuid(),
  status: presenceStatusSchema,
  activity: activityTypeSchema.optional(),
  activityDetails: z.string().max(200).optional(),
  lastSeen: z.coerce.date(),
  customStatus: customStatusSchema.optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "web"]).optional(),
});

// =============================================================================
// CHANNEL SCHEMAS
// =============================================================================

export const channelTypeSchema = z.enum([
  "public",
  "private",
  "direct",
  "group_dm",
  "voice",
  "broadcast",
]);

export const channelVisibilitySchema = z.enum(["visible", "hidden", "archived"]);

export const channelMemberRoleSchema = z.enum(["owner", "admin", "member", "guest"]);

export const channelMemberSchema = z.object({
  userId: z.string().uuid(),
  role: channelMemberRoleSchema,
  joinedAt: z.coerce.date(),
  nickname: z.string().max(50).optional(),
  notificationPreference: z.enum(["all", "mentions", "none"]).default("all"),
  muted: z.boolean().default(false),
  mutedUntil: z.coerce.date().optional(),
  lastRead: z.coerce.date().optional(),
  lastReadMessageId: z.string().uuid().optional(),
});

export const channelConfigSchema = z.object({
  allowThreads: z.boolean().default(true),
  allowReactions: z.boolean().default(true),
  allowFileSharing: z.boolean().default(true),
  allowVoiceMessages: z.boolean().default(true),
  retentionDays: z.number().int().positive().optional(),
  maxFileSize: z.number().int().positive().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  slowMode: z.number().int().min(0).max(86400).optional(),
  readOnly: z.boolean().default(false),
  encryptionEnabled: z.boolean().default(false),
});

export const createChannelSchema = z.object({
  workspaceId: z.string().uuid(),
  type: channelTypeSchema,
  name: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/i, "Invalid channel name"),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
  config: channelConfigSchema.partial().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/i).optional(),
  description: z.string().max(500).optional(),
  topic: z.string().max(250).optional(),
  icon: z.string().url().optional(),
  visibility: channelVisibilitySchema.optional(),
  config: channelConfigSchema.partial().optional(),
});

// =============================================================================
// MESSAGE SCHEMAS
// =============================================================================

export const messageContentTypeSchema = z.enum([
  "text",
  "file",
  "image",
  "video",
  "audio",
  "voice",
  "code",
  "embed",
  "poll",
  "system",
  "call",
  "meeting_link",
]);

export const messageBlockTypeSchema = z.enum([
  "text",
  "code",
  "quote",
  "list",
  "divider",
  "header",
  "image",
  "file",
  "mention",
  "emoji",
  "link",
]);

export const messageBlockSchema = z.object({
  type: messageBlockTypeSchema,
  content: z.string().optional(),
  language: z.string().max(50).optional(),
  url: z.string().url().optional(),
  userId: z.string().uuid().optional(),
  items: z.array(z.string()).optional(),
  ordered: z.boolean().optional(),
  level: z.number().int().min(1).max(6).optional(),
  alt: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
});

export const messageAttachmentSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["file", "image", "video", "audio", "voice"]),
  filename: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  transcription: z.string().optional(),
  transcriptionConfidence: z.number().min(0).max(1).optional(),
  uploadedBy: z.string().uuid(),
  uploadedAt: z.coerce.date(),
  metadata: z.record(z.unknown()).optional(),
});

export const messageMentionTypeSchema = z.enum([
  "user",
  "channel",
  "everyone",
  "here",
  "role",
]);

export const messageMentionSchema = z.object({
  type: messageMentionTypeSchema,
  id: z.string(),
  displayName: z.string().max(100),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
});

export const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  content: z.string().min(1).max(40000),
  contentType: messageContentTypeSchema.default("text"),
  blocks: z.array(messageBlockSchema).optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
  mentions: z.array(
    messageMentionSchema.omit({ startIndex: true, endIndex: true })
  ).optional(),
  replyToId: z.string().uuid().optional(),
  scheduledFor: z.coerce.date().optional(),
  encrypt: z.boolean().optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(40000),
  blocks: z.array(messageBlockSchema).optional(),
});

export const messageReactionSchema = z.object({
  emoji: z.string().min(1).max(50),
  emojiId: z.string().optional(),
});

// =============================================================================
// SEARCH SCHEMAS
// =============================================================================

export const messageSearchFiltersSchema = z.object({
  query: z.string().min(1).max(500),
  channelIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  hasAttachments: z.boolean().optional(),
  hasLinks: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  inThread: z.boolean().optional(),
  contentTypes: z.array(messageContentTypeSchema).optional(),
  fileTypes: z.array(z.string()).optional(),
  mentionsMe: z.boolean().optional(),
});

export const searchPaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

// =============================================================================
// VOICE MESSAGE SCHEMAS
// =============================================================================

export const transcriptionSegmentSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  confidence: z.number().min(0).max(1),
  words: z.array(z.object({
    word: z.string(),
    start: z.number().min(0),
    end: z.number().min(0),
    confidence: z.number().min(0).max(1),
  })).optional(),
  speaker: z.string().optional(),
});

export const voiceTranscriptionSchema = z.object({
  text: z.string(),
  segments: z.array(transcriptionSegmentSchema),
  language: z.string().length(2),
  confidence: z.number().min(0).max(1),
  duration: z.number().min(0),
  wordCount: z.number().int().min(0),
  model: z.string(),
  processedAt: z.coerce.date(),
});

export const voiceMessageSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
  duration: z.number().min(0).max(600), // Max 10 minutes
  waveform: z.array(z.number().min(0).max(1)),
  audioUrl: z.string().url(),
  format: z.enum(["webm", "mp3", "ogg", "wav"]),
  sampleRate: z.number().int().positive(),
  bitrate: z.number().int().positive(),
  fileSize: z.number().int().positive(),
  transcription: voiceTranscriptionSchema.optional(),
  transcriptionStatus: z.enum(["pending", "processing", "completed", "failed"]),
  createdAt: z.coerce.date(),
});

// =============================================================================
// MEETING SCHEMAS
// =============================================================================

export const meetingStatusSchema = z.enum([
  "scheduled",
  "waiting",
  "in_progress",
  "ended",
  "cancelled",
]);

export const meetingParticipantRoleSchema = z.enum([
  "host",
  "co_host",
  "presenter",
  "attendee",
]);

export const meetingParticipantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().max(100),
  avatar: z.string().url().optional(),
  role: meetingParticipantRoleSchema,
  joinedAt: z.coerce.date().optional(),
  leftAt: z.coerce.date().optional(),
  isVideoEnabled: z.boolean(),
  isAudioEnabled: z.boolean(),
  isScreenSharing: z.boolean(),
  isHandRaised: z.boolean(),
  connectionQuality: z.enum(["excellent", "good", "fair", "poor"]),
  deviceType: z.string().optional(),
});

export const meetingSettingsSchema = z.object({
  waitingRoomEnabled: z.boolean().default(true),
  participantsCanUnmute: z.boolean().default(true),
  participantsCanShareScreen: z.boolean().default(false),
  recordingEnabled: z.boolean().default(true),
  autoRecording: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(true),
  liveTranscription: z.boolean().default(false),
  chatEnabled: z.boolean().default(true),
  raisedHandsEnabled: z.boolean().default(true),
  breakoutRoomsEnabled: z.boolean().default(false),
  password: z.string().min(4).max(20).optional(),
  requireAuthentication: z.boolean().default(true),
});

export const meetingRecurrenceSchema = z.object({
  pattern: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(30),
  endDate: z.coerce.date().optional(),
  occurrences: z.number().int().min(1).max(365).optional(),
});

export const scheduleMeetingSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  timezone: z.string().max(50).optional(),
  inviteeIds: z.array(z.string().uuid()),
  settings: meetingSettingsSchema.partial().optional(),
  recurrence: meetingRecurrenceSchema.optional(),
}).refine(
  (data) => data.scheduledEnd > data.scheduledStart,
  { message: "End time must be after start time" }
);

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scheduledStart: z.coerce.date().optional(),
  scheduledEnd: z.coerce.date().optional(),
  settings: meetingSettingsSchema.partial().optional(),
});

export const actionItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

// =============================================================================
// WEBRTC SCHEMAS
// =============================================================================

export const webRTCSignalTypeSchema = z.enum([
  "offer",
  "answer",
  "ice_candidate",
  "renegotiate",
]);

export const webRTCSignalSchema = z.object({
  type: webRTCSignalTypeSchema,
  meetingId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid().optional(),
  sessionDescription: z.any().optional(),
  iceCandidate: z.any().optional(),
});

// =============================================================================
// ENCRYPTION SCHEMAS
// =============================================================================

export const encryptionKeySchema = z.object({
  id: z.string().uuid(),
  publicKey: z.string().min(1),
  algorithm: z.enum(["X25519", "RSA-OAEP"]),
  keySize: z.number().int().positive(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
});

export const keyExchangeRequestSchema = z.object({
  recipientUserId: z.string().uuid(),
  initiatorPublicKey: z.string().min(1),
});

export const keyExchangeResponseSchema = z.object({
  exchangeId: z.string().uuid(),
  recipientPublicKey: z.string().min(1),
});

// =============================================================================
// FILE UPLOAD SCHEMAS
// =============================================================================

export const uploadFileRequestSchema = z.object({
  channelId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().max(100 * 1024 * 1024), // Max 100MB
});

export const uploadCompleteSchema = z.object({
  fileId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
});

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

export const notificationTypeSchema = z.enum([
  "message",
  "mention",
  "reaction",
  "thread_reply",
  "channel_invite",
  "dm",
  "call_incoming",
  "call_missed",
  "meeting_starting",
  "file_shared",
]);

export const notificationPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  desktop: z.boolean().default(true),
  mobile: z.boolean().default(true),
  email: z.boolean().default(false),
  emailDigest: z.enum(["never", "hourly", "daily", "weekly"]).default("never"),
  sound: z.boolean().default(true),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string(),
  }).optional(),
  channelOverrides: z.record(z.string().uuid(), z.object({
    level: z.enum(["all", "mentions", "none"]),
    muted: z.boolean(),
  })).optional(),
});

// =============================================================================
// WORKSPACE SCHEMAS
// =============================================================================

export const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
});

export const workspaceSettingsSchema = z.object({
  defaultChannelId: z.string().uuid().optional(),
  allowGuestAccess: z.boolean().default(false),
  messageRetentionDays: z.number().int().positive().optional(),
  fileRetentionDays: z.number().int().positive().optional(),
  allowedDomains: z.array(z.string()).optional(),
  ssoEnabled: z.boolean().default(false),
  mfaRequired: z.boolean().default(false),
  allowExternalFileSharing: z.boolean().default(false),
  e2eEncryptionEnabled: z.boolean().default(false),
});

// =============================================================================
// EXPORT TYPE INFERENCE
// =============================================================================

export type PresenceStatus = z.infer<typeof presenceStatusSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;
export type UserPresenceInfo = z.infer<typeof userPresenceInfoSchema>;
export type ChannelType = z.infer<typeof channelTypeSchema>;
export type ChannelMemberRole = z.infer<typeof channelMemberRoleSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type MessageContentType = z.infer<typeof messageContentTypeSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageSearchFilters = z.infer<typeof messageSearchFiltersSchema>;
export type VoiceTranscription = z.infer<typeof voiceTranscriptionSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type WebRTCSignalType = z.infer<typeof webRTCSignalTypeSchema>;
export type UploadFileRequestInput = z.infer<typeof uploadFileRequestSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
