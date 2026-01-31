/**
 * @file index.ts
 * @description AI Personal Assistant - Main Service Entry Point
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Unified AI Personal Assistant service that integrates:
 * - Conversation Engine with Memory
 * - Calendar Integration (Google, Outlook, Apple)
 * - Voice Processing (STT, TTS, Wake Word)
 * - Task Automation and Workflows
 * - Proactive Notifications and Suggestions
 * - Natural Language Action Parsing
 *
 * Design inspired by:
 * - ChatGPT: Conversational AI, memory
 * - Google Assistant: Calendar, tasks, voice
 * - Siri: Voice commands, shortcuts
 * - Notion AI: Workspace assistant
 * - Calendly: Smart scheduling
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../../logger";

// Import all services
import {
  ConversationEngine,
  createConversationEngine,
  getConversationEngine,
  shutdownConversationEngine,
} from "./conversation-engine";

import {
  CalendarService,
  createCalendarService,
  getCalendarService,
  shutdownCalendarService,
} from "./calendar-service";

import {
  VoiceService,
  createVoiceService,
  getVoiceService,
  shutdownVoiceService,
} from "./voice-service";

import {
  TaskAutomationService,
  createTaskAutomationService,
  getTaskAutomationService,
  shutdownTaskAutomationService,
} from "./task-automation-service";

import {
  NotificationService,
  createNotificationService,
  getNotificationService,
  shutdownNotificationService,
} from "./notification-service";

import {
  ActionParser,
  createActionParser,
  getActionParser,
} from "./action-parser";

// Re-export types
export * from "./types";

// Re-export services
export {
  ConversationEngine,
  CalendarService,
  VoiceService,
  TaskAutomationService,
  NotificationService,
  ActionParser,
};

const log = createModuleLogger("assistant");

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface PersonalAssistantConfig {
  /** Enable conversation engine */
  enableConversation: boolean;
  /** Enable calendar integration */
  enableCalendar: boolean;
  /** Enable voice processing */
  enableVoice: boolean;
  /** Enable task automation */
  enableTasks: boolean;
  /** Enable notifications */
  enableNotifications: boolean;
  /** Conversation engine settings */
  conversation?: {
    maxContextMessages?: number;
    maxMemoryRetrievals?: number;
    sessionTimeoutMs?: number;
  };
  /** Calendar settings */
  calendar?: {
    syncIntervalMs?: number;
    maxEventsPerQuery?: number;
  };
  /** Voice settings */
  voice?: {
    defaultSTTProvider?: "whisper" | "google" | "azure" | "deepgram";
    defaultTTSProvider?: "elevenlabs" | "google" | "azure" | "openai";
    enableVAD?: boolean;
  };
  /** Task automation settings */
  tasks?: {
    maxTasksPerUser?: number;
    reminderCheckIntervalMs?: number;
  };
  /** Notification settings */
  notifications?: {
    maxNotificationsPerDay?: number;
    enableProactiveSuggestions?: boolean;
  };
}

const DEFAULT_CONFIG: PersonalAssistantConfig = {
  enableConversation: true,
  enableCalendar: true,
  enableVoice: true,
  enableTasks: true,
  enableNotifications: true,
};

// =============================================================================
// PERSONAL ASSISTANT SERVICE
// =============================================================================

/**
 * Main AI Personal Assistant service that orchestrates all components.
 */
export class PersonalAssistant extends EventEmitter {
  private config: PersonalAssistantConfig;
  private conversationEngine?: ConversationEngine;
  private calendarService?: CalendarService;
  private voiceService?: VoiceService;
  private taskService?: TaskAutomationService;
  private notificationService?: NotificationService;
  private actionParser?: ActionParser;
  private initialized: boolean = false;

  constructor(config: Partial<PersonalAssistantConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize all assistant services.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn("Personal assistant already initialized");
      return;
    }

    log.info("Initializing AI Personal Assistant");

    // Initialize action parser (always needed)
    this.actionParser = createActionParser();

    // Initialize conversation engine
    if (this.config.enableConversation) {
      this.conversationEngine = createConversationEngine(this.config.conversation);
      this.setupConversationEvents();
    }

    // Initialize calendar service
    if (this.config.enableCalendar) {
      this.calendarService = createCalendarService(this.config.calendar);
      this.setupCalendarEvents();
    }

    // Initialize voice service
    if (this.config.enableVoice) {
      this.voiceService = createVoiceService(this.config.voice);
      this.setupVoiceEvents();
    }

    // Initialize task automation
    if (this.config.enableTasks) {
      this.taskService = createTaskAutomationService(this.config.tasks);
      this.setupTaskEvents();
    }

