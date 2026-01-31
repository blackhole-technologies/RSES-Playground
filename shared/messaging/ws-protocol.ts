/**
 * @file ws-protocol.ts
 * @description WebSocket protocol definitions for real-time messaging.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Protocol design inspired by:
 * - Slack Real Time Messaging API
 * - Discord Gateway
 * - Socket.io patterns
 */

import type {
  Message,
  Channel,
  UserPresenceInfo,
  TypingIndicator,
  MessageReaction,
  Meeting,
  MeetingParticipant,
  WebRTCSignal,
  VoiceTranscription,
} from "./types";

// =============================================================================
// WEBSOCKET MESSAGE TYPES
// =============================================================================

/**
 * All WebSocket message types for the messaging system
 */
export type MessagingWSMessageType =
  // Connection
  | "connection:established"
  | "connection:error"
  | "connection:reconnect"

  // Heartbeat
  | "ping"
  | "pong"

  // Authentication
  | "auth:request"
  | "auth:success"
  | "auth:failure"
  | "auth:token_refresh"

  // Presence
  | "presence:update"
  | "presence:subscribe"
  | "presence:unsubscribe"
  | "presence:sync"

  // Typing indicators
  | "typing:start"
  | "typing:stop"
  | "typing:update"

  // Channel operations
  | "channel:join"
  | "channel:leave"
  | "channel:joined"
  | "channel:left"
  | "channel:created"
  | "channel:updated"
  | "channel:deleted"
  | "channel:archived"
  | "channel:member_added"
  | "channel:member_removed"
  | "channel:member_updated"

  // Message operations
  | "message:send"
  | "message:sent"
  | "message:received"
  | "message:updated"
  | "message:deleted"
  | "message:pinned"
  | "message:unpinned"
  | "message:reaction_added"
  | "message:reaction_removed"
  | "message:read"
  | "message:delivered"

  // Thread operations
  | "thread:reply"
  | "thread:replied"
  | "thread:follow"
  | "thread:unfollow"

  // File operations
  | "file:upload_start"
  | "file:upload_progress"
  | "file:upload_complete"
  | "file:upload_error"

  // Voice messages
  | "voice:recording_start"
  | "voice:recording_stop"
  | "voice:uploaded"
  | "voice:transcription_start"
  | "voice:transcription_progress"
  | "voice:transcription_complete"

  // Meetings
  | "meeting:created"
  | "meeting:updated"
  | "meeting:starting"
  | "meeting:started"
  | "meeting:ended"
  | "meeting:cancelled"
  | "meeting:participant_joined"
  | "meeting:participant_left"
  | "meeting:participant_updated"
  | "meeting:recording_started"
  | "meeting:recording_stopped"
  | "meeting:transcription_update"

  // WebRTC signaling
  | "rtc:offer"
  | "rtc:answer"
  | "rtc:ice_candidate"
  | "rtc:renegotiate"
  | "rtc:track_added"
  | "rtc:track_removed"

  // Notifications
  | "notification:new"
  | "notification:read"
  | "notification:cleared"

  // Error
  | "error";

// =============================================================================
// BASE MESSAGE INTERFACE
// =============================================================================

/**
 * Base WebSocket message structure
 */
export interface BaseWSMessage {
  type: MessagingWSMessageType;
  id?: string;         // Message ID for acknowledgment
  timestamp: number;
  workspaceId?: string;
}

// =============================================================================
// CONNECTION MESSAGES
// =============================================================================

export interface WSConnectionEstablishedMessage extends BaseWSMessage {
  type: "connection:established";
  clientId: string;
  serverVersion: string;
  capabilities: string[];
  heartbeatInterval: number;
}

export interface WSConnectionErrorMessage extends BaseWSMessage {
  type: "connection:error";
  code: string;
  message: string;
  retryAfter?: number;
}

export interface WSConnectionReconnectMessage extends BaseWSMessage {
  type: "connection:reconnect";
  reason: string;
  lastMessageId?: string;
}

// =============================================================================
// AUTHENTICATION MESSAGES
// =============================================================================

export interface WSAuthRequestMessage extends BaseWSMessage {
  type: "auth:request";
  token: string;
  workspaceId: string;
}

export interface WSAuthSuccessMessage extends BaseWSMessage {
  type: "auth:success";
  userId: string;
  userName: string;
  workspaceId: string;
  permissions: string[];
  subscribedChannels: string[];
}

