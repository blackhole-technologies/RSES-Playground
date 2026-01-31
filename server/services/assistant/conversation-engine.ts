/**
 * @file conversation-engine.ts
 * @description AI Conversation Engine with Context and Memory
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Core conversation engine inspired by:
 * - ChatGPT: Multi-turn conversations, context retention
 * - Notion AI: Workspace-aware context
 * - Google Assistant: Entity resolution
 *
 * Features:
 * - Multi-turn conversation with context window
 * - Long-term memory storage and retrieval
 * - Entity tracking across turns
 * - Personalization based on user preferences
 * - Intent-aware response generation
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  AssistantSession,
  ConversationMessage,
  MessageContent,
  MessageMetadata,
  SessionContext,
  EntityReference,
  MemoryEntry,
  MemoryType,
  MemoryQuery,
  MemoryConsolidation,
  UserProfile,
  UserPreferences,
  ParsedIntent,
  ExtractedEntity,
  SentimentResult,
  PendingAction,
  AssistantEvent,
  SessionOptions,
  InputModality,
  OutputModality,
} from "./types";

const log = createModuleLogger("conversation-engine");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ConversationEngineConfig {
  /** Maximum messages in context window */
  maxContextMessages: number;
  /** Maximum memory entries to retrieve */
  maxMemoryRetrievals: number;
  /** Memory importance threshold */
  memoryImportanceThreshold: number;
  /** Session timeout in milliseconds */
  sessionTimeoutMs: number;
  /** Enable automatic memory consolidation */
  enableMemoryConsolidation: boolean;
  /** Consolidation interval in hours */
  consolidationIntervalHours: number;
  /** AI model configuration */
  modelConfig: {
    model: string;
    temperature: number;
    maxTokens: number;
    topP: number;
  };
}

const DEFAULT_CONFIG: ConversationEngineConfig = {
  maxContextMessages: 20,
  maxMemoryRetrievals: 10,
  memoryImportanceThreshold: 0.3,
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  enableMemoryConsolidation: true,
  consolidationIntervalHours: 24,
  modelConfig: {
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
  },
};

// =============================================================================
// MEMORY STORE
// =============================================================================

/**
 * In-memory storage for user memories.
 * In production, this would be backed by a vector database.
 */
class MemoryStore {
  private memories: Map<string, MemoryEntry[]> = new Map();
  private embeddings: Map<string, Float32Array> = new Map();

  constructor(private vectorDb?: unknown) {} // Vector DB injection

  async store(memory: MemoryEntry): Promise<void> {
    const userMemories = this.memories.get(memory.userId) || [];

    // Check for duplicate or similar memories
    const existingIndex = userMemories.findIndex(
      (m) => m.content === memory.content && m.type === memory.type
    );

    if (existingIndex >= 0) {
      // Update existing memory
      userMemories[existingIndex] = {
        ...userMemories[existingIndex],
        accessCount: userMemories[existingIndex].accessCount + 1,
        lastAccessed: new Date(),
        importance: Math.min(1, userMemories[existingIndex].importance + 0.1),
      };
    } else {
      userMemories.push(memory);
    }

    this.memories.set(memory.userId, userMemories);

    if (memory.embedding) {
      this.embeddings.set(memory.id, memory.embedding);
    }

    log.debug({ memoryId: memory.id, userId: memory.userId }, "Memory stored");
  }

  async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    const userMemories = this.memories.get(query.userId) || [];
    const now = new Date();

    let results = userMemories.filter((m) => {
      // Filter by type
      if (query.types && !query.types.includes(m.type)) {
        return false;
      }

      // Filter by tags
      if (query.tags && !query.tags.some((t) => m.tags.includes(t))) {
        return false;
      }

      // Filter by importance
      if (query.minImportance && m.importance < query.minImportance) {
        return false;
      }

      // Filter expired
      if (!query.includeExpired && m.expiresAt && m.expiresAt < now) {
        return false;
      }

      return true;
    });

