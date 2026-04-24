# 02-feature-flags

Feature-flag evaluation engine. LaunchDarkly-style flag rules — percentage rollouts, targeting rules with attribute matching, flag dependencies, A/B test variants — as a library you can embed.

## Scope: library, not service

This salvage unit is deliberately narrower than `server/services/feature-flags/` in the parent repo. The parent subsystem is ~11 files covering evaluation + Postgres storage + Express routes + WebSocket bridge + edge cache + site-scoped tenant wrapper. That's an integrated subsystem, not a library. It drags in Drizzle, ioredis, Express, the multi-tenant registry, the custom logger, and the WebSocket server.

What's here is the **core evaluation logic** — the 3 files that hold the business rules, with test coverage, and zero dependency on the parent repo's server infrastructure:

- **`evaluator.ts`** — `TargetingRuleEvaluator` (rule operators: `equals`, `contains`, `regex`, `greater_than`, etc. over a user/site attribute context) and `PercentageRolloutEvaluator` (stable bucketing via SHA-256 hash of user ID + seed). This is what decides "is flag X enabled for this evaluation context?"
- **`dependency-resolver.ts`** — `FeatureDependencyResolver` computes whether a flag can be enabled given its dependency chain, detects cycles, returns what would break if you disabled a flag with dependents.
- **`storage.ts`** — in-memory implementation of the flag storage interface. For tests, for embedding in a single-process service, or as a starting point before you wire up your own persistence.

## What's NOT here (and why)

- **`pg-storage.ts`** — Postgres storage adapter via Drizzle. Requires the parent repo's `db.ts` client + `tenant-scoped.ts` multi-tenant helpers + `sql-utils.ts`. Those pull in the whole server. If you want persistence, write an implementation of `IFeatureFlagStorage` (in `src/types.ts`) against your own DB layer.
- **`routes.ts` / `site-routes.ts`** — Express routers. Require the parent repo's auth, RBAC middleware, site context middleware. Easy to rewrite against whatever framework you're using.
- **`edge-cache.ts`** — Redis-backed cache for flag evaluations. Depends on `ioredis`. Bolt this on if you need it.
- **`ws-bridge.ts`** — pushes flag-change events over WebSocket. Depends on the parent repo's WS server abstraction.
- **`site-scoped.ts`** — wraps the service for multi-tenant use. Assumes the parent repo's AsyncLocalStorage-based `SiteContext`. Whatever multi-tenant model you use, this is the layer to rewrite.
- **`index.ts`** — the factory that wires everything together. Because the integration bits above aren't here, the factory isn't either. You'd wire it up against your own infrastructure.

## Files

`src/`:
- `shared-types.ts` — copy of the parent repo's `shared/admin/types.ts`. Zod schemas and TypeScript types for `FeatureFlag`, `SiteFeatureOverride`, `UserFeatureOverride`, `PercentageRollout`, `TargetingRule`, `FeatureDependency`, `EvaluationContext`, `EvaluationResult`, etc. Plus rollout event types, usage stats, and a few unrelated admin-dashboard types that came along in the same file (dashboard layouts, site health, resource usage). You can trim those if you don't need them.
- `dependency-types.ts` — `FeatureDependencyNode` and `DependencyResolution` interfaces. Extracted from the parent repo's `shared/admin/schema.ts` (the rest of that file is Drizzle table definitions irrelevant to this library).
- `types.ts` — internal service types, mostly the `IFeatureFlagStorage`, `IFeatureFlagEvaluator`, `IFeatureDependencyResolver`, and event interfaces. Copied from `server/services/feature-flags/types.ts`.
- `logger-stub.ts` — a minimal `createModuleLogger(name)` that forwards to `console.*`. The parent repo uses pino; a stub keeps this library logger-agnostic. Replace with your own logger of choice.
- `evaluator.ts` — copied with imports rewritten.
- `dependency-resolver.ts` — copied with imports rewritten.
- `storage.ts` — copied with imports rewritten.

`tests/` (vitest):
- `evaluator.test.ts` — targeting rule operators, percentage rollout bucketing, edge cases
- `dependency-resolver.test.ts` — cycle detection, can-enable logic, dependency-chain traversal
- `storage.test.ts` — in-memory storage CRUD, bulk operations, search, targeting rule CRUD

## Dependencies

Runtime: `zod` (for the schema-derived types — several exports from `shared-types.ts` are Zod schemas at runtime).

Tests: `vitest` (dev-dep).

## Running tests

```bash
npm install --save-dev vitest
npm install zod
npx vitest run tests/
```

## Notes on quirks

- `shared-types.ts` (565 lines) has more in it than this library needs — it's the parent repo's full admin-dashboard type surface. If you only need the flag types, you can delete `SiteHealthStatus`, `ResourceUsage`, `SiteConfig`, `SiteAction`, `BulkOperation`, `WidgetType`, `WidgetConfig`, `DashboardLayout`, `FeatureUsageStats`, and `RolloutEvent` without affecting the three salvaged source files. Keep: `FeatureCategory`, `PercentageRollout`, `ABTestVariant`, `ABTestConfig`, `TargetingRule`, `FeatureDependency`, `FeatureFlag`, `SiteFeatureOverride`, `UserFeatureOverride`, `EvaluationContext` (defined elsewhere in the file).
- `storage.ts` is 840 lines because it's a full-featured in-memory store: CRUD, bulk ops, search with filters, rollout history, targeting rule management, etc. If you want the minimum-viable storage, the CRUD part is ~150 lines; the rest can be trimmed.
- File headers carry `@author UI Development Expert Agent` tags — from the parent repo's process, not meaningful here. Remove at leisure.