export interface WSAuthFailureMessage extends BaseWSMessage {
  type: "auth:failure";
  code: string;
  message: string;
}

export interface WSAuthTokenRefreshMessage extends BaseWSMessage {
  type: "auth:token_refresh";
  newToken: string;
  expiresAt: number;
}

// =============================================================================
// PRESENCE MESSAGES
// =============================================================================

export interface WSPresenceUpdateMessage extends BaseWSMessage {
  type: "presence:update";
  presence: UserPresenceInfo;
}

export interface WSPresenceSubscribeMessage extends BaseWSMessage {
  type: "presence:subscribe";
  userIds: string[];
}

export interface WSPresenceUnsubscribeMessage extends BaseWSMessage {
  type: "presence:unsubscribe";
  userIds: string[];
}

export interface WSPresenceSyncMessage extends BaseWSMessage {
  type: "presence:sync";
  presenceList: UserPresenceInfo[];
}

// =============================================================================
// TYPING MESSAGES
// =============================================================================

export interface WSTypingStartMessage extends BaseWSMessage {
  type: "typing:start";
  channelId: string;
  threadId?: string;
}

export interface WSTypingStopMessage extends BaseWSMessage {
  type: "typing:stop";
  channelId: string;
  threadId?: string;
}

export interface WSTypingUpdateMessage extends BaseWSMessage {
  type: "typing:update";
  channelId: string;
  threadId?: string;
  typingUsers: TypingIndicator[];
}

// =============================================================================
// CHANNEL MESSAGES
// =============================================================================

export interface WSChannelJoinMessage extends BaseWSMessage {
  type: "channel:join";
  channelId: string;
}

export interface WSChannelLeaveMessage extends BaseWSMessage {
  type: "channel:leave";
  channelId: string;
}

export interface WSChannelJoinedMessage extends BaseWSMessage {
  type: "channel:joined";
  channel: Channel;
  recentMessages: Message[];
  unreadCount: number;
  lastReadMessageId?: string;
}

export interface WSChannelLeftMessage extends BaseWSMessage {
  type: "channel:left";
  channelId: string;
  reason?: string;
}

export interface WSChannelCreatedMessage extends BaseWSMessage {
  type: "channel:created";
  channel: Channel;
  createdBy: string;
}

export interface WSChannelUpdatedMessage extends BaseWSMessage {
  type: "channel:updated";
  channelId: string;
  updates: Partial<Channel>;
  updatedBy: string;
}

export interface WSChannelDeletedMessage extends BaseWSMessage {
  type: "channel:deleted";
  channelId: string;
  deletedBy: string;
}

export interface WSChannelArchivedMessage extends BaseWSMessage {
  type: "channel:archived";
  channelId: string;
  archivedBy: string;
}

export interface WSChannelMemberAddedMessage extends BaseWSMessage {
  type: "channel:member_added";
  channelId: string;
  userId: string;
  addedBy: string;
  role: string;
}

export interface WSChannelMemberRemovedMessage extends BaseWSMessage {
  type: "channel:member_removed";
  channelId: string;
  userId: string;
  removedBy: string;
  reason?: string;
}

export interface WSChannelMemberUpdatedMessage extends BaseWSMessage {
  type: "channel:member_updated";
  channelId: string;
  userId: string;
  updates: {
    role?: string;
    nickname?: string;
    notificationPreference?: string;
    muted?: boolean;
  };
}

// =============================================================================
// MESSAGE MESSAGES
// =============================================================================

export interface WSMessageSendMessage extends BaseWSMessage {
  type: "message:send";
  channelId: string;
  threadId?: string;
  content: string;
  contentType?: string;
  attachmentIds?: string[];
  mentions?: { type: string; id: string; displayName: string }[];
  clientMessageId: string;  // Client-generated ID for deduplication
}

export interface WSMessageSentMessage extends BaseWSMessage {
  type: "message:sent";
  message: Message;
  clientMessageId: string;
}

export interface WSMessageReceivedMessage extends BaseWSMessage {
  type: "message:received";
  message: Message;
}

export interface WSMessageUpdatedMessage extends BaseWSMessage {
  type: "message:updated";
  messageId: string;
  channelId: string;
  updates: {
    content?: string;
    blocks?: unknown[];
    isPinned?: boolean;
  };
  updatedBy: string;
  updatedAt: number;
}

