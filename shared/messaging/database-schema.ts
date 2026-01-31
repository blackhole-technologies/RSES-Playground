/**
 * @file database-schema.ts
 * @description Drizzle ORM database schema for messaging system.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 */

import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  uuid,
  varchar,
  index,
  uniqueIndex,
  real,
  bigint,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// WORKSPACES
// =============================================================================

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: text("description"),
  iconUrl: text("icon_url"),
  ownerId: uuid("owner_id").notNull(),

  settings: jsonb("settings").$type<{
    defaultChannelId?: string;
    allowGuestAccess: boolean;
    messageRetentionDays?: number;
    fileRetentionDays?: number;
    allowedDomains?: string[];
    ssoEnabled: boolean;
    mfaRequired: boolean;
    allowExternalFileSharing: boolean;
    e2eEncryptionEnabled: boolean;
  }>().default({
    allowGuestAccess: false,
    ssoEnabled: false,
    mfaRequired: false,
    allowExternalFileSharing: false,
    e2eEncryptionEnabled: false,
  }),

  subscription: jsonb("subscription").$type<{
    plan: "free" | "pro" | "business" | "enterprise";
    memberLimit: number;
    storageLimit: number;
    features: string[];
  }>(),

  memberCount: integer("member_count").default(0).notNull(),
  channelCount: integer("channel_count").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex("workspaces_slug_idx").on(table.slug),
  ownerIdx: index("workspaces_owner_idx").on(table.ownerId),
}));

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),
  role: varchar("role", { length: 20 }).$type<"owner" | "admin" | "member" | "guest">().default("member").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  invitedBy: uuid("invited_by"),
}, (table) => ({
  workspaceUserIdx: uniqueIndex("workspace_members_workspace_user_idx").on(table.workspaceId, table.userId),
  userIdx: index("workspace_members_user_idx").on(table.userId),
}));

// =============================================================================
// CHANNELS
// =============================================================================

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 20 }).$type<"public" | "private" | "direct" | "group_dm" | "voice" | "broadcast">().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  topic: varchar("topic", { length: 250 }),
  icon: text("icon"),
  visibility: varchar("visibility", { length: 20 }).$type<"visible" | "hidden" | "archived">().default("visible").notNull(),

  config: jsonb("config").$type<{
    allowThreads: boolean;
    allowReactions: boolean;
    allowFileSharing: boolean;
    allowVoiceMessages: boolean;
    retentionDays?: number;
    maxFileSize?: number;
    allowedFileTypes?: string[];
    slowMode?: number;
    readOnly?: boolean;
    encryptionEnabled?: boolean;
  }>().default({
    allowThreads: true,
    allowReactions: true,
    allowFileSharing: true,
    allowVoiceMessages: true,
  }),

  memberCount: integer("member_count").default(0).notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  pinnedMessageIds: jsonb("pinned_message_ids").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => ({
  workspaceIdx: index("channels_workspace_idx").on(table.workspaceId),
  typeIdx: index("channels_type_idx").on(table.type),
  nameIdx: index("channels_name_idx").on(table.name),
  lastMessageIdx: index("channels_last_message_idx").on(table.lastMessageAt),
}));

export const channelMembers = pgTable("channel_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),
  role: varchar("role", { length: 20 }).$type<"owner" | "admin" | "member" | "guest">().default("member").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  nickname: varchar("nickname", { length: 50 }),
  notificationPreference: varchar("notification_preference", { length: 20 }).$type<"all" | "mentions" | "none">().default("all").notNull(),
  muted: boolean("muted").default(false).notNull(),
  mutedUntil: timestamp("muted_until"),
  lastRead: timestamp("last_read"),
  lastReadMessageId: uuid("last_read_message_id"),
}, (table) => ({
  channelUserIdx: uniqueIndex("channel_members_channel_user_idx").on(table.channelId, table.userId),
  userIdx: index("channel_members_user_idx").on(table.userId),
}));

