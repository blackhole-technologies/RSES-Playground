# DESIGN

Architecture and structural choices. Companion docs: [SPEC.md](./SPEC.md) (requirements and data model), [IMPLEMENTATION.md](./IMPLEMENTATION.md) (build order).

The design makes deliberate room for three future extension points that aren't built in the MVP: content types via a Fields API, media / editor / layout modules, and a plugin registry. Where those seams matter, they're called out.

---

## 1. Architectural overview

Four layers, bottom up:

```
┌─────────────────────────────────────────────────────────────────┐
│                         PROCESS BOUNDARY                         │
│                                                                  │
│  UI               ┌──────────────────────────────────────────┐  │
│                   │  Reader SPA     Admin SPA     Public     │  │
│                   │  (/app)         (/admin)     (server-    │  │
│                   │                                rendered)  │  │
│                   └─────────────────┬────────────────────────┘  │
│                                     │                            │
│                                     │ HTTPS / JSON / HTML        │
│                                     │                            │
│  Modules    ┌───────────────────────┴────────────────────────┐  │
│             │  auth  content  feeds  classification  taxonomy│  │
│             │  admin  public  export                         │  │
│             │  (each: routes, hooks, jobs, tables, UI pages) │  │
│             └───────────────────────┬────────────────────────┘  │
│                                     │                            │
│                                     │ engines + events + hooks   │
│                                     │                            │
│  Engines    ┌───────────────────────┴────────────────────────┐  │
│             │  logger  metrics  security  queue  circuit     │  │
│             │  classification  taxonomy  feature-flags       │  │
│             │  password-hash  tenant-scope  render  fields   │  │
│             └───────────────────────┬────────────────────────┘  │
│                                     │                            │
│  Core       ┌───────────────────────┴────────────────────────┐  │
│             │  bootstrap  module-loader  event-bus  hook-    │  │
│             │  registry  db  migration-runner  config        │  │
│             └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Core** is the boot sequence + coordination primitives. Doesn't know about CMS concepts.

**Engines** are the salvaged code, wrapped into app-specific interfaces. Long-lived, stateful, one instance per process. Engines don't know about modules; modules use engines through a context object.

**Modules** are feature bundles. Each owns its tables, routes, jobs, UI pages, hook subscriptions, content types. Modules don't directly depend on each other — they talk via events and hooks. Order of registration is determined by declared dependencies.

**UI** lives outside the server process conceptually (two SPAs built as static assets + one server-rendered public surface) but is served by the same Express instance. The admin and reader SPAs call the module API routes; the public surface renders directly.

**Rules of engagement:**

- A module never imports another module's code. Cross-module interaction is via events, hooks, or the engine's public interface.
- An engine never imports a module's code. Engines can emit events but not subscribe (modules do the subscribing).
- The core knows nothing about any specific concept. It knows "there are modules, they have manifests, they register routes and hooks." It doesn't know what feeds are.
- Modules CAN depend on each other for ordering (e.g. `content` depends on `auth`) via the manifest. This is declarative, not code-level.

---

## 2. Core services

### 2.1 Bootstrap (`core/bootstrap.ts`)

Single entry point called from `server.ts`. Sequence:

```
1. Load config from env (validated via zod schema)
2. Connect to Postgres, run migrations
3. Instantiate engines in dependency order:
   - logger, metrics, security, tenant-scope (stateless)
   - password-hash, safe-expression, circuit-breaker (stateless)
   - queue (starts processing loop)
   - taxonomy, classification (consume tables via DB repos)
   - feature-flags (loads flags from DB)
   - fields-api, render (module-aware but core)
4. Build context object (engines + db + logger)
5. Load module manifests from modules/*/manifest.ts
6. Topologically sort modules by dependsOn
7. For each module, in order:
   a. Call module.install(ctx) — runs migrations, seeds data
   b. Register routes from manifest.routes into Express app
   c. Subscribe hooks from manifest.hooks to event bus
   d. Register jobs from manifest.jobs with queue engine
   e. Register content types from manifest.contentTypes with Fields API
   f. Register admin pages from manifest.adminPages with admin menu
8. Mount cross-cutting middleware (security, logger, metrics, auth)
9. Mount static assets (reader SPA, admin SPA, public pages)
10. Start HTTP server
11. Start background workers:
    - Feed poller scheduler (enqueues poll jobs)
    - Classification log purger (daily)
    - Content retention purger (daily)
    - Session cleanup (hourly)
    - Dead-letter queue monitor
```

Graceful shutdown reverses steps 11–10–7(all stops) then closes DB pool.

### 2.2 Event bus (`core/events.ts`)

In-process, typed pub/sub. Synchronous by default (subscribers await sequentially); a handler can opt into async (enqueued as a job instead of run inline).

```ts
// Event types are declared in a single union for type safety.
type AppEvent =
  | { type: 'content.ingested';   payload: { contentItemId: string; source: 'feed' | 'post' } }
  | { type: 'content.created';    payload: { contentItemId: string; ownerUserId: string } }
  | { type: 'content.updated';    payload: { contentItemId: string } }
  | { type: 'content.deleted';    payload: { contentItemId: string } }
  | { type: 'user.registered';    payload: { userId: string } }
  | { type: 'user.deleted';       payload: { userId: string } }
  | { type: 'feed.polled';        payload: { feedId: string; newItems: number; status: 'ok' | '304' | 'error' } }
  | { type: 'feed.failed';        payload: { feedId: string; reason: string } }
  | { type: 'rule.fired';         payload: { ruleId: string; userId: string; contentItemId: string; matched: boolean } }
  | { type: 'terms.changed';      payload: { vocabularyId: string } };

interface EventBus {
  emit<T extends AppEvent['type']>(type: T, payload: Extract<AppEvent, { type: T }>['payload']): Promise<void>;
  on<T extends AppEvent['type']>(type: T, handler: (e: Extract<AppEvent, { type: T }>) => Promise<void> | void): Unsubscribe;
  onAsync<T extends AppEvent['type']>(type: T, jobType: string): Unsubscribe;  // routes to queue
}
```

The bus swallows no errors. If a handler throws, the emit() rejects. This forces callers to decide what to do. Modules that want best-effort fire-and-forget (classification, analytics) use `onAsync`, which enqueues a job and doesn't block the emitter.

Correlation ID (from salvage/03) propagates automatically — handlers see the same correlation ID as the emitter.

### 2.3 Hook registry (`core/hooks.ts`)

Distinct from events. Events are observational ("something happened"); hooks are inspectional ("let me modify the thing before it happens"). Hooks are how plugins extend the MVP.

```ts
interface HookRegistry {
  // Register a handler for a named hook point.
  register<T, R>(name: string, handler: (value: T) => R | Promise<R>): Unsubscribe;

  // Apply all handlers in order, each seeing the output of the previous.
  apply<T>(name: string, initial: T): Promise<T>;
}
```

Initial hook points in MVP:

- `content.beforeSave` — can mutate the content before DB insert
- `content.afterRender` — can post-process HTML
- `rule.beforeEvaluate` — can mutate the evaluation context (e.g. add computed fields)
- `outgoing.beforeSerialize` — can modify items before they become XML
- `admin.menu` — modules contribute menu items

Modules register into these hooks via their manifest. The MVP uses hooks sparingly — most cross-module coordination is via events. Hooks are the seam for plugins later.

### 2.4 Module loader (`core/module-loader.ts`)

Reads all `modules/*/manifest.ts` at boot, validates each against a zod schema, resolves dependencies topologically, and calls the lifecycle methods.

```ts
interface ModuleManifest {
  id: string;                   // unique; e.g. 'feeds'
  version: string;
  dependsOn?: string[];          // module ids

