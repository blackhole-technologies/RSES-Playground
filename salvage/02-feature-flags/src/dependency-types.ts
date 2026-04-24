/**
 * Dependency resolution types.
 *
 * Extracted from the parent repo's shared/admin/schema.ts — the rest of
 * that file is Drizzle table definitions irrelevant to the evaluator
 * library. These two interfaces are plain TypeScript.
 */

export interface FeatureDependencyNode {
  key: string;
  name: string;
  enabled: boolean;
  dependencies: string[];
  dependents: string[];
  depth: number;
  hasCycle: boolean;
}

export interface DependencyResolution {
  canEnable: boolean;
  blockedBy: string[];
  wouldBreak: string[];
  dependencyChain: FeatureDependencyNode[];
}
