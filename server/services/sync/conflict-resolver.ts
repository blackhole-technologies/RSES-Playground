/**
 * @file conflict-resolver.ts
 * @description Conflict Resolution Engine for Multi-Site Sync
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements conflict detection and resolution strategies inspired by:
 * - Dropbox: Last-write-wins with conflicting copies
 * - Git: Three-way merge with manual resolution
 * - CouchDB: Deterministic winner selection
 * - Riak: Sibling resolution
 */

import { EventEmitter } from "events";
import {
  ConflictRecord,
  ConflictType,
  ConflictResolutionStrategy,
  ConflictingRevision,
  MergeResult,
  ChangeDocument,
  VectorClock,
  FieldValue,
} from "./types";
import {
  compareClocks,
  areConcurrent,
  getClockDepth,
  serializeVectorClock,
} from "./vector-clock";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * Conflict detector - identifies conflicts between documents
 */
export class ConflictDetector {
  /**
   * Detect if two changes are in conflict
   */
  detectConflict(
    local: ChangeDocument,
    remote: ChangeDocument
  ): ConflictType | null {
    // Same revision - no conflict
    if (local.revisionId === remote.revisionId) {
      return null;
    }

    // Check for concurrent edits using vector clocks
    if (areConcurrent(local.vectorClock, remote.vectorClock)) {
      // Both created
      if (local.changeType === "create" && remote.changeType === "create") {
        return "concurrent_edit";
      }

      // One deleted, one updated
      if (local.changeType === "delete" && remote.changeType === "update") {
        return "delete_update";
      }
      if (local.changeType === "update" && remote.changeType === "delete") {
        return "delete_update";
      }

      // Both updated concurrently
      if (local.changeType === "update" && remote.changeType === "update") {
        return "concurrent_edit";
      }
    }

    // Check for parent missing (orphan)
    if (
      remote.parentRevisions.length > 0 &&
      !remote.parentRevisions.some((p) => p === local.revisionId)
    ) {
      // Remote doesn't descend from local - might be orphan
      const comparison = compareClocks(local.vectorClock, remote.vectorClock);
      if (comparison === "concurrent") {
        return "concurrent_edit";
      }
    }

    return null;
  }

  /**
   * Detect schema mismatches between documents
   */
  detectSchemaMismatch(
    local: Record<string, unknown>,
    remote: Record<string, unknown>
  ): string[] {
    const mismatches: string[] = [];
    const localFields = new Set(Object.keys(local));
    const remoteFields = new Set(Object.keys(remote));

    // Fields only in local
    for (const field of localFields) {
      if (!remoteFields.has(field)) {
        mismatches.push(`Field "${field}" exists locally but not remotely`);
      } else {
        // Check type mismatch
        const localType = typeof local[field];
        const remoteType = typeof remote[field];
        if (localType !== remoteType) {
          mismatches.push(
            `Field "${field}" type mismatch: local=${localType}, remote=${remoteType}`
          );
        }
      }
    }

    // Fields only in remote
    for (const field of remoteFields) {
      if (!localFields.has(field)) {
        mismatches.push(`Field "${field}" exists remotely but not locally`);
      }
    }

    return mismatches;
  }
}

// =============================================================================
// CONFLICT RESOLUTION STRATEGIES
// =============================================================================

/**
 * Base resolver interface
 */
export interface ConflictResolver {
  canResolve(conflict: ConflictRecord): boolean;
  resolve(conflict: ConflictRecord): Promise<ConflictResolution>;
}

/**
 * Resolution result
 */
export interface ConflictResolution {
  success: boolean;
  winningRevision?: ConflictingRevision;
  mergedDocument?: Record<string, unknown>;
  forkedDocuments?: Array<{ id: string; data: Record<string, unknown> }>;
  strategy: ConflictResolutionStrategy;
  message: string;
}

/**
 * Last-write-wins resolver
 */
export class LastWriteWinsResolver implements ConflictResolver {
  canResolve(): boolean {
    return true;
  }

  async resolve(conflict: ConflictRecord): Promise<ConflictResolution> {
    // Sort by timestamp descending
    const sorted = [...conflict.revisions].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    const winner = sorted[0];

    return {
      success: true,
      winningRevision: winner,
      strategy: "last_write_wins",
      message: `Selected revision from site ${winner.siteId} (most recent)`,
    };
  }
}

