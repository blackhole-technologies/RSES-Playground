# PERFORMANCE

Budget, profiling, degradation behavior. What the system should do, what happens when it can't, and how you verify either state.

Numbers here are **targets for MVP scale**, not guarantees. The targets assume a single-process deployment on modest hardware. Larger deployments have different budgets; the MVP doesn't need to handle them.

---

## 1. Target environment

| Dimension | MVP target |
|---|---|
| App process | 1 Node.js 22 instance |
| CPU | 1–2 cores |
| RAM | 1–2 GB available to the process |
| DB | Postgres 16, same host or adjacent VPC |
| DB hardware | 2 vCPU, 4 GB RAM, SSD-backed |
| Users (registered) | ≤ 1 000 |
| Active users (DAU) | ≤ 100 |
| Concurrent requests | ≤ 50 |
| Feeds total | ≤ 10 000 |
| Subscriptions total | ≤ 50 000 |
| Content items total | ≤ 10 000 000 |
| Content items added / day | ≤ 20 000 (average poll volume) |

Beyond these, the architecture continues to work but the single-process shape will bottleneck. That's the point at which the first horizontal step (move the queue worker to its own process) becomes relevant.

---

## 2. Per-endpoint budgets

All latencies measured end-to-end at the app layer (receive request → send last byte), excluding TLS termination at the reverse proxy.

### 2.1 Reader API (authenticated)

| Endpoint | p50 | p95 | p99 | Notes |
|---|---|---|---|---|
| `GET /api/me` | 5 ms | 20 ms | 50 ms | Single indexed session lookup |
| `GET /api/feeds` | 15 ms | 60 ms | 150 ms | Subscribed feeds + health status |
| `POST /api/feeds/subscribe` | 50 ms | 500 ms | 2 000 ms | Includes DNS + SSRF check; not the feed fetch itself |
| `GET /api/content` (simple list, 25 items) | 30 ms | 100 ms | 250 ms | Primary list, with taxonomy-engine facets |
| `GET /api/content` (complex facets, AND/OR over 5 terms) | 50 ms | 250 ms | 500 ms | Query engine does the heavy lifting |
| `GET /api/content/:id` | 10 ms | 40 ms | 100 ms | Single row + user_item_state join |
| `POST /api/content` (new post) | 30 ms | 100 ms | 200 ms | Markdown render + sanitize + insert |
| `PATCH /api/content/:id` | 30 ms | 100 ms | 200 ms | Similar to create |
| `POST /api/content/:id/read` | 5 ms | 20 ms | 50 ms | Single-row upsert |
| `POST /api/content/:id/tags` | 15 ms | 60 ms | 120 ms | Multi-row update on user_item_state |
| `GET /api/rules` | 10 ms | 40 ms | 100 ms | User's rules only |
| `POST /api/rules/test` | 100 ms | 500 ms | 1 500 ms | Evaluates expression against 50 recent items |
| `GET /api/vocabularies` + `/:id/terms` | 10 ms | 50 ms | 100 ms | Small cached sets |

### 2.2 Admin API

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| `GET /api/admin/users` | 20 ms | 80 ms | 200 ms |
| `GET /api/admin/feeds` | 30 ms | 150 ms | 400 ms |
| `GET /api/admin/audit` | 40 ms | 200 ms | 500 ms |
| `GET /api/admin/backup` | N/A | Streaming — ignore latency; throughput ≥ 10 MB/s |
| `GET /api/admin/dead-letter` | 20 ms | 80 ms | 200 ms |

### 2.3 Public surface (unauthenticated)

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| `GET /rss/:slug-:secret` (cache hit) | 2 ms | 5 ms | 10 ms |
| `GET /rss/:slug-:secret` (cache miss) | 80 ms | 300 ms | 600 ms |
| `GET /p/:username/:slug` | 30 ms | 100 ms | 250 ms |
| `GET /health` | 1 ms | 3 ms | 5 ms |
| `GET /ready` | 5 ms | 15 ms | 40 ms |

### 2.4 Where those numbers come from

Not measured — asserted, with grounding:

- 5 ms p50 for a single indexed lookup assumes warm connection pool, in-process query planner hit, SSD-backed Postgres. These are standard numbers for Postgres + pg driver on localhost.
- List endpoints at 30–50 ms p50 assume the `content_items` indexes from SPEC §4.3 are in place. Without them, sub-second is not achievable at 1M items.
- The query engine's faceted queries assume salvage/11's cache is warm. First-hit latency is 2–3× cold; the budget is for the warm steady state.
- Markdown-render + sanitize is dominated by DOMPurify invocation, ~10 ms for typical post sizes. Marked itself is <1 ms.
- Outgoing-feed cache hit is dominated by string serialization overhead.

