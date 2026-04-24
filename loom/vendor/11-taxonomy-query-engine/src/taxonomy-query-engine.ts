/**
 * @file taxonomy-query-engine.ts
 * @description High-performance taxonomy query engine with formal guarantees.
 *              Implements the query language from SET-GRAPH-THEORY-FORMALIZATION.md
 * @phase Phase 9 - CMS Content Type System (Set-Graph Theory Extension)
 * @author SGT (Set-Graph Theorist Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Compound queries (AND, OR, NOT)
 * - Faceted search across vocabularies
 * - Hierarchical traversal with transitive closure
 * - Query optimization and caching
 * - Formal termination guarantees
 */

import {
  Term,
  Vocabulary,
  ContentTermGraph,
  FacetedSearchIndex,
  computeTransitiveClosure,
  computeDescendants,
  computeDepths,
  parseQuery,
  QueryNode,
} from '../../10-taxonomy-algebra/src/taxonomy-algebra';

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Query operation types for the query algebra.
 */
export type QueryOperation =
  | { op: 'term'; termId: number }
  | { op: 'termWithDescendants'; termId: number }
  | { op: 'and'; operands: QueryOperation[] }
  | { op: 'or'; operands: QueryOperation[] }
  | { op: 'not'; operand: QueryOperation }
  | { op: 'vocabulary'; vocabId: string; termIds: number[] }
  | { op: 'all' }
  | { op: 'none' };

/**
 * Query execution plan with cost estimates.
 */
export interface QueryPlan {
  operation: QueryOperation;
  estimatedCost: number;
  estimatedResults: number;
  useIndex: boolean;
}

/**
 * Query result with metadata.
 */
export interface QueryResult {
  contentIds: Set<number>;
  executionTimeMs: number;
  fromCache: boolean;
  planUsed: QueryPlan;
}

/**
 * Pagination options.
 */
export interface PaginationOptions {
  offset: number;
  limit: number;
  sortBy?: 'relevance' | 'created' | 'updated' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// =============================================================================
// LRU CACHE FOR QUERY RESULTS
// =============================================================================

/**
 * LRU cache for query results.
 * Avoids recomputing expensive queries.
 */
class QueryCache {
  private cache: Map<string, { result: Set<number>; timestamp: number }> = new Map();
  private accessOrder: string[] = [];
  private maxSize: number;
  private maxAgeMs: number;
  private _hits = 0;
  private _misses = 0;

  constructor(maxSize: number = 1000, maxAgeMs: number = 60000) {
    this.maxSize = maxSize;
    this.maxAgeMs = maxAgeMs;
  }

  /**
   * Gets a cached result if available and not expired.
   */
  get(key: string): Set<number> | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() - entry.timestamp > this.maxAgeMs) {
      this.cache.delete(key);
      this._misses++;
      return undefined;
    }

    this._hits++;

    // Move to end of access order
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(key);
    }

    return new Set(entry.result);
  }

  /**
   * Stores a result in the cache.
   */
  set(key: string, result: Set<number>): void {
    // Evict if necessary
    while (this.cache.size >= this.maxSize) {
      const lru = this.accessOrder.shift();
      if (lru) this.cache.delete(lru);
    }

    this.cache.set(key, { result: new Set(result), timestamp: Date.now() });
    this.accessOrder.push(key);
  }

  /**
   * Invalidates cache entries matching a pattern.
   */
  invalidate(pattern?: (key: string) => boolean): void {
    if (!pattern) {
      this.cache.clear();
      this.accessOrder = [];
      return;
    }

    for (const key of [...this.cache.keys()]) {
      if (pattern(key)) {
        this.cache.delete(key);
        const idx = this.accessOrder.indexOf(key);
        if (idx !== -1) this.accessOrder.splice(idx, 1);
      }
    }
  }

  get stats() {
    return {
      size: this.cache.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? this._hits / (this._hits + this._misses)
        : 0,
    };
  }
}

// =============================================================================
// QUERY ENGINE
// =============================================================================

/**
 * High-performance taxonomy query engine.
 * Provides compound queries, faceted search, and hierarchical traversal.
 */
export class TaxonomyQueryEngine {
  private vocabularies: Map<string, Vocabulary> = new Map();
  private termById: Map<number, Term> = new Map();
  private termByName: Map<string, Map<string, Term>> = new Map(); // vocab -> name -> term
  private contentGraph: ContentTermGraph = new ContentTermGraph();
  private ancestors: Map<string, Map<number, Set<number>>> = new Map();
  private descendants: Map<string, Map<number, Set<number>>> = new Map();
  private depths: Map<string, Map<number, number>> = new Map();
  private allContentIds: Set<number> = new Set();
  private queryCache: QueryCache;

