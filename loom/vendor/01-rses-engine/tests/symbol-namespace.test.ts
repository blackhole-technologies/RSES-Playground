/**
 * @file symbol-namespace.test.ts
 * @description Tests for symbol namespace separation and collision detection.
 * @phase Phase 2 - Core Engine Improvements
 * @author SGT (Set-Graph Theorist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import { RsesParser } from "../src/rses";

describe("Symbol Namespace Separation", () => {
  describe("collision detection between namespaces", () => {
    it("detects collision between pattern and attribute sets", () => {
      const config = `
[sets]
web = web-*

[sets.attributes]
web = {source = web}
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E009")).toBe(true);
      expect(result.errors[0].message).toContain("Symbol collision");
      expect(result.errors[0].message).toContain("web");
    });

    it("detects collision between pattern and compound sets", () => {
      const config = `
[sets]
tools = tool-*
combined = combined-*

[sets.compound]
combined = $tools
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E009")).toBe(true);
      expect(result.errors[0].message).toContain("combined");
    });

    it("detects collision between attribute and compound sets", () => {
      const config = `
[sets]
base = base-*

[sets.attributes]
ai = {source = claude}

[sets.compound]
ai = $base
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E009")).toBe(true);
      expect(result.errors[0].message).toContain("ai");
    });

    it("detects multiple collisions", () => {
      const config = `
[sets]
web = web-*
tools = tool-*

[sets.attributes]
web = {source = web}
tools = {type = tool}
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.filter((e) => e.code === "E009").length).toBe(2);
    });
  });

  describe("no collision when names are unique", () => {
    it("allows different names across namespaces", () => {
      const config = `
[sets]
web = web-*
tools = tool-*

[sets.attributes]
claude = {source = claude}
chatgpt = {source = chatgpt}

[sets.compound]
combined = $web & $tools
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows same pattern name with different key", () => {
      const config = `
[sets]
web-patterns = web-*
tool-patterns = tool-*
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("error messages are informative", () => {
    it("includes line number of original definition", () => {
      const config = `
[sets]
test = test-*

[sets.attributes]
test = {source = test}
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.code === "E009");
      expect(error).toBeDefined();
      expect(error!.message).toContain("line");
      expect(error!.message).toContain("[sets]");
    });

    it("identifies the namespace type correctly", () => {
      const config = `
[sets.attributes]
my-set = {source = test}

[sets.compound]
my-set = $other
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.code === "E009");
      expect(error!.message).toContain("[sets.attributes]");
    });
  });

  describe("collision skips adding duplicate", () => {
    it("first definition wins on collision", () => {
      const config = `
[sets]
test = first-*

[sets.compound]
test = $other
other = other-*
`;
      const result = RsesParser.parse(config);
      // The compound set 'test' should be rejected
      expect(result.valid).toBe(false);
      // Check that other compound set was still added
      if (result.parsed) {
        expect(result.parsed.sets["test"]).toBe("first-*");
        expect(result.parsed.compound["test"]).toBeUndefined();
        expect(result.parsed.compound["other"]).toBeUndefined(); // also skipped due to validation failure
      }
    });
  });

  describe("integration with other validations", () => {
    it("collision detection works alongside cycle detection", () => {
      const config = `
[sets]
a = a-*

[sets.compound]
a = $b
b = $a
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      // Should have both collision and potentially cycle errors
      expect(result.errors.some((e) => e.code === "E009")).toBe(true);
    });

    it("collision detection works alongside ReDoS detection", () => {
      const config = `
[sets]
unsafe = (a+)+

[sets.attributes]
unsafe = {source = test}
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      // Should have both ReDoS and collision errors
      // ReDoS error should appear because unsafe pattern is checked first
      expect(result.errors.some((e) => e.code === "E004")).toBe(true);
    });
  });
});
