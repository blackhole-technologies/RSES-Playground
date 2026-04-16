/**
 * @file vector-clock.ts
 * @description Vector Clock Implementation for Distributed Sync
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements vector clocks for causality tracking and conflict detection
 * in multi-site synchronization. Inspired by:
 * - Dynamo: Version vectors
 * - CouchDB: Revision trees
 * - Riak: Dotted version vectors
 */

import { VectorClock, ChangeSequence } from "./types";
import { createHash } from "crypto";

// =============================================================================
// VECTOR CLOCK IMPLEMENTATION
// =============================================================================

/**
 * Create a new empty vector clock
 */
export function createVectorClock(): VectorClock {
  return { clocks: {} };
}

/**
 * Clone a vector clock
 */
export function cloneVectorClock(vc: VectorClock): VectorClock {
  return { clocks: { ...vc.clocks } };
}

/**
 * Increment the clock for a specific site
 */
export function incrementClock(vc: VectorClock, siteId: string): VectorClock {
  const newClock = cloneVectorClock(vc);
  newClock.clocks[siteId] = (newClock.clocks[siteId] || 0) + 1;
  return newClock;
}

/**
 * Merge two vector clocks (take max of each component)
 */
export function mergeClock(vc1: VectorClock, vc2: VectorClock): VectorClock {
  const merged: VectorClock = { clocks: {} };
  const allSites = new Set([...Object.keys(vc1.clocks), ...Object.keys(vc2.clocks)]);

  for (const siteId of allSites) {
    merged.clocks[siteId] = Math.max(
      vc1.clocks[siteId] || 0,
      vc2.clocks[siteId] || 0
    );
  }

  return merged;
}

/**
 * Compare two vector clocks
 * Returns:
 * - "before": vc1 happened before vc2
 * - "after": vc1 happened after vc2
 * - "concurrent": vc1 and vc2 are concurrent (conflict)
 * - "equal": vc1 and vc2 are identical
 */
export function compareClocks(
  vc1: VectorClock,
  vc2: VectorClock
): "before" | "after" | "concurrent" | "equal" {
  let vc1Greater = false;
  let vc2Greater = false;

  const allSites = new Set([...Object.keys(vc1.clocks), ...Object.keys(vc2.clocks)]);

  for (const siteId of allSites) {
    const t1 = vc1.clocks[siteId] || 0;
    const t2 = vc2.clocks[siteId] || 0;

    if (t1 > t2) {
      vc1Greater = true;
    } else if (t2 > t1) {
      vc2Greater = true;
    }
  }

  if (!vc1Greater && !vc2Greater) {
    return "equal";
  } else if (vc1Greater && !vc2Greater) {
    return "after";
  } else if (!vc1Greater && vc2Greater) {
    return "before";
  } else {
    return "concurrent";
  }
}

/**
 * Check if vc1 descends from vc2 (vc2 happened before vc1)
 */
export function descendsFrom(vc1: VectorClock, vc2: VectorClock): boolean {
  const comparison = compareClocks(vc1, vc2);
  return comparison === "after" || comparison === "equal";
}

/**
 * Check if two vector clocks are concurrent (conflict)
 */
export function areConcurrent(vc1: VectorClock, vc2: VectorClock): boolean {
  return compareClocks(vc1, vc2) === "concurrent";
}

/**
 * Get the "depth" of a vector clock (sum of all components)
 * Useful for ordering when clocks are concurrent
 */
export function getClockDepth(vc: VectorClock): number {
  return Object.values(vc.clocks).reduce((sum, val) => sum + val, 0);
}

/**
 * Serialize vector clock to string
 */
