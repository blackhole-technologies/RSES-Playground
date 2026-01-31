/**
 * @file types.ts
 * @description AI Personal Assistant Type Definitions
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Comprehensive type definitions for the AI Personal Assistant system including:
 * - Conversation and messaging types
 * - Memory and context management
 * - Calendar integration
 * - Task automation
 * - Voice processing
 * - Proactive notifications
 *
 * Design influenced by:
 * - ChatGPT: Conversational AI patterns
 * - Google Assistant: Calendar and task integration
 * - Siri: Voice command structures
 * - Notion AI: Workspace context awareness
 * - Calendly: Smart scheduling algorithms
 */

// =============================================================================
// CORE IDENTITY & SESSION
// =============================================================================

/**
 * User profile for personalization.
 */
export interface UserProfile {
  userId: string;
  displayName: string;
  email?: string;
  timezone: string;
  locale: string;
  preferences: UserPreferences;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * User preferences for assistant behavior.
 */
export interface UserPreferences {
  /** Communication style */
  communicationStyle: "formal" | "casual" | "professional" | "friendly";
  /** Response verbosity */
  verbosity: "concise" | "balanced" | "detailed";
  /** Preferred response format */
  responseFormat: "text" | "structured" | "markdown";
  /** Enable voice responses */
  voiceEnabled: boolean;
  /** Preferred voice */
  preferredVoice?: string;
  /** Wake word settings */
  wakeWord?: {
    enabled: boolean;
    customWord?: string;
  };
  /** Notification preferences */
  notifications: {
    enabled: boolean;
    quietHoursStart?: string; // HH:MM format
    quietHoursEnd?: string;
    channels: ("push" | "email" | "sms" | "inApp")[];
    frequency: "immediate" | "batched" | "daily";
  };
  /** Calendar preferences */
  calendar: {
    defaultDuration: number; // minutes
    workingHoursStart: string;
    workingHoursEnd: string;
    workingDays: number[]; // 0-6, Sunday = 0
    bufferBetweenMeetings: number; // minutes
  };
  /** Task preferences */
  tasks: {
    defaultPriority: "low" | "medium" | "high" | "urgent";
    defaultReminderOffset: number; // minutes before
  };
}

/**
 * Assistant session tracking.
 */
export interface AssistantSession {
  sessionId: string;
  userId: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  inputModality: InputModality;
  outputModality: OutputModality;
  context: SessionContext;
  isActive: boolean;
}

// =============================================================================
// CONVERSATION & MESSAGING
// =============================================================================

/**
 * Input/output modalities.
 */
export type InputModality = "text" | "voice" | "image" | "multimodal";
export type OutputModality = "text" | "voice" | "both";

/**
 * Conversation message.
 */
export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
  timestamp: Date;
  metadata: MessageMetadata;
}

/**
 * Multi-modal message content.
 */
export interface MessageContent {
  text?: string;
  audio?: AudioContent;
  images?: ImageContent[];
  attachments?: Attachment[];
  richContent?: RichContent;
}

/**
 * Audio content in messages.
 */
export interface AudioContent {
  format: "wav" | "mp3" | "ogg" | "webm";
  sampleRate: number;
  channels: number;
  duration: number; // seconds
  url?: string;
  data?: ArrayBuffer;
  transcription?: string;
  confidence?: number;
}

/**
 * Image content in messages.
 */
export interface ImageContent {
  url?: string;
  data?: ArrayBuffer;
  mimeType: string;
  width?: number;
  height?: number;
  description?: string;
  analysis?: ImageAnalysis;
}

/**
 * Image analysis result.
 */
export interface ImageAnalysis {
  labels: { label: string; confidence: number }[];
  text?: string; // OCR result
  objects?: { name: string; boundingBox: BoundingBox; confidence: number }[];
  faces?: FaceDetection[];
  colors?: { color: string; percentage: number }[];
}

/**
 * Bounding box for object detection.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Face detection result.
 */
export interface FaceDetection {
  boundingBox: BoundingBox;
  emotion?: string;
  confidence: number;
}

/**
 * File attachments.
 */
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  data?: ArrayBuffer;
}

/**
 * Rich content for structured responses.
 */
export interface RichContent {
  type: "card" | "list" | "table" | "form" | "calendar" | "chart" | "code";
  data: unknown;
}

/**
 * Message metadata.
 */
