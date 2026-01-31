/**
 * @file learning.ts
 * @description Client-side learning persistence layer using localStorage
 * @phase Phase 5 - Prompting & Learning
 */

/**
 * Pattern-to-category mapping stored by the learning system
 */
export interface LearnedMapping {
  pattern: string;
  category: string;
  type: "set" | "topic" | "type" | "filetype";
  createdAt: number;
  usageCount: number;
  lastUsedAt: number;
}

const STORAGE_KEY = "rses-learned-mappings";

/**
 * Gets all learned mappings
 */
export function getLearnings(): LearnedMapping[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as LearnedMapping[];
  } catch {
    return [];
  }
}

/**
 * Adds a new learned mapping
 */
export function addLearning(
  pattern: string,
  category: string,
  type: LearnedMapping["type"]
): LearnedMapping {
  const learnings = getLearnings();
  const now = Date.now();

  // Check if mapping already exists
  const existing = learnings.find(
    (l) => l.pattern === pattern && l.category === category && l.type === type
  );

  if (existing) {
    // Update usage
    existing.usageCount++;
    existing.lastUsedAt = now;
    saveLearnings(learnings);
    return existing;
  }

  // Add new mapping
  const newMapping: LearnedMapping = {
    pattern,
    category,
    type,
    createdAt: now,
    usageCount: 1,
    lastUsedAt: now,
  };

  learnings.push(newMapping);
  saveLearnings(learnings);
  return newMapping;
}

/**
 * Finds learned mappings for a pattern
 */
export function findMappings(pattern: string): LearnedMapping[] {
  const learnings = getLearnings();
  return learnings.filter((l) => {
    // Exact match
    if (l.pattern === pattern) return true;
    // Pattern matching (simple prefix/suffix)
    if (l.pattern.endsWith("*")) {
      const prefix = l.pattern.slice(0, -1);
      if (pattern.startsWith(prefix)) return true;
    }
    if (l.pattern.startsWith("*")) {
      const suffix = l.pattern.slice(1);
      if (pattern.endsWith(suffix)) return true;
    }
    return false;
  });
}

/**
 * Removes a learned mapping
 */
export function removeLearning(pattern: string, category: string): void {
  const learnings = getLearnings();
  const filtered = learnings.filter(
    (l) => !(l.pattern === pattern && l.category === category)
  );
  saveLearnings(filtered);
}

/**
 * Clears all learned mappings
 */
export function clearLearnings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Gets learning statistics
 */
export function getLearningStats(): {
  total: number;
  byType: Record<LearnedMapping["type"], number>;
  mostUsed: LearnedMapping | null;
} {
  const learnings = getLearnings();

  const byType: Record<LearnedMapping["type"], number> = {
    set: 0,
    topic: 0,
    type: 0,
    filetype: 0,
  };

  let mostUsed: LearnedMapping | null = null;

  for (const learning of learnings) {
    byType[learning.type]++;
    if (!mostUsed || learning.usageCount > mostUsed.usageCount) {
      mostUsed = learning;
    }
  }

  return {
    total: learnings.length,
    byType,
    mostUsed,
  };
}

/**
 * Exports learnings as JSON for backup
 */
export function exportLearnings(): string {
  return JSON.stringify(getLearnings(), null, 2);
}

/**
 * Imports learnings from JSON backup
 */
export function importLearnings(json: string): number {
  try {
    const imported = JSON.parse(json) as LearnedMapping[];
    if (!Array.isArray(imported)) return 0;

    const learnings = getLearnings();
    let added = 0;

    for (const item of imported) {
      // Validate structure
      if (
        typeof item.pattern !== "string" ||
        typeof item.category !== "string" ||
        !["set", "topic", "type", "filetype"].includes(item.type)
      ) {
        continue;
      }

      // Check for duplicates
      const exists = learnings.some(
        (l) =>
          l.pattern === item.pattern &&
          l.category === item.category &&
          l.type === item.type
      );

      if (!exists) {
        learnings.push({
          pattern: item.pattern,
          category: item.category,
          type: item.type,
          createdAt: item.createdAt || Date.now(),
          usageCount: item.usageCount || 1,
          lastUsedAt: item.lastUsedAt || Date.now(),
        });
        added++;
      }
    }

    saveLearnings(learnings);
    return added;
  } catch {
    return 0;
  }
}

// Internal helper
function saveLearnings(learnings: LearnedMapping[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(learnings));
}
