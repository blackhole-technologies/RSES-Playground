/**
 * @file action-parser.ts
 * @description Natural Language Action Parser for AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Natural language understanding inspired by:
 * - Alexa Skills: Intent and slot filling
 * - Dialogflow: Entity extraction
 * - Rasa: Conversational AI patterns
 * - wit.ai: NLU processing
 *
 * Features:
 * - Intent classification
 * - Entity extraction (NER)
 * - Slot filling for action parameters
 * - Multi-intent detection
 * - Context-aware parsing
 * - Action execution pipeline
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  ParsedIntent,
  IntentDomain,
  SlotValue,
  ExtractedEntity,
  EntityType,
  SessionContext,
  ContentOperation,
  ContentOperationType,
  PendingAction,
} from "./types";

const log = createModuleLogger("action-parser");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ActionParserConfig {
  /** Minimum confidence for intent matching */
  minIntentConfidence: number;
  /** Minimum confidence for entity extraction */
  minEntityConfidence: number;
  /** Enable multi-intent detection */
  enableMultiIntent: boolean;
  /** Maximum slot filling retries */
  maxSlotRetries: number;
  /** Action confirmation timeout in ms */
  confirmationTimeoutMs: number;
}

const DEFAULT_CONFIG: ActionParserConfig = {
  minIntentConfidence: 0.6,
  minEntityConfidence: 0.5,
  enableMultiIntent: true,
  maxSlotRetries: 3,
  confirmationTimeoutMs: 60 * 1000,
};

// =============================================================================
// INTENT PATTERNS
// =============================================================================

interface IntentPattern {
  name: string;
  domain: IntentDomain;
  action: string;
  patterns: RegExp[];
  slots: SlotDefinition[];
  requiresConfirmation: boolean;
  examples: string[];
}

