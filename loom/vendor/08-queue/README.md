# 08-queue

In-memory background job queue with retry + exponential backoff + dead-letter + priority scheduling. Single-process only. Useful when you need "send this off to happen asynchronously" and you don't want to stand up Redis/BullMQ/etc. yet.

## What's here

`src/queue.ts` — 423 lines, one file plus the local logger stub.

Exports:
- **`JobQueue` class** — `new JobQueue(config?)`. Methods:
  - `enqueue<T>(type, data, options?)` → `Job<T>` — submits a job; returns the tracked object.
  - `registerHandler<T, R>(type, handler)` — registers an async function that processes jobs of a given type.
  - `start()` / `stop()` — starts/stops the processing loop.
  - `getJob(id)` — look up by ID.
  - `getStats()` — counters (pending/processing/completed/failed/dead/total).
  - `getDeadLetterQueue()` — returns jobs that exhausted their retries.
  - `reset()` — clears all state. Test/admin use.
- **`JobStatus` enum** — `PENDING / PROCESSING / COMPLETED / FAILED / DEAD`.
- **`JobPriority` enum** — `LOW=0 / NORMAL=1 / HIGH=2`. Higher priority jobs dequeue first.
- **`JobType` type** — **project-specific string union** (see "Trim this" below).
- **`Job<T>`** — shape: `{ id, type, data, priority, status, attempts, maxAttempts, createdAt, startedAt?, completedAt?, error?, result? }`.
- **`JobHandler<T, R>`** type alias.
- **`QueueConfig`** — `{ concurrency, maxAttempts, initialRetryDelayMs, retryBackoffMultiplier, maxRetryDelayMs, processingIntervalMs }`.
- **`getJobQueue(config?)` / `resetJobQueue()`** — module-level singleton accessors. Use only if you want one queue per process; otherwise instantiate directly.

## Behavior

- **Concurrency cap** — only `concurrency` jobs run at a time. New jobs wait in the pending list.
- **Priority queue** — when a slot frees, the highest-priority pending job starts next. Ties broken by enqueue time (FIFO).
- **Retry with exponential backoff** — `initialRetryDelayMs` doubles (or multiplies by `retryBackoffMultiplier`) on each failure, capped at `maxRetryDelayMs`. Between retries the job's `status` is `PENDING` and the processor waits until its `nextAttemptAt`.
- **Dead letter queue** — after `maxAttempts` failures, status goes to `DEAD` and the job is removed from the live queue. Access via `getDeadLetterQueue()`.
- **Unregistered handler** — enqueueing a job type with no registered handler fails the job (with a clear error in `job.error`) on first processing attempt and retries per the backoff policy.

## Defaults

```ts
{
  concurrency: 4,
  maxAttempts: 3,
  initialRetryDelayMs: 1000,
  retryBackoffMultiplier: 2,
  maxRetryDelayMs: 60000,
  processingIntervalMs: 100,
}
```

## Dependencies

Runtime: only Node built-ins (`crypto.randomUUID`).

The file originally imported the parent repo's logger. I've replaced that with `logger-stub.ts` (same pattern as `02-feature-flags` and `06-circuit-breaker`): a minimal `createModuleLogger` that forwards to `console`. Replace with your own logger if you want structured logging.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

Test file (20 cases) covers:
- Enqueue / dequeue ordering by priority
- Handler registration and execution
- Result and error tracking on the `Job`
- Retry with backoff → success → `COMPLETED`
- Retry exhaustion → `DEAD` → moved to dead-letter queue
- Concurrency cap enforcement
- `start()` / `stop()` lifecycle
- Stats accuracy across state transitions

## Trim this

`JobType` is hardcoded to `"symlink.create" | "symlink.cleanup" | "project.scan" | "config.export"` — the parent repo's specific job types. **Change this to `string`** or to your own union before using in a different project. Everything else in the file is generic.

## What this is not

- **Not durable.** All state is in-memory. A process restart loses pending jobs. If you need durability, use BullMQ (Redis) or pg-boss (Postgres) instead.
- **Not distributed.** No cross-process coordination. If you run N instances of your server, you get N independent queues.
- **Not scheduled.** No cron, no `runAt`. Jobs run as soon as a slot is free (or after backoff). If you need scheduling, wrap it — or use a real scheduler.
- **Not rate-limited.** Concurrency cap is a slot limit, not a throughput limit. Jobs can burn a CPU as fast as the handler returns.

## Header comment

File retains `@author SYS (Systems Analyst Agent)` and the project-specific `JobType` union. Both are cosmetic; both worth cleaning up in a port.