export interface WSMessageDeletedMessage extends BaseWSMessage {
  type: "message:deleted";
  messageId: string;
  channelId: string;
  threadId?: string;
  deletedBy: string;
}

export interface WSMessagePinnedMessage extends BaseWSMessage {
  type: "message:pinned";
  messageId: string;
  channelId: string;
  pinnedBy: string;
}

export interface WSMessageUnpinnedMessage extends BaseWSMessage {
  type: "message:unpinned";
  messageId: string;
  channelId: string;
  unpinnedBy: string;
}

export interface WSMessageReactionAddedMessage extends BaseWSMessage {
  type: "message:reaction_added";
  messageId: string;
  channelId: string;
  reaction: MessageReaction;
  addedBy: string;
}

export interface WSMessageReactionRemovedMessage extends BaseWSMessage {
  type: "message:reaction_removed";
  messageId: string;
  channelId: string;
  emoji: string;
  removedBy: string;
}

export interface WSMessageReadMessage extends BaseWSMessage {
  type: "message:read";
  messageId: string;
  channelId: string;
  userId: string;
  readAt: number;
}

export interface WSMessageDeliveredMessage extends BaseWSMessage {
  type: "message:delivered";
  messageIds: string[];
  channelId: string;
  deliveredTo: string;
}

// =============================================================================
// THREAD MESSAGES
// =============================================================================

export interface WSThreadReplyMessage extends BaseWSMessage {
  type: "thread:reply";
  parentMessageId: string;
  channelId: string;
  content: string;
  clientMessageId: string;
}

export interface WSThreadRepliedMessage extends BaseWSMessage {
  type: "thread:replied";
  parentMessageId: string;
  reply: Message;
  replyCount: number;
  participants: string[];
}

export interface WSThreadFollowMessage extends BaseWSMessage {
  type: "thread:follow";
  parentMessageId: string;
  channelId: string;
}

export interface WSThreadUnfollowMessage extends BaseWSMessage {
  type: "thread:unfollow";
  parentMessageId: string;
  channelId: string;
}

// =============================================================================
// FILE MESSAGES
// =============================================================================