  constructor(cacheSize: number = 1000, cacheMaxAgeMs: number = 60000) {
    this.queryCache = new QueryCache(cacheSize, cacheMaxAgeMs);
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Loads a vocabulary into the engine.
   * Computes transitive closure and descendants for efficient queries.
   *
   * @complexity O(V * E) for transitive closure computation
   */
  loadVocabulary(vocab: Vocabulary): void {
    this.vocabularies.set(vocab.id, vocab);
    this.termByName.set(vocab.id, new Map());

    for (const term of vocab.terms) {
      this.termById.set(term.id, term);
      this.termByName.get(vocab.id)!.set(term.name, term);
    }

    // Compute hierarchy caches
    this.ancestors.set(vocab.id, computeTransitiveClosure(vocab.terms));
    this.descendants.set(vocab.id, computeDescendants(vocab.terms));
    this.depths.set(vocab.id, computeDepths(vocab.terms));

    // Invalidate affected cache entries
    this.queryCache.invalidate(key => key.includes(vocab.id));
  }

  /**
   * Indexes content with its term classifications.
   */
  indexContent(contentId: number, termIds: number[]): void {
    this.allContentIds.add(contentId);
    for (const termId of termIds) {
      this.contentGraph.addEdge(contentId, termId);
    }
    // Invalidate cache
    this.queryCache.invalidate();
  }

  /**
   * Removes content from the index.
   */
  removeContent(contentId: number): void {
    this.allContentIds.delete(contentId);
    const terms = this.contentGraph.getTermsByContent(contentId);
    for (const termId of terms) {
      this.contentGraph.removeEdge(contentId, termId);
    }
    this.queryCache.invalidate();
  }

  /**
   * Updates content term associations.
   */
  updateContentTerms(contentId: number, newTermIds: number[]): void {
    const oldTerms = this.contentGraph.getTermsByContent(contentId);

    // Remove old associations
    for (const termId of oldTerms) {
      this.contentGraph.removeEdge(contentId, termId);
    }

    // Add new associations
    for (const termId of newTermIds) {
      this.contentGraph.addEdge(contentId, termId);
    }

    this.queryCache.invalidate();
  }

  // ===========================================================================
  // TERM RESOLUTION
  // ===========================================================================

  /**
   * Resolves a term by name within a vocabulary.
   */
  resolveTerm(vocabId: string, termName: string): Term | undefined {
    return this.termByName.get(vocabId)?.get(termName);
  }

  /**
   * Resolves a term by name across all vocabularies.
   */
  resolveTermGlobal(termName: string): Term | undefined {
    for (const nameMap of this.termByName.values()) {
      const term = nameMap.get(termName);
      if (term) return term;
    }
    return undefined;
  }

  /**
   * Gets a term by ID.
   */
  getTerm(termId: number): Term | undefined {
    return this.termById.get(termId);
  }

  // ===========================================================================
  // HIERARCHY NAVIGATION
  // ===========================================================================

  /**
   * Gets all ancestors of a term.
   *
   * @complexity O(1) - uses precomputed transitive closure
   */
  getAncestors(termId: number): Set<number> {
    const term = this.termById.get(termId);
    if (!term) return new Set();

    const vocabAncestors = this.ancestors.get(term.vocabularyId);
    return new Set(vocabAncestors?.get(termId) ?? []);
  }

  /**
   * Gets all descendants of a term.
   *
   * @complexity O(1) - uses precomputed descendants
   */
  getDescendants(termId: number): Set<number> {
    const term = this.termById.get(termId);
    if (!term) return new Set();

    const vocabDescendants = this.descendants.get(term.vocabularyId);
    return new Set(vocabDescendants?.get(termId) ?? []);
  }

  /**
   * Gets the depth of a term (distance from root).
   */
  getDepth(termId: number): number {
    const term = this.termById.get(termId);
    if (!term) return -1;

    return this.depths.get(term.vocabularyId)?.get(termId) ?? 0;
  }

  /**
   * Gets children (immediate descendants) of a term.
   */
  getChildren(termId: number): Term[] {
    const term = this.termById.get(termId);
    if (!term) return [];

    const vocab = this.vocabularies.get(term.vocabularyId);
    if (!vocab) return [];

    return vocab.terms.filter(t => t.parentIds.includes(termId));
  }

  /**
   * Gets the path from root to a term.
   */
  getPath(termId: number): Term[] {
    const path: Term[] = [];
    let current = this.termById.get(termId);

    while (current) {
      path.unshift(current);
      if (current.parentIds.length === 0) break;
      current = this.termById.get(current.parentIds[0]);
    }

    return path;
  }

  // ===========================================================================
  // QUERY EXECUTION
  // ===========================================================================

  /**
   * Executes a query string.
   *
   * @example
   * query("topics:ai AND types:tutorial")
   * query("topics:ai/* OR topics:ml/*")
   * query("NOT tags:draft")
   */
  query(queryStr: string): QueryResult {
    const startTime = performance.now();

    // Check cache
    const cacheKey = `query:${queryStr}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      return {
        contentIds: cached,
        executionTimeMs: performance.now() - startTime,
        fromCache: true,
        planUsed: { operation: { op: 'none' }, estimatedCost: 0, estimatedResults: cached.size, useIndex: true },
      };
    }

    // Parse and execute
    const ast = parseQuery(queryStr);
    const operation = this.astToOperation(ast);
    const plan = this.optimizePlan(operation);
    const result = this.executePlan(plan);

    // Cache result
    this.queryCache.set(cacheKey, result);

    return {
      contentIds: result,
      executionTimeMs: performance.now() - startTime,
      fromCache: false,
      planUsed: plan,
    };
  }

  /**
   * Executes a faceted search.
   *
   * @param facets - Map of vocabulary ID to term names
   * @param includeDescendants - Whether to include descendant terms
   */
  facetedSearch(
    facets: Record<string, string[]>,
    includeDescendants: boolean = false
  ): QueryResult {
    const startTime = performance.now();

    // Build cache key
    const cacheKey = `faceted:${JSON.stringify(facets)}:${includeDescendants}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      return {
        contentIds: cached,
        executionTimeMs: performance.now() - startTime,
        fromCache: true,
        planUsed: { operation: { op: 'none' }, estimatedCost: 0, estimatedResults: cached.size, useIndex: true },
      };
    }

    // Resolve terms and build operation
    const facetOperations: QueryOperation[] = [];

    for (const [vocabId, termNames] of Object.entries(facets)) {
      const termIds: number[] = [];
      for (const name of termNames) {
        const term = this.resolveTerm(vocabId, name);
        if (term) {
          if (includeDescendants) {
            termIds.push(term.id, ...this.getDescendants(term.id));
          } else {
            termIds.push(term.id);
          }
        }
      }
      if (termIds.length > 0) {
        facetOperations.push({ op: 'vocabulary', vocabId, termIds });
      }
    }

    if (facetOperations.length === 0) {
      return {
        contentIds: new Set(),
        executionTimeMs: performance.now() - startTime,
        fromCache: false,
        planUsed: { operation: { op: 'none' }, estimatedCost: 0, estimatedResults: 0, useIndex: false },
      };
    }

    const operation: QueryOperation = facetOperations.length === 1
      ? facetOperations[0]
      : { op: 'and', operands: facetOperations };

    const plan = this.optimizePlan(operation);
    const result = this.executePlan(plan);

    this.queryCache.set(cacheKey, result);

    return {
      contentIds: result,
      executionTimeMs: performance.now() - startTime,
      fromCache: false,
      planUsed: plan,
    };
  }