  // Tables this module owns. Migrations live at modules/<id>/migrations/.
  tables?: string[];

  // HTTP routes contributed by this module.
  routes?: RouteSpec[];

  // Event bus subscriptions.
  hooks?: Partial<Record<AppEvent['type'], HookHandler>>;

  // Hook point handlers (the 'hooks' in §2.3, not events).
  extensionPoints?: Record<string, unknown>;

  // Content types registered with the Fields API.
  contentTypes?: ContentTypeSpec[];

  // Background job handlers registered with the queue engine.
  jobs?: JobSpec[];

  // Admin UI pages this module contributes.
  adminPages?: AdminPageSpec[];

  // Reader UI pages (for modules that add reader-visible screens).
  readerPages?: ReaderPageSpec[];

  // Lifecycle — called at module install / enable / disable.
  install?: (ctx: ModuleContext) => Promise<void>;
  uninstall?: (ctx: ModuleContext) => Promise<void>;
}

interface ModuleContext {
  db: DrizzleDb;
  logger: ModuleLogger;
  events: EventBus;
  hooks: HookRegistry;
  queue: QueueEngine;
  classification: ClassificationEngine;
  taxonomy: TaxonomyEngine;
  featureFlags: FeatureFlagsEngine;
  render: RenderEngine;
  fields: FieldsRegistry;
  config: AppConfig;
}
```

The MVP doesn't hot-reload modules — they're static at boot. Install runs only if the module is new (a `_module_installed` system table tracks installed module ids). The hot-reload capability is a future feature; the manifest shape already supports it.

### 2.5 Fields API (`core/fields.ts`)

A registry that maps `contentType → schema + widget + formatter`. Content types are registered by modules via their manifest.

```ts
interface ContentTypeSpec {
  id: string;                              // e.g. 'feed_item', 'post'
  label: string;
  fieldSchema: ZodSchema;                  // validates the fields JSONB
  widget?: string;                         // UI component id for editing (admin/reader SPA)
  formatter?: string;                      // UI component id for rendering
  publicRenderer?: (item, ctx) => string;  // server-rendered HTML for public surface
  exportFrontmatter?: (item) => Record<string, unknown>;  // for markdown export
}

interface FieldsRegistry {
  register(spec: ContentTypeSpec): void;
  get(id: string): ContentTypeSpec | undefined;
  list(): ContentTypeSpec[];
  validate(contentTypeId: string, fields: unknown): ValidationResult;
}
```

In MVP, two content types are registered: `feed_item` (by `feeds` module) and `post` (by `content` module). Later modules register more: `review`, `link`, `bookmark`, `quote`, arbitrary user-defined types.

The fields JSONB column stays schema-less at the DB layer; all validation is in the Fields API. This is deliberate — it's the extension seam that lets new content types land without schema migrations.

### 2.6 Render dispatch (`core/render.ts`)

A single `render(contentItem, target, ctx) → string` function. Dispatches on `contentItem.source` (and later `contentItem.content_type_id`) to the type's registered public renderer.

```ts
type RenderTarget = 'public-html' | 'admin-preview' | 'rss-atom' | 'rss-2' | 'export-markdown';

