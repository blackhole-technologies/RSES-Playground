/**
 * @file types.ts
 * @description Core types for the RSES CMS Instant Messaging and Collaboration system.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Inspired by:
 * - Slack: Channels, threads, reactions, search
 * - Discord: Voice channels, reactions, presence
 * - Microsoft Teams: Meetings integration
 * - Zoom: WebRTC, recording
 * - Otter.ai: Transcription, summaries
 */

// =============================================================================
// USER & PRESENCE TYPES
// =============================================================================

/**
 * User presence status
 */
export type PresenceStatus = "online" | "away" | "busy" | "dnd" | "offline";

/**
 * User activity type
 */
export type ActivityType =
  | "typing"
  | "viewing"
  | "in_call"
  | "screen_sharing"
  | "recording"
  | "idle";

/**
 * User presence information
 */
export interface UserPresenceInfo {
  userId: string;
  status: PresenceStatus;
  activity?: ActivityType;
  activityDetails?: string;
  lastSeen: Date;
  customStatus?: {
    emoji?: string;
    text?: string;
    expiresAt?: Date;
  };
  deviceType?: "desktop" | "mobile" | "tablet" | "web";
}

/**
 * Typing indicator
 */
export interface TypingIndicator {
  userId: string;
  userName: string;
  channelId: string;
  threadId?: string;
  startedAt: Date;
}

// =============================================================================
// CHANNEL TYPES
// =============================================================================

/**
 * Channel types (like Slack)
 */
export type ChannelType =
  | "public"     // Open to all workspace members
  | "private"    // Invite-only
  | "direct"     // 1:1 conversation
  | "group_dm"   // Multi-party direct message
  | "voice"      // Voice channel (like Discord)
  | "broadcast"; // Announcement channel (admins post)

/**
 * Channel visibility
 */
export type ChannelVisibility = "visible" | "hidden" | "archived";

/**
 * Channel member role
 */
export type ChannelMemberRole = "owner" | "admin" | "member" | "guest";

/**
 * Channel member
 */
export interface ChannelMember {
  userId: string;
  role: ChannelMemberRole;
  joinedAt: Date;
  nickname?: string;
  notificationPreference: "all" | "mentions" | "none";
  muted: boolean;
  mutedUntil?: Date;
  lastRead?: Date;
  lastReadMessageId?: string;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  allowThreads: boolean;
  allowReactions: boolean;
  allowFileSharing: boolean;
  allowVoiceMessages: boolean;
  retentionDays?: number;  // Message retention period
  maxFileSize?: number;    // Max file size in bytes
  allowedFileTypes?: string[];
  slowMode?: number;       // Seconds between messages
  readOnly?: boolean;
  encryptionEnabled?: boolean;
}

/**
 * Channel entity
 */
export interface Channel {
  id: string;
  workspaceId: string;
  type: ChannelType;
  name: string;
  description?: string;
  topic?: string;
  icon?: string;
  visibility: ChannelVisibility;
  config: ChannelConfig;
  members: ChannelMember[];
  memberCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  pinnedMessageIds: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Message content types
 */
export type MessageContentType =
  | "text"
  | "file"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "code"
  | "embed"
  | "poll"
  | "system"
  | "call"
  | "meeting_link";

/**
 * Message formatting block
 */
export interface MessageBlock {
  type: "text" | "code" | "quote" | "list" | "divider" | "header" | "image" | "file" | "mention" | "emoji" | "link";
  content?: string;
  language?: string;  // For code blocks
  url?: string;       // For images, files, links
  userId?: string;    // For mentions
  items?: string[];   // For lists
  ordered?: boolean;  // For ordered lists
  level?: number;     // For headers (1-6)
  alt?: string;       // For images
  title?: string;     // For links/files
}

/**
 * Message attachment
 */
export interface MessageAttachment {
  id: string;
  type: "file" | "image" | "video" | "audio" | "voice";
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;  // For audio/video in seconds
  transcription?: string;  // For voice messages
  transcriptionConfidence?: number;
  uploadedBy: string;
  uploadedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Message embed (for link previews)
 */
export interface MessageEmbed {
  type: "link" | "video" | "image" | "rich";
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  author?: {
    name: string;
    url?: string;
    iconUrl?: string;
  };
  provider?: {
    name: string;
    url?: string;
  };
  color?: string;
  timestamp?: Date;
}

/**
 * Message reaction
 */
export interface MessageReaction {
  emoji: string;
  emojiId?: string;  // For custom emoji
  userIds: string[];
  count: number;
  firstReactedAt: Date;
  lastReactedAt: Date;
}

/**
 * Message mention
 */
export interface MessageMention {
  type: "user" | "channel" | "everyone" | "here" | "role";
  id: string;
  displayName: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Message delivery status
 */
export type MessageDeliveryStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

/**
 * Read receipt
 */
export interface ReadReceipt {
  userId: string;
  readAt: Date;
}

/**
 * Message edit history entry
 */
export interface MessageEdit {
  content: string;
  blocks?: MessageBlock[];
  editedAt: Date;
  editedBy: string;
}

/**
 * Core message entity
 */
export interface Message {
  id: string;
  channelId: string;
  threadId?: string;        // Parent message ID if this is a thread reply
  userId: string;
  userName: string;
  userAvatar?: string;

