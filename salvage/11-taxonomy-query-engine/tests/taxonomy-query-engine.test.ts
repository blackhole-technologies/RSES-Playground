/**
 * @file taxonomy-query-engine.test.ts
 * @description Tests for the taxonomy query engine.
 *              Validates query execution, optimization, and caching.
 * @author SGT (Set-Graph Theorist Agent)
 * @created 2026-02-01
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TaxonomyQueryEngine,
  getQueryEngine,
  resetQueryEngine,
  QueryResult,
} from '../src/taxonomy-query-engine';
import { Term, Vocabulary } from '../../10-taxonomy-algebra/src/taxonomy-algebra';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTopicsVocabulary(): Vocabulary {
  return {
    id: 'topics',
    label: 'Topics',
    hierarchy: 2, // Multi-parent
    terms: [
      { id: 1, name: 'programming', vocabularyId: 'topics', parentIds: [], weight: 0 },
      { id: 2, name: 'ai', vocabularyId: 'topics', parentIds: [1], weight: 0 },
      { id: 3, name: 'web', vocabularyId: 'topics', parentIds: [1], weight: 1 },
      { id: 4, name: 'ml', vocabularyId: 'topics', parentIds: [2], weight: 0 },
      { id: 5, name: 'nlp', vocabularyId: 'topics', parentIds: [2, 4], weight: 1 },
      { id: 6, name: 'frontend', vocabularyId: 'topics', parentIds: [3], weight: 0 },
      { id: 7, name: 'backend', vocabularyId: 'topics', parentIds: [3], weight: 1 },
    ],
  };
}

function createTypesVocabulary(): Vocabulary {
  return {
    id: 'types',
    label: 'Types',
    hierarchy: 0, // Flat
    terms: [
      { id: 10, name: 'article', vocabularyId: 'types', parentIds: [], weight: 0 },
      { id: 11, name: 'tutorial', vocabularyId: 'types', parentIds: [], weight: 1 },
      { id: 12, name: 'reference', vocabularyId: 'types', parentIds: [], weight: 2 },
    ],
  };
}

function createSetsVocabulary(): Vocabulary {
  return {
    id: 'sets',
    label: 'Sets',
    hierarchy: 0,
    terms: [
      { id: 20, name: 'published', vocabularyId: 'sets', parentIds: [], weight: 0 },
      { id: 21, name: 'draft', vocabularyId: 'sets', parentIds: [], weight: 1 },
      { id: 22, name: 'featured', vocabularyId: 'sets', parentIds: [], weight: 2 },
    ],
  };
}

interface TestContent {
  id: number;
  title: string;
  termIds: number[];
}

function createTestContent(): TestContent[] {
  return [
    { id: 1, title: 'Intro to ML', termIds: [2, 4, 11, 20] }, // ai, ml, tutorial, published
    { id: 2, title: 'React Guide', termIds: [3, 6, 11, 20] }, // web, frontend, tutorial, published
    { id: 3, title: 'NLP Deep Dive', termIds: [2, 4, 5, 10, 20, 22] }, // ai, ml, nlp, article, published, featured
    { id: 4, title: 'Backend Basics', termIds: [3, 7, 11, 21] }, // web, backend, tutorial, draft
    { id: 5, title: 'Python ML Reference', termIds: [1, 4, 12, 20] }, // programming, ml, reference, published
    { id: 6, title: 'AI Ethics', termIds: [2, 10, 21] }, // ai, article, draft
  ];
}

// =============================================================================
// QUERY ENGINE TESTS
// =============================================================================

describe('TaxonomyQueryEngine', () => {
  let engine: TaxonomyQueryEngine;
  let content: TestContent[];

  beforeEach(() => {
    engine = new TaxonomyQueryEngine();
    engine.loadVocabulary(createTopicsVocabulary());
    engine.loadVocabulary(createTypesVocabulary());
    engine.loadVocabulary(createSetsVocabulary());

    content = createTestContent();
    for (const c of content) {
      engine.indexContent(c.id, c.termIds);
    }
  });

  afterEach(() => {
    resetQueryEngine();
  });

  // ===========================================================================
  // BASIC QUERIES
  // ===========================================================================

  describe('Basic Queries', () => {
    it('should query by single term', () => {
      const result = engine.query('topics:ai');
      expect(result.contentIds).toEqual(new Set([1, 3, 6])); // Content with ai topic
    });

    it('should query by term in types vocabulary', () => {
      const result = engine.query('types:tutorial');
      expect(result.contentIds).toEqual(new Set([1, 2, 4]));
    });

    it('should return empty set for non-existent term', () => {
      const result = engine.query('topics:nonexistent');
      expect(result.contentIds.size).toBe(0);
    });
  });

  // ===========================================================================
  // AND QUERIES
  // ===========================================================================

  describe('AND Queries', () => {
    it('should query with AND operator', () => {
      const result = engine.query('topics:ai AND types:tutorial');
      expect(result.contentIds).toEqual(new Set([1])); // Intro to ML
    });

    it('should handle multiple AND conditions', () => {
      // Content with ai AND ml AND published:
      // Content 1: ai (2), ml (4), tutorial, published - YES
      // Content 3: ai (2), ml (4), nlp, article, published, featured - YES
      // Content 5: programming (1), ml (4), reference, published - NO (no ai term)
      const result = engine.query('topics:ai AND topics:ml AND sets:published');
      expect(result.contentIds).toEqual(new Set([1, 3]));
    });

    it('should return empty for impossible AND', () => {
      const result = engine.query('topics:ai AND topics:web');
      expect(result.contentIds.size).toBe(0); // No content has both
    });
  });

  // ===========================================================================
  // OR QUERIES
  // ===========================================================================

  describe('OR Queries', () => {
    it('should query with OR operator', () => {
      const result = engine.query('topics:frontend OR topics:backend');
      expect(result.contentIds).toEqual(new Set([2, 4]));
    });

    it('should handle multiple OR conditions', () => {
      const result = engine.query('types:article OR types:reference');
      expect(result.contentIds).toEqual(new Set([3, 5, 6]));
    });
  });

  // ===========================================================================
  // NOT QUERIES
  // ===========================================================================

  describe('NOT Queries', () => {
    it('should query with NOT operator', () => {
      const result = engine.query('NOT sets:draft');
      // All content except drafts (4, 6)
      expect(result.contentIds).toEqual(new Set([1, 2, 3, 5]));
    });

    it('should combine NOT with AND', () => {
      const result = engine.query('topics:ai AND NOT sets:draft');
      expect(result.contentIds).toEqual(new Set([1, 3])); // AI content that isn't draft
    });
  });

  // ===========================================================================
  // DESCENDANT QUERIES
  // ===========================================================================

  describe('Descendant Queries', () => {
    it('should include descendants with wildcard', () => {
      // topics:ai/* should include ai and all descendants (ml, nlp)
      const result = engine.query('topics:ai/*');
      // Content with ai, ml, or nlp
      expect(result.contentIds).toEqual(new Set([1, 3, 5, 6]));
    });

    it('should work with programming and all descendants', () => {
      // programming is root, should include all topic content
      const result = engine.query('topics:programming/*');
      expect(result.contentIds).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    });
  });

  // ===========================================================================
  // COMPLEX QUERIES
  // ===========================================================================

  describe('Complex Queries', () => {
    it('should handle parenthesized expressions', () => {
      const result = engine.query('(topics:ai OR topics:web) AND sets:published');
      // AI or web content that is published
      expect(result.contentIds).toEqual(new Set([1, 2, 3]));
    });

    it('should handle deeply nested queries', () => {
      const result = engine.query('(topics:ai AND (types:article OR types:tutorial)) AND sets:published');
      expect(result.contentIds).toEqual(new Set([1, 3]));
    });
  });

  // ===========================================================================
  // FACETED SEARCH
  // ===========================================================================

  describe('Faceted Search', () => {
    it('should perform faceted search', () => {
      const result = engine.facetedSearch({
        topics: ['ai'],
        types: ['tutorial'],
      });
      expect(result.contentIds).toEqual(new Set([1]));
    });

    it('should handle multiple values per facet (OR within facet)', () => {
      const result = engine.facetedSearch({
        types: ['article', 'reference'],
      });
      expect(result.contentIds).toEqual(new Set([3, 5, 6]));
    });

    it('should include descendants when requested', () => {
      const result = engine.facetedSearch({ topics: ['ai'] }, true);
      // Should include content with ai, ml, or nlp
      expect(result.contentIds.size).toBeGreaterThan(
        engine.facetedSearch({ topics: ['ai'] }, false).contentIds.size
      );
    });
  });

  // ===========================================================================
  // FACET COUNTS
  // ===========================================================================

  describe('Facet Counts', () => {
    it('should return correct facet counts', () => {
      const counts = engine.getFacetCounts('topics');

      // programming: 1 content (Python ML Reference)
      expect(counts.get(1)?.count).toBe(1);

      // ai: 3 content (Intro to ML, NLP Deep Dive, AI Ethics)
      expect(counts.get(2)?.count).toBe(3);

      // ml: 3 content (Intro to ML, NLP Deep Dive, Python ML Reference)
      expect(counts.get(4)?.count).toBe(3);
    });

    it('should filter counts by base query', () => {
      // Get topic counts for published content only
      const counts = engine.getFacetCounts('topics', 'sets:published');

      // ai published: 2 (Intro to ML, NLP Deep Dive)
      expect(counts.get(2)?.count).toBe(2);
    });
  });

  // ===========================================================================
  // HIERARCHY NAVIGATION
  // ===========================================================================

  describe('Hierarchy Navigation', () => {
    it('should get ancestors', () => {
      const nlpTerm = engine.resolveTerm('topics', 'nlp');
      const ancestors = engine.getAncestors(nlpTerm!.id);

      // nlp -> (ai, ml), ai -> programming, ml -> ai -> programming
      expect(ancestors.has(2)).toBe(true); // ai
      expect(ancestors.has(4)).toBe(true); // ml
      expect(ancestors.has(1)).toBe(true); // programming
    });

    it('should get descendants', () => {
      const aiTerm = engine.resolveTerm('topics', 'ai');
      const descendants = engine.getDescendants(aiTerm!.id);

      // ai has descendants: ml, nlp
      expect(descendants.has(4)).toBe(true); // ml
      expect(descendants.has(5)).toBe(true); // nlp
    });

    it('should get children', () => {
      const aiTerm = engine.resolveTerm('topics', 'ai');
      const children = engine.getChildren(aiTerm!.id);

      expect(children.length).toBe(2);
      expect(children.map(c => c.name)).toContain('ml');
      expect(children.map(c => c.name)).toContain('nlp');
    });

    it('should get path from root', () => {
      const nlpTerm = engine.resolveTerm('topics', 'nlp');
      const path = engine.getPath(nlpTerm!.id);

      // nlp has multiple parents, path follows first parent
      expect(path[0].name).toBe('programming');
      expect(path[path.length - 1].name).toBe('nlp');
    });

    it('should get depth', () => {
      expect(engine.getDepth(1)).toBe(0); // programming (root)
      expect(engine.getDepth(2)).toBe(1); // ai
      expect(engine.getDepth(4)).toBe(2); // ml
      expect(engine.getDepth(5)).toBe(3); // nlp (max depth through ml)
    });
  });

  // ===========================================================================
  // CONTENT OPERATIONS
  // ===========================================================================

  describe('Content Operations', () => {
    it('should get terms by content', () => {
      const terms = engine.getTermsByContent(3); // NLP Deep Dive
      const termNames = terms.map(t => t.name);

      expect(termNames).toContain('ai');
      expect(termNames).toContain('ml');
      expect(termNames).toContain('nlp');
      expect(termNames).toContain('article');
      expect(termNames).toContain('published');
      expect(termNames).toContain('featured');
    });

    it('should update content terms', () => {
      engine.updateContentTerms(1, [3, 6, 10, 20]); // Change to web/frontend

      const result = engine.query('topics:ai');
      expect(result.contentIds.has(1)).toBe(false);

      const result2 = engine.query('topics:frontend');
      expect(result2.contentIds.has(1)).toBe(true);
    });

    it('should remove content', () => {
      engine.removeContent(1);

      const result = engine.query('topics:ai');
      expect(result.contentIds.has(1)).toBe(false);
    });
  });

  // ===========================================================================
  // CACHING
  // ===========================================================================

  describe('Caching', () => {
    it('should cache query results', () => {
      const result1 = engine.query('topics:ai');
      expect(result1.fromCache).toBe(false);

      const result2 = engine.query('topics:ai');
      expect(result2.fromCache).toBe(true);
      expect(result2.contentIds).toEqual(result1.contentIds);
    });

    it('should invalidate cache on content change', () => {
      const result1 = engine.query('topics:ai');
      expect(result1.fromCache).toBe(false);

      engine.indexContent(100, [2]); // Add new AI content

      const result2 = engine.query('topics:ai');
      expect(result2.fromCache).toBe(false);
      expect(result2.contentIds.has(100)).toBe(true);
    });

    it('should clear cache manually', () => {
      engine.query('topics:ai');
      engine.clearCache();

      const result = engine.query('topics:ai');
      expect(result.fromCache).toBe(false);
    });
  });

  // ===========================================================================
  // PAGINATION
  // ===========================================================================

  describe('Pagination', () => {
    it('should paginate results', () => {
      const queryResult = engine.query('sets:published');

      const page1 = engine.paginate(
        queryResult.contentIds,
        { offset: 0, limit: 2 },
        (id) => content.find(c => c.id === id)
      );

      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(4);
      expect(page1.hasMore).toBe(true);

      const page2 = engine.paginate(
        queryResult.contentIds,
        { offset: 2, limit: 2 },
        (id) => content.find(c => c.id === id)
      );

      expect(page2.items.length).toBe(2);
      expect(page2.hasMore).toBe(false);
    });
  });

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  describe('Statistics', () => {
    it('should return engine statistics', () => {
      const stats = engine.getStats();

      expect(stats.vocabularyCount).toBe(3);
      expect(stats.contentCount).toBe(6);
      expect(stats.termCount).toBe(13); // 7 topics + 3 types + 3 sets
    });
  });
});

// =============================================================================
// GLOBAL ENGINE TESTS
// =============================================================================

describe('Global Query Engine', () => {
  afterEach(() => {
    resetQueryEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getQueryEngine();
    const engine2 = getQueryEngine();
    expect(engine1).toBe(engine2);
  });

  it('should reset singleton', () => {
    const engine1 = getQueryEngine();
    resetQueryEngine();
    const engine2 = getQueryEngine();
    expect(engine1).not.toBe(engine2);
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('Performance', () => {
  it('should handle large vocabulary efficiently', () => {
    const engine = new TaxonomyQueryEngine();

    // Create vocabulary with 1000 terms
    const terms: Term[] = [];
    for (let i = 0; i < 1000; i++) {
      terms.push({
        id: i,
        name: `term_${i}`,
        vocabularyId: 'large',
        parentIds: i > 0 ? [Math.floor(i / 10)] : [], // 10-ary tree
        weight: i,
      });
    }

    const start = performance.now();
    engine.loadVocabulary({ id: 'large', label: 'Large', hierarchy: 1, terms });
    const loadTime = performance.now() - start;

    // Should load in reasonable time (< 1 second)
    expect(loadTime).toBeLessThan(1000);
  });

  it('should handle many content items efficiently', () => {
    const engine = new TaxonomyQueryEngine();
    const terms: Term[] = [
      { id: 1, name: 'term1', vocabularyId: 'v', parentIds: [], weight: 0 },
      { id: 2, name: 'term2', vocabularyId: 'v', parentIds: [], weight: 1 },
      { id: 3, name: 'term3', vocabularyId: 'v', parentIds: [], weight: 2 },
    ];
    engine.loadVocabulary({ id: 'v', label: 'V', hierarchy: 0, terms });

    // Index 10000 content items
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      engine.indexContent(i, [1, 2, 3].filter(() => Math.random() > 0.5));
    }
    const indexTime = performance.now() - start;

    // Should index in reasonable time (< 2 seconds)
    expect(indexTime).toBeLessThan(2000);

    // Query should be fast
    const queryStart = performance.now();
    const result = engine.query('v:term1 AND v:term2');
    const queryTime = performance.now() - queryStart;

    expect(queryTime).toBeLessThan(100); // < 100ms
    expect(result.contentIds.size).toBeGreaterThan(0);
  });
});
