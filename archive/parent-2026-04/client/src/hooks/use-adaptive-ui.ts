/**
 * @file use-adaptive-ui.ts
 * @description Adaptive UI system that learns user preferences and adjusts the interface
 * based on behavior patterns, time of day, and expertise level.
 * @phase Phase 6 - AI-Enhanced UX
 * @author UX (UX Design Expert Agent)
 * @created 2026-02-01
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "./use-local-storage";

// =============================================================================
// Types
// =============================================================================

/**
 * User preference settings.
 */
export interface UserPreferences {
  // Visual preferences
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  highContrast: boolean;
  fontSize: "small" | "medium" | "large";

  // Layout preferences
  sidebarCollapsed: boolean;
  panelLayout: "horizontal" | "vertical";
  defaultView: "editor" | "workbench" | "dashboard";

  // Interaction preferences
  keyboardFirst: boolean;
  showTooltips: boolean;
  autoSave: boolean;
  autoSaveInterval: number;

  // AI preferences
  copilotEnabled: boolean;
  suggestionVerbosity: "minimal" | "standard" | "verbose";
  autoComplete: boolean;

  // Accessibility preferences
  screenReaderOptimized: boolean;
  announceLevel: "all" | "important" | "minimal";
}

/**
 * Navigation prediction.
 */
export interface NavigationPrediction {
  destination: string;
  probability: number;
  reason: string;
  trigger: "action" | "time" | "sequence";
}

/**
 * Shortcut suggestion based on user behavior.
 */
export interface ShortcutSuggestion {
  action: string;
  suggestedKeys: string;
  frequency: number;
  reason: string;
}

/**
 * Form adaptation settings.
 */
export interface FormAdaptation {
  mode: "simple" | "standard" | "advanced";
  hiddenFields: string[];
  defaultValues: Record<string, unknown>;
  showInlineHelp: boolean;
  validationTiming: "immediate" | "blur" | "submit";
}

/**
 * Time-based context.
 */
export interface TemporalContext {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  dayOfWeek: "weekday" | "weekend";
  sessionDuration: number;
  isRushHour: boolean;
}

/**
 * Navigation history entry.
 */
interface NavigationEntry {
  from: string;
  to: string;
  timestamp: number;
}

/**
 * Adaptive UI state.
 */
