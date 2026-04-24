/**
 * @file use-accessibility.ts
 * @description Comprehensive accessibility system for WCAG 2.2 AAA compliance.
 * Provides hooks for announcements, focus management, keyboard navigation,
 * and accessibility preferences.
 * @phase Phase 6 - AI-Enhanced UX
 * @author UX (UX Design Expert Agent)
 * @created 2026-02-01
 */

import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext } from "react";
import { useLocalStorage } from "./use-local-storage";

// =============================================================================
// Types
// =============================================================================

/**
 * Accessibility preferences for WCAG 2.2 AAA compliance.
 */
export interface AccessibilityPreferences {
  // Visual preferences
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  textSpacing: boolean;

  // Focus preferences
  enhancedFocusIndicators: boolean;
  focusWithinEnabled: boolean;

  // Screen reader preferences
  screenReaderOptimized: boolean;
  announceLevel: "all" | "important" | "minimal";
  verboseDescriptions: boolean;

  // Motor preferences
  largeTargets: boolean;
  extendedTimeLimits: boolean;
  stickyKeys: boolean;

  // Cognitive preferences
  simplifiedUI: boolean;
  consistentNavigation: boolean;
  errorPrevention: boolean;
}

/**
 * Announcement for screen readers.
 */
export interface Announcement {
  id: string;
  message: string;
  priority: "polite" | "assertive";
  timestamp: Date;
}

/**
 * Focus history entry for focus management.
 */
export interface FocusHistoryEntry {
  element: HTMLElement;
  timestamp: Date;
  context: string;
}

/**
 * Keyboard navigation direction.
 */
export type NavigationDirection = "up" | "down" | "left" | "right" | "home" | "end";

/**
 * Roving tabindex group configuration.
 */
export interface RovingTabindexConfig {
  groupId: string;
  orientation: "horizontal" | "vertical" | "grid";
  wrap: boolean;
  homeEndKeys: boolean;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  highContrast: false,
  reducedMotion: false,
  largeText: false,
  textSpacing: false,
  enhancedFocusIndicators: true,
  focusWithinEnabled: true,
  screenReaderOptimized: false,
  announceLevel: "important",
  verboseDescriptions: false,
  largeTargets: false,
  extendedTimeLimits: false,
  stickyKeys: false,
  simplifiedUI: false,
  consistentNavigation: true,
  errorPrevention: true,
};

// =============================================================================
// Context
// =============================================================================

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  updatePreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  announce: (message: string, priority?: "polite" | "assertive") => void;
  announcements: Announcement[];
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generates a unique ID.
 */