  // Content
  contentType: MessageContentType;
  content: string;          // Plain text or markdown
  blocks?: MessageBlock[];  // Rich formatting blocks
  attachments?: MessageAttachment[];
  embeds?: MessageEmbed[];

  // Threading
  isThreadParent: boolean;
  replyCount: number;
  replyUsers: string[];     // User IDs who replied
  lastReplyAt?: Date;

  // Interactions
  reactions: MessageReaction[];
  mentions: MessageMention[];

  // Delivery
  deliveryStatus: MessageDeliveryStatus;
  readReceipts: ReadReceipt[];
  readCount: number;

  // Metadata
  isPinned: boolean;
  isEdited: boolean;
  editHistory?: MessageEdit[];
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;

  // Security
  isEncrypted: boolean;
  encryptionKeyId?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Scheduling
  scheduledFor?: Date;

  // System messages
  systemEvent?: {
    type: string;
    data: Record<string, unknown>;
  };

  // Metadata
  metadata?: Record<string, unknown>;
}

// =============================================================================
// THREAD TYPES
// =============================================================================

/**
 * Thread summary for list views
 */
export interface ThreadSummary {
  parentMessageId: string;
  channelId: string;
  title?: string;           // First few words of parent message
  parentAuthorId: string;
  parentAuthorName: string;
  replyCount: number;
  participantIds: string[];
  participantCount: number;
  lastReplyAt: Date;
  lastReplyPreview?: string;
  lastReplyAuthorName?: string;
  isFollowing: boolean;
  unreadCount: number;
}

// =============================================================================
// FILE SHARING TYPES
// =============================================================================

/**
 * Shared file
 */
export interface SharedFile {
  id: string;
  channelId: string;
  messageId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  downloadCount: number;
  previewAvailable: boolean;
  virusScanStatus: "pending" | "clean" | "infected" | "error";
  uploadedAt: Date;
  expiresAt?: Date;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

/**
 * Message search filters
 */
export interface MessageSearchFilters {
  query: string;
  channelIds?: string[];
  userIds?: string[];
  fromDate?: Date;
  toDate?: Date;
  hasAttachments?: boolean;
  hasLinks?: boolean;
  isPinned?: boolean;
  inThread?: boolean;
  contentTypes?: MessageContentType[];
  fileTypes?: string[];
  mentionsMe?: boolean;
}

/**
 * Search result
 */
export interface MessageSearchResult {
  message: Message;
  channel: {
    id: string;
    name: string;
    type: ChannelType;
  };
  highlights: {
    content?: string[];
    filename?: string[];
  };
  score: number;
}

/**
 * Search response
 */
export interface MessageSearchResponse {
  results: MessageSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  took: number;  // Search duration in ms
}

// =============================================================================
// NOTIFICATION TYPES
// =============================================================================

/**
 * Notification type
 */
export type NotificationType =
  | "message"
  | "mention"
  | "reaction"
  | "thread_reply"
  | "channel_invite"
  | "dm"
  | "call_incoming"
  | "call_missed"
  | "meeting_starting"
  | "file_shared";

/**
 * Notification
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  channelId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

// =============================================================================
// VOICE MESSAGE TYPES
// =============================================================================

/**
 * Voice message recording
 */
export interface VoiceMessage {
  id: string;
  messageId: string;
  channelId: string;
  userId: string;
  duration: number;       // In seconds
  waveform: number[];     // Audio waveform data for visualization
  audioUrl: string;
  format: "webm" | "mp3" | "ogg" | "wav";
  sampleRate: number;
  bitrate: number;
  fileSize: number;

