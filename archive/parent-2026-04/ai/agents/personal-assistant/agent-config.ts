/**
 * @file agent-config.ts
 * @description AI Agent Configuration for Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Agent-based architecture for the AI Personal Assistant.
 * Inspired by multi-agent systems and LLM orchestration patterns.
 *
 * Agent Types:
 * - Conversation Agent: Handles dialogue and context
 * - Calendar Agent: Manages scheduling and availability
 * - Task Agent: Handles task management and automation
 * - Voice Agent: Processes speech and audio
 * - Notification Agent: Manages alerts and suggestions
 * - Coordinator Agent: Orchestrates multi-agent interactions
 */

// =============================================================================
// AGENT TYPES
// =============================================================================

/**
 * Base agent configuration.
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  model: ModelConfig;
  prompts: AgentPrompts;
  tools: AgentTool[];
  maxTokens: number;
  temperature: number;
  topP: number;
}

/**
 * Model configuration for agents.
 */
export interface ModelConfig {
  provider: "openai" | "anthropic" | "google" | "local";
  model: string;
  apiVersion?: string;
  endpoint?: string;
}

/**
 * Agent system prompts.
 */
export interface AgentPrompts {
  system: string;
  contextTemplate: string;
  examples?: string[];
}

/**
 * Tool available to an agent.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: string; // Reference to handler function
}

/**
 * Tool parameter definition.
 */
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

// =============================================================================
// CONVERSATION AGENT
// =============================================================================

export const CONVERSATION_AGENT: AgentConfig = {
  id: "conversation",
  name: "Conversation Agent",
  description: "Handles natural language dialogue, context management, and memory",
  capabilities: [
    "natural_language_understanding",
    "context_retention",
    "memory_management",
    "entity_extraction",
    "sentiment_analysis",
    "response_generation",
  ],
  model: {
    provider: "openai",
    model: "gpt-4-turbo",
  },
  prompts: {
    system: `You are an AI personal assistant for the RSES Content Management System.
Your role is to help users manage their content, calendar, tasks, and workflows through natural conversation.

Key behaviors:
1. Be helpful, concise, and professional
2. Remember context from previous messages in the conversation
3. When uncertain, ask clarifying questions
4. Confirm before taking destructive or irreversible actions
5. Provide relevant suggestions based on context
6. Learn from user preferences and adapt your responses

You have access to tools for:
- Calendar management (scheduling, viewing events)
- Task management (creating, updating, completing tasks)
- Content management (creating, editing, publishing content)
- Workflow automation (creating and running automations)
- Search (finding content and information)

Always acknowledge the user's request before taking action.
If an action requires multiple steps, explain what you're doing.`,

    contextTemplate: `User Profile:
- Name: {{userName}}
- Timezone: {{timezone}}
- Preferences: {{preferences}}

Recent Memories:
{{memories}}

Current Context:
- Topic: {{currentTopic}}
- Active Entities: {{activeEntities}}
- Pending Actions: {{pendingActions}}

Conversation History:
{{conversationHistory}}`,

    examples: [
      `User: Schedule a meeting with the marketing team tomorrow at 2pm
Assistant: I'll schedule a meeting with the marketing team for tomorrow at 2pm. Let me check availability...

I found a conflict with your "Project Review" meeting. Would you like to:
1. Reschedule the marketing meeting to 3pm
2. Keep it at 2pm and I'll decline the Project Review
3. Choose a different day

What would you prefer?`,

      `User: Remind me to review the quarterly report
Assistant: I've created a reminder to review the quarterly report. When would you like to be reminded?

Options:
- Today at 5pm
- Tomorrow morning at 9am
- End of this week

Or let me know a specific time.`,
    ],
  },
  tools: [
    {
      name: "search_memory",
      description: "Search the user's memory for relevant information",
      parameters: [
        { name: "query", type: "string", description: "Search query", required: true },
        { name: "type", type: "string", description: "Memory type filter", required: false, enum: ["fact", "preference", "interaction"] },
      ],
      handler: "memory.search",
    },
    {
      name: "store_memory",
      description: "Store a new piece of information about the user",
      parameters: [
        { name: "content", type: "string", description: "Information to remember", required: true },
        { name: "type", type: "string", description: "Type of memory", required: true, enum: ["fact", "preference", "goal"] },
      ],
      handler: "memory.store",
    },
  ],
  maxTokens: 2048,
  temperature: 0.7,
  topP: 0.9,
};

// =============================================================================
// CALENDAR AGENT
// =============================================================================