export interface WSFileUploadStartMessage extends BaseWSMessage {
  type: "file:upload_start";
  uploadId: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface WSFileUploadProgressMessage extends BaseWSMessage {
  type: "file:upload_progress";
  uploadId: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
}

export interface WSFileUploadCompleteMessage extends BaseWSMessage {
  type: "file:upload_complete";
  uploadId: string;
  fileId: string;
  url: string;
  thumbnailUrl?: string;
}

export interface WSFileUploadErrorMessage extends BaseWSMessage {
  type: "file:upload_error";
  uploadId: string;
  code: string;
  message: string;
}

// =============================================================================
// VOICE MESSAGES
// =============================================================================

export interface WSVoiceRecordingStartMessage extends BaseWSMessage {
  type: "voice:recording_start";
  channelId: string;
  recordingId: string;
}

export interface WSVoiceRecordingStopMessage extends BaseWSMessage {
  type: "voice:recording_stop";
  recordingId: string;
  duration: number;
}

export interface WSVoiceUploadedMessage extends BaseWSMessage {
  type: "voice:uploaded";
  voiceMessageId: string;
  messageId: string;
  channelId: string;
  duration: number;
  waveform: number[];
  audioUrl: string;
}

export interface WSVoiceTranscriptionStartMessage extends BaseWSMessage {
  type: "voice:transcription_start";
  voiceMessageId: string;
}

export interface WSVoiceTranscriptionProgressMessage extends BaseWSMessage {
  type: "voice:transcription_progress";
  voiceMessageId: string;
  progress: number;
  partialText?: string;
}

export interface WSVoiceTranscriptionCompleteMessage extends BaseWSMessage {
  type: "voice:transcription_complete";
  voiceMessageId: string;
  transcription: VoiceTranscription;
}

// =============================================================================
// MEETING MESSAGES
// =============================================================================

export interface WSMeetingCreatedMessage extends BaseWSMessage {
  type: "meeting:created";
  meeting: Meeting;
}

export interface WSMeetingUpdatedMessage extends BaseWSMessage {
  type: "meeting:updated";
  meetingId: string;
  updates: Partial<Meeting>;
}

export interface WSMeetingStartingMessage extends BaseWSMessage {
  type: "meeting:starting";
  meetingId: string;
  title: string;
  hostId: string;
  joinUrl: string;
  startsIn: number;  // Seconds until start
}

export interface WSMeetingStartedMessage extends BaseWSMessage {
  type: "meeting:started";
  meetingId: string;
  startedAt: number;
  hostId: string;
}

export interface WSMeetingEndedMessage extends BaseWSMessage {
  type: "meeting:ended";
  meetingId: string;
  endedAt: number;
  duration: number;
  participantCount: number;
  recordingAvailable: boolean;
}

export interface WSMeetingCancelledMessage extends BaseWSMessage {
  type: "meeting:cancelled";
  meetingId: string;
  cancelledBy: string;
  reason?: string;
}

export interface WSMeetingParticipantJoinedMessage extends BaseWSMessage {
  type: "meeting:participant_joined";
  meetingId: string;
  participant: MeetingParticipant;
}

export interface WSMeetingParticipantLeftMessage extends BaseWSMessage {
  type: "meeting:participant_left";
  meetingId: string;
  participantId: string;
  userId: string;
  leftAt: number;
}

export interface WSMeetingParticipantUpdatedMessage extends BaseWSMessage {
  type: "meeting:participant_updated";
  meetingId: string;
  participantId: string;
  updates: Partial<MeetingParticipant>;
}

export interface WSMeetingRecordingStartedMessage extends BaseWSMessage {
  type: "meeting:recording_started";
  meetingId: string;
  recordingId: string;
  startedBy: string;
}

export interface WSMeetingRecordingStoppedMessage extends BaseWSMessage {
  type: "meeting:recording_stopped";
  meetingId: string;
  recordingId: string;
  stoppedBy: string;
  duration: number;
}

export interface WSMeetingTranscriptionUpdateMessage extends BaseWSMessage {
  type: "meeting:transcription_update";
  meetingId: string;
  segment: {
    id: number;
    text: string;
    speaker?: string;
    speakerName?: string;
    start: number;
    end: number;
  };
}

// =============================================================================
// WEBRTC SIGNALING MESSAGES
// =============================================================================

export interface WSRTCOfferMessage extends BaseWSMessage {
  type: "rtc:offer";
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  offer: RTCSessionDescriptionInit;
}

export interface WSRTCAnswerMessage extends BaseWSMessage {
  type: "rtc:answer";
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  answer: RTCSessionDescriptionInit;
}

export interface WSRTCIceCandidateMessage extends BaseWSMessage {
  type: "rtc:ice_candidate";
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface WSRTCRenegotiateMessage extends BaseWSMessage {
  type: "rtc:renegotiate";
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
}

export interface WSRTCTrackAddedMessage extends BaseWSMessage {
  type: "rtc:track_added";
  meetingId: string;
  userId: string;
  trackId: string;
  kind: "video" | "audio";
  label?: string;
}

export interface WSRTCTrackRemovedMessage extends BaseWSMessage {
  type: "rtc:track_removed";
  meetingId: string;
  userId: string;
  trackId: string;
}

// =============================================================================
// NOTIFICATION MESSAGES
// =============================================================================

export interface WSNotificationNewMessage extends BaseWSMessage {
  type: "notification:new";
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    imageUrl?: string;
    actionUrl?: string;
    channelId?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    createdAt: number;
  };
}

export interface WSNotificationReadMessage extends BaseWSMessage {
  type: "notification:read";
  notificationIds: string[];
}

export interface WSNotificationClearedMessage extends BaseWSMessage {
  type: "notification:cleared";
  clearedCount: number;
}

// =============================================================================
// ERROR MESSAGE
// =============================================================================

export interface WSErrorMessage extends BaseWSMessage {
  type: "error";
  code: string;
  message: string;
  details?: Record<string, unknown>;
  originalMessageId?: string;
}

// =============================================================================
// HEARTBEAT MESSAGES
// =============================================================================

export interface WSPingMessage extends BaseWSMessage {
  type: "ping";
}

export interface WSPongMessage extends BaseWSMessage {
  type: "pong";
  serverTime: number;
}

// =============================================================================
// UNION TYPE
// =============================================================================

export type MessagingWSMessage =
  // Connection
  | WSConnectionEstablishedMessage
  | WSConnectionErrorMessage
  | WSConnectionReconnectMessage

  // Heartbeat
  | WSPingMessage
  | WSPongMessage

  // Auth
  | WSAuthRequestMessage
  | WSAuthSuccessMessage
  | WSAuthFailureMessage
  | WSAuthTokenRefreshMessage