export interface AdaptiveUIState {
  preferences: UserPreferences;
  temporalContext: TemporalContext;
  navigationPredictions: NavigationPrediction[];
  shortcutSuggestions: ShortcutSuggestion[];
  formAdaptation: FormAdaptation;
  complexityLevel: "beginner" | "intermediate" | "advanced";
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  reducedMotion: false,
  highContrast: false,
  fontSize: "medium",
  sidebarCollapsed: false,
  panelLayout: "horizontal",
  defaultView: "editor",
  keyboardFirst: false,
  showTooltips: true,
  autoSave: true,
  autoSaveInterval: 30000,
  copilotEnabled: true,
  suggestionVerbosity: "standard",
  autoComplete: true,
  screenReaderOptimized: false,
  announceLevel: "important",
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Determines time of day context.
 */
function getTemporalContext(): TemporalContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  let timeOfDay: TemporalContext["timeOfDay"];
  if (hour >= 5 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
  else if (hour >= 17 && hour < 21) timeOfDay = "evening";
  else timeOfDay = "night";

  const dayOfWeek = day === 0 || day === 6 ? "weekend" : "weekday";

  // Rush hours: 8-10am and 5-7pm on weekdays
  const isRushHour = dayOfWeek === "weekday" &&
    ((hour >= 8 && hour < 10) || (hour >= 17 && hour < 19));

  return {
    timeOfDay,
    dayOfWeek,
    sessionDuration: 0,
    isRushHour,
  };
}

/**
 * Calculates navigation predictions from history.
 */
function calculateNavigationPredictions(
  history: NavigationEntry[],
  currentView: string
): NavigationPrediction[] {
  if (history.length < 3) return [];

  // Count transitions from current view
  const transitions: Record<string, number> = {};
  let totalTransitions = 0;

  for (const entry of history) {
    if (entry.from === currentView) {
      transitions[entry.to] = (transitions[entry.to] || 0) + 1;
      totalTransitions++;
    }
  }

  // Convert to predictions
  const predictions: NavigationPrediction[] = [];

  for (const [destination, count] of Object.entries(transitions)) {
    const probability = count / totalTransitions;
    if (probability >= 0.3) {
      predictions.push({
        destination,
        probability,
        reason: `You often go to ${destination} from here`,
        trigger: "sequence",
      });
    }
  }

  return predictions.sort((a, b) => b.probability - a.probability).slice(0, 3);
}

/**
 * Calculates shortcut suggestions from action history.
 */
function calculateShortcutSuggestions(
  actionHistory: Record<string, number>,
  existingShortcuts: string[]
): ShortcutSuggestion[] {
  const suggestions: ShortcutSuggestion[] = [];

  // Sort actions by frequency
  const sortedActions = Object.entries(actionHistory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Suggest shortcuts for frequent actions without shortcuts
  for (const [action, frequency] of sortedActions) {
    if (frequency >= 10 && !existingShortcuts.includes(action)) {
      suggestions.push({
        action,
        suggestedKeys: suggestKeybinding(action),
        frequency,
        reason: `You use this ${frequency} times per session`,
      });
    }
  }

  return suggestions.slice(0, 5);
}

/**
 * Suggests a keybinding for an action.
 */
function suggestKeybinding(action: string): string {
  const actionBindings: Record<string, string> = {
    save: "Ctrl+S",
    test: "Ctrl+T",
    validate: "Ctrl+Enter",
    preview: "Ctrl+P",
    workbench: "Ctrl+W",
    dashboard: "Ctrl+D",
    help: "F1",
    search: "Ctrl+K",
    newSet: "Ctrl+Shift+S",
    newRule: "Ctrl+Shift+R",
  };

  return actionBindings[action] || `Ctrl+${action.charAt(0).toUpperCase()}`;
}

/**
 * Determines form adaptation based on user expertise.
 */
function calculateFormAdaptation(
  expertiseLevel: "beginner" | "intermediate" | "advanced",
  preferences: UserPreferences
): FormAdaptation {
  switch (expertiseLevel) {
    case "beginner":
      return {
        mode: "simple",
        hiddenFields: ["rawExpression", "advancedOptions", "metadata"],
        defaultValues: {},
        showInlineHelp: true,
        validationTiming: "immediate",
      };
    case "intermediate":
      return {
        mode: "standard",
        hiddenFields: ["metadata"],
        defaultValues: {},
        showInlineHelp: preferences.showTooltips,
        validationTiming: "blur",
      };
    case "advanced":
      return {
        mode: "advanced",
        hiddenFields: [],
        defaultValues: {},
        showInlineHelp: false,
        validationTiming: "submit",
      };
  }
}

/**
 * Determines expertise level from user behavior.
 */
function calculateExpertiseLevel(
  totalActions: number,
  errorRate: number,
  advancedFeatureUsage: number
): "beginner" | "intermediate" | "advanced" {
  // Beginner: few actions, high error rate, no advanced features
  if (totalActions < 50 || errorRate > 0.3) {
    return "beginner";
  }

  // Advanced: many actions, low error rate, uses advanced features
  if (totalActions > 500 && errorRate < 0.1 && advancedFeatureUsage > 10) {
    return "advanced";
  }

  return "intermediate";
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Adaptive UI hook that learns user behavior and adjusts the interface.
 */
export function useAdaptiveUI() {
  // Persisted preferences
  const [preferences, setPreferences] = useLocalStorage<UserPreferences>(
    "adaptive-preferences",
    DEFAULT_PREFERENCES
  );

  // Persisted history
  const [navigationHistory, setNavigationHistory] = useLocalStorage<NavigationEntry[]>(
    "adaptive-nav-history",
    []
  );
  const [actionHistory, setActionHistory] = useLocalStorage<Record<string, number>>(
    "adaptive-action-history",
    {}
  );
  const [errorCount, setErrorCount] = useLocalStorage<number>("adaptive-error-count", 0);
  const [advancedUsage, setAdvancedUsage] = useLocalStorage<number>("adaptive-advanced-usage", 0);

  // Local state
  const [currentView, setCurrentView] = useState("editor");
  const [sessionStart] = useState(() => Date.now());

  // Calculated values
  const temporalContext = useMemo(() => {
    const context = getTemporalContext();
    context.sessionDuration = Date.now() - sessionStart;
    return context;
  }, [sessionStart]);

  const totalActions = useMemo(
    () => Object.values(actionHistory).reduce((sum, count) => sum + count, 0),
    [actionHistory]
  );

  const errorRate = useMemo(
    () => totalActions > 0 ? errorCount / totalActions : 0,
    [errorCount, totalActions]
  );

  const complexityLevel = useMemo(
    () => calculateExpertiseLevel(totalActions, errorRate, advancedUsage),
    [totalActions, errorRate, advancedUsage]
  );

  const navigationPredictions = useMemo(
    () => calculateNavigationPredictions(navigationHistory, currentView),
    [navigationHistory, currentView]
  );

  const shortcutSuggestions = useMemo(
    () => calculateShortcutSuggestions(actionHistory, []),
    [actionHistory]
  );

  const formAdaptation = useMemo(
    () => calculateFormAdaptation(complexityLevel, preferences),
    [complexityLevel, preferences]
  );

  /**
   * Updates a preference.
   */
  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, [setPreferences]);

  /**
   * Resets preferences to defaults.
   */
  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, [setPreferences]);

  /**
   * Records a navigation event.
   */
  const recordNavigation = useCallback((from: string, to: string) => {
    setNavigationHistory(prev => {
      const entry: NavigationEntry = { from, to, timestamp: Date.now() };
      // Keep last 100 entries
      return [entry, ...prev].slice(0, 100);
    });
    setCurrentView(to);
  }, [setNavigationHistory]);

  /**
   * Records an action for learning.
   */
  const recordAction = useCallback((action: string) => {
    setActionHistory(prev => ({
      ...prev,
      [action]: (prev[action] || 0) + 1,
    }));
  }, [setActionHistory]);

  /**
   * Records an error.
   */
  const recordError = useCallback(() => {
    setErrorCount(prev => prev + 1);
  }, [setErrorCount]);

  /**
   * Records advanced feature usage.
   */
  const recordAdvancedUsage = useCallback(() => {
    setAdvancedUsage(prev => prev + 1);
  }, [setAdvancedUsage]);

  /**
   * Clears learning data.
   */
  const clearLearningData = useCallback(() => {
    setNavigationHistory([]);
    setActionHistory({});
    setErrorCount(0);
    setAdvancedUsage(0);
  }, [setNavigationHistory, setActionHistory, setErrorCount, setAdvancedUsage]);

  // Apply system preferences
  useEffect(() => {
    // Check for reduced motion preference
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches && !preferences.reducedMotion) {
      setPreferences(prev => ({ ...prev, reducedMotion: true }));
    }

    // Check for high contrast preference
    const contrastQuery = window.matchMedia("(prefers-contrast: more)");
    if (contrastQuery.matches && !preferences.highContrast) {
      setPreferences(prev => ({ ...prev, highContrast: true }));
    }
  }, [preferences.reducedMotion, preferences.highContrast, setPreferences]);

