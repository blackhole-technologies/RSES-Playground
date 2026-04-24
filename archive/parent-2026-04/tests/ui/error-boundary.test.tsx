/**
 * @file error-boundary.test.tsx
 * @description Tests for ErrorBoundary components
 * @phase Phase 4 - UI/UX Improvements
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  ErrorBoundary,
  EditorErrorBoundary,
  PanelErrorBoundary,
} from "@/components/ErrorBoundary";

// Component that throws an error
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>No error</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress console.error for expected errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("displays error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("displays custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("calls onError callback when error occurs", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("has Try Again button that resets error state", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Rerender with non-throwing component before clicking retry
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Try Again"));

    expect(screen.getByText("No error")).toBeInTheDocument();
  });

  it("has Reload Page button", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Reload Page")).toBeInTheDocument();
  });
});

describe("EditorErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <EditorErrorBoundary>
        <div>Editor content</div>
      </EditorErrorBoundary>
    );

    expect(screen.getByText("Editor content")).toBeInTheDocument();
  });

  it("displays compact error UI when child throws", () => {
    render(
      <EditorErrorBoundary>
        <ThrowError />
      </EditorErrorBoundary>
    );

    expect(screen.getByText(/Editor error:/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls onError callback when error occurs", () => {
    const onError = vi.fn();

    render(
      <EditorErrorBoundary onError={onError}>
        <ThrowError />
      </EditorErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
  });
});

describe("PanelErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <PanelErrorBoundary>
        <div>Panel content</div>
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("displays panel error with default title", () => {
    render(
      <PanelErrorBoundary>
        <ThrowError />
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Panel failed to load")).toBeInTheDocument();
  });

  it("displays panel error with custom title", () => {
    render(
      <PanelErrorBoundary title="Test Panel">
        <ThrowError />
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Test Panel failed to load")).toBeInTheDocument();
  });

  it("has Retry button", () => {
    render(
      <PanelErrorBoundary>
        <ThrowError />
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
