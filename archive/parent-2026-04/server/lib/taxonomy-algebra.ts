/**
 * @file taxonomy-algebra.ts
 * @description Set-theoretic operations on taxonomies with formal guarantees.
 *              Implements the mathematical foundations from SET-GRAPH-THEORY-FORMALIZATION.md
 * @phase Phase 9 - CMS Content Type System (Set-Graph Theory Extension)
 * @author SGT (Set-Graph Theorist Agent)
 * @created 2026-02-01
 *
 * Mathematical foundations:
 * - Vocabularies form a category Voc with morphisms as structure-preserving maps
 * - Term hierarchies are posets (partially ordered sets)
 * - Content-term relationships form a bipartite graph
 * - All operations have proven decidability and termination guarantees
 */

// =============================================================================
// CORE TYPE DEFINITIONS
// =============================================================================

/**
 * Represents a term in a vocabulary.
 * Terms are elements of the poset (T, <=).
 */
export interface Term {
  id: number;
  name: string;
  vocabularyId: string;
  parentIds: number[];      // Immediate parents (may be empty for roots)
  weight: number;           // Ordering within siblings
  metadata?: Record<string, unknown>;
}

/**
 * Vocabulary with hierarchy information.
 * V = (T, <=, r) where T is terms, <= is partial order, r is optional root.
 */
export interface Vocabulary {
  id: string;
  label: string;
  hierarchy: 0 | 1 | 2;     // 0=flat, 1=single-parent, 2=multi-parent
  terms: Term[];
}

/**
 * Content item that can be classified under terms.
 */
export interface ClassifiableContent {
  id: number;
  termIds: number[];        // Terms this content is classified under
}

/**
 * Classification result from RSES rules.
 */
export interface Classification {
  sets: string[];
  topics: string[];
  types: string[];
}

// =============================================================================
// POSET OPERATIONS (TERM HIERARCHY)
// =============================================================================

/**
 * Computes the transitive closure of the parent relation.
 * Returns all ancestors for each term.
 *
 * @complexity O(V * E) where V = terms, E = parent edges
 * @termination Guaranteed for DAG (validated by hierarchy type)
 *
 * @param terms - Array of terms with parent relations
 * @returns Map from term ID to set of all ancestor IDs
 */
export function computeTransitiveClosure(terms: Term[]): Map<number, Set<number>> {
  const ancestors = new Map<number, Set<number>>();
  const termMap = new Map(terms.map(t => [t.id, t]));

  // Initialize with immediate parents
  for (const term of terms) {
    ancestors.set(term.id, new Set(term.parentIds));
  }

  // BFS to compute full closure for each term
  for (const term of terms) {
    const visited = new Set<number>();
    const queue = [...term.parentIds];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      if (visited.has(parentId)) continue;
      visited.add(parentId);

      ancestors.get(term.id)!.add(parentId);

      const parent = termMap.get(parentId);
      if (parent) {
        queue.push(...parent.parentIds);
      }
    }
  }

  return ancestors;
}

/**
 * Computes descendants (inverse transitive closure).
 *
 * @complexity O(V * E)
 * @param terms - Array of terms
 * @returns Map from term ID to set of all descendant IDs
 */
export function computeDescendants(terms: Term[]): Map<number, Set<number>> {
  const descendants = new Map<number, Set<number>>();

  // Initialize empty sets
  for (const term of terms) {
    descendants.set(term.id, new Set());
  }

  // For each term, add it to all its ancestors' descendant sets
  for (const term of terms) {
    const visited = new Set<number>();
    const queue = [...term.parentIds];

    while (queue.length > 0) {
      const ancestorId = queue.shift()!;
      if (visited.has(ancestorId)) continue;
      visited.add(ancestorId);

      descendants.get(ancestorId)?.add(term.id);

      const ancestor = terms.find(t => t.id === ancestorId);
      if (ancestor) {
        queue.push(...ancestor.parentIds);
      }
    }
  }

  return descendants;
}

/**
 * Finds the depth of each term (distance from root).
 *
 * @param terms - Array of terms
 * @returns Map from term ID to depth (roots have depth 0)
 */
