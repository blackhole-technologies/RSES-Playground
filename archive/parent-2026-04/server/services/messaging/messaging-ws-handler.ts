/**
 * @file messaging-ws-handler.ts
 * @description WebSocket handler for real-time messaging integration.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Integrates all messaging services with WebSocket for real-time communication.
 */

import { EventEmitter } from "events";
import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  MessagingWSMessage,
  ClientToServerMessage,
  ServerToClientMessage,
  WSAuthRequestMessage,
  WSMessageSendMessage,
  WSChannelJoinMessage,
  WSChannelLeaveMessage,
  WSTypingStartMessage,
  WSTypingStopMessage,
  WSPresenceUpdateMessage,
  MESSAGING_WS_PROTOCOL,
  MESSAGING_WS_ERROR_CODES,
} from "@shared/messaging/ws-protocol";
import type { UserPresenceInfo, MessageMention } from "@shared/messaging/types";

import { MessagingService } from "./messaging-service";
import { VoiceTranscriptionService } from "./voice-transcription-service";
import { MeetingService } from "./meeting-service";
import { EncryptionService } from "./encryption-service";

const log = createModuleLogger("messaging-ws-handler");

// =============================================================================
// TYPES
// =============================================================================

interface MessagingWSConfig {
  path?: string;
  heartbeatInterval?: number;
  clientTimeout?: number;
  maxConnections?: number;
  requireAuth?: boolean;
}

interface AuthenticatedClient {
  id: string;
  ws: WebSocket;
  userId: string;
  userName: string;
  workspaceId: string;
  isAlive: boolean;
  lastActivity: Date;
  subscribedChannels: Set<string>;
  currentMeetingId?: string;
  permissions: string[];
}

interface PendingClient {
  ws: WebSocket;
  connectedAt: Date;
  authTimeout: NodeJS.Timeout;
}

// =============================================================================
// MESSAGING WEBSOCKET HANDLER
// =============================================================================

export class MessagingWSHandler extends EventEmitter {
  private wss: WebSocketServer;
  private config: Required<MessagingWSConfig>;

  // Client management
  private authenticatedClients: Map<string, AuthenticatedClient>;
  private pendingClients: Map<WebSocket, PendingClient>;
  private userToClient: Map<string, string>;  // userId -> clientId

  // Services
  private messagingService: MessagingService;
  private voiceService: VoiceTranscriptionService;
  private meetingService: MeetingService;
  private encryptionService: EncryptionService;

