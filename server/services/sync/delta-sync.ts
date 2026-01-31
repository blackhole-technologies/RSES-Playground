/**
 * @file delta-sync.ts
 * @description Delta Synchronization Engine (rsync-inspired)
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements efficient delta synchronization for assets inspired by:
 * - rsync: Rolling checksums and block-level diff
 * - bsdiff: Binary delta encoding
 * - zsync: HTTP-based delta sync
 */

import { createHash } from "crypto";
import {
  AssetEntry,
  AssetDelta,
  AssetManifest,
  BlockChecksum,
  DeltaInstruction,
  DeltaPatch,
  DeltaOperation,
} from "./types";
import { EventEmitter } from "events";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_BLOCK_SIZE = 4096; // 4KB blocks
const ROLLING_WINDOW = 16; // Rolling hash window
const MAX_DELTA_RATIO = 0.8; // If delta > 80% of original, send full file

// =============================================================================
// ROLLING CHECKSUM (ADLER-32 VARIANT)
// =============================================================================

/**
 * Rolling checksum calculator (similar to rsync's rolling hash)
 */
export class RollingChecksum {
  private a: number = 1;
  private b: number = 0;
  private window: number[] = [];
  private blockSize: number;

  constructor(blockSize: number = DEFAULT_BLOCK_SIZE) {
    this.blockSize = blockSize;
  }

  /**
   * Calculate initial checksum for a block
   */
  calculate(data: Buffer): number {
    this.reset();

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      this.a = (this.a + byte) % 65536;
      this.b = (this.b + this.a) % 65536;
      this.window.push(byte);
    }

    return this.getChecksum();
  }

  /**
   * Roll the checksum forward by one byte
   */
  roll(oldByte: number, newByte: number): number {
    this.a = (this.a - oldByte + newByte) % 65536;
    this.b = (this.b - this.blockSize * oldByte + this.a - 1) % 65536;

    if (this.a < 0) this.a += 65536;
    if (this.b < 0) this.b += 65536;

    this.window.shift();
    this.window.push(newByte);

    return this.getChecksum();
  }

  /**
   * Get current checksum value
   */
  getChecksum(): number {
    return (this.b << 16) | this.a;
  }

  /**
   * Reset the calculator
   */
  reset(): void {
    this.a = 1;
    this.b = 0;
    this.window = [];
  }
}

/**
 * Calculate strong checksum (MD5) for a block
 */
export function calculateStrongChecksum(data: Buffer): string {
  return createHash("md5").update(data).digest("hex");
}

/**
 * Calculate SHA-256 checksum for integrity
 */
export function calculateSHA256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// =============================================================================
// SIGNATURE GENERATOR
// =============================================================================

/**
 * Generate block signatures for a file (rsync-style)
 */
export function generateBlockSignatures(
  data: Buffer,
  blockSize: number = DEFAULT_BLOCK_SIZE
): BlockChecksum[] {
  const signatures: BlockChecksum[] = [];
  const roller = new RollingChecksum(blockSize);

  for (let offset = 0; offset < data.length; offset += blockSize) {
    const end = Math.min(offset + blockSize, data.length);
    const block = data.subarray(offset, end);

    signatures.push({
      index: Math.floor(offset / blockSize),
      offset,
      size: block.length,
      weak: roller.calculate(block),
      strong: calculateStrongChecksum(block),
    });
  }

  return signatures;
}

/**
 * Build signature lookup table for fast matching
 */
export function buildSignatureLookup(
  signatures: BlockChecksum[]
): Map<number, BlockChecksum[]> {
  const lookup = new Map<number, BlockChecksum[]>();

  for (const sig of signatures) {
    const existing = lookup.get(sig.weak) || [];
    existing.push(sig);
    lookup.set(sig.weak, existing);
  }

  return lookup;
}

// =============================================================================
// DELTA GENERATOR
// =============================================================================

/**
 * Generate delta between old and new versions of data
 */