export interface MessageMetadata {
  processingTime?: number;
  tokensUsed?: { prompt: number; completion: number; total: number };
  model?: string;
  intent?: ParsedIntent;
  entities?: ExtractedEntity[];
  sentiment?: SentimentResult;
  language?: string;
  confidence?: number;
}

// =============================================================================
// MEMORY & CONTEXT
// =============================================================================

/**
 * Session context for conversation continuity.
 */
export interface SessionContext {
  /** Current topic being discussed */
  currentTopic?: string;
  /** Active entities in conversation */
  activeEntities: Map<string, EntityReference>;
  /** Recent messages for context window */
  recentMessages: ConversationMessage[];
  /** Current workflow if any */
  activeWorkflow?: WorkflowState;
  /** Pending actions awaiting confirmation */
  pendingActions: PendingAction[];
  /** User's stated goals for this session */
  sessionGoals: string[];
}

/**
 * Entity reference in conversation context.
 */
export interface EntityReference {
  type: string;
  id: string;
  name: string;
  lastMentioned: Date;
  attributes: Record<string, unknown>;
}

/**
 * Long-term memory entry.
 */
export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  embedding?: Float32Array;
  importance: number; // 0-1
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  expiresAt?: Date;
  tags: string[];
  relatedEntities: string[];
}

/**
 * Types of memories.
 */
export type MemoryType =
  | "fact" // User stated fact (e.g., "I work at Acme Corp")
  | "preference" // User preference (e.g., "I prefer morning meetings")
  | "context" // Contextual information
  | "interaction" // Past interaction summary
  | "feedback" // User feedback on assistant behavior
  | "goal" // User's goals and objectives
  | "relationship" // Relationship information
  | "project"; // Project-related context

/**
 * Memory search query.
 */
export interface MemoryQuery {
  userId: string;
  query?: string;
  types?: MemoryType[];
  tags?: string[];
  minImportance?: number;
  limit?: number;
  includeExpired?: boolean;
}

/**
 * Memory consolidation result.
 */
export interface MemoryConsolidation {
  merged: MemoryEntry[];
  archived: string[];
  updated: string[];
  forgotten: string[];
}

// =============================================================================
// INTENT & ENTITY RECOGNITION
// =============================================================================

/**
 * Parsed intent from user input.
 */
export interface ParsedIntent {
  name: string;
  confidence: number;
  domain: IntentDomain;
  action: string;
  subAction?: string;
  requiresConfirmation: boolean;
  slots: Map<string, SlotValue>;
}

/**
 * Intent domains for classification.
 */
export type IntentDomain =
  | "cms" // Content management operations
  | "calendar" // Calendar and scheduling
  | "tasks" // Task management
  | "search" // Search and query
  | "navigation" // App navigation
  | "settings" // Settings and preferences
  | "help" // Help and information
  | "conversation" // General conversation
  | "workflow" // Workflow automation
  | "analytics" // Analytics and reporting
  | "collaboration"; // Team collaboration

/**
 * Slot value from intent parsing.
 */
export interface SlotValue {
  value: unknown;
  confidence: number;
  normalized?: unknown;
  alternatives?: { value: unknown; confidence: number }[];
}

/**
 * Extracted entity from user input.
 */
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalizedValue?: unknown;
  startIndex: number;
  endIndex: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Entity types for extraction.
 */
export type EntityType =
  | "date"
  | "time"
  | "datetime"
  | "duration"
  | "person"
  | "organization"
  | "location"
  | "project"
  | "content"
  | "category"
  | "tag"
  | "number"
  | "currency"
  | "email"
  | "phone"
  | "url"
  | "file"
  | "action"
  | "custom";

/**
 * Sentiment analysis result.
 */
export interface SentimentResult {
  overall: "positive" | "negative" | "neutral" | "mixed";
  score: number; // -1 to 1
  emotions: { emotion: string; intensity: number }[];
  urgency: "low" | "medium" | "high" | "critical";
}

// =============================================================================
// CALENDAR INTEGRATION
// =============================================================================

/**
 * Supported calendar providers.
 */
export type CalendarProvider = "google" | "outlook" | "apple" | "caldav";

/**
 * Calendar connection configuration.
 */
