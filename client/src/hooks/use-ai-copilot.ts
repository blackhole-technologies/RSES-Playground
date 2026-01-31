/**
 * @file use-ai-copilot.ts
 * @description AI Copilot system with context-aware suggestions, natural language commands,
 * and intelligent assistance for RSES configuration editing.
 * @phase Phase 6 - AI-Enhanced UX
 * @author UX (UX Design Expert Agent)
 * @created 2026-02-01
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocalStorage } from "./use-local-storage";

// =============================================================================
// Types
// =============================================================================

/**
 * User expertise level affects suggestion complexity and verbosity.
 */
export type ExpertiseLevel = "beginner" | "intermediate" | "advanced";

/**
 * Types of suggestions the AI can generate.
 */
export type SuggestionType =
  | "completion"     // Auto-complete current input
  | "insertion"      // Insert new content block
  | "refactoring"    // Improve existing content
  | "navigation"     // Go to relevant location
  | "action"         // Execute an operation
  | "explanation"    // Explain a concept
  | "fix"            // Resolve an error
  | "enhancement";   // Improve content quality

/**
 * A single suggestion from the AI copilot.
 */
export interface Suggestion {
  id: string;
  type: SuggestionType;
  content: string;
  confidence: number;        // 0-1 relevance score
  context: string;           // Why this suggestion
  preview?: string;          // What will change
  keybinding?: string;       // Quick accept shortcut
  position?: {               // Where to apply
    line: number;
    column: number;
  };
}

/**
 * Natural language command intent.
 */
export type NLIntent =
  | { type: "create"; entity: "set" | "rule" | "config"; data: Record<string, unknown> }
  | { type: "modify"; target: string; changes: Record<string, unknown> }
  | { type: "delete"; target: string }
  | { type: "navigate"; destination: string }
  | { type: "test"; path: string }
  | { type: "explain"; concept: string }
  | { type: "search"; query: string }
  | { type: "unknown"; rawInput: string };

/**
 * Result of parsing a natural language command.
 */
export interface NLParseResult {
  intent: NLIntent;
  confidence: number;
  alternatives: NLIntent[];
  rawInput: string;
}

/**
 * Context data for the AI copilot.
 */
export interface CopilotContext {
  // Current editor state
  currentLine: number;
  currentColumn: number;
  selectedText: string | null;
  surroundingLines: string[];

  // Configuration state
  configContent: string;
  parsedConfig: ParsedConfig | null;
  validationErrors: ValidationError[];

  // User state
  recentActions: string[];
  currentView: string;

  // Temporal
  sessionDuration: number;
}

/**
 * Parsed configuration structure.
 */
export interface ParsedConfig {
  sets: Record<string, string>;
  attributes: Record<string, string>;
  compound: Record<string, string>;
  rules: {
    topic: Array<{ condition: string; result: string; line: number }>;
    type: Array<{ condition: string; result: string; line: number }>;
    filetype: Array<{ condition: string; result: string; line: number }>;
  };
}

/**
 * Validation error from the RSES parser.
 */
export interface ValidationError {
  line: number;
  message: string;
  code?: string;
}

/**
 * User behavior model for adaptive suggestions.
 */
export interface UserBehaviorModel {
  // Interaction patterns
  preferredInputMethod: "keyboard" | "mouse" | "voice" | "mixed";
  shortcutsUsed: Record<string, number>;
  featuresUsed: Record<string, number>;

  // Content patterns
  commonPatterns: string[];
  preferredNamingStyle: "snake_case" | "camelCase" | "kebab-case";

  // Error patterns
  frequentErrors: string[];

  // Temporal patterns
  peakActivityHours: number[];
  averageSessionDuration: number;
}

/**
 * Copilot state and actions.
 */
export interface CopilotState {
  // Status
  isActive: boolean;
  isProcessing: boolean;

  // Suggestions
  suggestions: Suggestion[];
  activeSuggestion: Suggestion | null;

  // Natural language
  nlInput: string;
  lastParseResult: NLParseResult | null;

  // Context
  context: CopilotContext | null;

