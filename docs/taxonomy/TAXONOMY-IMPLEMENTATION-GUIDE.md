# RSES Taxonomy System - Implementation Guide

**Author:** Set-Graph Theorist Agent (SGT)
**Date:** 2026-02-01

## Overview

This document provides a practical guide to using the set-theoretic taxonomy implementation for the RSES CMS system. The implementation is based on the formal mathematical foundations documented in `SET-GRAPH-THEORY-FORMALIZATION.md`.

## Architecture

```
                    +---------------------+
                    |  RSES Configuration |
                    |  (rules, sets,      |
                    |   compound sets)    |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    | Classification      |
                    | Functor            |
                    | (RSES -> Voc)      |
                    +----------+----------+
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
        +---------+      +---------+      +---------+
        | Topics  |      | Types   |      | Sets    |
        | Vocab   |      | Vocab   |      | Vocab   |
        +---------+      +---------+      +---------+
              |                |                |
              +----------------+----------------+
                               |
                               v
                    +---------------------+
                    |  Content-Term       |
                    |  Bipartite Graph    |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    |  Query Engine       |
                    |  (AND, OR, NOT,     |
                    |   faceted search)   |
                    +---------------------+
```

## Core Components

### 1. Taxonomy Algebra (`server/lib/taxonomy-algebra.ts`)

Set-theoretic operations on taxonomies:

```typescript
import {
  Term,
  Vocabulary,
  computeTransitiveClosure,
  computeDescendants,
  findLCA,
  termUnion,
  termIntersection,
  ContentTermGraph,
  FacetedSearchIndex,
  parseQuery,
  ClassificationFunctor,
  validateVocabularyDAG,
} from './taxonomy-algebra';
```

### 2. Query Engine (`server/lib/taxonomy-query-engine.ts`)

High-performance query execution:

```typescript
import {
  TaxonomyQueryEngine,
  getQueryEngine,
} from './taxonomy-query-engine';

const engine = getQueryEngine();
```

## Usage Examples

### Loading Vocabularies

```typescript
const engine = getQueryEngine();

// Load a hierarchical vocabulary
const topicsVocab: Vocabulary = {
  id: 'topics',
  label: 'Topics',
  hierarchy: 2, // 0=flat, 1=single-parent, 2=multi-parent
  terms: [
    { id: 1, name: 'programming', vocabularyId: 'topics', parentIds: [], weight: 0 },
    { id: 2, name: 'ai', vocabularyId: 'topics', parentIds: [1], weight: 0 },
    { id: 3, name: 'ml', vocabularyId: 'topics', parentIds: [2], weight: 0 },
  ],
};

engine.loadVocabulary(topicsVocab);
```

### Indexing Content

```typescript
// Index content with its term classifications
engine.indexContent(contentId: 123, termIds: [1, 2, 10, 20]);

// Update content terms
engine.updateContentTerms(123, [3, 4, 11, 21]);

// Remove content
engine.removeContent(123);
```

### Simple Queries

```typescript
// Query by single term
const result = engine.query('topics:ai');
console.log(result.contentIds); // Set of content IDs

// Query execution metadata
console.log(result.executionTimeMs);
console.log(result.fromCache);
```

### Compound Queries

```typescript
// AND query: content with BOTH terms
const andResult = engine.query('topics:ai AND types:tutorial');

// OR query: content with EITHER term
const orResult = engine.query('topics:ai OR topics:web');

// NOT query: content WITHOUT term
const notResult = engine.query('NOT sets:draft');

// Complex nested queries
const complex = engine.query('(topics:ai OR topics:ml) AND types:article AND NOT sets:draft');
```

### Descendant Queries

```typescript
// Include all descendants of a term with /*
const withDescendants = engine.query('topics:ai/*');
// Matches: ai, ml, nlp, deep-learning, etc.
```

### Faceted Search

```typescript
// Search across multiple vocabulary facets
const facetedResult = engine.facetedSearch({
  topics: ['ai', 'ml'],      // OR within facet
  types: ['article'],         // AND between facets
}, includeDescendants: true);

// Get facet counts for UI
const topicCounts = engine.getFacetCounts('topics');
// Map<termId, { term: Term, count: number }>

// Get facet counts filtered by a base query
const filteredCounts = engine.getFacetCounts('topics', 'sets:published');
```

### Hierarchy Navigation

```typescript
// Get term ancestors (transitive closure)
const ancestors = engine.getAncestors(termId);

// Get term descendants
const descendants = engine.getDescendants(termId);

// Get immediate children
const children = engine.getChildren(termId);

// Get path from root to term
const path = engine.getPath(termId);

// Get term depth
const depth = engine.getDepth(termId);
```

### Pagination

```typescript
const queryResult = engine.query('topics:ai/*');

const page = engine.paginate(
  queryResult.contentIds,
  { offset: 0, limit: 20 },
  (id) => contentRepository.get(id) // Your content fetcher
);

console.log(page.items);    // Content items for this page
console.log(page.total);    // Total matching items
console.log(page.hasMore);  // Whether more pages exist
```

## RSES Integration

### Classification Functor

The `ClassificationFunctor` maps RSES classification results to vocabulary memberships:

