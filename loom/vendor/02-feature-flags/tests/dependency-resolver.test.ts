/**
 * @file dependency-resolver.test.ts
 * @description Tests for Feature Flag Dependency Resolver
 * @phase Phase 2 - Comprehensive Test Suite
 */

import { describe, it, expect } from "vitest";
import { FeatureDependencyResolver } from "../src/dependency-resolver";
import type { FeatureFlag, FeatureDependency } from "../src/shared-types";

describe("FeatureDependencyResolver", () => {
  const resolver = new FeatureDependencyResolver();

  const createFlag = (
    key: string,
    enabled: boolean,
    deps: FeatureDependency[] = []
  ): FeatureFlag => ({
    key,
    name: key,
    description: `Feature ${key}`,
    category: "optional",
    globallyEnabled: enabled,
    toggleable: true,
    defaultState: false,
    dependencies: deps,
    dependents: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    changeHistory: [],
    targetingRules: [],
  });

  describe("buildGraph", () => {
    it("builds correct dependency graph", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
      ];

      const graph = resolver.buildGraph(flags);

      expect(graph.get("A")?.dependencies).toHaveLength(0);
      expect(graph.get("A")?.dependents).toContain("B");
      expect(graph.get("B")?.dependencies).toContain("A");
      expect(graph.get("B")?.dependents).toContain("C");
      expect(graph.get("C")?.dependencies).toContain("B");
    });
  });

  describe("canEnable", () => {
    it("allows enabling when all dependencies are met", () => {
      const flags = [
        createFlag("parent", true),
        createFlag("child", false, [{ featureKey: "parent", requiredState: true }]),
      ];

      const result = resolver.canEnable("child", flags);

      expect(result.canEnable).toBe(true);
      expect(result.blockedBy).toHaveLength(0);
    });

    it("blocks enabling when dependency is disabled", () => {
      const flags = [
        createFlag("parent", false),
        createFlag("child", false, [{ featureKey: "parent", requiredState: true }]),
      ];

      const result = resolver.canEnable("child", flags);

      expect(result.canEnable).toBe(false);
      expect(result.blockedBy).toContain("parent");
    });

    it("handles requiredState: false", () => {
      const flags = [
        createFlag("blocker", true),
        createFlag("feature", false, [{ featureKey: "blocker", requiredState: false }]),
      ];

      const result = resolver.canEnable("feature", flags);

      expect(result.canEnable).toBe(false);
    });

    it("returns false for non-existent flag", () => {
      const result = resolver.canEnable("nonexistent", []);
      expect(result.canEnable).toBe(false);
    });
  });

  describe("canDisable", () => {
    it("allows disabling when no dependents require it", () => {
      const flags = [
        createFlag("parent", true),
        createFlag("child", false, [{ featureKey: "parent", requiredState: true }]),
      ];

      const result = resolver.canDisable("parent", flags);

      expect(result.canEnable).toBe(true); // canEnable is used for both enable/disable checks
    });

    it("blocks disabling when enabled dependents require it", () => {
      const flags = [
        createFlag("parent", true),
        createFlag("child", true, [{ featureKey: "parent", requiredState: true }]),
      ];

      const result = resolver.canDisable("parent", flags);

      expect(result.canEnable).toBe(false);
      expect(result.wouldBreak).toContain("child");
    });

    it("allows disabling when dependent is already disabled", () => {
      const flags = [
        createFlag("parent", true),
        createFlag("child", false, [{ featureKey: "parent", requiredState: true }]),
      ];

      const result = resolver.canDisable("parent", flags);

      expect(result.canEnable).toBe(true);
    });
  });

  describe("getDependents", () => {
    it("returns direct dependents", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const dependents = resolver.getDependents("A", flags);

      expect(dependents).toContain("B");
    });

    it("returns transitive dependents", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
      ];

      const dependents = resolver.getDependents("A", flags);

      expect(dependents).toContain("B");
      expect(dependents).toContain("C");
    });

    it("returns empty for leaf nodes", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const dependents = resolver.getDependents("B", flags);

      expect(dependents).toHaveLength(0);
    });
  });

  describe("getDependencies", () => {
    it("returns direct dependencies", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const deps = resolver.getDependencies("B", flags);

      expect(deps).toContain("A");
    });

    it("returns transitive dependencies", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
      ];

      const deps = resolver.getDependencies("C", flags);

      expect(deps).toContain("A");
      expect(deps).toContain("B");
    });
  });

  describe("detectCycles", () => {
    it("detects no cycles in valid graph", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
      ];

      const cycles = resolver.detectCycles(flags);

      expect(cycles).toHaveLength(0);
    });

    it("detects direct cycle", () => {
      const flags = [
        createFlag("A", true, [{ featureKey: "B", requiredState: true }]),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const cycles = resolver.detectCycles(flags);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it("detects indirect cycle", () => {
      const flags = [
        createFlag("A", true, [{ featureKey: "C", requiredState: true }]),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
      ];

      const cycles = resolver.detectCycles(flags);

      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe("getTopologicalOrder", () => {
    it("returns flags in dependency order", () => {
      const flags = [
        createFlag("C", true, [{ featureKey: "B", requiredState: true }]),
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const order = resolver.getTopologicalOrder(flags);

      const aIndex = order.indexOf("A");
      const bIndex = order.indexOf("B");
      const cIndex = order.indexOf("C");

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });

    it("handles independent flags", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true),
        createFlag("C", true),
      ];

      const order = resolver.getTopologicalOrder(flags);

      expect(order).toHaveLength(3);
      expect(order).toContain("A");
      expect(order).toContain("B");
      expect(order).toContain("C");
    });
  });

  describe("validateDependency", () => {
    it("validates valid dependency", () => {
      const flags = [
        createFlag("parent", true),
        createFlag("child", true),
      ];

      const result = resolver.validateDependency(
        "child",
        { featureKey: "parent", requiredState: true },
        flags
      );

      expect(result.valid).toBe(true);
    });

    it("rejects self-reference", () => {
      const flags = [createFlag("A", true)];

      const result = resolver.validateDependency(
        "A",
        { featureKey: "A", requiredState: true },
        flags
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("self");
    });

    it("rejects non-existent dependency", () => {
      const flags = [createFlag("A", true)];

      const result = resolver.validateDependency(
        "A",
        { featureKey: "nonexistent", requiredState: true },
        flags
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("rejects dependency that would create cycle", () => {
      const flags = [
        createFlag("A", true, [{ featureKey: "B", requiredState: true }]),
        createFlag("B", true),
      ];

      const result = resolver.validateDependency(
        "B",
        { featureKey: "A", requiredState: true },
        flags
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("cycle");
    });
  });

  describe("toDotFormat", () => {
    it("generates valid DOT format", () => {
      const flags = [
        createFlag("A", true),
        createFlag("B", true, [{ featureKey: "A", requiredState: true }]),
      ];

      const dot = resolver.toDotFormat(flags);

      expect(dot).toContain("digraph");
      expect(dot).toContain("A");
      expect(dot).toContain("B");
      expect(dot).toContain("->");
    });
  });
});
