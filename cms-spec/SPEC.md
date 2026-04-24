# SPEC

Specification for the multi-user RSS-aggregating CMS. Working notes, not an authoritative artifact. Companion docs: [DESIGN.md](./DESIGN.md), [IMPLEMENTATION.md](./IMPLEMENTATION.md).

All decisions in this document are held at the "SPEC level" — they change how the system behaves. Anything not written here is either delegated to DESIGN.md (structural choices) or deferred entirely.

---

## 1. System overview

A self-hosted web application that:

- Polls RSS / Atom feeds on behalf of multiple registered users
- Lets each user subscribe to feeds, read items, write original posts, and define classification rules
- Auto-classifies both feed items and user posts using per-user rules
- Presents a faceted browsing UI over items and terms
- Publishes curated outgoing RSS feeds that users can consume in their own readers

Deployed as one Node process + one Postgres database. Designed for deployments at the scale of a single person or a small team — not multi-tenant SaaS.

The CMS is explicitly extensible along content type, media, editor, layout, and module dimensions. The MVP doesn't ship these features, but the architecture (documented in DESIGN.md) has named extension seams for each.

## 2. Actors

### Reader
Registered user. Default account type. Can:
- Subscribe to feeds (shared URL resolution) and manage per-user subscription state
- Read feed items from feeds they're subscribed to
- Write, edit, and delete their own posts
- CRUD their own rules and vocabularies
- View their classification trail
- Publish outgoing RSS feeds as secret URLs
- Export everything they own

Cannot see other users' subscriptions, reading state, private posts, or rules.

### Admin
Reader with `is_admin = true`. In addition to everything a reader can do:
- Manage system vocabularies (shared with all users, read-only to them)
- Manage rule templates (offered to new users at onboarding)
- View and manage the feed health dashboard (all feeds, system-wide)
- View the dead-letter queue and retry or discard failed jobs
- View the audit log
- Manage system settings (registration mode, feature flags, retention policies)
- Reset any user's password (admin-only recovery for email-less deployments)
- Promote / demote / disable any user

The first admin is created through the bootstrap token flow on first boot (see 6.1).

### Public visitor
Unauthenticated. Can reach only:
- Outgoing RSS feeds (by secret URL)
- Individual public posts (by URL; visibility must be `public`)
- `/health`, `/ready`, `/metrics` operational endpoints

Cannot reach any user's private data, any feed item, any profile page (profile pages don't exist in the MVP).

## 3. Core concepts

| Concept | Definition |
|---|---|
| Feed | A unique RSS/Atom/JSON-feed URL. Shared across all subscribers. Holds metadata (etag, last-modified, poll state). |
| Subscription | A reader's interest in a feed. Holds per-user state (enabled, title override, optional tag filter). Many per feed. |
| Content item | Unified row for feed items and user posts. `source` column distinguishes. Same row, different shapes. |
| User item state | Per-user overlay on a shared feed item. Tracks read/saved/tags/notes. One row per (user, feed item). |
| Post | A content item with `source = 'post'`. Owned by one reader. Has `visibility` (`private`/`unlisted`/`public`). |
| Vocabulary | A named collection of terms. System vocabularies (`owner_user_id IS NULL`) or user vocabularies. |
| Term | A tag within a vocabulary. May have parent terms (DAG, bounded by vocabulary hierarchy type). |
| Rule | A classification rule. Owned by exactly one user. Expression evaluated by salvage `09-safe-expression`; actions apply tags. |
| Rule template | A pre-made rule offered at onboarding. Seeded into new users' `rules` table as per-user rules. |
| Outgoing feed | A saved query published as Atom XML at a URL containing a hard-to-guess secret. Public by virtue of URL possession. |
| Classification log | An audit of rule-firings (retained 30 days). Supports "why was this tagged?" in the UI. |
| System settings | Single-row table of deploy-level config: registration mode, bootstrap token, default rate limits. |

## 4. Data model

All columns are Postgres types. `?` = nullable. Implementation order (who needs whom) is in IMPLEMENTATION.md.

### 4.1 Users, sessions, settings