export const CALENDAR_AGENT: AgentConfig = {
  id: "calendar",
  name: "Calendar Agent",
  description: "Manages calendar operations, scheduling, and availability",
  capabilities: [
    "event_creation",
    "event_modification",
    "availability_detection",
    "smart_scheduling",
    "conflict_resolution",
    "recurring_events",
    "timezone_handling",
  ],
  model: {
    provider: "openai",
    model: "gpt-4-turbo",
  },
  prompts: {
    system: `You are a calendar management specialist. Your role is to help users manage their schedule efficiently.

Key responsibilities:
1. Schedule meetings and events accurately
2. Detect and resolve scheduling conflicts
3. Find optimal meeting times based on availability
4. Handle time zones correctly
5. Manage recurring events
6. Send appropriate reminders

When scheduling:
- Always confirm the time zone
- Check for conflicts before confirming
- Suggest alternative times if requested time is unavailable
- Include relevant details (title, location, attendees)

For availability queries:
- Consider working hours (default 9am-5pm)
- Account for buffer time between meetings
- Consider travel time for in-person meetings`,

    contextTemplate: `User Calendar Settings:
- Timezone: {{timezone}}
- Working Hours: {{workingHours}}
- Buffer Time: {{bufferTime}}
- Default Meeting Duration: {{defaultDuration}}

Connected Calendars:
{{connectedCalendars}}

Today's Schedule:
{{todayEvents}}

Upcoming Events (next 7 days):
{{upcomingEvents}}`,
  },
  tools: [
    {
      name: "list_events",
      description: "List calendar events for a date range",
      parameters: [
        { name: "startDate", type: "string", description: "Start date (ISO format)", required: true },
        { name: "endDate", type: "string", description: "End date (ISO format)", required: true },
        { name: "calendars", type: "array", description: "Calendar IDs to include", required: false },
      ],
      handler: "calendar.listEvents",
    },
    {
      name: "create_event",
      description: "Create a new calendar event",
      parameters: [
        { name: "title", type: "string", description: "Event title", required: true },
        { name: "startTime", type: "string", description: "Start time (ISO format)", required: true },
        { name: "endTime", type: "string", description: "End time (ISO format)", required: true },
        { name: "attendees", type: "array", description: "List of attendee emails", required: false },
        { name: "location", type: "string", description: "Event location", required: false },
        { name: "description", type: "string", description: "Event description", required: false },
      ],
      handler: "calendar.createEvent",
    },
    {
      name: "check_availability",
      description: "Check availability for a time range",
      parameters: [
        { name: "startDate", type: "string", description: "Start date", required: true },
        { name: "endDate", type: "string", description: "End date", required: true },
        { name: "duration", type: "number", description: "Required duration in minutes", required: true },
        { name: "attendees", type: "array", description: "Attendees to check", required: false },
      ],
      handler: "calendar.checkAvailability",
    },
    {
      name: "suggest_times",
      description: "Suggest optimal meeting times",
      parameters: [
        { name: "duration", type: "number", description: "Meeting duration in minutes", required: true },
        { name: "attendees", type: "array", description: "Required attendees", required: false },
        { name: "priority", type: "string", description: "Meeting priority", required: false, enum: ["low", "normal", "high"] },
      ],
      handler: "calendar.suggestTimes",
    },
  ],
  maxTokens: 1024,
  temperature: 0.5,
  topP: 0.9,
};

// =============================================================================
// TASK AGENT
// =============================================================================

export const TASK_AGENT: AgentConfig = {
  id: "task",
  name: "Task Agent",
  description: "Manages tasks, reminders, and workflow automation",
  capabilities: [
    "task_creation",
    "task_prioritization",
    "reminder_scheduling",
    "workflow_automation",
    "dependency_management",
    "progress_tracking",
  ],
  model: {
    provider: "openai",
    model: "gpt-4-turbo",
  },
  prompts: {
    system: `You are a task management specialist. Your role is to help users stay organized and productive.

Key responsibilities:
1. Create and manage tasks effectively
2. Set appropriate priorities and due dates
3. Schedule reminders at optimal times
4. Suggest task breakdowns for complex items
5. Track progress and follow up
6. Identify automation opportunities

When creating tasks:
- Extract clear, actionable titles
- Infer due dates from context
- Set appropriate priority levels
- Suggest subtasks for complex tasks

For productivity:
- Identify tasks that could be automated
- Suggest batching similar tasks
- Recommend focus time blocks
- Follow up on overdue items`,

    contextTemplate: `User Task Preferences:
- Default Priority: {{defaultPriority}}
- Reminder Offset: {{reminderOffset}} minutes

Current Tasks:
{{currentTasks}}

Overdue Tasks:
{{overdueTasks}}

Upcoming Due:
{{upcomingDue}}

Recent Completions:
{{recentCompletions}}`,
  },
  tools: [
    {
      name: "create_task",
      description: "Create a new task",
      parameters: [
        { name: "title", type: "string", description: "Task title", required: true },
        { name: "description", type: "string", description: "Task description", required: false },
        { name: "dueDate", type: "string", description: "Due date (ISO format)", required: false },
        { name: "priority", type: "string", description: "Priority level", required: false, enum: ["low", "medium", "high", "urgent"] },
        { name: "tags", type: "array", description: "Task tags", required: false },
      ],
      handler: "tasks.createTask",
    },
    {
      name: "complete_task",
      description: "Mark a task as complete",
      parameters: [
        { name: "taskId", type: "string", description: "Task ID", required: true },
      ],
      handler: "tasks.completeTask",
    },
    {
      name: "list_tasks",
      description: "List tasks with optional filters",
      parameters: [
        { name: "status", type: "array", description: "Status filter", required: false },
        { name: "priority", type: "array", description: "Priority filter", required: false },
        { name: "dueBefore", type: "string", description: "Due before date", required: false },
      ],
      handler: "tasks.listTasks",
    },
    {
      name: "create_workflow",
      description: "Create an automation workflow",
      parameters: [
        { name: "name", type: "string", description: "Workflow name", required: true },
        { name: "trigger", type: "object", description: "Trigger configuration", required: true },
        { name: "actions", type: "array", description: "Actions to perform", required: true },
      ],
      handler: "tasks.createWorkflow",
    },
  ],
  maxTokens: 1024,
  temperature: 0.5,
  topP: 0.9,
};