All targets are violable during CI under load — the goal is steady-state behavior on the target environment, not peak.

---

## 3. Background work budgets

### 3.1 Feed polling

| Metric | Target |
|---|---|
| Per-feed fetch duration (median) | 500 ms |
| Per-feed fetch duration p95 | 3 s |
| Per-feed fetch timeout | 10 s (hard) |
| Total polls processed per minute (MVP) | 40–80 |
| At target scale (10k feeds / 15 min interval) | ≈ 11 polls/sec sustained |
| 304 hit rate (after warm-up) | ≥ 50% |
| Worker concurrency | 4 by default; configurable |

A single feed poll occupies one worker slot. At 4 workers and a 500ms median, steady-state throughput is ~8 polls/second, matching the ~11/sec target with some headroom. If the queue falls behind, the scheduler starts skipping intervals for low-priority feeds.

### 3.2 Classification

| Metric | Target |
|---|---|
| Rule evaluation per item (salvage/09, warm cache) | ≤ 1 ms |
| Classification per new item (1 user, 10 rules) | ≤ 20 ms |
| Classification per new feed item (100 subscribers, 10 rules each) | ≤ 5 s total, async |
| Classification-log insert latency | ≤ 5 ms per row |

Fanout classification runs as a batched job. A feed with 100 subscribers enqueues one `classification.run` job per subscriber; each processes independently. The queue absorbs spikes.

### 3.3 Retention purge

| Metric | Target |
|---|---|
| Daily purge duration | ≤ 5 min at 10M items |
| Purge memory footprint | ≤ 100 MB |
| Concurrent with user requests? | Yes; runs at 03:00 local |

Implementation uses batched DELETE with `LIMIT` (say, 10 000 per batch), respecting a total-time budget. If the budget expires, work resumes the next day.

### 3.4 Queue overall

| Metric | Target |
|---|---|
| Enqueue latency | ≤ 5 ms |
| In-flight jobs steady-state | ≤ concurrency (4) |
| Dead-letter growth rate | ≤ 1 / day at healthy baseline |
| Queue depth p95 | ≤ 100 |
| Queue depth p99 | ≤ 500 (then backpressure kicks in) |

Backpressure: if queue depth exceeds the p99 threshold, the scheduler pauses non-critical jobs (feed polling for low-priority feeds, retention purge) until drained.

---

## 4. Memory and DB budgets

### 4.1 Process memory

| Component | Steady state | Peak | Notes |
|---|---|---|---|
| V8 heap | 200 MB | 400 MB | Node defaults; bump `--max-old-space-size` to 1024 MB as safety margin |
| Drizzle connection pool | 10 connections × ~2 MB each | 20 MB | Configurable |
| Taxonomy query engine cache | 50 MB | 100 MB | Bounded; LRU eviction |
| Feature-flags cache | ≤ 1 MB | ≤ 5 MB | Flags loaded once at boot |
| Salvage/11 query cache | 30 MB | 60 MB | Bounded |
| HTTP request buffers | ≤ 1 MB × concurrent | ≤ 50 MB | 1 MiB body limit from salvage/04 |
| Feed fetch buffers | 10 MiB × concurrent polls | ≤ 40 MB | At 4 workers |
| **Total expected** | **~350 MB** | **~700 MB** | Fits a 1 GB instance |

If the process approaches 900 MB: concern. Above 1 GB: heap snapshot on SIGUSR1 and investigate.

### 4.2 Database

| Table | Expected rows at MVP scale | Expected size | Index size |
|---|---|---|---|
| `users` | ≤ 1 000 | ≤ 1 MB | ≤ 1 MB |
| `sessions` | ≤ 10 000 (active) | ≤ 5 MB | ≤ 2 MB |
| `feeds` | ≤ 10 000 | ≤ 50 MB | ≤ 20 MB |
| `subscriptions` | ≤ 50 000 | ≤ 20 MB | ≤ 10 MB |
| `content_items` | ≤ 10 000 000 | ≤ 20 GB | ≤ 5 GB |
| `user_item_state` | ≤ 50 000 000 | ≤ 10 GB | ≤ 3 GB |
| `classification_log` | ≤ 30 days × 100k/day = 3M | ≤ 2 GB | ≤ 500 MB |
| `content_terms` | ≤ 30M | ≤ 2 GB | ≤ 1 GB |
| `audit_log` | Unbounded (compact rows) | ≤ 5 GB over 2 years | ≤ 1 GB |

At the upper bound (~40 GB total), a 100 GB disk is ample. Below 1 GB total we're deep in the "toy deployment" regime where nothing bottlenecks.

