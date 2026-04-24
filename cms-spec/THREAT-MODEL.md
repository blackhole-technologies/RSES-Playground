# THREAT MODEL

Systematic enumeration of attack vectors against the RSS-aggregating CMS, the mitigations in the design, and how to verify each mitigation is actually in place. Scope: the MVP as specified in SPEC.md / DESIGN.md.

Not a formal STRIDE analysis. Written pragmatically — per surface, per vector, per mitigation, per verification. Where the MVP's mitigation is weaker than it should be for a public-internet deployment, that's flagged as "MVP-level" with the full-hardening path noted.

---

## 1. Scope and assumptions

### In scope
- A single-process Node server + Postgres DB as specified.
- Web clients: admin SPA, reader SPA, public HTML pages, outgoing RSS readers.
- All salvage units used as documented in their READMEs.
- Deployment on a modest VPS, behind a reverse proxy (nginx/Caddy/cloud LB).

### Assumed by the environment (not our concern)
- TLS termination at the reverse proxy. The app speaks plain HTTP from localhost.
- OS-level isolation — the Node process has no host root.
- Postgres authentication — the app's DB user has only `INSERT/UPDATE/DELETE/SELECT` on its own schema, not superuser.
- Backups are operator-scheduled via `pg_dump`.
- Secret management — `SESSION_SECRET` and any other sensitive env is managed via the deploy platform's secret store.

### Explicitly out of scope for MVP
- Protection against a compromised admin account. If an admin is owned, the system is owned — documented limitation.
- Protection against a hostile Postgres operator.
- Cryptographic protection of data at rest — left to disk-level encryption at the infra layer.
- DDoS at the network layer — assumed handled by the reverse proxy / upstream CDN.

---

## 2. Assets

| Asset | Sensitivity | Primary threats |
|---|---|---|
| User credentials (password hashes) | High | Offline cracking, online brute-force |
| Session cookies | High | Theft → account takeover |
| User-authored posts (including private ones) | Medium-High | Unauthorized read / write |
| User subscription lists + reading state | Medium | Privacy leak |
| `bootstrap_token` | Critical (transient) | Attacker races admin creation |
| `outgoing_feeds.secret` | Medium | Unauthorized read of curated feed |
| Internal network the server can reach | High | SSRF-style lateral movement |
| Server process integrity | High | RCE → all of the above |
| Postgres data | Critical | Bulk data exfiltration / destruction |
| `audit_log` | Medium | Log tampering to cover tracks |

---

## 3. Threat actors

| Actor | Capability | Target |
|---|---|---|
| Anonymous external | HTTP requests to public endpoints | Credential stuffing, SSRF via feed subscribe, enumeration, DoS |
| Low-privilege authenticated user | Full API access as themselves | Privilege escalation, cross-user data access, resource exhaustion |
| Compromised admin | Full admin API access | Persistence, data exfil, audit-log bypass (out of scope for MVP) |
| Malicious feed publisher | Controls feed XML + HTTP response | Stored XSS, zip bombs, SSRF via redirects, entity expansion |
| Adjacent service | Another service reachable from the app's network | Becomes a target of SSRF probes originating from this app |
| Bot / crawler | Automated HTTP | Account enumeration, rate-limit exhaustion, content scraping |

---

## 4. Vectors by surface

### 4.1 Authentication

**V1 — Credential stuffing against `/api/auth/login`**
- Threat: attacker tries leaked credentials at scale.
- Impact: account takeover.
- Mitigation:
  - Per-username rate limit: 5 failed attempts per 15 minutes (SPEC §5.3).
  - Per-IP rate limit on login: 30 attempts per 15 minutes across all usernames.
  - Salvage/04 rate limiter doesn't count failed-logins twice when rejecting (SPEC §5.3 "skipFailedRequests: true" is wrong for auth; override to count failures).
  - Password hashing via scrypt (salvage/13) — offline cracking is expensive.
- Verification: integration test fires 6 wrong passwords against one username, 6th gets 429. Separate test fires 31 attempts across many usernames from one IP, 31st gets 429.
- Gap: no breach-list check in MVP. Acceptable given 8-char minimum + scrypt; future addition is the HIBP k-anonymity API.