interface RenderEngine {
  render(item: ContentItem, target: RenderTarget, ctx: RenderContext): Promise<string>;
  registerRenderer(contentTypeId: string, target: RenderTarget, fn: RendererFn): void;
}
```

In MVP, renderers are small functions. Later the "renderer" can delegate to a block-by-block render pipeline (for the WYSIWYG module) without anything else changing. The same dispatch serves public HTML, outgoing RSS, and markdown export.

### 2.7 DB layer (`core/db.ts`)

- One Drizzle `db` client, one connection pool (`pg.Pool`).
- Wrapped in salvage/06 circuit breaker — all queries route through `withCircuitBreaker(() => db.select()...)`.
- Migration runner scans `modules/<id>/migrations/` and `core/migrations/`, applies in order, tracks in a `_migrations` table.
- Every module's migrations are namespaced by module id to avoid collisions.

No ORM repository layer in MVP — modules use Drizzle directly within their own folders. If future modules need cross-module queries, they go through an event or a dedicated engine method, not a shared repository.

### 2.8 Config (`core/config.ts`)

Single zod-validated config object loaded from env. Typed, documented.

```ts
interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  database: { url: string; poolSize: number };
  session: { secret: string };                 // for signing cookies
  cors: { origins: string[] };
  trustProxy: boolean;                          // behind reverse proxy?
  publicUrl: string;                            // canonical host for meta tags
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  queueConcurrency: number;                     // salvage/08 config
  feedPolling: { defaultInterval: number; concurrency: number; timeout: number };
}
```

Loaded once at bootstrap. Passed to engines and modules via the context. Immutable after boot.

---

## 3. Engines

Each engine wraps one or more salvage units with an interface tuned to the app's needs. Engines live in `engines/<name>/` folders.

### 3.1 Logger engine
Wraps salvage/03. Exposes `createModuleLogger(name)`. The engine module is responsible for wiring correlation-ID middleware and request-logging middleware into the Express stack.

### 3.2 Metrics engine
Wraps salvage/05. Replaces the parent repo's RSES-specific counters with CMS-specific ones. See §11 for the metric catalog. Exposes `registerCounter / registerHistogram / registerGauge` for modules to add their own.

### 3.3 Security engine
Wraps salvage/04. Configured with production defaults (helmet CSP suitable for embedding Monaco if ever needed — likely not in MVP — so we'd simplify CSP). Rate-limit tiers per endpoint class (auth / admin / general) come from `system_settings.rate_limit_config`.

### 3.4 Queue engine
Wraps salvage/08 + persistent dead-letter. The in-memory queue is fine for MVP single-process, but `job_dead_letter` in Postgres captures jobs that exhausted retries so they're visible in the admin UI after a restart.

Interface modules use:

```ts
interface QueueEngine {
  registerHandler<T>(jobType: string, handler: JobHandler<T>, opts?: JobOpts): void;
  enqueue<T>(jobType: string, data: T, opts?: EnqueueOpts): Promise<string>;  // returns job id
  stats(): QueueStats;
}
```

### 3.5 Circuit breaker engine
Wraps salvage/06. Exposes a factory: `circuitBreaker.forFeed(feedId)` returns a per-feed breaker; `circuitBreaker.forOutbound('dns-lookup')` returns a shared breaker. Breakers are keyed so we don't make new instances per call.

### 3.6 Classification engine
Combines salvage/01 + salvage/07 + salvage/09.

```ts
interface ClassificationEngine {
  // Primary classification via safe-expression.
  evaluateRules(item: ContentItem, userId: string): Promise<ClassificationResult>;

  // Fallback: suggestions when nothing matched.
  suggestTerms(item: ContentItem, userId: string): Promise<Suggestion[]>;

  // Rule save-time validation (catches parse errors).
  validateExpression(expr: string): ParseResult;
}

interface ClassificationResult {
  ruleMatches: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    appliedTermIds: string[];
  }>;
  totalTermsApplied: number;
}
```

Not the salvage/01 path-based RSES. That engine stays available for future use (file-upload classification when media module lands) but isn't in the MVP's critical path.

### 3.7 Taxonomy engine
Wraps salvage/10 + salvage/11. Adds DB persistence (terms load on boot + invalidate on `terms.changed` event) and query caching.

```ts
interface TaxonomyEngine {
  // Term CRUD (delegates to DB; emits terms.changed event)
  createTerm(vocabularyId: string, input: CreateTermInput): Promise<Term>;
  updateTerm(termId: string, input: UpdateTermInput): Promise<Term>;
  deleteTerm(termId: string): Promise<void>;

  // Queries (delegates to salvage/11 TaxonomyQueryEngine)
  query(op: QueryOperation, scope: QueryScope): Promise<QueryResult>;
  suggest(term: string, vocabularyId?: string): Promise<Term[]>;  // typeahead

  // Graph operations (delegates to salvage/10)
  ancestorsOf(termId: string): Promise<Term[]>;
  descendantsOf(termId: string): Promise<Term[]>;
}

interface QueryScope {
  userId: string;                     // restricts to user's accessible items
  includeSubscribedFeeds?: boolean;   // default true
  includeOwnPosts?: boolean;          // default true
}
```

### 3.8 Feature flags engine
Wraps salvage/02 with DB-backed storage (swaps the in-memory implementation for a Drizzle-backed `IFeatureFlagStorage` against the `feature_flags` table).

### 3.9 Password-hash engine
Wraps salvage/13 directly. Only three functions; not much to wrap. Just exports them through the module context for convenience.

### 3.10 Tenant scope engine
Wraps salvage/12. Adds the auth middleware that calls `runInTenantScope(userId, next)` per request. Exposes `assertScoped('module-name')` for deep code.

### 3.11 Render engine
Described in §2.6. Registered against by content types.

### 3.12 Fields engine
Described in §2.5.

---

## 4. Modules

### 4.1 `auth` module

Owns: `users`, `sessions`, `invite_codes`.

Routes:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /setup` (only while bootstrap_token set)
- `POST /setup`
- `GET /login` (server-rendered login page — the only non-SPA HTML the app serves to authenticated users)

Event subscriptions: none.

Jobs:
- `session.cleanup` (hourly) — delete expired sessions.

Hooks: none.

Admin pages (mounted at `/admin/users/*` in the admin SPA):
- Users list (search, filter by admin/disabled/date)
- User detail (promote/demote, disable, reset password)
- Invite codes (create, list, revoke)

Provides: the auth middleware that other modules' routes use. Authenticated routes declare `requiresAuth: true` in their RouteSpec; the middleware looks up the session, loads the user, calls `runInTenantScope(user.id, next)`.

### 4.2 `content` module

Owns: `content_items`, `user_item_state`, `content_item_dedup_hash`.

Routes:
- Full `/api/content/*` surface from SPEC §9.
- `GET /p/:username/:slug` — public post HTML page. Server-rendered.

Event subscriptions:
- `user.deleted` → purge user's posts and user_item_state.

Jobs:
- `content.retention-purge` (daily) — delete read-not-saved feed items older than `retention_days`.
- `content.soft-delete-purge` (daily) — hard-delete posts with `deleted_at` older than 30 days.

Hooks consumed: `content.beforeSave`, `content.afterRender`.

Content types registered:
- `post` — field schema: `{ body_markdown, body_html, excerpt? }`. Renderer uses marked + DOMPurify.

Reader pages (in the reader SPA):
- Content list (the browse view with facets)
- Single item
- Compose post

Provides: the `render` dispatch for `post` and `feed_item` public renderers.

### 4.3 `feeds` module

Owns: `feeds`, `subscriptions`.

Routes:
- Full `/api/feeds/*` surface.

Event subscriptions:
- `user.deleted` → cascade to subscriptions (handled by FK).

Jobs:
- `feed.poll` — fetches one feed, parses, dedups, inserts new items, emits `content.ingested` per new item. Per-feed circuit breaker.
- `feed.schedule-polls` (every minute) — enqueues `feed.poll` jobs for feeds due.
- `feed.orphan-cleanup` (weekly) — deletes `feeds` rows with zero subscriptions older than 30 days.
- `feed.autodiscover` (on-demand) — given a URL, fetches, parses HTML for `<link rel="alternate">`.