// =============================================================================
// MESSAGES
// =============================================================================

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }).notNull(),
  threadId: uuid("thread_id"),  // Self-reference for thread replies
  userId: uuid("user_id").notNull(),
  userName: varchar("user_name", { length: 100 }).notNull(),
  userAvatar: text("user_avatar"),

  // Content
  contentType: varchar("content_type", { length: 20 }).$type<
    "text" | "file" | "image" | "video" | "audio" | "voice" | "code" | "embed" | "poll" | "system" | "call" | "meeting_link"
  >().default("text").notNull(),
  content: text("content").notNull(),
  blocks: jsonb("blocks").$type<unknown[]>(),
  embeds: jsonb("embeds").$type<unknown[]>(),

  // Threading
  isThreadParent: boolean("is_thread_parent").default(false).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  replyUsers: jsonb("reply_users").$type<string[]>().default([]),
  lastReplyAt: timestamp("last_reply_at"),

  // Interactions
  reactions: jsonb("reactions").$type<{
    emoji: string;
    emojiId?: string;
    userIds: string[];
    count: number;
    firstReactedAt: string;
    lastReactedAt: string;
  }[]>().default([]),
  mentions: jsonb("mentions").$type<{
    type: string;
    id: string;
    displayName: string;
    startIndex: number;
    endIndex: number;
  }[]>().default([]),

  // Delivery
  deliveryStatus: varchar("delivery_status", { length: 20 }).$type<"sending" | "sent" | "delivered" | "read" | "failed">().default("sent").notNull(),
  readCount: integer("read_count").default(0).notNull(),

  // State flags
  isPinned: boolean("is_pinned").default(false).notNull(),
  isEdited: boolean("is_edited").default(false).notNull(),
  editHistory: jsonb("edit_history").$type<{
    content: string;
    editedAt: string;
    editedBy: string;
  }[]>(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: uuid("deleted_by"),

  // Security
  isEncrypted: boolean("is_encrypted").default(false).notNull(),
  encryptionKeyId: uuid("encryption_key_id"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  scheduledFor: timestamp("scheduled_for"),

  // System messages
  systemEvent: jsonb("system_event").$type<{
    type: string;
    data: Record<string, unknown>;
  }>(),

  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => ({
  channelIdx: index("messages_channel_idx").on(table.channelId),
  threadIdx: index("messages_thread_idx").on(table.threadId),
  userIdx: index("messages_user_idx").on(table.userId),
  createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  channelCreatedIdx: index("messages_channel_created_idx").on(table.channelId, table.createdAt),
  contentSearchIdx: index("messages_content_search_idx").on(table.content),  // Consider full-text search
}));

export const messageReadReceipts = pgTable("message_read_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
}, (table) => ({
  messageUserIdx: uniqueIndex("message_read_receipts_message_user_idx").on(table.messageId, table.userId),
  userIdx: index("message_read_receipts_user_idx").on(table.userId),
}));

// =============================================================================
// ATTACHMENTS
// =============================================================================

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 20 }).$type<"file" | "image" | "video" | "audio" | "voice">().notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  duration: real("duration"),  // For audio/video in seconds
  uploadedBy: uuid("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  virusScanStatus: varchar("virus_scan_status", { length: 20 }).$type<"pending" | "clean" | "infected" | "error">().default("pending").notNull(),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => ({
  messageIdx: index("attachments_message_idx").on(table.messageId),
  channelIdx: index("attachments_channel_idx").on(table.channelId),
  uploaderIdx: index("attachments_uploader_idx").on(table.uploadedBy),
}));

// =============================================================================
// VOICE MESSAGES & TRANSCRIPTIONS
// =============================================================================

