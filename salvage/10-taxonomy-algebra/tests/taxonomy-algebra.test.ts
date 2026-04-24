/**
 * @file taxonomy-algebra.test.ts
 * @description Tests for set-theoretic taxonomy operations.
 *              Validates formal guarantees from SET-GRAPH-THEORY-FORMALIZATION.md
 * @author SGT (Set-Graph Theorist Agent)
 * @created 2026-02-01
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Term,
  Vocabulary,
  computeTransitiveClosure,
  computeDescendants,
  computeDepths,
  findLCA,
  termUnion,
  termIntersection,
  termDifference,
  ContentTermGraph,
  FacetedSearchIndex,
  parseQuery,
  ClassificationFunctor,
  validateVocabularyDAG,
  validateHierarchyType,
  VocabularyMorphism,
  validateMorphism,
  composeMorphisms,
} from '../src/taxonomy-algebra';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestTerms(): Term[] {
  return [
    { id: 1, name: 'programming', vocabularyId: 'topics', parentIds: [], weight: 0 },
    { id: 2, name: 'languages', vocabularyId: 'topics', parentIds: [1], weight: 0 },
    { id: 3, name: 'frameworks', vocabularyId: 'topics', parentIds: [1], weight: 1 },
    { id: 4, name: 'python', vocabularyId: 'topics', parentIds: [2], weight: 0 },
    { id: 5, name: 'javascript', vocabularyId: 'topics', parentIds: [2], weight: 1 },
    { id: 6, name: 'react', vocabularyId: 'topics', parentIds: [3, 5], weight: 0 }, // Multi-parent
    { id: 7, name: 'django', vocabularyId: 'topics', parentIds: [3, 4], weight: 1 }, // Multi-parent
  ];
}

function createTestVocabulary(): Vocabulary {
  return {
    id: 'topics',
    label: 'Topics',
    hierarchy: 2, // Multi-parent
    terms: createTestTerms(),
  };
}

// =============================================================================
// POSET OPERATIONS TESTS
// =============================================================================

describe('Poset Operations', () => {
  describe('computeTransitiveClosure', () => {
    it('should compute all ancestors correctly', () => {
      const terms = createTestTerms();
      const ancestors = computeTransitiveClosure(terms);

      // Root has no ancestors
      expect(ancestors.get(1)?.size).toBe(0);

      // Direct child has one ancestor
      expect(ancestors.get(2)?.has(1)).toBe(true);
      expect(ancestors.get(2)?.size).toBe(1);

      // Grandchild has two ancestors
      expect(ancestors.get(4)?.has(2)).toBe(true);
      expect(ancestors.get(4)?.has(1)).toBe(true);
      expect(ancestors.get(4)?.size).toBe(2);

      // Multi-parent term has all ancestors from both paths
      // react (6) has parents: frameworks (3), javascript (5)
      // frameworks -> programming
      // javascript -> languages -> programming
      expect(ancestors.get(6)?.has(3)).toBe(true);
      expect(ancestors.get(6)?.has(5)).toBe(true);
      expect(ancestors.get(6)?.has(1)).toBe(true);
      expect(ancestors.get(6)?.has(2)).toBe(true);
    });

    it('should handle empty input', () => {
      const ancestors = computeTransitiveClosure([]);
      expect(ancestors.size).toBe(0);
    });
  });

  describe('computeDescendants', () => {
    it('should compute all descendants correctly', () => {
      const terms = createTestTerms();
      const descendants = computeDescendants(terms);

      // Root has all other terms as descendants
      expect(descendants.get(1)?.size).toBe(6);

      // Languages has python, javascript, react (through js), django (through python)
      expect(descendants.get(2)?.has(4)).toBe(true);
      expect(descendants.get(2)?.has(5)).toBe(true);
      expect(descendants.get(2)?.has(6)).toBe(true);
      expect(descendants.get(2)?.has(7)).toBe(true);

      // Leaf nodes have no descendants
      expect(descendants.get(6)?.size).toBe(0);
      expect(descendants.get(7)?.size).toBe(0);
    });
  });

  describe('computeDepths', () => {
    it('should compute correct depths', () => {
      const terms = createTestTerms();
      const depths = computeDepths(terms);

      expect(depths.get(1)).toBe(0); // Root
      expect(depths.get(2)).toBe(1); // Direct child
      expect(depths.get(4)).toBe(2); // Grandchild

      // Multi-parent: depth is max parent depth + 1
      // react has parents frameworks (depth 1) and javascript (depth 2)
      expect(depths.get(6)).toBe(3);
    });
  });

  describe('findLCA', () => {
    it('should find lowest common ancestor', () => {
      const terms = createTestTerms();
      const ancestors = computeTransitiveClosure(terms);

      // LCA of python (4) and javascript (5)
      // python ancestors: languages (2), programming (1)
      // javascript ancestors: languages (2), programming (1)
      // Common: languages, programming
      // Lowest: languages (2) - but findLCA finds the lowest among common ancestors
      // which depends on the algorithm - it returns ancestors that have no descendants in common
      const lca1 = findLCA(4, 5, ancestors);
      // Both languages (2) and programming (1) are common, languages is lower
      expect(lca1.length).toBeGreaterThan(0);
      // The lowest should be languages (2), but the algorithm returns root if no descendant check
      expect(lca1).toContain(2); // languages is the LCA

      // LCA of python (4) and frameworks (3)
      // python ancestors: languages (2), programming (1)
      // frameworks ancestors: programming (1)
      // Common: programming (1)
      const lca2 = findLCA(4, 3, ancestors);
      expect(lca2).toContain(1); // programming

      // LCA of react (6) and django (7)
      // react ancestors: frameworks (3), javascript (5), languages (2), programming (1)
      // django ancestors: frameworks (3), python (4), languages (2), programming (1)
      // Common: frameworks (3), languages (2), programming (1)
      // Lowest among common: frameworks (3) - because neither languages nor programming is a descendant of frameworks
      const lca3 = findLCA(6, 7, ancestors);
      expect(lca3).toContain(3); // frameworks
    });

    it('should return the ancestor when one is ancestor of other', () => {
      const terms = createTestTerms();
      const ancestors = computeTransitiveClosure(terms);

      // python (4) and languages (2) where languages is ancestor of python
      // python ancestors: languages (2), programming (1)
      // languages ancestors: programming (1)
      // Common (including both terms): {python, languages} intersect {languages, programming} + both terms
      // = {languages, programming} + {4, 2}
      // The findLCA adds terms themselves to the set, so languages (2) should be in result
      const lca = findLCA(4, 2, ancestors);
      expect(lca).toContain(2); // languages is the LCA (and is one of the terms)
    });
  });
});

// =============================================================================
// SET OPERATIONS TESTS
// =============================================================================

describe('Set Operations', () => {
  const terms1: Term[] = [
    { id: 1, name: 'a', vocabularyId: 'v', parentIds: [], weight: 0 },
    { id: 2, name: 'b', vocabularyId: 'v', parentIds: [], weight: 0 },
    { id: 3, name: 'c', vocabularyId: 'v', parentIds: [], weight: 0 },
  ];

  const terms2: Term[] = [
    { id: 2, name: 'b', vocabularyId: 'v', parentIds: [], weight: 0 },
    { id: 3, name: 'c', vocabularyId: 'v', parentIds: [], weight: 0 },
    { id: 4, name: 'd', vocabularyId: 'v', parentIds: [], weight: 0 },
  ];

  describe('termUnion', () => {
    it('should compute union correctly', () => {
      const union = termUnion(terms1, terms2);
      expect(union.length).toBe(4);
      expect(union.map(t => t.id).sort()).toEqual([1, 2, 3, 4]);
    });
  });

  describe('termIntersection', () => {
    it('should compute intersection correctly', () => {
      const intersection = termIntersection(terms1, terms2);
      expect(intersection.length).toBe(2);
      expect(intersection.map(t => t.id).sort()).toEqual([2, 3]);
    });
  });

  describe('termDifference', () => {
    it('should compute difference correctly', () => {
      const diff = termDifference(terms1, terms2);
      expect(diff.length).toBe(1);
      expect(diff[0].id).toBe(1);
    });
  });
});

// =============================================================================
// CONTENT-TERM GRAPH TESTS
// =============================================================================

describe('ContentTermGraph', () => {
  let graph: ContentTermGraph;

  beforeEach(() => {
    graph = new ContentTermGraph();
    // Content 1: terms 1, 2
    graph.addEdge(1, 1);
    graph.addEdge(1, 2);
    // Content 2: terms 2, 3
    graph.addEdge(2, 2);
    graph.addEdge(2, 3);
    // Content 3: terms 1, 3
    graph.addEdge(3, 1);
    graph.addEdge(3, 3);
  });

  describe('getContentByTerm', () => {
    it('should return correct content for each term', () => {
      expect(graph.getContentByTerm(1)).toEqual(new Set([1, 3]));
      expect(graph.getContentByTerm(2)).toEqual(new Set([1, 2]));
      expect(graph.getContentByTerm(3)).toEqual(new Set([2, 3]));
    });
  });

  describe('getTermsByContent', () => {
    it('should return correct terms for each content', () => {
      expect(graph.getTermsByContent(1)).toEqual(new Set([1, 2]));
      expect(graph.getTermsByContent(2)).toEqual(new Set([2, 3]));
      expect(graph.getTermsByContent(3)).toEqual(new Set([1, 3]));
    });
  });

  describe('queryAnd', () => {
    it('should return content with ALL terms', () => {
      // Content with terms 1 AND 2: only content 1
      expect(graph.queryAnd([1, 2])).toEqual(new Set([1]));

      // Content with terms 2 AND 3: only content 2
      expect(graph.queryAnd([2, 3])).toEqual(new Set([2]));

      // Content with terms 1 AND 3: only content 3
      expect(graph.queryAnd([1, 3])).toEqual(new Set([3]));

      // Content with all three terms: none
      expect(graph.queryAnd([1, 2, 3])).toEqual(new Set());
    });
  });

  describe('queryOr', () => {
    it('should return content with ANY term', () => {
      // Content with term 1 OR 2: contents 1, 2, 3
      expect(graph.queryOr([1, 2])).toEqual(new Set([1, 2, 3]));

      // Content with term 3: contents 2, 3
      expect(graph.queryOr([3])).toEqual(new Set([2, 3]));
    });
  });

  describe('queryNot', () => {
    it('should return content WITHOUT term', () => {
      const allContent = new Set([1, 2, 3]);

      // Content without term 1: contents 2
      expect(graph.queryNot(1, allContent)).toEqual(new Set([2]));

      // Content without term 2: content 3
      expect(graph.queryNot(2, allContent)).toEqual(new Set([3]));
    });
  });

  describe('edge removal', () => {
    it('should remove edges correctly', () => {
      graph.removeEdge(1, 2);
      expect(graph.getTermsByContent(1)).toEqual(new Set([1]));
      expect(graph.getContentByTerm(2)).toEqual(new Set([2]));
    });
  });
});

// =============================================================================
// FACETED SEARCH TESTS
// =============================================================================

describe('FacetedSearchIndex', () => {
  let index: FacetedSearchIndex;

  beforeEach(() => {
    index = new FacetedSearchIndex();

    // Topics vocabulary
    const topics: Vocabulary = {
      id: 'topics',
      label: 'Topics',
      hierarchy: 1,
      terms: [
        { id: 1, name: 'ai', vocabularyId: 'topics', parentIds: [], weight: 0 },
        { id: 2, name: 'web', vocabularyId: 'topics', parentIds: [], weight: 0 },
        { id: 3, name: 'ml', vocabularyId: 'topics', parentIds: [1], weight: 0 },
      ],
    };

    // Types vocabulary
    const types: Vocabulary = {
      id: 'types',
      label: 'Types',
      hierarchy: 0,
      terms: [
        { id: 10, name: 'article', vocabularyId: 'types', parentIds: [], weight: 0 },
        { id: 11, name: 'tutorial', vocabularyId: 'types', parentIds: [], weight: 0 },
      ],
    };

    index.addVocabulary(topics);
    index.addVocabulary(types);

    // Content 1: ai, tutorial
    index.indexContent(1, [1, 11]);
    // Content 2: web, article
    index.indexContent(2, [2, 10]);
    // Content 3: ai, ml, article
    index.indexContent(3, [1, 3, 10]);
    // Content 4: web, tutorial
    index.indexContent(4, [2, 11]);
  });

  describe('search', () => {
    it('should find content with single facet', () => {
      const result = index.search(new Map([['topics', [1]]])); // ai
      expect(result).toEqual(new Set([1, 3]));
    });

    it('should find content with multiple facets (AND)', () => {
      // ai AND tutorial
      const result = index.search(new Map([
        ['topics', [1]],
        ['types', [11]],
      ]));
      expect(result).toEqual(new Set([1]));
    });

    it('should include descendants when requested', () => {
      // ai/* (includes ml)
      const result = index.search(new Map([['topics', [1]]]), true);
      expect(result).toEqual(new Set([1, 3])); // Both ai and ml content
    });
  });

  describe('getFacetCounts', () => {
    it('should return correct counts', () => {
      const counts = index.getFacetCounts('topics');
      expect(counts.get(1)).toBe(2); // ai: content 1, 3
      expect(counts.get(2)).toBe(2); // web: content 2, 4
      expect(counts.get(3)).toBe(1); // ml: content 3
    });

    it('should filter counts by base content', () => {
      const baseContent = new Set([1, 2]); // Only consider content 1 and 2
      const counts = index.getFacetCounts('topics', baseContent);
      expect(counts.get(1)).toBe(1); // ai: only content 1
      expect(counts.get(2)).toBe(1); // web: only content 2
    });
  });
});

// =============================================================================
// QUERY PARSER TESTS
// =============================================================================

describe('Query Parser', () => {
  describe('parseQuery', () => {
    it('should parse simple term reference', () => {
      const ast = parseQuery('topics:ai');
      expect(ast).toEqual({ type: 'term', vocabId: 'topics', termName: 'ai' });
    });

    it('should parse AND expression', () => {
      const ast = parseQuery('topics:ai AND types:tutorial');
      expect(ast.type).toBe('and');
      if (ast.type === 'and') {
        expect(ast.left).toEqual({ type: 'term', vocabId: 'topics', termName: 'ai' });
        expect(ast.right).toEqual({ type: 'term', vocabId: 'types', termName: 'tutorial' });
      }
    });

    it('should parse OR expression', () => {
      const ast = parseQuery('topics:ai OR topics:web');
      expect(ast.type).toBe('or');
    });

    it('should parse NOT expression', () => {
      const ast = parseQuery('NOT topics:draft');
      expect(ast.type).toBe('not');
      if (ast.type === 'not') {
        expect(ast.operand).toEqual({ type: 'term', vocabId: 'topics', termName: 'draft' });
      }
    });

    it('should parse descendant wildcard', () => {
      const ast = parseQuery('topics:ai/*');
      expect(ast.type).toBe('descendants');
      if (ast.type === 'descendants') {
        expect(ast.operand).toEqual({ type: 'term', vocabId: 'topics', termName: 'ai' });
      }
    });

    it('should parse parenthesized expressions', () => {
      const ast = parseQuery('(topics:ai OR topics:web) AND types:tutorial');
      expect(ast.type).toBe('and');
    });

    it('should handle term without vocabulary prefix', () => {
      const ast = parseQuery('ai');
      expect(ast).toEqual({ type: 'term', vocabId: undefined, termName: 'ai' });
    });
  });
});

// =============================================================================
// VOCABULARY MORPHISM TESTS
// =============================================================================

describe('Vocabulary Morphisms', () => {
  describe('validateMorphism', () => {
    it('should validate order-preserving morphism', () => {
      const sourceTerms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v1', parentIds: [], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v1', parentIds: [1], weight: 0 },
      ];

      const targetTerms: Term[] = [
        { id: 10, name: 'x', vocabularyId: 'v2', parentIds: [], weight: 0 },
        { id: 20, name: 'y', vocabularyId: 'v2', parentIds: [10], weight: 0 },
      ];

      const targetAncestors = computeTransitiveClosure(targetTerms);

      // Valid morphism: preserves order
      const validMorphism: VocabularyMorphism = {
        sourceVocab: 'v1',
        targetVocab: 'v2',
        termMapping: new Map([[1, 10], [2, 20]]),
      };

      expect(validateMorphism(validMorphism, sourceTerms, targetAncestors)).toBe(true);

      // Invalid morphism: violates order (child maps to parent)
      const invalidMorphism: VocabularyMorphism = {
        sourceVocab: 'v1',
        targetVocab: 'v2',
        termMapping: new Map([[1, 20], [2, 10]]), // Swapped
      };

      expect(validateMorphism(invalidMorphism, sourceTerms, targetAncestors)).toBe(false);
    });
  });

  describe('composeMorphisms', () => {
    it('should compose morphisms correctly', () => {
      const f: VocabularyMorphism = {
        sourceVocab: 'v1',
        targetVocab: 'v2',
        termMapping: new Map([[1, 10], [2, 20]]),
      };

      const g: VocabularyMorphism = {
        sourceVocab: 'v2',
        targetVocab: 'v3',
        termMapping: new Map([[10, 100], [20, 200]]),
      };

      const composed = composeMorphisms(f, g);

      expect(composed.sourceVocab).toBe('v1');
      expect(composed.targetVocab).toBe('v3');
      expect(composed.termMapping.get(1)).toBe(100);
      expect(composed.termMapping.get(2)).toBe(200);
    });

    it('should throw on vocabulary mismatch', () => {
      const f: VocabularyMorphism = {
        sourceVocab: 'v1',
        targetVocab: 'v2',
        termMapping: new Map(),
      };

      const g: VocabularyMorphism = {
        sourceVocab: 'v3', // Mismatch!
        targetVocab: 'v4',
        termMapping: new Map(),
      };

      expect(() => composeMorphisms(f, g)).toThrow();
    });
  });
});

// =============================================================================
// CLASSIFICATION FUNCTOR TESTS
// =============================================================================

describe('ClassificationFunctor', () => {
  describe('apply', () => {
    it('should extract classification categories', () => {
      const classification = {
        sets: ['ai_generated', 'published'],
        topics: ['ai', 'tools'],
        types: ['tutorial'],
      };

      const result = ClassificationFunctor.apply(classification);

      expect(result.topics).toEqual(['ai', 'tools']);
      expect(result.types).toEqual(['tutorial']);
      expect(result.sets).toEqual(['ai_generated', 'published']);
    });
  });

  describe('toTermMemberships', () => {
    it('should create term membership tuples', () => {
      const classification = {
        sets: ['published'],
        topics: ['ai'],
        types: ['article'],
      };

      const mapping = {
        topics: 'topics_vocab',
        types: 'types_vocab',
        sets: 'sets_vocab',
      };

      const memberships = ClassificationFunctor.toTermMemberships(classification, mapping);

      expect(memberships).toContainEqual({ vocabularyId: 'topics_vocab', termName: 'ai' });
      expect(memberships).toContainEqual({ vocabularyId: 'types_vocab', termName: 'article' });
      expect(memberships).toContainEqual({ vocabularyId: 'sets_vocab', termName: 'published' });
    });
  });
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('Validation', () => {
  describe('validateVocabularyDAG', () => {
    it('should validate acyclic vocabulary', () => {
      const terms = createTestTerms();
      const result = validateVocabularyDAG(terms);
      expect(result.valid).toBe(true);
    });

    it('should detect direct cycle', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [1], weight: 0 }, // Self-reference
      ];
      const result = validateVocabularyDAG(terms);
      expect(result.valid).toBe(false);
      expect(result.cyclePath).toBeDefined();
    });

    it('should detect indirect cycle', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [2], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v', parentIds: [1], weight: 0 },
      ];
      const result = validateVocabularyDAG(terms);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateHierarchyType', () => {
    it('should validate flat hierarchy', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v', parentIds: [], weight: 0 },
      ];
      const result = validateHierarchyType(terms, 0);
      expect(result.valid).toBe(true);
    });

    it('should reject parents in flat hierarchy', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v', parentIds: [1], weight: 0 },
      ];
      const result = validateHierarchyType(terms, 0);
      expect(result.valid).toBe(false);
    });

    it('should validate single-parent hierarchy', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v', parentIds: [1], weight: 0 },
      ];
      const result = validateHierarchyType(terms, 1);
      expect(result.valid).toBe(true);
    });

    it('should reject multiple parents in single-parent hierarchy', () => {
      const terms: Term[] = [
        { id: 1, name: 'a', vocabularyId: 'v', parentIds: [], weight: 0 },
        { id: 2, name: 'b', vocabularyId: 'v', parentIds: [], weight: 0 },
        { id: 3, name: 'c', vocabularyId: 'v', parentIds: [1, 2], weight: 0 },
      ];
      const result = validateHierarchyType(terms, 1);
      expect(result.valid).toBe(false);
    });

    it('should allow multiple parents in multi-parent hierarchy', () => {
      const terms = createTestTerms(); // Has multi-parent terms
      const result = validateHierarchyType(terms, 2);
      expect(result.valid).toBe(true);
    });
  });
});
