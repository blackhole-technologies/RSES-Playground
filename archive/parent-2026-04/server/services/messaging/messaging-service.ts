/**
 * @file messaging-service.ts
 * @description Core messaging service for channels, messages, threads, and reactions.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Key Features:
 * - Channel management (public, private, DM, group DM, voice, broadcast)
 * - Message CRUD with rich content support
 * - Threading and replies
 * - Reactions and mentions
 * - Message search with full-text support
 * - Read receipts and delivery status
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  Channel,
  Message,
  MessageBlock,
  MessageSearchFilters,
  MessageSearchResponse,
  MessageSearchResult,
  SendMessageRequest,
  CreateChannelRequest,
  ChannelMember,
  MessageReaction,
  ThreadSummary,
} from "@shared/messaging/types";

const log = createModuleLogger("messaging-service");

// =============================================================================
// TYPES
// =============================================================================

interface MessagingServiceConfig {
  maxMessageLength?: number;
  maxAttachmentsPerMessage?: number;
  maxChannelsPerWorkspace?: number;
  maxMembersPerChannel?: number;
  messageRetentionDays?: number;
  enableReadReceipts?: boolean;
  enableTypingIndicators?: boolean;
  searchConfig?: {
    maxResults?: number;
    highlightLength?: number;
  };
}

interface ChannelStore {
  channels: Map<string, Channel>;
  members: Map<string, Map<string, ChannelMember>>;  // channelId -> userId -> member
}

interface MessageStore {
  messages: Map<string, Message>;
  channelMessages: Map<string, string[]>;  // channelId -> messageIds
  threadMessages: Map<string, string[]>;   // parentMessageId -> replyIds
}

// =============================================================================
// MESSAGING SERVICE
// =============================================================================

export class MessagingService extends EventEmitter {
  private config: Required<MessagingServiceConfig>;
  private channelStore: ChannelStore;
  private messageStore: MessageStore;
  private typingUsers: Map<string, Map<string, Date>>;  // channelId -> userId -> startedAt

  constructor(config: MessagingServiceConfig = {}) {
    super();

    this.config = {
      maxMessageLength: config.maxMessageLength ?? 40000,
      maxAttachmentsPerMessage: config.maxAttachmentsPerMessage ?? 10,
      maxChannelsPerWorkspace: config.maxChannelsPerWorkspace ?? 500,
      maxMembersPerChannel: config.maxMembersPerChannel ?? 1000,
      messageRetentionDays: config.messageRetentionDays ?? 365,
      enableReadReceipts: config.enableReadReceipts ?? true,
      enableTypingIndicators: config.enableTypingIndicators ?? true,
      searchConfig: {
        maxResults: config.searchConfig?.maxResults ?? 100,
        highlightLength: config.searchConfig?.highlightLength ?? 100,
      },
    };

    this.channelStore = {
      channels: new Map(),
      members: new Map(),
    };

    this.messageStore = {
      messages: new Map(),
      channelMessages: new Map(),
      threadMessages: new Map(),
    };

    this.typingUsers = new Map();

    // Clean up typing indicators periodically
    setInterval(() => this.cleanupTypingIndicators(), 5000);

    log.info("Messaging Service initialized");
  }

  // ===========================================================================
  // CHANNEL OPERATIONS
  // ===========================================================================

  /**
   * Create a new channel
   */
  async createChannel(request: CreateChannelRequest, creatorId: string): Promise<Channel> {
    const id = randomUUID();
    const now = new Date();

    // Validate channel name uniqueness within workspace
    const existingChannels = Array.from(this.channelStore.channels.values())
      .filter(c => c.workspaceId === request.workspaceId);

    if (existingChannels.length >= this.config.maxChannelsPerWorkspace) {
      throw new Error(`Maximum channels (${this.config.maxChannelsPerWorkspace}) reached for workspace`);
    }

    const existingName = existingChannels.find(
      c => c.name.toLowerCase() === request.name.toLowerCase() && c.type !== "direct"
    );

    if (existingName) {
      throw new Error(`Channel with name "${request.name}" already exists`);
    }

    const channel: Channel = {
      id,
      workspaceId: request.workspaceId,
      type: request.type,
      name: request.name,
      description: request.description,
      visibility: request.isPrivate ? "hidden" : "visible",
      config: {
        allowThreads: request.config?.allowThreads ?? true,
        allowReactions: request.config?.allowReactions ?? true,
        allowFileSharing: request.config?.allowFileSharing ?? true,
        allowVoiceMessages: request.config?.allowVoiceMessages ?? true,
        retentionDays: request.config?.retentionDays,
        maxFileSize: request.config?.maxFileSize,
        allowedFileTypes: request.config?.allowedFileTypes,
        slowMode: request.config?.slowMode,
        readOnly: request.config?.readOnly ?? false,
        encryptionEnabled: request.config?.encryptionEnabled ?? false,
      },
      members: [],
      memberCount: 0,
      createdBy: creatorId,
      createdAt: now,
      updatedAt: now,
      pinnedMessageIds: [],
    };

    this.channelStore.channels.set(id, channel);
    this.channelStore.members.set(id, new Map());
    this.messageStore.channelMessages.set(id, []);

    // Add creator as owner
    await this.addChannelMember(id, creatorId, "owner");

    // Add initial members if provided
    if (request.memberIds) {
      for (const memberId of request.memberIds) {
        if (memberId !== creatorId) {
          await this.addChannelMember(id, memberId, "member");
        }
      }
    }

    this.emit("channel:created", { channel, creatorId });
    log.info({ channelId: id, name: channel.name, type: channel.type }, "Channel created");

    return channel;
  }

  /**
   * Get a channel by ID
   */
  async getChannel(channelId: string): Promise<Channel | null> {
    return this.channelStore.channels.get(channelId) || null;
  }

  /**
   * Get channels for a workspace
   */
  async getWorkspaceChannels(workspaceId: string, userId: string): Promise<Channel[]> {
    const channels = Array.from(this.channelStore.channels.values())
      .filter(c => c.workspaceId === workspaceId);

    // Filter based on visibility and membership
    return channels.filter(channel => {
      if (channel.visibility === "visible" && channel.type === "public") {
        return true;
      }
      // Check membership for private/hidden channels
      const members = this.channelStore.members.get(channel.id);
      return members?.has(userId);
    });
  }

  /**
   * Update a channel
   */
  async updateChannel(
    channelId: string,
    updates: Partial<Pick<Channel, "name" | "description" | "topic" | "icon" | "visibility" | "config">>,
    updaterId: string
  ): Promise<Channel> {
    const channel = this.channelStore.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // Check permission
    const member = this.channelStore.members.get(channelId)?.get(updaterId);
    if (!member || !["owner", "admin"].includes(member.role)) {
      throw new Error("Permission denied: only owners and admins can update channels");
    }

    const updatedChannel: Channel = {
      ...channel,
      ...updates,
      config: updates.config ? { ...channel.config, ...updates.config } : channel.config,
      updatedAt: new Date(),
    };

    this.channelStore.channels.set(channelId, updatedChannel);
    this.emit("channel:updated", { channel: updatedChannel, updaterId });

    return updatedChannel;
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelId: string, deleterId: string): Promise<void> {
    const channel = this.channelStore.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // Check permission
    const member = this.channelStore.members.get(channelId)?.get(deleterId);
    if (!member || member.role !== "owner") {
      throw new Error("Permission denied: only owner can delete channel");
    }

    this.channelStore.channels.delete(channelId);
    this.channelStore.members.delete(channelId);
    this.messageStore.channelMessages.delete(channelId);

    this.emit("channel:deleted", { channelId, deleterId });
    log.info({ channelId }, "Channel deleted");
  }

  /**
   * Archive a channel
   */
  async archiveChannel(channelId: string, archiverId: string): Promise<Channel> {
    return this.updateChannel(channelId, { visibility: "archived" }, archiverId);
  }

  /**
   * Add a member to a channel
   */
  async addChannelMember(
    channelId: string,
    userId: string,
    role: ChannelMember["role"] = "member"
  ): Promise<ChannelMember> {
    const channel = this.channelStore.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const members = this.channelStore.members.get(channelId);
    if (!members) {
      throw new Error(`Channel members not initialized for ${channelId}`);
    }

    if (members.size >= this.config.maxMembersPerChannel) {
      throw new Error(`Maximum members (${this.config.maxMembersPerChannel}) reached for channel`);
    }

    const member: ChannelMember = {
      userId,
      role,
      joinedAt: new Date(),
      notificationPreference: "all",
      muted: false,
    };

    members.set(userId, member);

    // Update channel member count
    channel.memberCount = members.size;
    channel.members = Array.from(members.values());

    this.emit("channel:member_added", { channelId, member });
    return member;
  }

  /**
   * Remove a member from a channel
   */
  async removeChannelMember(channelId: string, userId: string, removerId: string): Promise<void> {
    const channel = this.channelStore.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const members = this.channelStore.members.get(channelId);
    if (!members) return;

    // Check permission
    const remover = members.get(removerId);
    const target = members.get(userId);

    if (!target) return;

    // Self-leave is always allowed
    if (userId !== removerId) {
      if (!remover || !["owner", "admin"].includes(remover.role)) {
        throw new Error("Permission denied");
      }
      // Can't remove owner
      if (target.role === "owner") {
        throw new Error("Cannot remove channel owner");
      }
    }

    members.delete(userId);
    channel.memberCount = members.size;
    channel.members = Array.from(members.values());

    this.emit("channel:member_removed", { channelId, userId, removerId });
  }

  /**
   * Get channel members
   */
  async getChannelMembers(channelId: string): Promise<ChannelMember[]> {
    const members = this.channelStore.members.get(channelId);
    return members ? Array.from(members.values()) : [];
  }

  /**
   * Check if user is a member of channel
   */
  async isChannelMember(channelId: string, userId: string): Promise<boolean> {
    const members = this.channelStore.members.get(channelId);
    return members?.has(userId) ?? false;
  }

  // ===========================================================================
  // MESSAGE OPERATIONS
  // ===========================================================================

  /**
   * Send a message
   */
  async sendMessage(request: SendMessageRequest, senderId: string, senderName: string, senderAvatar?: string): Promise<Message> {
    const channel = this.channelStore.channels.get(request.channelId);
    if (!channel) {
      throw new Error(`Channel ${request.channelId} not found`);
    }

    // Check membership
    if (!(await this.isChannelMember(request.channelId, senderId))) {
      throw new Error("Not a member of this channel");
    }

    // Check read-only
    if (channel.config.readOnly) {
      const member = this.channelStore.members.get(request.channelId)?.get(senderId);
      if (!member || !["owner", "admin"].includes(member.role)) {
        throw new Error("Channel is read-only");
      }
    }

    // Validate content length
    if (request.content.length > this.config.maxMessageLength) {
      throw new Error(`Message exceeds maximum length of ${this.config.maxMessageLength} characters`);
    }

    const id = randomUUID();
    const now = new Date();

    // Parse mentions from content
    const mentions = this.parseMentions(request.content, request.mentions);

    const message: Message = {
      id,
      channelId: request.channelId,
      threadId: request.threadId,
      userId: senderId,
      userName: senderName,
      userAvatar: senderAvatar,
      contentType: request.contentType || "text",
      content: request.content,
      blocks: request.blocks,
      isThreadParent: false,
      replyCount: 0,
      replyUsers: [],
      reactions: [],
      mentions,
      deliveryStatus: "sent",
      readReceipts: [],
      readCount: 0,
      isPinned: false,
      isEdited: false,
      isDeleted: false,
      isEncrypted: request.encrypt ?? false,
      createdAt: now,
      updatedAt: now,
      scheduledFor: request.scheduledFor,
    };

    // Store message
    this.messageStore.messages.set(id, message);

    // Add to channel messages
    const channelMessages = this.messageStore.channelMessages.get(request.channelId) || [];
    channelMessages.push(id);
    this.messageStore.channelMessages.set(request.channelId, channelMessages);

    // If this is a thread reply, update parent
    if (request.threadId) {
      const parentMessage = this.messageStore.messages.get(request.threadId);
      if (parentMessage) {
        parentMessage.isThreadParent = true;
        parentMessage.replyCount++;
        if (!parentMessage.replyUsers.includes(senderId)) {
          parentMessage.replyUsers.push(senderId);
        }
        parentMessage.lastReplyAt = now;

        // Add to thread messages
        const threadMessages = this.messageStore.threadMessages.get(request.threadId) || [];
        threadMessages.push(id);
        this.messageStore.threadMessages.set(request.threadId, threadMessages);
      }
    }

    // Update channel last message
    channel.lastMessageAt = now;
    channel.lastMessagePreview = message.content.substring(0, 100);

    this.emit("message:sent", { message });
    log.debug({ messageId: id, channelId: request.channelId }, "Message sent");

    return message;
  }

  /**
   * Get a message by ID
   */
  async getMessage(messageId: string): Promise<Message | null> {
    return this.messageStore.messages.get(messageId) || null;
  }

  /**
   * Get messages for a channel
   */
  async getChannelMessages(
    channelId: string,
    options: {
      before?: string;
      after?: string;
      limit?: number;
      includeDeleted?: boolean;
    } = {}
  ): Promise<Message[]> {
    const messageIds = this.messageStore.channelMessages.get(channelId) || [];
    const limit = options.limit ?? 50;

    let messages = messageIds
      .map(id => this.messageStore.messages.get(id))
      .filter((m): m is Message => m !== undefined)
      .filter(m => m.threadId === undefined);  // Exclude thread replies from main view

    if (!options.includeDeleted) {
      messages = messages.filter(m => !m.isDeleted);
    }

    // Apply cursor-based pagination
    if (options.before) {
      const beforeIndex = messages.findIndex(m => m.id === options.before);
      if (beforeIndex > 0) {
        messages = messages.slice(0, beforeIndex);
      }
    }

    if (options.after) {
      const afterIndex = messages.findIndex(m => m.id === options.after);
      if (afterIndex >= 0) {
        messages = messages.slice(afterIndex + 1);
      }
    }

    // Sort by creation date descending (newest first)
    messages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return messages.slice(0, limit);
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(parentMessageId: string, limit: number = 50): Promise<Message[]> {
    const replyIds = this.messageStore.threadMessages.get(parentMessageId) || [];

    const replies = replyIds
      .map(id => this.messageStore.messages.get(id))
      .filter((m): m is Message => m !== undefined && !m.isDeleted);

    // Sort by creation date ascending (oldest first for threads)
    replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return replies.slice(0, limit);
  }

  /**
   * Update a message
   */
  async updateMessage(
    messageId: string,
    // blocks are typed at the wire layer as unknown[] for forward
    // compatibility but stored as MessageBlock[] internally. We narrow
    // here so the assignment to updatedMessage.blocks compiles.
    updates: { content?: string; blocks?: MessageBlock[] },
    updaterId: string
  ): Promise<Message> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    // Only the author can edit
    if (message.userId !== updaterId) {
      throw new Error("Permission denied: only the author can edit a message");
    }

    // Store edit history
    const editHistory = message.editHistory || [];
    editHistory.push({
      content: message.content,
      editedAt: new Date(),
      editedBy: updaterId,
    });

    const updatedMessage: Message = {
      ...message,
      content: updates.content ?? message.content,
      blocks: updates.blocks ?? message.blocks,
      isEdited: true,
      editHistory,
      updatedAt: new Date(),
    };

    this.messageStore.messages.set(messageId, updatedMessage);
    this.emit("message:updated", { message: updatedMessage, updaterId });

    return updatedMessage;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, deleterId: string): Promise<void> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    // Check permission: author, or channel admin/owner
    const member = this.channelStore.members.get(message.channelId)?.get(deleterId);
    if (message.userId !== deleterId && (!member || !["owner", "admin"].includes(member.role))) {
      throw new Error("Permission denied");
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = deleterId;
    message.content = "[Message deleted]";
    message.blocks = undefined;
    message.attachments = undefined;

    this.emit("message:deleted", { messageId, channelId: message.channelId, deleterId });
    log.debug({ messageId }, "Message deleted");
  }

  /**
   * Pin a message
   */
  async pinMessage(messageId: string, pinnerId: string): Promise<void> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const channel = this.channelStore.channels.get(message.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Check permission
    const member = this.channelStore.members.get(message.channelId)?.get(pinnerId);
    if (!member || !["owner", "admin", "member"].includes(member.role)) {
      throw new Error("Permission denied");
    }

    message.isPinned = true;
    if (!channel.pinnedMessageIds.includes(messageId)) {
      channel.pinnedMessageIds.push(messageId);
    }

    this.emit("message:pinned", { messageId, channelId: message.channelId, pinnerId });
  }

  /**
   * Unpin a message
   */
  async unpinMessage(messageId: string, unpinnerId: string): Promise<void> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const channel = this.channelStore.channels.get(message.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    message.isPinned = false;
    channel.pinnedMessageIds = channel.pinnedMessageIds.filter(id => id !== messageId);

    this.emit("message:unpinned", { messageId, channelId: message.channelId, unpinnerId });
  }

  /**
   * Get pinned messages for a channel
   */
  async getPinnedMessages(channelId: string): Promise<Message[]> {
    const channel = this.channelStore.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    return channel.pinnedMessageIds
      .map(id => this.messageStore.messages.get(id))
      .filter((m): m is Message => m !== undefined && !m.isDeleted);
  }

  // ===========================================================================
  // REACTIONS
  // ===========================================================================

  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, emoji: string, userId: string): Promise<MessageReaction> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    // Check channel membership
    if (!(await this.isChannelMember(message.channelId, userId))) {
      throw new Error("Not a member of this channel");
    }

    // Find existing reaction
    let reaction = message.reactions.find(r => r.emoji === emoji);

    if (reaction) {
      // Add user if not already reacted
      if (!reaction.userIds.includes(userId)) {
        reaction.userIds.push(userId);
        reaction.count = reaction.userIds.length;
        reaction.lastReactedAt = new Date();
      }
    } else {
      // Create new reaction
      reaction = {
        emoji,
        userIds: [userId],
        count: 1,
        firstReactedAt: new Date(),
        lastReactedAt: new Date(),
      };
      message.reactions.push(reaction);
    }

    this.emit("message:reaction_added", { messageId, reaction, userId });
    return reaction;
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const message = this.messageStore.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const reaction = message.reactions.find(r => r.emoji === emoji);
    if (!reaction) return;

    reaction.userIds = reaction.userIds.filter(id => id !== userId);
    reaction.count = reaction.userIds.length;

    // Remove reaction if no users left
    if (reaction.count === 0) {
      message.reactions = message.reactions.filter(r => r.emoji !== emoji);
    }

    this.emit("message:reaction_removed", { messageId, emoji, userId });
  }

  // ===========================================================================
  // READ RECEIPTS
  // ===========================================================================

  /**
   * Mark a message as read
   */
  async markMessageRead(messageId: string, userId: string): Promise<void> {
    if (!this.config.enableReadReceipts) return;

    const message = this.messageStore.messages.get(messageId);
    if (!message) return;

    // Check if already read
    if (message.readReceipts.some(r => r.userId === userId)) return;

    message.readReceipts.push({
      userId,
      readAt: new Date(),
    });
    message.readCount = message.readReceipts.length;

    // Update delivery status
    if (message.deliveryStatus !== "read") {
      message.deliveryStatus = "read";
    }

    // Update member's last read
    const member = this.channelStore.members.get(message.channelId)?.get(userId);
    if (member) {
      member.lastRead = new Date();
      member.lastReadMessageId = messageId;
    }

    this.emit("message:read", { messageId, channelId: message.channelId, userId });
  }

  /**
   * Mark all messages in a channel as read up to a certain point
   */
  async markChannelRead(channelId: string, userId: string, upToMessageId?: string): Promise<void> {
    const messageIds = this.messageStore.channelMessages.get(channelId) || [];

    for (const messageId of messageIds) {
      await this.markMessageRead(messageId, userId);
      if (messageId === upToMessageId) break;
    }
  }

  // ===========================================================================
  // TYPING INDICATORS
  // ===========================================================================

  /**
   * Start typing indicator
   */
  startTyping(channelId: string, userId: string): void {
    if (!this.config.enableTypingIndicators) return;

    let channelTyping = this.typingUsers.get(channelId);
    if (!channelTyping) {
      channelTyping = new Map();
      this.typingUsers.set(channelId, channelTyping);
    }

    channelTyping.set(userId, new Date());
    this.emit("typing:start", { channelId, userId });
  }

  /**
   * Stop typing indicator
   */
  stopTyping(channelId: string, userId: string): void {
    const channelTyping = this.typingUsers.get(channelId);
    if (channelTyping) {
      channelTyping.delete(userId);
      this.emit("typing:stop", { channelId, userId });
    }
  }

  /**
   * Get users currently typing in a channel
   */
  getTypingUsers(channelId: string): string[] {
    const channelTyping = this.typingUsers.get(channelId);
    if (!channelTyping) return [];

    const now = Date.now();
    const typingTimeout = 10000; // 10 seconds

    const activeTyping: string[] = [];
    for (const [userId, startedAt] of channelTyping) {
      if (now - startedAt.getTime() < typingTimeout) {
        activeTyping.push(userId);
      }
    }

    return activeTyping;
  }

  /**
   * Clean up expired typing indicators
   */
  private cleanupTypingIndicators(): void {
    const now = Date.now();
    const typingTimeout = 10000;

    for (const [channelId, channelTyping] of this.typingUsers) {
      for (const [userId, startedAt] of channelTyping) {
        if (now - startedAt.getTime() > typingTimeout) {
          channelTyping.delete(userId);
          this.emit("typing:stop", { channelId, userId });
        }
      }
    }
  }

  // ===========================================================================
  // THREADS
  // ===========================================================================

  /**
   * Get thread summaries for a channel
   */
  async getChannelThreads(channelId: string, userId: string): Promise<ThreadSummary[]> {
    const messageIds = this.messageStore.channelMessages.get(channelId) || [];

    const threads: ThreadSummary[] = [];

    for (const messageId of messageIds) {
      const message = this.messageStore.messages.get(messageId);
      if (!message || !message.isThreadParent || message.isDeleted) continue;

      const threadReplies = await this.getThreadReplies(messageId, 1);
      const lastReply = threadReplies[threadReplies.length - 1];

      threads.push({
        parentMessageId: messageId,
        channelId,
        title: message.content.substring(0, 50),
        parentAuthorId: message.userId,
        parentAuthorName: message.userName,
        replyCount: message.replyCount,
        participantIds: message.replyUsers,
        participantCount: message.replyUsers.length,
        lastReplyAt: message.lastReplyAt || message.createdAt,
        lastReplyPreview: lastReply?.content.substring(0, 100),
        lastReplyAuthorName: lastReply?.userName,
        isFollowing: message.replyUsers.includes(userId),
        unreadCount: 0, // Would need to calculate based on read receipts
      });
    }

    // Sort by last reply date
    threads.sort((a, b) => b.lastReplyAt.getTime() - a.lastReplyAt.getTime());

    return threads;
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  /**
   * Search messages
   */
  async searchMessages(
    workspaceId: string,
    userId: string,
    filters: MessageSearchFilters
  ): Promise<MessageSearchResponse> {
    const startTime = Date.now();
    const results: MessageSearchResult[] = [];

    // Get channels user has access to
    const accessibleChannels = await this.getWorkspaceChannels(workspaceId, userId);
    const accessibleChannelIds = new Set(accessibleChannels.map(c => c.id));

    // Apply channel filter
    const searchChannelIds = filters.channelIds
      ? filters.channelIds.filter(id => accessibleChannelIds.has(id))
      : Array.from(accessibleChannelIds);

    // Search through messages
    const query = filters.query.toLowerCase();

    for (const channelId of searchChannelIds) {
      const messageIds = this.messageStore.channelMessages.get(channelId) || [];
      const channel = this.channelStore.channels.get(channelId);
      if (!channel) continue;

      for (const messageId of messageIds) {
        const message = this.messageStore.messages.get(messageId);
        if (!message || message.isDeleted) continue;

        // Apply filters
        if (filters.userIds && !filters.userIds.includes(message.userId)) continue;
        if (filters.fromDate && message.createdAt < filters.fromDate) continue;
        if (filters.toDate && message.createdAt > filters.toDate) continue;
        if (filters.hasAttachments && (!message.attachments || message.attachments.length === 0)) continue;
        if (filters.isPinned !== undefined && message.isPinned !== filters.isPinned) continue;
        if (filters.inThread !== undefined && (message.threadId !== undefined) !== filters.inThread) continue;
        if (filters.contentTypes && !filters.contentTypes.includes(message.contentType)) continue;
        if (filters.mentionsMe && !message.mentions.some(m => m.id === userId)) continue;

        // Text search
        const contentMatch = message.content.toLowerCase().includes(query);
        if (!contentMatch) continue;

        // Calculate relevance score
        const score = this.calculateSearchScore(message, query);

        // Generate highlights
        const highlights = this.generateHighlights(message, query);

        results.push({
          message,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
          },
          highlights,
          score,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Paginate. searchConfig.maxResults is optional in config; default to
    // 50 so the response shape remains a plain `number`.
    const pageSize = this.config.searchConfig.maxResults ?? 50;
    const paginatedResults = results.slice(0, pageSize);

    return {
      results: paginatedResults,
      total: results.length,
      page: 1,
      pageSize,
      took: Date.now() - startTime,
    };
  }

  /**
   * Calculate search relevance score
   */
  private calculateSearchScore(message: Message, query: string): number {
    let score = 0;

    const content = message.content.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match bonus
    if (content === queryLower) {
      score += 100;
    }

    // Count occurrences
    const occurrences = (content.match(new RegExp(queryLower, "g")) || []).length;
    score += occurrences * 10;

    // Recency bonus
    const ageInDays = (Date.now() - message.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 30 - ageInDays);

    // Reaction bonus
    score += message.reactions.reduce((sum, r) => sum + r.count, 0);

    // Pinned bonus
    if (message.isPinned) {
      score += 20;
    }

    return score;
  }

  /**
   * Generate search result highlights
   */
  private generateHighlights(message: Message, query: string): { content?: string[]; filename?: string[] } {
    const highlights: { content?: string[]; filename?: string[] } = {};
    const maxLength = this.config.searchConfig.highlightLength;

    // Content highlights
    const content = message.content;
    const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex !== -1) {
      const start = Math.max(0, queryIndex - 30);
      const end = Math.min(content.length, queryIndex + query.length + 30);
      let highlight = content.substring(start, end);

      if (start > 0) highlight = "..." + highlight;
      if (end < content.length) highlight = highlight + "...";

      highlights.content = [highlight];
    }

    // Filename highlights
    if (message.attachments) {
      const matchingFiles = message.attachments.filter(a =>
        a.filename.toLowerCase().includes(query.toLowerCase())
      );
      if (matchingFiles.length > 0) {
        highlights.filename = matchingFiles.map(f => f.filename);
      }
    }

    return highlights;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Parse mentions from message content
   */
  private parseMentions(
    content: string,
    providedMentions?: { type: string; id: string; displayName: string }[]
  ): Message["mentions"] {
    const mentions: Message["mentions"] = [];

    // Use provided mentions if available
    if (providedMentions) {
      for (const mention of providedMentions) {
        const pattern = mention.type === "user" ? `@${mention.displayName}` : mention.displayName;
        const index = content.indexOf(pattern);
        if (index !== -1) {
          mentions.push({
            type: mention.type as any,
            id: mention.id,
            displayName: mention.displayName,
            startIndex: index,
            endIndex: index + pattern.length,
          });
        }
      }
    }

    // Parse @everyone and @here
    const everyoneMatch = content.match(/@everyone/g);
    if (everyoneMatch) {
      let index = 0;
      for (const match of everyoneMatch) {
        const startIndex = content.indexOf(match, index);
        mentions.push({
          type: "everyone",
          id: "everyone",
          displayName: "@everyone",
          startIndex,
          endIndex: startIndex + match.length,
        });
        index = startIndex + 1;
      }
    }

    const hereMatch = content.match(/@here/g);
    if (hereMatch) {
      let index = 0;
      for (const match of hereMatch) {
        const startIndex = content.indexOf(match, index);
        mentions.push({
          type: "here",
          id: "here",
          displayName: "@here",
          startIndex,
          endIndex: startIndex + match.length,
        });
        index = startIndex + 1;
      }
    }

    return mentions;
  }

  /**
   * Get direct message channel between two users
   */
  async getOrCreateDMChannel(workspaceId: string, user1Id: string, user2Id: string): Promise<Channel> {
    // Check for existing DM channel
    const existingChannels = Array.from(this.channelStore.channels.values())
      .filter(c => c.workspaceId === workspaceId && c.type === "direct");

    for (const channel of existingChannels) {
      const members = this.channelStore.members.get(channel.id);
      if (members && members.size === 2 && members.has(user1Id) && members.has(user2Id)) {
        return channel;
      }
    }

    // Create new DM channel
    return this.createChannel(
      {
        workspaceId,
        type: "direct",
        name: `dm-${user1Id}-${user2Id}`,
        memberIds: [user2Id],
      },
      user1Id
    );
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.removeAllListeners();
    this.channelStore.channels.clear();
    this.channelStore.members.clear();
    this.messageStore.messages.clear();
    this.messageStore.channelMessages.clear();
    this.messageStore.threadMessages.clear();
    this.typingUsers.clear();
    log.info("Messaging Service shut down");
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let messagingServiceInstance: MessagingService | null = null;

export function getMessagingService(): MessagingService | null {
  return messagingServiceInstance;
}

export function initMessagingService(config?: MessagingServiceConfig): MessagingService {
  if (messagingServiceInstance) {
    log.warn("Messaging Service already initialized");
    return messagingServiceInstance;
  }

  messagingServiceInstance = new MessagingService(config);
  return messagingServiceInstance;
}

export function shutdownMessagingService(): void {
  if (messagingServiceInstance) {
    messagingServiceInstance.shutdown();
    messagingServiceInstance = null;
  }
}
