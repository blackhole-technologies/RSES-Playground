/**
 * @file dependency-resolver.ts
 * @description Feature Flag Dependency Resolver
 * @phase Phase 10 - Admin Interface & Feature Toggles
 * @author UI Development Expert Agent
 * @created 2026-02-01
 *
 * Implements topological sorting and cycle detection for feature dependencies.
 * Inspired by package managers and build systems.
 */

import type { FeatureFlag, FeatureDependency } from "./shared-types";
import type { FeatureDependencyNode, DependencyResolution } from "./dependency-types";
import type { IDependencyResolver } from "./types";
import { createModuleLogger } from "./logger-stub";

const log = createModuleLogger("dependency-resolver");

/**
 * Feature Flag Dependency Resolver
 *
 * Provides:
 * - Dependency graph construction
 * - Cycle detection using Tarjan's algorithm
 * - Topological sorting for safe enable/disable order
 * - Impact analysis for feature changes
 */
export class FeatureDependencyResolver implements IDependencyResolver {
  /**
   * Build the complete dependency graph
   */
  buildGraph(flags: FeatureFlag[]): Map<string, FeatureDependencyNode> {
    const graph = new Map<string, FeatureDependencyNode>();

    // Initialize nodes
    for (const flag of flags) {
      graph.set(flag.key, {
        key: flag.key,
        name: flag.name,
        enabled: flag.globallyEnabled,
        dependencies: flag.dependencies.map((d) => d.featureKey),
        dependents: [],
        depth: 0,
        hasCycle: false,
      });
    }

    // Build reverse dependencies (dependents)
    for (const flag of flags) {
      for (const dep of flag.dependencies) {
        const depNode = graph.get(dep.featureKey);
        if (depNode) {
          depNode.dependents.push(flag.key);
        }
      }
    }

    // Calculate depths and detect cycles
    const cycles = this.detectCyclesInternal(graph);
    for (const cycle of cycles) {
      for (const key of cycle) {
        const node = graph.get(key);
        if (node) {
          node.hasCycle = true;
        }
      }
    }

    // Calculate depths using topological traversal
    const visited = new Set<string>();
    const calculateDepth = (key: string, depth: number): void => {
      const node = graph.get(key);
      if (!node || visited.has(key) || node.hasCycle) return;

      visited.add(key);
      node.depth = Math.max(node.depth, depth);

      for (const dependent of node.dependents) {
        calculateDepth(dependent, depth + 1);
      }
    };

    // Start from root nodes (no dependencies)
    for (const [key, node] of graph) {
      if (node.dependencies.length === 0) {
        calculateDepth(key, 0);
      }
    }

    return graph;
  }

  /**
   * Check if a feature can be enabled
   */
  canEnable(featureKey: string, flags: FeatureFlag[]): DependencyResolution {
    const flagMap = new Map(flags.map((f) => [f.key, f]));
    const flag = flagMap.get(featureKey);

    if (!flag) {
      return {
        canEnable: false,
        blockedBy: [],
        wouldBreak: [],
        dependencyChain: [],
      };
    }

    const blockedBy: string[] = [];
    const dependencyChain: FeatureDependencyNode[] = [];

    // Check all dependencies recursively
    const checkDependencies = (key: string, visited: Set<string>, chain: FeatureDependencyNode[]): void => {
      if (visited.has(key)) return;
      visited.add(key);

      const f = flagMap.get(key);
      if (!f) return;

      for (const dep of f.dependencies) {
        const depFlag = flagMap.get(dep.featureKey);
        if (!depFlag) {
          blockedBy.push(`${dep.featureKey} (not found)`);
          continue;
        }

        const node: FeatureDependencyNode = {
          key: depFlag.key,
          name: depFlag.name,
          enabled: depFlag.globallyEnabled,
          dependencies: depFlag.dependencies.map((d) => d.featureKey),
          dependents: [],
          depth: chain.length,
          hasCycle: false,
        };

        // Check if dependency state matches requirement
        if (dep.requiredState && !depFlag.globallyEnabled) {
          blockedBy.push(dep.featureKey);
        } else if (!dep.requiredState && depFlag.globallyEnabled) {
          blockedBy.push(`${dep.featureKey} (must be disabled)`);
        }

        chain.push(node);
        checkDependencies(dep.featureKey, visited, chain);
      }
    };

    checkDependencies(featureKey, new Set(), dependencyChain);

    return {
      canEnable: blockedBy.length === 0,
      blockedBy,
      wouldBreak: [],
      dependencyChain,
    };
  }

  /**
   * Check if a feature can be disabled
   */
  canDisable(featureKey: string, flags: FeatureFlag[]): DependencyResolution {
    const flagMap = new Map(flags.map((f) => [f.key, f]));
    const flag = flagMap.get(featureKey);

    if (!flag) {
      return {
        canEnable: true, // canDisable actually
        blockedBy: [],
        wouldBreak: [],
        dependencyChain: [],
      };
    }

    const wouldBreak: string[] = [];
    const dependencyChain: FeatureDependencyNode[] = [];

    // Find all enabled features that depend on this one
    for (const f of flags) {
      if (f.globallyEnabled) {
        for (const dep of f.dependencies) {
          if (dep.featureKey === featureKey && dep.requiredState) {
            wouldBreak.push(f.key);

            dependencyChain.push({
              key: f.key,
              name: f.name,
              enabled: f.globallyEnabled,
              dependencies: f.dependencies.map((d) => d.featureKey),
              dependents: [],
              depth: 0,
              hasCycle: false,
            });
          }
        }
      }
    }

    return {
      canEnable: wouldBreak.length === 0, // canDisable actually
      blockedBy: [],
      wouldBreak,
      dependencyChain,
    };
  }

