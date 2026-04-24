# 04-security-middleware

A set of Express security middleware with sensible defaults, composed into one file. Not a framework — a starting point you can pick pieces from.

## What's here

`src/security.ts` — 426 lines, one file, zero imports from the parent repo.

Exports (useful ones first):

- **`createSecurityMiddleware(config?)`** — composed stack that returns `[helmet, rateLimit, pathTraversalBlocker, inputSizeLimiter]` as an array. `forEach((mw) => app.use(mw))` to apply.
- **`createHelmetMiddleware()`** — pre-configured helmet with a Content Security Policy that allows Monaco Editor (jsdelivr CDN, `blob:` for workers), inline styles for Monaco CSS, and WebSocket connections. HSTS is deliberately disabled — it should be set at a reverse-proxy (nginx) layer, not at the app.
- **`createRateLimiter(config?)`** — `express-rate-limit`-based limiter with 100 req / 15 min default. Sets standard headers, disables legacy headers, **skips failed requests** so attackers can't exhaust a user's quota with invalid requests, and exempts `/health` + `/ready` by default.
- **`pathTraversalBlocker()`** — rejects requests whose query params or body fields contain `../`, `..\\`, absolute system paths (`/etc`, `/var`, `/usr`, `/root`, `/home`, `C:\\`, `/proc`, `/sys`), or home-expansion `~/`. Also does a deep check for traversal patterns in RSES config content. Returns 400 with code `E_PATH_TRAVERSAL`.
- **`inputSizeLimiter(config?)`** — enforces a cap on the `content` field of JSON bodies (default 512KB). Returns 413 with code `E_PAYLOAD_TOO_LARGE`.
- **`csrfProtection(config?)`** — double-submit-cookie CSRF check for state-changing methods. Compares `X-CSRF-Token` header to the `csrf` cookie. Skips `GET`/`HEAD`/`OPTIONS` and a short list of known read-only engine paths.
- **`generateCsrfToken()`** — middleware that sets the `csrf` cookie on first request (`httpOnly`, `sameSite: strict`, `secure` in production, 24h expiry) and puts the value in `res.locals.csrfToken` for the initial page to deliver to the frontend.
- **`csrfTokenEndpoint()`** — request handler for `GET /api/csrf-token`: returns `{ csrfToken }` so the frontend can fetch it at startup.
- **`isPathSafe(path)`** — standalone predicate used by `pathTraversalBlocker`, usable in your own handlers.
- **`validateRequestSecurity(body)`** — standalone validator that returns `{ valid, errors }`, for use outside middleware (e.g. background job input validation).

## Configuration

```ts
interface SecurityConfig {
  maxBodySize: number;          // default 1MB
  maxConfigSize: number;        // default 512KB (applies to body.content field)
  rateLimitWindowMs: number;    // default 15 * 60 * 1000
  rateLimitMax: number;         // default 100 per window per IP
  enableCsrf: boolean;          // default: true in production, false otherwise
  rateLimitExemptPaths: string[]; // default: ["/health", "/ready"]
}
```

Exported as `securityDefaults` (aliased from `defaultConfig`).

## Dependencies

```
npm install express helmet express-rate-limit zod
```

`crypto` is a built-in Node module.

## Running tests

```bash
npm install --save-dev vitest
npx vitest run tests/
```

One test file (21 cases) covers:
- `isPathSafe()` — accepts safe paths, rejects traversal, rejects encoded traversal, handles malformed URL-encoded input.
- `configContentSchema` — size limit behavior.
- `validateRequestSecurity()` — structured validation result shape.

## What to change before using in production

- **CSP `scriptSrc` includes `'unsafe-inline'` and `'unsafe-eval'`**. That's there for React dev + Monaco Editor. If your frontend doesn't need either, tighten the policy.
- **`hsts: false`** is deliberate (see file comment). Re-enable if you're serving directly on public internet without a reverse proxy, otherwise keep off.
- **CSRF's `readOnlyPaths`** list includes three RSES-engine endpoints. If you're not using those endpoints, replace that list with your own.
- **Path-traversal deep check** for RSES config content (`req.body.content`) checks for `..` appearing after `->`. This is RSES-specific; remove or replace if you're not serving RSES configs.

## No auth middleware in here

This file doesn't cover authentication or sessions. If you need those, they live in `server/auth/` in the parent repo and I haven't salvaged them yet. They'd be a separate unit (the auth code is more opinionated about the user table schema).

## Header comment

File retains `@author SEC (Security Specialist Agent)` agent-theater from the parent repo. Cosmetic — strip at will.