export function computeDepths(terms: Term[]): Map<number, number> {
  const depths = new Map<number, number>();
  const termMap = new Map(terms.map(t => [t.id, t]));

  function getDepth(termId: number, visited: Set<number>): number {
    if (visited.has(termId)) {
      // Cycle detected - should not happen in valid vocabulary
      return Infinity;
    }

    const cached = depths.get(termId);
    if (cached !== undefined) return cached;

    const term = termMap.get(termId);
    if (!term || term.parentIds.length === 0) {
      depths.set(termId, 0);
      return 0;
    }

    visited.add(termId);
    const maxParentDepth = Math.max(
      ...term.parentIds.map(pid => getDepth(pid, visited))
    );
    visited.delete(termId);

    const depth = maxParentDepth + 1;
    depths.set(termId, depth);
    return depth;
  }

  for (const term of terms) {
    getDepth(term.id, new Set());
  }

  return depths;
}

/**
 * Finds the Lowest Common Ancestor (LCA) of two terms.
 * For multi-parent hierarchies, returns all LCAs.
 *
 * The LCA is the deepest common ancestor - meaning no other common
 * ancestor is a descendant of it.
 *
 * @complexity O(D) where D is max depth
 * @param termId1 - First term ID
 * @param termId2 - Second term ID
 * @param ancestors - Pre-computed transitive closure
 * @returns Array of LCA term IDs
 */
export function findLCA(
  termId1: number,
  termId2: number,
  ancestors: Map<number, Set<number>>
): number[] {
  const ancestors1 = ancestors.get(termId1) ?? new Set();
  const ancestors2 = ancestors.get(termId2) ?? new Set();

  // Add the terms themselves
  const set1 = new Set([termId1, ...ancestors1]);
  const set2 = new Set([termId2, ...ancestors2]);

  // Find common ancestors (including the terms themselves if applicable)
  const common = new Set([...set1].filter(id => set2.has(id)));

  if (common.size === 0) return [];

  // Find lowest common ancestors
  // An LCA is a common ancestor where no other common ancestor is its descendant
  // In other words: for LCA L, there is no other common ancestor C such that L is an ancestor of C
  const lcas: number[] = [];
  for (const id of common) {
    // Check if this id is an ancestor of any other common ancestor
    // If so, then that other common ancestor is "lower" (closer to the terms)
    const isAncestorOfOtherCommon = [...common].some(otherId => {
      if (otherId === id) return false;
      const otherAncestors = ancestors.get(otherId) ?? new Set();
      return otherAncestors.has(id); // id is an ancestor of otherId
    });

    if (!isAncestorOfOtherCommon) {
      lcas.push(id);
    }
  }

  return lcas;
}

// =============================================================================
// SET OPERATIONS ON TERM COLLECTIONS
// =============================================================================

/**
 * Set union of term collections.
 * T1 union T2 = { t | t in T1 or t in T2 }
 *
 * @complexity O(|T1| + |T2|)
 */
export function termUnion(terms1: Term[], terms2: Term[]): Term[] {
  const seen = new Set<number>();
  const result: Term[] = [];

  for (const term of [...terms1, ...terms2]) {
    if (!seen.has(term.id)) {
      seen.add(term.id);
      result.push(term);
    }
  }

  return result;
}

/**
 * Set intersection of term collections.
 * T1 intersection T2 = { t | t in T1 and t in T2 }
 *
 * @complexity O(min(|T1|, |T2|))
 */
export function termIntersection(terms1: Term[], terms2: Term[]): Term[] {
  const ids1 = new Set(terms1.map(t => t.id));
  return terms2.filter(t => ids1.has(t.id));
}

/**
 * Set difference of term collections.
 * T1 \ T2 = { t | t in T1 and t not in T2 }
 *
 * @complexity O(|T1| + |T2|)
 */
export function termDifference(terms1: Term[], terms2: Term[]): Term[] {
  const ids2 = new Set(terms2.map(t => t.id));
  return terms1.filter(t => !ids2.has(t.id));
}

// =============================================================================
// BIPARTITE GRAPH OPERATIONS (CONTENT-TERM RELATIONSHIPS)
// =============================================================================

/**
 * Represents the content-term bipartite graph.
 * G = (C, T, E) where E subseteq C x T
 */
export class ContentTermGraph {
  // Term -> Content (inverted index)
  private termToContent: Map<number, Set<number>> = new Map();

  // Content -> Terms (forward index)
  private contentToTerms: Map<number, Set<number>> = new Map();

