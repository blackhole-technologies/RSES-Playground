/**
 * @file hooks.test.tsx
 * @description Tests for custom React hooks
 * @phase Phase 4 - UI/UX Improvements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import {
  useKeyboardShortcut,
  useKeyboardShortcuts,
  formatShortcut,
  useKeyPressed,
  registerGlobalShortcuts,
  getGlobalShortcuts,
  clearGlobalShortcuts,
} from "@/hooks/use-keyboard";
import { useLocalStorage, useSessionStorage } from "@/hooks/use-local-storage";

describe("useKeyboardShortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers action when key is pressed", () => {
    const action = vi.fn();

    renderHook(() => useKeyboardShortcut("s", action, { ctrl: true }));

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not trigger action when wrong key is pressed", () => {
    const action = vi.fn();

    renderHook(() => useKeyboardShortcut("s", action, { ctrl: true }));

    fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    expect(action).not.toHaveBeenCalled();
  });

  it("does not trigger action when modifiers do not match", () => {
    const action = vi.fn();

    renderHook(() => useKeyboardShortcut("s", action, { ctrl: true }));

    fireEvent.keyDown(window, { key: "s", ctrlKey: false });

    expect(action).not.toHaveBeenCalled();
  });

  it("does not trigger action when disabled", () => {
    const action = vi.fn();

    renderHook(() =>
      useKeyboardShortcut("s", action, { ctrl: true }, { disabled: true })
    );

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(action).not.toHaveBeenCalled();
  });

  it("is case-insensitive for keys", () => {
    const action = vi.fn();

    renderHook(() => useKeyboardShortcut("S", action, { ctrl: true }));

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("useKeyboardShortcuts", () => {
  it("triggers correct action for matching shortcut", () => {
    const actionSave = vi.fn();
    const actionNew = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        { key: "s", modifiers: { ctrl: true }, description: "Save", action: actionSave },
        { key: "n", modifiers: { ctrl: true }, description: "New", action: actionNew },
      ])
    );

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(actionSave).toHaveBeenCalledTimes(1);
    expect(actionNew).not.toHaveBeenCalled();
  });

  it("skips disabled shortcuts", () => {
    const action = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: "s",
          modifiers: { ctrl: true },
          description: "Save",
          action,
          disabled: true,
        },
      ])
    );

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(action).not.toHaveBeenCalled();
  });
});

describe("formatShortcut", () => {
  it("formats simple shortcuts", () => {
    // Note: These tests may vary based on platform detection
    const result = formatShortcut("S", { ctrl: true });
    expect(result).toMatch(/Ctrl\+S|⌃S/);
  });

  it("formats multiple modifiers", () => {
    const result = formatShortcut("S", { ctrl: true, shift: true });
    expect(result).toMatch(/(Ctrl\+Shift\+S|⌃⇧S)/);
  });

  it("handles keys without modifiers", () => {
    const result = formatShortcut("Escape");
    expect(result).toBe("Escape");
  });
});

describe("useKeyPressed", () => {
  it("returns false initially", () => {
    const { result } = renderHook(() => useKeyPressed("Shift"));
    expect(result.current).toBe(false);
  });

  it("returns true when key is pressed", () => {
    const { result } = renderHook(() => useKeyPressed("Shift"));

    act(() => {
      fireEvent.keyDown(window, { key: "Shift" });
    });

    expect(result.current).toBe(true);
  });

  it("returns false when key is released", () => {
    const { result } = renderHook(() => useKeyPressed("Shift"));

    act(() => {
      fireEvent.keyDown(window, { key: "Shift" });
    });

    expect(result.current).toBe(true);

    act(() => {
      fireEvent.keyUp(window, { key: "Shift" });
    });

    expect(result.current).toBe(false);
  });
});

describe("Global shortcuts registry", () => {
  beforeEach(() => {
    clearGlobalShortcuts();
  });

  it("registers shortcuts globally", () => {
    registerGlobalShortcuts([
      { key: "s", modifiers: { ctrl: true }, description: "Save", action: () => {} },
    ]);

    const shortcuts = getGlobalShortcuts();
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0].description).toBe("Save");
  });

  it("clears global shortcuts", () => {
    registerGlobalShortcuts([
      { key: "s", modifiers: { ctrl: true }, description: "Save", action: () => {} },
    ]);

    clearGlobalShortcuts();

    const shortcuts = getGlobalShortcuts();
    expect(shortcuts).toHaveLength(0);
  });
});

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns initial value when nothing in storage", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("stores value in localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    act(() => {
      result.current[1]("new value");
    });

    expect(result.current[0]).toBe("new value");
    expect(localStorage.getItem("test-key")).toBe('"new value"');
  });

  it("reads existing value from localStorage", () => {
    localStorage.setItem("test-key", '"existing"');

    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    expect(result.current[0]).toBe("existing");
  });

  it("removes value from localStorage", () => {
    localStorage.setItem("test-key", '"value"');

    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    act(() => {
      result.current[2](); // removeValue
    });

    expect(result.current[0]).toBe("default");
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("counter", 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });
});

describe("useSessionStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns initial value when nothing in storage", () => {
    const { result } = renderHook(() => useSessionStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("stores value in sessionStorage", () => {
    const { result } = renderHook(() => useSessionStorage("test-key", "default"));

    act(() => {
      result.current[1]("new value");
    });

    expect(result.current[0]).toBe("new value");
  });
});