Key indexes (from SPEC §4):
- `content_items (source, published_at desc)` — primary list
- `content_items (feed_id, published_at desc) where source = 'feed'` — per-feed browse
- `content_items (owner_user_id, published_at desc) where source = 'post'` — user's posts
- `content_items unique (feed_id, guid) where source = 'feed' and guid is not null` — dedup
- `user_item_state (user_id, saved) where saved = true` — saved items
- `content_terms (term_id)` — reverse lookup

### 4.3 Connections

| Usage | Connection count |
|---|---|
| Request handlers (typical) | 1 per in-flight request, up to pool size |
| Queue workers | 1 per worker (4 default) |
| Migrations (startup only) | 1, released after |
| **Pool size target** | **10 default; 20 max** |

Postgres's default `max_connections` is 100. The app uses ≤ 20 so leaves plenty for admin connections, another app instance, and safety.

---

## 5. Degradation behavior

What happens when any budget is exceeded. "Graceful degradation" means the app stays useful, just slower or less fresh.

### 5.1 DB slow

- Symptom: queries exceed 500 ms p95.
- Causes: missing index, slow disk, lock contention, cold cache after restart.
- App behavior: no specific retry logic for slow queries (only for failed ones). User-facing endpoints return latency as-is.
- Graceful: salvage/06 circuit breaker wraps every DB call; if p99 latency or error rate crosses threshold, requests fail fast.
- Operator action: check `/metrics` for `db_query_duration_seconds`, correlate with Prometheus alerts, profile slow queries via `pg_stat_statements`.

### 5.2 Queue backlog

- Symptom: `jobs_enqueued_total - jobs_completed_total > 500` and trending.
- Causes: external feed servers slow; classification pile-up; retention purge overran.
- App behavior: scheduler detects backpressure, pauses enqueueing of low-priority `feed.poll` jobs and `feed.orphan-cleanup`. Classification jobs continue (users notice unclassified items in inbox otherwise).
- Graceful: admin dashboard shows queue depth trend. Reader SPA shows "Some feeds are behind" banner when depth > 1000.
- Operator action: check `/metrics` for feed poll timings; find the feed(s) with > 5 s p95 and consider pausing them.

### 5.3 Classification slow

- Symptom: `rule_evaluation_duration_seconds > 100 ms p95`.
- Causes: user authored a pathological rule (bounded by salvage/09 DoS limits but still slow within limits); large evaluation context.
- App behavior: rule eval bounded per-item at ~100 ms worst case. Job has 30 s soft limit; exceeding hard-fails the job and moves to dead-letter.
- Graceful: user's other rules still run — a slow rule doesn't block the rest.
- Operator action: examine classification_log for the user; find the slow rule; contact user / disable rule.

### 5.4 Memory pressure

- Symptom: heap > 800 MB.
- Causes: memory leak, large unbounded cache, large in-flight request body.
- App behavior: nothing specific — process may OOM at 1 GB if not bounded.
- Graceful: `node --max-old-space-size=1024` caps V8 heap; process crashes cleanly at limit. Systemd / Docker restarts.
- Operator action: `kill -SIGUSR1 <pid>` to trigger heap snapshot; load into Chrome DevTools; find the leak.

### 5.5 Feed fetch storms

- Symptom: many feeds scheduled at once after a restart (scheduler catches up).
- Causes: process was down for longer than the polling interval.
- App behavior: scheduler enqueues up to `max(10, concurrency × 5)` poll jobs per tick, not all at once. Ensures the queue doesn't balloon.
- Graceful: feed polls process in-order over ~a minute, not simultaneously.

### 5.6 Single feed monopolizes

- Symptom: one feed fetches take 8+ seconds consistently.
- App behavior: after 5 consecutive poll failures (timeouts count as failures), circuit breaker opens for 1 hour per feed. After 15, feed marked `dead`.
- Graceful: the bad feed stops consuming worker slots; others continue.
- Operator action: check feed health dashboard; manually pause dead feeds.

### 5.7 Outgoing-feed traffic spike

- Symptom: a popular outgoing-feed URL is shared; traffic spikes 100×.
- App behavior: `Cache-Control: max-age=300` + in-process cache absorb the spike. Most requests serve from cache.
- Graceful: rate limit (60 per IP per 5 min per feed) stops a single aggressive client from bypassing cache.
- Operator action: if the feed is genuinely popular, let it be; cache handles. If something suspicious, inspect logs / rate-limit counters.

---

## 6. Profiling approach

Ordered by when you'd reach for each.

### 6.1 In development