  /**
   * Adds a content-term edge.
   * @complexity O(1) amortized
   */
  addEdge(contentId: number, termId: number): void {
    if (!this.termToContent.has(termId)) {
      this.termToContent.set(termId, new Set());
    }
    this.termToContent.get(termId)!.add(contentId);

    if (!this.contentToTerms.has(contentId)) {
      this.contentToTerms.set(contentId, new Set());
    }
    this.contentToTerms.get(contentId)!.add(termId);
  }

  /**
   * Removes a content-term edge.
   * @complexity O(1)
   */
  removeEdge(contentId: number, termId: number): void {
    this.termToContent.get(termId)?.delete(contentId);
    this.contentToTerms.get(contentId)?.delete(termId);
  }

  /**
   * Gets all content classified under a term.
   * content(t) = { c | (c, t) in E }
   *
   * @complexity O(1) for lookup, O(|result|) for copy
   */
  getContentByTerm(termId: number): Set<number> {
    return new Set(this.termToContent.get(termId) ?? []);
  }

  /**
   * Gets all terms classifying a content item.
   * terms(c) = { t | (c, t) in E }
   *
   * @complexity O(1) for lookup
   */
  getTermsByContent(contentId: number): Set<number> {
    return new Set(this.contentToTerms.get(contentId) ?? []);
  }

  /**
   * Gets content under a term including all descendants.
   * content*(t) = union_{t' <= t} content(t')
   *
   * @complexity O(|descendants| * avg_content_per_term)
   */
  getContentByTermWithDescendants(
    termId: number,
    descendants: Map<number, Set<number>>
  ): Set<number> {
    const result = new Set(this.getContentByTerm(termId));
    const termDescendants = descendants.get(termId);

    if (termDescendants) {
      for (const descendantId of termDescendants) {
        for (const contentId of this.getContentByTerm(descendantId)) {
          result.add(contentId);
        }
      }
    }

    return result;
  }

  /**
   * AND query: content with ALL specified terms.
   * content(t1 AND t2 AND ...) = intersection of content(ti)
   *
   * @complexity O(min(|content(ti)|) * k) where k = number of terms
   */
  queryAnd(termIds: number[]): Set<number> {
    if (termIds.length === 0) return new Set();

    // Start with smallest set for efficiency
    const contentSets = termIds.map(id => this.getContentByTerm(id));
    contentSets.sort((a, b) => a.size - b.size);

    let result = new Set(contentSets[0]);
    for (let i = 1; i < contentSets.length && result.size > 0; i++) {
      result = new Set([...result].filter(c => contentSets[i].has(c)));
    }

    return result;
  }

  /**
   * OR query: content with ANY specified term.
   * content(t1 OR t2 OR ...) = union of content(ti)
   *
   * @complexity O(sum(|content(ti)|))
   */
  queryOr(termIds: number[]): Set<number> {
    const result = new Set<number>();
    for (const termId of termIds) {
      for (const contentId of this.getContentByTerm(termId)) {
        result.add(contentId);
      }
    }
    return result;
  }

  /**
   * NOT query: content without specified term.
   * content(NOT t) = C \ content(t)
   *
   * @complexity O(|C|)
   */
  queryNot(termId: number, allContentIds: Set<number>): Set<number> {
    const withTerm = this.getContentByTerm(termId);
    return new Set([...allContentIds].filter(c => !withTerm.has(c)));
  }
}

// =============================================================================
// VOCABULARY MORPHISMS (CATEGORY THEORY)
// =============================================================================

/**
 * Vocabulary morphism: structure-preserving map between vocabularies.
 * phi: V1 -> V2 such that t1 <= t2 implies phi(t1) <= phi(t2)
 */
export interface VocabularyMorphism {
  sourceVocab: string;
  targetVocab: string;
  termMapping: Map<number, number>;  // source term ID -> target term ID
}

/**
 * Validates that a morphism preserves order structure.
 *
 * @param morphism - The morphism to validate
 * @param sourceTerms - Terms in source vocabulary
 * @param targetAncestors - Transitive closure in target vocabulary
 * @returns Whether the morphism is valid
 */
export function validateMorphism(
  morphism: VocabularyMorphism,
  sourceTerms: Term[],
  targetAncestors: Map<number, Set<number>>
): boolean {
  // Check that order is preserved:
  // If t1 <= t2 (t1 is descendant of t2), then phi(t1) <= phi(t2)
  for (const term of sourceTerms) {
    const mappedTerm = morphism.termMapping.get(term.id);
    if (mappedTerm === undefined) continue;

    for (const parentId of term.parentIds) {
      const mappedParent = morphism.termMapping.get(parentId);
      if (mappedParent === undefined) continue;

      // Check if mapped term is still a descendant of mapped parent
      const mappedAncestors = targetAncestors.get(mappedTerm);
      if (!mappedAncestors?.has(mappedParent) && mappedTerm !== mappedParent) {
        return false;  // Order not preserved
      }
    }
  }

  return true;
}

