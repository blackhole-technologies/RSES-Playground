/**
 * @file index.ts
 * @description Shared messaging module exports.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 */

// Export all types — types.ts is the canonical source of truth for type
// aliases like PresenceStatus, ChannelType, MessageContentType, etc.
export * from "./types";

// Export validation schemas. We do NOT use `export *` here because schemas.ts
// derives type aliases via `z.infer<>` that duplicate the names exported
// from types.ts, which would cause TS2308 "ambiguous re-export" errors.
// Instead we explicitly re-export only the schema constants.
export {
  presenceStatusSchema,
  activityTypeSchema,
  customStatusSchema,
  userPresenceInfoSchema,
  channelTypeSchema,
  channelVisibilitySchema,
  channelMemberRoleSchema,
  channelMemberSchema,
  channelConfigSchema,
  createChannelSchema,
  updateChannelSchema,
  messageContentTypeSchema,
  messageBlockTypeSchema,
  messageBlockSchema,
  messageAttachmentSchema,
  messageMentionTypeSchema,
  messageMentionSchema,
  sendMessageSchema,
  updateMessageSchema,
  messageReactionSchema,
  messageSearchFiltersSchema,
  searchPaginationSchema,
  transcriptionSegmentSchema,
  voiceTranscriptionSchema,
  voiceMessageSchema,
  meetingStatusSchema,
  meetingParticipantRoleSchema,
  meetingParticipantSchema,
  meetingSettingsSchema,
  meetingRecurrenceSchema,
  scheduleMeetingSchema,
  updateMeetingSchema,
  actionItemSchema,
  webRTCSignalTypeSchema,
  webRTCSignalSchema,
  encryptionKeySchema,
  keyExchangeRequestSchema,
  keyExchangeResponseSchema,
  uploadFileRequestSchema,
  uploadCompleteSchema,
  notificationTypeSchema,
  notificationPreferencesSchema,
  createWorkspaceSchema,
  workspaceSettingsSchema,
} from "./schemas";

// Export database schema. Same disambiguation pattern as for schemas.ts:
// database-schema.ts derives type aliases via Drizzle's $inferSelect and
// z.infer that duplicate the names in types.ts. We re-export only the
// Drizzle table objects, relations, and insert schemas — never the type
// aliases.
export {
  workspaces,
  workspaceMembers,
  channels,
  channelMembers,
  messages,
  messageReadReceipts,
  attachments,
  voiceMessages,
  transcriptions,
  meetings,
  meetingParticipants,
  meetingRecordings,
  meetingSummaries,
  actionItems,
  encryptionKeys,
  keyExchanges,
  userPresence,
  notifications,
  workspacesRelations,
  channelsRelations,
  messagesRelations,
  meetingsRelations,
  insertWorkspaceSchema,
  insertChannelSchema,
  insertMessageSchema,
  insertMeetingSchema,
  insertVoiceMessageSchema,
  insertTranscriptionSchema,
} from "./database-schema";

// Export WebSocket protocol
export * from "./ws-protocol";
