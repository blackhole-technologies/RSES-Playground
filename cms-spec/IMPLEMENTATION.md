# IMPLEMENTATION

Build order, tooling, and operational setup for the RSS-aggregating CMS described in [SPEC.md](./SPEC.md) and [DESIGN.md](./DESIGN.md).

Written as concrete steps you can execute in order. A single developer working focused sessions should be able to reach a running prototype in 2–4 weeks using this sequence.

---

## 1. Prerequisites

### 1.1 Tooling

- **Node.js 22 LTS.** Salvage units compile against it; earlier versions work but 22 is the target.
- **PostgreSQL 16+.** Can be local, Docker, or managed. Local Docker is simplest during development.
- **pnpm 9+ or npm 10+.** Pick one; don't mix.
- **Git.** Commit per-module.

### 1.2 Environment variables

These are consumed by `core/config.ts`. Defaults shown; override via `.env` or deploy env.

```
NODE_ENV=development                          # development | production | test
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/rsscms
DATABASE_POOL_SIZE=10
SESSION_SECRET=<random 64 chars>              # required; used to sign session cookies
PUBLIC_URL=http://localhost:3000              # canonical host (used in meta tags + outgoing feeds)
TRUST_PROXY=false                             # true if behind a reverse proxy
CORS_ORIGINS=http://localhost:3000            # comma-separated
LOG_LEVEL=info                                # debug | info | warn | error
QUEUE_CONCURRENCY=4
FEED_POLL_CONCURRENCY=4
FEED_POLL_DEFAULT_INTERVAL=900                # seconds (15 minutes)
FEED_POLL_TIMEOUT=10000                       # ms
```

Operational-only:

```
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
```

Generate the session secret with `openssl rand -base64 48`.

### 1.3 Initial DB setup

```bash
createdb rsscms
# run migrations when first module is implemented; see §3
```

No migrations exist until the auth module is built. The core/migrations directory exists for cross-cutting concerns (a `_migrations` tracking table) but the project starts with an empty database.

---

## 2. Directory structure on day one

Create the layout before writing any code. This prevents the organizational drift that plagues projects where structure emerges reactively.

```bash
mkdir -p app/{core,engines,modules,shared,ui,bin,tests,salvage}
mkdir -p app/core/migrations
mkdir -p app/engines/{logger,metrics,security,queue,circuit-breaker,classification,taxonomy,feature-flags,password-hash,tenant-scope,render,fields}
mkdir -p app/modules/{auth,content,feeds,classification,taxonomy,outgoing-feeds,export,admin,public}
mkdir -p app/ui/{admin,reader,public}
mkdir -p app/tests/{unit,integration,e2e}
```

Copy the salvage:

```bash
cp -r ../salvage/* app/salvage/
```

Salvage units stay self-contained; engines consume them by importing from `app/salvage/<unit>/src/...`. Don't edit salvage files — wrap them at the engine layer.

`package.json` scaffolding:

```json
{
  "name": "rsscms",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "db:migrate": "tsx bin/migrate.ts",
    "db:reset": "tsx bin/reset-db.ts",
    "reset-admin": "tsx bin/reset-admin.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "admin:dev": "vite --config ui/admin/vite.config.ts",
    "reader:dev": "vite --config ui/reader/vite.config.ts",
    "admin:build": "vite build --config ui/admin/vite.config.ts",
    "reader:build": "vite build --config ui/reader/vite.config.ts"
  }
}
```

Drizzle config (`drizzle.config.ts`) points at module-owned schema files as they're built.

---

## 3. Build order

Nine phases, each a meaningful unit of progress. Estimated time is for a single focused developer; parallelize within a phase if multiple people.

Each phase ends with a test: run the server, hit specific endpoints, verify expected behavior. Don't proceed until the test passes.

### Phase 0 — Core skeleton (½ day)

Goal: empty Express server that starts, loads env, connects to DB, serves `/health` and `/metrics`.