  /**
   * Gets content by term with optional descendant inclusion.
   */
  getContentByTerm(termId: number, includeDescendants: boolean = false): Set<number> {
    if (includeDescendants) {
      const term = this.termById.get(termId);
      if (!term) return new Set();

      const vocabDescendants = this.descendants.get(term.vocabularyId);
      if (vocabDescendants) {
        return this.contentGraph.getContentByTermWithDescendants(termId, vocabDescendants);
      }
    }

    return this.contentGraph.getContentByTerm(termId);
  }

  /**
   * Gets terms for a content item.
   */
  getTermsByContent(contentId: number): Term[] {
    const termIds = this.contentGraph.getTermsByContent(contentId);
    return [...termIds].map(id => this.termById.get(id)).filter((t): t is Term => t !== undefined);
  }

  /**
   * Gets facet counts for a vocabulary.
   *
   * @param vocabId - Vocabulary to get counts for
   * @param baseQuery - Optional query to filter before counting
   */
  getFacetCounts(
    vocabId: string,
    baseQuery?: string
  ): Map<number, { term: Term; count: number }> {
    const counts = new Map<number, { term: Term; count: number }>();
    const vocab = this.vocabularies.get(vocabId);
    if (!vocab) return counts;

    let baseContentIds: Set<number> | undefined;
    if (baseQuery) {
      const result = this.query(baseQuery);
      baseContentIds = result.contentIds;
    }

    for (const term of vocab.terms) {
      const content = this.contentGraph.getContentByTerm(term.id);
      let count: number;

      if (baseContentIds) {
        count = [...content].filter(c => baseContentIds!.has(c)).length;
      } else {
        count = content.size;
      }

      counts.set(term.id, { term, count });
    }

    return counts;
  }

