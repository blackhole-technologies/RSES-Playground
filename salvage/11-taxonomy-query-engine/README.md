# 11-taxonomy-query-engine

High-level query engine over a taxonomy: compound boolean queries, query-plan cost estimation, result caching, pagination. Sits on top of `10-taxonomy-algebra`.

## Pair-dependency notice

**This unit requires `10-taxonomy-algebra` as a peer directory.** Every other salvage unit so far has been self-contained; this one is not. The query engine uses 10 named symbols from the algebra (types, classes, and functions), and duplicating the 945-line `taxonomy-algebra.ts` into this directory would be worse than declaring a cross-unit dependency honestly.

The import inside this unit looks like:

```ts
import { Term, Vocabulary, ContentTermGraph, ... } from "../../10-taxonomy-algebra/src/taxonomy-algebra";
```

If you move this unit into a different project, you need to take `10-taxonomy-algebra` with you and preserve the relative path — or change that import to point wherever you put the algebra.

## What it adds on top of the algebra

The algebra (`10-`) already has `parseQuery`, `evaluateQuery`, `ContentTermGraph`, and `FacetedSearchIndex`. Those are enough for one-off queries. This unit adds:

- **A stable `TaxonomyQueryEngine` class** that holds onto indexed vocabularies + content + content-term graph. You register your data once and run many queries against it.
- **Query-plan cost estimation** — before executing a compound query, the engine estimates rows returned and picks between index-based evaluation and iteration.
- **Result caching** — identical queries served from an LRU cache. Useful when the same facet combinations get evaluated repeatedly.
- **Pagination helpers** — offset/limit over query results, with a `hasMore` flag.
- **A richer `QueryOperation` union** than the algebra's `QueryNode` — adds `termWithDescendants` (transitive closure in the query itself), `vocabulary` (subset of a single vocabulary), `all`, and `none` for edge cases.
- **Module singleton** via `getQueryEngine()` / `resetQueryEngine()` — if you want one per process. Use the class directly if you want to manage lifetime yourself.

## What's here

`src/taxonomy-query-engine.ts` — 857 lines. Imports from the adjacent `10-taxonomy-algebra` unit.

Exports:
- **`TaxonomyQueryEngine`** — the core class. Public methods include `registerVocabulary(v)`, `registerContent(content)`, `registerContentTerms(contentId, termIds)`, `executeQuery(operation, options?)`, `buildPlan(operation)`, `invalidateCache()`.
- **`QueryOperation`** — typed union of all supported query shapes.
- **`QueryPlan`** — `{ operation, estimatedCost, estimatedResults, useIndex }`.
- **`QueryResult`** — `{ contentIds: Set<number>, plan: QueryPlan, executionTimeMs: number, fromCache: boolean }`.
- **`PaginationOptions`** / **`PaginatedResult<T>`** — standard `{ limit, offset }` + `{ items, total, hasMore }`.
- **`getQueryEngine()` / `resetQueryEngine()`** — module singleton.

## Dependencies

Runtime: `10-taxonomy-algebra` peer. No npm packages beyond Node built-ins.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

The test file (518 lines) registers vocabularies + content + term relationships, then exercises every `QueryOperation` variant, compound AND/OR/NOT queries, the transitive-closure variant, cache hit behavior, cache invalidation, and pagination. Count not recited here — run and see.

## If you only need one of 10 / 11

You probably only need `10-taxonomy-algebra`. The algebra's `parseQuery` + `evaluateQuery` handle 80% of what `TaxonomyQueryEngine` does, with no caching or plan estimation. This unit is worth adding if:

- You run the same facet combinations a lot (caching pays off).
- You have enough content that `evaluateQuery` walking the whole graph every time is noticeable.
- You want the indexed register-once-query-many pattern.

If none of those apply, skip this unit and use the algebra directly.

## Header comment

File retains `@author SGT (Set-Graph Theorist Agent)`. Same note as `10-taxonomy-algebra`: the content mostly matches the theater (the algorithms are real), but the header is still performative. Strip at will.