```
users
  id                    uuid pk
  username              text unique not null     -- matches /^[a-zA-Z0-9_-]{3,32}$/
  email                 text unique              -- optional
  password_hash         text not null             -- from salvage/13
  display_name          text?
  is_admin              bool not null default false
  profile_public        bool not null default false   -- reserved; not used in MVP
  invite_code_used      text?
  created_at            timestamptz not null default now()
  last_login_at         timestamptz?
  disabled              bool not null default false

sessions
  id                    uuid pk
  user_id               uuid not null references users(id) on delete cascade
  cookie                text unique not null      -- opaque token
  expires_at            timestamptz not null      -- absolute cap: created_at + 90 days
  last_active_at        timestamptz not null default now()
  created_at            timestamptz not null default now()
  ip                    text?
  user_agent            text?
  index (user_id)
  index (expires_at)                              -- for cleanup job

system_settings                                   -- single row; id always = 1
  id                    int pk default 1 check (id = 1)
  bootstrap_token       text?                     -- cleared after first admin created
  registration_mode     text not null default 'disabled'  -- 'disabled' | 'invite' | 'open'
  default_poll_interval int not null default 900  -- seconds; 15 minutes
  feed_user_agent       text not null default 'RSS-CMS/1.0 (+{host}/about)'
  rate_limit_config     jsonb not null default '{}'
  retention_days        int not null default 90   -- for read-not-saved items
  updated_at            timestamptz not null default now()

invite_codes
  code                  text pk                   -- random, URL-safe
  created_by            uuid not null references users(id) on delete cascade
  created_at            timestamptz not null default now()
  expires_at            timestamptz?
  consumed_by           uuid? references users(id)
  consumed_at           timestamptz?
```

### 4.2 Feeds, subscriptions, dedup

```
feeds
  id                    uuid pk
  url                   text unique not null      -- canonical form, lowercase host, no fragment
  title                 text
  description           text?
  home_url              text?
  favicon_url           text?
  etag                  text?
  last_modified         text?
  last_polled_at        timestamptz?
  last_success_at       timestamptz?
  status                text not null default 'active'   -- 'active' | 'failing' | 'dead'
  consecutive_fail      int not null default 0
  poll_interval         int not null default 900  -- seconds; overrides system default if set
  created_at            timestamptz not null default now()

subscriptions
  user_id               uuid not null references users(id) on delete cascade
  feed_id               uuid not null references feeds(id) on delete cascade
  title_override        text?
  tag_filter            text?                     -- future: filter items by tag before insert
  enabled               bool not null default true
  subscribed_at         timestamptz not null default now()
  primary key (user_id, feed_id)
  index (feed_id)                                 -- for subscriber count / cleanup

content_item_dedup_hash
  feed_id               uuid not null references feeds(id) on delete cascade
  hash                  text not null             -- sha256(title + '|' + iso8601(published_at))
  content_item_id       uuid not null references content_items(id) on delete cascade
  primary key (feed_id, hash)
```

### 4.3 Content

```
content_items
  id                    uuid pk
  source                text not null check (source in ('feed', 'post'))
  feed_id               uuid? references feeds(id) on delete cascade       -- feed items only
  owner_user_id         uuid? references users(id) on delete cascade       -- posts only
  guid                  text?                                              -- feed items only
  link                  text?
  title                 text not null
  slug                  text?
  fields                jsonb not null default '{}'                        -- type-specific (see 4.3.1)
  status                text not null default 'published'                  -- 'draft' | 'published' | 'archived'
  visibility            text not null default 'private'                    -- posts only; 'private' | 'unlisted' | 'public'
  published_at          timestamptz?
  fetched_at            timestamptz not null default now()
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  deleted_at            timestamptz?                                       -- soft delete; purge after 30 days

  index (source, published_at desc)
  index (feed_id, published_at desc) where source = 'feed'
  index (owner_user_id, published_at desc) where source = 'post'
  unique index (feed_id, guid) where source = 'feed' and guid is not null
  unique index (feed_id, link) where source = 'feed' and guid is null and link is not null
  unique index (owner_user_id, slug) where source = 'post' and slug is not null

user_item_state
  user_id               uuid not null references users(id) on delete cascade
  content_item_id       uuid not null references content_items(id) on delete cascade
  read                  bool not null default false
  saved                 bool not null default false
  user_tags             text[] not null default '{}'     -- free-form strings not in any vocabulary
  user_term_ids         uuid[] not null default '{}'     -- terms from user-owned vocabularies
  note                  text?
  read_at               timestamptz?
  saved_at              timestamptz?
  primary key (user_id, content_item_id)
  index (user_id, saved) where saved = true
  index (user_id, read, content_item_id)           -- unread-for-user queries
```