Content types registered:
- `feed_item` — field schema: `{ summary?, content_html?, author?, categories?, media? }`. Renderer shows title, summary, source feed, original link.

Admin pages:
- Feed health dashboard (all feeds, sorted by status)
- Per-feed detail (history, subscriber count, pause/resume)

Reader pages:
- Subscribe form (with autodiscover)
- Subscriptions list (with per-feed settings)

### 4.4 `classification` module

Owns: `rules`, `rule_templates`, `classification_log`.

Routes:
- `/api/rules/*` from SPEC §9.
- `GET /api/rules/:id/matches` — recent classification_log entries for this rule.

Event subscriptions:
- `content.ingested` → run classification for all subscribers of the feed (or owner for posts).
- `content.updated` → re-run classification for affected users.
- `user.registered` → seed `rule_templates` as user rules.

Jobs:
- `classification.run` — async classifier (enqueued by the hook, not run inline for big fanout feed items).
- `classification.log-purge` (daily) — delete `classification_log` older than 30 days.

Admin pages:
- Rule templates (CRUD)

Reader pages:
- Rules list (user's rules, search, filter by enabled / priority)
- Rule editor (expression builder, action picker, test UI)
- Unclassified queue (items zero terms applied, with salvage/07 suggestions)

Provides: triggers classification on content events. Writes results into `content_terms` (for posts) or `user_item_state.user_term_ids` (for feed items).

### 4.5 `taxonomy` module

Owns: `vocabularies`, `terms`, `content_terms`.

Routes:
- `/api/vocabularies/*`, `/api/terms/*`.
- `/api/admin/vocabularies/*` (system vocabularies, admin-only).

Event subscriptions:
- `user.deleted` → cascade user vocabularies (handled by FK).

Jobs: none (purely request-driven).

Admin pages:
- System vocabularies (CRUD)

Reader pages:
- My vocabularies (CRUD)
- Browse terms (for selecting when tagging items or composing rules)

Provides: the taxonomy engine's read surface. On startup, loads all vocabularies into the engine's in-memory index.

### 4.6 `outgoing-feeds` module

Owns: `outgoing_feeds`.

Routes:
- `/api/outgoing-feeds/*`.
- `GET /rss/:slug-:secret` — public Atom/RSS generator.

Event subscriptions:
- `content.created`, `content.updated`, `content.deleted`, `user_item_state.*` → invalidate cached outgoing feed XML for affected user.
- `user.deleted` → cascade outgoing_feeds (FK).

Jobs: none (request-driven; XML generated on GET with short cache).

Reader pages:
- Outgoing feeds list
- Create / edit outgoing feed (saved query + settings)

### 4.7 `export` module

Owns: nothing (reads from other modules' tables).

Routes:
- `/api/export/*` surface.

Dependencies: `auth`, `content`, `feeds`, `classification`, `taxonomy`, `outgoing-feeds`.

Admin pages: none.

Jobs: none (request-driven).

### 4.8 `admin` module

Provides the admin shell + the admin SPA bundle. Aggregates admin pages from other modules via the `admin.menu` hook.

Routes:
- `/api/admin/users/*`, `/api/admin/feeds/*`, `/api/admin/audit`, `/api/admin/dead-letter/*`, `/api/admin/flags/*`, `/api/admin/settings`, `/api/admin/backup`, `/api/admin/rule-templates/*`, `/api/admin/invite-codes/*`.
- `GET /admin/*` — serves the admin SPA.

Event subscriptions: none (observational only via audit_log writes, which are written synchronously at each admin action).

Jobs: none.

Provides: the `admin.menu` hook point. Modules contribute to it; admin SPA reads from `GET /api/admin/menu` at load.

### 4.9 `public` module

Serves the small public HTML surface that isn't the SPA.

Routes:
- `GET /p/:username/:slug` — public post (delegates rendering to `content` module's registered renderer for `target='public-html'`)
- `GET /` — redirect root (to `/app` if logged in, `/login` otherwise)
- `GET /login` — server-rendered login page
- `GET /health`, `/ready`, `/metrics` — operational

Admin pages: none.

Event subscriptions: none.

Jobs: none.

---

## 5. Key flows

### 5.1 Request lifecycle

```
 ┌───────────┐
 │  Request  │
 └─────┬─────┘
       │
       ▼
 Express middleware stack (order matters):
 ┌──────────────────────────────────────────────────────────┐
 │ 1. Trust proxy config                                     │
 │ 2. Security (helmet, path-traversal) [salvage/04]         │
 │ 3. Rate limit (per-route tier) [salvage/04]               │
 │ 4. Correlation ID [salvage/03]                            │
 │ 5. Request logging [salvage/03]                           │
 │ 6. Metrics HTTP instrumentation [salvage/05]              │
 │ 7. Cookie parser                                          │
 │ 8. CSRF (on state-changing routes, enabled prod only)     │
 │ 9. Body parser (json, 1 MiB limit)                        │
 │ 10. Auth middleware (session lookup; attaches user)        │
 │ 11. Tenant scope [salvage/12]: runInTenantScope(userId)   │
 └──────────────────────────────────────────────────────────┘
       │
       ▼
 Route handler (from some module's manifest)
       │
       ▼
 DB queries run inside the tenant scope; assertScoped() in deep code
       │
       ▼
 JSON response + Content-Type
```

Public routes (no auth required) skip steps 10–11. Admin routes check `user.is_admin` after step 10.

### 5.2 Feed polling flow

```
Scheduler tick (every 60s)
  │
  ▼
SELECT feeds WHERE next_poll_at <= now()
  │
  ▼
For each feed, enqueue 'feed.poll' job (dedup key = feedId so in-flight polls don't double-book)
  │
  ▼
Queue worker picks up job
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  feed.poll handler:                                          │
│                                                               │
│  1. Load feed from DB                                        │
│  2. circuitBreaker.forFeed(feedId).execute(async () => {    │
│       a. GET feed.url with                                    │
│          - User-Agent: system_settings.feed_user_agent        │
│          - If-None-Match: feed.etag                           │
│          - If-Modified-Since: feed.last_modified              │
│          - 10s timeout, 10 MiB max body                       │
│       b. On 304: update last_polled_at; done                  │
│       c. On 2xx: parse with rss-parser                        │
│          For each item:                                       │
│            - Compute dedup key (guid | link | title+date)     │
│            - If exists, skip (deep comparison optional)       │
│            - Sanitize content_html with DOMPurify             │
│            - INSERT content_items                             │
│            - INSERT content_item_dedup_hash                   │
│            - Emit content.ingested event                      │
│          Update feed: etag, last_modified, last_polled_at,    │
│            last_success_at, consecutive_fail = 0             │
│     })                                                        │
│  3. On error (non-circuit-open):                             │
│       - Increment consecutive_fail                           │
│       - If 5: circuit opens for 1 hour                       │
│       - If 15: status = 'dead'                               │
│       - Log feed.failed event                                │
│  4. On circuit-open: just skip (will retry after cooldown)   │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Classification flow

Two triggers: feed ingestion (many subscribers per item) and post creation (one owner).

```
Event: content.ingested
  │
  ▼
Handler in classification module
  │
  ▼
If source='post':
  For the owner:
    Fetch user's enabled rules ORDER BY priority ASC
    For each rule:
      Run safe-expression against ctx for posts
      If matched, insert into content_terms for each action.term_id
      Insert classification_log row
    Emit rule.fired events
    If zero terms applied: item stays visible in unclassified queue
  │
  ▼
If source='feed':
  Get all enabled subscribers for feed_id
  For each subscriber (parallelized to concurrency limit):
    Fetch their enabled rules ORDER BY priority ASC
    Build ctx for feed items
    For each rule:
      Run safe-expression
      If matched, update user_item_state.user_term_ids for this user
      Insert classification_log row
    Emit rule.fired events
```

Big fanout (many subscribers × many rules) means this runs as a queued job, not inline with the feed fetch. Enqueue `classification.run` from the hook; fetch-return is fast.

### 5.4 Outgoing feed generation

```
GET /rss/:slug-:secret
  │
  ▼
SELECT * FROM outgoing_feeds WHERE slug = ? AND secret = ?
  │
  ▼
404 if no match (no timing leak)
  │
  ▼
Parse outgoing_feed.query (serialized QueryOperation)
  │
  ▼
QueryScope = { userId: outgoing_feed.owner_user_id, ... }
  │
  ▼
taxonomyEngine.query(op, scope).contentIds
  │
  ▼
Fetch up to max_items content_items with fields, ORDER BY published_at DESC
  │
  ▼
Filter by include_posts / include_feed_items
  │
  ▼
For each: render(item, target='rss-atom', ctx) or 'rss-2'
  │
  ▼
Build <feed> wrapper: title, subtitle, link self, link via, updated, logo
  │
  ▼
xmlbuilder2 → string
  │
  ▼
Response: Cache-Control public max-age=300, Content-Type application/atom+xml, X-Robots-Tag noindex
```

---

## 6. Admin UI design

Admin SPA lives at `/admin`. Single-page application, React + TanStack Query + wouter. Served as static assets; makes JSON calls to `/api/admin/*`.

### 6.1 Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  RSS-CMS Admin   ┌─────────────────────────────┐        [Admin ▼]    │
│                  │ Search users/feeds/rules... │                      │
│                  └─────────────────────────────┘                      │
├───────────┬────────────────────────────────────────────────────────────┤
│           │                                                            │
│ DASHBOARD │   Active users:         12                                 │
│ Users     │   Feeds:                487   (3 failing, 2 dead)          │
│ Feeds     │   Items (24h):          1,204                              │
│ Rules     │   Unclassified (all):   89                                 │
│ Audit     │   Dead-letter jobs:     0                                  │
│ Flags     │                                                            │
│ Settings  │   Recent activity ──────────────                           │
│           │   ● new feed subscribed  — user@host   5 min ago           │
│ INVITES   │   ● rule created         — alice       12 min ago          │
│           │   ● feed polling failed  — example.com 42 min ago          │
│           │                                                            │
│ BACKUP    │                                                            │
└───────────┴────────────────────────────────────────────────────────────┘
```

Left rail is always visible. Menu items contributed by modules via `admin.menu` hook; grouping and ordering come from the manifest.

### 6.2 Screens

**Dashboard** — counters, recent audit log entries, one-click links to failing feeds and unclassified queue totals.

**Users**
- List: columns username, display name, admin badge, disabled badge, created, last login. Search + filter chips (all/admins only/disabled/inactive 30d).
- Row action: open user detail.
- User detail: edit display name, promote/demote button, disable/enable, reset password (shows generated temp password once in a modal; admin copies and delivers out-of-band). Audit log filtered to this user. Subscription count, post count, outgoing feed count.

**Feeds (system-wide health dashboard)**
- Default sort: status DESC then consecutive_fail DESC. Failing feeds float to top.
- Columns: URL, subscribers, status, consecutive_fail, last_success, last_polled.
- Row action: pause/resume, view detail.
- Detail: poll history chart (salvage/05 metrics), subscriber list, raw fetch log (last 20), manual override of poll_interval.

**Rule templates** — CRUD. Template fields: name, description, expression (monaco-editor with safe-expression syntax), action picker (tag with system vocab terms), offered-by-default toggle. On save: salvage/09 validates expression; errors surfaced inline.

**System vocabularies / terms** — hierarchical view of each system vocabulary. Add/rename/merge/delete terms. Merge warns about affected `content_terms` rows.

**Audit log** — virtualized scroll. Filter by user, action, entity, date range.

**Dead-letter queue** — list of failed jobs. Expand to see full payload + error. Actions: retry (re-enqueues with attempts=0), resolve (mark resolved without retry), bulk-resolve with filter.

**Feature flags** — each flag's state, description, rollout percentage, targeting rules. Edit in-place. Change history via feature_rollout_history. 

**System settings**
- Registration mode (radio: disabled / invite / open)
- Default poll interval (number)
- Retention days (number)
- Feed User-Agent (text)
- Rate limit config (structured JSON editor)

**Invite codes** — list, create (generates random code with optional expiry), revoke.

### 6.3 Component breakdown

Shared admin components (all in `admin/components/`):
- `PageHeader` — title + action slot
- `DataTable` — columns spec, row action, pagination, sort, filter
- `FormField` — label + input + error + hint
- `ExpressionEditor` — monaco with safe-expression tokens highlighted
- `TermPicker` — autocomplete over vocabularies
- `StatusBadge` — colored pill for status enums
- `ConfirmDialog` — used on destructive actions
- `JsonEditor` — for rate-limit config etc.

Per-screen components:
- `<UsersList>`, `<UserDetail>`, `<FeedsList>`, `<FeedDetail>`, `<RuleTemplatesList>`, `<RuleEditor>`, `<VocabularyEditor>`, `<AuditLog>`, `<DeadLetterList>`, `<FlagsList>`, `<SettingsForm>`, `<InviteCodesList>`

### 6.4 Keyboard

- `g d` — dashboard
- `g u` — users
- `g f` — feeds
- `g r` — rules templates
- `g a` — audit
- `?` — help overlay
- `/` — focus global search
- Standard list navigation in tables: `j/k`, `enter` to open

---

## 7. Reader UI design

Reader SPA lives at `/app`. Same stack as admin (React, TanStack, wouter). Separate bundle because feature surface differs and caching wins.

### 7.1 Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  RSS-CMS                    ┌────────────────────────┐   [user ▼]     │
│                             │ /  quick search         │                 │
│                             └────────────────────────┘                 │
├───────────┬────────────────────────────────────────────────────────────┤
│           │                                                            │
│ INBOX (89)│  inbox  ·  unread (24h)                                    │
│ Saved     │                                                            │
│ Unclassif │  ┌──────────────────────────────────────────────────────┐  │
│           │  │ ■  Techcrunch: Apple unveils new M5 chip             │  │
│ SUBSCR.   │  │    Techcrunch · 2h ago · #technology · #apple        │  │
│  Tech     │  │    Apple today introduced the new M5, featuring...   │  │
│  News     │  └──────────────────────────────────────────────────────┘  │
│  Writing  │  ┌──────────────────────────────────────────────────────┐  │
│  + Add    │  │ □  My thoughts on rule engines                       │  │
│           │  │    Your post · 5h ago · #writing · #cms              │  │
│ COMPOSE   │  │    I've been working on a rule engine that...        │  │
│ Rules     │  └──────────────────────────────────────────────────────┘  │
│ Vocabs    │                                                            │
│ Feeds     │  Facets ▾                                                  │
│ Outgoing  │    Topic: [technology × ] [cms]   +                       │
│           │    Source: All  |  Feeds only  |  My posts                │
│           │    Period: Today  24h  7d  30d  All                       │
│           │    Read/Unread: All  Unread  Saved                        │
└───────────┴────────────────────────────────────────────────────────────┘
```

### 7.2 Screens

**Inbox** — the primary browse view.
- Item row: read/unread indicator, title, source (feed title or "Your post"), relative time, applied tags as chips, short excerpt. Left-click → detail. `s` → toggle save. `j/k` → prev/next. `o` or `enter` → open.
- Facet sidebar: selected terms as removable chips, source filter, period, read state. Clicking a chip in an item adds it to the active facet.
- Top bar: current filter summary, count, "mark all read" for current filter.
- Infinite-scroll pagination (TanStack).

**Item detail** — full view.
- Title, source link (external for feed items; internal permalink for posts).
- Body: rendered HTML. For feed items, "View original" link prominent.
- Meta sidebar: applied tags (with source indicator: rule R vs. manual), classification trail ("matched by Rule: tech-news"), "why tagged?" expandable.
- Action bar: save, mark unread, add tag (picker over user vocabularies + free-form), add note.
- Keyboard: `s` save, `u` unread, `t` tag, `n` next, `p` prev.

**Saved** — items where `user_item_state.saved = true`. Same layout as inbox.

**Unclassified queue** — items with zero terms applied for this user. Shows salvage/07 suggestions for each. One-click "add tag" or "create rule from this pattern."

**Subscriptions**
- Grouped list (by folder-like tag if user sets `tag_filter`; flat otherwise).
- Actions per subscription: unsubscribe, rename (title_override), disable, set custom poll interval.
- "Add feed" at top: text input that triggers autodiscover on URL paste.

**Compose post**
- Title, markdown textarea (split view: editor / preview), visibility picker, tags picker, "publish" vs. "save draft."
- Markdown preview rendered via the same render pipeline the server uses.

**Rules**
- List: name, expression preview, enabled toggle, priority, match count, last-matched, edit / delete actions.
- Editor: name, description, Monaco expression editor with syntax highlighting matching safe-expression grammar, action picker, test-against-recent-items button, save.
- "Test" opens a drawer showing which recent items would match with the current expression.

**Vocabularies** — list user's + system vocabularies. Click to open term tree. Add/rename/delete terms in user vocabularies; view-only for system.

**Outgoing feeds**
- List: title, slug, URL (with copy button for the secret URL), last-served, subscriber count (best-effort — based on User-Agent logs).
- Editor: title, slug, description, query builder (pick terms AND/OR/NOT, date filter, source filter), max items, format (Atom/RSS 2). "Regenerate secret" is a separate explicit action (rotates URL).

### 7.3 Component breakdown

- `ItemRow`, `ItemDetail`, `FacetBar`, `TagChip`, `SourceBadge`
- `FeedSubscribeForm` (with autodiscover)
- `MarkdownEditor` (textarea + live preview via `render` stub)
- `RuleEditor` (shared with admin rule templates)
- `QueryBuilder` (for outgoing feed queries + saved browse queries)
- `VocabularyTree`
- `KeyboardShortcutsHelp`

### 7.4 Keyboard

- `g i` inbox · `g s` saved · `g u` unclassified · `g r` rules · `g f` feeds · `g o` outgoing · `g c` compose
- In lists: `j/k` prev/next, `o`/`enter` open, `s` save, `u` toggle read, `t` tag
- `/` quick search, `?` help, `esc` close overlay

---

## 8. Public UI design

Minimal. Three server-rendered pages + operational endpoints + outgoing RSS XML.

### 8.1 Login page (`GET /login`)

Plain HTML form. Server-rendered. Posts to `/api/auth/login`.
- Header with product name
- Username / password fields (basic HTML, minimal styling)
- "Log in" button
- If `registration_mode != 'disabled'`, a "Register" link
- Link to `/setup` only present if bootstrap_token is set (serves to support first-boot)

### 8.2 Public post page (`GET /p/:username/:slug`)

If visibility `public` or `unlisted` and user not disabled:

```html
<!DOCTYPE html>
<html>
<head>
  <title>{post.title} — {user.displayName}</title>
  <link rel="canonical" href="{publicUrl}/p/{username}/{slug}">
  <meta name="robots" content="noindex">  <!-- unless user opted in -->
  <meta property="og:title" content="{post.title}">
  <meta property="og:description" content="{excerpt or first 200 chars}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{publicUrl}/p/{username}/{slug}">
  <meta property="og:article:published_time" content="{iso published_at}">
  <meta name="twitter:card" content="summary">
  <style>/* minimal typography CSS, inline, under 2 KB */</style>
</head>
<body>
  <article>
    <header>
      <h1>{post.title}</h1>
      <p class="byline">by {user.displayName} · <time datetime="{iso}">{human date}</time></p>
    </header>
    <div class="body">{rendered_html}</div>
  </article>
</body>
</html>
```

No CSS framework. Minimal inline styling. Printable. Readable on mobile without a viewport gymnastics.

### 8.3 Outgoing RSS (`GET /rss/:slug-:secret`)

Atom 1.0 by default:

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{outgoing_feed.title}</title>
  <subtitle>{outgoing_feed.description}</subtitle>
  <link rel="self" href="{publicUrl}/rss/{slug}-{secret}"/>
  <link rel="alternate" type="text/html" href="{publicUrl}/@{owner.username}"/>
  <updated>{latest item's updated_at}</updated>
  <id>urn:rss-cms:outgoing-feed:{outgoing_feed.id}</id>
  <generator uri="{publicUrl}">RSS-CMS</generator>

  <entry>
    <title>{item.title}</title>
    <link rel="alternate" type="text/html" href="{item's canonical URL}"/>
    <id>urn:rss-cms:item:{item.id}</id>
    <published>{item.published_at}</published>
    <updated>{item.updated_at}</updated>
    <author><name>{item author or feed title}</name></author>
    <category term="{term.slug}" label="{term.name}"/>   <!-- per applied term -->
    <summary type="text">{summary}</summary>
    <content type="html"><![CDATA[{content_html}]]></content>
  </entry>
  ...
</feed>
```

RSS 2.0 as alternative when `format='rss2'`.

### 8.4 Operational endpoints

- `GET /health` — `{"status":"ok"}` if process is alive.
- `GET /ready` — `{"status":"ok"}` if DB connects and salvage/06 breaker is closed.
- `GET /metrics` — Prometheus text format (salvage/05).

---

## 9. API request / response shapes (selected)

Enough detail that the client can be written. Not exhaustive — obvious CRUD shapes follow standard patterns.

### 9.1 Auth

```ts
// POST /api/auth/register
// body
{ username: string; password: string; email?: string; display_name?: string; invite_code?: string }
// 201
{ user: SafeUser }
// 400: { error: 'validation', fields: {...} }
// 403: { error: 'registration_disabled' | 'invite_required' | 'invite_invalid' }
// 429: rate-limited

// POST /api/auth/login
// body
{ username: string; password: string }
// 200 — sets session cookie
{ user: SafeUser }
// 401
{ error: 'invalid_credentials' }
// 429
{ error: 'rate_limited', retry_after: number }

// GET /api/me
{ user: SafeUser } | 401
```

### 9.2 Feeds subscribe

```ts
// POST /api/feeds/subscribe
// body
{ url: string }
// 201 — if feed was resolved directly
{ subscription: Subscription; feed: Feed; ingested: number }
// 200 — if URL was HTML and autodiscover found candidates
{ candidates: Array<{ url: string; title: string; type: string }> }
// client re-submits with a candidate URL
```

### 9.3 Content list

```ts
// GET /api/content?terms=t1,t2&source=feed&read=false&period=7d&limit=25&offset=0
{
  items: Array<{
    id: string;
    source: 'feed' | 'post';
    title: string;
    published_at: string;   // iso
    excerpt: string;        // from fields.summary or derived
    source_info:
      | { type: 'feed'; feed_id: string; feed_title: string }
      | { type: 'post'; author: { username: string; display_name: string } };
    applied_terms: Array<{ id: string; name: string; vocabulary: string; applied_by: 'rule' | 'manual' }>;
    user_state: {
      read: boolean;
      saved: boolean;
      user_tags: string[];
      user_term_ids: string[];
      note: string | null;
    };
  }>;
  total: number;
  has_more: boolean;
}
```

### 9.4 Rules test

```ts
// POST /api/rules/test
// body
{ expression: string; action?: { op: 'tag'; term_id: string } }
// 200
{
  parse_ok: boolean;
  parse_error?: string;
  matches: Array<{ item_id: string; title: string; matched: boolean }>;  // up to 50 recent items
  matched_count: number;
  not_matched_count: number;
}
```

### 9.5 Outgoing feed create

```ts
// POST /api/outgoing-feeds
// body
{
  slug: string;
  title: string;
  description?: string;
  query: QueryOperation;   // the salvage/11 serializable query shape
  include_posts: boolean;
  include_feed_items: boolean;
  max_items: number;
  format: 'atom' | 'rss2';
}
// 201
{ outgoing_feed: OutgoingFeed; public_url: string }
```

---

## 10. Extension seams

Where the future modules plug in.

### 10.1 Media module
- New `media_assets` table, owned by the media module.
- Registers new content types (`image`, `video`) via Fields API.
- Subscribes to `content.beforeSave` hook to extract inline image references from markdown and rewrite URLs to internal ones.
- Adds admin page "Media library."
- Wraps S3/R2/local-disk storage behind a `MediaStorageAdapter` interface; default local-disk.
- Subscribes to `content.deleted` to garbage-collect associated assets.

### 10.2 Editor (block-based WYSIWYG) module
- New content type `blocks_post` with `fields: { blocks: Block[] }`.
- Registers a React block editor component (TipTap or Lexical) into the admin SPA.
- Registers a server-side block renderer with the Render engine (`render(item, 'public-html')`).
- Hooks `content.beforeSave` to validate block schema.
- Existing `post` content type continues to work — old content renders via markdown, new content renders via blocks. No migration required.

### 10.3 Layout module
- New content type `page` with `fields: { regions: { [regionId]: Block[] } }`.
- Adds public route `/pages/:slug`.
- Introduces themes: each theme provides region definitions + templates.
- Registers with Render engine under target `public-html` for `content_type_id='page'`.

### 10.4 Fields API (user-facing) module
- New table `content_types` + `field_definitions`.
- Admin UI to define a new content type via the registry.
- Widgets and formatters register themselves; the admin picks from a menu.
- Dynamic Zod schema built at runtime from the stored field definitions.

### 10.5 Plugin registry
- Single module that reads JS/TS files from a `plugins/` directory.
- Each plugin file registers into hook points declared in §2.3.
- Sandboxing not in MVP; plugins run in the same process as the server and are assumed trusted. Sandboxing via `isolated-vm` is a future hardening step.

### 10.6 Full-text search module
- Depends on Meilisearch, Typesense, or Postgres `tsvector`.
- Subscribes to `content.ingested` / `content.created` / `content.updated` / `content.deleted` and indexes/removes.
- Adds `search` query op to the taxonomy query engine (or exposes a separate `/api/search` endpoint).
- Falls back gracefully: if the search backend is unavailable, existing term-based queries still work.

### 10.7 Email digest module
- Depends on an SMTP library (nodemailer).
- Admin configures SMTP via system_settings.
- New `digest_schedules` table: per-user digest config (frequency, time, query).
- Scheduled job generates a digest using the outgoing-feed rendering pipeline, emits via SMTP.

### 10.8 Comments module
- New `comments` table keyed to `content_items.id`.
- Adds UI to read and authenticated-comment on a post.
- Only on `public` posts, initially.
- Spam/moderation is a separate concern (admin review queue via hooks).

---

## 11. Error handling and observability

### 11.1 Error classes

- User-facing errors: 4xx with JSON `{ error: code, message: string, fields?: {...} }`. Codes are stable machine-readable strings (`rate_limited`, `not_found`, `invalid_expression`).
- Unexpected errors: 500 with `{ error: 'internal', correlation_id: string }`. The correlation ID lets the user report the problem; the admin finds it in the structured log.
- All errors are logged with correlation ID, request path, user ID (if any), stack.

### 11.2 Metric catalog

Extends salvage/05 with CMS-specific counters:

```
HTTP (from salvage)
  http_requests_total{method, path, status}
  http_request_duration_seconds{method, path, status}

Auth
  auth_login_attempts_total{result: success|failure|rate_limited}
  auth_sessions_active (gauge, hourly sample)

Feeds
  feed_polls_total{status: ok|304|error|circuit_open}
  feed_poll_duration_seconds
  feed_items_ingested_total
  feed_items_deduped_total
  feed_bytes_fetched_total
  feed_304_responses_total
  feed_circuit_breaker_opens_total{feed_id_hash}

Content
  content_created_total{source: feed|post}
  content_deleted_total
  content_retention_purged_total

Classification
  rules_evaluated_total{result: match|no_match|error}
  rule_evaluation_duration_seconds
  unclassified_items (gauge)

Taxonomy
  taxonomy_terms_total (gauge)
  taxonomy_query_cache_hits_total
  taxonomy_query_cache_misses_total

Outgoing feeds
  outgoing_feed_served_total{format}
  outgoing_feed_serve_duration_seconds

Jobs
  jobs_enqueued_total{type}
  jobs_completed_total{type, status}
  jobs_dead_lettered_total{type}
  job_processing_duration_seconds{type}
```

### 11.3 Logs

Structured JSON in production (salvage/03). Key fields: `ts`, `level`, `correlation_id`, `user_id`, `module`, `msg`, plus contextual keys.

Redaction (from salvage/03) strips `password`, `token`, `secret`, `cookie`, `authorization`, `csrf_token`, `bootstrap_token`.

Specific log points:
- Feed poll start / success / 304 / failure (with reason + consecutive_fail count)
- Rule fire (at debug level; at info when `classification_log` is being skipped for rate-limit)
- Auth success / failure (info)
- Admin action (info with full payload minus redacted fields)
- DB circuit open / close (warn / info)

### 11.4 Runbooks

Short docs in `cms-spec/runbooks/` (not part of MVP code, but part of the ops story):
- "Feed is failing" — what to check
- "Classification seems wrong" — how to use the rule trail
- "DB is slow" — the 4 most common causes
- "Bootstrap token lost" — reset via CLI
- "Upgrading to a new release" — migration runner behavior

---

## 12. Directory structure (runtime)

```
app/
├── core/
│   ├── bootstrap.ts
│   ├── config.ts
│   ├── db.ts
│   ├── events.ts
│   ├── hooks.ts
│   ├── module-loader.ts
│   ├── render.ts
│   ├── fields.ts
│   └── migrations/              -- cross-cutting, if any
├── engines/
│   ├── logger/
│   ├── metrics/
│   ├── security/
│   ├── queue/
│   ├── circuit-breaker/
│   ├── classification/
│   ├── taxonomy/
│   ├── feature-flags/
│   ├── password-hash/
│   └── tenant-scope/
├── modules/
│   ├── auth/
│   │   ├── manifest.ts
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   ├── jobs.ts              -- session cleanup
│   │   ├── pages/               -- /setup, /login HTML
│   │   ├── admin-pages/         -- components for admin SPA
│   │   └── migrations/
│   ├── content/
│   ├── feeds/
│   ├── classification/
│   ├── taxonomy/
│   ├── outgoing-feeds/
│   ├── export/
│   ├── admin/
│   └── public/
├── shared/
│   ├── types.ts                 -- AppEvent union, common interfaces
│   └── db-schema.ts             -- exported Drizzle schemas for cross-module reads (rare)
├── ui/
│   ├── admin/                   -- admin SPA (React)
│   │   ├── src/
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── reader/                  -- reader SPA (React)
│   └── public/                  -- server-rendered HTML templates
├── bin/
│   ├── reset-admin.ts
│   └── regenerate-outgoing-secret.ts
├── salvage/                     -- the 13 salvage units, symlinked or copied
├── tests/
│   ├── unit/                    -- per-engine, per-module business logic
│   ├── integration/             -- cross-module flows
│   └── e2e/                     -- full user flows via playwright (future)
├── docker-compose.yml           -- postgres + app for local dev
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── server.ts                    -- entry point, calls core/bootstrap
```
