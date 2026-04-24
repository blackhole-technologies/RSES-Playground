# 07-suggestion-engine

"Did you mean?" for the RSES engine. Given a filename that didn't match any set/topic/type/filetype rule in an RSES config, propose the closest named match based on string similarity.

Conceptually an extension of `01-rses-engine/`. Uses two type shapes from that unit (`RsesConfig`, `TestMatchResponse`) — extracted into this unit's own `types.ts` to keep the directory self-contained, but if you're using both units you'd want to dedupe.

## What's here

`src/suggestion-engine.ts` — 314 lines.

Exports:
- **`Suggestion`** — `{ value, confidence, reason, type }` where `type` is `"set" | "topic" | "type" | "filetype"` and `confidence` is 0–1.
- **`ExtendedTestResult extends TestMatchResponse`** — adds `_unmatched`, `suggestions[]`, `prefix`, `suffix`. Returned when a filename failed to match; `suggestions` is ranked by confidence.
- **`levenshteinDistance(a, b)`** — standard edit distance via dynamic programming. O(|a|·|b|) time, O(|b|·|a|) space.
- **`similarity(a, b)`** — `1 - levenshteinDistance / max(|a|,|b|)`. Case-insensitive. Returns 1 for empty strings.
- **`hasCommonPrefix(a, b, minLength = 2)`** — case-insensitive prefix check.
- **`hasCommonSuffix(a, b, minLength = 2)`** — case-insensitive suffix check.
- **`extractPrefix(filename)` / `extractSuffix(filename)`** — heuristics to pull apart `{prefix}-{name}-{suffix}` style file/project names.
- **`generateSuggestions(filename, config, result)`** — the main function. Walks the `sets` / `rules.topic` / `rules.type` / `rules.filetype` in the config, scores each candidate by similarity to the input filename, returns a ranked `Suggestion[]` with reasons like "matches prefix 'tool'" or "Levenshtein similarity 0.78".
- **`createExtendedResult(filename, config, result)`** — wraps a `TestMatchResponse` into `ExtendedTestResult`, adding `_unmatched`, `suggestions`, and prefix/suffix when nothing matched.

`src/types.ts` — the two interfaces imported from the RSES engine (`RsesConfig`, `TestMatchResponse`). Same content as `01-rses-engine/src/rses.ts` and `01-rses-engine/src/types.ts` for those two types. If you use both units in the same project, delete this file and import from `01-rses-engine` directly.

## Dependencies

Runtime: none. Pure TypeScript, no npm packages outside Node built-ins.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

One test file (covers levenshteinDistance, similarity, prefix/suffix detection, suggestion generation for each of the four categories, ranking by confidence, and the empty-input edge cases).

## What this is not

- Not a classifier. It doesn't decide what a file *is*. It proposes candidates after the RSES engine has already failed to match.
- Not ML. No model, no embeddings. Pure string similarity.
- Not ordered semantically. "cat" and "dog" look very different to Levenshtein; this engine cares about lexical shape, not meaning.

## Useful outside RSES?

The `levenshteinDistance` and `similarity` helpers are general-purpose — 30 lines each, well-tested, no dependencies. If you just want edit distance and don't care about the rest of this unit, copy those two functions.

## Header comment

File retains `@phase Phase 5 - Prompting & Learning` from the parent repo. Strip at will.