    // Initialize notifications
    if (this.config.enableNotifications) {
      this.notificationService = createNotificationService(this.config.notifications);
      this.setupNotificationEvents();
    }

    this.initialized = true;
    log.info("AI Personal Assistant initialized successfully");
  }

  private setupConversationEvents(): void {
    if (!this.conversationEngine) return;

    this.conversationEngine.on("session:started", (event) => {
      this.emit("session:started", event);
    });

    this.conversationEngine.on("session:ended", (event) => {
      this.emit("session:ended", event);
    });

    this.conversationEngine.on("message:received", (event) => {
      this.emit("message:received", event);
    });

    this.conversationEngine.on("message:sent", (event) => {
      this.emit("message:sent", event);
    });

    this.conversationEngine.on("memory:stored", (event) => {
      this.emit("memory:stored", event);
    });
  }

  private setupCalendarEvents(): void {
    if (!this.calendarService) return;

    this.calendarService.on("event:created", (event) => {
      this.emit("calendar:event:created", event);
    });

    this.calendarService.on("event:updated", (event) => {
      this.emit("calendar:event:updated", event);
    });
  }

  private setupVoiceEvents(): void {
    if (!this.voiceService) return;

    this.voiceService.on("transcribed", (event) => {
      this.emit("voice:transcribed", event);
    });

    this.voiceService.on("synthesized", (event) => {
      this.emit("voice:synthesized", event);
    });

    this.voiceService.on("wakeword:detected", (event) => {
      this.emit("voice:wakeword", event);
    });
  }

  private setupTaskEvents(): void {
    if (!this.taskService) return;

    this.taskService.on("task:created", (event) => {
      this.emit("task:created", event);
    });

    this.taskService.on("task:completed", (event) => {
      this.emit("task:completed", event);
    });

    this.taskService.on("workflow:started", (event) => {
      this.emit("workflow:started", event);
    });

    this.taskService.on("workflow:completed", (event) => {
      this.emit("workflow:completed", event);
    });

    this.taskService.on("reminder:trigger", (event) => {
      this.emit("reminder:trigger", event);
      // Forward to notification service
      if (this.notificationService) {
        this.notificationService.send({
          userId: event.task.userId,
          type: "reminder",
          priority: event.task.priority === "urgent" ? "urgent" : "normal",
          title: `Reminder: ${event.task.title}`,
          body: event.task.description || "Task reminder",
          channel: "push",
          status: "pending",
        });
      }
    });
  }

  private setupNotificationEvents(): void {
    if (!this.notificationService) return;

    this.notificationService.on("notification:sent", (event) => {
      this.emit("notification:sent", event);
    });

    this.notificationService.on("suggestion:accepted", (event) => {
      this.emit("suggestion:accepted", event);
    });
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get the conversation engine.
   */
  getConversation(): ConversationEngine | undefined {
    return this.conversationEngine;
  }

  /**
   * Get the calendar service.
   */
  getCalendar(): CalendarService | undefined {
    return this.calendarService;
  }

  /**
   * Get the voice service.
   */
  getVoice(): VoiceService | undefined {
    return this.voiceService;
  }

  /**
   * Get the task automation service.
   */
  getTasks(): TaskAutomationService | undefined {
    return this.taskService;
  }

  /**
   * Get the notification service.
   */
  getNotifications(): NotificationService | undefined {
    return this.notificationService;
  }

  /**
   * Get the action parser.
   */
  getActionParser(): ActionParser | undefined {
    return this.actionParser;
  }

  /**
   * Process a text message from the user.
   */
  async processMessage(
    sessionId: string,
    text: string
  ): Promise<{
    response: string;
    intent?: string;
    action?: string;
    requiresFollowUp?: boolean;
  }> {
    if (!this.conversationEngine) {
      throw new Error("Conversation engine not initialized");
    }

    const session = this.conversationEngine.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Parse the message for intent
    const parsed = this.actionParser
      ? await this.actionParser.parse(text, session.context)
      : null;

    // Process through conversation engine
    const message = await this.conversationEngine.processMessage(sessionId, {
      text,
    });

    return {
      response: message.content.text || "",
      intent: parsed?.primaryIntent?.name,
      action: parsed?.primaryIntent?.action,
      requiresFollowUp: parsed?.primaryIntent
        ? this.actionParser?.getMissingSlots(parsed.primaryIntent).length > 0
        : false,
    };
  }

  /**
   * Process a voice message from the user.
   */
  async processVoiceMessage(
    sessionId: string,
    audio: ArrayBuffer
  ): Promise<{
    transcription: string;
    response: string;
    audioResponse?: ArrayBuffer;
  }> {
    if (!this.voiceService) {
      throw new Error("Voice service not initialized");
    }

    // Transcribe audio
    const sttResult = await this.voiceService.transcribe({
      audio: {
        format: "wav",
        sampleRate: 16000,
        channels: 1,
        duration: 0,
        data: audio,
      },
    });

    // Process the transcribed text
    const result = await this.processMessage(sessionId, sttResult.text);

    // Synthesize response if voice enabled
    const session = this.conversationEngine?.getSession(sessionId);
    let audioResponse: ArrayBuffer | undefined;

    if (session?.outputModality === "voice" || session?.outputModality === "both") {
      const ttsResult = await this.voiceService.synthesize({
        text: result.response,
      });
      audioResponse = ttsResult.audio;
    }

    return {
      transcription: sttResult.text,
      response: result.response,
      audioResponse,
    };
  }

  /**
   * Quick action - create a task from natural language.
   */
  async createTask(userId: string, text: string): Promise<{ taskId: string; title: string }> {
    if (!this.taskService) {
      throw new Error("Task service not initialized");
    }

    const task = await this.taskService.createTaskFromNaturalLanguage(userId, text);
    return { taskId: task.id, title: task.title };
  }

  /**
   * Quick action - schedule a meeting.
   */
  async scheduleMeeting(
    userId: string,
    title: string,
    startTime: Date,
    duration: number,
    attendees?: string[]
  ): Promise<{ eventId: string }> {
    if (!this.calendarService) {
      throw new Error("Calendar service not initialized");
    }

    const event = await this.calendarService.scheduleMeeting(
      userId,
      {
        title,
        duration,
        attendees: attendees || [],
        priority: "normal",
        flexibility: "fixed",
      },
      {
        start: startTime,
        end: new Date(startTime.getTime() + duration * 60 * 1000),
        timezone: "UTC",
        available: true,
      }
    );

    return { eventId: event.id };
  }

  /**
   * Get proactive suggestions for a user.
   */
  async getSuggestions(userId: string): Promise<unknown[]> {
    if (!this.notificationService) {
      return [];
    }

    return this.notificationService.getActiveSuggestions(userId);
  }

  /**
   * Get assistant statistics.
   */
  getStats(): {
    conversation?: ReturnType<ConversationEngine["getStats"]>;
    calendar?: ReturnType<CalendarService["getStats"]>;
    voice?: ReturnType<VoiceService["getStats"]>;
    tasks?: ReturnType<TaskAutomationService["getStats"]>;
    notifications?: ReturnType<NotificationService["getStats"]>;
  } {
    return {
      conversation: this.conversationEngine?.getStats(),
      calendar: this.calendarService?.getStats(),
      voice: this.voiceService?.getStats(),
      tasks: this.taskService?.getStats(),
      notifications: this.notificationService?.getStats(),
    };
  }

  /**
   * Shutdown all services.
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down AI Personal Assistant");

    await Promise.all([
      this.config.enableConversation && shutdownConversationEngine(),
      this.config.enableCalendar && shutdownCalendarService(),
      this.config.enableVoice && shutdownVoiceService(),
      this.config.enableTasks && shutdownTaskAutomationService(),
      this.config.enableNotifications && shutdownNotificationService(),
    ]);

    this.initialized = false;
    log.info("AI Personal Assistant shutdown complete");
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let personalAssistantInstance: PersonalAssistant | null = null;

/**
 * Create and initialize the personal assistant.
 */
export async function createPersonalAssistant(
  config?: Partial<PersonalAssistantConfig>
): Promise<PersonalAssistant> {
  if (!personalAssistantInstance) {
    personalAssistantInstance = new PersonalAssistant(config);
    await personalAssistantInstance.initialize();
  }
  return personalAssistantInstance;
}

/**
 * Get the personal assistant instance.
 */
export function getPersonalAssistant(): PersonalAssistant | null {
  return personalAssistantInstance;
}

/**
 * Shutdown the personal assistant.
 */
export async function shutdownPersonalAssistant(): Promise<void> {
  if (personalAssistantInstance) {
    await personalAssistantInstance.shutdown();
    personalAssistantInstance = null;
  }
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export {
  createConversationEngine,
  getConversationEngine,
  createCalendarService,
  getCalendarService,
  createVoiceService,
  getVoiceService,
  createTaskAutomationService,
  getTaskAutomationService,
  createNotificationService,
  getNotificationService,
  createActionParser,
  getActionParser,
};
