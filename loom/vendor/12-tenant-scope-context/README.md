# 12-tenant-scope-context

Tiny `AsyncLocalStorage`-based helper for binding a request to a tenant identifier (called `siteId` here) and asserting you're inside a bound scope. Three functions total; no dependencies outside Node built-ins.

## What it does

In a multi-tenant server, you want every DB query / cache lookup / side effect to know "which tenant is this request for?" — without threading that value through every function argument. `AsyncLocalStorage` is Node's built-in answer: set a value once per request, read it anywhere in the async chain for that request.

This file wraps that with three primitives:

- **`runInTenantScope(siteId, fn)`** — opens a scope with the given `siteId` and runs `fn()` inside it. Works with sync or async callbacks; the scope propagates through `await`, `Promise.resolve`, `setImmediate`, etc.
- **`getCurrentTenantScope()`** → `{ siteId } | undefined` — read the current scope, or `undefined` if none is bound.
- **`assertScoped(callerName)`** → `siteId` — assert a scope is bound and return its siteId. Throws with a caller-named error if not. Useful as a guard at the top of functions that require a tenant context.

## Why a whole directory for 71 lines

Because this is the piece that makes a multi-tenant convention cheap to follow. Once `runInTenantScope` is at the top of your request handler, any function deep in the call stack can do `const siteId = assertScoped("my-service"); ...` and fail loudly if someone forgot to bind the scope. It turns "forgot to pass siteId" from a silent correctness bug into a crash at the first deep function that checks.

## What's here

`src/tenant-scope-context.ts` — 71 lines.

Exports:
- `runInTenantScope<T>(siteId: string, fn: () => T | Promise<T>): T | Promise<T>`
- `getCurrentTenantScope(): { siteId: string } | undefined`
- `assertScoped(callerName: string): string`

## Dependencies

Runtime: `node:async_hooks` (built-in). No npm packages.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

Three tests:
- `throws outside any scope` — `assertScoped("test-job")` outside `runInTenantScope` throws with a message containing the caller name.
- `returns the bound siteId inside runInTenantScope` — `runInTenantScope("site-42", () => assertScoped(...))` returns `"site-42"`.
- `propagates through async boundaries` — scope survives `await Promise.resolve()` and `setImmediate`.

## Usage

```ts
import express from "express";
import { runInTenantScope, assertScoped, getCurrentTenantScope } from "./tenant-scope-context";

// In a request handler, open a scope per request:
app.use((req, res, next) => {
  const siteId = req.headers["x-site-id"] as string;
  if (!siteId) return res.status(400).send("missing X-Site-ID");
  runInTenantScope(siteId, () => next());
});

// Deep in the call stack, assert or read:
function auditLog(event: string) {
  const siteId = assertScoped("auditLog");
  // ... persist with siteId
}

// Optional read when scope may not be bound (e.g. background jobs):
function maybeAuditLog(event: string) {
  const scope = getCurrentTenantScope();
  if (scope) {
    // ...
  }
}
```

## Rename the field if you want

The function stores `{ siteId: string }`. If your tenant identifier is called `tenantId`, `orgId`, `workspaceId`, or anything else, change the literal in `scopeContext.run({ siteId }, fn)` and the type annotation on `AsyncLocalStorage<...>`. One rename in one file.

## Useful outside multi-tenancy

The same pattern works for any "request-scoped value you don't want to thread through arguments" — e.g. correlation IDs, auth tokens, feature flags, locale. If you want that, rename the field and repurpose. Most web frameworks grow their own version of this eventually; the version here is the minimum that works.

## Related

The parent repo's `server/lib/tenant-scoped.ts` adds a Drizzle-client wrapper on top of this file — it opens a DB transaction and sets a Postgres session variable matching the `siteId`, so Postgres row-level security can enforce tenancy at the DB layer. That larger file depends on the Drizzle client, the tenant-scoped-table registry, and the schema; it's not in the salvage because those deps don't transfer cleanly. If you're building your own multi-tenant app and want the DB-layer pattern, the structure to mimic is:

1. This file (salvage unit 12).
2. A `withDbSiteScope(siteId, fn)` helper in your own code that opens a transaction, sets `SET LOCAL app.current_site_id = $siteId`, then calls `fn(tx)`.
3. Postgres RLS policies keyed on `current_setting('app.current_site_id', true)`.

## Header comment

Retains the parent repo's provenance (`Phase 1 - Foundation Hardening`, ROADMAP M1.3). Accurate as history; cosmetic if you're porting. Strip at will.