  // Presence
  | WSPresenceUpdateMessage
  | WSPresenceSubscribeMessage
  | WSPresenceUnsubscribeMessage
  | WSPresenceSyncMessage

  // Typing
  | WSTypingStartMessage
  | WSTypingStopMessage
  | WSTypingUpdateMessage

  // Channels
  | WSChannelJoinMessage
  | WSChannelLeaveMessage
  | WSChannelJoinedMessage
  | WSChannelLeftMessage
  | WSChannelCreatedMessage
  | WSChannelUpdatedMessage
  | WSChannelDeletedMessage
  | WSChannelArchivedMessage
  | WSChannelMemberAddedMessage
  | WSChannelMemberRemovedMessage
  | WSChannelMemberUpdatedMessage

  // Messages
  | WSMessageSendMessage
  | WSMessageSentMessage
  | WSMessageReceivedMessage
  | WSMessageUpdatedMessage
  | WSMessageDeletedMessage
  | WSMessagePinnedMessage
  | WSMessageUnpinnedMessage
  | WSMessageReactionAddedMessage
  | WSMessageReactionRemovedMessage
  | WSMessageReadMessage
  | WSMessageDeliveredMessage

  // Threads
  | WSThreadReplyMessage
  | WSThreadRepliedMessage
  | WSThreadFollowMessage
  | WSThreadUnfollowMessage

  // Files
  | WSFileUploadStartMessage
  | WSFileUploadProgressMessage
  | WSFileUploadCompleteMessage
  | WSFileUploadErrorMessage

  // Voice
  | WSVoiceRecordingStartMessage
  | WSVoiceRecordingStopMessage
  | WSVoiceUploadedMessage
  | WSVoiceTranscriptionStartMessage
  | WSVoiceTranscriptionProgressMessage
  | WSVoiceTranscriptionCompleteMessage

  // Meetings
  | WSMeetingCreatedMessage
  | WSMeetingUpdatedMessage
  | WSMeetingStartingMessage
  | WSMeetingStartedMessage
  | WSMeetingEndedMessage
  | WSMeetingCancelledMessage
  | WSMeetingParticipantJoinedMessage
  | WSMeetingParticipantLeftMessage
  | WSMeetingParticipantUpdatedMessage
  | WSMeetingRecordingStartedMessage
  | WSMeetingRecordingStoppedMessage
  | WSMeetingTranscriptionUpdateMessage

  // WebRTC
  | WSRTCOfferMessage
  | WSRTCAnswerMessage
  | WSRTCIceCandidateMessage
  | WSRTCRenegotiateMessage
  | WSRTCTrackAddedMessage
  | WSRTCTrackRemovedMessage

  // Notifications
  | WSNotificationNewMessage
  | WSNotificationReadMessage
  | WSNotificationClearedMessage

