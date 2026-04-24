# 10-taxonomy-algebra

Set-theoretic and graph-theoretic operations over a taxonomy: terms arranged into a partially-ordered set (poset), classified content as a bipartite graph against terms, set operations on term selections, validation that the hierarchy is a DAG, and a small query parser for compound boolean queries over terms.

## What it actually is

Most of the "quantum taxonomy" / "ML taxonomy" files in the parent repo are facades over HTTP calls to public APIs. This file is the exception. It's a real implementation of standard set-and-graph algorithms with a small, coherent API. You could pull it into a taxonomy-using project (a CMS, a tag system, a knowledge base) and it would do something useful.

## What's here

`src/taxonomy-algebra.ts` — 945 lines, zero imports.

Types:
- **`Term`** — `{ id, name, vocabularyId, parentIds[], weight, metadata? }`. Terms form a poset via `parentIds`.
- **`Vocabulary`** — `{ id, label, hierarchy: 0|1|2, terms[] }`. Hierarchy types: 0 = flat, 1 = single-parent tree, 2 = multi-parent DAG.
- **`ClassifiableContent`** — `{ id, termIds[] }`. Content items that link to terms.
- **`Classification`** — result of applying rules (e.g. from the RSES engine) to content: `{ sets, topics, types }`.

Poset operations:
- **`computeTransitiveClosure(terms)`** → `Map<termId, Set<ancestorId>>`. All ancestors, reached by walking `parentIds` transitively. O(V·E).
- **`computeDescendants(terms)`** → `Map<termId, Set<descendantId>>`. Inverse of the closure.
- **`computeDepths(terms)`** → `Map<termId, number>`. Depth of each term from roots (roots = depth 0).
- **`findLCA(term1, term2, terms)`** — least common ancestor.

Set operations on term selections:
- **`termUnion / termIntersection / termDifference`** — on arrays of `Term`. Dedup by id.

Bipartite graph (content ↔ terms):
- **`ContentTermGraph`** class — indexes both directions. Methods: `addContent`, `removeContent`, `getContentByTerm(termId)`, `getTermsForContent(contentId)`, `contentCountPerTerm()`.

Morphisms between vocabularies:
- **`VocabularyMorphism`** — a structure-preserving map from one vocabulary to another.
- **`validateMorphism(morphism, source, target)`** — checks that the map preserves the parent relation.
- **`composeMorphisms(m1, m2)`** — composition of morphisms.

Faceted search:
- **`FacetedSearchIndex`** — builds an inverted index for faceted queries. Given a set of terms, lookup which content matches all facets (AND) or any facet (OR).

Query parser:
- **`QueryNode`** — AST union: `{ type: "term", termId }`, `{ type: "and" | "or", children[] }`, `{ type: "not", child }`, `{ type: "descendant-of", termId }`.
- **`parseQuery(query: string)`** → `QueryNode`. Parses a small query language, e.g. `topic:ai AND NOT type:deprecated`.
- **`evaluateQuery(queryNode, content, terms)`** — runs a query over content + terms using the algebra.

Classification as a functor:
- **`ClassificationFunctor`** — maps `Classification` objects (from the RSES engine) to selections of `Term`s. Useful if you're plumbing the RSES engine's output into a taxonomy system.

DAG validators:
- **`validateVocabularyDAG(terms)`** → `{ valid, cycles[], orphans[], errors[] }`. Detects cycles in the parent graph, orphan term IDs, and other structural issues. Runs before accepting a vocabulary.
- **`validateHierarchyType(terms, hierarchy)`** — checks that a vocabulary matches its declared hierarchy type (flat / single-parent / multi-parent).

## Dependencies

**None.** Zero imports. Pure TypeScript over Node built-ins.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

Test file is 639 lines covering the poset operations, set operations, `ContentTermGraph`, morphisms, faceted search, query parsing + evaluation, DAG validation, and edge cases (empty vocabularies, isolated terms, cycles, deeply nested hierarchies). Count not recited here — run the tests and the number is on the last line.

## Relationship to other salvage units

- **`01-rses-engine`** — the RSES engine produces a `Classification` (sets/topics/types string arrays). `ClassificationFunctor` in this file is the bridge from that output to a `Term[]` selection in a vocabulary. If you're using both units, the two fit together directly.
- **`11-taxonomy-query-engine`** (next unit, if salvaged) — a thin layer on top of this file that adds caching and a singleton-style query engine. Optional; you can use `parseQuery` + `evaluateQuery` from this unit directly without it.

## Header comment

File retains `@author SGT (Set-Graph Theorist Agent)` agent theater. This one happens to have content that matches the theater — the algorithms really are standard poset/DAG math — but the header comment is still performative. Strip at will.

## Provenance note

Of the ~4500 lines of "ML taxonomy" / "vector database" / "neural classifier" / "quantum taxonomy" code in the parent repo, this file and its test are the part that corresponds to something real. Those other files import nothing except HTTP fetch and mostly return mock data.