export const voiceMessages = pgTable("voice_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),

  duration: real("duration").notNull(),  // In seconds
  waveform: jsonb("waveform").$type<number[]>().notNull(),
  audioUrl: text("audio_url").notNull(),
  format: varchar("format", { length: 10 }).$type<"webm" | "mp3" | "ogg" | "wav">().notNull(),
  sampleRate: integer("sample_rate").notNull(),
  bitrate: integer("bitrate").notNull(),
  fileSize: integer("file_size").notNull(),

  transcriptionStatus: varchar("transcription_status", { length: 20 }).$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  messageIdx: index("voice_messages_message_idx").on(table.messageId),
  channelIdx: index("voice_messages_channel_idx").on(table.channelId),
  userIdx: index("voice_messages_user_idx").on(table.userId),
}));

export const transcriptions = pgTable("transcriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  voiceMessageId: uuid("voice_message_id").references(() => voiceMessages.id, { onDelete: "cascade" }),
  meetingRecordingId: uuid("meeting_recording_id"),

  text: text("text").notNull(),
  segments: jsonb("segments").$type<{
    id: number;
    text: string;
    start: number;
    end: number;
    confidence: number;
    words?: { word: string; start: number; end: number; confidence: number }[];
    speaker?: string;
  }[]>().notNull(),

  speakers: jsonb("speakers").$type<{
    id: string;
    label: string;
    userId?: string;
    userName?: string;
    speakingTime: number;
    wordCount: number;
    segments: number[];
  }[]>(),

  language: varchar("language", { length: 10 }).notNull(),
  confidence: real("confidence").notNull(),
  duration: real("duration").notNull(),
  wordCount: integer("word_count").notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
}, (table) => ({
  voiceMessageIdx: index("transcriptions_voice_message_idx").on(table.voiceMessageId),
  meetingIdx: index("transcriptions_meeting_idx").on(table.meetingRecordingId),
  textSearchIdx: index("transcriptions_text_search_idx").on(table.text),  // Consider full-text
}));

// =============================================================================
// MEETINGS
// =============================================================================

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),

  // Basic info
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 20 }).$type<"instant" | "scheduled" | "recurring">().notNull(),
  status: varchar("status", { length: 20 }).$type<"scheduled" | "waiting" | "in_progress" | "ended" | "cancelled">().default("scheduled").notNull(),

  // Scheduling
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  timezone: varchar("timezone", { length: 50 }),
  recurrence: jsonb("recurrence").$type<{
    pattern: "daily" | "weekly" | "monthly";
    interval: number;
    endDate?: string;
    occurrences?: number;
  }>(),

  // Host
  hostId: uuid("host_id").notNull(),
  invitedUserIds: jsonb("invited_user_ids").$type<string[]>().default([]),
  maxParticipants: integer("max_participants"),

  // Settings
  settings: jsonb("settings").$type<{
    waitingRoomEnabled: boolean;
    participantsCanUnmute: boolean;
    participantsCanShareScreen: boolean;
    recordingEnabled: boolean;
    autoRecording: boolean;
    transcriptionEnabled: boolean;
    liveTranscription: boolean;
    chatEnabled: boolean;
    raisedHandsEnabled: boolean;
    breakoutRoomsEnabled: boolean;
    password?: string;
    requireAuthentication: boolean;
  }>().default({
    waitingRoomEnabled: true,
    participantsCanUnmute: true,
    participantsCanShareScreen: false,
    recordingEnabled: true,
    autoRecording: false,
    transcriptionEnabled: true,
    liveTranscription: false,
    chatEnabled: true,
    raisedHandsEnabled: true,
    breakoutRoomsEnabled: false,
    requireAuthentication: true,
  }),

  // Access
  joinUrl: text("join_url").notNull(),
  dialInNumbers: jsonb("dial_in_numbers").$type<{ country: string; number: string }[]>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => ({
  workspaceIdx: index("meetings_workspace_idx").on(table.workspaceId),
  channelIdx: index("meetings_channel_idx").on(table.channelId),
  hostIdx: index("meetings_host_idx").on(table.hostId),
  statusIdx: index("meetings_status_idx").on(table.status),
  scheduledIdx: index("meetings_scheduled_idx").on(table.scheduledStart),
}));