// =============================================================================
// VOICE AGENT
// =============================================================================

export const VOICE_AGENT: AgentConfig = {
  id: "voice",
  name: "Voice Agent",
  description: "Handles voice input/output and speech processing",
  capabilities: [
    "speech_recognition",
    "speech_synthesis",
    "wake_word_detection",
    "voice_commands",
    "dictation",
    "multi_language",
  ],
  model: {
    provider: "openai",
    model: "whisper-1",
  },
  prompts: {
    system: `You are a voice interface specialist. Your role is to process voice input and generate natural speech output.

Key responsibilities:
1. Accurately transcribe speech to text
2. Generate natural-sounding responses
3. Handle voice commands efficiently
4. Support multiple languages
5. Adapt to speaking styles

For transcription:
- Handle background noise gracefully
- Recognize domain-specific vocabulary
- Preserve punctuation and formatting
- Identify speaker changes

For synthesis:
- Match the user's preferred voice
- Use appropriate pacing and emphasis
- Handle technical terms correctly`,

    contextTemplate: `Voice Settings:
- Language: {{language}}
- Voice: {{preferredVoice}}
- Speed: {{speechSpeed}}

Recent Transcriptions:
{{recentTranscriptions}}

Custom Commands:
{{customCommands}}`,
  },
  tools: [
    {
      name: "transcribe",
      description: "Transcribe audio to text",
      parameters: [
        { name: "audioUrl", type: "string", description: "URL of audio file", required: true },
        { name: "language", type: "string", description: "Language code", required: false },
        { name: "hints", type: "array", description: "Vocabulary hints", required: false },
      ],
      handler: "voice.transcribe",
    },
    {
      name: "synthesize",
      description: "Convert text to speech",
      parameters: [
        { name: "text", type: "string", description: "Text to speak", required: true },
        { name: "voice", type: "string", description: "Voice ID", required: false },
        { name: "speed", type: "number", description: "Speech speed", required: false },
      ],
      handler: "voice.synthesize",
    },
    {
      name: "register_command",
      description: "Register a voice command",
      parameters: [
        { name: "phrases", type: "array", description: "Trigger phrases", required: true },
        { name: "action", type: "string", description: "Action to perform", required: true },
      ],
      handler: "voice.registerCommand",
    },
  ],
  maxTokens: 512,
  temperature: 0.3,
  topP: 0.9,
};

// =============================================================================
// NOTIFICATION AGENT
// =============================================================================