#### 4.3.1 Fields JSONB shapes

At the DB layer `fields` is untyped. The Fields API (see DESIGN.md §2.5) enforces types per content type.

```ts
// source='feed'
type FeedItemFields = {
  summary?: string;        // plaintext, ≤ 10 000 chars
  content_html?: string;   // sanitized HTML, ≤ 1 MiB
  author?: string;
  categories?: string[];   // raw feed categories, not yet terms
  media?: Array<{ url: string; type: string; length?: number }>;
};

// source='post'
type PostFields = {
  body_markdown: string;   // GitHub-flavored markdown
  body_html: string;        // rendered once on save, sanitized
  excerpt?: string;
};
```

### 4.4 Taxonomy

```
vocabularies
  id                    uuid pk
  owner_user_id         uuid? references users(id) on delete cascade       -- null = system
  label                 text not null
  slug                  text not null
  hierarchy             int not null default 1 check (hierarchy in (0, 1, 2))
  description           text?
  created_at            timestamptz not null default now()
  unique index (coalesce(owner_user_id::text, '__system__'), slug)

terms
  id                    uuid pk
  vocabulary_id         uuid not null references vocabularies(id) on delete cascade
  name                  text not null
  slug                  text not null
  parent_ids            uuid[] not null default '{}'
  weight                int not null default 0
  description           text?
  created_at            timestamptz not null default now()
  unique index (vocabulary_id, slug)

content_terms
  content_item_id       uuid not null references content_items(id) on delete cascade
  term_id               uuid not null references terms(id) on delete cascade
  applied_by            text not null                -- 'rule:<rule_id>' | 'manual:<user_id>'
  applied_at            timestamptz not null default now()
  primary key (content_item_id, term_id)
  index (term_id)                                    -- for "all items tagged X"
```

### 4.5 Rules

```
rules
  id                    uuid pk
  owner_user_id         uuid not null references users(id) on delete cascade
  name                  text not null
  description           text?
  expression            text not null                -- evaluated by salvage/09
  actions               jsonb not null               -- [{op:'tag', term_id: '...'}, ...]
  enabled               bool not null default true
  priority              int not null default 100    -- lower runs first
  match_count           bigint not null default 0
  last_matched_at       timestamptz?
  parse_error           text?                         -- if expression fails validation
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  index (owner_user_id, enabled, priority)

rule_templates                                      -- admin-managed; seed for new users
  id                    uuid pk
  name                  text not null
  description           text?
  expression            text not null
  actions               jsonb not null               -- term_ids here reference system vocabularies
  priority              int not null default 100
  offered_by_default    bool not null default true
  created_at            timestamptz not null default now()

classification_log                                  -- 30-day retention, daily purge job
  id                    bigserial pk
  content_item_id       uuid not null references content_items(id) on delete cascade
  user_id               uuid not null references users(id) on delete cascade
  rule_id               uuid references rules(id) on delete set null
  rule_name_at_fire     text not null                -- snapshotted in case rule is deleted later
  matched               bool not null
  applied_term_ids      uuid[] not null default '{}'
  evaluated_at          timestamptz not null default now()
  index (content_item_id)
  index (user_id, evaluated_at desc)
  index (evaluated_at)                               -- for purge
```

### 4.6 Outgoing feeds

```
outgoing_feeds
  id                    uuid pk
  owner_user_id         uuid not null references users(id) on delete cascade
  slug                  text not null                -- URL-friendly
  secret                text not null                -- 24 chars, URL-safe, cryptographically random
  title                 text not null
  description           text?
  query                 jsonb not null               -- serialized TaxonomyQueryEngine QueryOperation
  include_posts         bool not null default false
  include_feed_items    bool not null default true
  max_items             int not null default 50 check (max_items between 1 and 500)
  format                text not null default 'atom' check (format in ('atom', 'rss2'))
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  unique index (owner_user_id, slug)
  unique index (slug, secret)                        -- for public URL routing
```

### 4.7 Feature flags (storage for salvage/02)