Files:
- `server.ts` — entry: `import bootstrap from './core/bootstrap'; bootstrap().catch(console.error)`.
- `core/config.ts` — zod schema validating env vars.
- `core/db.ts` — connect to Postgres via `pg.Pool`; export Drizzle `db` client. Wrap with salvage/06 circuit breaker.
- `core/bootstrap.ts` — skeletal sequence: load config → connect DB → start Express → listen. No module loading yet.
- `core/events.ts` — in-process `EventBus` interface + implementation. Unit test it.
- `core/hooks.ts` — `HookRegistry` interface + implementation. Unit test it.

Engines to wire in this phase (trivially):
- `engines/logger` — wrap salvage/03. Export `logger` + `createModuleLogger`. Mount correlation + request-log middleware in bootstrap.
- `engines/metrics` — wrap salvage/05. Remove the RSES-specific counters (they're irrelevant here). Mount metrics middleware + `/metrics` endpoint.
- `engines/security` — wrap salvage/04. Mount `createSecurityMiddleware({ maxBodySize: 1024*1024, enableCsrf: env === 'production' })`.

Test: `curl localhost:3000/health` returns 200 with JSON. `curl localhost:3000/metrics` returns Prometheus text. Server starts with no env errors.

### Phase 1 — Migrations + auth + sessions (1½ days)

Goal: registration + login + logout + session cookie work. First-boot bootstrap flow works.

Steps:

1. Write the migration runner: `core/migration-runner.ts`. Scans `core/migrations` and `modules/*/migrations`, applies in lexicographic order, tracks in a `_migrations` table. Idempotent.

2. Write `bin/migrate.ts` — calls the runner from the command line. `pnpm db:migrate` now works.

3. Create `core/migrations/0001_core_init.sql`:
   - `CREATE TABLE _migrations` (name pk, applied_at)
   - `CREATE TABLE system_settings` (all columns from SPEC §4.1)
   - Insert single row with defaults

4. Create the `auth` module:
   - `modules/auth/manifest.ts` — declares tables `users`, `sessions`, `invite_codes`.
   - `modules/auth/migrations/0001_auth_init.sql` — three tables from SPEC §4.1.
   - `modules/auth/service.ts` — `registerUser`, `verifyCredentials`, `createSession`, `loadSessionUser`, `expireSessions`, `createBootstrapToken`, `consumeBootstrapToken`. Uses salvage/13 for hashing.
   - `modules/auth/routes.ts` — all auth endpoints + `/setup` + server-rendered `/login`.
   - `modules/auth/pages/login.html` — minimal template served by the login route.
   - `modules/auth/jobs.ts` — `session.cleanup` handler.
   - `modules/auth/middleware.ts` — the auth middleware (extracts cookie, loads user, calls `runInTenantScope(user.id, next)`). Used by other modules' routes via `requiresAuth: true` in their RouteSpec.

5. Write `core/module-loader.ts`. Reads manifests, resolves deps, calls `install()` once (tracked in `_module_installed` table), registers routes + jobs + hooks. Loads `auth` module.

6. Engines to wire:
   - `engines/queue` — wrap salvage/08. Start processing loop in bootstrap. Register `session.cleanup` job handler.
   - `engines/password-hash` — trivial wrapper over salvage/13.
   - `engines/tenant-scope` — trivial wrapper over salvage/12. Expose `runInTenantScope` + `assertScoped`.

7. Bootstrap sequence is now:
   - load config → DB → engines (logger, metrics, security, queue, password-hash, tenant-scope) → module loader (runs auth's install, registers routes, registers session.cleanup job) → bootstrap-token logic → start HTTP → start queue loop

8. First-boot handling:
   - Before loading modules, bootstrap checks `SELECT COUNT(*) FROM users`. If zero: generate token, store in system_settings, log once.

Test:
- Start server on an empty DB.
- Observe bootstrap token in log.
- `GET /setup?token=<wrong>` → 404.
- `GET /setup?token=<correct>` → HTML form.
- `POST /setup` with valid data → redirect to `/app`, session cookie set, user created with `is_admin=true`. Token cleared.
- `GET /setup?token=<anything>` → 404 forever after.
- `POST /api/auth/login` with wrong credentials → 401 after 5 failures → 429 for 15 min.
- `POST /api/auth/login` with correct credentials → 200 + cookie.
- `GET /api/me` with session cookie → 200 with user. Without → 401.
- `POST /api/auth/logout` → 204. `GET /api/me` → 401.

Unit tests: `modules/auth/tests/*`.

### Phase 2 — System settings + feature flags + admin registration modes (½ day)

Goal: admin can change registration mode between disabled/invite/open.

1. Implement `engines/feature-flags` — wrap salvage/02 with a Drizzle-backed `IFeatureFlagStorage`. Migration for `feature_flags` + `feature_rollout_history` in `engines/feature-flags/migrations`.

2. Add admin routes: `GET/PATCH /api/admin/settings`, `GET/PATCH /api/admin/flags`, `GET/POST/DELETE /api/admin/invite-codes`. Live in the `admin` module (create it now even though its UI comes later).

3. Update `POST /api/auth/register` to consult `system_settings.registration_mode`:
   - `disabled` → 403
   - `invite` → require + consume invite_code
   - `open` → proceed, rate-limited 3/IP/hour

Test:
- Log in as admin.
- `PATCH /api/admin/settings` set `registration_mode='open'`.
- `POST /api/auth/register` with new user → 201.
- `PATCH /api/admin/settings` set `registration_mode='disabled'`.
- `POST /api/auth/register` → 403.
- Create invite code. Set mode `invite`. Register without code → 403. Register with code → 201.

### Phase 3 — Content scaffolding + Fields API + taxonomy (2 days)

Goal: the content table and vocabularies/terms exist. User posts can be created and listed. Faceted queries return correct results.

Do these together because they interlock tightly.

Steps:

1. Create `engines/fields` — the Fields API (DESIGN.md §2.5). Just a registry. Unit test it.

2. Create `engines/render` — the Render engine (DESIGN.md §2.6). Dispatch by content_type_id + target. Unit test.

3. Create `engines/taxonomy`:
   - Wraps salvage/10 + salvage/11.
   - On boot, loads all vocabularies + terms + content_terms + content into the `TaxonomyQueryEngine`.
   - Subscribes to `terms.changed` events for invalidation.
   - Exposes the interface from DESIGN.md §3.7.

4. Create `modules/taxonomy`:
   - Tables: `vocabularies`, `terms`, `content_terms`.
   - Routes: user CRUD + admin system-vocab CRUD.
   - No jobs yet.
   - Seeds one starter system vocabulary `topics` with a few terms (`technology`, `reading`, `work`, `other`) during install.

5. Create `modules/content`:
   - Tables: `content_items`, `user_item_state`, `content_item_dedup_hash`.
   - Register content type `post` with Fields API (schema for markdown+html+excerpt).
   - Register renderer for `post` with Render engine (for `target='public-html'` and `'rss-atom'`).
   - Routes: full `/api/content/*`.
   - Public route: `GET /p/:username/:slug`.
   - Job handler: `content.retention-purge`, `content.soft-delete-purge`. Schedule them (daily cron).

Install order in manifest: `auth`, then `taxonomy` (seeds vocabularies), then `content` (references vocabularies optionally).

Test:
- Create a user, log in.
- `POST /api/content` `{ title, body_markdown }` → 201 with rendered html.
- `GET /api/content` → returns the post.
- `PATCH /api/content/:id` with updated markdown → HTML updates.
- `POST /api/vocabularies` creates a user vocabulary. `POST /api/terms` adds a term. `POST /api/content/:id/tags` applies the term.
- `GET /api/content?terms=<term_id>` → returns the tagged post.
- `DELETE /api/content/:id` soft-deletes. `GET /api/content/:id` 404s. Run the soft-delete-purge job manually → row is hard-deleted.

Unit tests: tag application, query with facets, Fields API validation, slug generation.

### Phase 4 — Feeds + ingestion + classification (3–4 days)

Goal: subscribe to a real RSS feed, items appear in the user's inbox, classification rules fire.

Steps:

1. Install npm deps: `rss-parser`, `dompurify`, `jsdom`, `marked`.

2. Create `engines/circuit-breaker` — factory that returns per-feed or per-outbound breakers from salvage/06. Map keyed by id, lazy-instantiate.

3. Create `engines/classification`:
   - Wraps salvage/09 (expression evaluation) + salvage/07 (suggestions).
   - `validateExpression(expr)` delegates to salvage/09's parse step.
   - `evaluateRules(item, userId)` fetches user's rules, builds context, evaluates each.
   - `suggestTerms(item, userId)` uses salvage/07.

4. Create `modules/feeds`:
   - Tables: `feeds`, `subscriptions`.
   - Register content type `feed_item` with Fields API (schema from SPEC §4.3.1).
   - Register renderer for `feed_item`.
   - Routes: subscribe, unsubscribe, refresh, autodiscover.
   - Jobs:
     - `feed.poll` — the big one. Implements the flow in DESIGN.md §5.2. Sanitizes with DOMPurify. Dedups. Emits `content.ingested` per new item.
     - `feed.schedule-polls` — periodic (every 60s); selects feeds due and enqueues poll jobs.
     - `feed.orphan-cleanup` — weekly.
     - `feed.autodiscover` — request-driven.

5. Create `modules/classification`:
   - Tables: `rules`, `rule_templates`, `classification_log`.
   - Routes: rules CRUD, rules test, matches. Rule templates admin CRUD.
   - Subscribe to `content.ingested`:
     - For `source='post'`: run owner's rules inline; apply terms.
     - For `source='feed'`: enqueue `classification.run` jobs per subscriber.
   - Job: `classification.run` — the flow in DESIGN.md §5.3.
   - Subscribe to `user.registered` — seed rule_templates (offered_by_default=true) as user rules.
   - Job: `classification.log-purge` — daily.
   - Seed initial rule_templates during install (e.g. "tag with reading when saved recently").

6. Wire the full chain:
   - Feed scheduler enqueues `feed.poll`.
   - Poll handler inserts items, emits events.
   - Events trigger classification.run jobs.
   - Classification writes to `content_terms` or `user_item_state.user_term_ids`.

Test:
- Subscribe to a real feed (`https://daringfireball.net/feeds/main` or similar low-volume feed).
- Wait for next poll or force-refresh.
- Items appear in the user's content list.
- Create a rule: `feed.domain == "daringfireball.net"` → tag with `topics/writing`.
- Re-trigger poll → new items get tagged.
- Delete the rule. Rule appears removed. Test mode: POST `/api/rules/test` with an expression → see matches preview.
- Author an intentionally broken expression → save returns 400 with parse error.
- View classification_log for an item → see which rules fired.
- Check the unclassified queue: items that matched zero rules.

Integration tests: end-to-end from fake feed server → subscribed user → classified item. Mocked feed server via msw or a local express.

### Phase 5 — Outgoing feeds + export (1 day)

Goal: user creates an outgoing RSS feed URL and external readers can subscribe.

Steps:

1. Create `modules/outgoing-feeds`:
   - Table: `outgoing_feeds`.
   - Routes: CRUD + regenerate-secret.
   - Public route: `GET /rss/:slug-:secret` — generate Atom/RSS with xmlbuilder2.
   - Subscribe to `content.*` events for cache invalidation (implement cache layer later if needed; MVP re-renders on every request).
   - Renderer delegates to Render engine with `target='rss-atom'` or `'rss-2'`.

2. Create `modules/export`:
   - No tables.
   - Routes: subscriptions (OPML), posts (markdown zip with frontmatter), rules (json), vocabularies (json), all (combined zip).
   - Uses `adm-zip` or similar for zip creation.

Test:
- Create an outgoing feed with query `terms=<term_id>, source=feed_item, max_items=20`.
- Fetch the URL from curl (simulating a feed reader). Validate XML structure with `xmllint --noout`.
- Subscribe from a real feed reader (NetNewsWire, Miniflux). See items appear.
- Regenerate secret → old URL 404s, new URL works.
- `GET /api/export/all` → valid zip containing all four exports.

### Phase 6 — Admin shell + admin UI (2–3 days)

Goal: admin SPA is functional for managing users, feeds, rules, settings.

Steps:

1. `ui/admin/` — React + Vite + TanStack Query + wouter + minimal UI components.
2. Auth state: login page redirects to `/admin` on success. Otherwise, the /admin root has its own login form (or redirect to /login server-rendered page from auth module).
3. Shell: `<AppShell>` with left rail, search bar, user menu. Pulls menu items from `GET /api/admin/menu` (aggregated via `admin.menu` hook point in admin module).
4. Screens from DESIGN.md §6.2 — dashboard, users, feeds, rule templates, system vocabularies, audit, dead-letter, flags, settings, invites.
5. Shared components from DESIGN.md §6.3.
6. Keyboard shortcuts from §6.4.

Each screen gets:
- Its route in the SPA
- Data fetching via `useQuery`
- Mutation via `useMutation` + query invalidation
- Form via react-hook-form or similar (zod validators match server)

Build with `vite build --mode production`. Output to `app/ui/admin/dist/`. Express serves from that path when `NODE_ENV=production`; dev mode runs the vite dev server and proxies API calls.

Test: admin logs in, navigates to every screen, verifies data loads, creates a user, disables a user, pauses a feed, creates an invite, changes a flag.

### Phase 7 — Reader UI (3–4 days)

Goal: reader SPA is functional for daily use.

Steps:

1. `ui/reader/` — React + Vite + TanStack Query + wouter.
2. Shell with left rail (inbox, saved, unclassified, subscriptions, compose, rules, vocabs, feeds, outgoing).
3. Screens from DESIGN.md §7.2 — inbox (facet bar + item list with infinite scroll), item detail, saved, unclassified queue, subscriptions, compose, rules, vocabularies, outgoing feeds.
4. Keyboard from §7.4.
5. Components from §7.3.

The "biggest chunk" is the item list + facet bar interaction — that's where the app actually feels like an app. Get this right before polishing the other screens.

Test: create a user, subscribe to 3 feeds, wait for ingestion, browse inbox, filter by term, save items, mark items read, write a post, write a rule using test-mode, see unclassified items with suggestions, create an outgoing feed.

### Phase 8 — Operational hardening (1 day)

Goal: deployable with confidence.

Steps:

1. Audit log writes: wire in a middleware that logs every admin write action (after the handler succeeds) into `audit_log`. Include payload sans redacted fields.

2. Dead-letter persistence: when salvage/08's retry exhaustion happens, write to `job_dead_letter`. Admin retry re-enqueues the row.

3. Health + ready semantics:
   - `/health` = process alive (always 200)
   - `/ready` = DB responds and circuit is closed (200/503)

4. Rate limits from system_settings; wire them into salvage/04's rate limiters with per-route overrides.

5. Schedule background tasks:
   - `feed.schedule-polls` every 60s
   - `session.cleanup` hourly
   - `content.retention-purge` daily 03:00
   - `content.soft-delete-purge` daily 03:15
   - `classification.log-purge` daily 03:30
   - `feed.orphan-cleanup` weekly Sunday 04:00

6. Shutdown: SIGTERM handler — stop queue processing, drain in-flight jobs (with timeout), close HTTP, close DB pool.

7. Error boundary: the reader and admin SPAs both render a last-resort error view when a query fails with 500; include the correlation ID for support reporting.

8. `bin/reset-admin.ts` — CLI to regenerate a bootstrap token (for the admin-lockout case). `bin/migrate.ts` — run migrations. `bin/reset-db.ts` — drop+recreate (dev only).

Test: run the app for a simulated week (fast-forward the scheduler), no leaked connections, no runaway memory, dead-letter survives restart.

---

## 4. Testing strategy

### 4.1 Unit

Per-engine: the salvage units already have tests. Engine wrappers get additional tests for the DB-backed parts (e.g., feature-flags engine with DB storage).

Per-module service file: every non-trivial function. Aim 70%+ coverage on business logic (classification trigger dispatch, rule firing order, dedup keying, retention eligibility, outgoing-feed slug+secret routing).

`vitest` with `describe/it`, co-located in each module: `modules/<id>/service.test.ts`.

### 4.2 Integration

In `tests/integration/`, spin up a test DB (ephemeral Docker Postgres via testcontainers, or a dedicated test schema with a fresh install), run full module boot, exercise a flow.

Key integration tests:
- Full registration → login → create content → tag → browse (auth + content + taxonomy).
- Subscribe to a fake feed served by a local Express → poll → ingest → classify → inbox.
- Create outgoing feed → fetch via public URL → validate XML → regenerate secret → old URL fails.
- Export all → unzip → verify structure.
- Admin actions → audit log entries.
- Bootstrap token flow → admin creation → token invalidation.

### 4.3 Concurrency and edge cases

These aren't "integration" but they're not pure unit either. Write specific tests for:
- Dedup correctness when a feed returns the same guid twice across polls
- Classification log purge respects the 30-day boundary
- Circuit breaker per-feed doesn't bleed to other feeds
- Concurrent subscribe to the same new URL creates only one `feeds` row
- Session eviction doesn't cascade-delete users

### 4.4 End-to-end (future)

Playwright suite for the SPAs. Skipped in MVP, added when the UIs stabilize. The selectors should be data-attribute driven (`data-testid`) from the start so e2e can be bolted on without refactors.

### 4.5 Sanity at boot

A dedicated test that starts the full app against a clean DB, runs all migrations, verifies `/health` returns 200, asserts module-loader topology resolves without errors. Catches module-dependency-cycle regressions.

---

## 5. Deployment shape

### 5.1 Process model (MVP)

One Node process. One Postgres instance. Queue runs in-process (salvage/08).

Supported deployment shapes:

- **Local dev** — `pnpm dev`, Postgres via Docker Compose.
- **Single VM** — systemd unit running `node dist/server.js`; Postgres on same host or separate.
- **Docker** — one image, one Postgres sidecar (or external DB). Sample `docker-compose.yml` in the repo.
- **PaaS (Fly, Render, Railway)** — Node + Postgres add-on.

No Kubernetes in MVP. No multi-process. If queue throughput becomes a bottleneck, the queue moves out to its own process (worker with same module registrations, routes omitted) — that's the first horizontal step.

### 5.2 Dockerfile (reference)

Two-stage. Non-root. Read-only rootfs except for a writable `/app/data` if local media storage lands later.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm admin:build && pnpm reader:build && pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json .
COPY --from=build /app/ui/admin/dist ./ui/admin/dist
COPY --from=build /app/ui/reader/dist ./ui/reader/dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 5.3 Backups

`pg_dump --format=custom` on a schedule the operator configures (cron, systemd timer, or their PaaS's backup feature). The app does not manage its own backups; it provides a manual admin endpoint (`GET /api/admin/backup`) for occasional ad-hoc downloads.

Restore procedure: `pg_restore -d rsscms backup.dump`, then restart the app — migrations run idempotently and the app picks up where it left off.

### 5.4 Monitoring

Minimum:
- Scrape `/metrics` with Prometheus
- Alert on: `/ready` 503 for > 2 min, dead-letter count > 10, feed_circuit_breaker_opens_total increasing
- Log aggregation reads stdout JSON (Loki, CloudWatch, etc.)

---

## 6. Configuration reference

All values exposed via `system_settings` (admin-editable at runtime) vs. env vars (operator-set at deploy time):

| Setting | Source | Change frequency |
|---|---|---|
| `NODE_ENV`, `PORT`, `DATABASE_URL` | env | deploy-time |
| `SESSION_SECRET` | env | deploy-time; rotation invalidates all sessions |
| `PUBLIC_URL`, `TRUST_PROXY`, `CORS_ORIGINS` | env | deploy-time |
| `registration_mode` | system_settings | admin |
| `default_poll_interval`, `retention_days`, `feed_user_agent` | system_settings | admin |
| `rate_limit_config` | system_settings | admin |
| Feature flags | feature_flags table | admin |

---

## 7. Initial onboarding walkthrough

Confirming the bootstrap flow works. This is the happy path you test manually after Phase 1, and the same flow a real operator uses on first deploy.

```
$ createdb rsscms
$ export DATABASE_URL=postgres://localhost/rsscms
$ export SESSION_SECRET=$(openssl rand -base64 48)
$ export PUBLIC_URL=http://localhost:3000
$ pnpm db:migrate
[migration 0001_core_init.sql applied]
[migration 0001_auth_init.sql applied]
[...]
$ pnpm dev
[2026-04-21 10:14:02] INFO  core            Starting bootstrap
[2026-04-21 10:14:02] INFO  db              Connected (pool size: 10)
[2026-04-21 10:14:02] INFO  engines         Logger, metrics, security, queue online
[2026-04-21 10:14:02] INFO  module-loader   Loading modules: auth, content, feeds, taxonomy, classification, outgoing-feeds, export, admin, public
[2026-04-21 10:14:02] INFO  auth            Users table is empty — generating bootstrap token

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │   FIRST BOOT                                                             │
  │                                                                          │
  │   Visit this URL to create your admin account:                           │
  │   http://localhost:3000/setup?token=s6TkW9Bn2X8Lq3YzP4aV7RcD              │
  │                                                                          │
  │   This URL stops working after the admin is created.                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

[2026-04-21 10:14:03] INFO  http            Listening on :3000
```

Operator visits the URL, submits the form, becomes the admin. Second start of the server no longer shows the banner (token is null in system_settings). If someone loses the token, the recovery path is:

```
$ pnpm reset-admin
Generated new bootstrap token: xN4pR7yW2sQ9oH3vJ8zB5tLkF6gMcE1d
You can now visit /setup to create a new admin, or reset an existing one.
```

The reset CLI doesn't delete existing users — it re-opens the `/setup` route, which on form submit will either create a new admin (if users table is empty) or promote a specified existing user (if flagged).

---

## 8. Operational quality checklist

Before calling the MVP complete, verify each:

- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm test` passes.
- [ ] Server starts on a clean DB, shows bootstrap banner, lets you complete setup.
- [ ] `/health` and `/ready` behave correctly — `/ready` fails when DB is unreachable.
- [ ] `/metrics` returns Prometheus text with feed, HTTP, and classification counters populating.
- [ ] Every admin mutation shows up in audit log.
- [ ] Dead-letter queue survives a process restart.
- [ ] A failing feed trips the circuit breaker after 5 failures; recovers after 1 hour of success.
- [ ] Retention purge runs and actually deletes eligible items.
- [ ] Outgoing feed XML validates with `xmllint --noout`.
- [ ] Public post URL shows `<meta name="robots" content="noindex">`.
- [ ] Outgoing feed URL 404s after regenerating the secret.
- [ ] Rate limits reject as expected — test with parallel curl.
- [ ] Export ZIP unzips and every file is parseable (markdown with valid frontmatter, JSON parses, OPML validates).
- [ ] Registration disabled returns 403 with a clear error message.
- [ ] Reset-admin CLI works and doesn't leak the token to logs after it's consumed.
- [ ] Logs contain no passwords, cookies, or tokens (redaction from salvage/03 working).
- [ ] Shutdown is graceful — SIGTERM drains queue and closes connections cleanly.

When all of these pass, the MVP is honest about being complete.

---

## 9. What comes after MVP (for orientation only)

Listed here so the build isn't tempted to prematurely include them:

- Media module — Fields API + image content type + storage adapters
- Block editor module — replacement for markdown in posts, via Render engine registration
- Layout module — `page` content type with regions, themes
- Fields API UI — admin UI to define new content types
- Full-text search module — Meilisearch or Postgres tsvector
- Email digest module — scheduled SMTP delivery of the outgoing-feed content
- Comments module
- OAuth / SSO
- WebSocket real-time updates
- Multi-workspace / team sharing
- SQLite backend

Each of these is a module that plugs into existing seams. None requires a rewrite of anything in the MVP. The core doesn't change when any of them lands.