export interface CalendarConnection {
  id: string;
  userId: string;
  provider: CalendarProvider;
  accountEmail: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  calendarIds: string[];
  isPrimary: boolean;
  syncEnabled: boolean;
  lastSyncAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Calendar event.
 */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  provider: CalendarProvider;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  isAllDay: boolean;
  recurrence?: RecurrenceRule;
  attendees: EventAttendee[];
  reminders: EventReminder[];
  status: "confirmed" | "tentative" | "cancelled";
  visibility: "public" | "private" | "default";
  busyStatus: "busy" | "free" | "tentative" | "outOfOffice";
  conferenceLink?: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Recurrence rule (RFC 5545 compatible).
 */
export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  count?: number;
  until?: Date;
  byDay?: string[]; // MO, TU, WE, etc.
  byMonth?: number[];
  byMonthDay?: number[];
  bySetPos?: number[];
  exceptions?: Date[];
}

/**
 * Event attendee.
 */
export interface EventAttendee {
  email: string;
  name?: string;
  status: "accepted" | "declined" | "tentative" | "needsAction";
  isOrganizer: boolean;
  isOptional: boolean;
}

/**
 * Event reminder.
 */
export interface EventReminder {
  method: "popup" | "email" | "sms" | "push";
  minutesBefore: number;
}

/**
 * Time slot for availability.
 */
export interface TimeSlot {
  start: Date;
  end: Date;
  timezone: string;
  available: boolean;
  conflictingEvents?: string[];
}

/**
 * Availability query.
 */
export interface AvailabilityQuery {
  userId: string;
  startDate: Date;
  endDate: Date;
  duration: number; // minutes
  preferredTimes?: {
    dayOfWeek: number;
    startHour: number;
    endHour: number;
  }[];
  excludeCalendars?: string[];
  attendees?: string[];
  timezone?: string;
}

/**
 * Smart scheduling suggestion.
 */
export interface SchedulingSuggestion {
  slot: TimeSlot;
  score: number; // 0-1, higher is better
  reasons: string[];
  conflicts: string[];
  alternatives: TimeSlot[];
}

/**
 * Meeting scheduling request.
 */
export interface MeetingRequest {
  title: string;
  description?: string;
  duration: number;
  attendees: string[];
  preferredTimeRanges?: { start: Date; end: Date }[];
  location?: string;
  conferenceType?: "none" | "zoom" | "meet" | "teams" | "webex";
  priority: "low" | "normal" | "high";
  flexibility: "fixed" | "flexible" | "very_flexible";
}

// =============================================================================
// TASK AUTOMATION
// =============================================================================

/**
 * Task definition.
 */
export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled" | "blocked";
  dueDate?: Date;
  startDate?: Date;
  estimatedDuration?: number; // minutes
  actualDuration?: number;
  tags: string[];
  project?: string;
  assignee?: string;
  dependencies: string[];
  subtasks: Subtask[];
  reminders: TaskReminder[];
  recurrence?: RecurrenceRule;
  source: TaskSource;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * Subtask definition.
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
}

/**
 * Task reminder.
 */
export interface TaskReminder {
  id: string;
  type: "before_due" | "after_start" | "scheduled";
  timing: number | Date; // minutes before due or specific date
  method: "push" | "email" | "sms" | "inApp";
  sent: boolean;
  sentAt?: Date;
}

/**
 * Task source tracking.
 */
export interface TaskSource {
  type: "manual" | "voice" | "email" | "calendar" | "workflow" | "assistant";
  originalText?: string;
  extractedFrom?: string;
  confidence?: number;
}

/**
 * Workflow definition.
 */
export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  conditions?: WorkflowCondition[];
  enabled: boolean;
  lastTriggered?: Date;
  executionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow trigger.
 */
export interface WorkflowTrigger {
  type: "schedule" | "event" | "command" | "webhook" | "condition";
  config: Record<string, unknown>;
}

/**
 * Workflow action.
 */
export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  config: Record<string, unknown>;
  order: number;
  onError: "continue" | "stop" | "retry";
  retryCount?: number;
  condition?: WorkflowCondition;
}

/**
 * Workflow action types.
 */
export type WorkflowActionType =
  | "create_content"
  | "publish_content"
  | "schedule_content"
  | "create_task"
  | "create_event"
  | "send_notification"
  | "send_email"
  | "call_api"
  | "run_script"
  | "wait"
  | "conditional"
  | "loop";

/**
 * Workflow condition.
 */
export interface WorkflowCondition {
  type: "and" | "or" | "not" | "comparison";
  left?: string | WorkflowCondition;
  operator?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "matches";
  right?: unknown;
  conditions?: WorkflowCondition[];
}

