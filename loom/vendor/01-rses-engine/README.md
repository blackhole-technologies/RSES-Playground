# 01-rses-engine

The RSES (Rule-based Symlink Execution System) pattern and rule engine. This is what the project was originally built for, before anything else was grafted on.

## What it does

Parses an RSES config file and answers two questions about a given file path:

1. Which **sets** match this path? (glob/pattern matching)
2. Which **topic** and **type** classifications apply? (rule evaluation against boolean expressions)

The config format looks roughly like:

```
[defaults]
auto_topic = false
auto_type = false
delimiter = -

[sets]
tools     = *-tool | tool-*
tutorials = *-tutorial | *-guide
web       = *-web | web-* | *-html

[sets.attributes]
ai_generated    = {source = *}
claude_projects = {source = claude}

[sets.compound]
ai_tools = $ai_generated & $tools

[rules.topic]
$ai_generated      -> ai/$source
$tools & $claude   -> tools/claude
```

`RsesParser.test(config, filepath)` returns the matched sets, derived attributes, and the resolved `topic` / `type` / `filetype` values according to the rules.

## What's in here

`src/`:
- **`rses.ts`** — the main parser and evaluator. Public surface: `RsesParser` class, `deriveAttributesFromPath()`, `resolveRuleResult()`.
- **`boolean-parser.ts`** — safe boolean expression evaluator. Recursive-descent parser supporting `true`, `false`, `&`, `|`, `!`, `(`, `)` and `$name` references. Replaces an earlier implementation that relied on dynamic code evaluation (a code-injection risk).
- **`cycle-detector.ts`** — topological sort over compound set definitions. Rejects configs where `$a = $b & $c` and `$b = $a | $d` would recurse forever. Returns a safe evaluation order when the graph is acyclic.
- **`redos-checker.ts`** — catastrophic-backtracking detection for regex patterns. Refuses to compile patterns with nested quantifiers (`(a+)+`), overlapping alternations (`(a|a)+`), and similar ReDoS shapes.
- **`regex-cache.ts`** — LRU cache for compiled `RegExp` objects. Patterns that survive `redos-checker.ts` are compiled once and reused.
- **`types.ts`** — contains the `ValidationError` interface that `rses.ts` returns. Extracted from the parent repo's `@shared/schema` so this directory is self-contained.

`tests/` — six vitest files:
- `boolean-parser.test.ts` — exhaustive tests for the expression evaluator (precedence, short-circuit, parens, undefined variables, rejection of non-allowed tokens).
- `rses-parser-security.test.ts` — security-focused tests for malformed/malicious configs.
- `cycle-detector.test.ts` — cycle rejection, topological order, deeply nested graphs.
- `redos-checker.test.ts` — pattern safety analysis.
- `symbol-namespace.test.ts` — collision rules between patterns, attributes, and compound sets.
- `performance.test.ts` — smoke-level perf checks (regex cache hit rate, parse-time bounds on large configs).

## Dependencies

Runtime: none. Zero imports from anywhere outside this directory.

Tests: `vitest` (dev-dep).

TypeScript: anything recent. No strict version requirement.

## Running tests

```bash
# from the root of this subdirectory
npm install --save-dev vitest
npx vitest run tests/
```

If you want to integrate this into an existing project, drop `src/` into your `src/lib/` (or equivalent) and `tests/` into your test tree.

## What it is not

- It is not a CMS.
- It is not a content classifier in the ML sense.
- It does not call any AI services.
- It does not touch a database.
- It does not depend on Express, React, or any framework. It is a pure TypeScript library.

## Notes on quirks

- File headers carry `@author` tags naming agent personas (`SGT`, `SEC`, etc.). These are from the parent repo's process and don't affect runtime. Remove at your leisure.
- `rses.ts` is the largest file (~1000 lines). It's reasonable-quality TypeScript but would benefit from being split into `parser/`, `evaluator/`, and `types/` if you intend to extend it.
- The parser understands path-derived attributes via `deriveAttributesFromPath()`, which currently only recognizes the `by-ai/{source}/...` convention. If you need other path conventions, that function is the single place to extend.