export const meetingParticipants = pgTable("meeting_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  avatar: text("avatar"),
  role: varchar("role", { length: 20 }).$type<"host" | "co_host" | "presenter" | "attendee">().default("attendee").notNull(),
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  isVideoEnabled: boolean("is_video_enabled").default(false).notNull(),
  isAudioEnabled: boolean("is_audio_enabled").default(false).notNull(),
  isScreenSharing: boolean("is_screen_sharing").default(false).notNull(),
  isHandRaised: boolean("is_hand_raised").default(false).notNull(),
  connectionQuality: varchar("connection_quality", { length: 20 }).$type<"excellent" | "good" | "fair" | "poor">().default("good").notNull(),
  deviceType: varchar("device_type", { length: 50 }),
}, (table) => ({
  meetingUserIdx: uniqueIndex("meeting_participants_meeting_user_idx").on(table.meetingId, table.userId),
  userIdx: index("meeting_participants_user_idx").on(table.userId),
}));

export const meetingRecordings = pgTable("meeting_recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 20 }).$type<"video" | "audio" | "screen" | "combined">().notNull(),
  url: text("url").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  duration: real("duration").notNull(),
  format: varchar("format", { length: 20 }).notNull(),
  resolution: varchar("resolution", { length: 20 }),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  status: varchar("status", { length: 20 }).$type<"recording" | "processing" | "ready" | "failed">().default("recording").notNull(),
}, (table) => ({
  meetingIdx: index("meeting_recordings_meeting_idx").on(table.meetingId),
  statusIdx: index("meeting_recordings_status_idx").on(table.status),
}));

export const meetingSummaries = pgTable("meeting_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  overview: text("overview").notNull(),
  keyPoints: jsonb("key_points").$type<string[]>().notNull(),
  decisions: jsonb("decisions").$type<string[]>().notNull(),
  participants: jsonb("participants").$type<{
    userId: string;
    name: string;
    contributions: string[];
  }[]>().notNull(),
  topics: jsonb("topics").$type<{
    name: string;
    duration: number;
    summary: string;
  }[]>().notNull(),
  sentiment: varchar("sentiment", { length: 20 }).$type<"positive" | "neutral" | "mixed" | "negative">().notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => ({
  meetingIdx: uniqueIndex("meeting_summaries_meeting_idx").on(table.meetingId),
}));

export const actionItems = pgTable("action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  assigneeId: uuid("assignee_id"),
  assigneeName: varchar("assignee_name", { length: 100 }),
  dueDate: timestamp("due_date"),
  priority: varchar("priority", { length: 10 }).$type<"high" | "medium" | "low">().default("medium").notNull(),
  status: varchar("status", { length: 20 }).$type<"pending" | "in_progress" | "completed">().default("pending").notNull(),
  source: jsonb("source").$type<{
    timestamp: number;
    transcriptSegmentId: number;
    quote: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  meetingIdx: index("action_items_meeting_idx").on(table.meetingId),
  assigneeIdx: index("action_items_assignee_idx").on(table.assigneeId),
  statusIdx: index("action_items_status_idx").on(table.status),
}));

// =============================================================================
// ENCRYPTION KEYS
// =============================================================================

export const encryptionKeys = pgTable("encryption_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  publicKey: text("public_key").notNull(),
  privateKeyEncrypted: text("private_key_encrypted"),
  algorithm: varchar("algorithm", { length: 20 }).$type<"X25519" | "RSA-OAEP">().notNull(),
  keySize: integer("key_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
}, (table) => ({
  userIdx: index("encryption_keys_user_idx").on(table.userId),
}));

export const keyExchanges = pgTable("key_exchanges", {
  id: uuid("id").primaryKey().defaultRandom(),
  initiatorUserId: uuid("initiator_user_id").notNull(),
  recipientUserId: uuid("recipient_user_id").notNull(),
  initiatorPublicKey: text("initiator_public_key").notNull(),
  recipientPublicKey: text("recipient_public_key"),
  sharedSecretHash: varchar("shared_secret_hash", { length: 64 }),
  status: varchar("status", { length: 20 }).$type<"pending" | "completed" | "failed" | "expired">().default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  initiatorIdx: index("key_exchanges_initiator_idx").on(table.initiatorUserId),
  recipientIdx: index("key_exchanges_recipient_idx").on(table.recipientUserId),
  statusIdx: index("key_exchanges_status_idx").on(table.status),
}));