/**
 * Workflow execution state.
 */
export interface WorkflowState {
  workflowId: string;
  executionId: string;
  status: "running" | "paused" | "completed" | "failed";
  currentActionIndex: number;
  variables: Map<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  actionResults: WorkflowActionResult[];
}

/**
 * Workflow action result.
 */
export interface WorkflowActionResult {
  actionId: string;
  status: "success" | "failure" | "skipped";
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Pending action awaiting user confirmation.
 */
export interface PendingAction {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, unknown>;
  expiresAt: Date;
  confirmationRequired: boolean;
  createdAt: Date;
}

// =============================================================================
// VOICE PROCESSING
// =============================================================================

/**
 * Voice configuration.
 */
export interface VoiceConfig {
  /** Speech-to-text provider */
  sttProvider: "whisper" | "google" | "azure" | "deepgram";
  /** Text-to-speech provider */
  ttsProvider: "elevenlabs" | "google" | "azure" | "openai";
  /** Voice ID for TTS */
  voiceId: string;
  /** Voice settings */
  voiceSettings: VoiceSettings;
  /** Wake word configuration */
  wakeWord?: WakeWordConfig;
  /** Language settings */
  language: string;
  /** Alternative languages */
  alternativeLanguages?: string[];
}

/**
 * Voice settings for TTS.
 */
export interface VoiceSettings {
  speed: number; // 0.5 to 2.0
  pitch: number; // -20 to 20 semitones
  volume: number; // 0 to 1
  stability?: number; // ElevenLabs specific
  similarityBoost?: number; // ElevenLabs specific
  style?: number; // ElevenLabs specific
}

/**
 * Wake word configuration.
 */
export interface WakeWordConfig {
  enabled: boolean;
  keywords: string[];
  sensitivity: number; // 0 to 1
  timeout: number; // seconds to listen after wake word
}

/**
 * Speech-to-text request.
 */
export interface STTRequest {
  audio: AudioContent;
  language?: string;
  hints?: string[]; // Vocabulary hints
  enablePunctuation?: boolean;
  enableWordTimestamps?: boolean;
  speakerDiarization?: boolean;
  maxSpeakers?: number;
}

/**
 * Speech-to-text result.
 */
export interface STTResult {
  text: string;
  confidence: number;
  language: string;
  words?: WordTimestamp[];
  speakers?: SpeakerSegment[];
  processingTime: number;
}

/**
 * Word with timestamp.
 */
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

/**
 * Speaker segment for diarization.
 */
export interface SpeakerSegment {
  speaker: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Text-to-speech request.
 */
export interface TTSRequest {
  text: string;
  voiceId?: string;
  settings?: VoiceSettings;
  outputFormat?: "mp3" | "wav" | "ogg" | "opus";
  sampleRate?: number;
  ssml?: boolean;
}

/**
 * Text-to-speech result.
 */
export interface TTSResult {
  audio: ArrayBuffer;
  format: string;
  sampleRate: number;
  duration: number;
  charactersUsed: number;
}

/**
 * Voice command.
 */
export interface VoiceCommand {
  id: string;
  phrases: string[];
  action: string;
  parameters?: Record<string, string>;
  description: string;
  examples: string[];
  enabled: boolean;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * Notification definition.
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  body: string;
  richContent?: RichContent;
  actions?: NotificationAction[];
  channel: "push" | "email" | "sms" | "inApp";
  status: "pending" | "sent" | "delivered" | "read" | "dismissed";
  scheduledFor?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Notification types.
 */
export type NotificationType =
  | "reminder"
  | "task_due"
  | "event_upcoming"
  | "content_published"
  | "workflow_completed"
  | "suggestion"
  | "insight"
  | "alert"
  | "update"
  | "mention"
  | "reply"
  | "system";

/**
 * Notification action.
 */
export interface NotificationAction {
  id: string;
  label: string;
  action: string;
  parameters?: Record<string, unknown>;
  isPrimary: boolean;
}

/**
 * Proactive suggestion.
 */
export interface ProactiveSuggestion {
  id: string;
  userId: string;
  type: SuggestionType;
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  actions: SuggestionAction[];
  context: Record<string, unknown>;
  priority: number;
  expiresAt?: Date;
  dismissed: boolean;
  dismissedReason?: string;
  acceptedAction?: string;
  createdAt: Date;
}

/**
 * Suggestion types.
 */
export type SuggestionType =
  | "schedule_optimization"
  | "task_prioritization"
  | "content_timing"
  | "follow_up"
  | "automation_opportunity"
  | "insight"
  | "best_practice"
  | "learning"
  | "reminder_suggestion"
  | "meeting_prep";

/**
 * Suggestion action.
 */
export interface SuggestionAction {
  id: string;
  label: string;
  action: string;
  parameters?: Record<string, unknown>;
  confidence: number;
}

// =============================================================================
// CMS INTEGRATION
// =============================================================================

/**
 * Content operation for CMS.
 */
export interface ContentOperation {
  type: ContentOperationType;
  contentId?: string;
  contentType?: string;
  data?: Record<string, unknown>;
  schedule?: Date;
  options?: Record<string, unknown>;
}

/**
 * Content operation types.
 */
export type ContentOperationType =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "schedule"
  | "duplicate"
  | "move"
  | "archive"
  | "restore"
  | "translate"
  | "summarize"
  | "optimize";

/**
 * Content scheduling.
 */
export interface ContentSchedule {
  id: string;
  contentId: string;
  contentType: string;
  operation: ContentOperationType;
  scheduledFor: Date;
  timezone: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  createdBy: string;
  createdAt: Date;
  executedAt?: Date;
  error?: string;
}

// =============================================================================
// ANALYTICS & LEARNING
// =============================================================================

/**
 * Interaction analytics.
 */
export interface InteractionAnalytics {
  sessionId: string;
  userId: string;
  messageCount: number;
  averageResponseTime: number;
  intentAccuracy: number;
  taskCompletionRate: number;
  userSatisfaction?: number;
  feedbackReceived: boolean;
  modalities: InputModality[];
  topIntents: { intent: string; count: number }[];
  errorCount: number;
  timestamp: Date;
}

/**
 * Assistant learning feedback.
 */
export interface AssistantFeedback {
  id: string;
  sessionId: string;
  messageId: string;
  userId: string;
  rating?: number; // 1-5
  type: "positive" | "negative" | "correction" | "suggestion";
  category?: string;
  comment?: string;
  correctedResponse?: string;
  timestamp: Date;
}

/**
 * Learned user pattern.
 */
export interface UserPattern {
  id: string;
  userId: string;
  type: PatternType;
  pattern: string;
  frequency: number;
  lastOccurrence: Date;
  predictions: PatternPrediction[];
  confidence: number;
}

/**
 * Pattern types.
 */
export type PatternType =
  | "schedule" // User's scheduling patterns
  | "command" // Common command patterns
  | "content" // Content creation patterns
  | "workflow" // Workflow patterns
  | "preference"; // Preference patterns

/**
 * Pattern prediction.
 */
export interface PatternPrediction {
  prediction: string;
  probability: number;
  suggestedTime?: Date;
  suggestedAction?: string;
}

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/**
 * Main AI Assistant Service interface.
 */
export interface IAssistantService {
  // Session management
  startSession(userId: string, options?: SessionOptions): Promise<AssistantSession>;
  endSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<AssistantSession | null>;