  // ===========================================================================
  // QUERY OPTIMIZATION
  // ===========================================================================

  /**
   * Converts AST to internal operation representation.
   */
  private astToOperation(ast: QueryNode): QueryOperation {
    switch (ast.type) {
      case 'term': {
        const term = ast.vocabId
          ? this.resolveTerm(ast.vocabId, ast.termName)
          : this.resolveTermGlobal(ast.termName);
        if (!term) return { op: 'none' };
        return { op: 'term', termId: term.id };
      }

      case 'descendants': {
        if (ast.operand.type !== 'term') return { op: 'none' };
        const term = ast.operand.vocabId
          ? this.resolveTerm(ast.operand.vocabId, ast.operand.termName)
          : this.resolveTermGlobal(ast.operand.termName);
        if (!term) return { op: 'none' };
        return { op: 'termWithDescendants', termId: term.id };
      }

      case 'and':
        return {
          op: 'and',
          operands: [this.astToOperation(ast.left), this.astToOperation(ast.right)],
        };

      case 'or':
        return {
          op: 'or',
          operands: [this.astToOperation(ast.left), this.astToOperation(ast.right)],
        };

      case 'not':
        return { op: 'not', operand: this.astToOperation(ast.operand) };
    }
  }

  /**
   * Optimizes a query plan.
   * - Flattens nested AND/OR
   * - Orders operands by estimated cost (smallest first for AND)
   */
  private optimizePlan(operation: QueryOperation): QueryPlan {
    const estimatedResults = this.estimateResults(operation);
    const estimatedCost = this.estimateCost(operation);

    // Flatten and reorder AND operands
    if (operation.op === 'and') {
      const flattened = this.flattenAnd(operation);
      const sorted = [...flattened.operands].sort((a, b) => {
        return this.estimateResults(a) - this.estimateResults(b);
      });
      return {
        operation: { op: 'and', operands: sorted },
        estimatedCost,
        estimatedResults,
        useIndex: true,
      };
    }

    return {
      operation,
      estimatedCost,
      estimatedResults,
      useIndex: true,
    };
  }

  /**
   * Flattens nested AND operations.
   */
  private flattenAnd(op: QueryOperation): { op: 'and'; operands: QueryOperation[] } {
    if (op.op !== 'and') return { op: 'and', operands: [op] };

    const operands: QueryOperation[] = [];
    for (const operand of op.operands) {
      if (operand.op === 'and') {
        operands.push(...this.flattenAnd(operand).operands);
      } else {
        operands.push(operand);
      }
    }

    return { op: 'and', operands };
  }

  /**
   * Estimates result count for an operation.
   */
  private estimateResults(op: QueryOperation): number {
    switch (op.op) {
      case 'none':
        return 0;
      case 'all':
        return this.allContentIds.size;
      case 'term':
        return this.contentGraph.getContentByTerm(op.termId).size;
      case 'termWithDescendants': {
        const term = this.termById.get(op.termId);
        if (!term) return 0;
        const vocabDescendants = this.descendants.get(term.vocabularyId);
        const descCount = vocabDescendants?.get(op.termId)?.size ?? 0;
        const baseCount = this.contentGraph.getContentByTerm(op.termId).size;
        return baseCount + descCount * (baseCount / Math.max(1, this.allContentIds.size));
      }
      case 'vocabulary':
        return Math.min(
          ...op.termIds.map(id => this.contentGraph.getContentByTerm(id).size)
        );
      case 'and':
        return Math.min(...op.operands.map(o => this.estimateResults(o)));
      case 'or':
        return Math.min(
          this.allContentIds.size,
          op.operands.reduce((sum, o) => sum + this.estimateResults(o), 0)
        );
      case 'not':
        return this.allContentIds.size - this.estimateResults(op.operand);
    }
  }