  // State object
  const state: AdaptiveUIState = useMemo(() => ({
    preferences,
    temporalContext,
    navigationPredictions,
    shortcutSuggestions,
    formAdaptation,
    complexityLevel,
  }), [
    preferences,
    temporalContext,
    navigationPredictions,
    shortcutSuggestions,
    formAdaptation,
    complexityLevel,
  ]);

  return {
    // State
    state,
    preferences,
    complexityLevel,
    temporalContext,
    navigationPredictions,
    shortcutSuggestions,
    formAdaptation,

    // Preference management
    updatePreference,
    resetPreferences,

    // Learning
    recordNavigation,
    recordAction,
    recordError,
    recordAdvancedUsage,
    clearLearningData,

    // Current view
    currentView,
    setCurrentView,
  };
}

/**
 * Hook for predictive navigation suggestions.
 */
export function usePredictiveNavigation() {
  const { navigationPredictions, recordNavigation, currentView } = useAdaptiveUI();

  const navigate = useCallback((destination: string) => {
    recordNavigation(currentView, destination);
  }, [recordNavigation, currentView]);

  const topPrediction = navigationPredictions[0] || null;

  return {
    predictions: navigationPredictions,
    topPrediction,
    navigate,
  };
}

/**
 * Hook for adaptive forms.
 */
export function useAdaptiveForm(formId: string) {
  const { formAdaptation, complexityLevel, preferences } = useAdaptiveUI();

  const shouldShowField = useCallback((fieldName: string): boolean => {
    return !formAdaptation.hiddenFields.includes(fieldName);
  }, [formAdaptation.hiddenFields]);

  const getFieldHelp = useCallback((fieldName: string, helpText: string): string | null => {
    if (!formAdaptation.showInlineHelp) return null;
    return helpText;
  }, [formAdaptation.showInlineHelp]);

  return {
    mode: formAdaptation.mode,
    showInlineHelp: formAdaptation.showInlineHelp,
    validationTiming: formAdaptation.validationTiming,
    shouldShowField,
    getFieldHelp,
    complexityLevel,
    autoComplete: preferences.autoComplete,
  };
}

/**
 * Hook for personalized shortcuts.
 */
export function usePersonalizedShortcuts() {
  const { shortcutSuggestions, recordAction } = useAdaptiveUI();
  const [customShortcuts, setCustomShortcuts] = useLocalStorage<Record<string, string>>(
    "custom-shortcuts",
    {}
  );

  const addCustomShortcut = useCallback((action: string, keys: string) => {
    setCustomShortcuts(prev => ({ ...prev, [action]: keys }));
  }, [setCustomShortcuts]);

  const removeCustomShortcut = useCallback((action: string) => {
    setCustomShortcuts(prev => {
      const next = { ...prev };
      delete next[action];
      return next;
    });
  }, [setCustomShortcuts]);

  const acceptSuggestion = useCallback((suggestion: ShortcutSuggestion) => {
    addCustomShortcut(suggestion.action, suggestion.suggestedKeys);
    recordAction("shortcut-accepted");
  }, [addCustomShortcut, recordAction]);

  return {
    suggestions: shortcutSuggestions,
    customShortcuts,
    addCustomShortcut,
    removeCustomShortcut,
    acceptSuggestion,
  };
}

export default useAdaptiveUI;
