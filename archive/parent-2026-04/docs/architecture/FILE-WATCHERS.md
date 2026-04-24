# File Watcher Architecture

**Last updated:** 2026-04-14
**Owner:** Server team

> The `server/services/file-watcher*.ts` tree contains seven files. This is **not** sprawl —
> each file plays a distinct role in a three-tier layered architecture. This document maps the
> relationship so future maintainers don't try to "consolidate" files that have different
> concerns.

---

## Three tiers

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tier 3: Intelligent (experimental, Phase 10)                          │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ file-watcher-intelligent.ts        — predictive + self-healing   │ │
│ │ file-watcher-intelligent-types.ts  — WS message + API types      │ │
│ │ file-watcher-integration.ts        — bridges Tier 3 to Tier 2    │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                  │                                    │
│                                  ▼ event forwarding                   │
│ Tier 2: CMS production (Phase 9)                                      │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ file-watcher-cms.ts        — multi-dir, security, recovery       │ │
│ │ file-watcher-metrics.ts    — Prometheus metrics for Tier 2       │ │
│ │ file-watcher-daemon.ts     — standalone daemon entry point       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Tier 1: Editor project tracking (Phase 3, separate concern)           │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ file-watcher.ts            — basic chokidar wrap for the editor   │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## File-by-file responsibility

### Tier 1 — Editor project tracking

| File | Lines | Purpose |
|---|---|---|
| `file-watcher.ts` | 436 | Single-purpose chokidar wrapper used by the editor page to detect added/removed projects in a watched root. Emits `project:added`/`project:removed` over WebSocket. **No CMS coupling.** |

This file is intentionally separate from the CMS watcher because it tracks a different conceptual
unit (editor projects on disk) at a different cadence (debounced 2s) and via a different consumer
(the editor frontend, not the CMS event bus).

### Tier 2 — CMS production watcher

| File | Lines | Purpose |
|---|---|---|
| `file-watcher-cms.ts` | 1986 | Production-grade watcher for content directories. Multi-directory roots with per-directory handler types, debouncing/throttling strategies, crash recovery, security anomaly detection, watcher health monitoring. |
| `file-watcher-metrics.ts` | 456 | Prometheus metric definitions consumed by Tier 2. Counters, histograms, gauges for events, latency, queue depth. |
| `file-watcher-daemon.ts` | 414 | Standalone daemon that runs Tier 2 outside the main server process. Handles signals (SIGTERM/SIGINT/SIGHUP), exposes health and metrics endpoints, supports launchd/systemd. |

These three files are siblings, not alternatives. The daemon is the deployment target; the metrics
file is a shared resource library; the cms file is the actual logic. Splitting them keeps the
core watcher unit-testable without requiring a full Prometheus registry or daemon harness.

### Tier 3 — Intelligent (experimental)

| File | Lines | Purpose |
|---|---|---|
| `file-watcher-intelligent.ts` | 2477 | Adds predictive failure detection, self-healing reconciliation loops, distributed watching with leader election, content-aware semantic analysis. **Status: experimental.** Type-complete but the predictive layer is heuristic rather than ML (see STATUS). |
| `file-watcher-intelligent-types.ts` | 763 | WebSocket message and API types specific to the intelligent layer. Kept separate so Tier 1 and Tier 2 don't depend on Tier 3 types. |
| `file-watcher-integration.ts` | 649 | Bridges Tier 3 to Tier 2 — forwards events from the CMS watcher into the intelligent analyzer, combines health monitoring, gracefully degrades when Tier 3 features fail. |

Tier 3 is layered **on top of** Tier 2 — it does not replace it. If the intelligent layer fails or
is disabled, Tier 2 keeps running. The integration file is the only coupling point.

---

## Why this is not sprawl

A naive read of the seven files counts duplicates. A correct read sees:

- **Tier 1 vs Tier 2** are different *consumers* (editor vs CMS event bus) of *different inputs*
  (project roots vs content directories). Merging them would conflate two domains.
- **Tier 2's three siblings** (cms, metrics, daemon) are a healthy split between logic, telemetry,
  and deployment harness. Merging them would make the core file harder to test.
- **Tier 3's three files** are a clean experimental layer with its own types and a single bridge
  point. Merging them with Tier 2 would couple the production watcher to experimental code.

The right cleanup is **not** to delete files. It is to:
- Add this README so the layering is visible.
- Add a one-line header in each file pointing back here.
- Mark Tier 3 status honestly in STATUS as "experimental, heuristic-not-ML".

That's what 2026-04-14 does.

---

## When to add another file

If you find yourself wanting to add an eighth `file-watcher-*.ts`:

1. Identify which tier it belongs to. If it's a new tier, document the tier in this file first.
2. If it duplicates an existing file's responsibility, **don't** add it — extend the existing one.
3. If it is a new sibling within an existing tier (e.g., a new metrics backend), add it and update
   this README in the same PR.
4. If it crosses tiers, it probably belongs in `file-watcher-integration.ts` instead.

---

*Layering is good. Sprawl is bad. The difference is documentation.*
