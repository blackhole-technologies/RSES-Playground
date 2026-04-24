/**
 * @file suggestion-engine.ts
 * @description Suggestion engine for unknown categories with Levenshtein-based matching
 * @phase Phase 5 - Prompting & Learning
 */

import { RsesConfig, TestMatchResponse } from "./types";

/**
 * Suggestion with confidence score
 */
export interface Suggestion {
  value: string;
  confidence: number; // 0-1
  reason: string;
  type: "set" | "topic" | "type" | "filetype";
}

/**
 * Extended test result with unmatched detection
 */
export interface ExtendedTestResult extends TestMatchResponse {
  _unmatched: boolean;
  suggestions: Suggestion[];
  prefix: string;
  suffix: string;
}

/**
 * Calculates Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates similarity score (0-1) based on Levenshtein distance
 */
export function similarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

/**
 * Checks if strings share common prefix
 */
export function hasCommonPrefix(a: string, b: string, minLength: number = 2): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  let commonLength = 0;

  for (let i = 0; i < Math.min(aLower.length, bLower.length); i++) {
    if (aLower[i] === bLower[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  return commonLength >= minLength;
}

/**
 * Checks if strings share common suffix
 */
export function hasCommonSuffix(a: string, b: string, minLength: number = 2): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  let commonLength = 0;

  for (let i = 0; i < Math.min(aLower.length, bLower.length); i++) {
    if (aLower[aLower.length - 1 - i] === bLower[bLower.length - 1 - i]) {
      commonLength++;
    } else {
      break;
    }
  }

  return commonLength >= minLength;
}

/**
 * Generates suggestions for a filename based on existing config
 */
export function generateSuggestions(
  filename: string,
  config: RsesConfig,
  testResult: TestMatchResponse,
  maxSuggestions: number = 5
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const delimiter = config.defaults.delimiter || "-";
  const segments = filename.split(delimiter);
  const prefix = segments[0];
  const suffix = segments.length > 1 ? segments[segments.length - 1] : "";

  // Collect all existing set names from config
  const allSets = new Set<string>([
    ...Object.keys(config.sets),
    ...Object.keys(config.attributes),
    ...Object.keys(config.compound),
  ]);

  // Collect existing topics and types from overrides and rules
  const existingTopics = new Set<string>(Object.values(config.overrides.topic));
  const existingTypes = new Set<string>(Object.values(config.overrides.type));

  // Add rule results as existing categories
  for (const rule of config.rules.topic) {
    existingTopics.add(rule.result);
  }
  for (const rule of config.rules.type) {
    existingTypes.add(rule.result);
  }

  // If no sets matched, suggest similar sets based on filename
  if (testResult.sets.length === 0) {
    for (const setName of allSets) {
      const sim = similarity(filename, setName);
      if (sim > 0.3) {
        suggestions.push({
          value: setName,
          confidence: sim,
          reason: `Similar to existing set "${setName}"`,
          type: "set",
        });
      }

      // Check prefix match
      if (hasCommonPrefix(prefix, setName, 3)) {
        const prefixSim = similarity(prefix, setName);
        suggestions.push({
          value: setName,
          confidence: Math.min(0.9, prefixSim + 0.2),
          reason: `Prefix "${prefix}" matches set "${setName}"`,
          type: "set",
        });
      }
    }
  }

  // If no topics matched and auto_topic is false, suggest existing topics
  if (testResult.topics.length === 0 && config.defaults.auto_topic === "false") {
    for (const topic of existingTopics) {
      const sim = similarity(prefix, topic);
      if (sim > 0.4) {
        suggestions.push({
          value: topic,
          confidence: sim,
          reason: `Prefix "${prefix}" similar to topic "${topic}"`,
          type: "topic",
        });
      }
    }

    // Suggest prefix as new topic if it's meaningful
    if (prefix.length >= 3 && !existingTopics.has(prefix)) {
      suggestions.push({
        value: prefix,
        confidence: 0.6,
        reason: `Use prefix "${prefix}" as new topic`,
        type: "topic",
      });
    }
  }

  // If no types matched and auto_type is false, suggest existing types
  if (testResult.types.length === 0 && config.defaults.auto_type === "false" && suffix) {
    for (const type of existingTypes) {
      const sim = similarity(suffix, type);
      if (sim > 0.4) {
        suggestions.push({
          value: type,
          confidence: sim,
          reason: `Suffix "${suffix}" similar to type "${type}"`,
          type: "type",
        });
      }
    }

    // Suggest suffix as new type if it's meaningful
    if (suffix.length >= 2 && !existingTypes.has(suffix)) {
      suggestions.push({
        value: suffix,
        confidence: 0.5,
        reason: `Use suffix "${suffix}" as new type`,
        type: "type",
      });
    }
  }

  // Deduplicate and sort by confidence
  const uniqueSuggestions = deduplicateSuggestions(suggestions);
  uniqueSuggestions.sort((a, b) => b.confidence - a.confidence);

  return uniqueSuggestions.slice(0, maxSuggestions);
}

/**
 * Removes duplicate suggestions, keeping highest confidence
 */
function deduplicateSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const seen = new Map<string, Suggestion>();

  for (const suggestion of suggestions) {
    const key = `${suggestion.type}:${suggestion.value}`;
    const existing = seen.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      seen.set(key, suggestion);
    }
  }

  return Array.from(seen.values());
}

/**
 * Determines if a test result represents an unmatched filename
 */
export function isUnmatched(
  result: TestMatchResponse,
  config: RsesConfig
): boolean {
  const hasNoSets = result.sets.length === 0;
  const hasNoTopics = result.topics.length === 0;
  const hasNoTypes = result.types.length === 0;

  // Check if auto-matching is disabled
  const autoTopicDisabled = config.defaults.auto_topic === "false";
  const autoTypeDisabled = config.defaults.auto_type === "false";

  // Unmatched if no sets AND (no topics when auto is off) AND (no types when auto is off)
  if (hasNoSets) {
    if (autoTopicDisabled && hasNoTopics) return true;
    if (autoTypeDisabled && hasNoTypes) return true;
    // If both are auto-enabled but nothing matched, also consider unmatched
    if (!autoTopicDisabled && !autoTypeDisabled && hasNoTopics && hasNoTypes) return true;
  }

  return false;
}

/**
 * Creates an extended test result with suggestions
 */
export function createExtendedResult(
  filename: string,
  config: RsesConfig,
  testResult: TestMatchResponse
): ExtendedTestResult {
  const delimiter = config.defaults.delimiter || "-";
  const segments = filename.split(delimiter);
  const prefix = segments[0];
  const suffix = segments.length > 1 ? segments[segments.length - 1] : "";

  const unmatched = isUnmatched(testResult, config);
  const suggestions = unmatched
    ? generateSuggestions(filename, config, testResult)
    : [];

  return {
    ...testResult,
    _unmatched: unmatched,
    suggestions,
    prefix,
    suffix,
  };
}

/**
 * Generates a pattern suggestion for a rule based on filename
 */
export function generatePatternSuggestion(
  filename: string,
  config: RsesConfig
): string {
  const delimiter = config.defaults.delimiter || "-";
  const segments = filename.split(delimiter);

  if (segments.length === 1) {
    // Simple filename, suggest exact match or wildcard
    return filename.includes(".")
      ? `*${filename.substring(filename.lastIndexOf("."))}`
      : `${filename}*`;
  }

  // Multi-segment filename, suggest prefix pattern
  return `${segments[0]}${delimiter}*`;
}
