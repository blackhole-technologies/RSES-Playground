# Latest ROADMAP

The current authoritative roadmap document is:

→ [`ROADMAP_2026-04-15_v7.md`](./ROADMAP_2026-04-15_v7.md)

---

## Versioning convention

- Roadmap documents are immutable once published.
- New revisions get a new file: `ROADMAP_YYYY-MM-DD_vN.md`.
- This pointer file (`ROADMAP-LATEST.md`) is the only file that mutates — it always points to the most recent version.
- See [`STATUS-LATEST.md`](./STATUS-LATEST.md) for the companion status pointer.

## History

| Date | Version | File | Notes |
|---|---|---|---|
| 2026-04-14 (am) | v1 | [`ROADMAP_2026-04-14_v1.md`](./ROADMAP_2026-04-14_v1.md) | Initial roadmap. Milestones M0–M6 bridging current state to Master Plan vision. |
| 2026-04-14 (pm) | v2 | [`ROADMAP_2026-04-14_v2.md`](./ROADMAP_2026-04-14_v2.md) | Records M1 shipped items (M1.1, M1.2, M1.3, M1.5, M1.8). Adds M1.5 mini-milestone for the deferred items (M1.4 RLS, M1.6 CI, M1.7 coverage, route migration). M2/M3/M4/M5/M6 unchanged. |
| 2026-04-14 (eve) | v3 | [`ROADMAP_2026-04-14_v3.md`](./ROADMAP_2026-04-14_v3.md) | Anthropic SDK deferred per user instruction. Records M1.5.4 (first route migration) + M1.5.5 (marker coverage lint) + M1.6 (CI gate) shipped. Adds M1.6 (TS cleanup, 175 → 0) and M1.7 (rest of route file migrations). M2 marked ON HOLD. |
| 2026-04-14 (late eve) | v4 | [`ROADMAP_2026-04-14_v4.md`](./ROADMAP_2026-04-14_v4.md) | M1.6 TS cleanup completed — 691 → 0 errors. Typecheck CI is now a hard gate. M1.7 (route file migrations) is the next priority milestone. |
| 2026-04-14 (overnight) | v5 | [`ROADMAP_2026-04-14_v5.md`](./ROADMAP_2026-04-14_v5.md) | M1.7 shipped — 12 route files migrated to fail-closed RBAC markers. Adds M1.7-seed for the RBAC DB seed of forward-referenced keys. M1.4 (Postgres RLS) and M1.7-CI (coverage) remain as next-priority candidates. |
| 2026-04-15 (am) | v6 | [`ROADMAP_2026-04-14_v6.md`](./ROADMAP_2026-04-14_v6.md) | M1.4 Phase A/B/C shipped — transaction-scoped site var, policies migration 0003, 12-assertion RLS integration test. Phase D (FORCE RLS, migration 0004) staged but not applied — requires user staging validation. Adds M1.8 (expand tenant registry) as a new candidate milestone. |
| 2026-04-15 (eve) | v7 | [`ROADMAP_2026-04-15_v7.md`](./ROADMAP_2026-04-15_v7.md) | M1.3 marked complete — Drizzle pre-query guard (`server/lib/dev-query-guard.ts`) blocks raw `db.*` on tagged tables in dev; v8 STATUS for the full milestone record. M1.4 expanded to note v7 audit + conversion + migration 0005 staging. M1.8 rewritten with 1–3 day scope and sub-milestone split (M1.8a–e) after full `site_id` grep found ~15 unregistered multi-tenant tables across 5+ schema files. Phase D + 0005 remain staged, still blocked on user apply. Sequencing recommendation: M1.8a (api_keys) as the next natural step, under the new guard's backstop. |