export function generateDelta(
  oldData: Buffer,
  newData: Buffer,
  blockSize: number = DEFAULT_BLOCK_SIZE
): AssetDelta {
  const oldSignatures = generateBlockSignatures(oldData, blockSize);
  const lookup = buildSignatureLookup(oldSignatures);
  const roller = new RollingChecksum(blockSize);

  const instructions: DeltaInstruction[] = [];
  let literalBuffer: number[] = [];
  let position = 0;

  // Helper to flush literal buffer
  const flushLiteral = () => {
    if (literalBuffer.length > 0) {
      instructions.push({
        type: "literal",
        data: Buffer.from(literalBuffer),
      });
      literalBuffer = [];
    }
  };

  // Scan through new data looking for matching blocks
  while (position < newData.length) {
    const remaining = newData.length - position;

    if (remaining >= blockSize) {
      const block = newData.subarray(position, position + blockSize);
      const weak = roller.calculate(block);

      // Check for weak match
      const candidates = lookup.get(weak);
      if (candidates) {
        // Verify with strong checksum
        const strong = calculateStrongChecksum(block);
        const match = candidates.find((c) => c.strong === strong);

        if (match) {
          // Found a match - flush literal and add copy instruction
          flushLiteral();
          instructions.push({
            type: "copy",
            sourceOffset: match.offset,
            length: match.size,
          });
          position += match.size;
          continue;
        }
      }
    }

    // No match - add byte to literal buffer
    literalBuffer.push(newData[position]);
    position++;

    // Roll the checksum if we have enough data
    if (position < newData.length && literalBuffer.length >= blockSize) {
      const oldByte = literalBuffer[literalBuffer.length - blockSize];
      const newByte = newData[position];
      roller.roll(oldByte, newByte);
    }
  }

  // Flush remaining literal
  flushLiteral();

  // Calculate delta size
  let deltaSize = 0;
  for (const inst of instructions) {
    if (inst.type === "literal") {
      deltaSize += inst.data.length + 5; // data + header
    } else {
      deltaSize += 12; // offset + length
    }
  }

  return {
    assetId: "",
    sourceRevision: calculateSHA256(oldData),
    targetRevision: calculateSHA256(newData),
    instructions,
    deltaSize,
    compressionRatio: deltaSize / newData.length,
  };
}

/**
 * Apply delta to reconstruct new data from old
 */
export function applyDelta(oldData: Buffer, delta: AssetDelta): Buffer {
  const chunks: Buffer[] = [];

  for (const instruction of delta.instructions) {
    if (instruction.type === "copy") {
      const chunk = oldData.subarray(
        instruction.sourceOffset,
        instruction.sourceOffset + instruction.length
      );
      chunks.push(chunk);
    } else {
      chunks.push(instruction.data);
    }
  }

  const result = Buffer.concat(chunks);

  // Verify result
  const resultChecksum = calculateSHA256(result);
  if (resultChecksum !== delta.targetRevision) {
    throw new Error(
      `Delta application failed: checksum mismatch. Expected ${delta.targetRevision}, got ${resultChecksum}`
    );
  }

  return result;
}

// =============================================================================
// JSON DELTA PATCHES (for content documents)
// =============================================================================

/**
 * Generate JSON patch for document changes
 */
export function generateJsonPatch(
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
  path: string = ""
): DeltaOperation[] {
  const operations: DeltaOperation[] = [];

  // Get all keys from both documents
  const oldKeys = new Set(Object.keys(oldDoc));
  const newKeys = new Set(Object.keys(newDoc));

  // Check for removed keys
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      operations.push({
        type: "unset",
        path: path ? `${path}.${key}` : key,
      });
    }
  }

  // Check for added/modified keys
  for (const key of newKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const oldVal = oldDoc[key];
    const newVal = newDoc[key];

    if (!oldKeys.has(key)) {
      // New key
      operations.push({
        type: "set",
        path: fullPath,
        value: newVal,
      });
    } else if (!deepEqual(oldVal, newVal)) {
      // Modified key
      if (
        typeof oldVal === "object" &&
        typeof newVal === "object" &&
        oldVal !== null &&
        newVal !== null &&
        !Array.isArray(oldVal) &&
        !Array.isArray(newVal)
      ) {
        // Recurse into nested objects
        operations.push(
          ...generateJsonPatch(
            oldVal as Record<string, unknown>,
            newVal as Record<string, unknown>,
            fullPath
          )
        );
      } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
        // Handle array changes
        operations.push(...generateArrayPatch(oldVal, newVal, fullPath));
      } else {
        // Simple replacement
        operations.push({
          type: "set",
          path: fullPath,
          value: newVal,
        });
      }
    }
  }

  return operations;
}

/**
 * Generate patch for array changes
 */