  // Error
  | WSErrorMessage;

// =============================================================================
// CLIENT MESSAGE TYPES (Client -> Server)
// =============================================================================

export type ClientToServerMessage =
  | WSAuthRequestMessage
  | WSPresenceUpdateMessage
  | WSPresenceSubscribeMessage
  | WSPresenceUnsubscribeMessage
  | WSTypingStartMessage
  | WSTypingStopMessage
  | WSChannelJoinMessage
  | WSChannelLeaveMessage
  | WSMessageSendMessage
  | WSThreadReplyMessage
  | WSThreadFollowMessage
  | WSThreadUnfollowMessage
  | WSVoiceRecordingStartMessage
  | WSVoiceRecordingStopMessage
  | WSRTCOfferMessage
  | WSRTCAnswerMessage
  | WSRTCIceCandidateMessage
  | WSRTCRenegotiateMessage
  | WSNotificationReadMessage
  | WSPingMessage;

// =============================================================================
// SERVER MESSAGE TYPES (Server -> Client)
// =============================================================================

export type ServerToClientMessage =
  | WSConnectionEstablishedMessage
  | WSConnectionErrorMessage
  | WSConnectionReconnectMessage
  | WSAuthSuccessMessage
  | WSAuthFailureMessage
  | WSAuthTokenRefreshMessage
  | WSPresenceSyncMessage
  | WSTypingUpdateMessage
  | WSChannelJoinedMessage
  | WSChannelLeftMessage
  | WSChannelCreatedMessage
  | WSChannelUpdatedMessage
  | WSChannelDeletedMessage
  | WSChannelArchivedMessage
  | WSChannelMemberAddedMessage
  | WSChannelMemberRemovedMessage
  | WSChannelMemberUpdatedMessage
  | WSMessageSentMessage
  | WSMessageReceivedMessage
  | WSMessageUpdatedMessage
  | WSMessageDeletedMessage
  | WSMessagePinnedMessage
  | WSMessageUnpinnedMessage
  | WSMessageReactionAddedMessage
  | WSMessageReactionRemovedMessage
  | WSMessageReadMessage
  | WSMessageDeliveredMessage
  | WSThreadRepliedMessage
  | WSFileUploadStartMessage
  | WSFileUploadProgressMessage
  | WSFileUploadCompleteMessage
  | WSFileUploadErrorMessage
  | WSVoiceUploadedMessage
  | WSVoiceTranscriptionStartMessage
  | WSVoiceTranscriptionProgressMessage
  | WSVoiceTranscriptionCompleteMessage
  | WSMeetingCreatedMessage
  | WSMeetingUpdatedMessage
  | WSMeetingStartingMessage
  | WSMeetingStartedMessage
  | WSMeetingEndedMessage
  | WSMeetingCancelledMessage
  | WSMeetingParticipantJoinedMessage
  | WSMeetingParticipantLeftMessage
  | WSMeetingParticipantUpdatedMessage
  | WSMeetingRecordingStartedMessage
  | WSMeetingRecordingStoppedMessage
  | WSMeetingTranscriptionUpdateMessage
  | WSRTCOfferMessage
  | WSRTCAnswerMessage
  | WSRTCIceCandidateMessage
  | WSRTCRenegotiateMessage
  | WSRTCTrackAddedMessage
  | WSRTCTrackRemovedMessage
  | WSNotificationNewMessage
  | WSNotificationClearedMessage
  | WSErrorMessage
  | WSPongMessage;

// =============================================================================
// PROTOCOL CONSTANTS
// =============================================================================

export const MESSAGING_WS_PROTOCOL = {
  VERSION: "1.0.0",
  HEARTBEAT_INTERVAL: 30000,     // 30 seconds
  CLIENT_TIMEOUT: 60000,         // 60 seconds
  RECONNECT_DELAY_BASE: 1000,    // 1 second
  RECONNECT_DELAY_MAX: 30000,    // 30 seconds
  MAX_MESSAGE_SIZE: 65536,       // 64KB
  TYPING_TIMEOUT: 10000,         // 10 seconds
  PRESENCE_UPDATE_INTERVAL: 60000, // 1 minute
} as const;

// =============================================================================
// ERROR CODES
// =============================================================================

export const MESSAGING_WS_ERROR_CODES = {
  // Connection errors
  CONNECTION_FAILED: "WS_001",
  CONNECTION_TIMEOUT: "WS_002",
  CONNECTION_CLOSED: "WS_003",

  // Authentication errors
  AUTH_REQUIRED: "AUTH_001",
  AUTH_INVALID_TOKEN: "AUTH_002",
  AUTH_TOKEN_EXPIRED: "AUTH_003",
  AUTH_PERMISSION_DENIED: "AUTH_004",

  // Channel errors
  CHANNEL_NOT_FOUND: "CHANNEL_001",
  CHANNEL_ACCESS_DENIED: "CHANNEL_002",
  CHANNEL_FULL: "CHANNEL_003",

  // Message errors
  MESSAGE_NOT_FOUND: "MSG_001",
  MESSAGE_TOO_LARGE: "MSG_002",
  MESSAGE_RATE_LIMITED: "MSG_003",
  MESSAGE_CONTENT_INVALID: "MSG_004",

  // File errors
  FILE_TOO_LARGE: "FILE_001",
  FILE_TYPE_NOT_ALLOWED: "FILE_002",
  FILE_UPLOAD_FAILED: "FILE_003",

  // Meeting errors
  MEETING_NOT_FOUND: "MEET_001",
  MEETING_FULL: "MEET_002",
  MEETING_NOT_STARTED: "MEET_003",
  MEETING_ALREADY_ENDED: "MEET_004",

  // General errors
  INVALID_MESSAGE_FORMAT: "ERR_001",
  INTERNAL_ERROR: "ERR_500",
} as const;

export type MessagingWSErrorCode = typeof MESSAGING_WS_ERROR_CODES[keyof typeof MESSAGING_WS_ERROR_CODES];
