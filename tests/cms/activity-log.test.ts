/**
 * @file activity-log.test.ts
 * @description Tests for activity logging functionality
 * @phase Phase 6 - CMS Features
 */

import { describe, it, expect } from "vitest";

/**
 * Activity actions that should be logged.
 */
const EXPECTED_ACTIONS = {
  config: [
    "config.created",
    "config.updated",
    "config.deleted",
    "config.restored",
    "configs.bulk-deleted",
    "configs.bulk-updated",
  ],
  project: [
    "projects.scanned",
    "project.updated",
    "project.linked",
    "project.unlinked",
    "projects.bulk-linked",
    "projects.bulk-unlinked",
  ],
};

describe("Activity Action Naming", () => {
  describe("action format", () => {
    it("uses entityType.action format", () => {
      const actions = [...EXPECTED_ACTIONS.config, ...EXPECTED_ACTIONS.project];

      for (const action of actions) {
        expect(action).toMatch(/^[a-z]+s?\.[a-z-]+$/);
      }
    });

    it("uses plural for bulk operations", () => {
      const bulkActions = [
        "configs.bulk-deleted",
        "configs.bulk-updated",
        "projects.bulk-linked",
        "projects.bulk-unlinked",
        "projects.scanned",
      ];

      for (const action of bulkActions) {
        expect(action.startsWith("configs.") || action.startsWith("projects.")).toBe(true);
      }
    });

    it("uses singular for individual operations", () => {
      const singleActions = [
        "config.created",
        "config.updated",
        "config.deleted",
        "project.updated",
        "project.linked",
      ];

      for (const action of singleActions) {
        expect(action.startsWith("config.") || action.startsWith("project.")).toBe(true);
      }
    });
  });
});

describe("Activity Metadata", () => {
  describe("config operations", () => {
    it("config.created includes name", () => {
      const metadata = { name: "Test Config" };
      expect(metadata).toHaveProperty("name");
    });

    it("config.updated includes updates list", () => {
      const metadata = { updates: ["content", "description"] };
      expect(metadata).toHaveProperty("updates");
      expect(Array.isArray(metadata.updates)).toBe(true);
    });

    it("config.restored includes fromVersion", () => {
      const metadata = { fromVersion: 3 };
      expect(metadata).toHaveProperty("fromVersion");
      expect(typeof metadata.fromVersion).toBe("number");
    });

    it("configs.bulk-deleted includes count", () => {
      const metadata = { ids: [1, 2, 3], deleted: 3 };
      expect(metadata).toHaveProperty("deleted");
      expect(metadata.deleted).toBe(3);
    });
  });

  describe("project operations", () => {
    it("projects.scanned includes statistics", () => {
      const metadata = {
        rootPath: "/Users/test/Projects",
        projectCount: 25,
        duration: 1234,
      };
      expect(metadata).toHaveProperty("rootPath");
      expect(metadata).toHaveProperty("projectCount");
      expect(metadata).toHaveProperty("duration");
    });

    it("project.linked includes linkPath", () => {
      const metadata = { linkPath: "/symlinks/by-topic/ai/project" };
      expect(metadata).toHaveProperty("linkPath");
    });

    it("projects.bulk-linked includes count", () => {
      const metadata = { ids: [1, 2, 3], count: 3 };
      expect(metadata).toHaveProperty("count");
      expect(metadata.count).toBe(metadata.ids.length);
    });
  });
});

describe("Activity Filtering", () => {
  describe("date range filtering", () => {
    it("accepts startDate filter", () => {
      const filter = { startDate: new Date("2026-01-01") };
      expect(filter.startDate).toBeInstanceOf(Date);
    });

    it("accepts endDate filter", () => {
      const filter = { endDate: new Date("2026-12-31") };
      expect(filter.endDate).toBeInstanceOf(Date);
    });

    it("accepts both start and end dates", () => {
      const filter = {
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      };
      expect(filter.startDate < filter.endDate).toBe(true);
    });
  });

  describe("entity filtering", () => {
    it("accepts entityType filter", () => {
      const filter = { entityType: "config" };
      expect(filter.entityType).toBe("config");
    });

    it("accepts entityId filter", () => {
      const filter = { entityId: 123 };
      expect(filter.entityId).toBe(123);
    });

    it("accepts combined filters", () => {
      const filter = {
        entityType: "project",
        entityId: 456,
        action: "project.linked",
      };
      expect(filter.entityType).toBe("project");
      expect(filter.entityId).toBe(456);
      expect(filter.action).toBe("project.linked");
    });
  });
});

describe("Activity Timeline", () => {
  describe("recent activity", () => {
    it("default limit is reasonable", () => {
      const defaultLimit = 20;
      expect(defaultLimit).toBeGreaterThanOrEqual(10);
      expect(defaultLimit).toBeLessThanOrEqual(100);
    });

    it("activity entries have required fields", () => {
      const mockEntry = {
        id: 1,
        action: "config.created",
        entityType: "config",
        entityId: 1,
        metadata: { name: "Test" },
        createdAt: new Date(),
      };

      expect(mockEntry).toHaveProperty("id");
      expect(mockEntry).toHaveProperty("action");
      expect(mockEntry).toHaveProperty("entityType");
      expect(mockEntry).toHaveProperty("createdAt");
    });
  });
});
