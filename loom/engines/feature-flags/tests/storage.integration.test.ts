/**
 * Integration tests for the Drizzle-backed feature-flags storage
 * adapter. Verifies vendor/02's IFeatureFlagStorage contract end-to-end
 * against Postgres, covering CRUD, bulk ops, and search.
 *
 * Skipped without TEST_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../../../vendor/06-circuit-breaker/src/circuit-breaker";
import { createMigrationRunner } from "../../../core/migrations/runner";
import type { DbHandle } from "../../../core/db";
import type { FeatureFlag } from "../../../vendor/02-feature-flags/src/shared-types";
import { createDrizzleFeatureFlagStorage } from "../storage";

const DB_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOM_ROOT = path.resolve(__dirname, "..", "..", "..");

function makeTestHandle(pool: pg.Pool): DbHandle {
  const breaker = new CircuitBreaker({
    name: "test",
    failureThreshold: 1000,
    resetTimeout: 1000,
    successThreshold: 1,
  });
  return {
    pool,
    db: drizzle(pool),
    breaker,
    query: (op) => op(),
  };
}

/**
 * Build a minimal valid FeatureFlag for `create()` calls. Vendor's
 * type requires every field to be present (most have schema defaults),
 * so we provide reasonable defaults that the DB can absorb.
 */
function makeFlag(
  overrides: Partial<FeatureFlag> = {},
): Omit<FeatureFlag, "createdAt" | "updatedAt" | "changeHistory"> {
  return {
    key: "test_flag",
    name: "Test Flag",
    description: "",
    category: "optional",
    globallyEnabled: false,
    toggleable: true,
    defaultState: false,
    targetingRules: [],
    dependencies: [],
    dependents: [],
    tags: [],
    ...overrides,
  };
}