  /**
   * Get all transitive dependents
   */
  getDependents(featureKey: string, flags: FeatureFlag[]): string[] {
    const graph = this.buildGraph(flags);
    const dependents = new Set<string>();

    const collect = (key: string): void => {
      const node = graph.get(key);
      if (!node) return;

      for (const dependent of node.dependents) {
        if (!dependents.has(dependent)) {
          dependents.add(dependent);
          collect(dependent);
        }
      }
    };

    collect(featureKey);
    return Array.from(dependents);
  }

  /**
   * Get all transitive dependencies
   */
  getDependencies(featureKey: string, flags: FeatureFlag[]): string[] {
    const graph = this.buildGraph(flags);
    const dependencies = new Set<string>();

    const collect = (key: string): void => {
      const node = graph.get(key);
      if (!node) return;

      for (const dep of node.dependencies) {
        if (!dependencies.has(dep)) {
          dependencies.add(dep);
          collect(dep);
        }
      }
    };

    collect(featureKey);
    return Array.from(dependencies);
  }

  /**
   * Detect cycles using Tarjan's strongly connected components algorithm
   */
  detectCycles(flags: FeatureFlag[]): string[][] {
    const graph = this.buildGraph(flags);
    return this.detectCyclesInternal(graph);
  }

  /**
   * Internal cycle detection on built graph
   */
  private detectCyclesInternal(graph: Map<string, FeatureDependencyNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (key: string): void => {
      visited.add(key);
      recursionStack.add(key);
      path.push(key);

      const node = graph.get(key);
      if (node) {
        for (const dep of node.dependencies) {
          if (!visited.has(dep)) {
            dfs(dep);
          } else if (recursionStack.has(dep)) {
            // Found a cycle - extract it
            const cycleStart = path.indexOf(dep);
            if (cycleStart !== -1) {
              cycles.push(path.slice(cycleStart));
            }
          }
        }
      }

      path.pop();
      recursionStack.delete(key);
    };

    for (const key of graph.keys()) {
      if (!visited.has(key)) {
        dfs(key);
      }
    }

    return cycles;
  }

  /**
   * Get topological order for safe enable/disable operations
   */
  getTopologicalOrder(flags: FeatureFlag[]): string[] {
    const graph = this.buildGraph(flags);
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (key: string): boolean => {
      if (temp.has(key)) {
        // Cycle detected
        return false;
      }
      if (visited.has(key)) {
        return true;
      }

      temp.add(key);

      const node = graph.get(key);
      if (node) {
        for (const dep of node.dependencies) {
          if (!visit(dep)) {
            return false;
          }
        }
      }

      temp.delete(key);
      visited.add(key);
      result.push(key);

      return true;
    };

    for (const key of graph.keys()) {
      if (!visited.has(key)) {
        visit(key);
      }
    }

    return result;
  }

  /**
   * Validate dependencies before adding a new dependency
   */
  validateDependency(
    sourceKey: string,
    dependency: FeatureDependency,
    flags: FeatureFlag[]
  ): { valid: boolean; error?: string } {
    // Check if target exists
    const target = flags.find((f) => f.key === dependency.featureKey);
    if (!target) {
      return { valid: false, error: `Target feature '${dependency.featureKey}' not found` };
    }

    // Check for self-reference
    if (sourceKey === dependency.featureKey) {
      return { valid: false, error: "Feature cannot depend on itself" };
    }

    // Check if this would create a cycle
    const testFlags = flags.map((f) => {
      if (f.key === sourceKey) {
        return {
          ...f,
          dependencies: [...f.dependencies, dependency],
        };
      }
      return f;
    });

    const cycles = this.detectCycles(testFlags);
    if (cycles.length > 0) {
      const cycleStr = cycles[0].join(" -> ");
      return { valid: false, error: `Would create dependency cycle: ${cycleStr}` };
    }

    return { valid: true };
  }

  /**
   * Get suggested enable order for a set of features
   */
  getSuggestedEnableOrder(featureKeys: string[], flags: FeatureFlag[]): string[] {
    const order = this.getTopologicalOrder(flags);
    return order.filter((key) => featureKeys.includes(key));
  }

  /**
   * Get suggested disable order for a set of features (reverse of enable)
   */
  getSuggestedDisableOrder(featureKeys: string[], flags: FeatureFlag[]): string[] {
    return this.getSuggestedEnableOrder(featureKeys, flags).reverse();
  }

  /**
   * Visualize dependency graph as DOT format (for Graphviz)
   */
  toDotFormat(flags: FeatureFlag[]): string {
    const graph = this.buildGraph(flags);
    const lines: string[] = ["digraph FeatureDependencies {"];
    lines.push("  rankdir=TB;");
    lines.push("  node [shape=box];");

    for (const [key, node] of graph) {
      const color = node.enabled ? "green" : "gray";
      const style = node.hasCycle ? "dashed" : "solid";
      lines.push(`  "${key}" [label="${node.name}", color=${color}, style=${style}];`);

      for (const dep of node.dependencies) {
        lines.push(`  "${dep}" -> "${key}";`);
      }
    }

    lines.push("}");
    return lines.join("\n");
  }
}

// Export singleton instance
export const dependencyResolver = new FeatureDependencyResolver();