  // Conversation
  processMessage(
    sessionId: string,
    content: MessageContent
  ): Promise<ConversationMessage>;
  getConversationHistory(
    sessionId: string,
    limit?: number
  ): Promise<ConversationMessage[]>;

  // Memory
  rememberFact(userId: string, fact: string, type: MemoryType): Promise<MemoryEntry>;
  recallMemories(query: MemoryQuery): Promise<MemoryEntry[]>;
  forgetMemory(memoryId: string): Promise<void>;

  // Suggestions
  getProactiveSuggestions(userId: string): Promise<ProactiveSuggestion[]>;
  dismissSuggestion(
    suggestionId: string,
    reason?: string
  ): Promise<void>;
  acceptSuggestion(suggestionId: string, actionId: string): Promise<void>;
}

/**
 * Calendar Service interface.
 */
export interface ICalendarService {
  // Connections
  connectCalendar(
    userId: string,
    provider: CalendarProvider,
    credentials: Record<string, string>
  ): Promise<CalendarConnection>;
  disconnectCalendar(connectionId: string): Promise<void>;
  getConnections(userId: string): Promise<CalendarConnection[]>;

  // Events
  getEvents(
    userId: string,
    startDate: Date,
    endDate: Date,
    calendarIds?: string[]
  ): Promise<CalendarEvent[]>;
  createEvent(
    userId: string,
    event: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
  ): Promise<CalendarEvent>;
  updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent>;
  deleteEvent(eventId: string): Promise<void>;

