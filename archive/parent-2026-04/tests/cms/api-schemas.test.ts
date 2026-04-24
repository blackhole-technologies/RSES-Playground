/**
 * @file api-schemas.test.ts
 * @description Tests for CMS API schemas and validation
 * @phase Phase 6 - CMS Features
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { projectsApi, versionsApi, activityApi, batchApi } from "../../shared/routes";
import {
  insertProjectSchema,
  insertConfigVersionSchema,
  insertActivityLogSchema,
} from "../../shared/schema";

describe("Project API Schemas", () => {
  describe("projectsApi.scan.input", () => {
    const schema = projectsApi.scan.input;

    it("accepts valid scan request", () => {
      const result = schema.safeParse({
        rootPath: "/Users/test/Projects",
        configId: 1,
        maxDepth: 3,
      });
      expect(result.success).toBe(true);
    });

    it("requires rootPath", () => {
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("validates maxDepth range", () => {
      const result = schema.safeParse({
        rootPath: "/test",
        maxDepth: 15,
      });
      expect(result.success).toBe(false);
    });

    it("allows maxDepth between 1 and 10", () => {
      const valid = schema.safeParse({
        rootPath: "/test",
        maxDepth: 5,
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("projectsApi.link.input", () => {
    const schema = projectsApi.link.input;

    it("accepts empty object", () => {
      const result = schema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts optional linkPath", () => {
      const result = schema.safeParse({
        linkPath: "/symlink/path",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("projectsApi.bulkLink.input", () => {
    const schema = projectsApi.bulkLink.input;

    it("requires at least one ID", () => {
      const empty = schema.safeParse({ ids: [] });
      expect(empty.success).toBe(false);

      const valid = schema.safeParse({ ids: [1] });
      expect(valid.success).toBe(true);
    });

    it("limits to maximum 100 IDs", () => {
      const ids = Array.from({ length: 101 }, (_, i) => i);
      const result = schema.safeParse({ ids });
      expect(result.success).toBe(false);
    });

    it("accepts 100 IDs", () => {
      const ids = Array.from({ length: 100 }, (_, i) => i);
      const result = schema.safeParse({ ids });
      expect(result.success).toBe(true);
    });
  });
});

describe("Version API Schemas", () => {
  describe("insertConfigVersionSchema", () => {
    const schema = insertConfigVersionSchema;

    it("requires configId and content", () => {
      const noContent = schema.safeParse({ configId: 1 });
      expect(noContent.success).toBe(false);

      const noConfigId = schema.safeParse({ content: "test" });
      expect(noConfigId.success).toBe(false);

      const valid = schema.safeParse({
        configId: 1,
        content: "test content",
      });
      expect(valid.success).toBe(true);
    });

    it("does not require version (auto-computed)", () => {
      const result = schema.safeParse({
        configId: 1,
        content: "test",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional description", () => {
      const result = schema.safeParse({
        configId: 1,
        content: "test",
        description: "Initial version",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Activity API Schemas", () => {
  describe("insertActivityLogSchema", () => {
    const schema = insertActivityLogSchema;

    it("requires action and entityType", () => {
      const result = schema.safeParse({
        action: "config.created",
        entityType: "config",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional metadata", () => {
      const result = schema.safeParse({
        action: "config.updated",
        entityType: "config",
        entityId: 1,
        metadata: { field: "content" },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Batch API Schemas", () => {
  describe("batchApi.deleteConfigs.input", () => {
    const schema = batchApi.deleteConfigs.input;

    it("requires at least one ID", () => {
      const result = schema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });

    it("limits to 100 IDs", () => {
      const ids = Array.from({ length: 101 }, (_, i) => i);
      const result = schema.safeParse({ ids });
      expect(result.success).toBe(false);
    });
  });

  describe("batchApi.updateConfigs.input", () => {
    const schema = batchApi.updateConfigs.input;

    it("requires ids and updates", () => {
      const result = schema.safeParse({
        ids: [1, 2, 3],
        updates: { name: "New Name" },
      });
      expect(result.success).toBe(true);
    });

    it("allows partial config updates", () => {
      const result = schema.safeParse({
        ids: [1],
        updates: { description: "Updated description" },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Insert Project Schema", () => {
  describe("insertProjectSchema", () => {
    const schema = insertProjectSchema;

    it("requires path and name", () => {
      const result = schema.safeParse({
        path: "/test/project",
        name: "project",
      });
      expect(result.success).toBe(true);
    });

    it("accepts status values", () => {
      const statuses = ["linked", "unlinked", "pending"] as const;

      for (const status of statuses) {
        const result = schema.safeParse({
          path: "/test",
          name: "test",
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid status", () => {
      const result = schema.safeParse({
        path: "/test",
        name: "test",
        status: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional classification", () => {
      const result = schema.safeParse({
        path: "/test",
        name: "test",
        classification: {
          sets: ["quantum"],
          topics: ["ai"],
          types: ["library"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional attributes", () => {
      const result = schema.safeParse({
        path: "/test",
        name: "test",
        attributes: { source: "claude" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts markers array", () => {
      const result = schema.safeParse({
        path: "/test",
        name: "test",
        markers: ["package.json", ".git"],
      });
      expect(result.success).toBe(true);
    });
  });
});