function generateArrayPatch(
  oldArr: unknown[],
  newArr: unknown[],
  path: string
): DeltaOperation[] {
  const operations: DeltaOperation[] = [];

  // Find items only in old (removed)
  const oldSerializedSet = new Set(oldArr.map((item) => JSON.stringify(item)));
  const newSerializedSet = new Set(newArr.map((item) => JSON.stringify(item)));

  // Items to remove (reverse order to preserve indices)
  const toRemove: number[] = [];
  oldArr.forEach((item, index) => {
    const serialized = JSON.stringify(item);
    if (!newSerializedSet.has(serialized)) {
      toRemove.push(index);
    }
  });

  for (const index of toRemove.reverse()) {
    operations.push({
      type: "arrayRemove",
      path,
      index,
    });
  }

  // Items to add
  for (const item of newArr) {
    const serialized = JSON.stringify(item);
    if (!oldSerializedSet.has(serialized)) {
      operations.push({
        type: "arrayPush",
        path,
        value: item,
      });
    }
  }

  return operations;
}

/**
 * Apply JSON patch to document
 */
export function applyJsonPatch(
  doc: Record<string, unknown>,
  operations: DeltaOperation[]
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(doc)); // Deep clone

  for (const op of operations) {
    applyOperation(result, op);
  }

  return result;
}

/**
 * Apply a single operation to a document
 */