  // Intervals
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    server: Server,
    services: {
      messaging: MessagingService;
      voice: VoiceTranscriptionService;
      meeting: MeetingService;
      encryption: EncryptionService;
    },
    config: MessagingWSConfig = {}
  ) {
    super();

    this.config = {
      path: config.path ?? "/ws/messaging",
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      clientTimeout: config.clientTimeout ?? 60000,
      maxConnections: config.maxConnections ?? 10000,
      requireAuth: config.requireAuth ?? true,
    };

    this.authenticatedClients = new Map();
    this.pendingClients = new Map();
    this.userToClient = new Map();

    this.messagingService = services.messaging;
    this.voiceService = services.voice;
    this.meetingService = services.meeting;
    this.encryptionService = services.encryption;

    // Create WebSocket server
    this.wss = new WebSocketServer({ server, path: this.config.path });

    // Set up event handlers
    this.wss.on("connection", this.handleConnection.bind(this));
    this.wss.on("error", this.handleServerError.bind(this));

    // Set up service event forwarding
    this.setupServiceEventForwarding();

    // Start heartbeat
    this.startHeartbeat();

    log.info({ path: this.config.path }, "Messaging WebSocket Handler initialized");
  }

  // ===========================================================================
  // CONNECTION HANDLING
  // ===========================================================================

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    // Check max connections
    if (this.authenticatedClients.size >= this.config.maxConnections) {
      this.sendError(ws, "CONNECTION_FAILED", "Server at capacity");
      ws.close(1013, "Server at capacity");
      return;
    }

    // Set up pending client with auth timeout
    const authTimeout = setTimeout(() => {
      if (this.pendingClients.has(ws)) {
        this.sendError(ws, "AUTH_REQUIRED", "Authentication timeout");
        ws.close(4001, "Authentication timeout");
        this.pendingClients.delete(ws);
      }
    }, 30000);  // 30 second auth timeout

    this.pendingClients.set(ws, {
      ws,
      connectedAt: new Date(),
      authTimeout,
    });

    // Send connection established message
    this.send(ws, {
      type: "connection:established",
      timestamp: Date.now(),
      clientId: "",  // Will be set after auth
      serverVersion: "1.0.0",
      capabilities: [
        "messaging",
        "channels",
        "threads",
        "reactions",
        "voice",
        "meetings",
        "encryption",
      ],
      heartbeatInterval: this.config.heartbeatInterval,
    });

    // Set up message handler
    ws.on("message", (data) => this.handleMessage(ws, data));
    ws.on("pong", () => this.handlePong(ws));
    ws.on("close", () => this.handleClose(ws));
    ws.on("error", (err) => this.handleClientError(ws, err));

    log.debug("New WebSocket connection");
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(ws: WebSocket, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as ClientToServerMessage;

      // Handle auth first
      if (message.type === "auth:request") {
        await this.handleAuth(ws, message as WSAuthRequestMessage);
        return;
      }

      // Require authentication for all other messages
      const client = this.getClientByWs(ws);
      if (!client) {
        this.sendError(ws, "AUTH_REQUIRED", "Authentication required");
        return;
      }

      // Update activity
      client.lastActivity = new Date();
      client.isAlive = true;

      // Route message to appropriate handler
      await this.routeMessage(client, message);
    } catch (error) {
      log.error({ error }, "Failed to handle message");
      this.sendError(ws, "INVALID_MESSAGE_FORMAT", "Invalid message format");
    }
  }

  /**
   * Handle authentication request
   */
  private async handleAuth(ws: WebSocket, message: WSAuthRequestMessage): Promise<void> {
    const pending = this.pendingClients.get(ws);
    if (!pending) {
      this.sendError(ws, "AUTH_INVALID_TOKEN", "Connection not found");
      return;
    }

    try {
      // In production, validate the token
      // For now, we accept the token and extract user info
      const { token, workspaceId } = message;

      // Mock token validation - in production use JWT verification
      const userId = this.extractUserIdFromToken(token);
      if (!userId) {
        clearTimeout(pending.authTimeout);
        this.pendingClients.delete(ws);
        this.send(ws, {
          type: "auth:failure",
          timestamp: Date.now(),
          code: "AUTH_INVALID_TOKEN",
          message: "Invalid or expired token",
        });
        ws.close(4003, "Invalid token");
        return;
      }

      // Check if user already connected
      const existingClientId = this.userToClient.get(userId);
      if (existingClientId) {
        const existingClient = this.authenticatedClients.get(existingClientId);
        if (existingClient) {
          // Disconnect old connection
          this.send(existingClient.ws, {
            type: "connection:error",
            timestamp: Date.now(),
            code: "CONNECTION_CLOSED",
            message: "Connected from another location",
          });
          existingClient.ws.close(4000, "Connected elsewhere");
          this.authenticatedClients.delete(existingClientId);
        }
      }

      // Create authenticated client
      const clientId = randomUUID();
      const client: AuthenticatedClient = {
        id: clientId,
        ws,
        userId,
        userName: `User ${userId.substring(0, 8)}`,  // Mock - get from user service
        workspaceId,
        isAlive: true,
        lastActivity: new Date(),
        subscribedChannels: new Set(),
        permissions: ["messaging", "channels"],  // Mock permissions
      };

      // Clear pending state
      clearTimeout(pending.authTimeout);
      this.pendingClients.delete(ws);

      // Store client
      this.authenticatedClients.set(clientId, client);
      this.userToClient.set(userId, clientId);

      // Send success
      this.send(ws, {
        type: "auth:success",
        timestamp: Date.now(),
        userId,
        userName: client.userName,
        workspaceId,
        permissions: client.permissions,
        subscribedChannels: [],
      });

      log.info({ clientId, userId, workspaceId }, "Client authenticated");

      // Broadcast presence update
      this.broadcastPresence(client, "online");
    } catch (error) {
      log.error({ error }, "Authentication failed");
      clearTimeout(pending.authTimeout);
      this.pendingClients.delete(ws);
      this.send(ws, {
        type: "auth:failure",
        timestamp: Date.now(),
        code: "AUTH_INVALID_TOKEN",
        message: "Authentication failed",
      });
      ws.close(4003, "Authentication failed");
    }
  }

  /**
   * Route message to appropriate handler
   */
  private async routeMessage(
    client: AuthenticatedClient,
    message: ClientToServerMessage
  ): Promise<void> {
    try {
      switch (message.type) {
        // Ping/Pong
        case "ping":
          this.send(client.ws, { type: "pong", timestamp: Date.now(), serverTime: Date.now() });
          break;

        // Presence
        case "presence:update":
          await this.handlePresenceUpdate(client, message as WSPresenceUpdateMessage);
          break;

        case "presence:subscribe":
          // Subscribe to presence updates for specific users
          break;

        case "presence:unsubscribe":
          // Unsubscribe from presence updates
          break;

        // Typing
        case "typing:start":
          await this.handleTypingStart(client, message as WSTypingStartMessage);
          break;

        case "typing:stop":
          // Use the correct stop-message type rather than reusing the
          // start message type. They share fields but are nominally
          // distinct in the protocol definition.
          await this.handleTypingStop(client, message as WSTypingStopMessage);
          break;

        // Channels
        case "channel:join":
          await this.handleChannelJoin(client, message as WSChannelJoinMessage);
          break;

        case "channel:leave":
          await this.handleChannelLeave(client, message as WSChannelLeaveMessage);
          break;

        // Messages
        case "message:send":
          await this.handleMessageSend(client, message as WSMessageSendMessage);
          break;

        // Threads
        case "thread:reply":
          await this.handleThreadReply(client, message as any);
          break;

        case "thread:follow":
        case "thread:unfollow":
          // Handle thread follow/unfollow
          break;

        // WebRTC signaling
        case "rtc:offer":
        case "rtc:answer":
        case "rtc:ice_candidate":
        case "rtc:renegotiate":
          await this.handleWebRTCSignal(client, message as any);
          break;

        // Notifications
        case "notification:read":
          // Mark notifications as read
          break;

        default:
          log.warn({ type: (message as any).type }, "Unknown message type");
      }
    } catch (error) {
      log.error({ error, type: message.type }, "Message handling failed");
      this.sendError(
        client.ws,
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Internal error",
        (message as any).id
      );
    }
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  /**
   * Handle presence update
   */
  private async handlePresenceUpdate(
    client: AuthenticatedClient,
    message: WSPresenceUpdateMessage
  ): Promise<void> {
    const presence: UserPresenceInfo = {
      ...message.presence,
      userId: client.userId,
      lastSeen: new Date(),
    };

    this.broadcastToWorkspace(client.workspaceId, {
      type: "presence:update",
      timestamp: Date.now(),
      presence,
    }, [client.id]);
  }

  /**
   * Handle typing start
   */
  private async handleTypingStart(
    client: AuthenticatedClient,
    message: WSTypingStartMessage
  ): Promise<void> {
    this.messagingService.startTyping(message.channelId, client.userId);

    // Broadcast to channel members
    this.broadcastToChannel(message.channelId, {
      type: "typing:update",
      timestamp: Date.now(),
      channelId: message.channelId,
      threadId: message.threadId,
      typingUsers: [{
        userId: client.userId,
        userName: client.userName,
        channelId: message.channelId,
        threadId: message.threadId,
        startedAt: new Date(),
      }],
    }, [client.id]);
  }

  /**
   * Handle typing stop
   */
  private async handleTypingStop(
    client: AuthenticatedClient,
    message: WSTypingStopMessage
  ): Promise<void> {
    this.messagingService.stopTyping(message.channelId, client.userId);
  }

  /**
   * Handle channel join
   */
  private async handleChannelJoin(
    client: AuthenticatedClient,
    message: WSChannelJoinMessage
  ): Promise<void> {
    const { channelId } = message;

    // Check membership
    const isMember = await this.messagingService.isChannelMember(channelId, client.userId);
    if (!isMember) {
      this.sendError(client.ws, "CHANNEL_ACCESS_DENIED", "Not a member of this channel");
      return;
    }

    // Subscribe to channel
    client.subscribedChannels.add(channelId);

    // Get channel and recent messages
    const channel = await this.messagingService.getChannel(channelId);
    const recentMessages = await this.messagingService.getChannelMessages(channelId, { limit: 50 });

    if (!channel) {
      this.sendError(client.ws, "CHANNEL_NOT_FOUND", "Channel not found");
      return;
    }

    this.send(client.ws, {
      type: "channel:joined",
      timestamp: Date.now(),
      channel,
      recentMessages,
      unreadCount: 0,  // Calculate from read receipts
    });

    // Notify other members
    this.broadcastToChannel(channelId, {
      type: "channel:member_added",
      timestamp: Date.now(),
      channelId,
      userId: client.userId,
      addedBy: client.userId,
      role: "member",
    }, [client.id]);
  }

  /**
   * Handle channel leave
   */
  private async handleChannelLeave(
    client: AuthenticatedClient,
    message: WSChannelLeaveMessage
  ): Promise<void> {
    const { channelId } = message;

    client.subscribedChannels.delete(channelId);

    this.send(client.ws, {
      type: "channel:left",
      timestamp: Date.now(),
      channelId,
    });
  }

  /**
   * Handle message send
   */
  private async handleMessageSend(
    client: AuthenticatedClient,
    message: WSMessageSendMessage
  ): Promise<void> {
    // Send message via service
    const sentMessage = await this.messagingService.sendMessage(
      {
        channelId: message.channelId,
        threadId: message.threadId,
        content: message.content,
        contentType: message.contentType as any,
        attachmentIds: message.attachmentIds,
        // The wire shape uses `type: string` while MessageMention narrows
        // to a literal union. Cast at this boundary; the messaging service
        // validates the actual values upstream.
        mentions: message.mentions as Omit<MessageMention, "startIndex" | "endIndex">[] | undefined,
      },
      client.userId,
      client.userName
    );

    // Acknowledge to sender
    this.send(client.ws, {
      type: "message:sent",
      timestamp: Date.now(),
      message: sentMessage,
      clientMessageId: message.clientMessageId,
    });

    // Broadcast to other channel members
    this.broadcastToChannel(message.channelId, {
      type: "message:received",
      timestamp: Date.now(),
      message: sentMessage,
    }, [client.id]);

    // Stop typing indicator
    this.messagingService.stopTyping(message.channelId, client.userId);
  }

  /**
   * Handle thread reply
   */
  private async handleThreadReply(
    client: AuthenticatedClient,
    message: any
  ): Promise<void> {
    const sentMessage = await this.messagingService.sendMessage(
      {
        channelId: message.channelId,
        threadId: message.parentMessageId,
        content: message.content,
      },
      client.userId,
      client.userName
    );

    // Acknowledge
    this.send(client.ws, {
      type: "message:sent",
      timestamp: Date.now(),
      message: sentMessage,
      clientMessageId: message.clientMessageId,
    });

    // Broadcast to channel
    this.broadcastToChannel(message.channelId, {
      type: "thread:replied",
      timestamp: Date.now(),
      parentMessageId: message.parentMessageId,
      reply: sentMessage,
      replyCount: (await this.messagingService.getMessage(message.parentMessageId))?.replyCount || 0,
      participants: [],
    }, [client.id]);
  }

  /**
   * Handle WebRTC signaling
   */
  private async handleWebRTCSignal(
    client: AuthenticatedClient,
    message: any
  ): Promise<void> {
    const { meetingId, toUserId } = message;

    // Forward to the target user
    const targetClientId = this.userToClient.get(toUserId);
    if (targetClientId) {
      const targetClient = this.authenticatedClients.get(targetClientId);
      if (targetClient) {
        this.send(targetClient.ws, {
          ...message,
          fromUserId: client.userId,
          timestamp: Date.now(),
        });
      }
    }

    // Also forward through meeting service for persistence
    switch (message.type) {
      case "rtc:offer":
        await this.meetingService.handleOffer(
          meetingId,
          client.userId,
          toUserId,
          message.offer
        );
        break;

      case "rtc:answer":
        await this.meetingService.handleAnswer(
          meetingId,
          client.userId,
          toUserId,
          message.answer
        );
        break;

      case "rtc:ice_candidate":
        await this.meetingService.handleIceCandidate(
          meetingId,
          client.userId,
          toUserId,
          message.candidate
        );
        break;
    }
  }

  // ===========================================================================
  // SERVICE EVENT FORWARDING
  // ===========================================================================

  /**
   * Set up forwarding of service events to WebSocket clients
   */
  private setupServiceEventForwarding(): void {
    // Messaging service events
    this.messagingService.on("message:sent", ({ message }) => {
      this.broadcastToChannel(message.channelId, {
        type: "message:received",
        timestamp: Date.now(),
        message,
      });
    });

    this.messagingService.on("message:updated", ({ message, updaterId }) => {
      this.broadcastToChannel(message.channelId, {
        type: "message:updated",
        timestamp: Date.now(),
        messageId: message.id,
        channelId: message.channelId,
        updates: {
          content: message.content,
          blocks: message.blocks as any,
          isPinned: message.isPinned,
        },
        updatedBy: updaterId,
        updatedAt: message.updatedAt.getTime(),
      });
    });

    this.messagingService.on("message:deleted", ({ messageId, channelId, deleterId }) => {
      this.broadcastToChannel(channelId, {
        type: "message:deleted",
        timestamp: Date.now(),
        messageId,
        channelId,
        deletedBy: deleterId,
      });
    });

    this.messagingService.on("message:reaction_added", ({ messageId, reaction, userId }) => {
      // Get channel ID from message
      this.messagingService.getMessage(messageId).then(msg => {
        if (msg) {
          this.broadcastToChannel(msg.channelId, {
            type: "message:reaction_added",
            timestamp: Date.now(),
            messageId,
            channelId: msg.channelId,
            reaction,
            addedBy: userId,
          });
        }
      });
    });

    // Voice service events
    this.voiceService.on("transcription:completed", ({ voiceMessageId, transcription }) => {
      this.voiceService.getVoiceMessage(voiceMessageId).then(vm => {
        if (vm) {
          this.broadcastToChannel(vm.channelId, {
            type: "voice:transcription_complete",
            timestamp: Date.now(),
            voiceMessageId,
            transcription,
          });
        }
      });
    });

    // Meeting service events
    this.meetingService.on("meeting:started", ({ meetingId, startedAt }) => {
      this.meetingService.getMeeting(meetingId).then(meeting => {
        if (meeting) {
          this.broadcastToWorkspace(meeting.workspaceId, {
            type: "meeting:started",
            timestamp: Date.now(),
            meetingId,
            startedAt,
            hostId: meeting.hostId,
          });
        }
      });
    });

    this.meetingService.on("meeting:participant_joined", ({ meetingId, participant }) => {
      this.meetingService.getMeeting(meetingId).then(meeting => {
        if (meeting) {
          // Notify all meeting participants
          for (const p of meeting.participants) {
            const clientId = this.userToClient.get(p.oderId);
            if (clientId) {
              const client = this.authenticatedClients.get(clientId);
              if (client) {
                this.send(client.ws, {
                  type: "meeting:participant_joined",
                  timestamp: Date.now(),
                  meetingId,
                  participant,
                });
              }
            }
          }
        }
      });
    });

    this.meetingService.on("meeting:transcription_update", ({ meetingId, segment }) => {
      this.meetingService.getMeeting(meetingId).then(meeting => {
        if (meeting) {
          for (const p of meeting.participants) {
            const clientId = this.userToClient.get(p.oderId);
            if (clientId) {
              const client = this.authenticatedClients.get(clientId);
              if (client) {
                this.send(client.ws, {
                  type: "meeting:transcription_update",
                  timestamp: Date.now(),
                  meetingId,
                  segment,
                });
              }
            }
          }
        }
      });
    });
  }

  // ===========================================================================
  // BROADCASTING
  // ===========================================================================

  /**
   * Broadcast message to all clients in a channel
   */
  private broadcastToChannel(
    channelId: string,
    message: ServerToClientMessage,
    excludeClientIds: string[] = []
  ): void {
    for (const [clientId, client] of this.authenticatedClients) {
      if (excludeClientIds.includes(clientId)) continue;
      if (!client.subscribedChannels.has(channelId)) continue;

      this.send(client.ws, message);
    }
  }

  /**
   * Broadcast message to all clients in a workspace
   */
  private broadcastToWorkspace(
    workspaceId: string,
    message: ServerToClientMessage,
    excludeClientIds: string[] = []
  ): void {
    for (const [clientId, client] of this.authenticatedClients) {
      if (excludeClientIds.includes(clientId)) continue;
      if (client.workspaceId !== workspaceId) continue;

      this.send(client.ws, message);
    }
  }

  /**
   * Broadcast presence update
   */
  private broadcastPresence(client: AuthenticatedClient, status: "online" | "offline"): void {
    const presence: UserPresenceInfo = {
      userId: client.userId,
      status,
      lastSeen: new Date(),
    };

    this.broadcastToWorkspace(client.workspaceId, {
      type: "presence:update",
      timestamp: Date.now(),
      presence,
    }, [client.id]);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Send message to WebSocket
   */
  private send(ws: WebSocket, message: ServerToClientMessage | MessagingWSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message
   */
  private sendError(
    ws: WebSocket,
    code: string,
    message: string,
    originalMessageId?: string
  ): void {
    this.send(ws, {
      type: "error",
      timestamp: Date.now(),
      code,
      message,
      originalMessageId,
    });
  }

  /**
   * Get authenticated client by WebSocket
   */
  private getClientByWs(ws: WebSocket): AuthenticatedClient | null {
    for (const client of this.authenticatedClients.values()) {
      if (client.ws === ws) return client;
    }
    return null;
  }

  /**
   * Extract user ID from token (mock implementation)
   */
  private extractUserIdFromToken(token: string): string | null {
    // In production, verify JWT and extract user ID
    // For now, accept any non-empty token
    if (!token || token.length < 10) return null;

    // Mock: use part of token as user ID
    return token.substring(0, 36);
  }

  /**
   * Handle pong response
   */
  private handlePong(ws: WebSocket): void {
    const client = this.getClientByWs(ws);
    if (client) {
      client.isAlive = true;
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(ws: WebSocket): void {
    // Clean up pending client
    const pending = this.pendingClients.get(ws);
    if (pending) {
      clearTimeout(pending.authTimeout);
      this.pendingClients.delete(ws);
      return;
    }

    // Clean up authenticated client
    const client = this.getClientByWs(ws);
    if (client) {
      // Broadcast offline presence
      this.broadcastPresence(client, "offline");

      // Leave any meetings
      if (client.currentMeetingId) {
        this.meetingService.leaveMeeting(client.currentMeetingId, client.userId).catch(() => {});
      }

      // Remove from maps
      this.authenticatedClients.delete(client.id);
      this.userToClient.delete(client.userId);

      log.info({ clientId: client.id, userId: client.userId }, "Client disconnected");
    }
  }

  /**
   * Handle client error
   */
  private handleClientError(ws: WebSocket, error: Error): void {
    const client = this.getClientByWs(ws);
    log.error({ error, clientId: client?.id }, "Client WebSocket error");
  }

  /**
   * Handle server error
   */
  private handleServerError(error: Error): void {
    log.error({ error }, "WebSocket server error");
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.authenticatedClients) {
        // Check for timeout
        if (!client.isAlive || now - client.lastActivity.getTime() > this.config.clientTimeout) {
          log.debug({ clientId }, "Client heartbeat timeout");
          client.ws.terminate();
          this.handleClose(client.ws);
          continue;
        }

        // Send ping
        client.isAlive = false;
        client.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.authenticatedClients.size;
  }

  /**
   * Get connected user IDs
   */
  getConnectedUserIds(): string[] {
    return Array.from(this.userToClient.keys());
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userToClient.has(userId);
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, message: ServerToClientMessage): boolean {
    const clientId = this.userToClient.get(userId);
    if (!clientId) return false;

    const client = this.authenticatedClients.get(clientId);
    if (!client) return false;

    this.send(client.ws, message);
    return true;
  }

  /**
   * Shutdown the handler
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down Messaging WebSocket Handler");

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    const closePromises: Promise<void>[] = [];

    for (const [ws, pending] of this.pendingClients) {
      clearTimeout(pending.authTimeout);
      closePromises.push(
        new Promise(resolve => {
          ws.close(1001, "Server shutting down");
          setTimeout(resolve, 100);
        })
      );
    }

    for (const client of this.authenticatedClients.values()) {
      closePromises.push(
        new Promise(resolve => {
          this.send(client.ws, {
            type: "connection:error",
            timestamp: Date.now(),
            code: "CONNECTION_CLOSED",
            message: "Server shutting down",
          });
          client.ws.close(1001, "Server shutting down");
          setTimeout(resolve, 100);
        })
      );
    }

    await Promise.all(closePromises);

    this.pendingClients.clear();
    this.authenticatedClients.clear();
    this.userToClient.clear();

    // Close WebSocket server
    await new Promise<void>((resolve, reject) => {
      this.wss.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    log.info("Messaging WebSocket Handler shut down");
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let wsHandlerInstance: MessagingWSHandler | null = null;

export function getMessagingWSHandler(): MessagingWSHandler | null {
  return wsHandlerInstance;
}

export function initMessagingWSHandler(
  server: Server,
  services: {
    messaging: MessagingService;
    voice: VoiceTranscriptionService;
    meeting: MeetingService;
    encryption: EncryptionService;
  },
  config?: MessagingWSConfig
): MessagingWSHandler {
  if (wsHandlerInstance) {
    log.warn("Messaging WebSocket Handler already initialized");
    return wsHandlerInstance;
  }

  wsHandlerInstance = new MessagingWSHandler(server, services, config);
  return wsHandlerInstance;
}

export async function shutdownMessagingWSHandler(): Promise<void> {
  if (wsHandlerInstance) {
    await wsHandlerInstance.shutdown();
    wsHandlerInstance = null;
  }
}