  // Transcription
  transcription?: VoiceTranscription;
  transcriptionStatus: "pending" | "processing" | "completed" | "failed";

  createdAt: Date;
}

/**
 * Voice transcription result
 */
export interface VoiceTranscription {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  confidence: number;
  duration: number;
  wordCount: number;
  model: string;        // e.g., "whisper-large-v3"
  processedAt: Date;
}

/**
 * Transcription segment with timing
 */
export interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;        // Start time in seconds
  end: number;          // End time in seconds
  confidence: number;
  words?: TranscriptionWord[];
  speaker?: string;     // Speaker ID for diarization
}

/**
 * Word-level transcription
 */
export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

// =============================================================================
// MEETING TYPES
// =============================================================================

/**
 * Meeting status
 */
export type MeetingStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "ended"
  | "cancelled";

/**
 * Meeting participant role
 */
export type MeetingParticipantRole = "host" | "co_host" | "presenter" | "attendee";

/**
 * Meeting participant
 */
export interface MeetingParticipant {
  id: string;
  oderId: string;
  name: string;
  avatar?: string;
  role: MeetingParticipantRole;
  joinedAt?: Date;
  leftAt?: Date;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  connectionQuality: "excellent" | "good" | "fair" | "poor";
  deviceType?: string;
}

/**
 * Meeting recording
 */
export interface MeetingRecording {
  id: string;
  meetingId: string;
  type: "video" | "audio" | "screen" | "combined";
  url: string;
  size: number;
  duration: number;
  format: string;
  resolution?: string;
  startedAt: Date;
  endedAt: Date;
  recordedBy: string;
  transcription?: MeetingTranscription;
  status: "recording" | "processing" | "ready" | "failed";
}

/**
 * Meeting transcription
 */
export interface MeetingTranscription {
  id: string;
  recordingId: string;
  meetingId: string;
  text: string;
  segments: TranscriptionSegment[];
  speakers: SpeakerInfo[];
  language: string;
  duration: number;
  processedAt: Date;
}

/**
 * Speaker information for diarization
 */
export interface SpeakerInfo {
  id: string;
  label: string;          // "Speaker 1", "Speaker 2", etc.
  userId?: string;        // Matched user ID if identified
  userName?: string;
  speakingTime: number;   // Total speaking time in seconds
  wordCount: number;
  segments: number[];     // Segment indices where this speaker appears
}

/**
 * Meeting summary (AI-generated)
 */
export interface MeetingSummary {
  id: string;
  meetingId: string;
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  participants: {
    userId: string;
    name: string;
    contributions: string[];
  }[];
  topics: {
    name: string;
    duration: number;
    summary: string;
  }[];
  sentiment: "positive" | "neutral" | "mixed" | "negative";
  generatedAt: Date;
  model: string;
}

/**
 * Action item extracted from meeting
 */
export interface ActionItem {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: Date;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
  source: {
    timestamp: number;
    transcriptSegmentId: number;
    quote: string;
  };
  createdAt: Date;
}

/**
 * Meeting entity
 */
export interface Meeting {
  id: string;
  channelId?: string;
  workspaceId: string;

  // Basic info
  title: string;
  description?: string;
  type: "instant" | "scheduled" | "recurring";
  status: MeetingStatus;

  // Scheduling
  scheduledStart?: Date;
  scheduledEnd?: Date;
  actualStart?: Date;
  actualEnd?: Date;
  timezone?: string;
  recurrence?: {
    pattern: "daily" | "weekly" | "monthly";
    interval: number;
    endDate?: Date;
    occurrences?: number;
  };

  // Participants
  hostId: string;
  participants: MeetingParticipant[];
  invitedUserIds: string[];
  maxParticipants?: number;

  // Settings
  settings: {
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
  };

  // Media
  recordings: MeetingRecording[];
  transcription?: MeetingTranscription;
  summary?: MeetingSummary;

