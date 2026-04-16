# RSES-Playground

A multi-site CMS scaffold built on Express + React + Drizzle, with a real
kernel module system, a working CQRS/Event-Sourcing core, and a
production-grade build/deploy pipeline. Currently in **Phase 1.5** of a
multi-phase plan.

> **Status:** This README is honest. For the authoritative current state see
> [`docs/STATUS-LATEST.md`](docs/STATUS-LATEST.md). For what's coming next see
> [`docs/ROADMAP-LATEST.md`](docs/ROADMAP-LATEST.md). For the long-term
> vision see [`docs/plans/CMS-MASTER-PLAN-FINAL.md`](docs/plans/CMS-MASTER-PLAN-FINAL.md)
> — treat that document as 24-month aspiration, not a 4-week plan.

---

## What this project actually is today

- **A kernel module system** (`server/kernel/`) — real DI container, semver
  dependency resolution, event bus with wildcards, API gateway with per-route
  auth/permission/scope checks. Single-process, designed for **first-party
  modules only** (see [`docs/security/TRUST-MODEL.md`](docs/security/TRUST-MODEL.md)).
- **A CQRS/Event-Sourcing core** (`server/cqrs-es/`) — in-memory append-only
  event store with optimistic concurrency, command/query buses with retry and
  middleware, sagas, an actor model, Reactive Streams. Swap-ready behind
  interfaces.
- **A multi-site infrastructure** — site context middleware, feature flags
  with targeting and rollouts, RBAC, audit logging, domain routing.
- **A React admin UI** (Vite + wouter + shadcn/ui + React Query) with a
  config editor (Monaco), a kernel admin page, and a feature-flags admin page.
- **A production deployment story** — two-stage Dockerfile (non-root,
  read-only rootfs), Kubernetes manifests with health probes, anti-affinity,
  and tight security context.

## What this project is **not** today

These claims appear in older marketing-style docs but are not currently
backed by code. The honest list is in
[`docs/STATUS-LATEST.md`](docs/STATUS-LATEST.md):

- **Not "AI-native".** As of 2026-04-14 there is exactly one real outbound
  LLM path: meeting summaries via `server/services/ai/anthropic-client.ts`,
  optional and gated on `ANTHROPIC_API_KEY`. Other "AI" features are
  heuristic placeholders. The roadmap converts them service by service.
- **Not "quantum-ready".** No PQC primitives, no quantum-safe crypto, no
  superposition data structures. Marketing copy from the master plan that
  uses this term should be read as 10-year aspiration.
- **Not a plugin host for untrusted code.** The kernel sandbox is a policy
  and audit layer, not an isolation boundary. Read
  [`docs/security/TRUST-MODEL.md`](docs/security/TRUST-MODEL.md) before
  considering this. The module install endpoint is intentionally disabled.
- **Not multi-tenant production-ready.** Tenant isolation is enforced at
  the request layer (middleware) and the query layer (the
  `scoped(siteId)` helper added 2026-04-14), but not yet at the database
  layer (Postgres row-level security). Tracked in roadmap M1.4.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Provision a Postgres database and set DATABASE_URL
export DATABASE_URL="postgres://user:pass@localhost:5432/rses"

# 3. Push the schema
npm run db:push

# 4. (Optional) Set a session secret — required in production, defaults
#    to a development value otherwise (see server/auth/session.ts)
export SESSION_SECRET="$(openssl rand -base64 48)"

# 5. (Optional) Enable AI-backed features
export ANTHROPIC_API_KEY="sk-ant-..."
npm install @anthropic-ai/sdk   # not in package.json by default

# 6. Run dev server
npm run dev
```

The server starts on `http://localhost:5000`. The admin UI at
`/admin/kernel` shows the kernel module registry. The editor at `/editor`
opens the Monaco-based config editor.

## Tests

```bash
npm run check          # TypeScript typecheck
npm run test           # Full vitest suite
npm run test:security  # Security tests only — gated by CI
```

Security tests (`tests/security/`) are part of the deliverable for any PR
that touches auth, the workflow engine, the kernel, or the tenant isolation
layers.

## Project layout

```
client/            React frontend (Vite + wouter + shadcn/ui)
  src/pages/         5 admin pages — kernel, feature flags, editor, users, 404
  src/components/    51 shadcn UI components + custom widgets
  src/hooks/         16 custom hooks for kernel, feature flags, editor state

server/            Express backend (Node + TypeScript)
  index.ts           Bootstrap: middleware, session, auth, routes, kernel
  kernel/            Kernel module system (DI, events, gateway, registry)
  cqrs-es/           CQRS/ES core: event store, command/query bus, sagas, actors
  auth/              Session + Passport + scrypt password hashing
  middleware/        Security, CSRF, audit, tenant isolation, OTel tracing
  services/          Feature services — RBAC, sync, automation, messaging, AI, ...
    ai/                Anthropic SDK wrapper (the one real LLM path so far)
  lib/               Library helpers — safe-expression, tenant-scoped, ...
  db.ts              Drizzle client with circuit breaker

shared/            Shared types and Drizzle schemas
migrations/        Real SQL migrations with FKs and indexes
tests/             Vitest tests — security/, feature-flags/, cms/, integration/
docs/              All documentation
  STATUS-LATEST.md     Authoritative current state (start here)
  ROADMAP-LATEST.md    Next milestones
  plans/               Long-term vision documents
  architecture/        Architecture references and per-subsystem maps
  security/            Security architecture, trust model, tenant isolation guide
k8s/               Kubernetes manifests
Dockerfile         Two-stage, non-root, read-only rootfs
```

## How to contribute

1. **Read [`docs/STATUS-LATEST.md`](docs/STATUS-LATEST.md) and
   [`docs/ROADMAP-LATEST.md`](docs/ROADMAP-LATEST.md) first.** They tell
   you what's real, what's stubbed, and what to work on next.
2. **Read [`docs/security/TRUST-MODEL.md`](docs/security/TRUST-MODEL.md)
   before any change that touches auth, the workflow engine, the kernel,
   or multi-tenant data paths.**
3. **Update STATUS in the same PR** if your change moves a subsystem from
   stub to real (or back).
4. **Tests are part of the deliverable.** Security tests in particular.
5. **No `Math.random()` in business logic.** It was the most common code
   smell in the 2026-04-14 audit. If you need randomness for a real reason
   (jitter, IDs), name it clearly and limit the scope.

## License

MIT
