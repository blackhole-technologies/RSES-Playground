/**
 * @file suggestion-engine.test.ts
 * @description Tests for the suggestion engine
 * @phase Phase 5 - Prompting & Learning
 */

import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  similarity,
  hasCommonPrefix,
  hasCommonSuffix,
  generateSuggestions,
  isUnmatched,
  createExtendedResult,
  generatePatternSuggestion,
} from "../src/suggestion-engine";
import { RsesConfig, TestMatchResponse } from "../src/types";

describe("Levenshtein Distance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns correct distance for single character difference", () => {
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
  });

  it("returns correct distance for completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("handles insertions and deletions", () => {
    expect(levenshteinDistance("abc", "ab")).toBe(1);
    expect(levenshteinDistance("ab", "abc")).toBe(1);
  });
});

describe("Similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings of same length", () => {
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("returns value between 0 and 1 for partial matches", () => {
    const sim = similarity("hello", "hallo");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("is case insensitive", () => {
    expect(similarity("Hello", "hello")).toBe(1);
  });
});

describe("hasCommonPrefix", () => {
  it("detects common prefixes", () => {
    expect(hasCommonPrefix("quantum-app", "quantum-lib")).toBe(true);
  });

  it("respects minimum length", () => {
    expect(hasCommonPrefix("ab", "abc", 3)).toBe(false);
    expect(hasCommonPrefix("abc", "abcd", 3)).toBe(true);
  });

  it("is case insensitive", () => {
    expect(hasCommonPrefix("Quantum", "quantum")).toBe(true);
  });
});

describe("hasCommonSuffix", () => {
  it("detects common suffixes", () => {
    expect(hasCommonSuffix("project-app", "other-app")).toBe(true);
  });

  it("respects minimum length", () => {
    expect(hasCommonSuffix("ab", "cb", 3)).toBe(false);
    expect(hasCommonSuffix("abc", "xbc", 2)).toBe(true);
  });
});

describe("generateSuggestions", () => {
  const mockConfig: RsesConfig = {
    defaults: {
      auto_topic: "false",
      auto_type: "false",
      delimiter: "-",
    },
    overrides: {
      topic: { web: "web-development", api: "api-services" },
      type: { lib: "library", app: "application" },
    },
    sets: {
      quantum: "quantum-*",
      web: "web-*",
      tools: "tool-*",
    },
    attributes: {},
    compound: {},
    rules: {
      topic: [],
      type: [],
      filetype: [],
    },
    security: {},
  };

  const emptyResult: TestMatchResponse = {
    sets: [],
    topics: [],
    types: [],
    filetypes: [],
  };

  it("generates suggestions for similar sets", () => {
    const suggestions = generateSuggestions("quantm-app", mockConfig, emptyResult);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.value === "quantum")).toBe(true);
  });

  it("generates prefix-based suggestions", () => {
    const suggestions = generateSuggestions("web-something", mockConfig, emptyResult);
    expect(suggestions.some((s) => s.type === "set" && s.value === "web")).toBe(true);
  });

  it("limits number of suggestions", () => {
    const suggestions = generateSuggestions("test-app", mockConfig, emptyResult, 2);
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });

  it("sorts by confidence", () => {
    const suggestions = generateSuggestions("quantum-app", mockConfig, emptyResult);
    if (suggestions.length > 1) {
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
      }
    }
  });
});

describe("isUnmatched", () => {
  const configWithAutoDisabled: RsesConfig = {
    defaults: {
      auto_topic: "false",
      auto_type: "false",
      delimiter: "-",
    },
    overrides: { topic: {}, type: {} },
    sets: {},
    attributes: {},
    compound: {},
    rules: { topic: [], type: [], filetype: [] },
    security: {},
  };

  const configWithAutoEnabled: RsesConfig = {
    defaults: {
      auto_topic: "prefix",
      auto_type: "suffix",
      delimiter: "-",
    },
    overrides: { topic: {}, type: {} },
    sets: {},
    attributes: {},
    compound: {},
    rules: { topic: [], type: [], filetype: [] },
    security: {},
  };

  it("detects unmatched when auto is disabled and no matches", () => {
    const result: TestMatchResponse = {
      sets: [],
      topics: [],
      types: [],
      filetypes: [],
    };
    expect(isUnmatched(result, configWithAutoDisabled)).toBe(true);
  });

  it("detects unmatched when auto is enabled but nothing matches", () => {
    const result: TestMatchResponse = {
      sets: [],
      topics: [],
      types: [],
      filetypes: [],
    };
    expect(isUnmatched(result, configWithAutoEnabled)).toBe(true);
  });

  it("returns false when sets match", () => {
    const result: TestMatchResponse = {
      sets: ["quantum"],
      topics: [],
      types: [],
      filetypes: [],
    };
    expect(isUnmatched(result, configWithAutoDisabled)).toBe(false);
  });
});

describe("createExtendedResult", () => {
  const mockConfig: RsesConfig = {
    defaults: {
      auto_topic: "false",
      auto_type: "false",
      delimiter: "-",
    },
    overrides: { topic: {}, type: {} },
    sets: { quantum: "quantum-*" },
    attributes: {},
    compound: {},
    rules: { topic: [], type: [], filetype: [] },
    security: {},
  };

  it("adds _unmatched flag", () => {
    const basicResult: TestMatchResponse = {
      sets: [],
      topics: [],
      types: [],
      filetypes: [],
    };
    const extended = createExtendedResult("test-app", mockConfig, basicResult);
    expect(extended._unmatched).toBe(true);
  });

  it("includes suggestions when unmatched", () => {
    const basicResult: TestMatchResponse = {
      sets: [],
      topics: [],
      types: [],
      filetypes: [],
    };
    const extended = createExtendedResult("quantm-app", mockConfig, basicResult);
    expect(extended.suggestions.length).toBeGreaterThan(0);
  });

  it("extracts prefix and suffix", () => {
    const basicResult: TestMatchResponse = {
      sets: ["quantum"],
      topics: ["topic"],
      types: ["type"],
      filetypes: [],
    };
    const extended = createExtendedResult("my-project-lib", mockConfig, basicResult);
    expect(extended.prefix).toBe("my");
    expect(extended.suffix).toBe("lib");
  });
});

describe("generatePatternSuggestion", () => {
  const config: RsesConfig = {
    defaults: {
      auto_topic: "false",
      auto_type: "false",
      delimiter: "-",
    },
    overrides: { topic: {}, type: {} },
    sets: {},
    attributes: {},
    compound: {},
    rules: { topic: [], type: [], filetype: [] },
    security: {},
  };

  it("generates wildcard for file extension", () => {
    const pattern = generatePatternSuggestion("script.py", config);
    expect(pattern).toBe("*.py");
  });

  it("generates prefix pattern for multi-segment names", () => {
    const pattern = generatePatternSuggestion("quantum-app", config);
    expect(pattern).toBe("quantum-*");
  });

  it("generates wildcard for simple names", () => {
    const pattern = generatePatternSuggestion("myproject", config);
    expect(pattern).toBe("myproject*");
  });
});
