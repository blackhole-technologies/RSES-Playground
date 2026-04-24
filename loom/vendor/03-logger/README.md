# 03-logger

Structured logging setup for an Express app, built on [pino](https://github.com/pinojs/pino). The useful pieces:

- **Correlation ID propagation via `AsyncLocalStorage`** — every log line emitted inside a request automatically includes the correlation ID, without threading it through function arguments.
- **`correlationMiddleware()`** — Express middleware that reads `X-Correlation-ID` (or `X-Request-ID`) from the incoming request, generates one if absent, sets it on the response, and wraps the rest of the request in the AsyncLocalStorage context.
- **`requestLoggingMiddleware()`** — logs request completion with method / path / status / duration, picking log level by status code (5xx → error, 4xx → warn, else info).
- **`runWithCorrelationId(id, fn)`** — lets background jobs and non-HTTP paths participate in correlation tracing.
- **Recursive field redaction** — `[REDACTED]` substitution for common sensitive key names (`password`, `token`, `apiKey`, `cookie`, `authorization`, `creditCard`, `ssn`, etc.) with case-insensitive matching that follows nested objects. Runs on demand via `redact(obj)`, and pino's built-in `redact` option is also configured for path-based redaction.
- **Environment-aware formatting** — JSON output in production, `pino-pretty` colorized output in development.

## What's here

`src/logger.ts` — single file, ~250 lines. Dependencies: `pino`, `pino-pretty` (dev-only, for local colorization), `async_hooks` (built-in), and Express types.

## No tests

The parent repo has no test coverage for this file. I'm flagging that explicitly because everything else I've salvaged so far came with a passing test suite. This is a sensible pattern built out of pino's standard surface, but "no tests" means "trust it less." Read the file before relying on it.

## Dependencies

```
npm install pino pino-pretty
npm install --save-dev @types/node
```

## Usage

```ts
import express from "express";
import {
  logger,
  createModuleLogger,
  correlationMiddleware,
  requestLoggingMiddleware,
} from "./logger";

const app = express();

// Install correlation-ID middleware first — it opens the AsyncLocalStorage
// context that all subsequent logs will inherit.
app.use(correlationMiddleware());
app.use(requestLoggingMiddleware());

// Anywhere else in your code:
const log = createModuleLogger("my-module");
log.info({ userId: 42 }, "Something happened");
// → includes { correlationId: "<request-uuid>", module: "my-module", userId: 42 }
```

## Project-specific bits to trim

Two things in this file are specific to the parent repo and you probably want to change:

1. **`service: "rses-playground"`** (in `createLoggerOptions().formatters.bindings`) — hardcoded service name in every log line's `bindings`. Change to your service name, or plumb it through from env.
2. **Pre-configured module loggers at the bottom** (`wsLogger`, `routesLogger`, `authLogger`, `dbLogger`, `projectsLogger`, `bridgeLogger`, `symlinkLogger`, `fileWatcherLogger`, `engineLogger`, `workbenchLogger`) — these are shortcuts the parent repo used for its specific modules. Delete them and let callers create their own with `createModuleLogger("whatever")`.

Neither is load-bearing. The file works as-is; these are cosmetic fixes for a cleaner interface.

## Header comment

The file header still has the parent repo's agent-theater (`@author SYS (Systems Analyst Agent)`, `@phase Phase 7 - Production Readiness`). Strip if you're porting. Doesn't affect runtime.

## How this compares to just using pino directly

Pino ships with correlation-ID support via `pino.child({ requestId })` and redaction via `redact: { paths: [...] }`. What this file adds on top:

- AsyncLocalStorage-based correlation that doesn't require threading the logger through every function.
- Recursive object redaction that matches on *any* key name containing a sensitive token, not just fixed paths.
- Ready-made Express middleware for the plumbing.

If those three things aren't worth 250 lines to you, use pino directly. This file is a starting point, not a framework.