function applyOperation(
  doc: Record<string, unknown>,
  op: DeltaOperation
): void {
  if (op.type === "copy" || op.type === "insert") {
    // These are for binary data, not JSON
    return;
  }

  const pathParts = op.path.split(".");
  const lastKey = pathParts.pop()!;
  let current: Record<string, unknown> = doc;

  // Navigate to parent
  for (const part of pathParts) {
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  switch (op.type) {
    case "set":
      current[lastKey] = op.value;
      break;

    case "unset":
      delete current[lastKey];
      break;

    case "arrayPush":
      if (!Array.isArray(current[lastKey])) {
        current[lastKey] = [];
      }
      (current[lastKey] as unknown[]).push(op.value);
      break;

    case "arrayRemove":
      if (Array.isArray(current[lastKey])) {
        (current[lastKey] as unknown[]).splice(op.index, 1);
      }
      break;
  }
}

/**
 * Deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
}

// =============================================================================
// DELTA SYNC SERVICE
// =============================================================================

/**
 * Events for delta sync
 */
export interface DeltaSyncEvents {
  delta_generated: (delta: AssetDelta) => void;
  delta_applied: (assetId: string, newChecksum: string) => void;
  full_transfer_required: (assetId: string, reason: string) => void;
}

/**
 * Delta sync service for efficient asset synchronization
 */
export class DeltaSyncService extends EventEmitter {
  private blockSize: number;
  private maxDeltaRatio: number;
  private signatureCache: Map<string, BlockChecksum[]>;

  constructor(options: {
    blockSize?: number;
    maxDeltaRatio?: number;
  } = {}) {
    super();

    this.blockSize = options.blockSize || DEFAULT_BLOCK_SIZE;
    this.maxDeltaRatio = options.maxDeltaRatio || MAX_DELTA_RATIO;
    this.signatureCache = new Map();
  }

  /**
   * Generate signatures for an asset (to be sent to source)
   */
  generateSignatures(assetId: string, data: Buffer): BlockChecksum[] {
    const signatures = generateBlockSignatures(data, this.blockSize);
    this.signatureCache.set(assetId, signatures);
    return signatures;
  }

  /**
   * Generate delta from signatures (at source)
   */
  generateDeltaFromSignatures(
    assetId: string,
    newData: Buffer,
    remoteSignatures: BlockChecksum[]
  ): AssetDelta | null {
    const lookup = buildSignatureLookup(remoteSignatures);
    const roller = new RollingChecksum(this.blockSize);

    const instructions: DeltaInstruction[] = [];
    let literalBuffer: number[] = [];
    let position = 0;

    const flushLiteral = () => {
      if (literalBuffer.length > 0) {
        instructions.push({
          type: "literal",
          data: Buffer.from(literalBuffer),
        });
        literalBuffer = [];
      }
    };

    while (position < newData.length) {
      const remaining = newData.length - position;

      if (remaining >= this.blockSize) {
        const block = newData.subarray(position, position + this.blockSize);
        const weak = roller.calculate(block);

        const candidates = lookup.get(weak);
        if (candidates) {
          const strong = calculateStrongChecksum(block);
          const match = candidates.find((c) => c.strong === strong);

          if (match) {
            flushLiteral();
            instructions.push({
              type: "copy",
              sourceOffset: match.offset,
              length: match.size,
            });
            position += match.size;
            continue;
          }
        }
      }

      literalBuffer.push(newData[position]);
      position++;
    }

    flushLiteral();

    // Calculate delta size
    let deltaSize = 0;
    for (const inst of instructions) {
      if (inst.type === "literal") {
        deltaSize += inst.data.length + 5;
      } else {
        deltaSize += 12;
      }
    }

    // Check if delta is efficient enough
    if (deltaSize / newData.length > this.maxDeltaRatio) {
      this.emit(
        "full_transfer_required",
        assetId,
        `Delta ratio ${(deltaSize / newData.length).toFixed(2)} exceeds threshold`
      );
      return null;
    }

    const delta: AssetDelta = {
      assetId,
      sourceRevision: "", // Will be filled by caller
      targetRevision: calculateSHA256(newData),
      instructions,
      deltaSize,
      compressionRatio: deltaSize / newData.length,
    };

    this.emit("delta_generated", delta);
    return delta;
  }

  /**
   * Apply delta to local asset
   */
  applyDelta(assetId: string, localData: Buffer, delta: AssetDelta): Buffer {
    const result = applyDelta(localData, delta);
    this.emit("delta_applied", assetId, delta.targetRevision);
    return result;
  }

  /**
   * Clear signature cache
   */
  clearCache(): void {
    this.signatureCache.clear();
  }

  /**
   * Get cached signatures
   */
  getCachedSignatures(assetId: string): BlockChecksum[] | undefined {
    return this.signatureCache.get(assetId);
  }

  /**
   * Calculate transfer savings
   */
  calculateSavings(delta: AssetDelta, originalSize: number): {
    bytesSaved: number;
    percentSaved: number;
    transferSize: number;
  } {
    const bytesSaved = originalSize - delta.deltaSize;
    const percentSaved = (bytesSaved / originalSize) * 100;

    return {
      bytesSaved,
      percentSaved,
      transferSize: delta.deltaSize,
    };
  }
}

// =============================================================================
// MANIFEST DIFF
// =============================================================================

/**
 * Diff between two asset manifests
 */
export interface ManifestDiff {
  added: AssetEntry[];
  modified: AssetEntry[];
  deleted: AssetEntry[];
  unchanged: AssetEntry[];
}

/**
 * Compare two asset manifests
 */
export function diffManifests(
  local: AssetManifest,
  remote: AssetManifest
): ManifestDiff {
  const localMap = new Map(local.assets.map((a) => [a.uuid, a]));
  const remoteMap = new Map(remote.assets.map((a) => [a.uuid, a]));

  const added: AssetEntry[] = [];
  const modified: AssetEntry[] = [];
  const deleted: AssetEntry[] = [];
  const unchanged: AssetEntry[] = [];

  // Find added and modified
  for (const [uuid, remoteAsset] of remoteMap) {
    const localAsset = localMap.get(uuid);

    if (!localAsset) {
      added.push(remoteAsset);
    } else if (localAsset.strongChecksum !== remoteAsset.strongChecksum) {
      modified.push(remoteAsset);
    } else {
      unchanged.push(remoteAsset);
    }
  }

  // Find deleted
  for (const [uuid, localAsset] of localMap) {
    if (!remoteMap.has(uuid)) {
      deleted.push(localAsset);
    }
  }

  return { added, modified, deleted, unchanged };
}

/**
 * Calculate sync requirements from manifest diff
 */
export function calculateSyncRequirements(diff: ManifestDiff): {
  bytesToTransfer: number;
  assetsToSync: number;
  estimatedTime: (bandwidth: number) => number;
} {
  const bytesToTransfer =
    diff.added.reduce((sum, a) => sum + a.size, 0) +
    diff.modified.reduce((sum, a) => sum + a.size * 0.3, 0); // Estimate 30% for modified

  const assetsToSync = diff.added.length + diff.modified.length;

  return {
    bytesToTransfer,
    assetsToSync,
    estimatedTime: (bandwidth: number) => bytesToTransfer / bandwidth,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  RollingChecksum,
  generateBlockSignatures,
  buildSignatureLookup,
  generateDelta,
  applyDelta,
  generateJsonPatch,
  applyJsonPatch,
  diffManifests,
  calculateSyncRequirements,
  DEFAULT_BLOCK_SIZE,
};