/**
 * First-write-wins resolver
 */
export class FirstWriteWinsResolver implements ConflictResolver {
  canResolve(): boolean {
    return true;
  }

  async resolve(conflict: ConflictRecord): Promise<ConflictResolution> {
    // Sort by timestamp ascending
    const sorted = [...conflict.revisions].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const winner = sorted[0];

    return {
      success: true,
      winningRevision: winner,
      strategy: "first_write_wins",
      message: `Selected revision from site ${winner.siteId} (earliest)`,
    };
  }
}

/**
 * Primary-wins resolver
 */
export class PrimaryWinsResolver implements ConflictResolver {
  constructor(private primarySiteId: string) {}

  canResolve(): boolean {
    return true;
  }

  async resolve(conflict: ConflictRecord): Promise<ConflictResolution> {
    // Find revision from primary site
    const primaryRevision = conflict.revisions.find(
      (r) => r.siteId === this.primarySiteId
    );

    if (primaryRevision) {
      return {
        success: true,
        winningRevision: primaryRevision,
        strategy: "primary_wins",
        message: `Selected revision from primary site ${this.primarySiteId}`,
      };
    }

    // Fallback to last-write-wins if no primary revision
    const sorted = [...conflict.revisions].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    return {
      success: true,
      winningRevision: sorted[0],
      strategy: "primary_wins",
      message: `Primary site not found, fell back to most recent`,
    };
  }
}

/**
 * Fork resolver - creates conflicting copies
 */
export class ForkResolver implements ConflictResolver {
  canResolve(): boolean {
    return true;
  }

  async resolve(conflict: ConflictRecord): Promise<ConflictResolution> {
    const forkedDocuments = conflict.revisions.map((rev, index) => ({
      id: `${conflict.entityId}_conflict_${index + 1}`,
      data: {
        ...rev.data,
        _conflictInfo: {
          originalId: conflict.entityId,
          conflictId: conflict.id,
          siteId: rev.siteId,
          timestamp: rev.timestamp,
        },
      },
    }));

    return {
      success: true,
      forkedDocuments,
      strategy: "fork",
      message: `Created ${forkedDocuments.length} conflicting copies`,
    };
  }
}

/**
 * Three-way merge resolver
 */
export class MergeResolver implements ConflictResolver {
  constructor(private fieldMergers: Map<string, FieldMerger>) {}

  canResolve(conflict: ConflictRecord): boolean {
    // Can only merge concurrent_edit conflicts
    return conflict.type === "concurrent_edit";
  }

  async resolve(conflict: ConflictRecord): Promise<ConflictResolution> {
    if (conflict.revisions.length < 2) {
      return {
        success: false,
        strategy: "merge",
        message: "Need at least 2 revisions to merge",
      };
    }

    // Get base (common ancestor) - for now, use empty object
    // In production, would query revision tree for common ancestor
    const base: Record<string, unknown> = {};
    const left = conflict.revisions[0].data;
    const right = conflict.revisions[1].data;

    const mergeResult = this.threeWayMerge(base, left, right);

    if (mergeResult.success) {
      return {
        success: true,
        mergedDocument: mergeResult.merged,
        strategy: "merge",
        message: `Successfully merged documents (${mergeResult.unmergableFields.length} fields needed defaults)`,
      };
    }

    return {
      success: false,
      strategy: "merge",
      message: `Merge failed: ${mergeResult.unmergableFields.join(", ")}`,
    };
  }