  /**
   * Estimates cost of an operation.
   */
  private estimateCost(op: QueryOperation): number {
    switch (op.op) {
      case 'none':
        return 0;
      case 'all':
        return 1;
      case 'term':
        return 1;
      case 'termWithDescendants':
        return 5; // Higher due to traversal
      case 'vocabulary':
        return op.termIds.length;
      case 'and':
        return op.operands.reduce((sum, o) => sum + this.estimateCost(o), 0) + op.operands.length;
      case 'or':
        return op.operands.reduce((sum, o) => sum + this.estimateCost(o), 0);
      case 'not':
        return this.estimateCost(op.operand) + this.allContentIds.size / 100;
    }
  }

  /**
   * Executes a query plan.
   *
   * @termination Guaranteed by structural recursion on plan
   */
  private executePlan(plan: QueryPlan): Set<number> {
    return this.executeOperation(plan.operation);
  }

  /**
   * Executes a single operation.
   */
  private executeOperation(op: QueryOperation): Set<number> {
    switch (op.op) {
      case 'none':
        return new Set();

      case 'all':
        return new Set(this.allContentIds);

      case 'term':
        return this.contentGraph.getContentByTerm(op.termId);

      case 'termWithDescendants': {
        const term = this.termById.get(op.termId);
        if (!term) return new Set();
        const vocabDescendants = this.descendants.get(term.vocabularyId);
        if (vocabDescendants) {
          return this.contentGraph.getContentByTermWithDescendants(op.termId, vocabDescendants);
        }
        return this.contentGraph.getContentByTerm(op.termId);
      }

      case 'vocabulary':
        return this.contentGraph.queryOr(op.termIds);

      case 'and': {
        if (op.operands.length === 0) return new Set(this.allContentIds);

        // Execute in order (smallest first for efficiency)
        let result = this.executeOperation(op.operands[0]);
        for (let i = 1; i < op.operands.length && result.size > 0; i++) {
          const next = this.executeOperation(op.operands[i]);
          result = new Set([...result].filter(c => next.has(c)));
        }
        return result;
      }

      case 'or': {
        const result = new Set<number>();
        for (const operand of op.operands) {
          for (const id of this.executeOperation(operand)) {
            result.add(id);
          }
        }
        return result;
      }

      case 'not': {
        const operand = this.executeOperation(op.operand);
        return new Set([...this.allContentIds].filter(c => !operand.has(c)));
      }
    }
  }

  // ===========================================================================
  // PAGINATION AND SORTING
  // ===========================================================================

  /**
   * Paginates query results.
   *
   * @param contentIds - Set of content IDs to paginate
   * @param options - Pagination options
   * @param getContent - Function to retrieve content by ID
   */
  paginate<T>(
    contentIds: Set<number>,
    options: PaginationOptions,
    getContent: (id: number) => T | undefined
  ): PaginatedResult<T> {
    const ids = [...contentIds];

    // Note: sorting should be done by the caller with full content data
    // Here we just handle offset/limit

    const sliced = ids.slice(options.offset, options.offset + options.limit);
    const items = sliced
      .map(id => getContent(id))
      .filter((item): item is T => item !== undefined);

    return {
      items,
      total: contentIds.size,
      offset: options.offset,
      limit: options.limit,
      hasMore: options.offset + options.limit < contentIds.size,
    };
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Gets engine statistics.
   */
  getStats(): {
    vocabularyCount: number;
    termCount: number;
    contentCount: number;
    edgeCount: number;
    cacheStats: { size: number; hits: number; misses: number; hitRate: number };
  } {
    let edgeCount = 0;
    for (const contentId of this.allContentIds) {
      edgeCount += this.contentGraph.getTermsByContent(contentId).size;
    }

    return {
      vocabularyCount: this.vocabularies.size,
      termCount: this.termById.size,
      contentCount: this.allContentIds.size,
      edgeCount,
      cacheStats: this.queryCache.stats,
    };
  }

  /**
   * Clears all caches.
   */
  clearCache(): void {
    this.queryCache.invalidate();
  }
}

// =============================================================================
// FACTORY AND SINGLETON
// =============================================================================

let globalQueryEngine: TaxonomyQueryEngine | null = null;

/**
 * Gets or creates the global query engine instance.
 */
export function getQueryEngine(): TaxonomyQueryEngine {
  if (!globalQueryEngine) {
    globalQueryEngine = new TaxonomyQueryEngine();
  }
  return globalQueryEngine;
}

/**
 * Resets the global query engine (mainly for testing).
 */
export function resetQueryEngine(): void {
  globalQueryEngine = null;
}