function generateId(): string {
  return `a11y-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Gets the next focusable element in a direction.
 */
function getNextFocusable(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: NavigationDirection,
  wrap: boolean
): HTMLElement | null {
  const currentIndex = elements.indexOf(current);
  if (currentIndex === -1) return elements[0] || null;

  let nextIndex: number;

  switch (direction) {
    case "down":
    case "right":
      nextIndex = currentIndex + 1;
      if (nextIndex >= elements.length) {
        nextIndex = wrap ? 0 : elements.length - 1;
      }
      break;
    case "up":
    case "left":
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = wrap ? elements.length - 1 : 0;
      }
      break;
    case "home":
      nextIndex = 0;
      break;
    case "end":
      nextIndex = elements.length - 1;
      break;
    default:
      return null;
  }

  return elements[nextIndex] || null;
}

/**
 * Gets all focusable elements within a container.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    "[contenteditable]",
  ].join(", ");

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

/**
 * Traps focus within a container (for modals).
 */
function createFocusTrap(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  };

  container.addEventListener("keydown", handleKeyDown);

  // Focus first element
  firstElement?.focus();

  // Return cleanup function
  return () => {
    container.removeEventListener("keydown", handleKeyDown);
  };
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Main accessibility hook providing preferences and announcements.
 */
export function useAccessibility() {
  // Persisted preferences
  const [preferences, setPreferences] = useLocalStorage<AccessibilityPreferences>(
    "accessibility-preferences",
    DEFAULT_PREFERENCES
  );

  // Announcements for screen readers
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  /**
   * Updates a single preference.
   */
  const updatePreference = useCallback(<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, [setPreferences]);

  /**
   * Resets all preferences to defaults.
   */
  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, [setPreferences]);

  /**
   * Announces a message to screen readers.
   */
  const announce = useCallback((
    message: string,
    priority: "polite" | "assertive" = "polite"
  ) => {
    const announcement: Announcement = {
      id: generateId(),
      message,
      priority,
      timestamp: new Date(),
    };

    setAnnouncements(prev => [...prev, announcement]);

    // Auto-clear after announcement
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== announcement.id));
    }, 5000);
  }, []);

  /**
   * Clears all announcements.
   */
  const clearAnnouncements = useCallback(() => {
    setAnnouncements([]);
  }, []);

  // Detect system preferences
  useEffect(() => {
    // Reduced motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      setPreferences(prev => ({ ...prev, reducedMotion: true }));
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPreferences(prev => ({ ...prev, reducedMotion: e.matches }));
    };

    motionQuery.addEventListener("change", handleMotionChange);

    // High contrast
    const contrastQuery = window.matchMedia("(prefers-contrast: more)");
    if (contrastQuery.matches) {
      setPreferences(prev => ({ ...prev, highContrast: true }));
    }

    const handleContrastChange = (e: MediaQueryListEvent) => {
      setPreferences(prev => ({ ...prev, highContrast: e.matches }));
    };

    contrastQuery.addEventListener("change", handleContrastChange);

    return () => {
      motionQuery.removeEventListener("change", handleMotionChange);
      contrastQuery.removeEventListener("change", handleContrastChange);
    };
  }, [setPreferences]);

  // Apply preferences to document
  useEffect(() => {
    const root = document.documentElement;

    // High contrast
    root.classList.toggle("high-contrast", preferences.highContrast);

    // Reduced motion
    root.classList.toggle("reduced-motion", preferences.reducedMotion);

    // Large text
    root.classList.toggle("large-text", preferences.largeText);

    // Text spacing
    root.classList.toggle("text-spacing", preferences.textSpacing);

    // Enhanced focus
    root.classList.toggle("enhanced-focus", preferences.enhancedFocusIndicators);

    // Large targets
    root.classList.toggle("large-targets", preferences.largeTargets);

    // Simplified UI
    root.classList.toggle("simplified-ui", preferences.simplifiedUI);
  }, [preferences]);

  return {
    preferences,
    updatePreference,
    resetPreferences,
    announce,
    announcements,
    clearAnnouncements,
  };
}

/**
 * Hook for live region announcements.
 */
export function useLiveRegion() {
  const { announce, preferences } = useAccessibility();

  const announcePolite = useCallback((message: string) => {
    if (preferences.announceLevel !== "minimal") {
      announce(message, "polite");
    }
  }, [announce, preferences.announceLevel]);

  const announceAssertive = useCallback((message: string) => {
    announce(message, "assertive");
  }, [announce]);

  const announceImportant = useCallback((message: string) => {
    if (preferences.announceLevel !== "minimal") {
      announce(message, "assertive");
    }
  }, [announce, preferences.announceLevel]);

  return {
    announcePolite,
    announceAssertive,
    announceImportant,
  };
}

/**
 * Hook for focus management.
 */
export function useFocusManagement() {
  const focusHistoryRef = useRef<FocusHistoryEntry[]>([]);
  const [currentFocus, setCurrentFocus] = useState<HTMLElement | null>(null);

  /**
   * Saves the current focus to history.
   */
  const saveFocus = useCallback((context: string = "default") => {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement !== document.body) {
      focusHistoryRef.current.push({
        element: activeElement,
        timestamp: new Date(),
        context,
      });
      setCurrentFocus(activeElement);
    }
  }, []);

  /**
   * Restores focus to the last saved element.
   */
  const restoreFocus = useCallback((context?: string) => {
    let entry: FocusHistoryEntry | undefined;

    if (context) {
      // Find last entry with matching context
      for (let i = focusHistoryRef.current.length - 1; i >= 0; i--) {
        if (focusHistoryRef.current[i].context === context) {
          entry = focusHistoryRef.current[i];
          break;
        }
      }
    } else {
      // Get last entry
      entry = focusHistoryRef.current.pop();
    }

    if (entry?.element && document.body.contains(entry.element)) {
      entry.element.focus();
      setCurrentFocus(entry.element);
    }
  }, []);

  /**
   * Moves focus to a specific element.
   */
  const moveFocus = useCallback((element: HTMLElement | null, saveHistory: boolean = true) => {
    if (saveHistory) {
      saveFocus();
    }

    if (element) {
      element.focus();
      setCurrentFocus(element);
    }
  }, [saveFocus]);

  /**
   * Moves focus to the first focusable element in a container.
   */
  const focusFirst = useCallback((container: HTMLElement, saveHistory: boolean = true) => {
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      moveFocus(focusable[0], saveHistory);
    }
  }, [moveFocus]);

  /**
   * Clears focus history.
   */
  const clearHistory = useCallback(() => {
    focusHistoryRef.current = [];
  }, []);

  return {
    currentFocus,
    saveFocus,
    restoreFocus,
    moveFocus,
    focusFirst,
    clearHistory,
    historyLength: focusHistoryRef.current.length,
  };
}

/**
 * Hook for focus trapping in modals/dialogs.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, active: boolean = true) {
  const { saveFocus, restoreFocus } = useFocusManagement();

  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Save current focus
    saveFocus("focus-trap");

    // Create trap
    const cleanup = createFocusTrap(containerRef.current);

    return () => {
      cleanup();
      // Restore focus on cleanup
      restoreFocus("focus-trap");
    };
  }, [active, containerRef, saveFocus, restoreFocus]);
}

/**
 * Hook for roving tabindex navigation.
 */
export function useRovingTabindex(config: RovingTabindexConfig) {
  const { groupId, orientation, wrap, homeEndKeys } = config;
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsRef = useRef<HTMLElement[]>([]);

  /**
   * Registers an item in the group.
   */
  const registerItem = useCallback((element: HTMLElement) => {
    if (!itemsRef.current.includes(element)) {
      itemsRef.current.push(element);
    }
  }, []);

  /**
   * Unregisters an item from the group.
   */
  const unregisterItem = useCallback((element: HTMLElement) => {
    const index = itemsRef.current.indexOf(element);
    if (index >= 0) {
      itemsRef.current.splice(index, 1);
    }
  }, []);

  /**
   * Handles keyboard navigation.
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const items = itemsRef.current;
    if (items.length === 0) return;

    let direction: NavigationDirection | null = null;

    switch (event.key) {
      case "ArrowUp":
        if (orientation !== "horizontal") {
          direction = "up";
        }
        break;
      case "ArrowDown":
        if (orientation !== "horizontal") {
          direction = "down";
        }
        break;
      case "ArrowLeft":
        if (orientation !== "vertical") {
          direction = "left";
        }
        break;
      case "ArrowRight":
        if (orientation !== "vertical") {
          direction = "right";
        }
        break;
      case "Home":
        if (homeEndKeys) {
          direction = "home";
        }
        break;
      case "End":
        if (homeEndKeys) {
          direction = "end";
        }
        break;
    }

    if (direction) {
      event.preventDefault();

      const currentElement = items[activeIndex];
      const nextElement = getNextFocusable(items, currentElement, direction, wrap);

      if (nextElement) {
        const newIndex = items.indexOf(nextElement);
        setActiveIndex(newIndex);
        nextElement.focus();
      }
    }
  }, [activeIndex, orientation, wrap, homeEndKeys]);

  /**
   * Gets props for an item in the group.
   */
  const getItemProps = useCallback((index: number) => ({
    tabIndex: index === activeIndex ? 0 : -1,
    "data-roving-tabindex": groupId,
    onKeyDown: handleKeyDown,
    ref: (el: HTMLElement | null) => {
      if (el) registerItem(el);
    },
  }), [activeIndex, groupId, handleKeyDown, registerItem]);

  return {
    activeIndex,
    setActiveIndex,
    getItemProps,
    registerItem,
    unregisterItem,
  };
}

/**
 * Hook for skip links.
 */
export function useSkipLinks() {
  const skipToMain = useCallback(() => {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus();
      main.scrollIntoView();
    }
  }, []);

  const skipToNav = useCallback(() => {
    const nav = document.getElementById("navigation") || document.querySelector("nav");
    if (nav) {
      const firstLink = nav.querySelector("a, button") as HTMLElement;
      firstLink?.focus();
    }
  }, []);

  const skipToSearch = useCallback(() => {
    const search = document.getElementById("search") || document.querySelector('[role="search"] input');
    if (search) {
      (search as HTMLElement).focus();
    }
  }, []);

  return {
    skipToMain,
    skipToNav,
    skipToSearch,
  };
}

/**
 * Hook for accessible descriptions.
 */
export function useAccessibleDescription(id: string) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return {
    descriptionId,
    errorId,
    getInputProps: (hasError: boolean = false) => ({
      "aria-describedby": hasError ? `${descriptionId} ${errorId}` : descriptionId,
      "aria-invalid": hasError ? "true" : undefined,
    }),
    getDescriptionProps: () => ({
      id: descriptionId,
    }),
    getErrorProps: () => ({
      id: errorId,
      role: "alert" as const,
      "aria-live": "polite" as const,
    }),
  };
}

/**
 * Hook for error announcements.
 */
export function useErrorAnnouncement() {
  const { announce } = useAccessibility();

  const announceError = useCallback((message: string, fieldName?: string) => {
    const fullMessage = fieldName
      ? `Error in ${fieldName}: ${message}`
      : `Error: ${message}`;
    announce(fullMessage, "assertive");
  }, [announce]);

  const announceErrors = useCallback((errors: Record<string, string>) => {
    const errorCount = Object.keys(errors).length;
    if (errorCount === 0) return;

    if (errorCount === 1) {
      const [field, message] = Object.entries(errors)[0];
      announceError(message, field);
    } else {
      announce(`${errorCount} errors found. Please review the form.`, "assertive");
    }
  }, [announce, announceError]);

  const announceSuccess = useCallback((message: string) => {
    announce(message, "polite");
  }, [announce]);

  return {
    announceError,
    announceErrors,
    announceSuccess,
  };
}

/**
 * Provider component for accessibility context.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const accessibility = useAccessibility();

  return (
    <AccessibilityContext.Provider value={accessibility}>
      {children}
      {/* Live regions for announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {accessibility.announcements
          .filter(a => a.priority === "polite")
          .map(a => a.message)
          .join(". ")}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {accessibility.announcements
          .filter(a => a.priority === "assertive")
          .map(a => a.message)
          .join(". ")}
      </div>
    </AccessibilityContext.Provider>
  );
}

/**
 * Hook to use accessibility context.
 */
export function useAccessibilityContext() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibilityContext must be used within AccessibilityProvider");
  }
  return context;
}

export default useAccessibility;