interface SlotDefinition {
  name: string;
  type: EntityType;
  required: boolean;
  prompt?: string;
  defaultValue?: unknown;
  extractors?: RegExp[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Calendar intents
  {
    name: "calendar.create",
    domain: "calendar",
    action: "create",
    patterns: [
      /schedule\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /create\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /add\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /book\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /set\s+up\s+(?:a\s+)?(?:meeting|event|appointment)/i,
    ],
    slots: [
      { name: "title", type: "custom", required: true, prompt: "What's the meeting about?" },
      { name: "date", type: "date", required: true, prompt: "When should I schedule it?" },
      { name: "time", type: "time", required: false },
      { name: "duration", type: "duration", required: false, defaultValue: 30 },
      { name: "attendees", type: "person", required: false },
    ],
    requiresConfirmation: true,
    examples: [
      "Schedule a meeting with John tomorrow at 3pm",
      "Create an event for Monday morning",
      "Book a 1 hour meeting next week",
    ],
  },
  {
    name: "calendar.list",
    domain: "calendar",
    action: "list",
    patterns: [
      /(?:what's|what is)\s+on\s+(?:my\s+)?(?:calendar|schedule)/i,
      /show\s+(?:me\s+)?(?:my\s+)?(?:calendar|schedule|events)/i,
      /list\s+(?:my\s+)?(?:events|meetings)/i,
      /(?:do\s+i\s+have|are\s+there)\s+any\s+(?:meetings|events)/i,
    ],
    slots: [
      { name: "date", type: "date", required: false },
      { name: "dateRange", type: "datetime", required: false },
    ],
    requiresConfirmation: false,
    examples: ["What's on my calendar today?", "Show me my meetings for this week"],
  },
  {
    name: "calendar.reschedule",
    domain: "calendar",
    action: "reschedule",
    patterns: [
      /reschedule\s+(?:the\s+)?(?:meeting|event)/i,
      /move\s+(?:the\s+)?(?:meeting|event)/i,
      /change\s+(?:the\s+)?(?:meeting|event)\s+time/i,
    ],
    slots: [
      { name: "event", type: "custom", required: true, prompt: "Which meeting should I reschedule?" },
      { name: "newDate", type: "date", required: true, prompt: "When do you want to reschedule it to?" },
      { name: "newTime", type: "time", required: false },
    ],
    requiresConfirmation: true,
    examples: ["Reschedule my 3pm meeting to tomorrow", "Move the team sync to next Monday"],
  },
  {
    name: "calendar.cancel",
    domain: "calendar",
    action: "cancel",
    patterns: [
      /cancel\s+(?:the\s+)?(?:meeting|event)/i,
      /delete\s+(?:the\s+)?(?:meeting|event)/i,
      /remove\s+(?:the\s+)?(?:meeting|event)/i,
    ],
    slots: [
      { name: "event", type: "custom", required: true, prompt: "Which meeting should I cancel?" },
    ],
    requiresConfirmation: true,
    examples: ["Cancel my meeting with Sarah", "Delete the event tomorrow morning"],
  },
  {
    name: "calendar.availability",
    domain: "calendar",
    action: "check",
    patterns: [
      /(?:am\s+i|are\s+we)\s+(?:free|available)/i,
      /check\s+(?:my\s+)?availability/i,
      /find\s+(?:a\s+)?(?:free|open)\s+(?:time|slot)/i,
      /when\s+am\s+i\s+(?:free|available)/i,
    ],
    slots: [
      { name: "date", type: "date", required: false },
      { name: "duration", type: "duration", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Am I free tomorrow afternoon?", "Check my availability next week"],
  },

  // Task intents
  {
    name: "tasks.create",
    domain: "tasks",
    action: "create",
    patterns: [
      /(?:create|add|make)\s+(?:a\s+)?(?:task|todo|reminder)/i,
      /remind\s+me\s+to/i,
      /i\s+need\s+to/i,
      /don't\s+let\s+me\s+forget/i,
    ],
    slots: [
      { name: "title", type: "custom", required: true },
      { name: "dueDate", type: "date", required: false },
      { name: "priority", type: "custom", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Create a task to review the document", "Remind me to call John tomorrow"],
  },
  {
    name: "tasks.list",
    domain: "tasks",
    action: "list",
    patterns: [
      /(?:show|list|what are)\s+(?:my\s+)?(?:tasks|todos)/i,
      /what\s+(?:do\s+i|should\s+i)\s+(?:need|have)\s+to\s+do/i,
    ],
    slots: [
      { name: "filter", type: "custom", required: false },
      { name: "date", type: "date", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Show my tasks for today", "What do I need to do?"],
  },
  {
    name: "tasks.complete",
    domain: "tasks",
    action: "complete",
    patterns: [
      /(?:mark|set)\s+(?:task|todo)?\s*(?:as\s+)?(?:complete|done|finished)/i,
      /(?:complete|finish)\s+(?:the\s+)?(?:task|todo)/i,
      /i\s+(?:finished|completed|done\s+with)/i,
    ],
    slots: [
      { name: "task", type: "custom", required: true, prompt: "Which task did you complete?" },
    ],
    requiresConfirmation: false,
    examples: ["Mark the task as done", "I finished the report"],
  },

  // CMS intents
  {
    name: "cms.create",
    domain: "cms",
    action: "create",
    patterns: [
      /create\s+(?:a\s+)?(?:new\s+)?(?:content|article|post|page)/i,
      /write\s+(?:a\s+)?(?:new\s+)?(?:article|post|page)/i,
      /draft\s+(?:a\s+)?(?:new\s+)?(?:article|post|page)/i,
    ],
    slots: [
      { name: "type", type: "custom", required: false, defaultValue: "article" },
      { name: "title", type: "custom", required: false },
      { name: "topic", type: "custom", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Create a new blog post", "Draft an article about AI"],
  },
  {
    name: "cms.publish",
    domain: "cms",
    action: "publish",
    patterns: [
      /publish\s+(?:the\s+)?(?:content|article|post|page)/i,
      /make\s+(?:the\s+)?(?:article|post|page)\s+live/i,
      /go\s+live\s+with/i,
    ],
    slots: [
      { name: "content", type: "content", required: true, prompt: "Which content should I publish?" },
    ],
    requiresConfirmation: true,
    examples: ["Publish the blog post", "Make the article live"],
  },
  {
    name: "cms.schedule",
    domain: "cms",
    action: "schedule",
    patterns: [
      /schedule\s+(?:the\s+)?(?:content|article|post|page)/i,
      /schedule\s+publication/i,
      /publish\s+(?:it\s+)?(?:at|on)/i,
    ],
    slots: [
      { name: "content", type: "content", required: true },
      { name: "date", type: "date", required: true, prompt: "When should it be published?" },
      { name: "time", type: "time", required: false },
    ],
    requiresConfirmation: true,
    examples: ["Schedule the post for tomorrow at 9am", "Publish the article on Monday"],
  },
  {
    name: "cms.search",
    domain: "cms",
    action: "search",
    patterns: [
      /(?:find|search\s+for|look\s+for)\s+(?:content|articles?|posts?)/i,
      /search\s+(?:the\s+)?cms/i,
    ],
    slots: [
      { name: "query", type: "custom", required: true },
      { name: "type", type: "custom", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Find articles about marketing", "Search for draft posts"],
  },

  // Search intents
  {
    name: "search.general",
    domain: "search",
    action: "search",
    patterns: [
      /(?:find|search|look\s+for|where\s+is)/i,
    ],
    slots: [
      { name: "query", type: "custom", required: true },
    ],
    requiresConfirmation: false,
    examples: ["Find the project document", "Where is the settings page?"],
  },

  // Help intents
  {
    name: "help.general",
    domain: "help",
    action: "info",
    patterns: [
      /(?:help|assist)/i,
      /(?:what\s+can\s+you|how\s+do\s+i)/i,
      /(?:tell\s+me\s+about|explain)/i,
    ],
    slots: [
      { name: "topic", type: "custom", required: false },
    ],
    requiresConfirmation: false,
    examples: ["Help", "What can you do?", "How do I create a task?"],
  },

  // Workflow intents
  {
    name: "workflow.create",
    domain: "workflow",
    action: "create",
    patterns: [
      /(?:create|set\s+up)\s+(?:an?\s+)?(?:automation|workflow)/i,
      /automate/i,
    ],
    slots: [
      { name: "name", type: "custom", required: false },
      { name: "trigger", type: "custom", required: false },
      { name: "action", type: "action", required: false },
    ],
    requiresConfirmation: true,
    examples: ["Create an automation for daily publishing", "Set up a workflow"],
  },

  // Settings intents
  {
    name: "settings.update",
    domain: "settings",
    action: "update",
    patterns: [
      /(?:change|update|set)\s+(?:my\s+)?(?:preferences|settings)/i,
      /turn\s+(?:on|off)/i,
      /enable\s+/i,
      /disable\s+/i,
    ],
    slots: [
      { name: "setting", type: "custom", required: true, prompt: "Which setting would you like to change?" },
      { name: "value", type: "custom", required: false },
    ],
    requiresConfirmation: true,
    examples: ["Turn on dark mode", "Change my notification settings"],
  },
];

// =============================================================================
// ENTITY EXTRACTORS
// =============================================================================

class EntityExtractor {
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract dates
    entities.push(...this.extractDates(text));

    // Extract times
    entities.push(...this.extractTimes(text));

    // Extract durations
    entities.push(...this.extractDurations(text));

    // Extract people mentions
    entities.push(...this.extractPeople(text));

    // Extract emails
    entities.push(...this.extractEmails(text));

    // Extract numbers
    entities.push(...this.extractNumbers(text));

    // Sort by start index
    entities.sort((a, b) => a.startIndex - b.startIndex);

    return entities;
  }

  private extractDates(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      { regex: /\b(today)\b/gi, normalizer: () => new Date() },
      { regex: /\b(tomorrow)\b/gi, normalizer: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      }},
      { regex: /\b(yesterday)\b/gi, normalizer: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
      }},
      { regex: /\b(next\s+week)\b/gi, normalizer: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d;
      }},
      { regex: /\b(next\s+month)\b/gi, normalizer: () => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d;
      }},
      { regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, normalizer: (match: string) => {
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const targetDay = days.indexOf(match.toLowerCase());
        const now = new Date();
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        now.setDate(now.getDate() + daysUntil);
        return now;
      }},
      { regex: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi, normalizer: (match: string) => {
        const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const parts = match.toLowerCase().match(/(\w+)\s+(\d+)(?:\s*,?\s*(\d+))?/);
        if (parts) {
          const month = months.indexOf(parts[1]);
          const day = parseInt(parts[2]);
          const year = parts[3] ? parseInt(parts[3]) : new Date().getFullYear();
          return new Date(year, month, day);
        }
        return null;
      }},
      { regex: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, normalizer: (match: string) => {
        const parts = match.split("/");
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
        return new Date(year < 100 ? 2000 + year : year, month, day);
      }},
      { regex: /\bin\s+(\d+)\s+days?\b/gi, normalizer: (match: string) => {
        const days = parseInt(match.match(/\d+/)![0]);
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d;
      }},
    ];

    for (const { regex, normalizer } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const normalized = normalizer(match[0]);
        if (normalized) {
          entities.push({
            type: "date",
            value: match[0],
            normalizedValue: normalized,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  private extractTimes(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      { regex: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi, normalizer: (match: string) => {
        const parts = match.match(/(\d+):(\d+)\s*(am|pm)?/i);
        if (parts) {
          let hours = parseInt(parts[1]);
          const minutes = parseInt(parts[2]);
          const period = parts[3]?.toLowerCase();
          if (period === "pm" && hours < 12) hours += 12;
          if (period === "am" && hours === 12) hours = 0;
          return { hours, minutes };
        }
        return null;
      }},
      { regex: /\b(\d{1,2})\s*(am|pm)\b/gi, normalizer: (match: string) => {
        const parts = match.match(/(\d+)\s*(am|pm)/i);
        if (parts) {
          let hours = parseInt(parts[1]);
          const period = parts[2].toLowerCase();
          if (period === "pm" && hours < 12) hours += 12;
          if (period === "am" && hours === 12) hours = 0;
          return { hours, minutes: 0 };
        }
        return null;
      }},
      { regex: /\b(noon|midday)\b/gi, normalizer: () => ({ hours: 12, minutes: 0 }) },
      { regex: /\b(midnight)\b/gi, normalizer: () => ({ hours: 0, minutes: 0 }) },
      { regex: /\b(morning)\b/gi, normalizer: () => ({ hours: 9, minutes: 0 }) },
      { regex: /\b(afternoon)\b/gi, normalizer: () => ({ hours: 14, minutes: 0 }) },
      { regex: /\b(evening)\b/gi, normalizer: () => ({ hours: 18, minutes: 0 }) },
    ];

    for (const { regex, normalizer } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const normalized = normalizer(match[0]);
        if (normalized) {
          entities.push({
            type: "time",
            value: match[0],
            normalizedValue: normalized,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  private extractDurations(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      { regex: /\b(\d+)\s*(minute|min)s?\b/gi, multiplier: 1 },
      { regex: /\b(\d+)\s*(hour|hr)s?\b/gi, multiplier: 60 },
      { regex: /\b(\d+(?:\.\d+)?)\s*hours?\b/gi, multiplier: 60 },
      { regex: /\bhalf\s*(?:an?\s+)?hour\b/gi, fixed: 30 },
      { regex: /\bquarter\s*(?:of\s+an?\s+)?hour\b/gi, fixed: 15 },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        let minutes: number;
        if (pattern.fixed) {
          minutes = pattern.fixed;
        } else {
          minutes = parseFloat(match[1]) * pattern.multiplier!;
        }

        entities.push({
          type: "duration",
          value: match[0],
          normalizedValue: minutes,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
    }

    return entities;
  }

  private extractPeople(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract "with [Name]" patterns
    const withPattern = /\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
    let match;
    while ((match = withPattern.exec(text)) !== null) {
      entities.push({
        type: "person",
        value: match[1],
        startIndex: match.index + 5, // Skip "with "
        endIndex: match.index + match[0].length,
        confidence: 0.8,
      });
    }

    // Extract @mentions
    const mentionPattern = /@(\w+)/g;
    while ((match = mentionPattern.exec(text)) !== null) {
      entities.push({
        type: "person",
        value: match[1],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.95,
      });
    }

    return entities;
  }

  private extractEmails(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

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

    return entities;
  }

  private extractNumbers(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const numberPattern = /\b(\d+(?:\.\d+)?)\b/g;

    let match;
    while ((match = numberPattern.exec(text)) !== null) {
      entities.push({
        type: "number",
        value: match[0],
        normalizedValue: parseFloat(match[0]),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.9,
      });
    }

    return entities;
  }
}

// =============================================================================
// INTENT CLASSIFIER
// =============================================================================

class IntentClassifier {
  constructor(private config: ActionParserConfig) {}

  classify(
    text: string,
    entities: ExtractedEntity[],
    context?: SessionContext
  ): ParsedIntent[] {
    const intents: ParsedIntent[] = [];

    for (const pattern of INTENT_PATTERNS) {
      for (const regex of pattern.patterns) {
        const match = text.match(regex);
        if (match) {
          const confidence = this.calculateConfidence(text, pattern, match);

          if (confidence >= this.config.minIntentConfidence) {
            const slots = this.fillSlots(text, pattern.slots, entities);

            intents.push({
              name: pattern.name,
              confidence,
              domain: pattern.domain,
              action: pattern.action,
              requiresConfirmation: pattern.requiresConfirmation,
              slots,
            });

            // If not multi-intent, return first match
            if (!this.config.enableMultiIntent) {
              return intents;
            }

            break; // Don't match same pattern multiple times
          }
        }
      }
    }

    // Use context to boost confidence for related intents
    if (context?.currentTopic) {
      for (const intent of intents) {
        if (intent.domain === context.currentTopic) {
          intent.confidence = Math.min(1, intent.confidence + 0.1);
        }
      }
    }

    // Sort by confidence
    intents.sort((a, b) => b.confidence - a.confidence);

    return intents;
  }

  private calculateConfidence(
    text: string,
    pattern: IntentPattern,
    match: RegExpMatchArray
  ): number {
    let confidence = 0.7; // Base confidence

    // Boost for longer matches
    const matchRatio = match[0].length / text.length;
    confidence += matchRatio * 0.2;

    // Boost for exact phrase matches
    if (text.toLowerCase() === match[0].toLowerCase()) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  private fillSlots(
    text: string,
    slotDefs: SlotDefinition[],
    entities: ExtractedEntity[]
  ): Map<string, SlotValue> {
    const slots = new Map<string, SlotValue>();

    for (const slotDef of slotDefs) {
      // Try to find a matching entity
      const matchingEntity = entities.find((e) => e.type === slotDef.type);

      if (matchingEntity) {
        slots.set(slotDef.name, {
          value: matchingEntity.normalizedValue || matchingEntity.value,
          confidence: matchingEntity.confidence,
          normalized: matchingEntity.normalizedValue,
        });
      } else if (slotDef.extractors) {
        // Try custom extractors
        for (const extractor of slotDef.extractors) {
          const match = text.match(extractor);
          if (match) {
            slots.set(slotDef.name, {
              value: match[1] || match[0],
              confidence: 0.8,
            });
            break;
          }
        }
      } else if (slotDef.defaultValue !== undefined) {
        slots.set(slotDef.name, {
          value: slotDef.defaultValue,
          confidence: 1.0,
        });
      }
    }

    return slots;
  }
}

// =============================================================================
// ACTION EXECUTOR
// =============================================================================

interface ActionHandler {
  domain: IntentDomain;
  action: string;
  handler: (intent: ParsedIntent, context?: SessionContext) => Promise<ActionResult>;
}

interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  requiresFollowUp?: boolean;
  followUpPrompt?: string;
}

class ActionExecutor extends EventEmitter {
  private handlers: Map<string, ActionHandler> = new Map();
  private pendingConfirmations: Map<string, PendingAction> = new Map();

  constructor(private config: ActionParserConfig) {
    super();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // Calendar handlers
    this.registerHandler({
      domain: "calendar",
      action: "create",
      handler: async (intent, context) => {
        const title = intent.slots.get("title")?.value as string;
        const date = intent.slots.get("date")?.normalized as Date;

        if (!title) {
          return {
            success: false,
            message: "I need a title for the meeting. What's it about?",
            requiresFollowUp: true,
            followUpPrompt: "title",
          };
        }

        if (!date) {
          return {
            success: false,
            message: "When should I schedule this?",
            requiresFollowUp: true,
            followUpPrompt: "date",
          };
        }

        return {
          success: true,
          message: `I'll create a meeting "${title}" for ${date.toLocaleDateString()}`,
          data: { title, date },
        };
      },
    });

    this.registerHandler({
      domain: "calendar",
      action: "list",
      handler: async (intent, context) => {
        const date = intent.slots.get("date")?.normalized as Date || new Date();
        return {
          success: true,
          message: `Here are your events for ${date.toLocaleDateString()}`,
          data: { date },
        };
      },
    });

    // Task handlers
    this.registerHandler({
      domain: "tasks",
      action: "create",
      handler: async (intent, context) => {
        const title = intent.slots.get("title")?.value as string;
        const dueDate = intent.slots.get("dueDate")?.normalized as Date;

        return {
          success: true,
          message: dueDate
            ? `Created task: "${title}" due ${dueDate.toLocaleDateString()}`
            : `Created task: "${title}"`,
          data: { title, dueDate },
        };
      },
    });

    this.registerHandler({
      domain: "tasks",
      action: "list",
      handler: async (intent, context) => {
        return {
          success: true,
          message: "Here are your tasks:",
          data: {},
        };
      },
    });

    // CMS handlers
    this.registerHandler({
      domain: "cms",
      action: "create",
      handler: async (intent, context) => {
        const type = intent.slots.get("type")?.value as string || "article";
        const title = intent.slots.get("title")?.value as string;

        return {
          success: true,
          message: title
            ? `Creating new ${type}: "${title}"`
            : `Creating new ${type}. What should the title be?`,
          requiresFollowUp: !title,
          followUpPrompt: title ? undefined : "title",
          data: { type, title },
        };
      },
    });

    this.registerHandler({
      domain: "cms",
      action: "publish",
      handler: async (intent, context) => {
        return {
          success: true,
          message: "Ready to publish. Please confirm.",
          data: {},
        };
      },
    });

    // Help handlers
    this.registerHandler({
      domain: "help",
      action: "info",
      handler: async (intent, context) => {
        return {
          success: true,
          message: `I can help you with:
- **Calendar**: Schedule, view, and manage meetings
- **Tasks**: Create and track your to-do items
- **Content**: Create, edit, and publish content
- **Workflows**: Automate repetitive tasks

Just tell me what you'd like to do!`,
          data: {},
        };
      },
    });
  }

  registerHandler(handler: ActionHandler): void {
    const key = `${handler.domain}.${handler.action}`;
    this.handlers.set(key, handler);
  }

  async execute(
    intent: ParsedIntent,
    context?: SessionContext
  ): Promise<ActionResult> {
    const key = `${intent.domain}.${intent.action}`;
    const handler = this.handlers.get(key);

    if (!handler) {
      return {
        success: false,
        message: `I don't know how to handle ${intent.domain}.${intent.action} yet.`,
      };
    }

    // Check if confirmation is required
    if (intent.requiresConfirmation) {
      const pendingId = randomUUID();
      const pending: PendingAction = {
        id: pendingId,
        type: key,
        description: `Execute ${intent.name}`,
        parameters: Object.fromEntries(intent.slots),
        expiresAt: new Date(Date.now() + this.config.confirmationTimeoutMs),
        confirmationRequired: true,
        createdAt: new Date(),
      };

      this.pendingConfirmations.set(pendingId, pending);

      return {
        success: true,
        message: "Please confirm this action.",
        data: { pendingId, action: intent },
        requiresFollowUp: true,
        followUpPrompt: "confirmation",
      };
    }

    try {
      const result = await handler.handler(intent, context);
      this.emit("action:executed", { intent, result });
      return result;
    } catch (err) {
      log.error({ err, intent: intent.name }, "Action execution failed");
      return {
        success: false,
        message: "Sorry, something went wrong. Please try again.",
      };
    }
  }

  confirmAction(pendingId: string): PendingAction | null {
    const pending = this.pendingConfirmations.get(pendingId);
    if (pending) {
      this.pendingConfirmations.delete(pendingId);
      return pending;
    }
    return null;
  }

  cancelAction(pendingId: string): boolean {
    return this.pendingConfirmations.delete(pendingId);
  }

  getPendingActions(userId: string): PendingAction[] {
    return Array.from(this.pendingConfirmations.values())
      .filter((p) => p.expiresAt > new Date());
  }
}

// =============================================================================
// ACTION PARSER
// =============================================================================

export class ActionParser extends EventEmitter {
  private config: ActionParserConfig;
  private entityExtractor: EntityExtractor;
  private intentClassifier: IntentClassifier;
  private actionExecutor: ActionExecutor;

  constructor(config: Partial<ActionParserConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entityExtractor = new EntityExtractor();
    this.intentClassifier = new IntentClassifier(this.config);
    this.actionExecutor = new ActionExecutor(this.config);

    log.info("Action parser initialized");
  }

  async parse(
    text: string,
    context?: SessionContext
  ): Promise<{
    intents: ParsedIntent[];
    entities: ExtractedEntity[];
    primaryIntent?: ParsedIntent;
  }> {
    // Extract entities
    const entities = this.entityExtractor.extract(text);

    // Classify intents
    const intents = this.intentClassifier.classify(text, entities, context);

    // Determine primary intent
    const primaryIntent = intents.length > 0 ? intents[0] : undefined;

    this.emit("parsed", { text, intents, entities, primaryIntent });

    return { intents, entities, primaryIntent };
  }

  async parseAndExecute(
    text: string,
    context?: SessionContext
  ): Promise<ActionResult & { intent?: ParsedIntent }> {
    const { primaryIntent } = await this.parse(text, context);

    if (!primaryIntent) {
      return {
        success: false,
        message: "I'm not sure what you want me to do. Can you rephrase that?",
      };
    }

    const result = await this.actionExecutor.execute(primaryIntent, context);

    return { ...result, intent: primaryIntent };
  }

  registerActionHandler(handler: ActionHandler): void {
    this.actionExecutor.registerHandler(handler);
  }

  getMissingSlots(intent: ParsedIntent): SlotDefinition[] {
    const pattern = INTENT_PATTERNS.find((p) => p.name === intent.name);
    if (!pattern) return [];

    return pattern.slots.filter(
      (slot) => slot.required && !intent.slots.has(slot.name)
    );
  }

  fillSlot(
    intent: ParsedIntent,
    slotName: string,
    value: unknown
  ): boolean {
    const pattern = INTENT_PATTERNS.find((p) => p.name === intent.name);
    const slotDef = pattern?.slots.find((s) => s.name === slotName);

    if (!slotDef) return false;

    intent.slots.set(slotName, {
      value,
      confidence: 1.0,
    });

    return true;
  }

  confirmAction(pendingId: string): PendingAction | null {
    return this.actionExecutor.confirmAction(pendingId);
  }

  cancelAction(pendingId: string): boolean {
    return this.actionExecutor.cancelAction(pendingId);
  }

  getExamples(domain?: IntentDomain): string[] {
    const patterns = domain
      ? INTENT_PATTERNS.filter((p) => p.domain === domain)
      : INTENT_PATTERNS;

    return patterns.flatMap((p) => p.examples);
  }

  getSupportedDomains(): IntentDomain[] {
    return Array.from(new Set(INTENT_PATTERNS.map((p) => p.domain)));
  }

  getSupportedActions(domain: IntentDomain): string[] {
    return INTENT_PATTERNS
      .filter((p) => p.domain === domain)
      .map((p) => p.action);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let actionParserInstance: ActionParser | null = null;

export function createActionParser(
  config?: Partial<ActionParserConfig>
): ActionParser {
  if (!actionParserInstance) {
    actionParserInstance = new ActionParser(config);
  }
  return actionParserInstance;
}

export function getActionParser(): ActionParser | null {
  return actionParserInstance;
}