    // Sort by relevance (importance * recency)
    results.sort((a, b) => {
      const aRecency = 1 / (1 + (now.getTime() - a.lastAccessed.getTime()) / (1000 * 60 * 60 * 24));
      const bRecency = 1 / (1 + (now.getTime() - b.lastAccessed.getTime()) / (1000 * 60 * 60 * 24));
      return (b.importance * bRecency) - (a.importance * aRecency);
    });

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    // Update access counts
    for (const memory of results) {
      memory.accessCount++;
      memory.lastAccessed = now;
    }

    return results;
  }

  async delete(memoryId: string): Promise<boolean> {
    for (const [userId, memories] of this.memories) {
      const index = memories.findIndex((m) => m.id === memoryId);
      if (index >= 0) {
        memories.splice(index, 1);
        this.embeddings.delete(memoryId);
        this.memories.set(userId, memories);
        return true;
      }
    }
    return false;
  }

  async consolidate(userId: string): Promise<MemoryConsolidation> {
    const userMemories = this.memories.get(userId) || [];
    const result: MemoryConsolidation = {
      merged: [],
      archived: [],
      updated: [],
      forgotten: [],
    };

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find low-importance, rarely accessed memories to forget
    const toForget = userMemories.filter(
      (m) =>
        m.importance < 0.2 &&
        m.accessCount < 3 &&
        m.lastAccessed < thirtyDaysAgo
    );

    for (const memory of toForget) {
      result.forgotten.push(memory.id);
      await this.delete(memory.id);
    }

    // Find expired memories to archive
    const expired = userMemories.filter(
      (m) => m.expiresAt && m.expiresAt < now && m.importance > 0.5
    );

    for (const memory of expired) {
      result.archived.push(memory.id);
      // In production, move to cold storage
    }

    log.info(
      {
        userId,
        forgotten: result.forgotten.length,
        archived: result.archived.length,
      },
      "Memory consolidation complete"
    );

    return result;
  }

  getStats(userId: string): { total: number; byType: Record<string, number> } {
    const userMemories = this.memories.get(userId) || [];
    const byType: Record<string, number> = {};

    for (const memory of userMemories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
    }

    return { total: userMemories.length, byType };
  }
}

// =============================================================================
// SESSION MANAGER
// =============================================================================

/**
 * Manages active conversation sessions.
 */
class SessionManager {
  private sessions: Map<string, AssistantSession> = new Map();
  private userSessions: Map<string, string[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private timeoutMs: number) {
    this.startCleanup();
  }

  create(userId: string, options?: SessionOptions): AssistantSession {
    const sessionId = randomUUID();
    const now = new Date();

    const session: AssistantSession = {
      sessionId,
      userId,
      startedAt: now,
      lastMessageAt: now,
      messageCount: 0,
      inputModality: options?.inputModality || "text",
      outputModality: options?.outputModality || "text",
      context: {
        activeEntities: new Map(),
        recentMessages: [],
        pendingActions: [],
        sessionGoals: [],
      },
      isActive: true,
    };

    this.sessions.set(sessionId, session);

    // Track user's sessions
    const userSessionIds = this.userSessions.get(userId) || [];
    userSessionIds.push(sessionId);
    this.userSessions.set(userId, userSessionIds);

    log.info({ sessionId, userId }, "Session created");
    return session;
  }

  get(sessionId: string): AssistantSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getByUser(userId: string): AssistantSession[] {
    const sessionIds = this.userSessions.get(userId) || [];
    return sessionIds
      .map((id) => this.sessions.get(id))
      .filter((s): s is AssistantSession => s !== undefined && s.isActive);
  }

  update(sessionId: string, updates: Partial<AssistantSession>): AssistantSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    Object.assign(session, updates);
    session.lastMessageAt = new Date();

    return session;
  }

  end(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      log.info(
        { sessionId, messageCount: session.messageCount },
        "Session ended"
      );
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, session] of this.sessions) {
        if (
          session.isActive &&
          now - session.lastMessageAt.getTime() > this.timeoutMs
        ) {
          this.end(sessionId);
        }
      }
    }, 60000); // Check every minute
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const session of this.sessions.values()) {
      session.isActive = false;
    }
  }
}

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Builds conversation context for the AI model.
 */