```
feature_flags
  key                   text pk
  name                  text not null
  description           text?
  category              text not null default 'general'
  globally_enabled      bool not null default false
  default_state         bool not null default false
  percentage_rollout    jsonb?
  targeting_rules       jsonb?
  dependencies          jsonb?                       -- other flag keys
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()

feature_rollout_history
  id                    bigserial pk
  flag_key              text not null references feature_flags(key) on delete cascade
  event_type            text not null                -- 'enabled' | 'disabled' | 'rollout_changed'
  previous_value        jsonb
  new_value             jsonb
  user_id               uuid? references users(id)   -- null = system / admin action
  reason                text?
  timestamp             timestamptz not null default now()
  index (flag_key, timestamp desc)
```

### 4.8 Operational

```
audit_log
  id                    bigserial pk
  user_id               uuid? references users(id) on delete set null
  action                text not null               -- e.g. 'feed.subscribe', 'rule.create'
  entity                text?
  entity_id             text?
  payload               jsonb
  ip                    text?
  user_agent            text?
  created_at            timestamptz not null default now()
  index (user_id, created_at desc)
  index (action, created_at desc)

job_dead_letter                                     -- persistent overflow from salvage/08
  id                    bigserial pk
  job_type              text not null
  data                  jsonb not null
  attempts              int not null
  error                 text
  failed_at             timestamptz not null default now()
  resolved              bool not null default false
  resolved_by           uuid? references users(id)
  resolved_at           timestamptz?
  index (resolved, failed_at desc)
```

## 5. Functional requirements

Grouped by subsystem. Each item is the contract, not acceptance criteria.

### 5.1 Bootstrap

On first start with an empty `users` table:

- Generate 24-char URL-safe random `bootstrap_token`, store in `system_settings`.
- Log to stdout exactly once: `FIRST BOOT: visit <host>/setup?token=<token>`. Token does not appear in any other log line.
- `/setup?token=<token>` endpoint is reachable only while `bootstrap_token IS NOT NULL`. Wrong or missing token returns 404 (not 401 — do not leak route existence).
- Form accepts `username`, `password`, optional `email`, `display_name`. Submission creates user with `is_admin = true`, clears `bootstrap_token`, logs the user in.
- After token is cleared, `/setup` returns 404 permanently. Recovery requires a CLI (`node bin/reset-admin.js` — see IMPLEMENTATION.md).

### 5.2 Registration

- System setting `registration_mode` takes one of `disabled` / `invite` / `open`. Default `disabled`.
- `POST /api/auth/register` returns 403 with `{ error: 'registration_disabled' }` if mode is `disabled`.
- Mode `invite`: request body must include `invite_code`. Code must exist in `invite_codes`, not be consumed, and not be expired. On success, `invite_codes.consumed_by` + `consumed_at` are set.
- Mode `open`: no code required, but rate-limited (3 per IP per hour).
- Username constraint: `/^[a-zA-Z0-9_-]{3,32}$/`, unique, case-insensitive matching but stored as-entered.
- Password constraint: minimum 8 characters; zxcvbn strength shown in UI (does not gate submission); no composition rules; no breach-list check in MVP.
- New users receive the starter rule pack: admin-configured `rule_templates` with `offered_by_default = true` are copied into `rules` as `owner_user_id = <new user>`. Future template edits don't affect existing users.

### 5.3 Authentication

- `POST /api/auth/login` accepts `{ username, password }`. Verifies via salvage/13.
- On success: creates a row in `sessions`, sets cookie `session=<id>`, attributes `HttpOnly; SameSite=Lax; Secure` (production), path `/`. Returns user object (salvage/13 `toSafeUser`).
- Rate limit: 5 failed attempts per username per 15 minutes. Lockout duration: 15 minutes after the 5th failure.
- Sliding expiration: every authenticated request updates `sessions.last_active_at`. Sessions expire after 30 days of inactivity or on `expires_at` (absolute 90-day cap from `created_at`), whichever comes first.
- `POST /api/auth/logout` deletes the current session row.
- `GET /api/me` returns `toSafeUser(currentUser)` or 401.
- No password reset via email in MVP. Admin reset generates a one-time temporary password delivered out-of-band.

### 5.4 Feeds

