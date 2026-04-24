# RSES-Playground — Trust Model

**Last updated:** 2026-04-14

> This document defines what the RSES-Playground kernel **does** and **does not** protect against.
> Read this before:
> - Loading any code that did not come from the first-party `server/modules/` tree.
> - Enabling any feature flag whose value comes from user input.
> - Wiring an external integration that fans incoming data into kernel modules.

---

## TL;DR

The kernel is designed for **first-party modules deployed by a single trusted team**, on a **single
process**, to a **trusted hosting environment**. It is not designed to host user-supplied plugins,
multi-tenant arbitrary code, or untrusted webhook payloads that touch the module loader.

If a stakeholder asks "can we let users write their own plugins?", the answer today is **no**.
That conversation requires a real isolation layer (`isolated-vm` or `worker_threads`), signed-code
verification, and a security review. None of those exist yet.

---

## What the kernel protects

| Threat | Layer | Status |
|---|---|---|
| Replay of forged session cookies | Express-session secret + signed cookie | Active |
| Cross-site request forgery on state-changing routes | CSRF middleware (`server/middleware/security.ts`) | Active in production |
| Brute-force login attempts | Rate limit on `/api/auth` | Active |
| SQL injection via ORM | Drizzle parameterized queries + tests in `tests/security/sql-injection.test.ts` | Active |
| Path traversal | Path normalization in security middleware | Active |
| Header injection / large bodies | Helmet + body-size limits | Active |
| Cross-tenant data reads via missed WHERE clauses | `server/lib/tenant-scoped.ts` helper (Layer 2) | Active for tagged tables |
| WebSocket session forgery | Real session middleware on upgrade (Layer 1, fixed 2026-04-14) | Active |
| Workflow-engine expression DoS | `MAX_EXPRESSION_LENGTH/DEPTH/OPERATIONS` in `safe-expression.ts` | Active |
| Kernel admin route auth bypass | `requireAuth + requireAdmin` on all `/api/kernel/*` | Active |
| Module install via HTTP | Endpoint deliberately disabled with 503 | Active |

---

## What the kernel does NOT protect against

| Threat | Why we don't protect | What protects you |
|---|---|---|
| **Malicious code in `server/modules/`** | The kernel sandbox is a policy/audit layer, not isolation. Loaded modules run with full Node.js privileges. | Code review, version control, deployment process. |
| **Cross-tenant data reads via direct `db.select()` (bypassing the helper)** | Layer 2 is opt-in. A developer who imports `db` directly is not protected. | Code review + ROADMAP M1.3 (Drizzle pre-query hook) + M1.4 (Postgres RLS). |
| **Memory exhaustion from unbounded module operations** | The kernel does not enforce per-module memory or CPU limits. | Operating system + Kubernetes resource limits. |
| **Long-running module init blocking bootstrap** | No per-module init timeout. | ROADMAP M1.1 will add one. |
| **Distributed rate-limiter bypass across replicas** | Kernel rate limiter is in-memory only. | ROADMAP M1.2 will add an optional Redis backend. |
| **RBAC enforcement without explicit `checkPermission()` calls** | RBAC is advisory. Routes must opt in. | Code review + ROADMAP M1.5 (fail-closed `enforceRBAC` middleware). |
| **Untrusted webhook payloads triggering arbitrary workflows** | The trigger system trusts incoming webhooks unless the route enforces an HMAC. | ROADMAP M4 will add HMAC verification + replay protection on all webhook endpoints. |
| **Prototype pollution via JSON.parse on user input** | Body-parser does not freeze prototypes. | Use `Object.create(null)` for user-supplied bag types or validate via Zod. |

---

## What you must NEVER do

These actions break the trust model in ways that are not recoverable by code review:

1. **Do not load a module from a path supplied at runtime by a user, webhook, query string, or file
   upload.** The kernel sandbox is not isolation. The module install endpoint is disabled. Keep it
   that way.
2. **Do not pass user-supplied content to `safeEvaluate()` without an additional validator.** The
   safe-expression evaluator has limit guards but is not a syntactic firewall — it will happily
   evaluate `user.role == 'admin'` against attacker-controlled context.
3. **Do not write a route that calls `db.select().from(taggedTable)` directly.** Use
   `scoped(siteId).select(taggedTable)` or the upcoming Drizzle pre-query hook.
4. **Do not enable `WS_REQUIRE_AUTH=false` in any environment exposed to the public internet.** The
   WebSocket session check is the only gate on real-time channels.
5. **Do not store secrets in the database without encryption.** The codebase has an
   `encryption-service.ts` for messaging keys; reuse it for any new secret column.

---

## Threat model diagram

```
                                 ┌──────────────────────────┐
                                 │   Public Internet         │
                                 └─────────────┬────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │   Trusted Boundary (TLS, WAF, K8s ingress)    │
                       └───────────────────────┬───────────────────────┘
                                               │
                  ┌────────────────────────────┴────────────────────────────┐
                  │                                                          │
                  │   RSES Server Process (single Node.js process)           │
                  │                                                          │
                  │   ┌────────────────────────────────────────────────┐    │
                  │   │  Layer 1: Helmet + CSRF + Rate Limit           │    │
                  │   ├────────────────────────────────────────────────┤    │
                  │   │  Layer 2: Session + Passport + RBAC (advisory) │    │
                  │   ├────────────────────────────────────────────────┤    │
                  │   │  Layer 3: Site Context + Tenant Isolation Mw   │    │
                  │   ├────────────────────────────────────────────────┤    │
                  │   │  Layer 4: scoped(siteId) helper for queries    │    │
                  │   ├────────────────────────────────────────────────┤    │
                  │   │  Layer 5: Kernel module loader (POLICY ONLY,   │    │
                  │   │           not isolation — first-party only)    │    │
                  │   └────────────────────────────────────────────────┘    │
                  │                                                          │
                  └──────────────────────┬───────────────────────────────────┘
                                         │
                                 ┌───────┴───────┐
                                 │  PostgreSQL   │   ← future: row-level security (M1.4)
                                 └───────────────┘
```

---

## Promotion path for new code

When introducing new code, ask:

1. **Where does the input come from?** User, webhook, internal job, scheduled task?
2. **Which trust layers does it cross?** Mark the layers in the PR description.
3. **Does it touch a multi-tenant table?** If yes, must use `scoped(siteId)`.
4. **Does it evaluate any expression?** If yes, must use `safeEvaluate()`.
5. **Does it load any code path dynamically?** If yes, the change requires a security review.
6. **Does it spawn any child process or open any socket?** If yes, document why and the review is
   security-flagged.

---

*Trust models drift. Re-read this document at the start of every quarter and reconcile with what
the code actually does. If they diverge, fix the doc or fix the code — never both.*