class ContextBuilder {
  constructor(
    private memoryStore: MemoryStore,
    private config: ConversationEngineConfig
  ) {}

  async buildContext(
    session: AssistantSession,
    userProfile: UserProfile,
    currentMessage: MessageContent
  ): Promise<string> {
    const parts: string[] = [];

    // System context
    parts.push(this.buildSystemContext(userProfile));

    // User memories
    const memories = await this.retrieveRelevantMemories(
      session.userId,
      currentMessage.text || ""
    );
    if (memories.length > 0) {
      parts.push(this.buildMemoryContext(memories));
    }

    // Active entities
    if (session.context.activeEntities.size > 0) {
      parts.push(this.buildEntityContext(session.context.activeEntities));
    }

    // Session goals
    if (session.context.sessionGoals.length > 0) {
      parts.push(`Current session goals:\n${session.context.sessionGoals.map((g) => `- ${g}`).join("\n")}`);
    }

    // Active workflow
    if (session.context.activeWorkflow) {
      parts.push(
        `Active workflow: ${session.context.activeWorkflow.workflowId} (Step ${session.context.activeWorkflow.currentActionIndex + 1})`
      );
    }

    // Pending actions
    if (session.context.pendingActions.length > 0) {
      parts.push(this.buildPendingActionsContext(session.context.pendingActions));
    }

    return parts.join("\n\n---\n\n");
  }

  private buildSystemContext(profile: UserProfile): string {
    const prefs = profile.preferences;
    return `You are an AI personal assistant for the RSES CMS.

User Profile:
- Name: ${profile.displayName}
- Timezone: ${profile.timezone}
- Locale: ${profile.locale}
- Communication style: ${prefs.communicationStyle}
- Preferred verbosity: ${prefs.verbosity}

Current time: ${new Date().toISOString()}

Guidelines:
- Be ${prefs.communicationStyle} in your responses
- Provide ${prefs.verbosity} explanations
- You can help with: content management, calendar scheduling, task management, and general assistance
- When asked to perform actions, confirm before executing
- Remember context from this conversation and past interactions`;
  }

  private async retrieveRelevantMemories(
    userId: string,
    query: string
  ): Promise<MemoryEntry[]> {
    return this.memoryStore.search({
      userId,
      query,
      minImportance: this.config.memoryImportanceThreshold,
      limit: this.config.maxMemoryRetrievals,
    });
  }

  private buildMemoryContext(memories: MemoryEntry[]): string {
    const lines = memories.map((m) => {
      const typeLabel = m.type.charAt(0).toUpperCase() + m.type.slice(1);
      return `[${typeLabel}] ${m.content}`;
    });
    return `Known information about the user:\n${lines.join("\n")}`;
  }

  private buildEntityContext(entities: Map<string, EntityReference>): string {
    const lines = Array.from(entities.values()).map(
      (e) => `- ${e.type}: ${e.name} (ID: ${e.id})`
    );
    return `Currently referenced items:\n${lines.join("\n")}`;
  }

  private buildPendingActionsContext(actions: PendingAction[]): string {
    const lines = actions.map(
      (a) => `- ${a.description} (expires: ${a.expiresAt.toISOString()})`
    );
    return `Pending actions awaiting confirmation:\n${lines.join("\n")}`;
  }

  buildConversationHistory(messages: ConversationMessage[]): Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }> {
    return messages.map((m) => ({
      role: m.role,
      content: m.content.text || "[Non-text content]",
    }));
  }
}

// =============================================================================
// RESPONSE GENERATOR
// =============================================================================

/**
 * Generates AI responses.
 */
class ResponseGenerator {
  constructor(private config: ConversationEngineConfig) {}

  async generate(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userMessage: string,
    intent?: ParsedIntent
  ): Promise<{
    text: string;
    tokensUsed: { prompt: number; completion: number; total: number };
    processingTime: number;
  }> {
    const startTime = Date.now();

    // In production, this would call the actual AI model
    // For now, simulate a response based on intent
    const response = await this.simulateResponse(userMessage, intent);

    const processingTime = Date.now() - startTime;

    // Estimate token usage
    const promptTokens = Math.ceil(
      (systemPrompt.length + conversationHistory.map((m) => m.content).join("").length + userMessage.length) / 4
    );
    const completionTokens = Math.ceil(response.length / 4);

    return {
      text: response,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      processingTime,
    };
  }

