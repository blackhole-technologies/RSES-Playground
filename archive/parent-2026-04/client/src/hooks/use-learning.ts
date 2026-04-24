/**
 * @file use-learning.ts
 * @description React hook for the learning persistence system
 * @phase Phase 5 - Prompting & Learning
 */

import { useState, useCallback } from "react";
import {
  getLearnings,
  addLearning,
  removeLearning,
  findMappings,
  clearLearnings,
  getLearningStats,
  type LearnedMapping,
} from "@/lib/learning";

/**
 * Hook for interacting with the learning system
 */
export function useLearning() {
  // Force re-render when learnings change
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const learn = useCallback(
    (pattern: string, category: string, type: LearnedMapping["type"]) => {
      const result = addLearning(pattern, category, type);
      refresh();
      return result;
    },
    [refresh]
  );

  const forget = useCallback(
    (pattern: string, category: string) => {
      removeLearning(pattern, category);
      refresh();
    },
    [refresh]
  );

  const forgetAll = useCallback(() => {
    clearLearnings();
    refresh();
  }, [refresh]);

  const suggest = useCallback((pattern: string) => {
    return findMappings(pattern);
  }, []);

  return {
    learnings: getLearnings(),
    stats: getLearningStats(),
    learn,
    forget,
    forgetAll,
    suggest,
  };
}