- `POST /api/feeds/subscribe` accepts `{ url }`. Canonicalizes (lowercase host, strip fragment, resolve relative parts). If `feeds` row doesn't exist, creates it with `status='active'` and enqueues immediate poll. Creates `subscriptions` row for current user.
- If the submitted URL is an HTML page, attempt autodiscovery (parse HTML, find `<link rel="alternate" type="application/rss+xml">`). Return up to 5 candidates; client decides which to subscribe to.
- `DELETE /api/feeds/:feedId` unsubscribes current user. When last subscriber unsubscribes, feed's `status` stays (items remain accessible to anyone with saved state). A periodic cleanup job purges orphan feeds after 30 days.
- `POST /api/feeds/:feedId/refresh` enqueues an out-of-band poll. Rate-limited: 1 per feed per user per 60 seconds; 5 per user per hour overall.
- Feed polling (background):
  - Scheduled per-feed based on `poll_interval`. Default 15 min. Floor 5 min, ceiling 12 hours.
  - Sends `User-Agent`, `If-None-Match`, `If-Modified-Since`. Honors 304.
  - Timeout: 10 seconds. Max body size: 10 MiB. Larger responses abort; log; flag feed.
  - On success: parse, sanitize, dedup, insert new items, emit `content.ingested` event per new item.
  - On 4xx/5xx or network error: increment `consecutive_fail`. 
  - At 5 consecutive failures: salvage/06 circuit breaker opens for 1 hour per feed.
  - At 15 consecutive failures: `status = 'dead'`, polling ceases, admin notified in dashboard.
  - On success after failures: `consecutive_fail = 0`, status back to `'active'`, circuit closes.
  - Honors `Retry-After` on 429/503.

### 5.5 Content

- `GET /api/content` paginated list. Query params: `terms` (AND), `feed_id`, `source` (`feed`/`post`), `read` (`true`/`false`/`null` for all), `saved`, `date_from`, `date_to`, `sort` (`published_at_desc` default, `fetched_at_desc`, `title_asc`), `limit` (default 25, max 100), `offset`.
- Query is scoped to items the user can access: their own posts + feed items from feeds they subscribe to.
- `GET /api/content/:id` returns the item with `fields`, term applications (including who applied each), user overlay.
- `POST /api/content` — create a post. `{ title, body_markdown, visibility?, published_at? }`. Renders markdown with marked (GFM) + DOMPurify, stores as `fields.body_html`. Generates `slug` from `title` (unique per owner). Emits `content.created`.
- `PATCH /api/content/:id` — owner-only for posts. Re-renders HTML on markdown change. Emits `content.updated`.
- `DELETE /api/content/:id` — owner-only. Sets `deleted_at`. Purged by background job after 30 days.
- `POST /api/content/:id/read` / `:id/unread` — toggle per-user read state. Updates `user_item_state`.
- `POST /api/content/:id/save` / `:id/unsave` — toggle per-user saved state. Saved items are exempt from retention purging.
- `POST /api/content/:id/tags` — body `{ add: string[], remove: string[], add_term_ids: string[], remove_term_ids: string[] }`. `tags` are free-form strings; `term_ids` must come from the user's own vocabularies.

### 5.6 Classification