// =============================================================================
// USER PRESENCE
// =============================================================================

export const userPresence = pgTable("user_presence", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 20 }).$type<"online" | "away" | "busy" | "dnd" | "offline">().default("offline").notNull(),
  activity: varchar("activity", { length: 20 }).$type<"typing" | "viewing" | "in_call" | "screen_sharing" | "recording" | "idle">(),
  activityDetails: varchar("activity_details", { length: 200 }),
  customStatus: jsonb("custom_status").$type<{
    emoji?: string;
    text?: string;
    expiresAt?: string;
  }>(),
  deviceType: varchar("device_type", { length: 20 }).$type<"desktop" | "mobile" | "tablet" | "web">(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex("user_presence_user_idx").on(table.userId),
  workspaceIdx: index("user_presence_workspace_idx").on(table.workspaceId),
  statusIdx: index("user_presence_status_idx").on(table.status),
}));

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 30 }).$type<
    "message" | "mention" | "reaction" | "thread_reply" | "channel_invite" | "dm" | "call_incoming" | "call_missed" | "meeting_starting" | "file_shared"
  >().notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  actionUrl: text("action_url"),
  channelId: uuid("channel_id"),
  messageId: uuid("message_id"),
  senderId: uuid("sender_id"),
  senderName: varchar("sender_name", { length: 100 }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  userReadIdx: index("notifications_user_read_idx").on(table.userId, table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));

// =============================================================================
// RELATIONS
// =============================================================================

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  channels: many(channels),
  meetings: many(meetings),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [channels.workspaceId],
    references: [workspaces.id],
  }),
  members: many(channelMembers),
  messages: many(messages),
  attachments: many(attachments),
  voiceMessages: many(voiceMessages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  parentThread: one(messages, {
    fields: [messages.threadId],
    references: [messages.id],
    relationName: "threadReplies",
  }),
  threadReplies: many(messages, { relationName: "threadReplies" }),
  readReceipts: many(messageReadReceipts),
  attachments: many(attachments),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [meetings.workspaceId],
    references: [workspaces.id],
  }),
  channel: one(channels, {
    fields: [meetings.channelId],
    references: [channels.id],
  }),
  participants: many(meetingParticipants),
  recordings: many(meetingRecordings),
  summary: one(meetingSummaries),
  actionItems: many(actionItems),
}));

// =============================================================================
// INSERT SCHEMAS
// =============================================================================

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  memberCount: true,
  channelCount: true,
});

export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  memberCount: true,
  lastMessageAt: true,
  lastMessagePreview: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  replyCount: true,
  replyUsers: true,
  lastReplyAt: true,
  readCount: true,
  isEdited: true,
  editHistory: true,
  isDeleted: true,
  deletedAt: true,
  deletedBy: true,
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  actualStart: true,
  actualEnd: true,
});

export const insertVoiceMessageSchema = createInsertSchema(voiceMessages).omit({
  id: true,
  createdAt: true,
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions).omit({
  id: true,
  processedAt: true,
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;

export type ChannelMember = typeof channelMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;

export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type MeetingRecording = typeof meetingRecordings.$inferSelect;
export type MeetingSummary = typeof meetingSummaries.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;

export type VoiceMessage = typeof voiceMessages.$inferSelect;
export type InsertVoiceMessage = z.infer<typeof insertVoiceMessageSchema>;

export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = z.infer<typeof insertTranscriptionSchema>;

export type EncryptionKey = typeof encryptionKeys.$inferSelect;
export type KeyExchange = typeof keyExchanges.$inferSelect;

export type UserPresence = typeof userPresence.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