```typescript
import { ClassificationFunctor } from './taxonomy-algebra';

// From RSES classification result
const rsesResult = {
  sets: ['ai_generated', 'published'],
  topics: ['ai', 'tools'],
  types: ['tutorial'],
};

// Convert to vocabulary memberships
const memberships = ClassificationFunctor.toTermMemberships(rsesResult, {
  topics: 'topics',
  types: 'types',
  sets: 'sets',
});

// memberships = [
//   { vocabularyId: 'topics', termName: 'ai' },
//   { vocabularyId: 'topics', termName: 'tools' },
//   { vocabularyId: 'types', termName: 'tutorial' },
//   { vocabularyId: 'sets', termName: 'ai_generated' },
//   { vocabularyId: 'sets', termName: 'published' },
// ]
```

### Syncing with RSES

```typescript
import { syncVocabularyWithRses, classifyContent } from './cms/rses-integration';

// Sync vocabulary terms from RSES config
const syncResult = await syncVocabularyWithRses({
  vocabularyId: 'topics',
  configId: 1,
  dryRun: false,
});

// Classify individual content
const classification = await classifyContent({
  contentId: 123,
  configId: 1,
  updateTaxonomy: true,
  createSymlinks: true,
});
```

## Validation

### DAG Validation

Ensure vocabulary hierarchies don't contain cycles:

```typescript
import { validateVocabularyDAG, validateHierarchyType } from './taxonomy-algebra';

// Check for cycles
const dagResult = validateVocabularyDAG(terms);
if (!dagResult.valid) {
  console.error('Cycle detected:', dagResult.cyclePath);
}

// Validate hierarchy type constraints
const typeResult = validateHierarchyType(terms, 1); // 1 = single-parent
if (!typeResult.valid) {
  console.error('Hierarchy violations:', typeResult.violations);
}
```

### Vocabulary Morphisms

Validate structure-preserving mappings between vocabularies:

```typescript
import { validateMorphism, composeMorphisms } from './taxonomy-algebra';

const morphism: VocabularyMorphism = {
  sourceVocab: 'v1',
  targetVocab: 'v2',
  termMapping: new Map([[1, 10], [2, 20]]),
};

const isValid = validateMorphism(morphism, sourceTerms, targetAncestors);
```

## Performance Considerations

### Complexity Guarantees

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| Load vocabulary | O(V * E) | O(V + E) |
| Index content | O(T) | O(1) |
| Simple query | O(1) | O(R) |
| AND query | O(min(|S_i|) * k) | O(min(|S_i|)) |
| OR query | O(sum(|S_i|)) | O(sum(|S_i|)) |
| Descendant query | O(D) | O(D) |
| Transitive closure | O(V * E) | O(V^2) |

Where:
- V = number of terms
- E = number of parent-child edges
- T = terms per content
- R = result size
- k = number of query operands
- D = descendants of term

### Caching

The query engine includes an LRU cache for query results:

```typescript
// Cache is invalidated automatically on content changes
engine.indexContent(id, terms);  // Invalidates cache

// Manual cache control
engine.clearCache();

// Cache statistics
const stats = engine.getStats();
console.log(stats.cacheStats.hitRate);
```

### Index Structures

The implementation uses:
- **Hash indexes** for O(1) term lookup by name/ID
- **Adjacency lists** for parent/child navigation
- **Inverted indexes** for term-to-content lookup
- **Pre-computed transitive closures** for ancestor queries

## Query Language Reference

### Grammar

```
query       ::= or_expr
or_expr     ::= and_expr ('OR' and_expr)*
and_expr    ::= unary ('AND' unary)*
unary       ::= 'NOT' unary | primary
primary     ::= term_ref | '(' query ')'
term_ref    ::= [vocab_id ':'] term_name ['/*']
```

### Examples

| Query | Meaning |
|-------|---------|
| `topics:ai` | Content with topic "ai" |
| `topics:ai/*` | Content with "ai" or any descendant |
| `topics:ai AND types:tutorial` | Content with both |
| `topics:ai OR topics:web` | Content with either |
| `NOT sets:draft` | Content without "draft" |
| `(a OR b) AND c` | Complex expression |
| `ai` | "ai" in any vocabulary |

## Error Handling

```typescript
try {
  const result = engine.query('invalid::: query');
} catch (error) {
  // Query parsing errors
  console.error('Invalid query:', error.message);
}

const dagResult = validateVocabularyDAG(terms);
if (!dagResult.valid) {
  // Cycle in vocabulary hierarchy
  throw new Error(`Cyclic dependency: ${dagResult.cyclePath.join(' -> ')}`);
}
```

## Testing

Run the test suite:

```bash
npx vitest run tests/taxonomy-algebra.test.ts tests/taxonomy-query-engine.test.ts
```

The test suite covers:
- Poset operations (transitive closure, LCA, depths)
- Set operations (union, intersection, difference)
- Content-term graph operations
- Faceted search
- Query parsing and execution
- Vocabulary validation
- Performance benchmarks

## Files

| File | Description |
|------|-------------|
| `server/lib/taxonomy-algebra.ts` | Core set-theoretic operations |
| `server/lib/taxonomy-query-engine.ts` | Query execution engine |
| `server/cms/rses-integration.ts` | RSES-CMS integration |
| `shared/cms/types.ts` | Type definitions |
| `docs/SET-GRAPH-THEORY-FORMALIZATION.md` | Mathematical foundations |
| `tests/taxonomy-algebra.test.ts` | Algebra tests |
| `tests/taxonomy-query-engine.test.ts` | Engine tests |
