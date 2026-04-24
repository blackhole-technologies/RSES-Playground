# 06-circuit-breaker

Standard circuit-breaker pattern: wrap a fallible async operation, count failures, trip open after a threshold, test recovery in half-open state, snap back closed on enough successes.

## Why this exists

A circuit breaker protects a caller from wasting time and resources on a downstream dependency that's currently failing. Instead of letting every request time out against a dead database, after N consecutive failures the breaker "opens" and rejects calls immediately (or returns a fallback). After a cooldown it moves to "half-open" and lets a single probe through; success closes the circuit, failure re-opens it.

This is one of the few patterns from the parent repo's "resilience" chapter (see `docs/architecture/ISOLATION-FAULT-TOLERANCE.md`) that actually has working code behind it. The docs describe a full bulkhead + chaos-engineering + replicated-event-store apparatus that doesn't exist; this file is the one thing in that category that does.

## What's here

`src/circuit-breaker.ts` — 259 lines, one file.

Exports:
- **`CircuitBreaker` class** — `new CircuitBreaker({ name, failureThreshold, resetTimeout, successThreshold, onStateChange? })`. Methods: `execute(operation, fallback?)`, `getState()`, `getStats()`, `reset()`.
- **`CircuitState` enum** — `CLOSED` / `OPEN` / `HALF_OPEN`.
- **`CircuitOpenError`** — thrown by `execute()` when the circuit is open and no fallback is provided. Has a `circuitName` field.
- **`createDatabaseCircuitBreaker(name?)`** — factory with defaults suited to a Postgres connection (5 failures, 30s reset, 2 successes to close) plus an `onStateChange` that logs at error/info.

## Defaults

```ts
{
  failureThreshold: 5,      // open after 5 consecutive failures
  resetTimeout: 30000,      // stay open 30s before first probe
  successThreshold: 2,      // close after 2 consecutive successes in half-open
}
```

## Usage

```ts
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";

const breaker = new CircuitBreaker({ name: "api.external", failureThreshold: 3 });

async function fetchWithBreaker() {
  try {
    return await breaker.execute(() => fetch("https://upstream/api").then(r => r.json()));
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // upstream is flaky; degrade gracefully
      return { cached: true, data: [] };
    }
    throw err;
  }
}

// or with a fallback:
const result = await breaker.execute(
  () => fetch("https://upstream/api").then(r => r.json()),
  () => ({ cached: true, data: [] })
);
```

## Dependencies

Runtime: none outside Node built-ins.

The file originally imports `dbLogger` from the parent repo's logger. I've replaced that with a local `logger-stub.ts` (same pattern as `02-feature-flags`): a minimal `createModuleLogger` that forwards to `console`. Swap in your own logger in one place if you want real structured logging.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

One test file (14 cases) covers:
- Starts closed; passes operations through; tracks successes
- Opens after `failureThreshold` consecutive failures
- Rejects with `CircuitOpenError` when open
- Returns fallback (value or function) when open and fallback is provided
- Transitions to half-open after `resetTimeout`
- A successful probe in half-open increments success count; after `successThreshold`, closes
- A failure in half-open immediately re-opens
- `reset()` returns to a clean closed state
- `onStateChange` callback fires on every transition
- `re-throws errors from operations` — confirms `execute()` doesn't swallow the underlying error

## What this is not

- Not a bulkhead / concurrency limiter. No queueing. No per-operation timeout (wrap your own `Promise.race` if you need that).
- Not a retry wrapper. The caller decides whether to retry.
- Not distributed. Each instance of `CircuitBreaker` has its own counters; no cross-process state sharing.

## Header comment

File retains `@author SYS (Systems Analyst Agent)` from the parent repo. Strip at leisure.