/**
 * Composes two morphisms: (g . f) = g after f
 *
 * @param f - First morphism (V1 -> V2)
 * @param g - Second morphism (V2 -> V3)
 * @returns Composed morphism (V1 -> V3)
 */
export function composeMorphisms(
  f: VocabularyMorphism,
  g: VocabularyMorphism
): VocabularyMorphism {
  if (f.targetVocab !== g.sourceVocab) {
    throw new Error('Morphism composition requires matching vocabularies');
  }

  const composed = new Map<number, number>();
  for (const [sourceId, midId] of f.termMapping) {
    const targetId = g.termMapping.get(midId);
    if (targetId !== undefined) {
      composed.set(sourceId, targetId);
    }
  }

  return {
    sourceVocab: f.sourceVocab,
    targetVocab: g.targetVocab,
    termMapping: composed,
  };
}

// =============================================================================
// FACETED SEARCH INDEX
// =============================================================================

/**
 * Optimized index for faceted (multi-vocabulary) search.
 */
export class FacetedSearchIndex {
  private vocabularies: Map<string, Vocabulary> = new Map();
  private termsByVocab: Map<string, Map<number, Term>> = new Map();
  private contentGraph: ContentTermGraph = new ContentTermGraph();
  private ancestorCache: Map<string, Map<number, Set<number>>> = new Map();
  private descendantCache: Map<string, Map<number, Set<number>>> = new Map();

  /**
   * Adds a vocabulary to the index.
   */
  addVocabulary(vocab: Vocabulary): void {
    this.vocabularies.set(vocab.id, vocab);
    this.termsByVocab.set(vocab.id, new Map(vocab.terms.map(t => [t.id, t])));
    this.ancestorCache.set(vocab.id, computeTransitiveClosure(vocab.terms));
    this.descendantCache.set(vocab.id, computeDescendants(vocab.terms));
  }

  /**
   * Indexes content with its term classifications.
   */
  indexContent(contentId: number, termIds: number[]): void {
    for (const termId of termIds) {
      this.contentGraph.addEdge(contentId, termId);
    }
  }

  /**
   * Faceted search: find content matching all specified facet values.
   *
   * @param facets - Map of vocabulary ID to term IDs
   * @param includeDescendants - Whether to include descendant terms
   * @returns Set of matching content IDs
   *
   * @example
   * // Find content with topic "ai" AND type "tutorial"
   * search({ topics: [aiTermId], types: [tutorialTermId] })
   */
  search(
    facets: Map<string, number[]>,
    includeDescendants: boolean = false
  ): Set<number> {
    const facetResults: Set<number>[] = [];

    for (const [vocabId, termIds] of facets) {
      let contentForFacet: Set<number>;

      if (includeDescendants) {
        const descendants = this.descendantCache.get(vocabId);
        if (descendants) {
          contentForFacet = new Set();
          for (const termId of termIds) {
            for (const c of this.contentGraph.getContentByTermWithDescendants(termId, descendants)) {
              contentForFacet.add(c);
            }
          }
        } else {
          contentForFacet = this.contentGraph.queryOr(termIds);
        }
      } else {
        contentForFacet = this.contentGraph.queryOr(termIds);
      }

      facetResults.push(contentForFacet);
    }

    // Intersect all facet results
    if (facetResults.length === 0) return new Set();

    facetResults.sort((a, b) => a.size - b.size);
    let result = facetResults[0];

    for (let i = 1; i < facetResults.length && result.size > 0; i++) {
      result = new Set([...result].filter(c => facetResults[i].has(c)));
    }

    return result;
  }

  /**
   * Gets facet counts for filtering UI.
   *
   * @param vocabId - Vocabulary to get counts for
   * @param baseContentIds - Optional base set to count within
   * @returns Map of term ID to content count
   */
  getFacetCounts(
    vocabId: string,
    baseContentIds?: Set<number>
  ): Map<number, number> {
    const counts = new Map<number, number>();
    const vocab = this.vocabularies.get(vocabId);

    if (!vocab) return counts;

    for (const term of vocab.terms) {
      const content = this.contentGraph.getContentByTerm(term.id);
      if (baseContentIds) {
        const filtered = [...content].filter(c => baseContentIds.has(c));
        counts.set(term.id, filtered.length);
      } else {
        counts.set(term.id, content.size);
      }
    }

    return counts;
  }
}