  // Access
  joinUrl: string;
  dialInNumbers?: {
    country: string;
    number: string;
  }[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// WEBRTC SIGNALING TYPES
// =============================================================================

/**
 * WebRTC signal type
 */
export type WebRTCSignalType = "offer" | "answer" | "ice_candidate" | "renegotiate";

/**
 * WebRTC signaling message
 */
export interface WebRTCSignal {
  type: WebRTCSignalType;
  meetingId: string;
  fromUserId: string;
  toUserId?: string;     // undefined = broadcast
  sessionDescription?: RTCSessionDescriptionInit;
  iceCandidate?: RTCIceCandidateInit;
  timestamp: Date;
}

/**
 * Media stream track info
 */
export interface MediaTrackInfo {
  trackId: string;
  kind: "video" | "audio";
  userId: string;
  label?: string;
  enabled: boolean;
  muted: boolean;
  settings?: {
    width?: number;
    height?: number;
    frameRate?: number;
    facingMode?: string;
    sampleRate?: number;
    channelCount?: number;
  };
}

// =============================================================================
// VOICE COMMANDS
// =============================================================================

/**
 * Voice command
 */
export interface VoiceCommand {
  id: string;
  phrase: string;
  confidence: number;
  action: VoiceCommandAction;
  parameters?: Record<string, unknown>;
  executedAt: Date;
}

/**
 * Voice command actions
 */
export type VoiceCommandAction =
  | "send_message"
  | "search"
  | "switch_channel"
  | "start_call"
  | "end_call"
  | "mute"
  | "unmute"
  | "share_screen"
  | "create_task"
  | "set_reminder"
  | "read_messages";

// =============================================================================
// ENCRYPTION TYPES
// =============================================================================

/**
 * E2E encryption key
 */
export interface EncryptionKey {
  id: string;
  publicKey: string;
  privateKeyEncrypted?: string;  // Encrypted with user's password
  algorithm: "X25519" | "RSA-OAEP";
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}

/**
 * Key exchange for E2E encryption
 */
export interface KeyExchange {
  id: string;
  initiatorUserId: string;
  recipientUserId: string;
  initiatorPublicKey: string;
  recipientPublicKey?: string;
  sharedSecretHash?: string;  // Hash of shared secret for verification
  status: "pending" | "completed" | "failed" | "expired";
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

/**
 * Encrypted message payload
 */
export interface EncryptedPayload {
  ciphertext: string;       // Base64 encoded
  nonce: string;            // Base64 encoded
  keyId: string;
  algorithm: "XChaCha20-Poly1305" | "AES-256-GCM";
  version: number;
}

// =============================================================================
// WORKSPACE TYPES
// =============================================================================

/**
 * Workspace (organization/team)
 */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  ownerId: string;

  settings: {
    defaultChannelId?: string;
    allowGuestAccess: boolean;
    messageRetentionDays?: number;
    fileRetentionDays?: number;
    allowedDomains?: string[];
    ssoEnabled: boolean;
    mfaRequired: boolean;
    allowExternalFileSharing: boolean;
    e2eEncryptionEnabled: boolean;
  };

  subscription?: {
    plan: "free" | "pro" | "business" | "enterprise";
    memberLimit: number;
    storageLimit: number;  // In bytes
    features: string[];
  };

  memberCount: number;
  channelCount: number;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Send message request
 */
export interface SendMessageRequest {
  channelId: string;
  threadId?: string;
  content: string;
  contentType?: MessageContentType;
  blocks?: MessageBlock[];
  attachmentIds?: string[];
  mentions?: Omit<MessageMention, "startIndex" | "endIndex">[];
  replyToId?: string;
  scheduledFor?: Date;
  encrypt?: boolean;
}

/**
 * Create channel request
 */
export interface CreateChannelRequest {
  workspaceId: string;
  type: ChannelType;
  name: string;
  description?: string;
  isPrivate?: boolean;
  memberIds?: string[];
  config?: Partial<ChannelConfig>;
}

/**
 * Schedule meeting request
 */
export interface ScheduleMeetingRequest {
  workspaceId: string;
  channelId?: string;
  title: string;
  description?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone?: string;
  inviteeIds: string[];
  settings?: Partial<Meeting["settings"]>;
  recurrence?: Meeting["recurrence"];
}

/**
 * Upload file request metadata
 */
export interface UploadFileRequest {
  channelId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Upload file response with presigned URL
 */
export interface UploadFileResponse {
  fileId: string;
  uploadUrl: string;
  downloadUrl: string;
  expiresAt: Date;
}
