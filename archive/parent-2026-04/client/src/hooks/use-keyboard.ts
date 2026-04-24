/**
 * @file use-keyboard.ts
 * @description Keyboard shortcut hooks and utilities.
 * @phase Phase 4 - UI/UX Improvements
 * @author UI (UI Development Expert Agent)
 * @validated UX (UX Design Expert Agent)
 * @created 2026-01-31
 */

import { useEffect, useCallback, useRef, useState } from "react";

/**
 * Key modifier flags.
 */
export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean; // Cmd on Mac, Windows key on Windows
}

/**
 * Keyboard shortcut definition.
 */
export interface KeyboardShortcut {
  key: string;
  modifiers?: KeyModifiers;
  description: string;
  action: () => void;
  disabled?: boolean;
}

/**
 * Checks if event matches the given modifiers.
 */
function matchesModifiers(event: KeyboardEvent, modifiers?: KeyModifiers): boolean {
  const mods = modifiers || {};
  return (
    !!event.ctrlKey === !!mods.ctrl &&
    !!event.altKey === !!mods.alt &&
    !!event.shiftKey === !!mods.shift &&
    !!event.metaKey === !!mods.meta
  );
}

/**
 * Normalizes key to lowercase for comparison.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Hook for registering a single keyboard shortcut.
 *
 * @param key - The key to listen for (e.g., "s", "Enter", "Escape")
 * @param action - Callback to execute when shortcut is triggered
 * @param modifiers - Optional modifier keys (ctrl, alt, shift, meta)
 * @param options - Additional options
 *
 * @example
 * // Ctrl+S to save
 * useKeyboardShortcut("s", handleSave, { ctrl: true });
 *
 * // Escape to close
 * useKeyboardShortcut("Escape", handleClose);
 */
export function useKeyboardShortcut(
  key: string,
  action: () => void,
  modifiers?: KeyModifiers,
  options?: { disabled?: boolean; preventDefault?: boolean }
): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (options?.disabled) return;

    const handler = (event: KeyboardEvent) => {
      // Don't trigger in input fields unless specifically allowed
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (normalizeKey(key) !== "escape") {
          return;
        }
      }

      if (normalizeKey(event.key) === normalizeKey(key) && matchesModifiers(event, modifiers)) {
        if (options?.preventDefault !== false) {
          event.preventDefault();
        }
        actionRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, modifiers?.ctrl, modifiers?.alt, modifiers?.shift, modifiers?.meta, options?.disabled]);
}

/**
 * Hook for registering multiple keyboard shortcuts.
 *
 * @param shortcuts - Array of shortcut definitions
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: "s", modifiers: { ctrl: true }, description: "Save", action: handleSave },
 *   { key: "t", modifiers: { ctrl: true }, description: "Test", action: handleTest },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't trigger in input fields unless it's Escape
      const target = event.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.disabled) continue;

        // Skip non-Escape shortcuts in inputs
        if (inInput && normalizeKey(shortcut.key) !== "escape") {
          continue;
        }

        if (
          normalizeKey(event.key) === normalizeKey(shortcut.key) &&
          matchesModifiers(event, shortcut.modifiers)
        ) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * Formats a shortcut for display.
 *
 * @param key - The key
 * @param modifiers - Modifier keys
 * @returns Formatted string like "Ctrl+S" or "⌘S"
 */
export function formatShortcut(key: string, modifiers?: KeyModifiers): string {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const parts: string[] = [];

  if (modifiers?.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
  if (modifiers?.alt) parts.push(isMac ? "⌥" : "Alt");
  if (modifiers?.shift) parts.push(isMac ? "⇧" : "Shift");
  if (modifiers?.meta) parts.push(isMac ? "⌘" : "Win");

  parts.push(key.length === 1 ? key.toUpperCase() : key);

  return isMac ? parts.join("") : parts.join("+");
}

/**
 * Hook that returns whether a key is currently pressed.
 *
 * @param key - The key to track
 * @returns Whether the key is currently pressed
 */
export function useKeyPressed(key: string): boolean {
  const pressedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (normalizeKey(e.key) === normalizeKey(key) && !pressedRef.current) {
        pressedRef.current = true;
        forceUpdate((n) => n + 1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (normalizeKey(e.key) === normalizeKey(key) && pressedRef.current) {
        pressedRef.current = false;
        forceUpdate((n) => n + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [key]);

  return pressedRef.current;
}

/**
 * Global shortcut registry for help display.
 */
const globalShortcuts: KeyboardShortcut[] = [];

/**
 * Registers shortcuts globally for display in help.
 */
export function registerGlobalShortcuts(shortcuts: KeyboardShortcut[]): void {
  globalShortcuts.push(...shortcuts);
}

/**
 * Gets all registered global shortcuts.
 */
export function getGlobalShortcuts(): KeyboardShortcut[] {
  return [...globalShortcuts];
}

/**
 * Clears global shortcuts (for testing).
 */
export function clearGlobalShortcuts(): void {
  globalShortcuts.length = 0;
}