// =============================================================================
// QUERY LANGUAGE PARSER
// =============================================================================

/**
 * Query AST node types.
 */
export type QueryNode =
  | { type: 'term'; vocabId?: string; termName: string }
  | { type: 'and'; left: QueryNode; right: QueryNode }
  | { type: 'or'; left: QueryNode; right: QueryNode }
  | { type: 'not'; operand: QueryNode }
  | { type: 'descendants'; operand: QueryNode };

/**
 * Parses a taxonomy query string into an AST.
 *
 * Grammar:
 *   query     -> or_expr
 *   or_expr   -> and_expr ('OR' and_expr)*
 *   and_expr  -> unary ('AND' unary)*
 *   unary     -> 'NOT' unary | primary
 *   primary   -> term_ref | '(' query ')'
 *   term_ref  -> [vocab_id ':'] term_name ['/*']
 *
 * @param query - Query string like "topics:ai AND types:tutorial"
 * @returns Parsed AST
 */
export function parseQuery(query: string): QueryNode {
  const tokens = tokenizeQuery(query);
  let pos = 0;

  function current(): string | undefined {
    return tokens[pos];
  }

  function advance(): string {
    return tokens[pos++];
  }

  function expect(token: string): void {
    if (current() !== token) {
      throw new Error(`Expected '${token}' but found '${current()}'`);
    }
    advance();
  }

  function parseOrExpr(): QueryNode {
    let left = parseAndExpr();
    while (current()?.toUpperCase() === 'OR') {
      advance();
      const right = parseAndExpr();
      left = { type: 'or', left, right };
    }
    return left;
  }

  function parseAndExpr(): QueryNode {
    let left = parseUnary();
    while (current()?.toUpperCase() === 'AND') {
      advance();
      const right = parseUnary();
      left = { type: 'and', left, right };
    }
    return left;
  }

  function parseUnary(): QueryNode {
    if (current()?.toUpperCase() === 'NOT') {
      advance();
      return { type: 'not', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): QueryNode {
    if (current() === '(') {
      advance();
      const expr = parseOrExpr();
      expect(')');
      return expr;
    }
    return parseTermRef();
  }

  function parseTermRef(): QueryNode {
    const token = advance();
    if (!token) throw new Error('Unexpected end of query');

    let vocabId: string | undefined;
    let termName: string;

    if (token.includes(':')) {
      const [vocab, term] = token.split(':');
      vocabId = vocab;
      termName = term;
    } else {
      termName = token;
    }

    // Check for descendant wildcard
    if (termName.endsWith('/*')) {
      termName = termName.slice(0, -2);
      return { type: 'descendants', operand: { type: 'term', vocabId, termName } };
    }

    return { type: 'term', vocabId, termName };
  }

  return parseOrExpr();
}

/**
 * Tokenizes a query string.
 */
function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (const char of query) {
    if (char === '(' || char === ')') {
      if (current) tokens.push(current);
      tokens.push(char);
      current = '';
    } else if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) tokens.push(current);
  return tokens;
}

/**
 * Evaluates a query AST against the search index.
 *
 * @param ast - Query AST
 * @param index - Faceted search index
 * @param termResolver - Function to resolve term names to IDs
 * @param allContentIds - Set of all content IDs (for NOT queries)
 * @returns Set of matching content IDs
 */
export function evaluateQuery(
  ast: QueryNode,
  index: FacetedSearchIndex,
  termResolver: (vocabId: string | undefined, termName: string) => number | undefined,
  allContentIds: Set<number>
): Set<number> {
  switch (ast.type) {
    case 'term': {
      const termId = termResolver(ast.vocabId, ast.termName);
      if (termId === undefined) return new Set();
      return index['contentGraph'].getContentByTerm(termId);
    }

    case 'descendants': {
      if (ast.operand.type !== 'term') {
        throw new Error('Descendants operator requires a term');
      }
      const termId = termResolver(ast.operand.vocabId, ast.operand.termName);
      if (termId === undefined) return new Set();
      const descendants = index['descendantCache'].get(ast.operand.vocabId ?? '');
      if (descendants) {
        return index['contentGraph'].getContentByTermWithDescendants(termId, descendants);
      }
      return index['contentGraph'].getContentByTerm(termId);
    }

    case 'and': {
      const left = evaluateQuery(ast.left, index, termResolver, allContentIds);
      const right = evaluateQuery(ast.right, index, termResolver, allContentIds);
      return new Set([...left].filter(c => right.has(c)));
    }

    case 'or': {
      const left = evaluateQuery(ast.left, index, termResolver, allContentIds);
      const right = evaluateQuery(ast.right, index, termResolver, allContentIds);
      return new Set([...left, ...right]);
    }

    case 'not': {
      const operand = evaluateQuery(ast.operand, index, termResolver, allContentIds);
      return new Set([...allContentIds].filter(c => !operand.has(c)));
    }
  }
}

// =============================================================================
// RSES-VOCABULARY FUNCTOR
// =============================================================================

/**
 * Classification functor: maps RSES configs to vocabularies.
 * C: RSES -> Voc
 *
 * This is the functorial relationship between RSES rules and vocabulary structure.
 */
export class ClassificationFunctor {
  /**
   * Applies the functor to extract vocabularies from RSES classification.
   *
   * @param classification - RSES classification result
   * @returns Vocabulary membership tuples
   */
  static apply(classification: Classification): {
    topics: string[];
    types: string[];
    sets: string[];
  } {
    return {
      topics: classification.topics,
      types: classification.types,
      sets: classification.sets,
    };
  }

  /**
   * Creates term entries from classification results.
   *
   * @param classification - RSES classification
   * @param vocabularyMapping - Map of category to vocabulary ID
   * @returns Array of (vocabularyId, termName) pairs
   */
  static toTermMemberships(
    classification: Classification,
    vocabularyMapping: { topics: string; types: string; sets: string }
  ): Array<{ vocabularyId: string; termName: string }> {
    const memberships: Array<{ vocabularyId: string; termName: string }> = [];

    for (const topic of classification.topics) {
      memberships.push({ vocabularyId: vocabularyMapping.topics, termName: topic });
    }

    for (const type of classification.types) {
      memberships.push({ vocabularyId: vocabularyMapping.types, termName: type });
    }

    for (const set of classification.sets) {
      memberships.push({ vocabularyId: vocabularyMapping.sets, termName: set });
    }

    return memberships;
  }
}

// =============================================================================
// DECIDABILITY VALIDATORS
// =============================================================================

/**
 * Validates that a vocabulary forms a valid DAG (no cycles).
 *
 * @complexity O(V + E)
 * @returns Validation result with cycle path if invalid
 */
export function validateVocabularyDAG(terms: Term[]): {
  valid: boolean;
  cyclePath?: number[];
} {
  const visited = new Set<number>();
  const inStack = new Set<number>();
  const termMap = new Map(terms.map(t => [t.id, t]));

  function dfs(termId: number, path: number[]): number[] | null {
    if (inStack.has(termId)) {
      const cycleStart = path.indexOf(termId);
      return [...path.slice(cycleStart), termId];
    }

    if (visited.has(termId)) return null;

    visited.add(termId);
    inStack.add(termId);

    const term = termMap.get(termId);
    if (term) {
      for (const parentId of term.parentIds) {
        const cyclePath = dfs(parentId, [...path, termId]);
        if (cyclePath) return cyclePath;
      }
    }

    inStack.delete(termId);
    return null;
  }

  for (const term of terms) {
    if (!visited.has(term.id)) {
      const cyclePath = dfs(term.id, []);
      if (cyclePath) {
        return { valid: false, cyclePath };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates hierarchy type constraints.
 *
 * @param terms - Array of terms
 * @param hierarchyType - Expected hierarchy type (0=flat, 1=single, 2=multi)
 * @returns Validation result
 */
export function validateHierarchyType(
  terms: Term[],
  hierarchyType: 0 | 1 | 2
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const term of terms) {
    switch (hierarchyType) {
      case 0: // Flat - no parents allowed
        if (term.parentIds.length > 0) {
          violations.push(`Term '${term.name}' has parents in flat vocabulary`);
        }
        break;

      case 1: // Single parent - at most one parent
        if (term.parentIds.length > 1) {
          violations.push(`Term '${term.name}' has multiple parents in single-parent vocabulary`);
        }
        break;

      case 2: // Multi-parent - any number allowed
        break;
    }
  }

  return { valid: violations.length === 0, violations };
}

// All exports are declared inline with their definitions
