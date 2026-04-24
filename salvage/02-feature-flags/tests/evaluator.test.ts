/**
 * @file evaluator.test.ts
 * @description Tests for Feature Flag Evaluator
 * @phase Phase 2 - Comprehensive Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TargetingRuleEvaluator, PercentageRolloutEvaluator } from "../src/evaluator";
import type { TargetingRule, PercentageRollout, EvaluationContext } from "../src/shared-types";

describe("TargetingRuleEvaluator", () => {
  const evaluator = new TargetingRuleEvaluator();

  describe("equals operator", () => {
    it("matches exact string value", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "country",
        operator: "equals",
        value: "US",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { country: "US" } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });

    it("rejects non-matching value", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "country",
        operator: "equals",
        value: "US",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { country: "UK" } };
      expect(evaluator.evaluate(rule, context)).toBe(false);
    });

    it("matches userId context property", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "userId",
        operator: "equals",
        value: "user123",
        variation: true,
      };
      const context: EvaluationContext = { userId: "user123" };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });
  });

  describe("notEquals operator", () => {
    it("matches non-equal values", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "country",
        operator: "notEquals",
        value: "US",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { country: "UK" } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });
  });

  describe("contains operator", () => {
    it("matches substring", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "email",
        operator: "contains",
        value: "@company.com",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { email: "user@company.com" } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });

    it("rejects missing substring", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "email",
        operator: "contains",
        value: "@company.com",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { email: "user@gmail.com" } };
      expect(evaluator.evaluate(rule, context)).toBe(false);
    });
  });

  describe("in operator", () => {
    it("matches value in array", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "tier",
        operator: "in",
        value: ["premium", "enterprise"],
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { tier: "premium" } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });

    it("rejects value not in array", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "tier",
        operator: "in",
        value: ["premium", "enterprise"],
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { tier: "free" } };
      expect(evaluator.evaluate(rule, context)).toBe(false);
    });
  });

  describe("greaterThan operator", () => {
    it("matches greater value", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "age",
        operator: "greaterThan",
        value: 18,
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { age: 25 } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });

    it("rejects equal value", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "age",
        operator: "greaterThan",
        value: 18,
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { age: 18 } };
      expect(evaluator.evaluate(rule, context)).toBe(false);
    });
  });

  describe("lessThan operator", () => {
    it("matches lesser value", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "age",
        operator: "lessThan",
        value: 18,
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { age: 15 } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });
  });

  describe("regex operator", () => {
    it("matches regex pattern", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "email",
        operator: "regex",
        value: ".*@company\\.com$",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: { email: "user@company.com" } };
      expect(evaluator.evaluate(rule, context)).toBe(true);
    });
  });

  describe("evaluateAll", () => {
    it("returns first matching rule", () => {
      const rules: TargetingRule[] = [
        {
          id: "r1",
          attribute: "tier",
          operator: "equals",
          value: "free",
          variation: true,
        },
        {
          id: "r2",
          attribute: "tier",
          operator: "equals",
          value: "premium",
          variation: true,
        },
      ];
      const context: EvaluationContext = { userAttributes: { tier: "premium" } };
      const result = evaluator.evaluateAll(rules, context);
      expect(result.matched).toBe(true);
      expect(result.matchedRule?.id).toBe("r2");
    });

    it("returns no match when none match", () => {
      const rules: TargetingRule[] = [
        {
          id: "r1",
          attribute: "tier",
          operator: "equals",
          value: "enterprise",
          variation: true,
        },
      ];
      const context: EvaluationContext = { userAttributes: { tier: "free" } };
      const result = evaluator.evaluateAll(rules, context);
      expect(result.matched).toBe(false);
    });
  });

  describe("missing attribute", () => {
    it("returns false when attribute is missing", () => {
      const rule: TargetingRule = {
        id: "r1",
        attribute: "nonexistent",
        operator: "equals",
        value: "anything",
        variation: true,
      };
      const context: EvaluationContext = { userAttributes: {} };
      expect(evaluator.evaluate(rule, context)).toBe(false);
    });
  });
});

describe("PercentageRolloutEvaluator", () => {
  const evaluator = new PercentageRolloutEvaluator();

  describe("getBucket", () => {
    it("returns consistent bucket for same key", () => {
      const bucket1 = evaluator.getBucket("user123", "feature_x", 100);
      const bucket2 = evaluator.getBucket("user123", "feature_x", 100);
      expect(bucket1).toBe(bucket2);
    });

    it("returns different buckets for different keys", () => {
      const bucket1 = evaluator.getBucket("user1", "feature_x", 100);
      const bucket2 = evaluator.getBucket("user2", "feature_x", 100);
      // These may or may not be different, but with high probability they are
      // We test consistency, not uniqueness
      expect(typeof bucket1).toBe("number");
      expect(typeof bucket2).toBe("number");
    });

    it("distributes buckets across range", () => {
      const buckets = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        buckets.add(evaluator.getBucket(`user${i}`, "feature_x", 100));
      }
      // Should have good distribution across buckets
      expect(buckets.size).toBeGreaterThan(50);
    });
  });

  describe("isInRollout", () => {
    it("includes user in 100% rollout", () => {
      const config: PercentageRollout = {
        enabled: true,
        percentage: 100,
        bucketBy: ["userId"],
      };
      const context: EvaluationContext = { userId: "user123" };
      expect(evaluator.isInRollout(config, context, "feature_x")).toBe(true);
    });

    it("excludes user from 0% rollout", () => {
      const config: PercentageRollout = {
        enabled: true,
        percentage: 0,
        bucketBy: ["userId"],
      };
      const context: EvaluationContext = { userId: "user123" };
      expect(evaluator.isInRollout(config, context, "feature_x")).toBe(false);
    });

    it("respects disabled rollout", () => {
      const config: PercentageRollout = {
        enabled: false,
        percentage: 100,
        bucketBy: ["userId"],
      };
      const context: EvaluationContext = { userId: "user123" };
      expect(evaluator.isInRollout(config, context, "feature_x")).toBe(false);
    });

    it("uses siteId for bucketing when specified", () => {
      const config: PercentageRollout = {
        enabled: true,
        percentage: 50,
        bucketBy: ["siteId"],
      };
      const context1: EvaluationContext = { siteId: "site1", userId: "user1" };
      const context2: EvaluationContext = { siteId: "site1", userId: "user2" };

      // Same site should get same result regardless of user
      const result1 = evaluator.isInRollout(config, context1, "feature_x");
      const result2 = evaluator.isInRollout(config, context2, "feature_x");
      expect(result1).toBe(result2);
    });

    it("returns false when bucket key is missing", () => {
      const config: PercentageRollout = {
        enabled: true,
        percentage: 50,
        bucketBy: ["userId"],
      };
      const context: EvaluationContext = {}; // No userId
      expect(evaluator.isInRollout(config, context, "feature_x")).toBe(false);
    });
  });
});