  private async simulateResponse(
    message: string,
    intent?: ParsedIntent
  ): Promise<string> {
    // Simulate AI latency
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    const lowerMessage = message.toLowerCase();

    // Intent-based responses
    if (intent) {
      switch (intent.domain) {
        case "calendar":
          return this.generateCalendarResponse(intent);
        case "tasks":
          return this.generateTaskResponse(intent);
        case "cms":
          return this.generateCMSResponse(intent);
        case "help":
          return this.generateHelpResponse();
        default:
          break;
      }
    }

    // Fallback pattern matching
    if (lowerMessage.includes("schedule") || lowerMessage.includes("meeting")) {
      return "I can help you schedule a meeting. What day and time works best for you?";
    }

    if (lowerMessage.includes("remind") || lowerMessage.includes("reminder")) {
      return "I'll set a reminder for you. When would you like to be reminded?";
    }

    if (lowerMessage.includes("create") && lowerMessage.includes("content")) {
      return "I can help you create content. What type of content would you like to create?";
    }

    if (lowerMessage.includes("publish")) {
      return "I can help you publish content. Which content would you like to publish?";
    }

    if (lowerMessage.includes("help")) {
      return this.generateHelpResponse();
    }

    // Default conversational response
    return `I understand you said: "${message}". How can I assist you with that?`;
  }

  private generateCalendarResponse(intent: ParsedIntent): string {
    switch (intent.action) {
      case "create":
        return "I'll create that calendar event for you. Please confirm the details: title, date, time, and any attendees.";
      case "list":
        return "Here are your upcoming events. Would you like to see more details for any of them?";
      case "check":
        return "Let me check your availability for that time slot.";
      case "reschedule":
        return "I can help reschedule that meeting. What new time works for you?";
      default:
        return "I can help with your calendar. Would you like to schedule, view, or modify an event?";
    }
  }

  private generateTaskResponse(intent: ParsedIntent): string {
    switch (intent.action) {
      case "create":
        return "I'll create that task for you. Would you like to set a due date or priority?";
      case "list":
        return "Here are your current tasks. Would you like me to filter by priority or due date?";
      case "complete":
        return "I've marked that task as complete. Well done!";
      case "update":
        return "I'll update that task. What changes would you like to make?";
      default:
        return "I can help manage your tasks. Would you like to create, view, or update a task?";
    }
  }

  private generateCMSResponse(intent: ParsedIntent): string {
    switch (intent.action) {
      case "create":
        return "I'll help you create new content. What type of content would you like to create?";
      case "publish":
        return "I can publish that content. Should I publish it now or schedule it for later?";
      case "update":
        return "I'll update that content for you. What changes would you like to make?";
      case "search":
        return "Let me search for that content in your CMS.";
      default:
        return "I can help with content management. What would you like to do?";
    }
  }

  private generateHelpResponse(): string {
    return `I'm your AI personal assistant for the RSES CMS. I can help you with:

**Calendar Management**
- Schedule meetings and events
- Check your availability
- Find optimal meeting times

**Task Management**
- Create and manage tasks
- Set reminders
- Track progress

**Content Management**
- Create and edit content
- Schedule publications
- Search and organize content

**Voice Commands** (if enabled)
- Dictate content
- Navigate hands-free

Just tell me what you'd like to do!`;
  }
}

// =============================================================================
// CONVERSATION ENGINE
// =============================================================================

/**
 * Main conversation engine class.
 */
export class ConversationEngine extends EventEmitter {
  private config: ConversationEngineConfig;
  private memoryStore: MemoryStore;
  private sessionManager: SessionManager;
  private contextBuilder: ContextBuilder;
  private responseGenerator: ResponseGenerator;
  private userProfiles: Map<string, UserProfile> = new Map();
  private conversationHistories: Map<string, ConversationMessage[]> = new Map();
  private consolidationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ConversationEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryStore = new MemoryStore();
    this.sessionManager = new SessionManager(this.config.sessionTimeoutMs);
    this.contextBuilder = new ContextBuilder(this.memoryStore, this.config);
    this.responseGenerator = new ResponseGenerator(this.config);

