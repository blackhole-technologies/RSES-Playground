/**
 * @file rses-parser-security.test.ts
 * @description Security tests for RSES parser - validates path traversal blocking
 *              and malicious config rejection.
 * @phase Phase 1 - Security Hardening
 * @author SEC (Security Specialist Agent)
 * @validated SGT (Set-Graph Theorist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect } from "vitest";
import { RsesParser } from "../src/rses";

describe("RSES Parser Security", () => {
  describe("Path Traversal Blocking", () => {
    it("blocks path traversal with .. in topic rules", () => {
      const config = `
[rules.topic]
* -> ../../../etc/passwd
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
      expect(result.errors.some((e) => e.message.includes("Path traversal"))).toBe(true);
    });

    it("blocks path traversal with .. in type rules", () => {
      const config = `
[rules.type]
* -> ../../secret
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
    });

    it("blocks absolute paths starting with /", () => {
      const config = `
[rules.topic]
* -> /etc/passwd
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
    });

    it("blocks Windows-style absolute paths", () => {
      const config = `
[rules.topic]
* -> C:\\Windows\\System32
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
    });

    it("blocks path traversal in topic overrides", () => {
      const config = `
[overrides.topic]
test = ../../secret
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
    });

    it("blocks path traversal in type overrides", () => {
      const config = `
[overrides.type]
test = /var/log/secret
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E005")).toBe(true);
    });

    it("allows safe relative paths", () => {
      const config = `
[rules.topic]
* -> topic/subtopic
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });

    it("allows paths with dashes and underscores", () => {
      const config = `
[rules.topic]
* -> my-topic/sub_topic
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("ReDoS Pattern Detection", () => {
    it("detects potential ReDoS patterns", () => {
      const config = `
[sets]
dangerous = (a+)+b
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E004")).toBe(true);
    });

    it("allows safe glob patterns", () => {
      const config = `
[sets]
web = web-* | webapp-*
tools = tool-*
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("Compound Expression Validation", () => {
    it("validates compound set expressions", () => {
      const config = `
[sets.compound]
valid = $a & $b
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid compound expressions", () => {
      const config = `
[sets.compound]
invalid = $a &
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E007")).toBe(true);
    });

    it("rejects code injection in compound expressions", () => {
      const config = `
[sets.compound]
malicious = $a; console.log('pwned')
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("Malformed Input Handling", () => {
    it("handles empty config", () => {
      const result = RsesParser.parse("");
      expect(result.valid).toBe(true);
      expect(result.parsed).toBeDefined();
    });

    it("handles config with only comments", () => {
      const config = `
# This is a comment
# Another comment
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(true);
    });

    it("rejects malformed section headers", () => {
      const config = `
[sets
key = value
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E001")).toBe(true);
    });

    it("rejects rules without arrow syntax", () => {
      const config = `
[rules.topic]
* = topic
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E001")).toBe(true);
    });

    it("rejects empty rule conditions", () => {
      const config = `
[rules.topic]
-> topic
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E001")).toBe(true);
    });

    it("rejects empty rule results", () => {
      const config = `
[rules.topic]
* ->
`;
      const result = RsesParser.parse(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "E001")).toBe(true);
    });
  });

  describe("Safe Expression Evaluation", () => {
    it("evaluates compound sets safely without code execution", () => {
      const config = `
[sets]
a = a-*
b = *-b

[sets.compound]
both = $a & $b
`;
      const parseResult = RsesParser.parse(config);
      expect(parseResult.valid).toBe(true);

      // Test that evaluation works correctly
      // a-test-b matches both a-* and *-b patterns
      const testResult = RsesParser.test(parseResult.parsed!, "a-test-b", {});
      expect(testResult.sets).toContain("a");
      expect(testResult.sets).toContain("b");
      expect(testResult.sets).toContain("both");
    });

    it("handles missing sets in compound expressions gracefully", () => {
      const config = `
[sets.compound]
missing = $nonexistent & $also_nonexistent
`;
      const parseResult = RsesParser.parse(config);
      expect(parseResult.valid).toBe(true);

      const testResult = RsesParser.test(parseResult.parsed!, "test-file", {});
      expect(testResult.sets).not.toContain("missing");
    });
  });
});

describe("RSES Parser - Test Function Security", () => {
  const validConfig = `
[sets]
quantum = quantum-*

[sets.attributes]
claude = {source = claude}

[sets.compound]
claude-quantum = $quantum & $claude

[rules.topic]
$quantum & $claude -> quantum/claude
`;

  it("safely processes attribute-based rules", () => {
    const parseResult = RsesParser.parse(validConfig);
    expect(parseResult.valid).toBe(true);

    const testResult = RsesParser.test(
      parseResult.parsed!,
      "quantum-app",
      { source: "claude" }
    );

    expect(testResult.sets).toContain("quantum");
    expect(testResult.sets).toContain("claude");
    expect(testResult.sets).toContain("claude-quantum");
    expect(testResult.topics).toContain("quantum/claude");
  });

  it("handles wildcard attributes safely", () => {
    const config = `
[sets.attributes]
any-ai = {source = *}

[rules.topic]
{source = *} -> ai/$source
`;
    const parseResult = RsesParser.parse(config);
    expect(parseResult.valid).toBe(true);

    const testResult = RsesParser.test(
      parseResult.parsed!,
      "test-project",
      { source: "gemini" }
    );

    expect(testResult.sets).toContain("any-ai");
    expect(testResult.topics).toContain("ai/gemini");
  });

  it("does not execute injected code in attributes", () => {
    const parseResult = RsesParser.parse(validConfig);
    expect(parseResult.valid).toBe(true);

    // Try to inject code through attributes
    const testResult = RsesParser.test(
      parseResult.parsed!,
      "test-project",
      { source: "claude'; console.log('pwned'); '" }
    );

    // Should process without code execution
    expect(testResult).toBeDefined();
  });
});