export function serializeVectorClock(vc: VectorClock): string {
  const entries = Object.entries(vc.clocks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  return entries.join(",");
}

/**
 * Parse vector clock from string
 */
export function parseVectorClock(str: string): VectorClock {
  if (!str) {
    return createVectorClock();
  }

  const clocks: Record<string, number> = {};
  const parts = str.split(",");

  for (const part of parts) {
    const [siteId, value] = part.split(":");
    if (siteId && value) {
      clocks[siteId] = parseInt(value, 10);
    }
  }

  return { clocks };
}

// =============================================================================
// CHANGE SEQUENCE IMPLEMENTATION
// =============================================================================

/**
 * Create a change sequence
 */
export function createChangeSequence(
  siteId: string,
  sequence: number,
  timestamp?: number
): ChangeSequence {
  const ts = timestamp || Date.now();
  return {
    siteId,
    timestamp: ts,
    sequence,
    toString() {
      return `${siteId}-${ts}-${sequence}`;
    },
  };
}

/**
 * Parse a change sequence from string
 */
export function parseChangeSequence(str: string): ChangeSequence | null {
  const parts = str.split("-");
  if (parts.length < 3) {
    return null;
  }

  const sequence = parseInt(parts.pop()!, 10);
  const timestamp = parseInt(parts.pop()!, 10);
  const siteId = parts.join("-"); // Site ID might contain dashes

  if (isNaN(sequence) || isNaN(timestamp)) {
    return null;
  }

  return createChangeSequence(siteId, sequence, timestamp);
}

/**
 * Compare two change sequences for ordering
 */
export function compareSequences(seq1: ChangeSequence, seq2: ChangeSequence): number {
  // First compare by timestamp
  if (seq1.timestamp !== seq2.timestamp) {
    return seq1.timestamp - seq2.timestamp;
  }

  // Then by sequence number
  if (seq1.sequence !== seq2.sequence) {
    return seq1.sequence - seq2.sequence;
  }

  // Finally by site ID for deterministic ordering
  return seq1.siteId.localeCompare(seq2.siteId);
}

// =============================================================================
// REVISION ID GENERATION
// =============================================================================

/**
 * Generate a revision ID from document content
 * Uses content hash + vector clock for uniqueness
 */
export function generateRevisionId(
  content: Record<string, unknown>,
  vectorClock: VectorClock
): string {
  const contentHash = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex")
    .substring(0, 16);

  const clockHash = createHash("sha256")
    .update(serializeVectorClock(vectorClock))
    .digest("hex")
    .substring(0, 8);

  const depth = getClockDepth(vectorClock);

  return `${depth}-${clockHash}${contentHash}`;
}

/**
 * Parse revision ID to get depth
 */
export function getRevisionDepth(revisionId: string): number {
  const parts = revisionId.split("-");
  return parseInt(parts[0], 10) || 0;
}

/**
 * Check if rev1 is an ancestor of rev2 based on depth
 * (Heuristic - actual ancestry requires revision tree)
 */
export function isAncestor(rev1: string, rev2: string): boolean {
  return getRevisionDepth(rev1) < getRevisionDepth(rev2);
}

// =============================================================================
// REVISION TREE
// =============================================================================

/**
 * Node in a revision tree
 */
export interface RevisionNode {
  revisionId: string;
  parentId: string | null;
  vectorClock: VectorClock;
  deleted: boolean;
  data?: Record<string, unknown>;
  children: RevisionNode[];
}

/**
 * Revision tree for tracking document history
 */
export class RevisionTree {
  private root: RevisionNode | null = null;
  private nodeMap: Map<string, RevisionNode> = new Map();
  private leaves: Set<string> = new Set();

  /**
   * Add a revision to the tree
   */
  addRevision(
    revisionId: string,
    parentId: string | null,
    vectorClock: VectorClock,
    deleted: boolean = false,
    data?: Record<string, unknown>
  ): void {
    const node: RevisionNode = {
      revisionId,
      parentId,
      vectorClock,
      deleted,
      data,
      children: [],
    };

    this.nodeMap.set(revisionId, node);

    if (parentId === null) {
      this.root = node;
    } else {
      const parent = this.nodeMap.get(parentId);
      if (parent) {
        parent.children.push(node);
        this.leaves.delete(parentId);
      }
    }

    this.leaves.add(revisionId);
  }

  /**
   * Get all leaf revisions (potential conflicts)
   */
  getLeaves(): string[] {
    return Array.from(this.leaves);
  }

  /**
   * Get the winning revision (deterministic)
   */
  getWinningRevision(): string | null {
    if (this.leaves.size === 0) {
      return null;
    }

    // Sort leaves by depth (descending) then by revision ID
    const sortedLeaves = Array.from(this.leaves).sort((a, b) => {
      const depthA = getRevisionDepth(a);
      const depthB = getRevisionDepth(b);
      if (depthA !== depthB) {
        return depthB - depthA;
      }
      return a.localeCompare(b);
    });

    // Filter out deleted leaves
    const nonDeletedLeaves = sortedLeaves.filter(
      (rev) => !this.nodeMap.get(rev)?.deleted
    );

    return nonDeletedLeaves[0] || sortedLeaves[0];
  }

  /**
   * Check if there are conflicts (multiple non-deleted leaves)
   */
  hasConflicts(): boolean {
    const nonDeletedLeaves = Array.from(this.leaves).filter(
      (rev) => !this.nodeMap.get(rev)?.deleted
    );
    return nonDeletedLeaves.length > 1;
  }

  /**
   * Get conflicting revisions
   */
  getConflictingRevisions(): RevisionNode[] {
    if (!this.hasConflicts()) {
      return [];
    }

    return Array.from(this.leaves)
      .filter((rev) => !this.nodeMap.get(rev)?.deleted)
      .map((rev) => this.nodeMap.get(rev)!)
      .filter(Boolean);
  }

  /**
   * Get the path from root to a revision
   */
  getRevisionPath(revisionId: string): string[] {
    const path: string[] = [];
    // Map.get returns T | undefined, not T | null. Use undefined as the
    // sentinel and the while loop reads cleanly.
    let current = this.nodeMap.get(revisionId);

    while (current) {
      path.unshift(current.revisionId);
      current = current.parentId ? this.nodeMap.get(current.parentId) : undefined;
    }

    return path;
  }

  /**
   * Find the common ancestor of two revisions
   */
  findCommonAncestor(rev1: string, rev2: string): string | null {
    const path1 = new Set(this.getRevisionPath(rev1));
    const path2 = this.getRevisionPath(rev2);

    for (let i = path2.length - 1; i >= 0; i--) {
      if (path1.has(path2[i])) {
        return path2[i];
      }
    }

    return null;
  }

  /**
   * Prune old revisions (keep only recent history)
   */
  prune(keepDepth: number): void {
    const winningRev = this.getWinningRevision();
    if (!winningRev) return;

    const winningDepth = getRevisionDepth(winningRev);
    const cutoffDepth = winningDepth - keepDepth;

    // Collect revisions to remove
    const toRemove: string[] = [];
    for (const [revId, node] of this.nodeMap) {
      if (getRevisionDepth(revId) < cutoffDepth && !this.leaves.has(revId)) {
        toRemove.push(revId);
      }
    }

    // Remove old revisions
    for (const revId of toRemove) {
      this.nodeMap.delete(revId);
    }
  }

  /**
   * Serialize tree to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      root: this.root?.revisionId || null,
      leaves: Array.from(this.leaves),
      nodes: Array.from(this.nodeMap.entries()).map(([id, node]) => ({
        id,
        parentId: node.parentId,
        vectorClock: serializeVectorClock(node.vectorClock),
        deleted: node.deleted,
      })),
    };
  }

  /**
   * Deserialize tree from JSON
   */
  static fromJSON(json: Record<string, unknown>): RevisionTree {
    const tree = new RevisionTree();
    const nodes = json.nodes as Array<{
      id: string;
      parentId: string | null;
      vectorClock: string;
      deleted: boolean;
    }>;

    // Sort by depth to ensure parents are added first
    nodes.sort((a, b) => getRevisionDepth(a.id) - getRevisionDepth(b.id));

    for (const node of nodes) {
      tree.addRevision(
        node.id,
        node.parentId,
        parseVectorClock(node.vectorClock),
        node.deleted
      );
    }

    return tree;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================
// Every function above is already inline-exported. A trailing
// `export { … }` block here would produce TS2323 duplicate-export errors.
// Removed 2026-04-14 (cleanup of pre-existing tech debt).