**V2 — Session fixation / cookie theft**
- Threat: attacker obtains session cookie via XSS, network sniffing, or cookie leakage in logs/URLs.
- Impact: full account takeover until session expires.
- Mitigation:
  - Cookie: `HttpOnly` (no JS access), `SameSite=Lax`, `Secure` in production, `Path=/`.
  - Session cookie is random 32-byte token, not a JWT.
  - Session cookies do not appear in the structured log (salvage/03 redacts `cookie` and `authorization` keys).
  - `session_secret` signs the cookie to prevent forgery.
  - Session length: sliding 30-day idle, 90-day absolute. Logout revokes server-side.
- Verification:
  - Inspect response headers: `Set-Cookie: session=...; HttpOnly; SameSite=Lax; Secure` in prod.
  - Grep logs for `session=` — zero matches.
  - Attempt to set session cookie via `document.cookie` in browser console → no effect (HttpOnly).
- Gap: session-theft-via-browser-extension isn't addressable at the app layer.

**V3 — Bootstrap token race**
- Threat: on first boot, a window exists between server start and admin creation. If an attacker guesses the token, they become admin.
- Impact: critical — attacker owns the fresh deploy.
- Mitigation:
  - Token is 24 chars, URL-safe base64 of 18 random bytes — ~108 bits of entropy. Infeasible to guess.
  - Token is logged once to stdout only. Not stored in memory after the initial log call; only the DB holds it.
  - `/setup` endpoint 404s when token is absent from DB. No endpoint-presence leak.
  - `/setup?token=<wrong>` returns 404 (not 401), so attackers can't probe for existence.
  - Token comparison is constant-time (`crypto.timingSafeEqual` on equal-length inputs; early-returns `false` on length mismatch without leaking via timing since the work is bounded).
- Verification: integration test fires 1000 random guesses at `/setup?token=` — all 404, none in constant-time-unsafe comparison.
- Gap: if the operator posts the log containing the token to a public forum before using it, attacker wins. Document this in operations guide.

**V4 — Password reset flows**
- Threat: attacker initiates a password reset and intercepts the temporary password.
- Impact: account takeover.
- Mitigation for MVP:
  - No email-based password reset. Admin-initiated only.
  - Admin-generated temporary password shown ONCE in the admin UI response; attacker needs admin access first.
  - Temp password requires change on next login (flagged in `users.must_reset`). Not in MVP data model yet — add to schema.
- Verification: password reset endpoint requires admin; temp password in response is not persisted in any log; `must_reset` forces reset on next `/api/auth/login` success.

**V5 — Account enumeration via login**
- Threat: attacker submits login attempts to determine which usernames exist.
- Impact: privacy leak → targeted attacks.
- Mitigation:
  - Unified error: 401 `{ error: 'invalid_credentials' }` for "wrong password" and "user doesn't exist" alike.
  - Constant-time response: if the user exists, hash their stored password; if not, hash a throwaway. Then compare. Don't short-circuit.
  - Rate limit applies per username, so the timing / rate differences between "existing user with rate limit" vs. "nonexistent user" are bounded.
- Verification: timing test — measure median response time for login of known-existing vs. known-nonexistent username; difference ≤ 5ms.

**V6 — Account enumeration via registration**
- Threat: attacker submits registrations with different usernames to see which return "already taken."
- Impact: privacy leak — determine if a specific user has an account.
- Mitigation:
  - Rate limit: 3 registrations per IP per hour.
  - Error on conflict: `{ error: 'validation', fields: { username: 'unavailable' } }`. The word "unavailable" is used for both "reserved" and "taken" so attacker can't distinguish.
- Verification: attempt known-existing + likely-nonexistent — identical "unavailable" response when validation fails.

### 4.2 Session and CSRF

**V7 — CSRF on state-changing requests**
- Threat: attacker-controlled site tricks a logged-in user's browser into making a request to our server.
- Impact: unauthorized actions.
- Mitigation:
  - `SameSite=Lax` cookie blocks cross-site POST automatically for most browsers.
  - Salvage/04 CSRF double-submit: state-changing requests need `X-CSRF-Token` header matching the `csrf` cookie.
  - SPAs fetch the token from `GET /api/csrf-token` at load, include in subsequent fetches.
  - Enabled only in production (dev proxies and local tools would break). Documented tradeoff.
- Verification: cross-origin POST without token → 403. With SameSite=Lax cookie, the cookie isn't sent cross-origin anyway — CSRF is defense-in-depth.

