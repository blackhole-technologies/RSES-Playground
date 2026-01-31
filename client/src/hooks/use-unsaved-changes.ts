/**
 * @file use-unsaved-changes.ts
 * @description Hook for tracking and warning about unsaved changes.
 * @phase Phase 4 - UI/UX Improvements
 * @author UX (UX Design Expert Agent)
 * @validated UI (UI Development Expert Agent)
 * @created 2026-01-31
 */

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Options for the unsaved changes hook.
 */
export interface UseUnsavedChangesOptions {
  /** Initial value to compare against */
  initialValue?: string;
  /** Whether to show browser warning on navigation */
  warnOnNavigation?: boolean;
  /** Custom comparison function */
  compare?: (current: string, saved: string) => boolean;
}

/**
 * Return value from the unsaved changes hook.
 */
export interface UseUnsavedChangesReturn {
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Current value */
  value: string;
  /** Set the current value */
  setValue: (value: string) => void;
  /** Mark current value as saved */
  markSaved: () => void;
  /** Reset to saved value */
  reset: () => void;
  /** The last saved value */
  savedValue: string;
}

/**
 * Hook for tracking unsaved changes with browser navigation warning.
 *
 * @example
 * const { value, setValue, hasUnsavedChanges, markSaved } = useUnsavedChanges({
 *   initialValue: config.content,
 *   warnOnNavigation: true,
 * });
 *
 * // On save
 * await saveConfig(value);
 * markSaved();
 */
export function useUnsavedChanges(
  options: UseUnsavedChangesOptions = {}
): UseUnsavedChangesReturn {
  const {
    initialValue = "",
    warnOnNavigation = true,
    compare = (a, b) => a === b,
  } = options;

  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const hasUnsavedChanges = !compare(value, savedValue);

  // Update saved value when initial value changes (e.g., switching configs)
  const initialRef = useRef(initialValue);
  useEffect(() => {
    if (initialValue !== initialRef.current) {
      initialRef.current = initialValue;
      setValue(initialValue);
      setSavedValue(initialValue);
    }
  }, [initialValue]);

  // Mark current value as saved
  const markSaved = useCallback(() => {
    setSavedValue(value);
  }, [value]);

  // Reset to saved value
  const reset = useCallback(() => {
    setValue(savedValue);
  }, [savedValue]);

  // Browser navigation warning
  useEffect(() => {
    if (!warnOnNavigation || !hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, warnOnNavigation]);

  return {
    hasUnsavedChanges,
    value,
    setValue,
    markSaved,
    reset,
    savedValue,
  };
}

/**
 * Hook for confirming navigation away from unsaved changes.
 *
 * @param hasUnsavedChanges - Whether there are unsaved changes
 * @param message - Custom confirmation message
 * @returns Function to check if navigation should proceed
 */
export function useNavigationGuard(
  hasUnsavedChanges: boolean,
  message: string = "You have unsaved changes. Are you sure you want to leave?"
): () => boolean {
  return useCallback(() => {
    if (!hasUnsavedChanges) {
      return true;
    }
    return window.confirm(message);
  }, [hasUnsavedChanges, message]);
}

/**
 * Hook for tracking form field changes.
 *
 * @param fields - Object of field values
 * @param savedFields - Object of saved field values
 * @returns Object with changed field names and whether any are changed
 */
export function useFieldChanges<T extends Record<string, unknown>>(
  fields: T,
  savedFields: T
): { changedFields: (keyof T)[]; hasChanges: boolean } {
  const changedFields: (keyof T)[] = [];

  for (const key in fields) {
    if (fields[key] !== savedFields[key]) {
      changedFields.push(key);
    }
  }

  return {
    changedFields,
    hasChanges: changedFields.length > 0,
  };
}