describe.skipIf(!DB_URL)("feature-flags storage (Drizzle)", () => {
  let pool: pg.Pool;
  let handle: DbHandle;
  let storage: ReturnType<typeof createDrizzleFeatureFlagStorage>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    handle = makeTestHandle(pool);
    storage = createDrizzleFeatureFlagStorage(handle);

    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");

    const runner = createMigrationRunner({
      databaseUrl: DB_URL!,
      directories: [
        "core/migrations",
        "engines/*/migrations",
        "modules/*/migrations",
      ],
      baseDir: LOOM_ROOT,
    });
    try {
      await runner.up();
    } finally {
      await runner.close();
    }
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM feature_rollout_history");
    await pool.query("DELETE FROM feature_flags");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("create / getByKey", () => {
    it("round-trips the SPEC core fields", async () => {
      const created = await storage.create(
        makeFlag({
          key: "core_field_test",
          name: "Core Fields",
          description: "Verifies persistence",
          category: "beta",
          globallyEnabled: true,
          defaultState: true,
          tags: ["audit", "spec"],
          owner: "platform-team",
        }),
      );
      expect(created.key).toBe("core_field_test");
      expect(created.name).toBe("Core Fields");
      expect(created.description).toBe("Verifies persistence");
      expect(created.category).toBe("beta");
      expect(created.globallyEnabled).toBe(true);
      expect(created.toggleable).toBe(true); // default
      expect(created.defaultState).toBe(true);
      expect(created.tags).toEqual(["audit", "spec"]);
      expect(created.owner).toBe("platform-team");
      expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const fetched = await storage.getByKey("core_field_test");
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Core Fields");
      expect(fetched!.tags).toEqual(["audit", "spec"]);
    });

    it("returns null for missing keys", async () => {
      const result = await storage.getByKey("does_not_exist");
      expect(result).toBeNull();
    });

    it("maps NULL description to empty string (vendor Zod compatibility)", async () => {
      // Insert directly so description column is NULL — bypassing the
      // adapter, which would default to "" if undefined.
      await pool.query(
        "INSERT INTO feature_flags (key, name, description) VALUES ($1, $2, NULL)",
        ["null_desc", "Null Desc Flag"],
      );
      const fetched = await storage.getByKey("null_desc");
      expect(fetched!.description).toBe("");
    });

    it("always returns dependents=[] and changeHistory=[] (not stored on the row)", async () => {
      await storage.create(
        makeFlag({ key: "history_test", name: "History" }),
      );
      const fetched = await storage.getByKey("history_test");
      expect(fetched!.dependents).toEqual([]);
      expect(fetched!.changeHistory).toEqual([]);
    });

    it("stores percentageRollout, targetingRules, and dependencies as JSONB", async () => {
      const flag = makeFlag({
        key: "json_test",
        name: "JSON Test",
        percentageRollout: {
          enabled: true,
          percentage: 33,
          bucketBy: ["userId"],
        },
        targetingRules: [
          {
            id: "rule1",
            attribute: "userId",
            operator: "equals",
            value: "abc",
            variation: true,
          },
        ],
        dependencies: [{ featureKey: "core_authentication", requiredState: true }],
      });
      await storage.create(flag);
      const fetched = await storage.getByKey("json_test");
      expect(fetched!.percentageRollout?.percentage).toBe(33);
      expect(fetched!.targetingRules).toHaveLength(1);
      expect(fetched!.dependencies).toHaveLength(1);
      expect(fetched!.dependencies[0].featureKey).toBe("core_authentication");
    });
  });

  describe("update", () => {
    it("changes specific fields and bumps updatedAt", async () => {
      const created = await storage.create(
        makeFlag({ key: "update_test", name: "Update Test" }),
      );
      const originalUpdated = created.updatedAt;
      // Sleep so timestamp difference is observable.
      await new Promise((r) => setTimeout(r, 10));

      const updated = await storage.update("update_test", {
        globallyEnabled: true,
        description: "Updated",
      });
      expect(updated).not.toBeNull();
      expect(updated!.globallyEnabled).toBe(true);
      expect(updated!.description).toBe("Updated");
      expect(updated!.name).toBe("Update Test"); // unchanged
      expect(updated!.updatedAt).not.toBe(originalUpdated);
    });

    it("returns null for an unknown key", async () => {
      const result = await storage.update("no_such_flag", {
        globallyEnabled: true,
      });
      expect(result).toBeNull();
    });

    it("no-op update returns the current row (does not error)", async () => {
      await storage.create(
        makeFlag({ key: "noop_test", name: "Noop" }),
      );
      const result = await storage.update("noop_test", {});
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Noop");
    });
  });

  describe("delete", () => {
    it("returns true when a flag is deleted", async () => {
      await storage.create(makeFlag({ key: "delete_me" }));
      expect(await storage.delete("delete_me")).toBe(true);
      expect(await storage.getByKey("delete_me")).toBeNull();
    });

    it("returns false when nothing matches", async () => {
      expect(await storage.delete("not_there")).toBe(false);
    });
  });

  describe("getAll / getByKeys / getByCategory", () => {
    beforeEach(async () => {
      await storage.create(makeFlag({ key: "a", category: "core" }));
      await storage.create(makeFlag({ key: "b", category: "core" }));
      await storage.create(makeFlag({ key: "c", category: "optional" }));
    });

    it("getAll returns every flag", async () => {
      const all = await storage.getAll();
      expect(all.map((f) => f.key).sort()).toEqual(["a", "b", "c"]);
    });

    it("getByKeys returns only the matching subset", async () => {
      const some = await storage.getByKeys(["a", "c", "missing"]);
      expect(some.map((f) => f.key).sort()).toEqual(["a", "c"]);
    });

    it("getByKeys with empty input returns empty array (no SQL fired)", async () => {
      const none = await storage.getByKeys([]);
      expect(none).toEqual([]);
    });

    it("getByCategory filters", async () => {
      const core = await storage.getByCategory("core");
      expect(core).toHaveLength(2);
      expect(core.every((f) => f.category === "core")).toBe(true);
    });
  });

  describe("bulk operations respect the toggleable gate", () => {
    beforeEach(async () => {
      await storage.create(
        makeFlag({ key: "core_a", toggleable: false, globallyEnabled: true }),
      );
      await storage.create(
        makeFlag({ key: "opt_b", toggleable: true, globallyEnabled: false }),
      );
      await storage.create(
        makeFlag({ key: "opt_c", toggleable: true, globallyEnabled: false }),
      );
    });

    it("bulkEnable affects only toggleable=true flags", async () => {
      const count = await storage.bulkEnable(["core_a", "opt_b", "opt_c"]);
      expect(count).toBe(2);
      const core = await storage.getByKey("core_a");
      const optB = await storage.getByKey("opt_b");
      const optC = await storage.getByKey("opt_c");
      expect(core!.globallyEnabled).toBe(true); // unchanged (was already true)
      expect(optB!.globallyEnabled).toBe(true);
      expect(optC!.globallyEnabled).toBe(true);
    });

    it("bulkDisable affects only toggleable=true flags", async () => {
      await storage.bulkEnable(["opt_b", "opt_c"]);
      const count = await storage.bulkDisable(["core_a", "opt_b", "opt_c"]);
      expect(count).toBe(2);
      const core = await storage.getByKey("core_a");
      expect(core!.globallyEnabled).toBe(true); // unchanged — toggleable=false
    });

    it("bulkDelete ignores toggleable (any flag can be removed)", async () => {
      const count = await storage.bulkDelete(["core_a", "opt_b"]);
      expect(count).toBe(2);
      expect(await storage.getByKey("core_a")).toBeNull();
      expect(await storage.getByKey("opt_b")).toBeNull();
      expect(await storage.getByKey("opt_c")).not.toBeNull();
    });

    it("bulk ops with empty input return 0 without firing SQL", async () => {
      expect(await storage.bulkEnable([])).toBe(0);
      expect(await storage.bulkDisable([])).toBe(0);
      expect(await storage.bulkDelete([])).toBe(0);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await storage.create(
        makeFlag({
          key: "alpha",
          name: "Alpha Feature",
          description: "First letter",
          category: "core",
          tags: ["foo", "bar"],
          owner: "team-a",
          globallyEnabled: true,
        }),
      );
      await storage.create(
        makeFlag({
          key: "beta",
          name: "Beta Feature",
          description: "Greek letters",
          category: "beta",
          tags: ["bar", "baz"],
          owner: "team-b",
          globallyEnabled: false,
        }),
      );
      await storage.create(
        makeFlag({
          key: "gamma",
          name: "Gamma",
          description: "More letters",
          category: "experimental",
          tags: ["baz"],
          owner: "team-a",
          globallyEnabled: true,
        }),
      );
    });

    it("filters by free-text search across key/name/description", async () => {
      const { flags, total } = await storage.search({ search: "letters" });
      expect(total).toBe(2);
      expect(flags.map((f) => f.key).sort()).toEqual(["beta", "gamma"]);
    });

    it("filters by category", async () => {
      const result = await storage.search({ categories: ["core", "beta"] });
      expect(result.total).toBe(2);
    });

    it("filters by tag intersection", async () => {
      const result = await storage.search({ tags: ["bar"] });
      expect(result.total).toBe(2);
      expect(result.flags.map((f) => f.key).sort()).toEqual(["alpha", "beta"]);
    });

    it("filters by enabled flag", async () => {
      const enabled = await storage.search({ enabled: true });
      expect(enabled.total).toBe(2);
      const disabled = await storage.search({ enabled: false });
      expect(disabled.total).toBe(1);
    });

    it("filters by owner", async () => {
      const result = await storage.search({ owner: "team-a" });
      expect(result.total).toBe(2);
    });

    it("combines filters", async () => {
      const result = await storage.search({
        owner: "team-a",
        enabled: true,
      });
      expect(result.total).toBe(2);
    });

    it("paginates with limit + offset", async () => {
      const page1 = await storage.search({ limit: 2, offset: 0 });
      expect(page1.flags).toHaveLength(2);
      expect(page1.total).toBe(3);
      const page2 = await storage.search({ limit: 2, offset: 2 });
      expect(page2.flags).toHaveLength(1);
      expect(page2.total).toBe(3);
    });
  });
});
