/**
 * @file index.ts
 * @description Messaging services module exports and initialization.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This module provides a complete instant messaging and collaboration system with:
 * - Real-time messaging via WebSocket
 * - Channel-based communication (Slack-like)
 * - Threading and replies
 * - Reactions and mentions
 * - Voice message recording and transcription
 * - Video conferencing with WebRTC
 * - Meeting recording and summaries
 * - End-to-end encryption option
 */

import type { Server } from "http";
import { createModuleLogger } from "../../logger";

// Service exports
export {
  MessagingService,
  getMessagingService,
  initMessagingService,
  shutdownMessagingService,
} from "./messaging-service";

export {
  VoiceTranscriptionService,
  getVoiceTranscriptionService,
  initVoiceTranscriptionService,
  shutdownVoiceTranscriptionService,
} from "./voice-transcription-service";

export {
  MeetingService,
  getMeetingService,
  initMeetingService,
  shutdownMeetingService,
} from "./meeting-service";

export {
  EncryptionService,
  getEncryptionService,
  initEncryptionService,
  shutdownEncryptionService,
} from "./encryption-service";

export {
  MessagingWSHandler,
  getMessagingWSHandler,
  initMessagingWSHandler,
  shutdownMessagingWSHandler,
} from "./messaging-ws-handler";

// Import for initialization
import {
  initMessagingService,
  shutdownMessagingService,
  getMessagingService,
} from "./messaging-service";

import {
  initVoiceTranscriptionService,
  shutdownVoiceTranscriptionService,
  getVoiceTranscriptionService,
} from "./voice-transcription-service";

import {
  initMeetingService,
  shutdownMeetingService,
  getMeetingService,
} from "./meeting-service";

import {
  initEncryptionService,
  shutdownEncryptionService,
  getEncryptionService,
} from "./encryption-service";

import {
  initMessagingWSHandler,
  shutdownMessagingWSHandler,
  getMessagingWSHandler,
} from "./messaging-ws-handler";

const log = createModuleLogger("messaging");

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the messaging system
 */
export interface MessagingSystemConfig {
  messaging?: {
    maxMessageLength?: number;
    maxAttachmentsPerMessage?: number;
    maxChannelsPerWorkspace?: number;
    maxMembersPerChannel?: number;
    messageRetentionDays?: number;
    enableReadReceipts?: boolean;
    enableTypingIndicators?: boolean;
  };
  voice?: {
    whisperApiKey?: string;
    whisperModel?: "whisper-1" | "whisper-large-v3";
    defaultLanguage?: string;
    enableDiarization?: boolean;
    maxAudioDuration?: number;
    voiceCommandsEnabled?: boolean;
  };
  meeting?: {
    maxParticipantsDefault?: number;
    maxMeetingDuration?: number;
    enableAutoRecording?: boolean;
    enableLiveTranscription?: boolean;
    aiSummaryEnabled?: boolean;
    stunServers?: string[];
    turnServers?: {
      urls: string;
      username?: string;
      credential?: string;
    }[];
  };
  encryption?: {
    keyRotationDays?: number;
    keyExchangeTimeout?: number;
    enableGroupEncryption?: boolean;
  };
  websocket?: {
    path?: string;
    heartbeatInterval?: number;
    clientTimeout?: number;
    maxConnections?: number;
    requireAuth?: boolean;
  };
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let isInitialized = false;

/**
 * Initialize all messaging services
 */
export function initMessagingSystem(
  httpServer: Server,
  config: MessagingSystemConfig = {}
): {
  messagingService: ReturnType<typeof getMessagingService>;
  voiceService: ReturnType<typeof getVoiceTranscriptionService>;
  meetingService: ReturnType<typeof getMeetingService>;
  encryptionService: ReturnType<typeof getEncryptionService>;
  wsHandler: ReturnType<typeof getMessagingWSHandler>;
} {
  if (isInitialized) {
    log.warn("Messaging system already initialized");
    return {
      messagingService: getMessagingService(),
      voiceService: getVoiceTranscriptionService(),
      meetingService: getMeetingService(),
      encryptionService: getEncryptionService(),
      wsHandler: getMessagingWSHandler(),
    };
  }

  log.info("Initializing messaging system...");

  // Initialize core services
  const messagingService = initMessagingService(config.messaging);
  const voiceService = initVoiceTranscriptionService(config.voice);
  const meetingService = initMeetingService(config.meeting);
  const encryptionService = initEncryptionService(config.encryption);

  // Initialize WebSocket handler with all services
  const wsHandler = initMessagingWSHandler(
    httpServer,
    {
      messaging: messagingService,
      voice: voiceService,
      meeting: meetingService,
      encryption: encryptionService,
    },
    config.websocket
  );

  isInitialized = true;
  log.info("Messaging system initialized successfully");

  return {
    messagingService,
    voiceService,
    meetingService,
    encryptionService,
    wsHandler,
  };
}

/**
 * Shutdown all messaging services
 */
export async function shutdownMessagingSystem(): Promise<void> {
  if (!isInitialized) {
    log.warn("Messaging system not initialized");
    return;
  }

  log.info("Shutting down messaging system...");

  // Shutdown in reverse order
  await shutdownMessagingWSHandler();
  shutdownEncryptionService();
  shutdownMeetingService();
  shutdownVoiceTranscriptionService();
  shutdownMessagingService();

  isInitialized = false;
  log.info("Messaging system shut down successfully");
}

/**
 * Check if messaging system is initialized
 */
export function isMessagingSystemInitialized(): boolean {
  return isInitialized;
}

/**
 * Get all services (convenience method)
 */
export function getMessagingServices() {
  return {
    messaging: getMessagingService(),
    voice: getVoiceTranscriptionService(),
    meeting: getMeetingService(),
    encryption: getEncryptionService(),
    wsHandler: getMessagingWSHandler(),
  };
}

// =============================================================================
// RE-EXPORT TYPES
// =============================================================================

// Re-export types from shared module for convenience
export type {
  Channel,
  ChannelType,
  ChannelMember,
  ChannelMemberRole,
  ChannelConfig,
  Message,
  MessageContentType,
  MessageBlock,
  MessageAttachment,
  MessageReaction,
  MessageMention,
  MessageSearchFilters,
  MessageSearchResponse,
  ThreadSummary,
  UserPresenceInfo,
  PresenceStatus,
  TypingIndicator,
  VoiceMessage,
  VoiceTranscription,
  TranscriptionSegment,
  VoiceCommand,
  VoiceCommandAction,
  Meeting,
  MeetingStatus,
  MeetingParticipant,
  MeetingRecording,
  MeetingTranscription,
  MeetingSummary,
  ActionItem,
  EncryptionKey,
  KeyExchange,
  EncryptedPayload,
  SendMessageRequest,
  CreateChannelRequest,
  ScheduleMeetingRequest,
  Workspace,
} from "@shared/messaging/types";

export type {
  MessagingWSMessage,
  MessagingWSMessageType,
  ClientToServerMessage,
  ServerToClientMessage,
  MESSAGING_WS_PROTOCOL,
  MESSAGING_WS_ERROR_CODES,
} from "@shared/messaging/ws-protocol";