  // User model
  userModel: UserBehaviorModel;
  expertiseLevel: ExpertiseLevel;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generates a unique ID for suggestions.
 */
function generateId(): string {
  return `suggestion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extracts the set name being edited from the current line.
 */
function extractSetName(line: string): string | null {
  const match = line.match(/^\$(\w+)\s*=/);
  return match ? match[1] : null;
}

/**
 * Detects common RSES patterns in text.
 */
function detectPattern(text: string): "glob" | "attribute" | "compound" | "rule" | null {
  if (text.includes("*")) return "glob";
  if (text.includes("{") && text.includes("=")) return "attribute";
  if (text.includes("$") && (text.includes("|") || text.includes("&"))) return "compound";
  if (text.includes("->")) return "rule";
  return null;
}

/**
 * Parses natural language input into an intent.
 */
function parseNaturalLanguage(input: string): NLParseResult {
  const lowered = input.toLowerCase().trim();
  const words = lowered.split(/\s+/);

  // Create patterns
  const createPatterns = [
    /^create\s+(a\s+)?set\s+(for|named|called)\s+(.+)/i,
    /^make\s+(a\s+)?set\s+(for|named|called)\s+(.+)/i,
    /^add\s+(a\s+)?set\s+(for|named|called)\s+(.+)/i,
    /^define\s+(a\s+)?set\s+(for|named|called)\s+(.+)/i,
  ];

  for (const pattern of createPatterns) {
    const match = input.match(pattern);
    if (match) {
      const description = match[3];
      return {
        intent: {
          type: "create",
          entity: "set",
          data: {
            description,
            suggestedName: description.replace(/\s+/g, "_").toLowerCase(),
          },
        },
        confidence: 0.85,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Rule patterns
  const rulePatterns = [
    /^(add|create)\s+(a\s+)?rule\s+(for|to|that)\s+(.+)/i,
    /^map\s+(.+)\s+to\s+(.+)/i,
    /^link\s+(.+)\s+to\s+(.+)/i,
  ];

  for (const pattern of rulePatterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        intent: {
          type: "create",
          entity: "rule",
          data: { description: match[match.length - 1] },
        },
        confidence: 0.8,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Test patterns
  const testPatterns = [
    /^test\s+(with\s+)?(.+)/i,
    /^check\s+(if\s+)?(.+)/i,
    /^run\s+(test\s+)?(on\s+)?(.+)/i,
  ];

  for (const pattern of testPatterns) {
    const match = input.match(pattern);
    if (match) {
      const path = match[match.length - 1];
      return {
        intent: { type: "test", path },
        confidence: 0.9,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Explain patterns
  const explainPatterns = [
    /^(explain|what\s+is|what\s+does|how\s+does)\s+(.+)/i,
    /^tell\s+me\s+about\s+(.+)/i,
  ];

  for (const pattern of explainPatterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        intent: { type: "explain", concept: match[match.length - 1] },
        confidence: 0.85,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Navigation patterns
  const navPatterns = [
    /^go\s+to\s+(.+)/i,
    /^open\s+(.+)/i,
    /^show\s+(me\s+)?(.+)/i,
    /^navigate\s+to\s+(.+)/i,
  ];

  for (const pattern of navPatterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        intent: { type: "navigate", destination: match[match.length - 1] },
        confidence: 0.75,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Search patterns
  const searchPatterns = [
    /^(find|search\s+for|look\s+for)\s+(.+)/i,
  ];

  for (const pattern of searchPatterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        intent: { type: "search", query: match[2] },
        confidence: 0.8,
        alternatives: [],
        rawInput: input,
      };
    }
  }

  // Unknown intent
  return {
    intent: { type: "unknown", rawInput: input },
    confidence: 0.3,
    alternatives: [],
    rawInput: input,
  };
}

/**
 * Generates context-aware suggestions based on current state.
 */
function generateSuggestions(context: CopilotContext, userModel: UserBehaviorModel): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const { currentLine, configContent, parsedConfig, validationErrors } = context;

  const lines = configContent.split("\n");
  const currentLineContent = lines[currentLine - 1] || "";

  // 1. Error fixes
  const currentLineErrors = validationErrors.filter(e => e.line === currentLine);
  for (const error of currentLineErrors) {
    suggestions.push({
      id: generateId(),
      type: "fix",
      content: generateErrorFix(error, currentLineContent),
      confidence: 0.95,
      context: `Fix error: ${error.message}`,
      position: { line: currentLine, column: 1 },
    });
  }

  // 2. Completions based on current line
  if (currentLineContent.startsWith("$") && !currentLineContent.includes("=")) {
    // Completing a set name
    const partialName = currentLineContent.substring(1).trim();
    suggestions.push({
      id: generateId(),
      type: "completion",
      content: `$${partialName || "new_set"} = `,
      confidence: 0.8,
      context: "Complete set definition",
      keybinding: "Tab",
    });
  }

  // 3. Pattern suggestions based on context
  if (currentLineContent.includes("=") && !currentLineContent.includes("->")) {
    const setName = extractSetName(currentLineContent);
    if (setName) {
      // Suggest pattern based on name
      if (setName.includes("web") || setName.includes("website")) {
        suggestions.push({
          id: generateId(),
          type: "completion",
          content: `$${setName} = {source = web} | *-web-*`,
          confidence: 0.7,
          context: "Pattern for web projects",
        });
      }
      if (setName.includes("tool") || setName.includes("utility")) {
        suggestions.push({
          id: generateId(),
          type: "completion",
          content: `$${setName} = tool-* | utility-*`,
          confidence: 0.7,
          context: "Pattern for tool projects",
        });
      }
      if (setName.includes("ai") || setName.includes("claude") || setName.includes("gpt")) {
        suggestions.push({
          id: generateId(),
          type: "completion",
          content: `$${setName} = by-ai/* | {source = ai}`,
          confidence: 0.75,
          context: "Pattern for AI projects",
        });
      }
    }
  }

  // 4. Rule suggestions when sets exist
  if (parsedConfig && Object.keys(parsedConfig.sets).length > 0) {
    const setNames = Object.keys(parsedConfig.sets);
    const hasRules = parsedConfig.rules.topic.length > 0 ||
                     parsedConfig.rules.type.length > 0;

    if (!hasRules && currentLineContent.trim() === "") {
      suggestions.push({
        id: generateId(),
        type: "insertion",
        content: `\n# Rules\ntopic: $${setNames[0]} -> ${setNames[0]}/`,
        confidence: 0.6,
        context: "Add a rule for your sets",
        preview: "Creates a topic rule mapping set to category",
      });
    }
  }

  // 5. Common patterns from user history
  for (const pattern of userModel.commonPatterns.slice(0, 3)) {
    if (currentLineContent.trim() === "" && pattern) {
      suggestions.push({
        id: generateId(),
        type: "insertion",
        content: pattern,
        confidence: 0.5,
        context: "Pattern you use frequently",
      });
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/**
 * Generates a fix suggestion for an error.
 */
function generateErrorFix(error: ValidationError, lineContent: string): string {
  const { message, code } = error;

  // Common error fixes
  if (message.includes("missing") && message.includes("}")) {
    return lineContent + "}";
  }
  if (message.includes("missing") && message.includes("=")) {
    return lineContent.replace(/^(\$\w+)\s*$/, "$1 = ");
  }
  if (message.includes("undefined set")) {
    const match = message.match(/\$(\w+)/);
    if (match) {
      return `$${match[1]} = *  # TODO: Define this set`;
    }
  }
  if (message.includes("duplicate")) {
    return `# ${lineContent}  # Duplicate - consider removing`;
  }

  // Generic fix - add a comment
  return `${lineContent}  # FIXME: ${message}`;
}

/**
 * Generates an explanation for a concept.
 */
function generateExplanation(concept: string): string {
  const concepts: Record<string, string> = {
    "set": "A set is a named collection of projects defined by a pattern or attributes. Example: $tools = tool-*",
    "pattern": "Patterns use glob syntax (* and ?) to match project names. Example: tool-* matches tool-cli, tool-web, etc.",
    "attribute": "Attributes filter projects by metadata like source. Example: {source = claude} matches projects from Claude.",
    "compound": "Compound sets combine other sets with | (union) or & (intersection). Example: $ai = $claude | $gpt",
    "rule": "Rules map set expressions to categories using ->. Example: topic: $tools -> tools/",
    "union": "The | operator creates a union of sets (projects in either). Example: $a | $b",
    "intersection": "The & operator creates an intersection (projects in both). Example: $a & $b",
    "topic": "Topic rules determine the primary category for symlinks. Most common rule type.",
    "type": "Type rules add secondary categorization to projects.",
    "filetype": "Filetype rules categorize based on file types in the project.",
  };

  const key = concept.toLowerCase().replace(/[^a-z]/g, "");
  return concepts[key] || `I don't have a specific explanation for "${concept}". Try asking about sets, patterns, attributes, or rules.`;
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * AI Copilot hook providing context-aware suggestions and natural language commands.
 */
export function useAICopilot() {
  // Persisted state
  const [expertiseLevel, setExpertiseLevel] = useLocalStorage<ExpertiseLevel>(
    "copilot-expertise",
    "intermediate"
  );
  const [userModel, setUserModel] = useLocalStorage<UserBehaviorModel>(
    "copilot-user-model",
    {
      preferredInputMethod: "mixed",
      shortcutsUsed: {},
      featuresUsed: {},
      commonPatterns: [],
      preferredNamingStyle: "snake_case",
      frequentErrors: [],
      peakActivityHours: [],
      averageSessionDuration: 0,
    }
  );
  const [isActive, setIsActive] = useLocalStorage("copilot-active", true);

  // Local state
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [nlInput, setNLInput] = useState("");
  const [lastParseResult, setLastParseResult] = useState<NLParseResult | null>(null);
  const [context, setContext] = useState<CopilotContext | null>(null);

  // Session tracking
  const sessionStartRef = useRef<number>(Date.now());
  const recentActionsRef = useRef<string[]>([]);

  /**
   * Updates the copilot context.
   */
  const updateContext = useCallback((newContext: Partial<CopilotContext>) => {
    setContext(prev => ({
      currentLine: 1,
      currentColumn: 1,
      selectedText: null,
      surroundingLines: [],
      configContent: "",
      parsedConfig: null,
      validationErrors: [],
      recentActions: recentActionsRef.current,
      currentView: "editor",
      sessionDuration: Date.now() - sessionStartRef.current,
      ...prev,
      ...newContext,
    }));
  }, []);

  /**
   * Generates suggestions based on current context.
   */
  const refreshSuggestions = useCallback(() => {
    if (!isActive || !context) {
      setSuggestions([]);
      return;
    }

    setIsProcessing(true);

    // Simulate async processing
    requestAnimationFrame(() => {
      const newSuggestions = generateSuggestions(context, userModel);
      setSuggestions(newSuggestions);
      setActiveSuggestion(newSuggestions[0] || null);
      setIsProcessing(false);
    });
  }, [isActive, context, userModel]);

  // Refresh suggestions when context changes
  useEffect(() => {
    if (context) {
      refreshSuggestions();
    }
  }, [context, refreshSuggestions]);

  /**
   * Processes a natural language command.
   */
  const processNaturalLanguage = useCallback((input: string): NLParseResult => {
    setNLInput(input);
    const result = parseNaturalLanguage(input);
    setLastParseResult(result);

    // Track for learning
    recentActionsRef.current = [
      `nl:${result.intent.type}`,
      ...recentActionsRef.current.slice(0, 9),
    ];

    return result;
  }, []);

  /**
   * Accepts the current active suggestion.
   */
  const acceptSuggestion = useCallback((suggestion?: Suggestion) => {
    const toAccept = suggestion || activeSuggestion;
    if (!toAccept) return null;

    // Track acceptance for learning
    setUserModel(prev => ({
      ...prev,
      featuresUsed: {
        ...prev.featuresUsed,
        [`suggestion-${toAccept.type}`]: (prev.featuresUsed[`suggestion-${toAccept.type}`] || 0) + 1,
      },
    }));

    recentActionsRef.current = [
      `accept:${toAccept.type}`,
      ...recentActionsRef.current.slice(0, 9),
    ];

    return toAccept;
  }, [activeSuggestion, setUserModel]);

  /**
   * Dismisses the current suggestion.
   */
  const dismissSuggestion = useCallback((suggestion?: Suggestion) => {
    const toDismiss = suggestion || activeSuggestion;
    if (!toDismiss) return;

    setSuggestions(prev => prev.filter(s => s.id !== toDismiss.id));
    if (activeSuggestion?.id === toDismiss.id) {
      setActiveSuggestion(suggestions.find(s => s.id !== toDismiss.id) || null);
    }
  }, [activeSuggestion, suggestions]);

  /**
   * Navigates between suggestions.
   */
  const nextSuggestion = useCallback(() => {
    if (suggestions.length === 0) return;
    const currentIndex = suggestions.findIndex(s => s.id === activeSuggestion?.id);
    const nextIndex = (currentIndex + 1) % suggestions.length;
    setActiveSuggestion(suggestions[nextIndex]);
  }, [suggestions, activeSuggestion]);

  const previousSuggestion = useCallback(() => {
    if (suggestions.length === 0) return;
    const currentIndex = suggestions.findIndex(s => s.id === activeSuggestion?.id);
    const prevIndex = (currentIndex - 1 + suggestions.length) % suggestions.length;
    setActiveSuggestion(suggestions[prevIndex]);
  }, [suggestions, activeSuggestion]);

  /**
   * Gets an explanation for a concept.
   */
  const explain = useCallback((concept: string): string => {
    recentActionsRef.current = [
      `explain:${concept}`,
      ...recentActionsRef.current.slice(0, 9),
    ];
    return generateExplanation(concept);
  }, []);

  /**
   * Records a user action for learning.
   */
  const recordAction = useCallback((action: string) => {
    recentActionsRef.current = [action, ...recentActionsRef.current.slice(0, 19)];

    // Update user model
    setUserModel(prev => ({
      ...prev,
      featuresUsed: {
        ...prev.featuresUsed,
        [action]: (prev.featuresUsed[action] || 0) + 1,
      },
    }));
  }, [setUserModel]);

  /**
   * Records a shortcut usage for learning.
   */
  const recordShortcut = useCallback((shortcut: string) => {
    setUserModel(prev => ({
      ...prev,
      shortcutsUsed: {
        ...prev.shortcutsUsed,
        [shortcut]: (prev.shortcutsUsed[shortcut] || 0) + 1,
      },
      preferredInputMethod: "keyboard",
    }));
  }, [setUserModel]);

  /**
   * Records a pattern for learning.
   */
  const recordPattern = useCallback((pattern: string) => {
    setUserModel(prev => {
      const patterns = prev.commonPatterns.includes(pattern)
        ? prev.commonPatterns
        : [pattern, ...prev.commonPatterns].slice(0, 10);
      return { ...prev, commonPatterns: patterns };
    });
  }, [setUserModel]);

  /**
   * Records an error for learning.
   */
  const recordError = useCallback((error: string) => {
    setUserModel(prev => {
      const errors = prev.frequentErrors.includes(error)
        ? prev.frequentErrors
        : [error, ...prev.frequentErrors].slice(0, 10);
      return { ...prev, frequentErrors: errors };
    });
  }, [setUserModel]);

  /**
   * Toggles the copilot on/off.
   */
  const toggleActive = useCallback(() => {
    setIsActive(prev => !prev);
    if (!isActive) {
      setSuggestions([]);
      setActiveSuggestion(null);
    }
  }, [isActive, setIsActive]);

  /**
   * Resets the user model.
   */
  const resetUserModel = useCallback(() => {
    setUserModel({
      preferredInputMethod: "mixed",
      shortcutsUsed: {},
      featuresUsed: {},
      commonPatterns: [],
      preferredNamingStyle: "snake_case",
      frequentErrors: [],
      peakActivityHours: [],
      averageSessionDuration: 0,
    });
  }, [setUserModel]);

  // Current state
  const state: CopilotState = useMemo(() => ({
    isActive,
    isProcessing,
    suggestions,
    activeSuggestion,
    nlInput,
    lastParseResult,
    context,
    userModel,
    expertiseLevel,
  }), [
    isActive,
    isProcessing,
    suggestions,
    activeSuggestion,
    nlInput,
    lastParseResult,
    context,
    userModel,
    expertiseLevel,
  ]);

  return {
    // State
    state,

    // Context
    updateContext,

    // Suggestions
    refreshSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    nextSuggestion,
    previousSuggestion,

    // Natural language
    processNaturalLanguage,

    // Explanations
    explain,

    // Learning
    recordAction,
    recordShortcut,
    recordPattern,
    recordError,

    // Settings
    toggleActive,
    setExpertiseLevel,
    resetUserModel,
  };
}

/**
 * Hook for accessing AI explanations.
 */
export function useAIExplainer() {
  const { explain } = useAICopilot();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [concept, setConcept] = useState<string | null>(null);

  const getExplanation = useCallback((newConcept: string) => {
    setConcept(newConcept);
    setExplanation(explain(newConcept));
  }, [explain]);

  const clearExplanation = useCallback(() => {
    setExplanation(null);
    setConcept(null);
  }, []);

  return {
    explanation,
    concept,
    getExplanation,
    clearExplanation,
  };
}

/**
 * Hook for voice input (placeholder for future implementation).
 */
export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check for Web Speech API support
    setIsSupported(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    setIsListening(true);
    setTranscript("");
    // Implementation would use SpeechRecognition API
  }, [isSupported]);

  const stopListening = useCallback(() => {
    setIsListening(false);
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
  };
}

export default useAICopilot;