  /**
   * Perform three-way merge
   */
  private threeWayMerge(
    base: Record<string, unknown>,
    left: Record<string, unknown>,
    right: Record<string, unknown>
  ): MergeResult {
    const merged: Record<string, unknown> = {};
    const unmergableFields: string[] = [];
    const fieldStrategies: Record<string, string> = {};

    // Get all fields from all versions
    const allFields = new Set([
      ...Object.keys(base),
      ...Object.keys(left),
      ...Object.keys(right),
    ]);

    for (const field of allFields) {
      const baseVal = base[field];
      const leftVal = left[field];
      const rightVal = right[field];

      // Check if field was modified
      const leftModified = !this.deepEqual(baseVal, leftVal);
      const rightModified = !this.deepEqual(baseVal, rightVal);

      if (!leftModified && !rightModified) {
        // No changes - use base
        merged[field] = baseVal;
        fieldStrategies[field] = "base";
      } else if (leftModified && !rightModified) {
        // Only left modified
        merged[field] = leftVal;
        fieldStrategies[field] = "left";
      } else if (!leftModified && rightModified) {
        // Only right modified
        merged[field] = rightVal;
        fieldStrategies[field] = "right";
      } else if (this.deepEqual(leftVal, rightVal)) {
        // Both modified identically
        merged[field] = leftVal;
        fieldStrategies[field] = "identical";
      } else {
        // Both modified differently - need field merger
        const merger = this.fieldMergers.get(field);
        if (merger) {
          const result = merger.merge(baseVal, leftVal, rightVal);
          if (result.success) {
            merged[field] = result.value;
            fieldStrategies[field] = `custom:${merger.name}`;
          } else {
            unmergableFields.push(field);
          }
        } else {
          // Default: last-write-wins for field
          merged[field] = rightVal;
          fieldStrategies[field] = "last_write_default";
        }
      }
    }

    return {
      success: unmergableFields.length === 0,
      merged,
      unmergableFields,
      fieldStrategies,
    };
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!this.deepEqual(aObj[key], bObj[key])) return false;
      }

      return true;
    }

    return false;
  }
}

/**
 * Field merger interface
 */
export interface FieldMerger {
  name: string;
  merge(
    base: unknown,
    left: unknown,
    right: unknown
  ): { success: boolean; value?: unknown };
}

/**
 * Text field merger using operational transform
 */
export class TextFieldMerger implements FieldMerger {
  name = "text_merge";

  merge(
    base: unknown,
    left: unknown,
    right: unknown
  ): { success: boolean; value?: unknown } {
    const baseStr = String(base || "");
    const leftStr = String(left || "");
    const rightStr = String(right || "");

    // Simple line-based merge
    const baseLines = baseStr.split("\n");
    const leftLines = leftStr.split("\n");
    const rightLines = rightStr.split("\n");

    const merged = this.mergeLines(baseLines, leftLines, rightLines);

    if (merged.conflicts) {
      return { success: false };
    }

    return { success: true, value: merged.result.join("\n") };
  }

  private mergeLines(
    base: string[],
    left: string[],
    right: string[]
  ): { result: string[]; conflicts: boolean } {
    // Very simplified merge - in production use a proper diff3 algorithm
    const result: string[] = [];
    let conflicts = false;

    const maxLen = Math.max(base.length, left.length, right.length);

    for (let i = 0; i < maxLen; i++) {
      const baseLine = base[i] || "";
      const leftLine = left[i] || "";
      const rightLine = right[i] || "";

      if (leftLine === rightLine) {
        result.push(leftLine);
      } else if (leftLine === baseLine) {
        result.push(rightLine);
      } else if (rightLine === baseLine) {
        result.push(leftLine);
      } else {
        // Conflict - mark it
        result.push(`<<<<<<< LEFT`);
        result.push(leftLine);
        result.push(`=======`);
        result.push(rightLine);
        result.push(`>>>>>>> RIGHT`);
        conflicts = true;
      }
    }

    return { result, conflicts };
  }
}

/**
 * Array field merger (union)
 */
export class ArrayFieldMerger implements FieldMerger {
  name = "array_union";

  merge(
    base: unknown,
    left: unknown,
    right: unknown
  ): { success: boolean; value?: unknown } {
    const baseArr = Array.isArray(base) ? base : [];
    const leftArr = Array.isArray(left) ? left : [];
    const rightArr = Array.isArray(right) ? right : [];

    // Find additions and deletions
    const leftAdded = leftArr.filter(
      (item) => !this.contains(baseArr, item)
    );
    const rightAdded = rightArr.filter(
      (item) => !this.contains(baseArr, item)
    );
    const leftRemoved = baseArr.filter(
      (item) => !this.contains(leftArr, item)
    );
    const rightRemoved = baseArr.filter(
      (item) => !this.contains(rightArr, item)
    );

    // Start with base
    let result = [...baseArr];

    // Apply additions
    result = [...result, ...leftAdded, ...rightAdded];

    // Apply removals (union of removals)
    const allRemoved = [...leftRemoved, ...rightRemoved];
    result = result.filter((item) => !this.contains(allRemoved, item));

    // Deduplicate
    result = this.dedupe(result);

    return { success: true, value: result };
  }