export const NOTIFICATION_AGENT: AgentConfig = {
  id: "notification",
  name: "Notification Agent",
  description: "Manages notifications, alerts, and proactive suggestions",
  capabilities: [
    "notification_delivery",
    "timing_optimization",
    "proactive_suggestions",
    "pattern_detection",
    "quiet_hours_handling",
  ],
  model: {
    provider: "openai",
    model: "gpt-4-turbo",
  },
  prompts: {
    system: `You are a notification and suggestion specialist. Your role is to keep users informed without being intrusive.

Key responsibilities:
1. Deliver timely and relevant notifications
2. Respect quiet hours and preferences
3. Generate proactive suggestions
4. Learn from user behavior patterns
5. Batch related notifications

For notifications:
- Prioritize by urgency and relevance
- Use appropriate channels
- Avoid notification fatigue
- Time delivery optimally

For suggestions:
- Base on observed patterns
- Provide clear reasoning
- Make suggestions actionable
- Learn from feedback`,

    contextTemplate: `Notification Preferences:
- Enabled Channels: {{enabledChannels}}
- Quiet Hours: {{quietHours}}
- Frequency: {{frequency}}

Recent Notifications:
{{recentNotifications}}

User Patterns:
{{userPatterns}}

Pending Suggestions:
{{pendingSuggestions}}`,
  },
  tools: [
    {
      name: "send_notification",
      description: "Send a notification to the user",
      parameters: [
        { name: "title", type: "string", description: "Notification title", required: true },
        { name: "body", type: "string", description: "Notification body", required: true },
        { name: "priority", type: "string", description: "Priority level", required: false, enum: ["low", "normal", "high", "urgent"] },
        { name: "channel", type: "string", description: "Delivery channel", required: false, enum: ["push", "email", "sms", "inApp"] },
      ],
      handler: "notifications.send",
    },
    {
      name: "schedule_notification",
      description: "Schedule a notification for later",
      parameters: [
        { name: "title", type: "string", description: "Notification title", required: true },
        { name: "body", type: "string", description: "Notification body", required: true },
        { name: "scheduledFor", type: "string", description: "Delivery time (ISO format)", required: true },
      ],
      handler: "notifications.schedule",
    },
    {
      name: "create_suggestion",
      description: "Create a proactive suggestion",
      parameters: [
        { name: "type", type: "string", description: "Suggestion type", required: true },
        { name: "title", type: "string", description: "Suggestion title", required: true },
        { name: "reasoning", type: "string", description: "Why this suggestion", required: true },
        { name: "actions", type: "array", description: "Suggested actions", required: true },
      ],
      handler: "notifications.createSuggestion",
    },
  ],
  maxTokens: 512,
  temperature: 0.6,
  topP: 0.9,
};

// =============================================================================
// COORDINATOR AGENT
// =============================================================================

export const COORDINATOR_AGENT: AgentConfig = {
  id: "coordinator",
  name: "Coordinator Agent",
  description: "Orchestrates multi-agent interactions and complex workflows",
  capabilities: [
    "agent_orchestration",
    "task_routing",
    "conflict_resolution",
    "workflow_planning",
    "result_aggregation",
  ],
  model: {
    provider: "openai",
    model: "gpt-4-turbo",
  },
  prompts: {
    system: `You are the coordinator for a team of specialized AI agents. Your role is to route tasks and orchestrate complex operations.

Available agents:
- Conversation Agent: Natural language and context
- Calendar Agent: Scheduling and events
- Task Agent: Task management and automation
- Voice Agent: Speech processing
- Notification Agent: Alerts and suggestions

Key responsibilities:
1. Analyze user requests and determine required agents
2. Plan multi-step operations
3. Coordinate between agents
4. Handle errors and fallbacks
5. Aggregate and present results

When routing:
- Break complex requests into steps
- Identify dependencies between steps
- Parallelize independent operations
- Maintain context across agents`,

    contextTemplate: `Available Agents:
{{availableAgents}}

Current Request:
{{currentRequest}}

Execution Plan:
{{executionPlan}}

Agent States:
{{agentStates}}`,
  },
  tools: [
    {
      name: "route_to_agent",
      description: "Route a request to a specialized agent",
      parameters: [
        { name: "agentId", type: "string", description: "Target agent ID", required: true },
        { name: "request", type: "object", description: "Request payload", required: true },
      ],
      handler: "coordinator.routeToAgent",
    },
    {
      name: "create_plan",
      description: "Create an execution plan for complex requests",
      parameters: [
        { name: "steps", type: "array", description: "Ordered steps", required: true },
        { name: "dependencies", type: "object", description: "Step dependencies", required: false },
      ],
      handler: "coordinator.createPlan",
    },
    {
      name: "aggregate_results",
      description: "Combine results from multiple agents",
      parameters: [
        { name: "results", type: "array", description: "Agent results", required: true },
        { name: "format", type: "string", description: "Output format", required: false },
      ],
      handler: "coordinator.aggregateResults",
    },
  ],
  maxTokens: 1024,
  temperature: 0.4,
  topP: 0.9,
};

// =============================================================================
// AGENT REGISTRY
// =============================================================================

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  conversation: CONVERSATION_AGENT,
  calendar: CALENDAR_AGENT,
  task: TASK_AGENT,
  voice: VOICE_AGENT,
  notification: NOTIFICATION_AGENT,
  coordinator: COORDINATOR_AGENT,
};

/**
 * Get an agent configuration by ID.
 */
export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return AGENT_REGISTRY[agentId];
}

/**
 * Get all agent IDs.
 */
export function getAgentIds(): string[] {
  return Object.keys(AGENT_REGISTRY);
}

/**
 * Get agents by capability.
 */
export function getAgentsByCapability(capability: string): AgentConfig[] {
  return Object.values(AGENT_REGISTRY).filter((agent) =>
    agent.capabilities.includes(capability)
  );
}
