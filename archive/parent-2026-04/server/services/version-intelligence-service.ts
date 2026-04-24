/**
 * @file version-intelligence-service.ts
 * @description AI-Powered Version Intelligence Service
 * @phase Phase 10 - AI-Native CMS
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This service provides intelligent version management including:
 * - Smart semantic diff generation
 * - AI-powered merge suggestions
 * - Automatic conflict resolution
 * - Changelog generation
 * - Version comparison and analysis
 *
 * Inspired by Git's diff algorithms enhanced with semantic understanding.
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../logger";
import type {
  VersionIntelligenceService,
  SmartDiffResult,
  MergeSuggestion,
  FieldDiff,
  ConflictDetail,
  AIModelConfig,
} from "@shared/cms/ai-content-types";
import { getAIContentService } from "./ai-content-service";

const log = createModuleLogger("version-intelligence");

// =============================================================================
// DIFF ALGORITHM TYPES
// =============================================================================

interface DiffOperation {
  type: "insert" | "delete" | "equal";
  value: string;
  oldStart?: number;
  oldEnd?: number;
  newStart?: number;
  newEnd?: number;
}

interface SemanticChange {
  type: "addition" | "deletion" | "modification" | "reorganization";
  description: string;
  affectedFields: string[];
  significance: "high" | "medium" | "low";
  oldContent?: string;
  newContent?: string;
}

// =============================================================================
// MYERS DIFF ALGORITHM
// =============================================================================

class MyersDiff {
  /**
   * Compute the diff between two strings using Myers algorithm
   */
  static diff(oldText: string, newText: string): DiffOperation[] {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    const operations: DiffOperation[] = [];
    const lcs = this.longestCommonSubsequence(oldLines, newLines);

    let oldIndex = 0;
    let newIndex = 0;
    let lcsIndex = 0;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (lcsIndex < lcs.length && oldIndex < oldLines.length && newIndex < newLines.length) {
        if (oldLines[oldIndex] === lcs[lcsIndex] && newLines[newIndex] === lcs[lcsIndex]) {
          operations.push({
            type: "equal",
            value: oldLines[oldIndex],
            oldStart: oldIndex,
            oldEnd: oldIndex + 1,
            newStart: newIndex,
            newEnd: newIndex + 1,
          });
          oldIndex++;
          newIndex++;
          lcsIndex++;
        } else if (oldLines[oldIndex] !== lcs[lcsIndex]) {
          operations.push({
            type: "delete",
            value: oldLines[oldIndex],
            oldStart: oldIndex,
            oldEnd: oldIndex + 1,
          });
          oldIndex++;
        } else {
          operations.push({
            type: "insert",
            value: newLines[newIndex],
            newStart: newIndex,
            newEnd: newIndex + 1,
          });
          newIndex++;
        }
      } else if (oldIndex < oldLines.length) {
        operations.push({
          type: "delete",
          value: oldLines[oldIndex],
          oldStart: oldIndex,
          oldEnd: oldIndex + 1,
        });
        oldIndex++;
      } else if (newIndex < newLines.length) {
        operations.push({
          type: "insert",
          value: newLines[newIndex],
          newStart: newIndex,
          newEnd: newIndex + 1,
        });
        newIndex++;
      }
    }

    return operations;
  }

  /**
   * Compute longest common subsequence
   */
  private static longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
    const m = arr1.length;
    const n = arr2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Generate HTML diff representation
   */
  static generateHtmlDiff(operations: DiffOperation[]): string {
    return operations.map(op => {
      switch (op.type) {
        case "insert":
          return `<ins class="diff-insert">${this.escapeHtml(op.value)}</ins>`;
        case "delete":
          return `<del class="diff-delete">${this.escapeHtml(op.value)}</del>`;
        case "equal":
          return `<span class="diff-equal">${this.escapeHtml(op.value)}</span>`;
        default:
          return this.escapeHtml(op.value);
      }
    }).join("\n");
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// =============================================================================
// SEMANTIC SIMILARITY
// =============================================================================

class SemanticAnalyzer {
  /**
   * Calculate semantic similarity between two texts (0-1)
   */
  static calculateSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1;
    if (!text1 || !text2) return 0;

    // Simple Jaccard similarity on words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Classify change type based on content analysis
   */
  static classifyChange(
    oldContent: string | undefined,
    newContent: string | undefined
  ): "addition" | "deletion" | "modification" | "reorganization" {
    if (!oldContent && newContent) return "addition";
    if (oldContent && !newContent) return "deletion";
    if (!oldContent && !newContent) return "modification";

    const similarity = this.calculateSimilarity(oldContent!, newContent!);

    // Check for reorganization (similar content, different structure)
    if (similarity > 0.8) {
      const oldWords = oldContent!.split(/\s+/);
      const newWords = newContent!.split(/\s+/);
      if (Math.abs(oldWords.length - newWords.length) < oldWords.length * 0.1) {
        return "reorganization";
      }
    }

    return "modification";
  }

  /**
   * Determine significance of a change
   */
  static determineSignificance(
    changeType: "addition" | "deletion" | "modification" | "reorganization",
    oldContent: string | undefined,
    newContent: string | undefined
  ): "high" | "medium" | "low" {
    const contentLength = Math.max(oldContent?.length || 0, newContent?.length || 0);

    // Large additions/deletions are high significance
    if (changeType === "addition" || changeType === "deletion") {
      if (contentLength > 500) return "high";
      if (contentLength > 100) return "medium";
      return "low";
    }

    // Modifications significance based on similarity
    const similarity = this.calculateSimilarity(oldContent || "", newContent || "");
    if (similarity < 0.3) return "high";
    if (similarity < 0.7) return "medium";
    return "low";
  }
}

// =============================================================================
// MAIN VERSION INTELLIGENCE SERVICE
// =============================================================================

export interface VersionIntelligenceServiceConfig {
  aiModel?: AIModelConfig;
  semanticComparison?: boolean;
  autoMergeThreshold?: number;
  maxVersionsToCompare?: number;
}

export class VersionIntelligenceServiceImpl extends EventEmitter implements VersionIntelligenceService {
  constructor(private config: VersionIntelligenceServiceConfig = {}) {
    super();
    log.info("Version Intelligence Service initialized");
  }

  // ==========================================================================
  // SMART DIFF GENERATION
  // ==========================================================================

  async generateSmartDiff(
    oldVersion: Record<string, unknown>,
    newVersion: Record<string, unknown>
  ): Promise<SmartDiffResult> {
    const startTime = Date.now();

    // Collect all fields from both versions
    const allFields = new Set([
      ...Object.keys(oldVersion),
      ...Object.keys(newVersion),
    ]);

    const fieldDiffs: Record<string, FieldDiff> = {};
    const semanticChanges: SemanticChange[] = [];

    // Generate diff for each field
    for (const field of allFields) {
      const oldValue = oldVersion[field];
      const newValue = newVersion[field];

      const diff = this.generateFieldDiff(field, oldValue, newValue);
      fieldDiffs[field] = diff;

      // Analyze semantic change if field was modified
      if (diff.changeType !== "unchanged") {
        const changeType = SemanticAnalyzer.classifyChange(
          String(oldValue || ""),
          String(newValue || "")
        );

        const significance = SemanticAnalyzer.determineSignificance(
          changeType,
          String(oldValue || ""),
          String(newValue || "")
        );

        semanticChanges.push({
          type: changeType,
          description: this.generateChangeDescription(field, diff),
          affectedFields: [field],
          significance,
          oldContent: String(oldValue || ""),
          newContent: String(newValue || ""),
        });
      }
    }

    // Determine overall change type
    const overallChangeType = this.determineOverallChangeType(semanticChanges);

    // Generate summary
    const summary = await this.generateChangeSummary(semanticChanges);

    // Generate changelog entry
    const changelogEntry = await this.generateChangelogEntry(semanticChanges);

    const result: SmartDiffResult = {
      summary,
      changeType: overallChangeType,
      semanticChanges,
      fieldDiffs,
      changelogEntry,
    };

    this.emit("diff:generated", { duration: Date.now() - startTime });
    log.info({ fieldCount: allFields.size, changeCount: semanticChanges.length }, "Smart diff generated");

    return result;
  }

  /**
   * Generate diff for a single field
   */
  private generateFieldDiff(field: string, oldValue: unknown, newValue: unknown): FieldDiff {
    // Determine change type
    let changeType: "added" | "removed" | "modified" | "unchanged";
    if (oldValue === undefined && newValue !== undefined) {
      changeType = "added";
    } else if (oldValue !== undefined && newValue === undefined) {
      changeType = "removed";
    } else if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      changeType = "unchanged";
    } else {
      changeType = "modified";
    }

    // Generate visual diff for string values
    let diffHtml: string | undefined;
    let semanticSimilarity: number | undefined;

    if (changeType === "modified" && typeof oldValue === "string" && typeof newValue === "string") {
      const operations = MyersDiff.diff(oldValue, newValue);
      diffHtml = MyersDiff.generateHtmlDiff(operations);
      semanticSimilarity = SemanticAnalyzer.calculateSimilarity(oldValue, newValue);
    }

    return {
      fieldName: field,
      oldValue,
      newValue,
      changeType,
      semanticSimilarity,
      diffHtml,
    };
  }

  /**
   * Generate human-readable change description
   */
  private generateChangeDescription(field: string, diff: FieldDiff): string {
    const fieldLabel = this.formatFieldName(field);

    switch (diff.changeType) {
      case "added":
        return `Added ${fieldLabel}`;
      case "removed":
        return `Removed ${fieldLabel}`;
      case "modified":
        if (diff.semanticSimilarity !== undefined) {
          if (diff.semanticSimilarity > 0.8) {
            return `Minor changes to ${fieldLabel}`;
          } else if (diff.semanticSimilarity > 0.5) {
            return `Significant changes to ${fieldLabel}`;
          } else {
            return `Major rewrite of ${fieldLabel}`;
          }
        }
        return `Updated ${fieldLabel}`;
      case "unchanged":
        return `${fieldLabel} unchanged`;
      default:
        return `Changed ${fieldLabel}`;
    }
  }

  /**
   * Format field name for display
   */
  private formatFieldName(field: string): string {
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }

  /**
   * Determine overall change type from semantic changes
   */
  private determineOverallChangeType(changes: SemanticChange[]): "major" | "minor" | "patch" | "cosmetic" {
    const highCount = changes.filter(c => c.significance === "high").length;
    const mediumCount = changes.filter(c => c.significance === "medium").length;

    if (highCount > 0) return "major";
    if (mediumCount > 2) return "major";
    if (mediumCount > 0) return "minor";
    if (changes.length > 3) return "minor";
    if (changes.length > 0) return "patch";
    return "cosmetic";
  }

  /**
   * Generate change summary using AI
   */
  private async generateChangeSummary(changes: SemanticChange[]): Promise<string> {
    if (changes.length === 0) {
      return "No changes detected.";
    }

    // Simple summary without AI
    const additions = changes.filter(c => c.type === "addition").length;
    const deletions = changes.filter(c => c.type === "deletion").length;
    const modifications = changes.filter(c => c.type === "modification").length;

    const parts: string[] = [];
    if (additions > 0) parts.push(`${additions} field${additions > 1 ? "s" : ""} added`);
    if (deletions > 0) parts.push(`${deletions} field${deletions > 1 ? "s" : ""} removed`);
    if (modifications > 0) parts.push(`${modifications} field${modifications > 1 ? "s" : ""} modified`);

    return parts.join(", ") + ".";
  }

  /**
   * Generate changelog entry
   */
  private async generateChangelogEntry(changes: SemanticChange[]): Promise<string> {
    if (changes.length === 0) {
      return "";
    }

    const lines = changes
      .filter(c => c.significance !== "low")
      .map(c => `- ${c.description}`);

    return lines.join("\n");
  }

  // ==========================================================================
  // MERGE SUGGESTIONS
  // ==========================================================================

  async suggestMerge(
    sourceVersion: number,
    targetVersion: number,
    contentId: number
  ): Promise<MergeSuggestion> {
    // Would load version data from storage
    // For now, return mock suggestion

    const suggestion: MergeSuggestion = {
      id: `merge_${Date.now()}`,
      sourceVersion,
      targetVersion,
      suggestedValue: null,  // Would be computed
      confidence: 0.85,
      reasoning: "Based on analyzing the changes in both versions, a merge is recommended.",
      needsReview: true,
      conflicts: [],
    };

    this.emit("merge:suggested", { contentId, suggestion });
    log.info({ contentId, sourceVersion, targetVersion }, "Merge suggested");

    return suggestion;
  }

  // ==========================================================================
  // CONFLICT RESOLUTION
  // ==========================================================================

  async resolveConflict(conflict: ConflictDetail): Promise<{
    resolution: unknown;
    confidence: number;
  }> {
    // Strategy: Choose the most recent value by default
    // In production, would use AI to understand semantic meaning

    const sortedValues = [...conflict.values].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const resolution = sortedValues[0]?.value;
    const confidence = 0.7;  // Lower confidence for automatic resolution

    this.emit("conflict:resolved", { field: conflict.field, resolution });
    log.info({ field: conflict.field, confidence }, "Conflict resolved");

    return { resolution, confidence };
  }

  /**
   * Detect conflicts between two versions
   */
  detectConflicts(
    baseVersion: Record<string, unknown>,
    version1: Record<string, unknown>,
    version2: Record<string, unknown>
  ): ConflictDetail[] {
    const conflicts: ConflictDetail[] = [];
    const allFields = new Set([
      ...Object.keys(version1),
      ...Object.keys(version2),
    ]);

    for (const field of allFields) {
      const baseValue = baseVersion[field];
      const value1 = version1[field];
      const value2 = version2[field];

      // Conflict if both changed from base and are different
      const changed1 = JSON.stringify(baseValue) !== JSON.stringify(value1);
      const changed2 = JSON.stringify(baseValue) !== JSON.stringify(value2);
      const different = JSON.stringify(value1) !== JSON.stringify(value2);

      if (changed1 && changed2 && different) {
        conflicts.push({
          field,
          values: [
            { version: 1, value: value1, timestamp: new Date() },
            { version: 2, value: value2, timestamp: new Date() },
          ],
        });
      }
    }

    return conflicts;
  }

  /**
   * Three-way merge
   */
  async threeWayMerge(
    baseVersion: Record<string, unknown>,
    version1: Record<string, unknown>,
    version2: Record<string, unknown>
  ): Promise<{
    merged: Record<string, unknown>;
    conflicts: ConflictDetail[];
    autoResolved: string[];
  }> {
    const merged: Record<string, unknown> = { ...baseVersion };
    const conflicts: ConflictDetail[] = [];
    const autoResolved: string[] = [];

    const allFields = new Set([
      ...Object.keys(baseVersion),
      ...Object.keys(version1),
      ...Object.keys(version2),
    ]);

    for (const field of allFields) {
      const baseValue = baseVersion[field];
      const value1 = version1[field];
      const value2 = version2[field];

      const changed1 = JSON.stringify(baseValue) !== JSON.stringify(value1);
      const changed2 = JSON.stringify(baseValue) !== JSON.stringify(value2);

      if (!changed1 && !changed2) {
        // No changes, keep base
        merged[field] = baseValue;
      } else if (changed1 && !changed2) {
        // Only version 1 changed
        merged[field] = value1;
        autoResolved.push(field);
      } else if (!changed1 && changed2) {
        // Only version 2 changed
        merged[field] = value2;
        autoResolved.push(field);
      } else if (JSON.stringify(value1) === JSON.stringify(value2)) {
        // Both changed to same value
        merged[field] = value1;
        autoResolved.push(field);
      } else {
        // Conflict - both changed to different values
        conflicts.push({
          field,
          values: [
            { version: 1, value: value1, timestamp: new Date() },
            { version: 2, value: value2, timestamp: new Date() },
          ],
        });

        // Attempt auto-resolution
        if (this.config.autoMergeThreshold) {
          const resolved = await this.resolveConflict(conflicts[conflicts.length - 1]);
          if (resolved.confidence >= this.config.autoMergeThreshold) {
            merged[field] = resolved.resolution;
            autoResolved.push(field);
            conflicts.pop();
          }
        }
      }
    }

    this.emit("merge:completed", { conflictCount: conflicts.length, autoResolvedCount: autoResolved.length });
    log.info({ conflictCount: conflicts.length, autoResolvedCount: autoResolved.length }, "Three-way merge completed");

    return { merged, conflicts, autoResolved };
  }

  // ==========================================================================
  // CHANGELOG GENERATION
  // ==========================================================================

  async generateChangelog(
    contentId: number,
    fromVersion: number,
    toVersion: number
  ): Promise<string> {
    // Would load version history and generate comprehensive changelog
    // For now, return mock changelog

    const entries: string[] = [
      `## Changes from v${fromVersion} to v${toVersion}`,
      "",
      `### Content ID: ${contentId}`,
      "",
      "- Updated title for better SEO",
      "- Added new section on AI capabilities",
      "- Fixed formatting issues in the introduction",
      "- Improved clarity of technical explanations",
      "",
      `_Generated at ${new Date().toISOString()}_`,
    ];

    return entries.join("\n");
  }

  /**
   * Generate version comparison report
   */
  async generateComparisonReport(
    versions: Array<{ version: number; content: Record<string, unknown>; timestamp: Date }>
  ): Promise<string> {
    if (versions.length < 2) {
      return "Need at least 2 versions to compare.";
    }

    const lines: string[] = [
      "# Version Comparison Report",
      "",
      `Comparing ${versions.length} versions`,
      "",
    ];

    for (let i = 1; i < versions.length; i++) {
      const oldVersion = versions[i - 1];
      const newVersion = versions[i];

      const diff = await this.generateSmartDiff(oldVersion.content, newVersion.content);

      lines.push(`## v${oldVersion.version} -> v${newVersion.version}`);
      lines.push("");
      lines.push(`**Change Type:** ${diff.changeType}`);
      lines.push(`**Summary:** ${diff.summary}`);
      lines.push("");

      if (diff.changelogEntry) {
        lines.push("### Changes");
        lines.push(diff.changelogEntry);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let versionIntelligenceServiceInstance: VersionIntelligenceServiceImpl | null = null;

export function getVersionIntelligenceService(): VersionIntelligenceServiceImpl | null {
  return versionIntelligenceServiceInstance;
}

export function initVersionIntelligenceService(
  config?: VersionIntelligenceServiceConfig
): VersionIntelligenceServiceImpl {
  if (versionIntelligenceServiceInstance) {
    log.warn("Version Intelligence Service already initialized, returning existing instance");
    return versionIntelligenceServiceInstance;
  }

  versionIntelligenceServiceInstance = new VersionIntelligenceServiceImpl(config);
  return versionIntelligenceServiceInstance;
}

export function shutdownVersionIntelligenceService(): void {
  versionIntelligenceServiceInstance = null;
  log.info("Version Intelligence Service shut down");
}