    if (this.config.enableMemoryConsolidation) {
      this.startMemoryConsolidation();
    }

    log.info({ config: this.config }, "Conversation engine initialized");
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  async startSession(
    userId: string,
    options?: SessionOptions
  ): Promise<AssistantSession> {
    // Ensure user profile exists
    if (!this.userProfiles.has(userId)) {
      await this.createDefaultProfile(userId);
    }

    const session = this.sessionManager.create(userId, options);
    this.conversationHistories.set(session.sessionId, []);

    this.emitEvent("session:started", { sessionId: session.sessionId, userId });

    return session;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessionManager.get(sessionId);
    if (!session) return;

    this.sessionManager.end(sessionId);

    // Archive conversation for potential learning
    const history = this.conversationHistories.get(sessionId);
    if (history && history.length > 0) {
      await this.archiveConversation(session, history);
    }

    this.emitEvent("session:ended", {
      sessionId,
      messageCount: session.messageCount,
    });
  }

  getSession(sessionId: string): AssistantSession | null {
    return this.sessionManager.get(sessionId);
  }

  // ===========================================================================
  // MESSAGE PROCESSING
  // ===========================================================================

  async processMessage(
    sessionId: string,
    content: MessageContent
  ): Promise<ConversationMessage> {
    const session = this.sessionManager.get(sessionId);
    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not found or inactive`);
    }

    const userProfile = this.userProfiles.get(session.userId);
    if (!userProfile) {
      throw new Error(`User profile not found for ${session.userId}`);
    }

    const startTime = Date.now();

    // Create user message
    const userMessage = this.createMessage(sessionId, "user", content);
    this.addMessageToHistory(sessionId, userMessage);

    this.emitEvent("message:received", {
      sessionId,
      messageId: userMessage.id,
    });

    // Extract entities and intent
    const entities = await this.extractEntities(content.text || "");
    const intent = await this.parseIntent(content.text || "", session.context);
    const sentiment = await this.analyzeSentiment(content.text || "");

    userMessage.metadata = {
      ...userMessage.metadata,
      intent,
      entities,
      sentiment,
    };

    // Update session context with entities
    this.updateSessionContext(session, entities, intent);

    // Extract and store facts if mentioned
    await this.extractAndStoreFacts(session.userId, content.text || "", entities);

    // Build context for AI
    const systemPrompt = await this.contextBuilder.buildContext(
      session,
      userProfile,
      content
    );

    const history = this.conversationHistories.get(sessionId) || [];
    const recentHistory = history.slice(-this.config.maxContextMessages);
    const conversationHistory = this.contextBuilder.buildConversationHistory(recentHistory);

    // Generate response
    const response = await this.responseGenerator.generate(
      systemPrompt,
      conversationHistory,
      content.text || "",
      intent
    );

    // Create assistant message
    const assistantMessage = this.createMessage(sessionId, "assistant", {
      text: response.text,
    });
    assistantMessage.metadata = {
      processingTime: Date.now() - startTime,
      tokensUsed: response.tokensUsed,
      model: this.config.modelConfig.model,
    };

    this.addMessageToHistory(sessionId, assistantMessage);

    // Update session
    this.sessionManager.update(sessionId, {
      messageCount: session.messageCount + 1,
      context: {
        ...session.context,
        recentMessages: recentHistory.slice(-5),
      },
    });

    this.emitEvent("message:sent", {
      sessionId,
      messageId: assistantMessage.id,
      processingTime: response.processingTime,
    });

    return assistantMessage;
  }

  async getConversationHistory(
    sessionId: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    const history = this.conversationHistories.get(sessionId) || [];
    return limit ? history.slice(-limit) : history;
  }

  // ===========================================================================
  // MEMORY MANAGEMENT
  // ===========================================================================

  async rememberFact(
    userId: string,
    fact: string,
    type: MemoryType
  ): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
      id: randomUUID(),
      userId,
      type,
      content: fact,
      importance: this.calculateImportance(fact, type),
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
      tags: this.extractTags(fact),
      relatedEntities: [],
    };

    await this.memoryStore.store(memory);

    this.emitEvent("memory:stored", { memoryId: memory.id, userId, type });

    return memory;
  }

  async recallMemories(query: MemoryQuery): Promise<MemoryEntry[]> {
    const memories = await this.memoryStore.search(query);

    if (memories.length > 0) {
      this.emitEvent("memory:recalled", {
        userId: query.userId,
        count: memories.length,
      });
    }

    return memories;
  }

  async forgetMemory(memoryId: string): Promise<void> {
    await this.memoryStore.delete(memoryId);
  }

  async consolidateMemories(userId: string): Promise<MemoryConsolidation> {
    return this.memoryStore.consolidate(userId);
  }

  // ===========================================================================
  // ENTITY EXTRACTION
  // ===========================================================================

  private async extractEntities(text: string): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];

    // Date extraction patterns
    const datePatterns = [
      { regex: /\b(today|tomorrow|yesterday)\b/gi, type: "date" as const },
      { regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, type: "date" as const },
      { regex: /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g, type: "date" as const },
      { regex: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?(\s*,?\s*\d{4})?\b/gi, type: "date" as const },
    ];

    // Time extraction patterns
    const timePatterns = [
      { regex: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi, type: "time" as const },
      { regex: /\b(noon|midnight|morning|afternoon|evening)\b/gi, type: "time" as const },
    ];

    // Duration patterns
    const durationPatterns = [
      { regex: /\b(\d+)\s*(hour|hr|minute|min|second|sec)s?\b/gi, type: "duration" as const },
    ];

    // Email pattern
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

    // URL pattern
    const urlPattern = /https?:\/\/[^\s]+/g;

    // Extract all patterns
    for (const { regex, type } of [...datePatterns, ...timePatterns, ...durationPatterns]) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
    }

    // Extract emails
    let match;
    while ((match = emailPattern.exec(text)) !== null) {
      entities.push({
        type: "email",
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.95,
      });
    }

    // Extract URLs
    while ((match = urlPattern.exec(text)) !== null) {
      entities.push({
        type: "url",
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.95,
      });
    }

    return entities;
  }

  // ===========================================================================
  // INTENT PARSING
  // ===========================================================================

  private async parseIntent(
    text: string,
    context: SessionContext
  ): Promise<ParsedIntent | undefined> {
    const lowerText = text.toLowerCase();

    // Calendar intents
    if (this.matchesPatterns(lowerText, ["schedule", "meeting", "appointment", "calendar"])) {
      return this.createIntent("calendar", this.detectAction(lowerText), text);
    }

    // Task intents
    if (this.matchesPatterns(lowerText, ["task", "todo", "remind", "reminder"])) {
      return this.createIntent("tasks", this.detectAction(lowerText), text);
    }

    // CMS intents
    if (this.matchesPatterns(lowerText, ["content", "publish", "create post", "article", "blog"])) {
      return this.createIntent("cms", this.detectAction(lowerText), text);
    }

    // Search intents
    if (this.matchesPatterns(lowerText, ["find", "search", "look for", "where is"])) {
      return this.createIntent("search", "search", text);
    }

    // Help intents
    if (this.matchesPatterns(lowerText, ["help", "how do i", "what can you", "assist"])) {
      return this.createIntent("help", "info", text);
    }

    // Settings intents
    if (this.matchesPatterns(lowerText, ["setting", "preference", "configure", "change my"])) {
      return this.createIntent("settings", "update", text);
    }

    // Default to conversation
    return this.createIntent("conversation", "chat", text);
  }

  private matchesPatterns(text: string, patterns: string[]): boolean {
    return patterns.some((p) => text.includes(p));
  }

  private detectAction(text: string): string {
    if (text.includes("create") || text.includes("new") || text.includes("add")) {
      return "create";
    }
    if (text.includes("list") || text.includes("show") || text.includes("view")) {
      return "list";
    }
    if (text.includes("update") || text.includes("edit") || text.includes("change")) {
      return "update";
    }
    if (text.includes("delete") || text.includes("remove") || text.includes("cancel")) {
      return "delete";
    }
    if (text.includes("complete") || text.includes("done") || text.includes("finish")) {
      return "complete";
    }
    if (text.includes("check") || text.includes("available")) {
      return "check";
    }
    return "query";
  }

  private createIntent(
    domain: ParsedIntent["domain"],
    action: string,
    text: string
  ): ParsedIntent {
    return {
      name: `${domain}.${action}`,
      confidence: 0.8,
      domain,
      action,
      requiresConfirmation: ["create", "delete", "publish", "update"].includes(action),
      slots: new Map(),
    };
  }

  // ===========================================================================
  // SENTIMENT ANALYSIS
  // ===========================================================================

  private async analyzeSentiment(text: string): Promise<SentimentResult> {
    const positiveWords = ["great", "thanks", "good", "love", "excellent", "happy", "wonderful", "amazing"];
    const negativeWords = ["bad", "hate", "terrible", "awful", "wrong", "error", "problem", "issue"];
    const urgentWords = ["urgent", "asap", "immediately", "critical", "emergency", "now"];

    const lowerText = text.toLowerCase();

    let positiveCount = 0;
    let negativeCount = 0;
    let urgencyLevel = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) positiveCount++;
    }

    for (const word of negativeWords) {
      if (lowerText.includes(word)) negativeCount++;
    }

    for (const word of urgentWords) {
      if (lowerText.includes(word)) urgencyLevel++;
    }

    const score = (positiveCount - negativeCount) / Math.max(1, positiveCount + negativeCount);
    const urgency: SentimentResult["urgency"] =
      urgencyLevel >= 2 ? "critical" : urgencyLevel === 1 ? "high" : "low";

    return {
      overall: score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral",
      score,
      emotions: [],
      urgency,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private createMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: MessageContent
  ): ConversationMessage {
    return {
      id: randomUUID(),
      sessionId,
      role,
      content,
      timestamp: new Date(),
      metadata: {},
    };
  }

  private addMessageToHistory(sessionId: string, message: ConversationMessage): void {
    const history = this.conversationHistories.get(sessionId) || [];
    history.push(message);

    // Trim old messages if needed
    if (history.length > this.config.maxContextMessages * 2) {
      history.splice(0, history.length - this.config.maxContextMessages);
    }

    this.conversationHistories.set(sessionId, history);
  }

  private updateSessionContext(
    session: AssistantSession,
    entities: ExtractedEntity[],
    intent?: ParsedIntent
  ): void {
    const now = new Date();

    // Add extracted entities to context
    for (const entity of entities) {
      if (["person", "organization", "project", "content"].includes(entity.type)) {
        session.context.activeEntities.set(entity.value, {
          type: entity.type,
          id: entity.value,
          name: entity.value,
          lastMentioned: now,
          attributes: {},
        });
      }
    }

    // Update topic based on intent
    if (intent) {
      session.context.currentTopic = intent.domain;
    }
  }

  private async extractAndStoreFacts(
    userId: string,
    text: string,
    entities: ExtractedEntity[]
  ): Promise<void> {
    // Look for fact patterns like "I work at...", "My name is...", "I prefer..."
    const factPatterns = [
      { regex: /I work at (.+)/i, type: "fact" as const },
      { regex: /I am (.+)/i, type: "fact" as const },
      { regex: /I prefer (.+)/i, type: "preference" as const },
      { regex: /I like (.+)/i, type: "preference" as const },
      { regex: /I don't like (.+)/i, type: "preference" as const },
      { regex: /my (.+) is (.+)/i, type: "fact" as const },
    ];

    for (const { regex, type } of factPatterns) {
      const match = text.match(regex);
      if (match) {
        await this.rememberFact(userId, match[0], type);
      }
    }
  }

  private calculateImportance(fact: string, type: MemoryType): number {
    // Higher importance for certain types
    const typeWeights: Record<MemoryType, number> = {
      fact: 0.7,
      preference: 0.8,
      goal: 0.9,
      relationship: 0.75,
      project: 0.7,
      context: 0.5,
      interaction: 0.4,
      feedback: 0.6,
    };

    return typeWeights[type] || 0.5;
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];

    // Extract hashtags
    const hashtagMatches = text.match(/#\w+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map((t) => t.substring(1)));
    }

    // Add domain-specific tags based on keywords
    const keywordTags: Record<string, string> = {
      work: "work",
      meeting: "calendar",
      deadline: "tasks",
      content: "cms",
      personal: "personal",
    };

    const lowerText = text.toLowerCase();
    for (const [keyword, tag] of Object.entries(keywordTags)) {
      if (lowerText.includes(keyword)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)];
  }

  private async createDefaultProfile(userId: string): Promise<UserProfile> {
    const profile: UserProfile = {
      userId,
      displayName: "User",
      timezone: "UTC",
      locale: "en-US",
      preferences: {
        communicationStyle: "friendly",
        verbosity: "balanced",
        responseFormat: "text",
        voiceEnabled: false,
        notifications: {
          enabled: true,
          channels: ["inApp"],
          frequency: "immediate",
        },
        calendar: {
          defaultDuration: 30,
          workingHoursStart: "09:00",
          workingHoursEnd: "17:00",
          workingDays: [1, 2, 3, 4, 5],
          bufferBetweenMeetings: 15,
        },
        tasks: {
          defaultPriority: "medium",
          defaultReminderOffset: 30,
        },
      },
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.userProfiles.set(userId, profile);
    return profile;
  }

  updateUserProfile(userId: string, updates: Partial<UserProfile>): void {
    const profile = this.userProfiles.get(userId);
    if (profile) {
      Object.assign(profile, updates);
      profile.lastActiveAt = new Date();
    }
  }

  getUserProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  private async archiveConversation(
    session: AssistantSession,
    history: ConversationMessage[]
  ): Promise<void> {
    // Summarize the conversation for long-term memory
    if (history.length > 5) {
      const summary = `Conversation on ${session.startedAt.toISOString()} with ${history.length} messages. ` +
        `Topics discussed: ${session.context.currentTopic || "general"}`;

      await this.rememberFact(session.userId, summary, "interaction");
    }
  }

  private startMemoryConsolidation(): void {
    const intervalMs = this.config.consolidationIntervalHours * 60 * 60 * 1000;

    this.consolidationTimer = setInterval(async () => {
      log.info("Starting periodic memory consolidation");

      for (const userId of this.userProfiles.keys()) {
        try {
          await this.consolidateMemories(userId);
        } catch (err) {
          log.error({ err, userId }, "Memory consolidation failed");
        }
      }
    }, intervalMs);
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    const event: AssistantEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
    };
    this.emit(type, event);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async shutdown(): Promise<void> {
    log.info("Shutting down conversation engine");

    // Stop memory consolidation
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }

    // End all active sessions
    this.sessionManager.shutdown();

    // Clear caches
    this.conversationHistories.clear();

    log.info("Conversation engine shutdown complete");
  }

  getStats(): {
    activeSessions: number;
    userProfiles: number;
    memoryStats: Record<string, { total: number; byType: Record<string, number> }>;
  } {
    const memoryStats: Record<string, { total: number; byType: Record<string, number> }> = {};

    for (const userId of this.userProfiles.keys()) {
      memoryStats[userId] = this.memoryStore.getStats(userId);
    }

    return {
      activeSessions: Array.from(this.userProfiles.keys())
        .flatMap((u) => this.sessionManager.getByUser(u))
        .filter((s) => s.isActive).length,
      userProfiles: this.userProfiles.size,
      memoryStats,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let conversationEngineInstance: ConversationEngine | null = null;

export function createConversationEngine(
  config?: Partial<ConversationEngineConfig>
): ConversationEngine {
  if (!conversationEngineInstance) {
    conversationEngineInstance = new ConversationEngine(config);
  }
  return conversationEngineInstance;
}

export function getConversationEngine(): ConversationEngine | null {
  return conversationEngineInstance;
}

export async function shutdownConversationEngine(): Promise<void> {
  if (conversationEngineInstance) {
    await conversationEngineInstance.shutdown();
    conversationEngineInstance = null;
  }
}