- Triggered on `content.ingested` and `content.updated` events via event bus.
- For each recipient user (owner of a post, or every subscriber of a feed item), run their enabled rules in `priority ASC` order.
- Expression evaluated by salvage/09 against context object. See DESIGN.md §5.3 for the context shape.
- Each rule's `matched` result + applied term ids written to `classification_log` (user-scoped).
- For feed items: applied term ids written to `user_item_state.user_term_ids`. Other users see their own rules' results independently.
- For posts: applied term ids written to `content_terms` (the author IS the user; there's only one view).
- Rule save-time validation: expression parsed by salvage/09. Parse errors stored in `rules.parse_error`, rule auto-disabled, user notified in UI. No silent broken rules.
- Rule test: `POST /api/rules/test` with `{ expression, action? }` evaluates against up to 50 most-recent items visible to the user. Returns `{ matched: ContentItem[], not_matched_count: number }`. Does not persist anything.
- Unclassified items (zero system or user terms applied): queryable via `GET /api/content?unclassified=true`. UI shows them with salvage/07 suggestions.

### 5.7 Taxonomy

- System vocabularies: `owner_user_id IS NULL`. Read-only to non-admins. Admin UI CRUDs them.
- User vocabularies: owned by current user. CRUD via `/api/vocabularies` + `/api/terms`. On delete, confirmation required if any term is referenced by a rule (action `tag` with its term_id) — delete cascades; rule's action entry is neutered.
- Term hierarchy bounded by `vocabulary.hierarchy`:
  - 0 (flat): parent_ids must be empty
  - 1 (single-parent): parent_ids length ≤ 1
  - 2 (multi-parent): any DAG; cycles rejected at save time via salvage/10 `validateVocabularyDAG`
- Term deletion cascades to `content_terms` and strips the id from any `user_item_state.user_term_ids` arrays. Admin UI warns before delete with count of affected items.

### 5.8 Browse and query

- Faceted browse driven by salvage/11 `TaxonomyQueryEngine`.
- Engine is instantiated once at boot. On mutation events (`content.created`, `content.updated`, `content.deleted`, `terms.changed`), the relevant index segment is invalidated.
- UI composes `QueryOperation` values from user selections (picked terms, date range, source filter).
- Per-user filtering applied at the query layer: items restricted to the user's accessible set before the query engine runs.
- Cache hit/miss surfaced in response headers for debugging (`X-Query-Cache: hit|miss`).

### 5.9 Outgoing feeds

- `GET /api/outgoing-feeds` — list current user's outgoing feeds.
- `POST /api/outgoing-feeds` — create. Request: `{ slug, title, query, max_items, format, include_posts, include_feed_items, description? }`. Secret is generated server-side (24 chars, URL-safe base64).
- `PATCH /api/outgoing-feeds/:id` — update. Regenerating the secret is a separate explicit action via `POST .../:id/regenerate-secret`.
- `DELETE /api/outgoing-feeds/:id` — delete. The public URL 404s immediately afterward.
- Public URL: `GET /rss/:slug-:secret`. The URL path's `:slug-:secret` is parsed as `slug = everything before last '-'`, `secret = everything after last '-'`.
- Lookup by `(slug, secret)` compound index. Returns 404 on any mismatch — no timing leak, no useful error.
- Response: Atom XML (default) or RSS 2.0 (if `format='rss2'` stored, or `?format=rss2` query overrides).
- Body contains up to `max_items` items matching the stored `query`, in `published_at DESC`.
- Feed-item entries: `<link>` points at upstream `content_items.link`; `<title>`, `<summary>`, `<content:encoded>` from the item fields.
- Post entries: `<link>` points at the public post URL `/p/<username>/<slug>`; uses post's rendered HTML.
- Response headers: `Cache-Control: public, max-age=300`, `Content-Type: application/atom+xml; charset=utf-8`, `X-Robots-Tag: noindex`.

### 5.10 Public posts

- `GET /p/:username/:slug`:
  - If post exists, `visibility = 'public'`, and owner not disabled: render HTML page.
  - If `visibility = 'unlisted'`: render the same HTML page.
  - Otherwise: 404 (do not distinguish "doesn't exist" from "not public").
- HTML response includes Open Graph, Twitter Card meta, `<link rel="canonical">`, `<meta name="robots" content="noindex">` unless user has opted in to indexing (future per-user setting; default `noindex` in MVP).

### 5.11 Data export

- `GET /api/export/subscriptions` — OPML XML of user's subscriptions. Standard format.
- `GET /api/export/posts` — ZIP of markdown files + YAML frontmatter. Filename `posts-<username>-<iso8601>.zip`. Each post is `<slug>.md` with frontmatter containing title, slug, published_at, visibility, terms.
- `GET /api/export/rules` — JSON array of rules.
- `GET /api/export/vocabularies` — JSON array of user-owned vocabularies + their terms.
- `GET /api/export/all` — ZIP with a `README.txt`, `subscriptions.opml`, `posts/`, `rules.json`, `vocabularies.json`.
- All export endpoints are rate-limited (5 per user per hour) and authenticated.

### 5.12 Admin

- `GET /api/admin/users` — paginated user list. Filters by `is_admin`, `disabled`, creation date.
- `POST /api/admin/users/:id/promote` / `:id/demote` — admin-only; self-demotion prevented when user is sole admin.
- `POST /api/admin/users/:id/disable` / `:id/enable` — marks user disabled. Disabled users can't log in; their content remains (can be purged separately).
- `POST /api/admin/users/:id/reset-password` — generates a temporary password; returns it in response; admin delivers out-of-band. Forces password change on next login.
- `GET /api/admin/feeds` — all feeds system-wide with subscriber count and health indicators.
- `POST /api/admin/feeds/:id/pause` / `:id/resume` — override polling state.
- `GET /api/admin/audit` — paginated audit log.
- `GET /api/admin/dead-letter` — failed jobs.
- `POST /api/admin/dead-letter/:id/retry` / `:id/resolve` — retry or discard.
- `GET /api/admin/flags` — feature flag list with current state.
- `PATCH /api/admin/flags/:key` — update a flag.
- `GET /api/admin/settings` / `PATCH /api/admin/settings` — system settings.
- `GET /api/admin/vocabularies` — system vocabularies.
- Full CRUD under `/api/admin/vocabularies/*` and `/api/admin/terms/*` for system vocabularies.
- `GET /api/admin/rule-templates` + full CRUD.
- `GET /api/admin/backup` — streams `pg_dump --format=custom` as a download (admin-only). Documented as manual backup; scheduled backups are an operator concern, not an app feature.

Every admin mutation writes an `audit_log` row with `user_id` (the acting admin), `action`, `entity`, `entity_id`, `payload` (sanitized — no passwords in payload).

## 6. Invariants

Properties the system preserves. Enforced in application code except where noted.

1. `content_items.source = 'feed'` ⟹ `feed_id IS NOT NULL AND owner_user_id IS NULL`.
2. `content_items.source = 'post'` ⟹ `owner_user_id IS NOT NULL AND feed_id IS NULL`. CHECK constraint enforces `source` values.
3. A user can read a feed item if and only if they have an enabled subscription to its feed. Admins bypass this only through `/api/admin/feeds`.
4. A user can read a post if: they own it (any visibility), or `visibility = 'public'`, or `visibility = 'unlisted'` with correct URL path.
5. Every request handler that touches per-user data runs inside `runInTenantScope(userId, fn)` from salvage/12.
6. Feed-fetched HTML is always sanitized before storage. DOMPurify configuration documented in DESIGN.md §5.2. Tests cover XSS vectors.
7. System rules do not exist. Every `rules` row has `owner_user_id NOT NULL`. Rule templates are copied, not referenced, at user creation.
8. User A's rules cannot write to `content_terms` (which is shared); they write only to `user_item_state.user_term_ids`. Only manual tagging writes to `content_terms` (shared global overlay, per-item).
9. Term deletion cascades to `content_terms` and cleans `user_item_state.user_term_ids` (ArrayElement removal). Rule `actions` entries referencing deleted terms are neutered at read time.
10. Session cookies are `HttpOnly`. No JavaScript path reads or writes them.
11. Outgoing feed URLs require the exact `secret` string in the path. Enumeration is constant-time constant-response 404.
12. Rule expressions are validated by salvage/09 on save. Parse errors disable the rule and set `parse_error`.
13. Classification logs have a hard 30-day retention. Purge runs daily.
14. System settings are a single row (`id = 1`). CHECK constraint enforces this.
15. Registration with `registration_mode = 'disabled'` is impossible through any API path, including bypass attempts via referer / user-agent spoofing.

## 7. Non-functional requirements

Honest, measurable targets. Not aspirational "performance claims."

- **Response time**: simple API endpoints (single-row reads, auth check, list with 25 items) under 100 ms p95 on a laptop-class deploy against a warm DB. Complex faceted queries under 500 ms p95 for the common shapes.
- **Feed polling**: default 15 min per feed. System can sustain 10 concurrent polls without queue saturation at default concurrency (4).
- **Scale**: ≤1000 users, ≤10 000 feeds, ≤10M items before architectural rework. One Postgres instance, one Node process. No horizontal scaling in MVP.
- **Test coverage**: salvage units already have 460 passing tests. New business logic (dedup, rule firing order, retention purge, outgoing feed generation, classification log) targets ≥70% line coverage. UI components tested minimally (smoke tests + a11y).
- **Logging**: structured JSON in production (salvage/03). All requests, all jobs, all rule fires.
- **Metrics**: Prometheus endpoint at `/metrics` (salvage/05). See DESIGN.md §11 for the metric catalog.
- **Backups**: `pg_dump --format=custom` supported; documented in ops. Restore procedure documented and tested with a clean DB.

## 8. Non-goals

Explicit exclusions for the MVP. Each is an architecture seam that a future module plugs into. None is impossible to add later.

- **Block editor / WYSIWYG** for posts. MVP is markdown only. Block rendering is a future content-type module.
- **Media uploads.** No user avatars beyond Gravatar; no inline images in posts beyond external URLs in the markdown. Media module comes later.
- **Page layout system.** No templated regions, no theme system. Future layout module.
- **User-defined content types (Fields API UI).** The Fields API exists internally for the two built-in types; the UI for users to define new types is future work.
- **Full-text search.** Tag-based filtering only in MVP.
- **Comments / replies / threads.** Future social module.
- **Email digest delivery.** Future email module (requires SMTP config, outside MVP).
- **Webhooks out / API integrations.** Future automation module.
- **OAuth / SSO.** Local username+password only.
- **Real-time updates via WebSocket.** Polling is adequate for MVP.
- **Public profile pages.** Out-of-scope for MVP; schema reserves `users.profile_public`.
- **Trending / discovery / social features.** Not this product.
- **SQLite support.** Postgres only. SQLite later if anyone asks.
- **Horizontal scaling / multi-process.** Single-process in MVP.
- **Multi-workspace / team sharing.** Single user tenant only. Outgoing RSS covers the "share a reading list" case.

## 9. API surface catalog

Full request/response schemas in DESIGN.md §9. This is just the route list.

```
Public (unauth)
  GET    /health
  GET    /ready
  GET    /metrics
  GET    /setup                      (only while bootstrap_token set)
  POST   /setup                      (create first admin)
  GET    /rss/:slug-:secret          outgoing feed
  GET    /p/:username/:slug          public post

Auth
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/logout
  GET    /api/me

Feeds
  GET    /api/feeds
  POST   /api/feeds/subscribe
  DELETE /api/feeds/:feedId
  POST   /api/feeds/:feedId/refresh
  GET    /api/feeds/autodiscover     (given a URL, returns candidate feeds)

Content
  GET    /api/content
  GET    /api/content/:id
  POST   /api/content                (posts only)
  PATCH  /api/content/:id
  DELETE /api/content/:id
  POST   /api/content/:id/read
  POST   /api/content/:id/unread
  POST   /api/content/:id/save
  POST   /api/content/:id/unsave
  POST   /api/content/:id/tags

Taxonomy
  GET    /api/vocabularies
  POST   /api/vocabularies
  PATCH  /api/vocabularies/:id
  DELETE /api/vocabularies/:id
  GET    /api/vocabularies/:id/terms
  POST   /api/terms
  PATCH  /api/terms/:id
  DELETE /api/terms/:id

Rules
  GET    /api/rules
  POST   /api/rules
  PATCH  /api/rules/:id
  DELETE /api/rules/:id
  POST   /api/rules/test
  GET    /api/rules/:id/matches      recent classification_log entries

Outgoing feeds
  GET    /api/outgoing-feeds
  POST   /api/outgoing-feeds
  PATCH  /api/outgoing-feeds/:id
  POST   /api/outgoing-feeds/:id/regenerate-secret
  DELETE /api/outgoing-feeds/:id

Export
  GET    /api/export/subscriptions
  GET    /api/export/posts
  GET    /api/export/rules
  GET    /api/export/vocabularies
  GET    /api/export/all

Admin (is_admin required)
  GET    /api/admin/users
  POST   /api/admin/users/:id/promote
  POST   /api/admin/users/:id/demote
  POST   /api/admin/users/:id/disable
  POST   /api/admin/users/:id/enable
  POST   /api/admin/users/:id/reset-password
  GET    /api/admin/feeds
  POST   /api/admin/feeds/:id/pause
  POST   /api/admin/feeds/:id/resume
  GET    /api/admin/audit
  GET    /api/admin/dead-letter
  POST   /api/admin/dead-letter/:id/retry
  POST   /api/admin/dead-letter/:id/resolve
  GET    /api/admin/flags
  PATCH  /api/admin/flags/:key
  GET    /api/admin/settings
  PATCH  /api/admin/settings
  GET    /api/admin/vocabularies     (system only)
  POST   /api/admin/vocabularies
  ... (standard CRUD)
  GET    /api/admin/rule-templates
  POST   /api/admin/rule-templates
  ... (standard CRUD)
  GET    /api/admin/invite-codes
  POST   /api/admin/invite-codes
  DELETE /api/admin/invite-codes/:code
  GET    /api/admin/backup           streams pg_dump

Admin UI (static SPA)
  GET    /admin/*                    serves index.html for client-side routing

Reader UI (static SPA)
  GET    /app/*                      serves index.html for client-side routing

Redirect root
  GET    /                           302 to /app if logged in, /login otherwise
  GET    /login                      login form (the only server-rendered auth page)
```