  private contains(arr: unknown[], item: unknown): boolean {
    return arr.some((i) => JSON.stringify(i) === JSON.stringify(item));
  }

  private dedupe(arr: unknown[]): unknown[] {
    const seen = new Set<string>();
    return arr.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/**
 * Numeric field merger (max/min/avg)
 */
export class NumericFieldMerger implements FieldMerger {
  name: string;

  constructor(private strategy: "max" | "min" | "avg" = "max") {
    this.name = `numeric_${strategy}`;
  }

  merge(
    _base: unknown,
    left: unknown,
    right: unknown
  ): { success: boolean; value?: unknown } {
    const leftNum = Number(left);
    const rightNum = Number(right);

    if (isNaN(leftNum) || isNaN(rightNum)) {
      return { success: false };
    }

    let value: number;
    switch (this.strategy) {
      case "max":
        value = Math.max(leftNum, rightNum);
        break;
      case "min":
        value = Math.min(leftNum, rightNum);
        break;
      case "avg":
        value = (leftNum + rightNum) / 2;
        break;
    }

    return { success: true, value };
  }
}

// =============================================================================
// CONFLICT RESOLUTION ENGINE
// =============================================================================

/**
 * Events emitted by the conflict resolution engine
 */
export interface ConflictResolutionEvents {
  conflict_detected: (conflict: ConflictRecord) => void;
  conflict_resolved: (conflict: ConflictRecord, resolution: ConflictResolution) => void;
  resolution_failed: (conflict: ConflictRecord, error: Error) => void;
  manual_required: (conflict: ConflictRecord) => void;
}

/**
 * Conflict resolution engine
 */
export class ConflictResolutionEngine extends EventEmitter {
  private detector: ConflictDetector;
  private resolvers: Map<ConflictResolutionStrategy, ConflictResolver>;
  private pendingConflicts: Map<string, ConflictRecord>;
  private resolvedConflicts: Map<string, ConflictRecord>;
  private defaultStrategy: ConflictResolutionStrategy;

  constructor(options: {
    primarySiteId?: string;
    defaultStrategy?: ConflictResolutionStrategy;
    fieldMergers?: Map<string, FieldMerger>;
  } = {}) {
    super();

    this.detector = new ConflictDetector();
    this.pendingConflicts = new Map();
    this.resolvedConflicts = new Map();
    this.defaultStrategy = options.defaultStrategy || "last_write_wins";

    // Initialize resolvers
    this.resolvers = new Map();
    this.resolvers.set("last_write_wins", new LastWriteWinsResolver());
    this.resolvers.set("first_write_wins", new FirstWriteWinsResolver());
    this.resolvers.set(
      "primary_wins",
      new PrimaryWinsResolver(options.primarySiteId || "primary")
    );
    this.resolvers.set("fork", new ForkResolver());
    this.resolvers.set(
      "merge",
      new MergeResolver(
        options.fieldMergers ||
          new Map([
            ["body", new TextFieldMerger()],
            ["tags", new ArrayFieldMerger()],
            ["view_count", new NumericFieldMerger("max")],
          ])
      )
    );
  }

  /**
   * Detect conflict between local and remote changes
   */
  detectConflict(
    local: ChangeDocument,
    remote: ChangeDocument
  ): ConflictRecord | null {
    const conflictType = this.detector.detectConflict(local, remote);

    if (!conflictType) {
      return null;
    }

    const conflict: ConflictRecord = {
      id: uuidv4(),
      type: conflictType,
      entityType: local.entityType,
      entityId: local.entityId,
      entityUuid: local.entityUuid,
      revisions: [
        {
          revisionId: local.revisionId,
          siteId: local.metadata.sourcesite,
          vectorClock: local.vectorClock,
          timestamp: local.metadata.timestamp,
          data: local.data || {},
          author: local.metadata.author,
        },
        {
          revisionId: remote.revisionId,
          siteId: remote.metadata.sourcesite,
          vectorClock: remote.vectorClock,
          timestamp: remote.metadata.timestamp,
          data: remote.data || {},
          author: remote.metadata.author,
        },
      ],
      strategy: this.defaultStrategy,
      status: "pending",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date(),
    };

    this.pendingConflicts.set(conflict.id, conflict);
    this.emit("conflict_detected", conflict);

    return conflict;
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    conflictId: string,
    strategy?: ConflictResolutionStrategy
  ): Promise<ConflictResolution> {
    const conflict = this.pendingConflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const resolverStrategy = strategy || conflict.strategy;
    const resolver = this.resolvers.get(resolverStrategy);

    if (!resolver) {
      throw new Error(`No resolver for strategy ${resolverStrategy}`);
    }

    if (!resolver.canResolve(conflict)) {
      // Fall back to manual
      conflict.strategy = "manual";
      this.emit("manual_required", conflict);
      return {
        success: false,
        strategy: "manual",
        message: "Automatic resolution not possible, manual review required",
      };
    }

    try {
      const resolution = await resolver.resolve(conflict);

      if (resolution.success) {
        conflict.status = "auto_resolved";
        conflict.resolvedAt = new Date();
        conflict.resolvedBy = "system";
        conflict.winningRevision = resolution.winningRevision?.revisionId;

        this.pendingConflicts.delete(conflictId);
        this.resolvedConflicts.set(conflictId, conflict);
        this.emit("conflict_resolved", conflict, resolution);
      }

      return resolution;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("resolution_failed", conflict, err);
      throw err;
    }
  }

  /**
   * Manually resolve a conflict
   */
  async resolveManually(
    conflictId: string,
    winningRevisionId: string,
    resolvedBy: string
  ): Promise<ConflictResolution> {
    const conflict = this.pendingConflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const winningRevision = conflict.revisions.find(
      (r) => r.revisionId === winningRevisionId
    );

    if (!winningRevision) {
      throw new Error(`Revision ${winningRevisionId} not found in conflict`);
    }

    conflict.status = "manually_resolved";
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = resolvedBy;
    conflict.winningRevision = winningRevisionId;

    this.pendingConflicts.delete(conflictId);
    this.resolvedConflicts.set(conflictId, conflict);

    const resolution: ConflictResolution = {
      success: true,
      winningRevision,
      strategy: "manual",
      message: `Manually resolved by ${resolvedBy}`,
    };

    this.emit("conflict_resolved", conflict, resolution);
    return resolution;
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): ConflictRecord[] {
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * Get resolved conflicts
   */
  getResolvedConflicts(): ConflictRecord[] {
    return Array.from(this.resolvedConflicts.values());
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId: string): ConflictRecord | undefined {
    return (
      this.pendingConflicts.get(conflictId) ||
      this.resolvedConflicts.get(conflictId)
    );
  }

  /**
   * Add a custom resolver
   */
  addResolver(
    strategy: ConflictResolutionStrategy,
    resolver: ConflictResolver
  ): void {
    this.resolvers.set(strategy, resolver);
  }

  /**
   * Set default resolution strategy
   */
  setDefaultStrategy(strategy: ConflictResolutionStrategy): void {
    this.defaultStrategy = strategy;
  }

  /**
   * Auto-resolve all pending conflicts with default strategy
   */
  async autoResolveAll(): Promise<Map<string, ConflictResolution>> {
    const results = new Map<string, ConflictResolution>();

    for (const [conflictId, _conflict] of this.pendingConflicts) {
      try {
        const resolution = await this.resolveConflict(conflictId);
        results.set(conflictId, resolution);
      } catch (error) {
        results.set(conflictId, {
          success: false,
          strategy: this.defaultStrategy,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ConflictDetector,
  LastWriteWinsResolver,
  FirstWriteWinsResolver,
  PrimaryWinsResolver,
  ForkResolver,
  MergeResolver,
  TextFieldMerger,
  ArrayFieldMerger,
  NumericFieldMerger,
};
