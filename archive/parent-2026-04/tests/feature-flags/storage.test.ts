/**
 * @file storage.test.ts
 * @description Tests for Feature Flag Storage implementations
 * @phase Phase 2 - Comprehensive Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryFeatureFlagStorage,
  InMemorySiteOverrideStorage,
  InMemoryUserOverrideStorage,
  InMemoryUsageStatsStorage,
  InMemoryRolloutHistoryStorage,
} from "@server/services/feature-flags/storage";
import type { FeatureFlag } from "@shared/admin/types";

describe("InMemoryFeatureFlagStorage", () => {
  let storage: InMemoryFeatureFlagStorage;

  const baseFlag: Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory"> = {
    key: "test_flag",
    name: "Test Flag",
    description: "A test flag",
    category: "optional",
    globallyEnabled: true,
    toggleable: true,
    defaultState: false,
    dependencies: [],
    dependents: [],
    tags: ["test"],
    targetingRules: [],
  };

  beforeEach(() => {
    storage = new InMemoryFeatureFlagStorage();
  });

  describe("initialization", () => {
    it("initializes with default flags", async () => {
      const flags = await storage.getAll();
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(f => f.key === "core_authentication")).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a new flag", async () => {
      const created = await storage.create(baseFlag);

      expect(created.key).toBe("test_flag");
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
      expect(created.changeHistory).toEqual([]);
    });

    it("can retrieve created flag", async () => {
      await storage.create(baseFlag);
      const retrieved = await storage.getByKey("test_flag");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("Test Flag");
    });
  });

  describe("update", () => {
    it("updates flag properties", async () => {
      await storage.create(baseFlag);
      const updated = await storage.update("test_flag", { name: "Updated Name" });

      expect(updated?.name).toBe("Updated Name");
      expect(updated?.changeHistory.length).toBe(1);
    });

    it("preserves key on update", async () => {
      await storage.create(baseFlag);
      const updated = await storage.update("test_flag", { key: "hacked_key" } as any);

      expect(updated?.key).toBe("test_flag");
    });

    it("returns null for non-existent flag", async () => {
      const result = await storage.update("nonexistent", { name: "New" });
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes existing flag", async () => {
      await storage.create(baseFlag);
      const deleted = await storage.delete("test_flag");

      expect(deleted).toBe(true);
      const retrieved = await storage.getByKey("test_flag");
      expect(retrieved).toBeNull();
    });

    it("returns false for non-existent flag", async () => {
      const deleted = await storage.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("getByCategory", () => {
    it("filters by category", async () => {
      const coreFlags = await storage.getByCategory("core");
      expect(coreFlags.every(f => f.category === "core")).toBe(true);
    });
  });

  describe("getByKeys", () => {
    it("retrieves multiple flags by keys", async () => {
      const flags = await storage.getByKeys(["core_authentication", "core_rses_engine"]);
      expect(flags.length).toBe(2);
    });

    it("skips non-existent keys", async () => {
      const flags = await storage.getByKeys(["core_authentication", "nonexistent"]);
      expect(flags.length).toBe(1);
    });
  });

  describe("bulkEnable", () => {
    it("enables multiple flags", async () => {
      await storage.create({ ...baseFlag, key: "flag1", globallyEnabled: false });
      await storage.create({ ...baseFlag, key: "flag2", globallyEnabled: false });

      const count = await storage.bulkEnable(["flag1", "flag2"]);

      expect(count).toBe(2);
      expect((await storage.getByKey("flag1"))?.globallyEnabled).toBe(true);
      expect((await storage.getByKey("flag2"))?.globallyEnabled).toBe(true);
    });

    it("skips non-toggleable flags", async () => {
      await storage.create({ ...baseFlag, key: "locked", toggleable: false, globallyEnabled: false });

      const count = await storage.bulkEnable(["locked"]);
      expect(count).toBe(0);
    });
  });

  describe("bulkDisable", () => {
    it("disables multiple flags", async () => {
      await storage.create({ ...baseFlag, key: "flag1" });
      await storage.create({ ...baseFlag, key: "flag2" });

      const count = await storage.bulkDisable(["flag1", "flag2"]);

      expect(count).toBe(2);
      expect((await storage.getByKey("flag1"))?.globallyEnabled).toBe(false);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await storage.create({ ...baseFlag, key: "search_test_1", name: "Search Test One", tags: ["alpha"] });
      await storage.create({ ...baseFlag, key: "search_test_2", name: "Search Test Two", tags: ["beta"] });
    });

    it("searches by name", async () => {
      const { flags } = await storage.search({ search: "One" });
      expect(flags.some(f => f.key === "search_test_1")).toBe(true);
    });

    it("filters by tags", async () => {
      const { flags } = await storage.search({ tags: ["alpha"] });
      expect(flags.some(f => f.key === "search_test_1")).toBe(true);
      expect(flags.some(f => f.key === "search_test_2")).toBe(false);
    });

    it("filters by enabled state", async () => {
      await storage.update("search_test_1", { globallyEnabled: false });

      const { flags } = await storage.search({ enabled: true });
      expect(flags.some(f => f.key === "search_test_1")).toBe(false);
    });

    it("supports pagination", async () => {
      const { flags, total } = await storage.search({ limit: 2, offset: 0 });
      expect(flags.length).toBe(2);
      expect(total).toBeGreaterThan(2);
    });
  });
});

describe("InMemorySiteOverrideStorage", () => {
  let storage: InMemorySiteOverrideStorage;

  beforeEach(() => {
    storage = new InMemorySiteOverrideStorage();
  });

  describe("set and get", () => {
    it("stores and retrieves override", async () => {
      const override = await storage.set({
        siteId: "site1",
        featureKey: "feature1",
        enabled: true,
      });

      expect(override.siteId).toBe("site1");
      expect(override.createdAt).toBeDefined();

      const retrieved = await storage.get("site1", "feature1");
      expect(retrieved?.enabled).toBe(true);
    });

    it("updates existing override", async () => {
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: true });
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: false });

      const retrieved = await storage.get("site1", "feature1");
      expect(retrieved?.enabled).toBe(false);
    });
  });

  describe("getForSite", () => {
    it("returns all overrides for a site", async () => {
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: true });
      await storage.set({ siteId: "site1", featureKey: "feature2", enabled: false });
      await storage.set({ siteId: "site2", featureKey: "feature1", enabled: true });

      const overrides = await storage.getForSite("site1");
      expect(overrides.length).toBe(2);
    });
  });

  describe("getForFeature", () => {
    it("returns all overrides for a feature", async () => {
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: true });
      await storage.set({ siteId: "site2", featureKey: "feature1", enabled: false });

      const overrides = await storage.getForFeature("feature1");
      expect(overrides.length).toBe(2);
    });
  });

  describe("delete", () => {
    it("deletes specific override", async () => {
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: true });
      const deleted = await storage.delete("site1", "feature1");

      expect(deleted).toBe(true);
      expect(await storage.get("site1", "feature1")).toBeNull();
    });
  });

  describe("deleteAllForSite", () => {
    it("deletes all overrides for a site", async () => {
      await storage.set({ siteId: "site1", featureKey: "feature1", enabled: true });
      await storage.set({ siteId: "site1", featureKey: "feature2", enabled: true });

      const count = await storage.deleteAllForSite("site1");
      expect(count).toBe(2);
    });
  });
});

describe("InMemoryUserOverrideStorage", () => {
  let storage: InMemoryUserOverrideStorage;

  beforeEach(() => {
    storage = new InMemoryUserOverrideStorage();
  });

  describe("expiration", () => {
    it("deletes expired overrides", async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();

      await storage.set({
        userId: "user1",
        featureKey: "feature1",
        enabled: true,
        expiresAt: pastDate,
      });

      const count = await storage.deleteExpired();
      expect(count).toBe(1);
      expect(await storage.get("user1", "feature1")).toBeNull();
    });

    it("preserves non-expired overrides", async () => {
      const futureDate = new Date(Date.now() + 100000).toISOString();

      await storage.set({
        userId: "user1",
        featureKey: "feature1",
        enabled: true,
        expiresAt: futureDate,
      });

      await storage.deleteExpired();
      expect(await storage.get("user1", "feature1")).not.toBeNull();
    });
  });
});

describe("InMemoryUsageStatsStorage", () => {
  let storage: InMemoryUsageStatsStorage;

  beforeEach(() => {
    storage = new InMemoryUsageStatsStorage();
  });

  describe("record and aggregate", () => {
    it("records evaluations", async () => {
      await storage.record({
        featureKey: "feature1",
        enabled: true,
        userId: "user1",
        evaluationTimeMs: 5,
      });

      await storage.aggregateStats();

      const stats = await storage.getStats("feature1", "hour");
      expect(stats?.evaluations).toBeGreaterThan(0);
    });

    it("tracks enabled vs disabled", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.record({
          featureKey: "feature1",
          enabled: i < 7,
          evaluationTimeMs: 1,
        });
      }

      await storage.aggregateStats();

      const stats = await storage.getStats("feature1", "hour");
      expect(stats?.enabledEvaluations).toBe(7);
      expect(stats?.disabledEvaluations).toBe(3);
    });
  });

  describe("getTopFeatures", () => {
    it("returns features sorted by evaluations", async () => {
      for (let i = 0; i < 100; i++) {
        await storage.record({ featureKey: "popular", enabled: true, evaluationTimeMs: 1 });
      }
      for (let i = 0; i < 10; i++) {
        await storage.record({ featureKey: "unpopular", enabled: true, evaluationTimeMs: 1 });
      }

      await storage.aggregateStats();

      const top = await storage.getTopFeatures("hour", 10);
      expect(top[0].featureKey).toBe("popular");
    });
  });
});

describe("InMemoryRolloutHistoryStorage", () => {
  let storage: InMemoryRolloutHistoryStorage;

  beforeEach(() => {
    storage = new InMemoryRolloutHistoryStorage();
  });

  describe("record", () => {
    it("creates event with ID and timestamp", async () => {
      const event = await storage.record({
        featureKey: "feature1",
        eventType: "enabled",
        userId: "admin",
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });
  });

  describe("getForFeature", () => {
    it("returns events for specific feature", async () => {
      await storage.record({ featureKey: "feature1", eventType: "enabled", userId: "admin" });
      await storage.record({ featureKey: "feature2", eventType: "enabled", userId: "admin" });

      const events = await storage.getForFeature("feature1");
      expect(events.every(e => e.featureKey === "feature1")).toBe(true);
    });
  });

  describe("search", () => {
    it("filters by event type", async () => {
      await storage.record({ featureKey: "feature1", eventType: "enabled", userId: "admin" });
      await storage.record({ featureKey: "feature1", eventType: "disabled", userId: "admin" });

      const { events } = await storage.search({ eventType: "enabled" });
      expect(events.every(e => e.eventType === "enabled")).toBe(true);
    });

    it("filters by date range", async () => {
      await storage.record({ featureKey: "feature1", eventType: "enabled", userId: "admin" });

      const now = new Date();
      const { events } = await storage.search({
        from: new Date(now.getTime() - 1000).toISOString(),
        to: new Date(now.getTime() + 1000).toISOString(),
      });

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("getRecent", () => {
    it("returns events in reverse chronological order", async () => {
      await storage.record({ featureKey: "old", eventType: "enabled", userId: "admin" });
      await storage.record({ featureKey: "new", eventType: "enabled", userId: "admin" });

      const events = await storage.getRecent(2);
      expect(events[0].featureKey).toBe("new");
    });
  });
});
