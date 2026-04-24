# 05-metrics

Prometheus metrics setup for an Express app using [`prom-client`](https://github.com/siimon/prom-client). Provides a registry, HTTP-request instrumentation middleware, a `/metrics` endpoint handler, and a couple of small timing helpers.

## What's here

`src/metrics.ts` — 272 lines. One file.

The **generic, reusable** bits:
- **Custom registry** — the file creates its own `Registry()` rather than polluting the default global one. All exported metrics register into this registry.
- **`collectDefaultMetrics({ register, prefix: "rses_" })`** — Node-process defaults (CPU, memory, event loop lag, GC stats, etc.) with a configurable prefix.
- **`httpRequestsTotal`** (Counter, labels: method/path/status) and **`httpRequestDuration`** (Histogram with buckets tuned for HTTP) — the two workhorses.
- **`metricsMiddleware()`** — Express middleware that records request count + duration for every request.
- **`normalizePath(path)`** — collapses numeric IDs to `:id` and UUIDs to `:uuid`, and caps path depth to 5 segments. Path normalization is *essential* for Prometheus — without it, every distinct URL is a separate label value and cardinality explodes.
- **`registerMetricsRoute(app)`** — serves `/metrics` in the Prometheus text exposition format, returning 500 if collection fails.
- **`timeAsync(histogram, labels)`** / **`timeSync(histogram, labels)`** — small wrappers around `histogram.startTimer()` that work for both success and failure paths.
- The `register` is exported for testing.

## Project-specific metrics to trim

The file also defines several counters/histograms specific to this repo that a port will almost certainly delete:

- `rsesParseTime`, `rsesTestTime`, `rsesOperationsTotal` — RSES engine timing
- `projectsScannedTotal`, `projectScanDuration` — project-scanner timing
- `symlinksCreatedTotal`, `symlinksRemovedTotal` — symlink counters
- `wsConnectionsActive`, `wsMessagesTotal` — WebSocket counters (may be reusable depending on your app)
- `dbQueryDuration`, `dbPoolSize` — database counters (may be reusable)

These are real, working metrics in the parent repo — the tests cover them. If you want a blank-slate version of this file, just delete their declarations. The middleware + registry + `/metrics` route + timing helpers don't depend on any of them.

Also trim:
- The `prefix: "rses_"` on `collectDefaultMetrics` — this prefixes every default Node metric (so you get `rses_process_cpu_seconds_total` instead of `process_cpu_seconds_total`). Change to your project prefix, or drop the prefix option entirely if you don't need it.

## Dependencies

```
npm install express prom-client
npm install --save-dev vitest supertest @types/supertest
```

## Running tests

```bash
npx vitest run tests/
```

13 test cases covering:
- `/metrics` endpoint returns Prometheus text format with the right content-type
- Middleware increments `httpRequestsTotal` and observes `httpRequestDuration` on request completion
- Path normalization collapses numeric IDs, UUIDs, and caps depth
- Each of the project-specific counters/histograms records correctly
- The registry exposes all expected metric names

Because the tests reference the project-specific counters by name (`rsesParseTime`, `projectsScannedTotal`, etc.), if you delete those counters you'll also need to delete or adapt the corresponding test cases.

## Known limitations

- **No latency for excluded paths.** `/metrics`, `/health`, `/ready` are excluded from path normalization (so their metrics exist under their real paths) but they're *not* excluded from collection. If you want to skip them entirely, check `req.path` in the middleware.
- **No label for error/success class.** `status` label records the full status code (`"200"`, `"404"`, `"500"`). If you want a lower-cardinality class label (`"2xx"`, `"4xx"`, `"5xx"`), change the middleware.
- **Default metric prefix is fixed.** The `collectDefaultMetrics({ prefix: "rses_" })` call uses a string literal. Pass it through from env if you want it configurable.

## Header comment

File retains `@author SYS (Systems Analyst Agent)` — strip at will.
