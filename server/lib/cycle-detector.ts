/**
 * @file cycle-detector.ts
 * @description Detects cycles in compound set definitions using topological sort.
 *              Prevents infinite recursion during set evaluation.
 * @phase Phase 2 - Core Engine Improvements
 * @author SGT (Set-Graph Theorist Agent)
 * @validated ARC (Project Architect Agent)
 * @created 2026-01-31
 *
 * @complexity O(V + E) where V = number of sets, E = number of dependencies
 * @termination Guaranteed - uses standard topological sort algorithm
 */

/**
 * Extracts set references from a compound expression.
 * Finds all $identifier patterns in the expression.
 *
 * @param expr - Compound expression like "$a & $b | $c"
 * @returns Array of referenced set names (without $ prefix)
 *
 * @example
 * extractSetReferences("$tools & $claude") // ["tools", "claude"]
 * extractSetReferences("$a | ($b & !$c)") // ["a", "b", "c"]
 */
export function extractSetReferences(expr: string): string[] {
  const refs: string[] = [];
  const regex = /\$([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = regex.exec(expr)) !== null) {
    const name = match[1];
    if (!refs.includes(name)) {
      refs.push(name);
    }
  }

  return refs;
}

/**
 * Builds a dependency graph from compound set definitions.
 *
 * @param compound - Map of set name to expression
 * @returns Adjacency list representation of the dependency graph
 *
 * @example
 * buildDependencyGraph({ "ab": "$a & $b", "abc": "$ab & $c" })
 * // Returns: { "ab": ["a", "b"], "abc": ["ab", "c"] }
 */
export function buildDependencyGraph(
  compound: Record<string, string>
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const [name, expr] of Object.entries(compound)) {
    const deps = extractSetReferences(expr);
    graph.set(name, deps);
  }

  return graph;
}

/**
 * Result of cycle detection.
 */
export interface CycleDetectionResult {
  /** Whether cycles were detected */
  hasCycle: boolean;
  /** The cycle path if found, empty otherwise */
  cyclePath: string[];
  /** Topologically sorted order of sets (if no cycle) */
  sortedOrder: string[];
}

/**
 * Detects cycles in compound set definitions using DFS.
 * Returns the cycle path if found.
 *
 * @param compound - Map of compound set name to expression
 * @returns CycleDetectionResult with cycle info
 *
 * @example
 * // No cycle
 * detectCycles({ "ab": "$a & $b" })
 * // { hasCycle: false, cyclePath: [], sortedOrder: ["ab"] }
 *
 * // Direct cycle: a depends on a
 * detectCycles({ "a": "$a & $b" })
 * // { hasCycle: true, cyclePath: ["a", "a"], sortedOrder: [] }
 *
 * // Indirect cycle: a -> b -> a
 * detectCycles({ "a": "$b", "b": "$a" })
 * // { hasCycle: true, cyclePath: ["a", "b", "a"], sortedOrder: [] }
 */
export function detectCycles(compound: Record<string, string>): CycleDetectionResult {
  const graph = buildDependencyGraph(compound);
  const compoundNames = new Set(Object.keys(compound));

  // Track visited and currently in recursion stack
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const sortedOrder: string[] = [];

  // For cycle path reconstruction
  const parent = new Map<string, string>();

  /**
   * DFS helper that returns cycle path if found
   */
  function dfs(node: string, path: string[]): string[] | null {
    if (inStack.has(node)) {
      // Found a cycle - reconstruct the cycle path
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }

    if (visited.has(node)) {
      return null;
    }

    // Only process nodes that are compound sets
    if (!compoundNames.has(node)) {
      return null;
    }

    visited.add(node);
    inStack.add(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      // Only follow edges to other compound sets (cycles can only occur within compound sets)
      if (compoundNames.has(dep)) {
        const cyclePath = dfs(dep, [...path, node]);
        if (cyclePath) {
          return cyclePath;
        }
      }
    }

    inStack.delete(node);
    sortedOrder.push(node);
    return null;
  }

  // Run DFS from each compound set
  for (const name of compoundNames) {
    if (!visited.has(name)) {
      const cyclePath = dfs(name, []);
      if (cyclePath) {
        return {
          hasCycle: true,
          cyclePath,
          sortedOrder: [],
        };
      }
    }
  }

  // The sortedOrder is already in correct evaluation order:
  // Sets with no compound dependencies are added first (when their DFS completes),
  // then sets that depend on them are added after.
  // No reversal needed because we only follow edges to other compound sets,
  // so a compound set is added to sortedOrder only after processing,
  // and sets it depends on (if compound) are processed first.

  return {
    hasCycle: false,
    cyclePath: [],
    sortedOrder,
  };
}

/**
 * Validates compound set definitions and returns detailed error if cyclic.
 *
 * @param compound - Map of compound set name to expression
 * @returns Validation result with error details
 */
export function validateCompoundSets(compound: Record<string, string>): {
  valid: boolean;
  error?: {
    message: string;
    cycle: string[];
  };
  evaluationOrder?: string[];
} {
  if (Object.keys(compound).length === 0) {
    return { valid: true, evaluationOrder: [] };
  }

  const result = detectCycles(compound);

  if (result.hasCycle) {
    const cycleStr = result.cyclePath.join(" -> ");
    return {
      valid: false,
      error: {
        message: `Cyclic dependency detected in compound sets: ${cycleStr}`,
        cycle: result.cyclePath,
      },
    };
  }

  return {
    valid: true,
    evaluationOrder: result.sortedOrder,
  };
}

/**
 * Gets the optimal evaluation order for compound sets.
 * Sets with no compound dependencies come first.
 *
 * @param compound - Map of compound set name to expression
 * @returns Ordered list of set names for evaluation, or null if cyclic
 */
export function getEvaluationOrder(compound: Record<string, string>): string[] | null {
  const result = detectCycles(compound);
  if (result.hasCycle) {
    return null;
  }
  return result.sortedOrder;
}
