/**
 * @file ws-bridge.test.ts
 * @description Tests for Feature Flag WebSocket Bridge
 * @phase Phase 2 - Comprehensive Test Suite
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFeatureFlagsWSBridge, FEATURE_FLAGS_WS_CHANNEL } from "@server/services/feature-flags/ws-bridge";
import type { FeatureFlagEvent } from "@server/services/feature-flags/types";
import type { FeatureFlag, SiteFeatureOverride, UserFeatureOverride } from "@shared/admin/types";

// Mock WSServer
const createMockWSServer = () => ({
  broadcast: vi.fn(),
});

// Mock FeatureFlagsService
const createMockService = () => {
  const handlers: Set<(event: FeatureFlagEvent) => void> = new Set();
  return {
    onEvent: vi.fn((handler: (event: FeatureFlagEvent) => void) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }),
    offEvent: vi.fn((handler: (event: FeatureFlagEvent) => void) => {
      handlers.delete(handler);
    }),
    emit: (event: FeatureFlagEvent) => {
      handlers.forEach(h => h(event));
    },
    _handlers: handlers,
  };
};

describe("createFeatureFlagsWSBridge", () => {
  let mockWSServer: ReturnType<typeof createMockWSServer>;
  let mockService: ReturnType<typeof createMockService>;
  let cleanup: () => void;

  beforeEach(() => {
    mockWSServer = createMockWSServer();
    mockService = createMockService();
    cleanup = createFeatureFlagsWSBridge(mockService as any, mockWSServer as any);
  });

  it("registers event handler on service", () => {
    expect(mockService.onEvent).toHaveBeenCalled();
  });

  it("broadcasts flag_created events", () => {
    const flag: FeatureFlag = {
      key: "test_flag",
      name: "Test Flag",
      description: "Test",
      category: "optional",
      globallyEnabled: true,
      toggleable: true,
      defaultState: false,
      dependencies: [],
      dependents: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      changeHistory: [],
      targetingRules: [],
    };

    mockService.emit({ type: "flag_created", flag });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:created",
        data: expect.objectContaining({
          key: "test_flag",
          name: "Test Flag",
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts flag_updated events with changes", () => {
    const flag: FeatureFlag = {
      key: "test_flag",
      name: "Updated Name",
      description: "Test",
      category: "optional",
      globallyEnabled: true,
      toggleable: true,
      defaultState: false,
      dependencies: [],
      dependents: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      changeHistory: [],
      targetingRules: [],
    };

    const previousState: Partial<FeatureFlag> = {
      name: "Old Name",
    };

    mockService.emit({ type: "flag_updated", flag, previousState });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:updated",
        data: expect.objectContaining({
          key: "test_flag",
          changes: expect.arrayContaining(["name"]),
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts flag_deleted events", () => {
    mockService.emit({ type: "flag_deleted", key: "test_flag" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:deleted",
        data: { key: "test_flag" },
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts flag_enabled events", () => {
    mockService.emit({ type: "flag_enabled", key: "test_flag" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:enabled",
        data: expect.objectContaining({ key: "test_flag" }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts flag_disabled events", () => {
    mockService.emit({ type: "flag_disabled", key: "test_flag" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:disabled",
        data: expect.objectContaining({ key: "test_flag" }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts override_set events for site", () => {
    const override: SiteFeatureOverride = {
      siteId: "site1",
      featureKey: "test_flag",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockService.emit({ type: "override_set", override, scope: "site" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:override:set",
        data: expect.objectContaining({
          featureKey: "test_flag",
          scope: "site",
          targetId: "site1",
          enabled: true,
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts override_set events for user", () => {
    const override: UserFeatureOverride = {
      userId: "user1",
      featureKey: "test_flag",
      enabled: false,
      createdAt: new Date().toISOString(),
    };

    mockService.emit({ type: "override_set", override, scope: "user" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:override:set",
        data: expect.objectContaining({
          featureKey: "test_flag",
          scope: "user",
          targetId: "user1",
          enabled: false,
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts override_deleted events", () => {
    mockService.emit({
      type: "override_deleted",
      key: "test_flag",
      targetId: "site1",
      scope: "site",
    });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:override:deleted",
        data: expect.objectContaining({
          featureKey: "test_flag",
          scope: "site",
          targetId: "site1",
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts rollout_changed events", () => {
    mockService.emit({
      type: "rollout_changed",
      key: "test_flag",
      percentage: 50,
    });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:rollout:changed",
        data: expect.objectContaining({
          key: "test_flag",
          percentage: 50,
          enabled: true,
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts targeting_updated events", () => {
    mockService.emit({
      type: "targeting_updated",
      key: "test_flag",
      rules: [{ id: "r1", name: "Test", conditions: [], enabled: true, priority: 1 }],
    });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:targeting:updated",
        data: expect.objectContaining({
          key: "test_flag",
          rulesCount: 1,
        }),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("broadcasts cache_invalidated events", () => {
    mockService.emit({
      type: "cache_invalidated",
      keys: ["flag1", "flag2"],
    });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feature:cache:invalidated",
        data: { keys: ["flag1", "flag2"] },
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("includes timestamp in all messages", () => {
    mockService.emit({ type: "flag_enabled", key: "test_flag" });

    expect(mockWSServer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(Number),
      }),
      FEATURE_FLAGS_WS_CHANNEL
    );
  });

  it("cleanup removes event handler", () => {
    expect(mockService._handlers.size).toBe(1);

    cleanup();

    expect(mockService.offEvent).toHaveBeenCalled();
  });

  it("uses correct channel name", () => {
    expect(FEATURE_FLAGS_WS_CHANNEL).toBe("feature-flags");
  });
});