  // Availability
  getAvailability(query: AvailabilityQuery): Promise<TimeSlot[]>;
  suggestMeetingTimes(request: MeetingRequest): Promise<SchedulingSuggestion[]>;
  scheduleMeeting(
    userId: string,
    request: MeetingRequest,
    selectedSlot: TimeSlot
  ): Promise<CalendarEvent>;
}

/**
 * Task Service interface.
 */
export interface ITaskService {
  // Tasks
  createTask(userId: string, task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  getTasks(userId: string, filters?: TaskFilters): Promise<Task[]>;
  completeTask(taskId: string): Promise<Task>;

  // Workflows
  createWorkflow(userId: string, workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt">): Promise<Workflow>;
  executeWorkflow(workflowId: string, inputs?: Record<string, unknown>): Promise<WorkflowState>;
  getWorkflowStatus(executionId: string): Promise<WorkflowState>;

  // Automation
  parseNaturalLanguageTask(text: string): Promise<Partial<Task>>;
  suggestAutomation(userId: string, action: string): Promise<Workflow | null>;
}

/**
 * Voice Service interface.
 */
export interface IVoiceService {
  // Speech-to-text
  transcribe(request: STTRequest): Promise<STTResult>;
  transcribeStream(
    audioStream: AsyncIterable<ArrayBuffer>
  ): AsyncIterable<Partial<STTResult>>;

  // Text-to-speech
  synthesize(request: TTSRequest): Promise<TTSResult>;
  synthesizeStream(
    text: string,
    options?: Partial<TTSRequest>
  ): AsyncIterable<ArrayBuffer>;

  // Voice commands
  registerCommand(userId: string, command: VoiceCommand): Promise<void>;
  getCommands(userId: string): Promise<VoiceCommand[]>;
  processVoiceCommand(audio: AudioContent): Promise<{
    command?: VoiceCommand;
    transcription: string;
    confidence: number;
  }>;
}

/**
 * Notification Service interface.
 */
export interface INotificationService {
  // Notifications
  send(notification: Omit<Notification, "id" | "createdAt">): Promise<Notification>;
  schedule(notification: Omit<Notification, "id" | "createdAt">): Promise<Notification>;
  cancel(notificationId: string): Promise<void>;
  getNotifications(userId: string, filters?: NotificationFilters): Promise<Notification[]>;
  markAsRead(notificationId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;

  // Proactive suggestions
  generateSuggestions(userId: string): Promise<ProactiveSuggestion[]>;
  evaluateSuggestionTiming(suggestion: ProactiveSuggestion): Promise<Date | null>;
}

/**
 * Session options.
 */
export interface SessionOptions {
  inputModality?: InputModality;
  outputModality?: OutputModality;
  contextSize?: number;
  enableVoice?: boolean;
}

/**
 * Task filters.
 */
export interface TaskFilters {
  status?: Task["status"][];
  priority?: Task["priority"][];
  tags?: string[];
  project?: string;
  dueBeFor?: Date;
  dueBefore?: Date;
  dueAfter?: Date;
}

/**
 * Notification filters.
 */
export interface NotificationFilters {
  types?: NotificationType[];
  status?: Notification["status"][];
  priority?: Notification["priority"][];
  channel?: Notification["channel"];
  since?: Date;
  until?: Date;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Assistant event types.
 */
export type AssistantEventType =
  | "session:started"
  | "session:ended"
  | "message:received"
  | "message:sent"
  | "intent:parsed"
  | "action:executed"
  | "memory:stored"
  | "memory:recalled"
  | "suggestion:generated"
  | "suggestion:accepted"
  | "suggestion:dismissed"
  | "voice:transcribed"
  | "voice:synthesized"
  | "calendar:synced"
  | "task:created"
  | "task:completed"
  | "workflow:triggered"
  | "workflow:completed"
  | "notification:sent"
  | "error:occurred";

/**
 * Assistant event.
 */
export interface AssistantEvent {
  type: AssistantEventType;
  timestamp: Date;
  sessionId?: string;
  userId?: string;
  data: Record<string, unknown>;
}