- `npm run dev` runs with `tsx --inspect-brk server.ts` optionally, attach Chrome DevTools.
- `node --prof server.ts` + `node --prof-process` for quick CPU profiling.
- Log levels to `debug` for verbose insight. Log includes `X-Response-Time` header.

### 6.2 In production

- `/metrics` endpoint scraped by Prometheus. Alerts on:
  - p95 response time > 500 ms for 5 min
  - error rate > 1% for 5 min
  - feed circuit breakers opening at a rate > 2/hour
  - queue depth > 500 for 10 min
  - dead-letter count increased by > 5 in 10 min
- Structured JSON logs to Loki / CloudWatch / equivalent. Key fields: `duration`, `statusCode`, `path`, `correlationId`.
- `pg_stat_statements` extension on the Postgres instance. Inspect top-20 by total time quarterly.
- Heap snapshot via `kill -SIGUSR1 <pid>` writes a `heapdump-*.heapsnapshot` to the CWD. Download, load in Chrome DevTools, find retainers.

### 6.3 Specific diagnoses

| Symptom | First place to look |
|---|---|
| Slow API | `/metrics` histograms by `path` |
| Slow DB | `pg_stat_statements` + `EXPLAIN ANALYZE` on offenders |
| High memory | `process.memoryUsage()` logged hourly |
| Queue lag | `job_processing_duration_seconds` by `type`, `queue_depth` gauge |
| Feed failures | admin feed-health dashboard + `feed_polls_total{status='error'}` |
| Classification lag | `rule_evaluation_duration_seconds` histogram + `classification_log` table |
| Mystery 500s | logs filtered by `correlationId` |

---

## 7. CI performance gates

Catch regressions before they ship.

- `pnpm typecheck` must pass (0 errors).
- `pnpm test` must pass, including perf-sensitive tests:
  - **`tests/perf/classification-rule-100.test.ts`** — evaluates 100 rules against 100 items; must complete under 1 second on CI runner.
  - **`tests/perf/query-engine-faceted.test.ts`** — 1000 content items, 50 terms, 20 queries; each query under 50 ms.
  - **`tests/perf/feed-poll-parse.test.ts`** — parse a 500-KB canned feed; must complete under 200 ms.
- No `k6` / sustained-load tests in CI (too slow, too brittle). They live in `tests/load/` as documentation — run manually before release.

### 7.1 Optional: regression detection

Once the app has N releases, `benchmark.js` for key hotpaths, committed results to the repo, alert on N% regression. Not required for MVP.

---

## 8. Load testing playbook

For pre-release verification. Not part of CI; run manually.

### 8.1 Setup
- Fresh DB with 100 users, 5 000 feeds, 500 000 items, 50 rules/user, 2 000 terms. Seed via `tests/load/seed.ts`.
- Local run: `k6 run tests/load/smoke.js`, `stress.js`, `soak.js`.

### 8.2 Scenarios

**Smoke**: 10 virtual users, 2 minutes, basic flows. Baseline that nothing's broken.

**Stress**: ramp 10 → 100 virtual users over 10 minutes. Expect p95 response times to degrade but not exceed 2× target. Error rate stays ≤ 0.5%.

**Soak**: 20 virtual users, 2 hours. Watch for memory leaks, connection leaks, queue drift. Heap should be flat after the initial ramp.

**Feed-flood**: simulate 1 000 feeds all due at once. Queue absorbs; no timeouts; all polls complete within 10 minutes.

### 8.3 Pass criteria

- p95 response time < 2× target under stress
- error rate < 1%
- memory flat (±10% from 30 min mark)
- zero restarts / crashes
- queue drains to baseline within 10 min of load removal

---

## 9. What NOT to optimize (yet)

Explicit list of things that would improve perf but aren't worth it in MVP.

- **HTTP/2 or HTTP/3**: upstream reverse proxy concern, not the app's.
- **Prepared statement caching beyond Drizzle defaults**: Drizzle does enough.
- **Edge caching of reader SPA assets**: one `Cache-Control: public, max-age=31536000, immutable` on hashed asset URLs is enough.
- **DB read replicas**: sub-1000-user shape doesn't need them.
- **Redis-backed queue**: salvage/08 in-process is adequate until a second process shows up.
- **WebSocket for live inbox updates**: polling at 60s intervals is fine for an aggregator.
- **Server-side rendering for admin SPA**: SPA-on-static is simpler.
- **SSE for background-job progress**: polling the admin dead-letter endpoint is fine.
- **CDN in front of the app**: reverse proxy + `Cache-Control` headers are enough.
- **Premature denormalization**: the schema is already reasonably normalized; tuning based on measured queries, not imagined ones.

Each of these is a real tool with a real cost (operational complexity, bugs, deployment changes). Add them if and only if measurement proves a need.
