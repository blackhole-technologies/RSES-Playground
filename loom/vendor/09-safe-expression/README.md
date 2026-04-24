# 09-safe-expression

Safe evaluator for simple expressions — comparisons, arithmetic, logical ops, variable lookups — without calling into any dynamic-code-execution primitive. Designed for user-authored conditions in feature-flag rules, automation triggers, and similar "rule engine" surfaces.

## Why this exists

The parent repo originally had two places that evaluated user-provided strings as code: the RSES boolean parser (a different surface — see `01-rses-engine`) and the workflow engine inside `server/services/automation/`. The workflow engine accepted conditions like `user.plan == "pro" && count > 5` and evaluated them by constructing functions from strings at runtime. That's a code-injection vector: any user who can author a condition can run arbitrary JavaScript in the server.

This file replaced that. Same expression surface for users, zero dynamic code construction — it's a hand-written recursive-descent parser over a small grammar.

The 2026-04-14 security hardening pass added three DoS limits on top of the original implementation:
- **`MAX_EXPRESSION_LENGTH = 4096`** — caps input size.
- **`MAX_PARSE_DEPTH = 64`** — caps recursion depth for deeply nested parens.
- **`MAX_OPERATIONS = 10_000`** — caps total evaluation steps. Bounds cost regardless of input shape.
- **Division / modulo by zero** — coerced to `undefined` instead of returning `Infinity` or `NaN`, so weird numeric results can't silently leak through into business logic.

## What's here

`src/safe-expression.ts` — 506 lines, one file plus the local logger stub.

Exports:
- **`safeEvaluate(expression, context)`** — parse + evaluate an expression against a context object; returns the computed value or `undefined` on parse error / evaluation error / DoS-limit breach. Never throws on hostile input (the limits log at `warn` and return `undefined`).
- **`safeEvaluateBoolean(expression, context)`** — thin wrapper that coerces the result to `boolean`. `undefined → false`, truthy/falsy coerced.
- **`ExpressionLimitError`** — error class thrown internally by the parser when limits are exceeded. Callers don't see it (the wrapper catches); exposed mainly so tests can assert the behavior.

Expression grammar (precedence low → high):

```
expression      := logical_or
logical_or      := logical_and ("||" logical_and)*
logical_and     := comparison ("&&" comparison)*
comparison      := additive (("==" | "!=" | "<" | ">" | "<=" | ">=") additive)?
additive        := multiplicative (("+" | "-") multiplicative)*
multiplicative  := unary (("*" | "/" | "%") unary)*
unary           := ("!" | "-")? primary
primary         := NUMBER | STRING | BOOLEAN | identifier | "(" expression ")"
identifier      := IDENT ("." IDENT)*                  # supports user.plan style lookups
```

Strings: double or single quotes. Booleans: `true` / `false`. Numbers: integers and decimals.

No function calls. No regex. No string concatenation (use `+` and it coerces numerically). No assignment.

## Dependencies

Runtime: only Node built-ins.

The original imported `createModuleLogger` from the parent repo's logger; replaced here with `logger-stub.ts` (same pattern as `06-circuit-breaker` / `08-queue`).

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

Test file covers the DoS limits (oversized input, deeply nested parens, expression bombs), the divide/modulo-by-zero coercion, and normal evaluation of each precedence level. Count not recited here; run the tests and the number is on the last line.

## Usage

```ts
import { safeEvaluate, safeEvaluateBoolean } from "./safe-expression";

const context = { user: { plan: "pro" }, count: 7 };

safeEvaluate(`user.plan == "pro" && count > 5`, context); // => true
safeEvaluate(`count * 2`, context);                        // => 14
safeEvaluate(`count / 0`, context);                        // => undefined (not Infinity)

// Hostile input is bounded:
safeEvaluate("(" .repeat(100000) + "1" + ")".repeat(100000), {}); // => undefined, logs warn
```

## What this is not

- **Not a full scripting language.** Grammar is deliberately narrow. If your condition needs more than what's listed above, this is the wrong tool.
- **Not related to the `boolean-parser` in `01-rses-engine`.** That one evaluates *set membership* expressions (`$tools & $claude`, `$ai_generated | !$deprecated`) over a set of active names. This one evaluates typed expressions over an attribute context. Different surfaces, different grammars.

## Header comment

File retains `@phase Phase 1 - Security Fix (hardened 2026-04-14)` — accurate history, not agent theater in this case. Leave or strip as you like.