**V8 — Session cookie in URL / referer leak**
- Threat: if session ID ever appears in a URL, it leaks via Referer header.
- Impact: account takeover.
- Mitigation: session ID is cookie-only. Never accepted as query param. Any endpoint that ignores the cookie and accepts a session via query is rejected in code review.
- Verification: grep codebase for `session=` in query-parsing code — zero matches.

### 4.3 Feed ingestion (highest-risk surface)

This is where most server-side risk lives. The app makes outbound HTTP requests on user command.

**V9 — SSRF via malicious feed URL**
- Threat: user submits `POST /api/feeds/subscribe` with URL pointing at internal service: `http://localhost:8080/admin`, `http://127.0.0.1:6379`, `http://169.254.169.254/latest/meta-data/` (AWS IMDS), `http://metadata.google.internal/`.
- Impact: attacker uses our server as a proxy to read internal-network resources — secrets, DB panels, cloud metadata, VPN endpoints.
- Mitigation (MVP-level):
  - URL scheme allowlist: only `http` and `https`. Reject `file://`, `gopher://`, `ftp://`, `dict://`, etc.
  - Before fetching: resolve hostname to IP(s) using `dns.lookup` with `all: true`. For each resolved IP, verify it's **not**:
    - Loopback: `127.0.0.0/8`, `::1`
    - Private RFC1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
    - Link-local: `169.254.0.0/16`, `fe80::/10`
    - Cloud metadata: `169.254.169.254` (covered by link-local), `fd00:ec2::254`
    - Unspecified: `0.0.0.0`, `::`
    - Reserved: `240.0.0.0/4`
  - If any resolved IP is in the deny list → 400 `{ error: 'url_not_allowed' }`.
  - Implementation uses the `is-private-ip` package or equivalent; tests cover all ranges above.
  - **Pin DNS**: resolve once, fetch against the resolved IP with `Host:` header set to the hostname. Prevents DNS rebinding (resolver returns public IP; attacker's DNS then resolves to internal before the fetch).
- Mitigation against redirects:
  - Follow up to 3 redirects.
  - Re-validate the redirect target's URL through the same scheme + IP checks.
  - If a redirect target fails validation, fail the whole fetch.
- Verification:
  - Integration test: subscribe to `http://127.0.0.1/anything` → 400.
  - Subscribe to `http://localhost/anything` → 400 (localhost resolves to loopback).
  - Subscribe to a URL whose `Location:` redirects to internal → 400.
  - Subscribe to a URL served with a DNS TTL=0 whose resolution changes between resolve and fetch → the pinned IP is used, so attack fails.
- Gap (MVP-level): a feed served over IPv6 might surprise the IPv6 detection. Tests must cover IPv6 explicitly. An attacker-controlled DNS server pointing at `[::ffff:127.0.0.1]` (IPv4-mapped IPv6) needs to be explicitly rejected.

**V10 — Decompression bomb**
- Threat: feed server returns `Content-Encoding: gzip` with a 1 KB payload that expands to 10 GB.
- Impact: memory exhaustion, process crash.
- Mitigation:
  - Fetch library configured with a max decompressed size: 10 MiB.
  - Only accept `gzip` and `deflate` (not `br` or `zstd`) so we're certain the library can enforce the limit.
  - Node's `undici` + pipeline with a counting transform, aborting past threshold.
- Verification: test with a feed that decompresses to 20 MiB — fetch aborts cleanly, feed marked failed.

**V11 — Slowloris / slow-response DoS**
- Threat: feed server accepts the connection but trickles bytes, holding the worker indefinitely.
- Impact: queue starvation; legitimate feeds stop being polled.
- Mitigation:
  - 10-second total fetch timeout (SPEC §5.4). Covers connect + TLS + request + response headers + body.
  - Concurrent-poll cap (`FEED_POLL_CONCURRENCY`, default 4) means a single slow feed can only occupy ¼ of workers.
  - Circuit breaker opens after 5 consecutive failures, pausing the feed.
- Verification: test server sleeps 15s — fetch aborts at 10s, consecutive_fail increments.

**V12 — XML external entity (XXE) in feeds**
- Threat: feed XML contains external entity declarations that read local files or cause DoS.
- Impact: file disclosure, "billion laughs" DoS.
- Mitigation:
  - Use `rss-parser` ≥ 3.12, which disables DTD and external entities by default via its `xml2js` config.
  - Explicitly set parser options: `{ customFields: {...}, xml2js: { explicitArray: false, ignoreAttrs: false } }` and verify `strict: false` does not re-enable entity resolution.
  - Reject any feed whose parsed tree is suspiciously deep (parser depth limit 20) — catches entity expansion attempts.
- Verification: test feed with `<!DOCTYPE foo [<!ENTITY bar SYSTEM "file:///etc/passwd">]>` — parser silently drops the entity, resulting item has no `/etc/passwd` content.

**V13 — Stored XSS via feed content**
- Threat: feed publishes an item containing `<script>`, `<iframe>`, or inline event handlers. Reader UI renders the content, script executes in the reader's browser.
- Impact: session theft, arbitrary actions as the reader.
- Mitigation:
  - DOMPurify sanitization on every feed item's HTML before DB storage. Config:
    - Allowed tags: p, br, strong, em, a, ul, ol, li, blockquote, code, pre, h1-h6, img, figure, figcaption, table, thead, tbody, tr, td, th, hr.
    - Allowed attributes: href (a; validate http/https only), src (img; block `javascript:` `data:` except `data:image/*`), alt, title, class.
    - Forbidden tags: script, style, iframe, object, embed, link, meta, form, input.
    - Forbidden attributes: all `on*` event handlers.
  - Content-Security-Policy on reader/admin/public responses forbids inline scripts (salvage/04's helmet config). Provides defense-in-depth.
- Verification:
  - Unit tests cover OWASP XSS cheat-sheet vectors: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<svg onload=alert(1)>`, `<iframe src=javascript:alert(1)>`, `<a href="javascript:alert(1)">click</a>`, data URIs, CSS `expression()`, base64 obfuscation.
  - Integration: feed returns malicious content → DB row's `content_html` contains no script-equivalent → rendered page doesn't execute.

**V14 — Persistent tracking pixels / privacy leaks in feeds**
- Threat: feed embeds a `<img src="https://tracker/pixel?user=X">` that phones home every time the user views the item.
- Impact: privacy leak — tracker learns when + where the user read the item.
- Mitigation:
  - Option A (MVP-lite): rewrite all `<img src>` to route through our proxy `/proxy-image?url=<original>`. The proxy fetches once, caches, serves our users without leaking their IPs upstream.
  - Option B (simpler): strip `<img>` from feed content unless the user has opted in to "allow images from feeds." Default off.
  - MVP takes Option B; image-proxy is a future media-module concern.
- Verification: feed with external images → stored HTML has images replaced with placeholder or stripped; reader UI shows "images hidden (click to load)".

**V15 — Feed polling-loop exhaustion via a malicious user**
- Threat: user subscribes to 10 000 feeds. Poller spends all its time on that one user.
- Impact: other users' feeds don't get polled on time.
- Mitigation:
  - Per-user subscribe rate limit: 10 new subscriptions per hour (SPEC §5.4).
  - Per-user total subscription cap (system-wide config, default 500). When an admin removes the cap for a trusted user, admin operation logged in audit_log.
  - Global poll concurrency (4 default). Scheduling is round-robin across feeds, not by user — so a user with many feeds doesn't monopolize.
- Verification: one user with 1000 subscriptions doesn't cause others' feeds to starve.

**V16 — Feed server sends a huge response after content-length negotiation**
- Threat: feed server promises 1 KB via `Content-Length`, actually sends 100 MB.
- Impact: memory / disk.
- Mitigation: fetcher tracks bytes received, aborts at 10 MiB regardless of declared Content-Length. Don't trust header.
- Verification: test server with lying Content-Length.

### 4.4 Content and rendering

**V17 — Stored XSS in user-authored posts**
- Threat: user's markdown contains `<script>` or iframe injection.
- Impact: stored XSS visible to viewers of public posts (or in the admin preview).
- Mitigation:
  - `marked` used with `sanitize: false` (deprecated anyway), immediately followed by DOMPurify with the same config as V13.
  - Unit tests cover Markdown → HTML injection attempts: `[link](javascript:alert(1))`, raw HTML in markdown, code-fence escape attempts.
  - CSP blocks inline scripts as defense-in-depth.
- Verification: post containing every OWASP cheat-sheet vector renders as literal text (for code blocks) or is stripped (for HTML markdown).

**V18 — Stored XSS via user-supplied title / slug**
- Threat: post title / feed title contains HTML entities that get un-escaped during rendering.
- Impact: XSS in list views, in the browser title tag, or in OG meta tags.
- Mitigation:
  - Titles rendered with framework's default escaping (React auto-escapes; server templates use an explicit escape helper).
  - OG meta values are attribute-escaped with a library that handles `&"<>` and control characters.
  - Slug generation strips to `[a-z0-9-]+` — no HTML-significant characters survive.
- Verification: unit test titles with `"><img src=x onerror=alert(1)>`, `&#60;script&#62;`, `\x00<script>` — all render as escaped text.

**V19 — Markdown reference-URL injection**
- Threat: user's markdown contains `[label][ref]` where `[ref]: javascript:alert(1)`.
- Impact: XSS via link.
- Mitigation:
  - Marked's URL-sanitize option is enabled; all `<a href>` values validated.
  - Post-marked DOMPurify config explicitly rejects `href` starting with `javascript:`, `data:` (except limited `data:image/*` if allowing), `vbscript:`.
- Verification: unit test markdown with every URL-protocol injection pattern.

### 4.5 Public surface enumeration

**V20 — Outgoing feed URL enumeration**
- Threat: attacker guesses `slug` values for a known username, hoping to find a valid `secret`.
- Impact: read access to a user's curated outgoing feed.
- Mitigation:
  - Secret is 24 chars, ~144 bits of entropy. Brute force is infeasible.
  - Secret comparison is constant-time. Implementation: look up by slug, then `crypto.timingSafeEqual` on fixed-length secrets.
  - Actually: look up by compound `(slug, secret)` as a single DB query — no branch on slug-only existence, equal response time for any mismatch.
  - 404 on any mismatch (no `401` or `not found for this slug`).
- Verification: attempts at `/rss/known-slug-<random>` all return 404 with ~equal latency.

**V21 — Public post URL enumeration**
- Threat: attacker guesses `(username, slug)` combinations hoping to find unlisted or public-but-unwanted posts.
- Impact: access to content the user intended to be hard-to-find.
- Mitigation:
  - `unlisted` posts by design are URL-accessible. That's the contract — users who use this visibility understand it.
  - `private` posts return 404 identically to nonexistent posts. No way to distinguish.
  - Rate limit on `GET /p/*`: 300 requests per IP per hour. An enumeration attempt hits the rate limit before finding anything.
- Verification: attempts at many `(username, random-slug)` combos → 404 + 429 after threshold.

**V22 — Username enumeration via public post URLs**
- Threat: `GET /p/:username/:slug` returns 404 whether or not the username exists. But timing might differ.
- Impact: learn which usernames exist.
- Mitigation: constant-time behavior — always execute `users.findByUsername` + `contents.findBySlug`, even if user doesn't exist. Both produce a 404 in the same branch.
- Verification: timing test — median latency for nonexistent user equals median for user who exists but has no matching post.

**V23 — Unauthenticated outgoing-feed DoS via expensive query**
- Threat: attacker repeatedly hits `/rss/slug-secret` for a feed whose query is expensive to execute. XML rendering is uncached in MVP.
- Impact: CPU / DB load.
- Mitigation:
  - `Cache-Control: public, max-age=300` in response; CDN / reverse proxy caches for 5 minutes. Most reader-software requesters respect this.
  - Server-side: in-process 5-minute cache keyed on outgoing_feed.id. First request materializes; subsequent serve from cache until invalidation event fires.
  - Invalidation: `content.created`, `content.updated`, `content.deleted`, `user_item_state.saved-changed` events flush the relevant outgoing-feed cache entries.
  - Rate limit on `/rss/*`: 60 requests per IP per 5 minutes per outgoing feed.
- Verification: hit the same feed URL in a loop — second request returns from cache (log line confirms), rate limit kicks in at 61 requests.

### 4.6 Admin surface

**V24 — Privilege escalation via API path manipulation**
- Threat: non-admin user calls `/api/admin/*` routes directly.
- Impact: admin actions performed by non-admin.
- Mitigation:
  - Admin middleware applied in the route-mount declaration in the admin module's manifest. Every route under `/api/admin/*` goes through `requireAuth + requireAdmin`.
  - Tests cover every admin route with a non-admin session → 403 on every one.
- Verification: automated check — for each admin route in manifest, test with a plain-user session; expect 403.

**V25 — IDOR — access another user's data by changing IDs**
- Threat: user calls `GET /api/content/<other-user's-post-id>`.
- Impact: cross-user read.
- Mitigation:
  - Every per-user-data handler checks `content.owner_user_id === currentUserId OR content.source === 'feed' && user has subscription to content.feed_id OR content.visibility IN ('public','unlisted')`.
  - Implementation uses `assertScoped('content.get')` (salvage/12) and then scope-aware SQL. The access check is inside the repository, not the handler — so adding a new handler can't forget it.
- Verification: user A's session requests user B's post IDs → 404 (not 403, to avoid enumeration).

**V26 — Rule expression DoS**
- Threat: user authors a rule expression designed to pin CPU.
- Impact: rule evaluation hangs the classification job.
- Mitigation: salvage/09-safe-expression has built-in DoS limits:
  - `MAX_EXPRESSION_LENGTH = 4096`
  - `MAX_PARSE_DEPTH = 64`
  - `MAX_OPERATIONS = 10_000`
  - Division/modulo by zero coerce to `undefined`
  Each rule's evaluation bounded; no user-authored expression can exceed these.
- Verification: salvage/09 tests cover; additional integration test submits a 100 000-char expression → 400 at save time.

**V27 — Audit log tampering**
- Threat: malicious admin covers their tracks by deleting `audit_log` rows.
- Impact: lost forensic trail.
- Mitigation (MVP-level):
  - No API to delete audit_log rows. Admin UI has no delete action.
  - `DELETE FROM audit_log` requires direct DB access.
- Gap: a determined admin with DB access can tamper. Full hardening requires append-only event-source storage, WAL archival to immutable storage, or shipping logs to an external SIEM. Documented limit.

### 4.7 Infrastructure

**V28 — SQL injection**
- Threat: attacker-controlled input reaches a SQL query unescaped.
- Impact: data exfiltration, modification.
- Mitigation:
  - Drizzle ORM parameterizes all inputs. `sql.raw` is avoided; `sql` template literals auto-parameterize.
  - Lint rule (future): block `sql.raw` outside a short allowlist of justified uses.
  - `safeLikePattern` helper (salvage-adjacent, inlined per IMPLEMENTATION.md) escapes `%` and `_` in LIKE patterns.
- Verification: code review grep for `sql.raw` — justified in comments. Integration test: login with username `' OR '1'='1` → rejected as bad username format.

**V29 — Secrets in logs**
- Threat: passwords, tokens, session cookies accidentally logged.
- Impact: log store becomes credential store.
- Mitigation:
  - Salvage/03 redactor auto-redacts keys matching `password`, `token`, `secret`, `cookie`, `authorization`, `csrf_token`.
  - Bootstrap token is logged via a dedicated, once-only function that writes to stdout directly, not through the logger — so the logger's redact list doesn't see it (but the human reader who prompted the start command does). Document this exception.
- Verification: CI grep — `grep -r 'password\|api_key\|session_secret' dist/ | grep -v 'redact'` shows no matches.

**V30 — Exposed `/metrics` endpoint**
- Threat: Prometheus endpoint reveals internal state to unauthenticated attackers.
- Impact: info disclosure (usage patterns, internal counters).
- Mitigation:
  - `/metrics` is behind a reverse-proxy-level IP allowlist in production (documented; not enforced by app).
  - App does not expose user-identifying labels in metrics (no `user_id` labels, only counters).
- Verification: inspect Prometheus output — no PII, no user-identifiers.

**V31 — Dependency supply-chain**
- Threat: upstream npm package compromised.
- Impact: RCE.
- Mitigation:
  - `package.json` pins exact versions; `package-lock.json` committed.
  - Dependabot / Renovate PRs for upgrades, reviewed manually.
  - `npm audit` in CI; fail build on high/critical.
  - Minimal dependency set — the salvage already vetted: pino, helmet, express-rate-limit, express-session, drizzle, pg, zod, marked, DOMPurify, rss-parser, xmlbuilder2, ioredis (optional), prom-client.
- Verification: CI step runs `npm audit --audit-level=high`.

---

## 5. Verification matrix

Summary of automatic checks that should exist. If a row isn't tested, the mitigation isn't real.

| Vector | Test type | Location |
|---|---|---|
| V1 credential stuffing | Integration | `tests/integration/auth-rate-limit.test.ts` |
| V2 cookie flags | Integration | `tests/integration/session.test.ts` |
| V3 bootstrap token | Integration | `tests/integration/bootstrap.test.ts` |
| V5 login enumeration | Performance | `tests/integration/auth-timing.test.ts` |
| V9 SSRF (all IP ranges) | Unit + integration | `tests/unit/url-validator.test.ts`, `tests/integration/feed-subscribe-ssrf.test.ts` |
| V9 DNS rebinding | Integration | `tests/integration/feed-subscribe-rebinding.test.ts` (uses custom DNS resolver) |
| V10 decompression bomb | Integration | `tests/integration/feed-zip-bomb.test.ts` |
| V11 slow response | Integration | `tests/integration/feed-slow.test.ts` |
| V12 XXE | Unit | `tests/unit/rss-parser-xxe.test.ts` |
| V13 feed XSS | Unit | `tests/unit/sanitize-feed.test.ts` (OWASP vector suite) |
| V17 post XSS | Unit | `tests/unit/sanitize-post.test.ts` |
| V20 outgoing enumeration | Integration | `tests/integration/outgoing-feed-enum.test.ts` |
| V21 public post enumeration | Integration | `tests/integration/public-post-enum.test.ts` |
| V22 username timing | Performance | `tests/integration/public-post-timing.test.ts` |
| V24 admin route privilege | Integration | `tests/integration/admin-auth.test.ts` (every route) |
| V25 IDOR | Integration | `tests/integration/idor.test.ts` |
| V26 rule expression DoS | Unit | Salvage/09 tests + `tests/integration/rule-save-oversize.test.ts` |
| V28 SQL injection | Static + integration | `grep sql.raw`, `tests/integration/sql-injection.test.ts` |
| V29 log redaction | Integration | `tests/integration/log-redaction.test.ts` |

---

## 6. Residual risks

Explicit list of known-weakness items that MVP accepts. Operators should know.

1. **Compromised admin owns the system.** Full hardening requires multi-person admin operations, which MVP doesn't implement.
2. **Postgres-level attacker owns data.** Standard for any DB-backed app.
3. **Bootstrap-token log leak.** If the operator exposes their log stream publicly between first boot and admin creation, the attacker wins. Document "treat initial logs as secret."
4. **Image tracking pixels.** Stripped in MVP; if a user opts in to images from feeds, they accept the tracking exposure.
5. **Outgoing-feed URL shared accidentally.** The secret is a capability URL. If the user posts the URL publicly, the feed is public. Acceptable per UX intent.
6. **XML parsing edge cases.** rss-parser / DOMPurify / marked are widely deployed but not bug-free. Keep them on latest minor.
7. **CSP `unsafe-inline` for styles.** Needed for some inline styling in public pages. Future: nonced inline styles via CSP-nonce middleware.
8. **No rate limit on the public post page**. V21 covers enumeration; traffic floods against a single viral post aren't explicitly limited. Upstream CDN / reverse proxy handles.
9. **No WebAuthn / 2FA in MVP.** Single-factor auth only.
10. **Audit log deletable at DB layer.** Forensic gap for insider threats.

---

## 7. Future hardening (post-MVP)

Roughly in priority order. Each is a scoped addition.

1. **Image-proxy module** — addresses V14 properly via per-user content-type preference.
2. **WebAuthn / passkey support** — removes password as single factor for admins.
3. **HIBP breach-list check on password change** — salt-client-side k-anonymity.
4. **Append-only audit-log** — write to a separate table with triggers preventing `DELETE` and `UPDATE` from the app role.
5. **CSP nonces** — eliminate `'unsafe-inline'` for styles.
6. **SSRF-harder URL validator** — reject URLs whose hostname resolves to IPv4-mapped IPv6 loopback, reject deny-listed hostnames explicitly, consult a blocklist for known TOR exit / cloud metadata hostnames.
7. **WAF rules** — documented nginx/Caddy snippet that adds user-agent-based blocking for known crawlers, IP-range bans from fail2ban integration.
8. **Content Security Policy report-only → enforce** — start with report-only for a release, monitor `report-uri`, then promote to enforce once the real-world CSP violations are clean.
9. **SRI for external assets** — none in MVP (all assets are self-hosted) but add when CDN fronts any static asset.
